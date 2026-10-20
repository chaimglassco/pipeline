import { BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mergeDashboardValues, parseDashboardDocument, type DashboardDocument, type DashboardStoreKey } from "../domain/shared-dashboard";
import { PPC_DASHBOARD_STORAGE_KEY, parsePpcDashboardStore } from "../domain/ppc-dashboard-state";

const pathFor = (key: DashboardStoreKey) => `glassco/ppc-team/v1/${key}.json`;
export class DashboardConflict extends Error {
  constructor(message: string, readonly reason: "stale_etag" | "write_precondition") { super(message); }
}
function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) throw new Error("Shared dashboard storage is not configured.");
}
export async function readDashboardDocument(key: DashboardStoreKey) {
  requireStorage();
  const result = await get(pathFor(key), { access: "private", useCache: false });
  if (!result) return { document: null, etag: null };
  if (result.statusCode !== 200) throw new Error("Could not read current dashboard data.");
  const document = parseDashboardDocument(await new Response(result.stream).json(), key);
  // Private content GET can expose a representation ETag that differs from the
  // Blob API's canonical ETag used by put(ifMatch). Read that tag from metadata.
  const metadata = await head(pathFor(key));
  if (!metadata.etag) throw new Error("Could not verify the current dashboard version.");
  return { document, etag: metadata.etag };
}

export async function saveDashboardDocument(document: DashboardDocument, expectedEtag: string | null) {
  requireStorage();
  const current = await readDashboardDocument(document.key);
  // A response can be lost after a successful write. Retrying the same operation is safe.
  if (current.document?.operationId === document.operationId && current.document.value === document.value) return current;
  // Another session may have already written the exact desired value.
  if (current.document?.value === document.value) return current;
  if (current.etag !== expectedEtag) throw new DashboardConflict("Someone else updated this dataset while it was saving.", "stale_etag");
  if (document.key === PPC_DASHBOARD_STORAGE_KEY && current.document
    && Object.values(parsePpcDashboardStore(current.document.value).reports).some(report => report.deletedGoalIds?.length)
    && mergeDashboardValues(document.key, current.document.value, document.value, current.document.value) !== document.value) {
    throw new DashboardConflict("This save would restore deleted goals. Refreshing deletion records before retrying.", "stale_etag");
  }
  if (current.document) {
    await put(`glassco/ppc-team-history/v1/${document.key}/${randomUUID()}.json`, JSON.stringify(current.document), {
      access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json",
    });
  }
  try {
    const result = await put(pathFor(document.key), JSON.stringify(document), {
      access: "private", addRandomSuffix: false, allowOverwrite: expectedEtag !== null,
      ...(expectedEtag ? { ifMatch: expectedEtag } : {}), contentType: "application/json", cacheControlMaxAge: 60,
    });
    return { document, etag: result.etag };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      const metadata = await head(pathFor(document.key)).catch(() => null);
      console.warn("[dashboard/state] Blob precondition detail", {
        key: document.key,
        expectedMatchesRead: expectedEtag === current.etag,
        metadataMatchesRead: metadata?.etag === current.etag,
        metadataMatchesExpected: metadata?.etag === expectedEtag,
        readEtagMissing: !current.etag,
        metadataEtagMissing: !metadata?.etag,
      });
      throw new DashboardConflict("Someone else updated this dataset while it was saving.", "write_precondition");
    }
    // Create-only races also remain conflicts; never retry by overwriting.
    if (expectedEtag === null && (await readDashboardDocument(document.key)).document) throw new DashboardConflict("Shared data was created in another session while it was saving.", "write_precondition");
    throw error;
  }
}
