import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  return Response.json(verified, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
