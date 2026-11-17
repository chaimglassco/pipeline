import { addDaysIso } from "@/features/dashboard/domain/ppc-dashboard-state";
import { loadAsinSearchTerms, ScaleInsightsOpportunityProviderError } from "@/features/dashboard/data/scale-insights-untargeted-opportunities";
import { withScaleInsightsToolSession, ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError } from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store, max-age=0" };
const DISCOVERY_DAYS = 30;

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "A verified user identity is required." }, { status: 503, headers });
  const search = new URL(request.url).searchParams;
  const asin = (search.get("asin") || "").trim().toUpperCase();
  const country = (search.get("country") || "US").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin) || country !== "US") return Response.json({ error: "A valid 10-character ASIN and the US marketplace are required." }, { status: 400, headers });

  // Scale Insights excludes today, so the window ends yesterday.
  const endDate = addDaysIso(new Date().toISOString().slice(0, 10), -1);
  const params = { asin, country, startDate: addDaysIso(endDate, -(DISCOVERY_DAYS - 1)), endDate, dataState: "Final" as const };
  try {
    const result = await withScaleInsightsToolSession(
      { userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() },
      ({ definitions, callTool }) => loadAsinSearchTerms(params, definitions, callTool),
    );
    return Response.json({ asin, startDate: params.startDate, endDate, ...result }, { headers });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) return Response.json({ error: "Authorize Scale Insights to run Product Discovery.", authorizationUrl: error.authorizationUrl }, { status: 409, headers });
    if (error instanceof ScaleInsightsConfigurationError) return Response.json({ error: "Scale Insights is not configured on this server." }, { status: 503, headers });
    if (error instanceof ScaleInsightsOpportunityProviderError) return Response.json({ error: error.message }, { status: error.providerCode === "opportunity_rate_limited" ? 429 : 502, headers });
    return Response.json({ error: "Scale Insights search terms could not be loaded. Please retry." }, { status: 502, headers });
  }
}
