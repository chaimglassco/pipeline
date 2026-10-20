import type { ManagedLibraryDocument } from "@/features/library/state/admin-storage";
import { readLegacyLibrarySnapshot } from "@/features/library/data/legacy-library-backup";
import { get, list } from "@vercel/blob";
import {
  parseSharedLibraryResponse,
  parseSharedLibraryState,
  type SharedLibraryDocumentStatus,
} from "@/features/library/state/shared-library-state";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };
const pipelineOrigin = (process.env.PIPELINE_AUTH_ORIGIN || "https://glasscopipeline.vercel.app").replace(/\/$/, "");
const BQOOL_TITLE = "Monitor Product Listing Prices Through BQool";
const CHECK_SPEND_TITLE = "Check Spend with No Sales";
const PROTECTED_RECOVERY_TITLES = [BQOOL_TITLE, CHECK_SPEND_TITLE] as const;
const LEGACY_BACKUP_DIRECTORY = "glassco/library-backups";
const PROTECTED_SNAPSHOT_DIRECTORY = "glassco/library-snapshots-v2";
const MAX_BACKUPS_TO_SCAN = 100;

type BackupSummary = {
  id: string;
  createdAt: string;
};

type SnapshotSource = {
  kind: "pipeline_backup" | "legacy_snapshot";
  id: string;
  label: string;
  createdAt?: string;
};

type InternalPurgedCandidate = {
  document: ManagedLibraryDocument;
  documentId: string;
  slug: string;
  title: string;
  deletedAt?: string;
  source: SnapshotSource;
  canRestore: boolean;
};

export type PurgedDocumentCandidate = Omit<InternalPurgedCandidate, "document">;

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isProtectedRecoveryDocument(document: ManagedLibraryDocument) {
  return PROTECTED_RECOVERY_TITLES.some(title => normalizeTitle(document.title) === normalizeTitle(title));
}

function isMissingDocumentStatus(status?: SharedLibraryDocumentStatus) {
  return status?.status === "purged" || status?.status === "not_found";
}

function authorizationHeader(request: Request) {
  return request.headers.get("authorization") || "";
}

async function upstream(path: string, authorization: string, init: RequestInit = {}) {
  return fetch(new URL(path, pipelineOrigin), {
    ...init,
    headers: {
      Authorization: authorization,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
}

async function readUpstreamJson(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  if (response.ok) return value;
  const details = value && typeof value === "object" ? value as Record<string, unknown> : {};
  throw new Error(typeof details.error === "string" ? details.error : `Library request failed (HTTP ${response.status}).`);
}

async function getDocumentStatus(document: ManagedLibraryDocument, authorization: string) {
  const response = await upstream(`/api/library-state?summary=1&slug=${encodeURIComponent(document.slug)}`, authorization);
  const parsed = parseSharedLibraryResponse(await readUpstreamJson(response));
  return parsed?.documentStatus;
}

async function listBackups(authorization: string): Promise<BackupSummary[]> {
  const response = await upstream("/api/library-state?backups=1", authorization);
  const value = await readUpstreamJson(response);
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).backups)) return [];
  return ((value as Record<string, unknown>).backups as unknown[])
    .flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) return [];
      return [{ id: record.id, createdAt: record.createdAt }];
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_BACKUPS_TO_SCAN);
}

async function readBackupState(backupId: string, authorization: string) {
  const response = await upstream(`/api/library-state?backupId=${encodeURIComponent(backupId)}`, authorization);
  const value = await readUpstreamJson(response);
  if (!value || typeof value !== "object") return null;
  return parseSharedLibraryState((value as Record<string, unknown>).state);
}

async function findNewestBackupDocument(
  target: ManagedLibraryDocument,
  deletedAt: string | undefined,
  backups: BackupSummary[],
  authorization: string,
) {
  const cutoff = deletedAt && Number.isFinite(Date.parse(deletedAt)) ? Date.parse(deletedAt) : Number.POSITIVE_INFINITY;
  for (const backup of backups.filter(item => Date.parse(item.createdAt) <= cutoff)) {
    const state = await readBackupState(backup.id, authorization).catch(() => null);
    const document = state?.documents.find(item => item.id === target.id || item.slug === target.slug);
    if (document) {
      return {
        document,
        source: {
          kind: "pipeline_backup",
          id: backup.id,
          label: "Pipeline Library backup",
          createdAt: backup.createdAt,
        } satisfies SnapshotSource,
      };
    }
  }
  return null;
}

async function mapWithConcurrency<T, R>(values: T[], limit: number, task: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await task(values[index]);
    }
  }));
  return results;
}

async function readBlobArchiveStates(directory: string, label: string) {
  const result = await list({ prefix: `${directory}/`, limit: 1000 });
  const blobs = [...result.blobs].sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime());
  const snapshots = await mapWithConcurrency(blobs, 4, async blob => {
    try {
      const stored = await get(blob.pathname, { access: "private", useCache: false });
      if (!stored || stored.statusCode !== 200) return null;
      const payload: unknown = JSON.parse(await new Response(stored.stream).text());
      const state = parseSharedLibraryState(
        payload && typeof payload === "object" && "state" in payload
          ? (payload as { state: unknown }).state
          : payload,
      );
      if (!state) return null;
      return {
        state,
        source: {
          kind: "legacy_snapshot",
          id: blob.etag || blob.pathname,
          label,
          createdAt: blob.uploadedAt.toISOString(),
        } satisfies SnapshotSource,
      };
    } catch {
      return null;
    }
  });
  return snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
}

async function readProtectedArchiveStates() {
  const archives = await Promise.all([
    readBlobArchiveStates(LEGACY_BACKUP_DIRECTORY, "Protected legacy Library archive").catch(() => []),
    readBlobArchiveStates(PROTECTED_SNAPSHOT_DIRECTORY, "Protected Library snapshot").catch(() => []),
  ]);
  return archives.flat().sort((left, right) =>
    Date.parse(right.source.createdAt || "1970-01-01") - Date.parse(left.source.createdAt || "1970-01-01"),
  );
}

async function discoverPurgedDocuments(authorization: string): Promise<InternalPurgedCandidate[]> {
  const [legacyResult, backups] = await Promise.all([
    readLegacyLibrarySnapshot().catch(() => null),
    listBackups(authorization).catch(() => []),
  ]);
  const snapshotDocuments = legacyResult?.state.documents ?? [];
  const uniqueDocuments = Array.from(new Map(snapshotDocuments.map(document => [document.slug, document])).values());
  const statuses = await mapWithConcurrency(uniqueDocuments, 4, async document => ({
    document,
    status: await getDocumentStatus(document, authorization).catch(() => undefined),
  }));
  const purged: Array<{ document: ManagedLibraryDocument; status: SharedLibraryDocumentStatus; source?: SnapshotSource }> = statuses.filter((entry): entry is { document: ManagedLibraryDocument; status: SharedLibraryDocumentStatus } =>
    entry.status?.status === "purged" || (isProtectedRecoveryDocument(entry.document) && entry.status?.status === "not_found"),
  );

  const missingProtectedTitles = () => PROTECTED_RECOVERY_TITLES.filter(title =>
    !purged.some(entry => normalizeTitle(entry.document.title) === normalizeTitle(title)),
  );
  for (const backup of backups) {
    const titles = missingProtectedTitles();
    if (!titles.length) break;
    const state = await readBackupState(backup.id, authorization).catch(() => null);
    if (!state) continue;
    for (const title of titles) {
      const document = state.documents.find(item => normalizeTitle(item.title) === normalizeTitle(title));
      if (!document) continue;
      const status = await getDocumentStatus(document, authorization).catch(() => undefined);
      if (isMissingDocumentStatus(status)) {
        purged.push({
          document,
          status: status!,
          source: {
            kind: "pipeline_backup",
            id: backup.id,
            label: "Pipeline Library backup",
            createdAt: backup.createdAt,
          },
        });
      }
    }
  }

  if (missingProtectedTitles().length) {
    const archives = await readProtectedArchiveStates().catch(() => []);
    for (const archive of archives) {
      const titles = missingProtectedTitles();
      if (!titles.length) break;
      for (const title of titles) {
        const document = archive.state.documents.find(item => normalizeTitle(item.title) === normalizeTitle(title));
        if (!document) continue;
        const status = await getDocumentStatus(document, authorization).catch(() => undefined);
        if (isMissingDocumentStatus(status)) {
          purged.push({ document, status: status!, source: archive.source });
        }
      }
    }
  }

  const candidates = await Promise.all(purged.map(async ({ document, status, source }) => {
    const newerBackup = isProtectedRecoveryDocument(document)
      ? await findNewestBackupDocument(document, status.deletedAt, backups, authorization)
      : null;
    return {
      document: newerBackup?.document ?? document,
      documentId: status.documentId || document.id,
      slug: document.slug,
      title: status.title || document.title,
      deletedAt: status.deletedAt,
      source: newerBackup?.source ?? source ?? {
        kind: "legacy_snapshot",
        id: legacyResult?.checksum || "legacy-library-snapshot",
        label: "Protected legacy Library snapshot",
      },
      canRestore: false as boolean,
    } satisfies InternalPurgedCandidate;
  }));

  for (const title of PROTECTED_RECOVERY_TITLES) {
    const candidate = candidates
      .filter(item => normalizeTitle(item.document.title) === normalizeTitle(title))
      .sort((left, right) => Date.parse(right.deletedAt || "1970-01-01") - Date.parse(left.deletedAt || "1970-01-01"))[0];
    if (candidate) candidate.canRestore = true;
  }
  return candidates.sort((left, right) => Date.parse(right.deletedAt || "1970-01-01") - Date.parse(left.deletedAt || "1970-01-01"));
}

function publicCandidate(candidate: InternalPurgedCandidate): PurgedDocumentCandidate {
  return {
    documentId: candidate.documentId,
    slug: candidate.slug,
    title: candidate.title,
    deletedAt: candidate.deletedAt,
    source: candidate.source,
    canRestore: candidate.canRestore,
  };
}

function recoveryError(error: unknown) {
  return Response.json({
    error: error instanceof Error ? error.message : "Protected Library recovery is temporarily unavailable.",
  }, { status: 503, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  const verified = await verifyPipelineRequest(request, true);
  if (verified instanceof Response) return verified;
  try {
    const documents = await discoverPurgedDocuments(authorizationHeader(request));
    return Response.json({
      documents: documents.map(publicCandidate),
      generatedAt: new Date().toISOString(),
    }, { headers: noStoreHeaders });
  } catch (error) {
    return recoveryError(error);
  }
}

export async function POST(request: Request) {
  const verified = await verifyPipelineRequest(request, true);
  if (verified instanceof Response) return verified;
  try {
    const body = await request.json().catch(() => ({})) as { documentId?: unknown };
    const documentId = typeof body.documentId === "string" ? body.documentId : "";
    const authorization = authorizationHeader(request);
    const candidates = await discoverPurgedDocuments(authorization);
    const candidate = candidates.find(item => item.documentId === documentId && item.canRestore && isProtectedRecoveryDocument(item.document));
    if (!candidate) {
      return Response.json({ error: "The protected Library recovery candidate is no longer available." }, { status: 409, headers: noStoreHeaders });
    }

    const currentResponse = await upstream("/api/library-state?summary=1", authorization);
    const current = parseSharedLibraryResponse(await readUpstreamJson(currentResponse));
    if (!current) throw new Error("The shared Library returned invalid catalog data.");
    const alreadyActive = current.state.documents.find(document => document.id === candidate.document.id || document.slug === candidate.document.slug);
    if (alreadyActive) {
      return Response.json({ ...current, repairedDocumentId: alreadyActive.id, alreadyActive: true }, { headers: noStoreHeaders });
    }
    const activeCategories = current.state.categories.filter(category => !category.deletedAt);
    const originalCategoryIsActive = activeCategories.some(category => category.name === candidate.document.category);
    const category = originalCategoryIsActive ? candidate.document.category : activeCategories[0]?.name;
    if (!category) {
      return Response.json({ error: "Create or recover an active Library category before restoring this document." }, { status: 409, headers: noStoreHeaders });
    }

    const restoredDocument: ManagedLibraryDocument = {
      ...candidate.document,
      category,
      status: "published",
      hidden: false,
      updatedAt: new Date().toISOString(),
    };
    delete restoredDocument.deletedAt;
    const restoredResponse = await upstream("/api/library-state?summary=1", authorization, {
      method: "PATCH",
      body: JSON.stringify({ operation: "document.create", document: restoredDocument }),
    });
    const restoredValue = await readUpstreamJson(restoredResponse);
    const restored = parseSharedLibraryResponse(restoredValue);
    if (!restored) throw new Error("The shared Library returned invalid recovery data.");
    return Response.json({
      ...restored,
      repairedDocumentId: restoredDocument.id,
      recoverySource: candidate.source,
    }, { headers: noStoreHeaders });
  } catch (error) {
    return recoveryError(error);
  }
}
