import type { LibraryDocument } from "../domain/types";
import { parseAdminLibraryState, type ManagedLibraryDocument } from "./admin-storage";
import { createDefaultCategories, parseCategoryState, type ManagedCategory } from "./category-storage";

export type SharedLibraryState = {
  version: 1;
  documents: ManagedLibraryDocument[];
  categories: ManagedCategory[];
};

export type SharedLibraryRecordVersions = {
  documents: Record<string, number>;
  categories: Record<string, number>;
};

export type SharedLibraryDocumentManifestEntry = {
  id: string;
  slug: string;
  recordVersion: number;
  lifecycleState: "active" | "deleted" | "archived";
  hidden: boolean;
  status: "published" | "draft";
};

export type SharedLibraryRecordManifest = {
  documents: SharedLibraryDocumentManifestEntry[];
};

export type SharedLibraryCatalogCompleteness = {
  complete: true;
  scope: "catalog" | "document" | "recovery" | "archive" | "state";
  expectedDocumentCount: number;
  returnedDocumentCount: number;
  expectedCategoryCount: number;
  returnedCategoryCount: number;
  activeDocumentCount: number;
  manifestDocumentCount: number;
  checksum: string;
};

export type LibraryDeletionSource = "user" | "system_migration" | "system_backup_restore" | "unknown";

export type LibraryAuditActor = {
  name: string;
  email: string;
  role: "ADMIN" | "USER" | "VIEWER";
};

export type LibraryDocumentDeletionAudit = {
  source: LibraryDeletionSource;
  deletedAt: string;
  reason: string;
  actor: LibraryAuditActor | null;
  initiatedBy: LibraryAuditActor | null;
};

export type SharedLibraryDeletionAudit = {
  documents: Record<string, LibraryDocumentDeletionAudit>;
};

export type SharedLibraryDocumentIntegrity = {
  status: "incomplete";
  documentId: string;
  slug: string;
  title: string;
  recordVersion: number;
  reasonCode: "DOCUMENT_SCHEMA_INVALID";
  hasRecoveryCandidate: boolean;
  recoveryCandidateVersionId?: string;
  recoveryCandidateRecordVersion?: number;
  recoveryCandidateCreatedAt?: string;
};

export type SharedLibraryRecordIntegrity = {
  documents: Record<string, SharedLibraryDocumentIntegrity>;
};

export type SharedLibraryRecoveryPreview = {
  document: ManagedLibraryDocument;
  versionId: string;
  recordVersion: number;
  createdAt: string;
  operationType: string;
  actorEmail: string;
};

export type SharedLibraryDocumentStatus = {
  status: "active" | "deleted" | "archived" | "purged" | "not_found" | "incomplete";
  slug: string;
  documentId?: string;
  title?: string;
  deletedAt?: string;
  archivedAt?: string;
  hidden?: boolean;
  recordVersion?: number;
  deletionAudit?: LibraryDocumentDeletionAudit;
  reasonCode?: "DOCUMENT_SCHEMA_INVALID";
  hasRecoveryCandidate?: boolean;
};

export type SharedLibraryIntegrityStatus = {
  status: "healthy" | "repaired" | "blocked";
  checksum: string;
  unacknowledgedIncidentCount: number;
};

export type SharedLibraryMutationResult = {
  operation: "document.update";
  documentId: string;
  document: ManagedLibraryDocument;
  recordVersion: number;
  lifecycleState: "active" | "deleted" | "archived";
};

export type SharedLibraryResponse = {
  initialized: boolean;
  state: SharedLibraryState;
  revision: number;
  recordVersions: SharedLibraryRecordVersions;
  updatedAt: string | null;
  updatedBy: string | null;
  snapshotAt?: string;
  recordManifest?: SharedLibraryRecordManifest;
  catalogCompleteness?: SharedLibraryCatalogCompleteness;
  recoveryDocumentCount?: number;
  archivedDocumentCount?: number;
  integrityStatus?: SharedLibraryIntegrityStatus;
  documentStatus?: SharedLibraryDocumentStatus;
  deletionAudit?: SharedLibraryDeletionAudit;
  recordIntegrity?: SharedLibraryRecordIntegrity;
  recoveryPreview?: SharedLibraryRecoveryPreview;
  restoredCount?: number;
  mutationResult?: SharedLibraryMutationResult;
};

export function parseSharedLibraryState(value: unknown): SharedLibraryState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  const documents = parseAdminLibraryState(JSON.stringify({ version: 1, documents: candidate.documents }));
  const categories = parseCategoryState(JSON.stringify({ version: 1, categories: candidate.categories }));
  if (!documents || !categories) return null;
  if (new Set(documents.documents.map(document => document.id)).size !== documents.documents.length
    || new Set(categories.categories.map(category => category.id)).size !== categories.categories.length) return null;
  return { version: 1, documents: documents.documents, categories: categories.categories };
}

export function createSharedLibraryState(seed: LibraryDocument[]): SharedLibraryState {
  return { version: 1, documents: seed.map(document => ({ ...document })), categories: createDefaultCategories() };
}

function parseVersionMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, version]) => Number.isInteger(version) && Number(version) >= 0)) return null;
  return Object.fromEntries(entries.map(([id, version]) => [id, Number(version)]));
}

function parseDocumentManifest(value: unknown): SharedLibraryRecordManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const documentsValue = (value as Record<string, unknown>).documents;
  if (!Array.isArray(documentsValue)) return null;
  const documents: SharedLibraryDocumentManifestEntry[] = [];
  const ids = new Set<string>();
  for (const item of documentsValue) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id
      || typeof candidate.slug !== "string" || !candidate.slug
      || !Number.isInteger(candidate.recordVersion) || Number(candidate.recordVersion) < 1
      || !["active", "deleted", "archived"].includes(String(candidate.lifecycleState))
      || typeof candidate.hidden !== "boolean"
      || !["published", "draft"].includes(String(candidate.status))
      || ids.has(candidate.id)) return null;
    ids.add(candidate.id);
    documents.push({
      id: candidate.id,
      slug: candidate.slug,
      recordVersion: Number(candidate.recordVersion),
      lifecycleState: candidate.lifecycleState as SharedLibraryDocumentManifestEntry["lifecycleState"],
      hidden: candidate.hidden,
      status: candidate.status as SharedLibraryDocumentManifestEntry["status"],
    });
  }
  return { documents };
}

function parseCatalogCompleteness(value: unknown): SharedLibraryCatalogCompleteness | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const countFields = [
    "expectedDocumentCount",
    "returnedDocumentCount",
    "expectedCategoryCount",
    "returnedCategoryCount",
    "activeDocumentCount",
    "manifestDocumentCount",
  ] as const;
  if (candidate.complete !== true
    || !["catalog", "document", "recovery", "archive", "state"].includes(String(candidate.scope))
    || typeof candidate.checksum !== "string"
    || !countFields.every(field => Number.isInteger(candidate[field]) && Number(candidate[field]) >= 0)) return null;
  return {
    complete: true,
    scope: candidate.scope as SharedLibraryCatalogCompleteness["scope"],
    expectedDocumentCount: Number(candidate.expectedDocumentCount),
    returnedDocumentCount: Number(candidate.returnedDocumentCount),
    expectedCategoryCount: Number(candidate.expectedCategoryCount),
    returnedCategoryCount: Number(candidate.returnedCategoryCount),
    activeDocumentCount: Number(candidate.activeDocumentCount),
    manifestDocumentCount: Number(candidate.manifestDocumentCount),
    checksum: candidate.checksum,
  };
}

export function isAuthoritativeSharedLibraryResponse(response: SharedLibraryResponse): boolean {
  const manifest = response.recordManifest;
  const completeness = response.catalogCompleteness;
  if (!manifest || !completeness || completeness.complete !== true) return false;
  if (completeness.returnedDocumentCount !== response.state.documents.length
    || completeness.expectedDocumentCount !== completeness.returnedDocumentCount
    || completeness.returnedCategoryCount !== response.state.categories.length
    || completeness.expectedCategoryCount !== completeness.returnedCategoryCount
    || completeness.manifestDocumentCount !== manifest.documents.length) return false;
  const manifestById = new Map(manifest.documents.map(entry => [entry.id, entry]));
  if (manifestById.size !== manifest.documents.length) return false;
  const activeManifest = manifest.documents.filter(entry => entry.lifecycleState === "active");
  if (activeManifest.length !== completeness.activeDocumentCount
    || new Set(activeManifest.map(entry => entry.slug)).size !== activeManifest.length) return false;
  for (const document of response.state.documents) {
    const entry = manifestById.get(document.id);
    if (!entry
      || entry.slug !== document.slug
      || entry.recordVersion !== response.recordVersions.documents[document.id]
      || entry.hidden !== document.hidden
      || entry.status !== document.status
      || (entry.lifecycleState === "active" && Boolean(document.deletedAt || document.archivedAt))
      || (entry.lifecycleState === "deleted" && !document.deletedAt)
      || (entry.lifecycleState === "archived" && !document.archivedAt)) return false;
    if (completeness.scope === "catalog" && entry.lifecycleState !== "active") return false;
    if (completeness.scope === "document"
      && response.documentStatus?.status === "active"
      && entry.lifecycleState !== "active") return false;
    if (completeness.scope === "archive" && entry.lifecycleState !== "archived") return false;
  }
  if (completeness.scope === "catalog" && completeness.activeDocumentCount !== response.state.documents.length) return false;
  if (!response.state.categories.every(category => Number.isInteger(response.recordVersions.categories[category.id])
    && response.recordVersions.categories[category.id] >= 1)) return false;
  if (response.documentStatus) {
    const status = response.documentStatus;
    const manifestEntry = status.documentId ? manifestById.get(status.documentId) : undefined;
    if (status.status === "not_found" && manifest.documents.some(entry => entry.slug === status.slug)) return false;
    if (status.status === "active" && (!manifestEntry || manifestEntry.lifecycleState !== "active" || manifestEntry.slug !== status.slug)) return false;
    if (status.status === "deleted" && (!manifestEntry || manifestEntry.lifecycleState !== "deleted" || manifestEntry.slug !== status.slug)) return false;
    if (status.status === "archived" && (!manifestEntry || manifestEntry.lifecycleState !== "archived" || manifestEntry.slug !== status.slug)) return false;
    if (status.status === "incomplete" && (!manifestEntry || manifestEntry.lifecycleState !== "active" || manifestEntry.slug !== status.slug)) return false;
    if (status.recordVersion !== undefined && (!manifestEntry || status.recordVersion !== manifestEntry.recordVersion)) return false;
  }
  const integrityEntries = Object.values(response.recordIntegrity?.documents || {});
  for (const integrity of integrityEntries) {
    const manifestEntry = manifestById.get(integrity.documentId);
    if (!manifestEntry
      || manifestEntry.lifecycleState !== "active"
      || manifestEntry.slug !== integrity.slug
      || manifestEntry.recordVersion !== integrity.recordVersion
      || response.recordVersions.documents[integrity.documentId] !== integrity.recordVersion) return false;
  }
  if (response.documentStatus?.status === "incomplete") {
    const integrity = response.documentStatus.documentId
      ? response.recordIntegrity?.documents[response.documentStatus.documentId]
      : undefined;
    if (!integrity
      || integrity.slug !== response.documentStatus.slug
      || integrity.hasRecoveryCandidate !== response.documentStatus.hasRecoveryCandidate) return false;
  }
  if (response.recoveryPreview) {
    const status = response.documentStatus;
    const integrity = status?.documentId ? response.recordIntegrity?.documents[status.documentId] : undefined;
    if (status?.status !== "incomplete"
      || !integrity
      || !integrity.hasRecoveryCandidate
      || response.recoveryPreview.document.id !== integrity.documentId
      || response.recoveryPreview.versionId !== integrity.recoveryCandidateVersionId
      || response.recoveryPreview.recordVersion !== integrity.recoveryCandidateRecordVersion) return false;
  }
  if (response.mutationResult) {
    const result = response.mutationResult;
    const manifestEntry = manifestById.get(result.documentId);
    if (!manifestEntry
      || manifestEntry.recordVersion !== result.recordVersion
      || manifestEntry.lifecycleState !== result.lifecycleState
      || manifestEntry.slug !== result.document.slug) return false;
  }
  return true;
}

function parseAuditActor(value: unknown): LibraryAuditActor | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const actor = value as Record<string, unknown>;
  if (typeof actor.name !== "string" || typeof actor.email !== "string" || !["ADMIN", "USER", "VIEWER"].includes(String(actor.role))) return undefined;
  return { name: actor.name, email: actor.email, role: actor.role as LibraryAuditActor["role"] };
}

function parseDeletionAudit(value: unknown): SharedLibraryDeletionAudit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const documentsValue = (value as Record<string, unknown>).documents;
  if (!documentsValue || typeof documentsValue !== "object" || Array.isArray(documentsValue)) return null;
  const entries: Array<[string, LibraryDocumentDeletionAudit]> = [];
  for (const [id, entryValue] of Object.entries(documentsValue as Record<string, unknown>)) {
    if (!entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) return null;
    const entry = entryValue as Record<string, unknown>;
    const actor = parseAuditActor(entry.actor);
    const initiatedBy = parseAuditActor(entry.initiatedBy);
    if (!["user", "system_migration", "system_backup_restore", "unknown"].includes(String(entry.source))
      || typeof entry.deletedAt !== "string"
      || !Number.isFinite(Date.parse(entry.deletedAt))
      || typeof entry.reason !== "string"
      || actor === undefined
      || initiatedBy === undefined) return null;
    entries.push([id, {
      source: entry.source as LibraryDeletionSource,
      deletedAt: entry.deletedAt,
      reason: entry.reason,
      actor,
      initiatedBy,
    }]);
  }
  return { documents: Object.fromEntries(entries) };
}

function parseDocumentStatus(value: unknown): SharedLibraryDocumentStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (!["active", "deleted", "archived", "purged", "not_found", "incomplete"].includes(String(entry.status)) || typeof entry.slug !== "string") return null;
  if (entry.documentId !== undefined && typeof entry.documentId !== "string") return null;
  if (entry.title !== undefined && typeof entry.title !== "string") return null;
  if (entry.deletedAt !== undefined && (typeof entry.deletedAt !== "string" || !Number.isFinite(Date.parse(entry.deletedAt)))) return null;
  if (entry.archivedAt !== undefined && (typeof entry.archivedAt !== "string" || !Number.isFinite(Date.parse(entry.archivedAt)))) return null;
  if (entry.hidden !== undefined && typeof entry.hidden !== "boolean") return null;
  if (entry.recordVersion !== undefined && (!Number.isInteger(entry.recordVersion) || Number(entry.recordVersion) < 0)) return null;
  if (entry.reasonCode !== undefined && entry.reasonCode !== "DOCUMENT_SCHEMA_INVALID") return null;
  if (entry.hasRecoveryCandidate !== undefined && typeof entry.hasRecoveryCandidate !== "boolean") return null;
  let deletionAudit: LibraryDocumentDeletionAudit | undefined;
  if (entry.deletionAudit !== undefined) {
    const parsed = parseDeletionAudit({ documents: { status: entry.deletionAudit } });
    deletionAudit = parsed?.documents.status;
    if (!deletionAudit) return null;
  }
  return {
    status: entry.status as SharedLibraryDocumentStatus["status"],
    slug: entry.slug,
    ...(typeof entry.documentId === "string" ? { documentId: entry.documentId } : {}),
    ...(typeof entry.title === "string" ? { title: entry.title } : {}),
    ...(typeof entry.deletedAt === "string" ? { deletedAt: entry.deletedAt } : {}),
    ...(typeof entry.archivedAt === "string" ? { archivedAt: entry.archivedAt } : {}),
    ...(typeof entry.hidden === "boolean" ? { hidden: entry.hidden } : {}),
    ...(entry.recordVersion === undefined ? {} : { recordVersion: Number(entry.recordVersion) }),
    ...(deletionAudit ? { deletionAudit } : {}),
    ...(entry.reasonCode === "DOCUMENT_SCHEMA_INVALID" ? { reasonCode: entry.reasonCode } : {}),
    ...(typeof entry.hasRecoveryCandidate === "boolean" ? { hasRecoveryCandidate: entry.hasRecoveryCandidate } : {}),
  };
}

function parseRecordIntegrity(value: unknown): SharedLibraryRecordIntegrity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const documentsValue = (value as Record<string, unknown>).documents;
  if (!documentsValue || typeof documentsValue !== "object" || Array.isArray(documentsValue)) return null;
  const entries: Array<[string, SharedLibraryDocumentIntegrity]> = [];
  for (const [id, entryValue] of Object.entries(documentsValue as Record<string, unknown>)) {
    if (!entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) return null;
    const entry = entryValue as Record<string, unknown>;
    if (entry.status !== "incomplete"
      || entry.documentId !== id
      || typeof entry.slug !== "string"
      || !entry.slug
      || typeof entry.title !== "string"
      || !Number.isInteger(entry.recordVersion)
      || Number(entry.recordVersion) < 1
      || entry.reasonCode !== "DOCUMENT_SCHEMA_INVALID"
      || typeof entry.hasRecoveryCandidate !== "boolean") return null;
    const candidateFields = [
      entry.recoveryCandidateVersionId,
      entry.recoveryCandidateRecordVersion,
      entry.recoveryCandidateCreatedAt,
    ];
    if (entry.hasRecoveryCandidate) {
      if (typeof candidateFields[0] !== "string"
        || !candidateFields[0]
        || !Number.isInteger(candidateFields[1])
        || Number(candidateFields[1]) < 1
        || typeof candidateFields[2] !== "string"
        || !Number.isFinite(Date.parse(candidateFields[2]))) return null;
    } else if (candidateFields.some(field => field !== undefined)) return null;
    entries.push([id, {
      status: "incomplete",
      documentId: id,
      slug: entry.slug,
      title: entry.title,
      recordVersion: Number(entry.recordVersion),
      reasonCode: "DOCUMENT_SCHEMA_INVALID",
      hasRecoveryCandidate: entry.hasRecoveryCandidate,
      ...(entry.hasRecoveryCandidate ? {
        recoveryCandidateVersionId: String(entry.recoveryCandidateVersionId),
        recoveryCandidateRecordVersion: Number(entry.recoveryCandidateRecordVersion),
        recoveryCandidateCreatedAt: String(entry.recoveryCandidateCreatedAt),
      } : {}),
    }]);
  }
  return { documents: Object.fromEntries(entries) };
}

function parseRecoveryPreview(value: unknown): SharedLibraryRecoveryPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const parsed = parseAdminLibraryState(JSON.stringify({ version: 1, documents: [entry.document] }));
  const document = parsed?.documents[0];
  if (!document
    || parsed?.documents.length !== 1
    || typeof entry.versionId !== "string"
    || !entry.versionId
    || !Number.isInteger(entry.recordVersion)
    || Number(entry.recordVersion) < 1
    || typeof entry.createdAt !== "string"
    || !Number.isFinite(Date.parse(entry.createdAt))
    || typeof entry.operationType !== "string"
    || typeof entry.actorEmail !== "string") return null;
  return {
    document,
    versionId: entry.versionId,
    recordVersion: Number(entry.recordVersion),
    createdAt: entry.createdAt,
    operationType: entry.operationType,
    actorEmail: entry.actorEmail,
  };
}

function parseMutationResult(value: unknown): SharedLibraryMutationResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (entry.operation !== "document.update"
    || typeof entry.documentId !== "string"
    || !Number.isInteger(entry.recordVersion)
    || Number(entry.recordVersion) < 1
    || !["active", "deleted", "archived"].includes(String(entry.lifecycleState))) return null;
  const parsed = parseAdminLibraryState(JSON.stringify({ version: 1, documents: [entry.document] }));
  const document = parsed?.documents[0];
  if (!document || parsed?.documents.length !== 1 || document.id !== entry.documentId) return null;
  return {
    operation: "document.update",
    documentId: entry.documentId,
    document,
    recordVersion: Number(entry.recordVersion),
    lifecycleState: entry.lifecycleState as SharedLibraryMutationResult["lifecycleState"],
  };
}

export function parseSharedLibraryResponse(value: unknown): SharedLibraryResponse | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const state = parseSharedLibraryState(candidate.state);
  const versions = candidate.recordVersions as Record<string, unknown> | undefined;
  const documents = parseVersionMap(versions?.documents);
  const categories = parseVersionMap(versions?.categories);
  if (typeof candidate.initialized !== "boolean" || !state || !Number.isInteger(candidate.revision) || Number(candidate.revision) < 0 || !documents || !categories) return null;
  if (candidate.updatedAt !== null && candidate.updatedAt !== undefined && typeof candidate.updatedAt !== "string") return null;
  if (candidate.updatedBy !== null && candidate.updatedBy !== undefined && typeof candidate.updatedBy !== "string") return null;
  if (candidate.snapshotAt !== undefined && (typeof candidate.snapshotAt !== "string" || !Number.isFinite(Date.parse(candidate.snapshotAt)))) return null;
  if (candidate.recoveryDocumentCount !== undefined && (!Number.isInteger(candidate.recoveryDocumentCount) || Number(candidate.recoveryDocumentCount) < 0)) return null;
  if (candidate.archivedDocumentCount !== undefined && (!Number.isInteger(candidate.archivedDocumentCount) || Number(candidate.archivedDocumentCount) < 0)) return null;
  let integrityStatus: SharedLibraryIntegrityStatus | undefined;
  if (candidate.integrityStatus !== undefined) {
    if (!candidate.integrityStatus || typeof candidate.integrityStatus !== "object" || Array.isArray(candidate.integrityStatus)) return null;
    const integrity = candidate.integrityStatus as Record<string, unknown>;
    if (!["healthy", "repaired", "blocked"].includes(String(integrity.status))
      || typeof integrity.checksum !== "string"
      || !Number.isInteger(integrity.unacknowledgedIncidentCount)
      || Number(integrity.unacknowledgedIncidentCount) < 0) return null;
    integrityStatus = {
      status: integrity.status as SharedLibraryIntegrityStatus["status"],
      checksum: integrity.checksum,
      unacknowledgedIncidentCount: Number(integrity.unacknowledgedIncidentCount),
    };
  }
  const documentStatus = candidate.documentStatus === undefined ? undefined : parseDocumentStatus(candidate.documentStatus);
  if (candidate.documentStatus !== undefined && !documentStatus) return null;
  const deletionAudit = candidate.deletionAudit === undefined ? undefined : parseDeletionAudit(candidate.deletionAudit);
  if (candidate.deletionAudit !== undefined && !deletionAudit) return null;
  const recordIntegrity = candidate.recordIntegrity === undefined ? undefined : parseRecordIntegrity(candidate.recordIntegrity);
  if (candidate.recordIntegrity !== undefined && !recordIntegrity) return null;
  const recoveryPreview = candidate.recoveryPreview === undefined ? undefined : parseRecoveryPreview(candidate.recoveryPreview);
  if (candidate.recoveryPreview !== undefined && !recoveryPreview) return null;
  const mutationResult = candidate.mutationResult === undefined ? undefined : parseMutationResult(candidate.mutationResult);
  if (candidate.mutationResult !== undefined && !mutationResult) return null;
  if (candidate.restoredCount !== undefined && (!Number.isInteger(candidate.restoredCount) || Number(candidate.restoredCount) < 0)) return null;
  const recordManifest = candidate.recordManifest === undefined ? undefined : parseDocumentManifest(candidate.recordManifest);
  const catalogCompleteness = candidate.catalogCompleteness === undefined ? undefined : parseCatalogCompleteness(candidate.catalogCompleteness);
  if ((candidate.recordManifest !== undefined && !recordManifest)
    || (candidate.catalogCompleteness !== undefined && !catalogCompleteness)
    || Boolean(recordManifest) !== Boolean(catalogCompleteness)) return null;
  const response: SharedLibraryResponse = {
    initialized: candidate.initialized,
    state,
    revision: Number(candidate.revision),
    recordVersions: { documents, categories },
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
    updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : null,
    ...(typeof candidate.snapshotAt === "string" ? { snapshotAt: candidate.snapshotAt } : {}),
    ...(recordManifest ? { recordManifest } : {}),
    ...(catalogCompleteness ? { catalogCompleteness } : {}),
    recoveryDocumentCount: candidate.recoveryDocumentCount === undefined
      ? state.documents.filter(document => document.deletedAt).length
      : Number(candidate.recoveryDocumentCount),
    archivedDocumentCount: candidate.archivedDocumentCount === undefined
      ? state.documents.filter(document => document.archivedAt).length
      : Number(candidate.archivedDocumentCount),
    ...(integrityStatus ? { integrityStatus } : {}),
    ...(documentStatus ? { documentStatus } : {}),
    ...(deletionAudit ? { deletionAudit } : {}),
    ...(recordIntegrity ? { recordIntegrity } : {}),
    ...(recoveryPreview ? { recoveryPreview } : {}),
    ...(candidate.restoredCount === undefined ? {} : { restoredCount: Number(candidate.restoredCount) }),
    ...(mutationResult ? { mutationResult } : {}),
  };
  if (recordManifest && catalogCompleteness && !isAuthoritativeSharedLibraryResponse(response)) return null;
  return response;
}

export function parseSharedLibraryDocumentUpdateResponse(value: unknown): SharedLibraryResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const focused = {
    ...candidate,
    deletionAudit: undefined,
    recordIntegrity: undefined,
    recoveryPreview: undefined,
  };
  const parsed = parseSharedLibraryResponse(focused);
  return parsed?.mutationResult?.operation === "document.update" ? parsed : null;
}
