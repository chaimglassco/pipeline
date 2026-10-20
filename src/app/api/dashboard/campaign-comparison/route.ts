import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { ScaleInsightsDataError, type ScaleInsightsWeeklyPerformanceParams } from "@/features/dashboard/data/scale-insights-performance";
import { ScaleInsightsCampaignProviderError } from "@/features/dashboard/data/scale-insights-campaign-comparison";
import {
  getScaleInsightsCampaignSpendBaseline,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MARKETPLACES = new Set(["US", "CA", "MX", "UK", "DE", "FR", "IT", "ES", "NL", "JP", "SG", "AU"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function errorResponse(error: string, status: number, details?: { code: string; requestId: string }) {
  return Response.json({ error, ...details }, { status, headers: NO_STORE_HEADERS });
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseCampaignComparisonQuery(request: Request): ScaleInsightsWeeklyPerformanceParams {
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

function inclusiveDayCount(startDate: string, endDate: string) {
  return Math.round((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return errorResponse("The verified Pipeline user is missing a stable identity.", 503);

  let selectedWeek: ScaleInsightsWeeklyPerformanceParams;
  try {
    selectedWeek = parseCampaignComparisonQuery(request);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "The campaign comparison request is invalid.", 400);
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dataCutoff = yesterday.toISOString().slice(0, 10);
  if (selectedWeek.startDate > dataCutoff) {
    return errorResponse("This reporting week has no completed days yet. Select a previous week or refresh tomorrow.", 404);
  }
  const currentEndDate = selectedWeek.endDate > dataCutoff ? dataCutoff : selectedWeek.endDate;
  const comparedDays = inclusiveDayCount(selectedWeek.startDate, currentEndDate);
  const previousStartDate = addDaysIso(selectedWeek.startDate, -7);
  const previousEndDate = addDaysIso(previousStartDate, comparedDays - 1);
  const dataState = currentEndDate < selectedWeek.endDate ? "Partial" as const : "Final" as const;

  try {
    const comparison = await getScaleInsightsCampaignSpendBaseline({
      asin: selectedWeek.asin,
      country: selectedWeek.country,
      previousStartDate,
      previousEndDate,
      currentStartDate: selectedWeek.startDate,
      currentEndDate,
      dataState,
    }, {
      userId: verified.user.id,
      issuer: getPipelineOrigin(),
      callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString(),
    }, { requestId });
    if (dataState === "Partial") {
      comparison.warnings = [
        ...comparison.warnings,
        `Matched partial comparison: ${selectedWeek.startDate} through ${currentEndDate} is compared with ${previousStartDate} through ${previousEndDate}. Today and future days are excluded.`,
      ];
    }
    return Response.json({ comparison }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) {
      return Response.json({
        error: "Authorize Scale Insights to retrieve campaign comparison data.",
        authorizationRequired: true,
        authorizationUrl: error.authorizationUrl,
      }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (error instanceof ScaleInsightsConfigurationError) return errorResponse("Scale Insights is not configured for campaign comparison on this server.", 503);
    if (error instanceof ScaleInsightsCampaignProviderError) {
      return errorResponse(error.message, 502, { code: error.campaignCode, requestId });
    }
    if (error instanceof ScaleInsightsDataError) return errorResponse(error.message, error.code === "no_data" ? 404 : 502);
    return errorResponse("Scale Insights campaign comparison is temporarily unavailable.", 502);
  }
}
