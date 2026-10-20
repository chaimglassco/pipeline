import { parseUntargetedOpportunityQuery } from "../untargeted-opportunities/route";
import { loadSqp, sqpWeek } from "@/features/dashboard/data/scale-insights-sqp";
import { withScaleInsightsToolSession, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "A verified user identity is required." }, { status: 503, headers });
  let parsed;
  try { parsed = parseUntargetedOpportunityQuery(request); }
  catch { return Response.json({ error: "A valid ASIN, marketplace and reporting week are required." }, { status: 400, headers }); }
  try {
    const params = { asin: parsed.asin, country: parsed.country, ...sqpWeek(parsed.startDate) };
    const report = await withScaleInsightsToolSession({ userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() }, ({ definitions, callTool }) => loadSqp(params, definitions, callTool));
    return Response.json({ report }, { headers });
  } catch (error) {
    if (error instanceof ScaleInsightsAuthorizationRequiredError) return Response.json({ error: "Authorize Scale Insights to load SQP.", authorizationUrl: error.authorizationUrl }, { status: 409, headers });
    return Response.json({ error: error instanceof Error && error.message.startsWith("SQP") || error instanceof Error && error.message.startsWith("Search Query") ? error.message : "Scale Insights SQP data could not be loaded. Please retry." }, { status: 502, headers });
  }
}
