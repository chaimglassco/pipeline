import { parseCampaignComparisonQuery } from "../campaign-comparison/route";
import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { getScaleInsightsCampaignContribution, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store, max-age=0" };
export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "A verified user identity is required." }, { status: 503, headers });
  let selected;
  try { selected = parseCampaignComparisonQuery(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid reporting week." }, { status: 400, headers }); }
  const cutoff = addDaysIso(new Date().toISOString().slice(0, 10), -1);
  if (selected.startDate > cutoff) return Response.json({ error: "This week has no completed days yet." }, { status: 404, headers });
  const end = selected.endDate < cutoff ? selected.endDate : cutoff;
  const days = Math.round((Date.parse(end) - Date.parse(selected.startDate)) / 86400000);
  const previousStartDate = addDaysIso(selected.startDate, -7);
  try {
    const analysis = await getScaleInsightsCampaignContribution({ asin: selected.asin, country: selected.country, currentStartDate: selected.startDate, currentEndDate: end, previousStartDate, previousEndDate: addDaysIso(previousStartDate, days), dataState: end < selected.endDate ? "Partial" : "Final" }, { userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() }, crypto.randomUUID());
    return Response.json({ analysis }, { headers });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) return Response.json({ error: "Authorize Scale Insights to load campaign contributions.", authorizationUrl: error.authorizationUrl }, { status: 409, headers });
    return Response.json({ error: "Campaign contribution analysis is temporarily unavailable. Please retry." }, { status: 502, headers });
  }
}
