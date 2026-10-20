import { verifyPipelineRequest, getPipelineOrigin } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { withScaleInsightsClient, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { loadScaleInsightsProductImage } from "@/features/dashboard/data/scale-insights-product-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "Sign in through Product Pipeline to continue." }, { status: 401, headers });
  const asin = (new URL(request.url).searchParams.get("asin") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "Enter a valid 10-character ASIN." }, { status: 400, headers });
  try {
    const image = await withScaleInsightsClient({ userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() }, callTool => loadScaleInsightsProductImage(asin, callTool));
    return Response.json(image, { headers });
  } catch (error) {
    const message = error instanceof ScaleInsightsAuthorizationRequiredError
      ? "Connect Scale Insights from the dashboard to retrieve listing images, or upload one manually."
      : "Could not retrieve a listing image for this ASIN. You can upload one manually.";
    return Response.json({ error: message }, { status: 502, headers });
  }
}
