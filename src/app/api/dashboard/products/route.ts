import { getPipelineOrigin, verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { normalizeDashboardProducts } from "@/features/dashboard/domain/pipeline-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_REQUEST_TIMEOUT_MS = 30_000;
const MAX_WORKSPACE_CHUNKS = 256;

class PipelineWorkspaceError extends Error {
  constructor(readonly status: number) {
    super(`Pipeline workspace request failed with status ${status}.`);
  }
}

type WorkspaceManifest = {
  state?: unknown;
  updatedAt?: unknown;
  workspaceStateBinaryChunked?: unknown;
  workspaceStateChunkCount?: unknown;
};

async function readPipelineWorkspace(authorization: string): Promise<unknown> {
  const origin = getPipelineOrigin();
  const requestOptions: RequestInit = {
    headers: { Authorization: authorization },
    cache: "no-store",
    signal: AbortSignal.timeout(WORKSPACE_REQUEST_TIMEOUT_MS),
  };
  const response = await fetch(`${origin}/api/workspace-state?transport=binary-v2`, requestOptions);
  const value: unknown = await response.json();
  if (!response.ok) throw new PipelineWorkspaceError(response.status);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PipelineWorkspaceError(503);

  const manifest = value as WorkspaceManifest;
  if (manifest.state !== null && manifest.state !== undefined) return value;

  const chunkCount = Number(manifest.workspaceStateChunkCount);
  if (
    manifest.workspaceStateBinaryChunked !== true
    || !Number.isSafeInteger(chunkCount)
    || chunkCount < 1
    || chunkCount > MAX_WORKSPACE_CHUNKS
    || typeof manifest.updatedAt !== "string"
    || !manifest.updatedAt
  ) {
    throw new PipelineWorkspaceError(503);
  }

  const version = encodeURIComponent(manifest.updatedAt);
  const chunks = await Promise.all(Array.from({ length: chunkCount }, async (_, index) => {
    const chunkResponse = await fetch(
      `${origin}/api/workspace-state?transport=binary-v2&chunk=${index}&version=${version}`,
      requestOptions,
    );
    if (!chunkResponse.ok) throw new PipelineWorkspaceError(chunkResponse.status);
    return chunkResponse.text();
  }));

  try {
    return { ...manifest, state: JSON.parse(chunks.join("")) as unknown };
  } catch {
    throw new PipelineWorkspaceError(503);
  }
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  const authorization = request.headers.get("authorization") || "";
  try {
    const value = await readPipelineWorkspace(authorization);
    return Response.json({ products: normalizeDashboardProducts(value) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof PipelineWorkspaceError && error.status === 401) {
      return Response.json({ error: "Your Pipeline session has expired." }, { status: 401 });
    }
    return Response.json({ error: "Pipeline products are temporarily unavailable." }, { status: 503 });
  }
}
