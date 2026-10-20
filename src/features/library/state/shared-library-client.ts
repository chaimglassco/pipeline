import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import type { ManagedLibraryDocument } from "./admin-storage";
import type { ManagedCategory } from "./category-storage";
import { isAuthoritativeSharedLibraryResponse, parseSharedLibraryDocumentUpdateResponse, parseSharedLibraryResponse, type SharedLibraryResponse, type SharedLibraryState } from "./shared-library-state";

export const SHARED_LIBRARY_CACHE_KEY = "glassco-library-confirmed-cache-v2";
export const SHARED_LIBRARY_REQUEST_TIMEOUT_MS = 18_000;
export const PROTECTED_LIBRARY_RECOVERY_TIMEOUT_MS = 120_000;

export type SharedLibraryReadOptions = { summary?: boolean; slug?: string; recovery?: boolean; archive?: boolean; includeDeletionAudit?: boolean; integrityPreview?: boolean };
export type LibraryBackup = {
  id: string;
  revision: number;
  reason: string;
  createdBy: string;
  createdAt: string;
  stateSize: number;
  isManual: boolean;
  checksum: string;
  snapshotType: string;
  status: string;
};
export type LibraryVersion = {
  id: string;
  recordType: "document" | "category";
  recordId: string;
  recordVersion: number;
  catalogRevision: number;
  lifecycleState: "active" | "deleted" | "archived";
  data: ManagedLibraryDocument | ManagedCategory;
  sortOrder: number;
  deletedAt?: string;
  archivedAt?: string;
  operationType: string;
  operationSource: string;
  actorEmail: string;
  actorRole: string;
  requestId: string;
  checksum: string;
  trusted: boolean;
  restorable: boolean;
  validationErrorCode: string | null;
  validationErrorReason?: string | null;
  payloadShape?: {
    storedType: string;
    canonicalType: string;
    storedKeys: string[];
    canonicalKeys: string[];
  };
  createdAt: string;
};
export type LibraryIntegrityIncident = {
  id: string;
  incidentType: string;
  recordType: "document" | "category";
  recordId: string;
  detectedChecksum: string;
  restoredVersionId: string;
  details: Record<string, unknown>;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
};
export type PurgedLibraryDocument = {
  documentId: string;
  slug: string;
  title: string;
  deletedAt?: string;
  source: {
    kind: "pipeline_backup" | "legacy_snapshot";
    id: string;
    label: string;
    createdAt?: string;
  };
  canRestore: boolean;
};

export class SharedLibraryTimeoutError extends Error {
  constructor() {
    super("The shared library took too long to respond.");
    this.name = "SharedLibraryTimeoutError";
  }
}

export class SharedLibraryRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly stage?: string,
    public readonly retryable = false,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "SharedLibraryRequestError";
  }
}

export class SharedLibraryIncompleteResponseError extends Error {
  constructor(message = "The shared Library returned an incomplete catalog. The last confirmed copy was preserved.") {
    super(message);
    this.name = "SharedLibraryIncompleteResponseError";
  }
}

export type SharedLibraryMutation =
  | { operation: "catalog.initialize"; state: SharedLibraryState; expectedRevision: 0 }
  | { operation: "document.create"; document: ManagedLibraryDocument }
  | { operation: "document.update"; documentId: string; expectedVersion: number; document: ManagedLibraryDocument; updateScope?: "content" }
  | { operation: "document.delete" | "document.restore" | "document.archive" | "document.archiveIncomplete" | "document.restoreArchived" | "document.purge"; documentId: string; expectedVersion: number }
  | { operation: "record.restoreVersion"; recordType: "document" | "category"; recordId: string; versionId: string; expectedVersion: number }
  | { operation: "records.restoreFromSnapshot"; snapshotId: string; recordType: "document" | "category"; recordIds: string[]; expectedRevision: number }
  | { operation: "integrity.acknowledge"; incidentId: string; expectedRevision: number }
  | { operation: "documents.restoreSystemDeleted"; documentIds: string[]; expectedRevision: number }
  | { operation: "documents.restoreIncomplete"; records: Array<{ documentId: string; versionId: string; expectedVersion: number }>; expectedRevision: number }
  | { operation: "documents.reorder"; documentIds: string[]; expectedRevision: number }
  | { operation: "category.create"; category: ManagedCategory }
  | { operation: "category.update"; categoryId: string; expectedVersion: number; category: ManagedCategory }
  | { operation: "category.delete" | "category.restore" | "category.archive"; categoryId: string; expectedVersion: number }
  | { operation: "categories.reorder"; categoryIds: string[]; expectedRevision: number };

export class SharedLibraryConflictError extends Error {
  constructor(public readonly latest: SharedLibraryResponse) {
    super("The shared library changed in another session. The latest version has been loaded.");
  }
}

function sharedLibraryUrl(options: SharedLibraryReadOptions = {}) {
  const params = new URLSearchParams();
  if (options.summary) params.set("summary", "1");
  if (options.slug) params.set("slug", options.slug);
  if (options.recovery) params.set("recovery", "1");
  if (options.archive) params.set("archive", "1");
  if (options.includeDeletionAudit) params.set("includeDeletionAudit", "1");
  if (options.integrityPreview) params.set("integrityPreview", "1");
  const query = params.toString();
  return `${withPpcBasePath("/api/library")}${query ? `?${query}` : ""}`;
}

export function getSharedLibraryCacheKey(options: SharedLibraryReadOptions = {}) {
  return options.slug ? `${SHARED_LIBRARY_CACHE_KEY}:document:${encodeURIComponent(options.slug)}` : SHARED_LIBRARY_CACHE_KEY;
}

async function readJson(response: Response): Promise<unknown> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const parsed = parseSharedLibraryResponse(value);
    if (response.status === 409 && parsed && isAuthoritativeSharedLibraryResponse(parsed)) {
      throw new SharedLibraryConflictError(parsed);
    }
    const details = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const requestId = response.headers.get("x-request-id") || (
      typeof details.requestId === "string" ? details.requestId : undefined
    );
    const message = typeof details.error === "string"
      ? details.error
      : `Shared library request failed (HTTP ${response.status}).${requestId ? ` Reference: ${requestId}.` : ""}`;
    throw new SharedLibraryRequestError(
      message,
      response.status,
      typeof details.code === "string" ? details.code : undefined,
      typeof details.stage === "string" ? details.stage : undefined,
      details.retryable === true,
      requestId,
    );
  }
  return value;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = SHARED_LIBRARY_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new SharedLibraryTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function requireAuthoritativeResponse(value: unknown, message: string): SharedLibraryResponse {
  const parsed = parseSharedLibraryResponse(value);
  if (!parsed || !isAuthoritativeSharedLibraryResponse(parsed)) {
    throw new SharedLibraryIncompleteResponseError(message);
  }
  return parsed;
}

export async function fetchSharedLibraryState(signal?: AbortSignal, options: SharedLibraryReadOptions = {}): Promise<SharedLibraryResponse> {
  const value = await readJson(await fetchWithTimeout(sharedLibraryUrl(options), {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
    signal,
  }));
  return requireAuthoritativeResponse(value, "The shared Library returned an incomplete catalog. The last confirmed copy was preserved.");
}

export async function mutateSharedLibrary(mutation: SharedLibraryMutation, options: SharedLibraryReadOptions = {}): Promise<SharedLibraryResponse> {
  const value = await readJson(await fetchWithTimeout(sharedLibraryUrl(options), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getPipelineAuthorizationHeader() },
    body: JSON.stringify(mutation),
  }));
  if (mutation.operation === "document.update") {
    const parsed = parseSharedLibraryResponse(value) ?? parseSharedLibraryDocumentUpdateResponse(value);
    if (parsed && isAuthoritativeSharedLibraryResponse(parsed)) return parsed;
  }
  return requireAuthoritativeResponse(value, "The shared Library mutation returned incomplete confirmation. Your last confirmed copy was preserved.");
}

export function verifyRestoredLibraryDocument(
  response: SharedLibraryResponse,
  documentId: string,
  slug: string,
  expectedVersion: number,
): ManagedLibraryDocument | null {
  const restored = response.state.documents.find(document => document.id === documentId);
  const restoredVersion = response.recordVersions.documents[documentId];
  return response.catalogCompleteness?.scope === "document"
    && response.documentStatus?.status === "active"
    && response.documentStatus.documentId === documentId
    && restored?.slug === slug
    && Number.isSafeInteger(restoredVersion)
    && restoredVersion > expectedVersion
    ? restored
    : null;
}

export function verifyRestoredIncompleteDocuments(
  response: SharedLibraryResponse,
  records: Array<{ documentId: string; expectedVersion: number }>,
): boolean {
  if (response.catalogCompleteness?.scope !== "catalog"
    || response.restoredCount !== records.length) return false;
  const manifestById = new Map(response.recordManifest?.documents.map(entry => [entry.id, entry]) || []);
  return records.every((record) => {
    const restored = response.state.documents.find(document => document.id === record.documentId);
    const manifest = manifestById.get(record.documentId);
    const restoredVersion = response.recordVersions.documents[record.documentId];
    return Boolean(restored
      && manifest?.lifecycleState === "active"
      && manifest.slug === restored.slug
      && Number.isSafeInteger(restoredVersion)
      && restoredVersion > record.expectedVersion
      && !response.recordIntegrity?.documents[record.documentId]);
  });
}

export async function initializeSharedLibrary(): Promise<SharedLibraryResponse> {
  const value = await readJson(await fetchWithTimeout(withPpcBasePath("/api/library/migration"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getPipelineAuthorizationHeader() },
    body: JSON.stringify({ action: "initialize-catalog" }),
  }));
  return requireAuthoritativeResponse(value, "Library migration returned an incomplete catalog.");
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseLibraryBackup(value: unknown): LibraryBackup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!requiredString(item.id) || !Number.isInteger(item.revision) || Number(item.revision) < 0
    || !requiredString(item.reason) || !requiredString(item.createdBy) || !requiredString(item.createdAt)
    || !Number.isFinite(Date.parse(String(item.createdAt))) || !Number.isInteger(item.stateSize)
    || typeof item.isManual !== "boolean" || !requiredString(item.checksum)
    || !requiredString(item.snapshotType) || !requiredString(item.status)) return null;
  return {
    id: String(item.id),
    revision: Number(item.revision),
    reason: String(item.reason),
    createdBy: String(item.createdBy),
    createdAt: String(item.createdAt),
    stateSize: Number(item.stateSize),
    isManual: item.isManual,
    checksum: String(item.checksum),
    snapshotType: String(item.snapshotType),
    status: String(item.status),
  };
}

export async function fetchLibraryBackups(): Promise<LibraryBackup[]> {
  const value = await readJson(await fetchWithTimeout(`${withPpcBasePath("/api/library")}?backups=1`, {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
  }));
  const items = value && typeof value === "object" ? (value as Record<string, unknown>).backups : null;
  if (!Array.isArray(items)) throw new Error("Library snapshots returned invalid data.");
  const backups = items.map(parseLibraryBackup);
  if (backups.some(item => !item)) throw new Error("Library snapshots returned invalid data.");
  return backups as LibraryBackup[];
}

export async function createLibraryBackup(reason = "manual-recovery-center-snapshot"): Promise<LibraryBackup> {
  const value = await readJson(await fetchWithTimeout(withPpcBasePath("/api/library"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getPipelineAuthorizationHeader() },
    body: JSON.stringify({ action: "create-backup", reason }),
  }));
  const backup = value && typeof value === "object" ? parseLibraryBackup((value as Record<string, unknown>).backup) : null;
  if (!backup) throw new Error("Library snapshot returned invalid data.");
  return backup;
}

export async function fetchLibrarySnapshot(backupId: string): Promise<{ backup: LibraryBackup; state: SharedLibraryState }> {
  const value = await readJson(await fetchWithTimeout(`${withPpcBasePath("/api/library")}?backupId=${encodeURIComponent(backupId)}`, {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
  }));
  if (!value || typeof value !== "object") throw new Error("Library snapshot returned invalid data.");
  const candidate = value as Record<string, unknown>;
  const backup = parseLibraryBackup(candidate.backup);
  const state = candidate.state && typeof candidate.state === "object"
    ? parseSharedLibraryResponse({
      initialized: true,
      state: candidate.state,
      revision: backup?.revision ?? 0,
      recordVersions: { documents: {}, categories: {} },
      updatedAt: null,
      updatedBy: null,
    })?.state
    : null;
  if (!backup || !state) throw new Error("Library snapshot returned invalid data.");
  return { backup, state };
}

export async function fetchLibraryVersions(recordType: "document" | "category", recordId: string): Promise<LibraryVersion[]> {
  const params = new URLSearchParams({ versions: "1", recordType, recordId });
  const value = await readJson(await fetchWithTimeout(`${withPpcBasePath("/api/library")}?${params}`, {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
  }));
  const items = value && typeof value === "object" ? (value as Record<string, unknown>).versions : null;
  if (!Array.isArray(items)) throw new Error("Library version history returned invalid data.");
  const parsed = items.filter((item): item is LibraryVersion => Boolean(item && typeof item === "object"
    && typeof (item as Record<string, unknown>).id === "string"
    && typeof (item as Record<string, unknown>).recordId === "string"
    && ["document", "category"].includes(String((item as Record<string, unknown>).recordType))
    && typeof (item as Record<string, unknown>).restorable === "boolean"
    && (
      (item as Record<string, unknown>).validationErrorCode === null
      || typeof (item as Record<string, unknown>).validationErrorCode === "string"
    )));
  if (parsed.length !== items.length) throw new Error("Library version history returned invalid data.");
  return parsed;
}

export async function fetchLibraryIntegrityIncidents(): Promise<LibraryIntegrityIncident[]> {
  const value = await readJson(await fetchWithTimeout(`${withPpcBasePath("/api/library")}?incidents=1`, {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
  }));
  const items = value && typeof value === "object" ? (value as Record<string, unknown>).incidents : null;
  if (!Array.isArray(items)) throw new Error("Library integrity incidents returned invalid data.");
  return items.filter((item): item is LibraryIntegrityIncident => Boolean(item && typeof item === "object"
    && typeof (item as Record<string, unknown>).id === "string"
    && typeof (item as Record<string, unknown>).recordId === "string"));
}

function parsePurgedLibraryDocuments(value: unknown): PurgedLibraryDocument[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).documents)) return null;
  const parsed: PurgedLibraryDocument[] = [];
  for (const item of (value as Record<string, unknown>).documents as unknown[]) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    const source = candidate.source;
    if (typeof candidate.documentId !== "string"
      || typeof candidate.slug !== "string"
      || typeof candidate.title !== "string"
      || typeof candidate.canRestore !== "boolean"
      || !source
      || typeof source !== "object") return null;
    const sourceValue = source as Record<string, unknown>;
    if (!["pipeline_backup", "legacy_snapshot"].includes(String(sourceValue.kind))
      || typeof sourceValue.id !== "string"
      || typeof sourceValue.label !== "string") return null;
    if (candidate.deletedAt !== undefined && (typeof candidate.deletedAt !== "string" || !Number.isFinite(Date.parse(candidate.deletedAt)))) return null;
    if (sourceValue.createdAt !== undefined && (typeof sourceValue.createdAt !== "string" || !Number.isFinite(Date.parse(sourceValue.createdAt)))) return null;
    parsed.push({
      documentId: candidate.documentId,
      slug: candidate.slug,
      title: candidate.title,
      ...(typeof candidate.deletedAt === "string" ? { deletedAt: candidate.deletedAt } : {}),
      source: {
        kind: sourceValue.kind as PurgedLibraryDocument["source"]["kind"],
        id: sourceValue.id,
        label: sourceValue.label,
        ...(typeof sourceValue.createdAt === "string" ? { createdAt: sourceValue.createdAt } : {}),
      },
      canRestore: candidate.canRestore,
    });
  }
  return parsed;
}

export async function fetchPurgedLibraryDocuments(): Promise<PurgedLibraryDocument[]> {
  const value = await readJson(await fetchWithTimeout(withPpcBasePath("/api/library/recovery/purged"), {
    cache: "no-store",
    headers: getPipelineAuthorizationHeader(),
  }, PROTECTED_LIBRARY_RECOVERY_TIMEOUT_MS));
  const documents = parsePurgedLibraryDocuments(value);
  if (!documents) throw new Error("Protected Library recovery returned invalid data.");
  return documents;
}

export async function restorePurgedLibraryDocument(documentId: string): Promise<SharedLibraryResponse> {
  const value = await readJson(await fetchWithTimeout(withPpcBasePath("/api/library/recovery/purged"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getPipelineAuthorizationHeader() },
    body: JSON.stringify({ documentId }),
  }, PROTECTED_LIBRARY_RECOVERY_TIMEOUT_MS));
  return requireAuthoritativeResponse(value, "Protected Library recovery returned an incomplete catalog.");
}

export function cacheSharedLibraryResponse(response: SharedLibraryResponse, storage: Pick<Storage, "setItem">, options: SharedLibraryReadOptions = {}): boolean {
  try {
    storage.setItem(getSharedLibraryCacheKey(options), JSON.stringify({
      ...response,
      snapshotAt: response.snapshotAt || new Date().toISOString(),
    }));
    return true;
  } catch { return false; }
}

export function invalidateSharedLibraryDocumentCache(storage: Pick<Storage, "removeItem">, slug: string): boolean {
  try {
    storage.removeItem(getSharedLibraryCacheKey({ slug }));
    return true;
  } catch { return false; }
}

export function reconcileSharedLibraryDocumentCaches(
  previous: SharedLibraryResponse | null,
  next: SharedLibraryResponse,
  storage: Pick<Storage, "removeItem">,
): ManagedLibraryDocument[] {
  if (!previous) return [];
  const nextActive = new Map(next.state.documents.filter(document => !document.deletedAt).map(document => [document.id, document]));
  const manifest = new Map(next.recordManifest?.documents.map(entry => [entry.id, entry]) ?? []);
  const removed: ManagedLibraryDocument[] = [];
  for (const document of previous.state.documents.filter(item => !item.deletedAt)) {
    const nextDocument = nextActive.get(document.id);
    const lifecycle = manifest.get(document.id)?.lifecycleState;
    const versionChanged = next.recordVersions.documents[document.id] !== previous.recordVersions.documents[document.id];
    const explicitlyRemoved = lifecycle === "deleted" || lifecycle === "archived";
    if (explicitlyRemoved) removed.push(document);
    if (explicitlyRemoved || (nextDocument && versionChanged)) {
      invalidateSharedLibraryDocumentCache(storage, document.slug);
    }
  }
  return removed;
}

export function readCachedSharedLibraryResponse(storage: Pick<Storage, "getItem">, options: SharedLibraryReadOptions = {}): SharedLibraryResponse | null {
  try {
    const raw = storage.getItem(getSharedLibraryCacheKey(options));
    return raw ? parseSharedLibraryResponse(JSON.parse(raw)) : null;
  } catch { return null; }
}

export async function hydrateSharedLibraryState(storage: Storage, signal?: AbortSignal, options: SharedLibraryReadOptions = {}): Promise<{ response: SharedLibraryResponse; source: "server" | "cache" }> {
  try {
    const response = await fetchSharedLibraryState(signal, options);
    cacheSharedLibraryResponse(response, storage, options);
    return { response, source: "server" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const cached = readCachedSharedLibraryResponse(storage, options);
    if (!cached) throw error;
    return { response: cached, source: "cache" };
  }
}
