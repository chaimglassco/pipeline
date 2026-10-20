import { ensureLegacyLibraryBackup, LegacyLibraryBackupError, prepareLegacyCatalogImport, readLegacyLibrarySnapshot } from "@/features/library/data/legacy-library-backup";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };
const pipelineOrigin = (process.env.PIPELINE_AUTH_ORIGIN || "https://glasscopipeline.vercel.app").replace(/\/$/, "");

function migrationError(error: unknown) {
  if (error instanceof LegacyLibraryBackupError) {
    const status = error.code === "LEGACY_SNAPSHOT_MISSING" ? 404 : 503;
    return Response.json({ error: error.message, code: error.code }, { status, headers: noStoreHeaders });
  }
  return Response.json({ error: "Unable to access the legacy Library snapshot." }, { status: 503, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request, true);
  if (verified instanceof Response) return verified;
  try {
    const snapshot = await readLegacyLibrarySnapshot();
    return new Response(snapshot.body, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="library-state-v1-${snapshot.checksum.slice(0, 12)}.json"`,
        "Digest": `sha-256=${Buffer.from(snapshot.checksum, "hex").toString("base64")}`,
      },
    });
  } catch (error) {
    return migrationError(error);
  }
}

export async function POST(request: Request) {
  const verified = await verifyPipelineRequest(request, true);
  if (verified instanceof Response) return verified;
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const action = typeof body.action === "string" ? body.action : "create-backup";
    if (action === "create-backup") {
      const backup = await ensureLegacyLibraryBackup();
      return Response.json({ backup }, { status: backup.created ? 201 : 200, headers: noStoreHeaders });
    }
    if (!["initialize-catalog", "initialize-clean-catalog"].includes(action)) {
      return Response.json({ error: "Unknown Library migration action." }, { status: 400, headers: noStoreHeaders });
    }

    const snapshot = await readLegacyLibrarySnapshot();
    const backup = await ensureLegacyLibraryBackup(snapshot);
    const candidate = prepareLegacyCatalogImport(snapshot.state);
    const authorization = request.headers.get("authorization");
    const upstream = await fetch(new URL("/api/library-state", pipelineOrigin), {
      method: "PATCH",
      headers: { Authorization: authorization ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "catalog.initialize", state: candidate.state, expectedRevision: 0 }),
      cache: "no-store",
    });
    const upstreamBody: unknown = await upstream.json().catch(() => ({ error: "Pipeline returned an invalid migration response." }));
    const payload = upstreamBody && typeof upstreamBody === "object" ? upstreamBody as Record<string, unknown> : { error: "Pipeline returned an invalid migration response." };
    return Response.json({
      ...payload,
      migration: {
        legacyBackup: backup,
        mode: "complete-catalog-import",
        ...candidate.report,
      },
    }, { status: upstream.status, headers: noStoreHeaders });
  } catch (error) {
    return migrationError(error);
  }
}
