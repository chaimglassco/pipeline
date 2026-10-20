import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { DashboardConflict, readDashboardDocument, saveDashboardDocument } from "@/features/dashboard/data/shared-dashboard-store";
import { isDashboardStoreKey, MAX_SHARED_DASHBOARD_BYTES, validateDashboardValue } from "@/features/dashboard/domain/shared-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return new Response(verified.body, { status: verified.status, headers: { ...headers, "Content-Type": "application/json" } });
  const key = new URL(request.url).searchParams.get("key");
  if (!isDashboardStoreKey(key)) return json({ error: "Unknown dashboard dataset." }, 400);
  try { return json({ ...await readDashboardDocument(key), canEdit: verified.user.role !== "VIEWER" }); }
  catch { return json({ error: "Shared dashboard storage is unavailable. Existing data has not been changed." }, 503); }
}

export async function PUT(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return new Response(verified.body, { status: verified.status, headers: { ...headers, "Content-Type": "application/json" } });
  if (verified.user.role !== "ADMIN" && verified.user.role !== "USER") return json({ error: "Your account has read-only dashboard access." }, 403);
  const key = new URL(request.url).searchParams.get("key");
  if (!isDashboardStoreKey(key)) return json({ error: "Unknown dashboard dataset." }, 400);
  let input: { value: string; expectedEtag: string | null; operationId: string };
  try {
    // Enforce the bound while streaming, before allocating a potentially oversized JSON body.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing dashboard data." }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > MAX_SHARED_DASHBOARD_BYTES + 300_000) { await reader.cancel(); return json({ error: "The shared dataset is too large. The local copy has been kept." }, 413); }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body.value !== "string" || !(body.expectedEtag === null || (typeof body.expectedEtag === "string" && body.expectedEtag.length <= 200)) || typeof body.operationId !== "string" || !/^[a-zA-Z0-9-]{10,100}$/.test(body.operationId)) throw new Error("Invalid dashboard save request.");
    input = { value: validateDashboardValue(key, body.value), expectedEtag: body.expectedEtag, operationId: body.operationId };
  } catch { return json({ error: "Invalid or unsupported dashboard data. The original copy has been kept." }, 400); }
  try {
    const result = await saveDashboardDocument({ version: 1, key, value: input.value, operationId: input.operationId, actor: verified.user.id ?? verified.user.email, savedAt: new Date().toISOString() }, input.expectedEtag);
    return json({ ...result, canEdit: true });
  } catch (error) {
    if (error instanceof DashboardConflict) console.warn("[dashboard/state] save conflict", { key, reason: error.reason, operationId: input.operationId });
    return json({ error: error instanceof DashboardConflict ? error.message : "The dashboard could not save online. Keep this tab open and retry." }, error instanceof DashboardConflict ? 409 : 503);
  }
}
