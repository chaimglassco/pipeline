import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import {
  getScaleInsightsPerformanceOverview,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const SUPPORTED_MARKETPLACES = new Set(["US", "CA", "MX", "UK", "DE", "FR", "IT", "ES", "NL", "JP", "SG", "AU"]);

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePerformanceOverviewQuery(request: Request) {
  const search = new URL(request.url).searchParams;
  const asins = [...new Set((search.get("asins") || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean))];
  const country = (search.get("country") || "US").trim().toUpperCase();
  const startDate = (search.get("startDate") || "").trim();
  const endDate = (search.get("endDate") || "").trim();
  if (!asins.length || asins.length > 100 || asins.some(asin => !/^[A-Z0-9]{10}$/.test(asin))) throw new TypeError("One to 100 valid ASINs are required.");
  if (!SUPPORTED_MARKETPLACES.has(country)) throw new TypeError("The selected marketplace is not supported.");
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || startDate > endDate) throw new TypeError("A valid start and end date are required.");
  const inclusiveDays = Math.round((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  if (inclusiveDays > 90) throw new TypeError("Dashboard date ranges are limited to 90 days.");
  return { asins, country, startDate, endDate };
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return errorResponse("The verified Pipeline user is missing a stable identity.", 503);

  let query: ReturnType<typeof parsePerformanceOverviewQuery>;
  try { query = parsePerformanceOverviewQuery(request); }
  catch (error) { return errorResponse(error instanceof Error ? error.message : "The dashboard request is invalid.", 400); }

  const yesterdayDate = new Date();
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  if (query.startDate > yesterday) return errorResponse("Scale Insights has no completed data in the selected range yet.", 404);
  const actualEndDate = query.endDate > yesterday ? yesterday : query.endDate;
  const actualDays = Math.round((Date.parse(`${actualEndDate}T00:00:00.000Z`) - Date.parse(`${query.startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  const previousEndDate = addDaysIso(query.startDate, -1);
  const previousStartDate = addDaysIso(previousEndDate, -(actualDays - 1));

  try {
    const overview = await getScaleInsightsPerformanceOverview({
      asins: query.asins,
      country: query.country,
      requestedStartDate: query.startDate,
      requestedEndDate: query.endDate,
      actualStartDate: query.startDate,
      actualEndDate,
      yesterday,
      sevenDayStart: addDaysIso(yesterday, -6),
      fourteenDayStart: addDaysIso(yesterday, -13),
      previousStartDate,
      previousEndDate,
    }, {
      userId: verified.user.id,
      issuer: getPipelineOrigin(),
      callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString(),
    });
    return Response.json({ overview }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) {
      return Response.json({ error: "Authorize Scale Insights to retrieve dashboard performance.", authorizationRequired: true, authorizationUrl: error.authorizationUrl }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (error instanceof ScaleInsightsConfigurationError) return errorResponse("Scale Insights is not configured for dashboard reporting.", 503);
    return errorResponse(error instanceof Error ? error.message : "Scale Insights dashboard data is temporarily unavailable.", 502);
  }
}
