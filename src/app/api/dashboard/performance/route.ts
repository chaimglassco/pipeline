import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { ScaleInsightsDataError, type ScaleInsightsWeeklyPerformanceParams } from "@/features/dashboard/data/scale-insights-performance";
import {
  getScaleInsightsWeeklyPerformance,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MARKETPLACES = new Set(["US", "CA", "MX", "UK", "DE", "FR", "IT", "ES", "NL", "JP", "SG", "AU"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePerformanceQuery(request: Request): ScaleInsightsWeeklyPerformanceParams {
  const search = new URL(request.url).searchParams;
  const asin = (search.get("asin") || "").trim().toUpperCase();
  const country = (search.get("country") || "US").trim().toUpperCase();
  const startDate = (search.get("weekStart") || "").trim();

  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new TypeError("A valid 10-character ASIN is required.");
  if (!SUPPORTED_MARKETPLACES.has(country)) throw new TypeError("The selected marketplace is not supported.");
  if (!isIsoDate(startDate)) throw new TypeError("A valid reporting week start is required.");
  if (new Date(`${startDate}T00:00:00.000Z`).getUTCDay() !== 3) throw new TypeError("Reporting weeks must start on Wednesday.");

  return { asin, country, startDate, endDate: addDaysIso(startDate, 6) };
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return errorResponse("The verified Pipeline user is missing a stable identity.", 503);

  let params: ScaleInsightsWeeklyPerformanceParams;
  try {
    params = parsePerformanceQuery(request);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The performance request is invalid.", 400);
  }

  // Scale Insights excludes today; never request unfinished or future days.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dataCutoff = yesterday.toISOString().slice(0, 10);
  const reportingWeekEnd = params.endDate;
  if (params.startDate > dataCutoff) {
    return errorResponse("This reporting week has no completed days yet. Scale Insights excludes today; select a previous week or refresh tomorrow.", 404);
  }
  if (params.endDate > dataCutoff) params = { ...params, endDate: dataCutoff };

  try {
    const performance = await getScaleInsightsWeeklyPerformance(params, {
      userId: verified.user.id,
      issuer: getPipelineOrigin(),
      callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString(),
    });
    if (params.endDate < reportingWeekEnd) {
      performance.warnings = [
        ...performance.warnings,
        `Partial week: actual metrics cover ${params.startDate} through ${params.endDate}. Today and future days are excluded.`,
      ];
    }
    return Response.json({ performance }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) {
      return Response.json({
        error: "Authorize Scale Insights to retrieve weekly performance.",
        authorizationRequired: true,
        authorizationUrl: error.authorizationUrl,
      }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (error instanceof ScaleInsightsConfigurationError) return errorResponse("Scale Insights is not configured on this server.", 503);
    if (error instanceof ScaleInsightsDataError) {
      return errorResponse(error.message, error.code === "no_data" ? 404 : 502);
    }
    return errorResponse("Scale Insights performance data is temporarily unavailable.", 502);
  }
}
