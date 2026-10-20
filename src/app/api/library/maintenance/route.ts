import { timingSafeEqual } from "node:crypto";
import { head, put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };
const pipelineOrigin = (process.env.PIPELINE_AUTH_ORIGIN || "https://glasscopipeline.vercel.app").replace(/\/$/, "");

function matchesSecret(supplied: string, expected: string | undefined) {
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(supplied);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function authorized(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || request.headers.get("x-library-backup-secret")
    || "";
  return matchesSecret(supplied, process.env.LIBRARY_BACKUP_SECRET)
    || matchesSecret(supplied, process.env.CRON_SECRET);
}

function snapshotPath(date: Date, revision: number, checksum: string) {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "/");
  return `glassco/library-snapshots-v2/${day}/revision-${revision}-${checksum}.json`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized Library maintenance request." }, { status: 401, headers: noStoreHeaders });
  }
  const secret = process.env.LIBRARY_BACKUP_SECRET;
  if (!secret) {
    return Response.json({ error: "Library backup service is not configured." }, { status: 503, headers: noStoreHeaders });
  }
  const upstream = await fetch(`${pipelineOrigin}/api/library-state?maintenance=1`, {
    cache: "no-store",
    headers: { "X-Library-Backup-Secret": secret },
  });
  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok || !payload || typeof payload !== "object") {
    const details = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return Response.json({
      error: typeof details.error === "string" ? details.error : "Pipeline Library maintenance failed.",
    }, { status: upstream.status || 502, headers: noStoreHeaders });
  }
  const result = payload as Record<string, unknown>;
  const backup = result.backup && typeof result.backup === "object" ? result.backup as Record<string, unknown> : null;
  const revision = Number(result.revision);
  const checksum = typeof backup?.checksum === "string" ? backup.checksum : "";
  if (!Number.isSafeInteger(revision) || revision < 0 || !checksum || !result.state) {
    return Response.json({ error: "Pipeline Library maintenance returned incomplete snapshot data." }, { status: 502, headers: noStoreHeaders });
  }
  const pathname = snapshotPath(new Date(), revision, checksum);
  let blobUrl = "";
  let deduplicated = false;
  try {
    const existing = await head(pathname);
    blobUrl = existing.url;
    deduplicated = true;
  } catch {
    const blob = await put(pathname, JSON.stringify({
      format: "glassco-library-snapshot-v2",
      createdAt: new Date().toISOString(),
      revision,
      checksum,
      pipelineBackup: backup,
      repair: result.repair,
      state: result.state,
    }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
    blobUrl = blob.url;
  }
  return Response.json({
    ok: true,
    revision,
    checksum,
    pathname,
    blobUrl,
    deduplicated,
    repair: result.repair,
  }, { headers: noStoreHeaders });
}
