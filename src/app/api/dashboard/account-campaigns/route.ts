import { createAccountCampaignSnapshot, getAccountComparisonPeriods, normalizeAccountComparisonEnd, type AccountComparisonGranularity } from "@/features/dashboard/domain/account-campaign-compare";
import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { loadScaleInsightsAccountCampaigns } from "@/features/dashboard/data/scale-insights-campaign-comparison";
import { ScaleInsightsDataError } from "@/features/dashboard/data/scale-insights-performance";
import { withScaleInsightsToolSession, ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError } from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store, max-age=0" };
const SOURCE_NAME = "Scale Insights";

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "A verified user identity is required." }, { status: 503, headers });
  const search = new URL(request.url).searchParams;
  const granularity = search.get("granularity") as AccountComparisonGranularity;
  let periods;
  try {
    if (!["day", "week", "month"].includes(granularity)) throw new Error();
    const end = normalizeAccountComparisonEnd(granularity, search.get("end") || "");
    // Scale Insights excludes today; a period ending today or later is not complete.
    if (end > addDaysIso(new Date().toISOString().slice(0, 10), -1)) throw new Error();
    periods = getAccountComparisonPeriods(granularity, end);
  } catch {
    return Response.json({ error: "Choose a completed day, week or month." }, { status: 400, headers });
  }

  try {
    const [previous, current] = await withScaleInsightsToolSession(
      { userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() },
      async ({ definitions, callTool }) => {
        const load = (period: typeof periods.current) => loadScaleInsightsAccountCampaigns({ country: "US", ...period }, definitions, callTool, (event, details) => console.warn(JSON.stringify({ route: "/api/dashboard/account-campaigns", event, ...details })));
        return [await load(periods.previous), await load(periods.current)];
      },
    );
    const importedAt = new Date().toISOString();
    const snapshot = (period: typeof periods.current, campaigns: typeof current.campaigns) => createAccountCampaignSnapshot({ country: "US", granularity, period, campaigns, fileName: SOURCE_NAME, importedAt });
    return Response.json({ previous: snapshot(periods.previous, previous.campaigns), current: snapshot(periods.current, current.campaigns), dataAsOf: current.dataAsOf }, { headers });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) return Response.json({ error: "Connect Scale Insights to pull campaign data.", authorizationUrl: error.authorizationUrl }, { status: 409, headers });
    if (error instanceof ScaleInsightsConfigurationError) return Response.json({ error: "Scale Insights is not configured on this server." }, { status: 503, headers });
    if (error instanceof ScaleInsightsDataError) return Response.json({ error: error.message }, { status: 502, headers });
    const message = error instanceof Error ? error.message : "";
    if (/limit|quota|rate/i.test(message)) return Response.json({ error: `Scale Insights request limit reached. ${message}` }, { status: 429, headers });
    return Response.json({ error: "Scale Insights campaign data could not be loaded. Please retry, or upload CSVs instead." }, { status: 502, headers });
  }
}
