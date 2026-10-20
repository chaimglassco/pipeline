import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { ScaleInsightsOpportunityProviderError, type UntargetedOpportunityParams } from "@/features/dashboard/data/scale-insights-untargeted-opportunities";
import {
  getScaleInsightsUntargetedSalesOpportunities,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SUPPORTED_MARKETPLACES = new Set(["US", "CA", "MX", "UK", "DE", "FR", "IT", "ES", "NL", "JP", "SG", "AU"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function responseError(error: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status, headers: NO_STORE_HEADERS });
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseUntargetedOpportunityQuery(request: Request) {
  const search = new URL(request.url).searchParams;
  const asin = (search.get("asin") || "").trim().toUpperCase();
  const country = (search.get("country") || "US").trim().toUpperCase();
  const startDate = (search.get("weekStart") || "").trim();
  const weeks = search.get("weeks");
  if (weeks != null && weeks !== "1" && weeks !== "12") throw new TypeError("Weeks must be 1 or 12.");
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new TypeError("A valid 10-character ASIN is required.");
  if (!SUPPORTED_MARKETPLACES.has(country)) throw new TypeError("The selected marketplace is not supported.");
  if (!isIsoDate(startDate)) throw new TypeError("A valid reporting week start is required.");
  if (new Date(`${startDate}T00:00:00.000Z`).getUTCDay() !== 3) throw new TypeError("Reporting weeks must start on Wednesday.");
  return { asin, country, startDate, endDate: addDaysIso(startDate, 6) };
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return responseError("The verified Pipeline user is missing a stable identity.", 503);

  let parsed: ReturnType<typeof parseUntargetedOpportunityQuery>;
  try {
    parsed = parseUntargetedOpportunityQuery(request);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "The opportunity request is invalid.", 400);
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const cutoff = yesterday.toISOString().slice(0, 10);
  if (parsed.startDate > cutoff) return responseError("This reporting week has no completed days yet.", 404);
  const params: UntargetedOpportunityParams = {
    ...parsed,
    endDate: parsed.endDate > cutoff ? cutoff : parsed.endDate,
    dataState: parsed.endDate > cutoff ? "Partial" : "Final",
  };
  const query = new URL(request.url).searchParams;
  if (query.get("weeks") === "12") {
    params.startDate = addDaysIso(parsed.startDate, -77);
    params.includeHistory = true;
    params.verifyCoverage = true;
  } else if (query.get("history") === "1") params.includeHistory = true;
  const requestId = crypto.randomUUID();

  try {
    const opportunities = await getScaleInsightsUntargetedSalesOpportunities(params, {
      userId: verified.user.id,
      issuer: getPipelineOrigin(),
      callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString(),
    }, { requestId });
    if (params.dataState === "Partial") opportunities.warnings.push(`Partial week: opportunity metrics cover ${params.startDate} through ${params.endDate}.`);
    return Response.json({ opportunities }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) {
      return Response.json({
        error: "Authorize Scale Insights to retrieve untargeted sales opportunities.",
        authorizationRequired: true,
        authorizationUrl: error.authorizationUrl,
      }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (error instanceof ScaleInsightsConfigurationError) return responseError("Scale Insights is not configured for opportunity reporting.", 503);
    if (error instanceof ScaleInsightsOpportunityProviderError) return responseError(error.message, error.providerCode === "opportunity_rate_limited" ? 429 : 502, { code: error.providerCode, requestId });
    return responseError("Scale Insights opportunity data is temporarily unavailable.", 502, { requestId });
  }
}
