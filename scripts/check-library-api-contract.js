const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const {
  applyDocumentUpdatePolicy,
  getDocumentProtectedFields,
  isLibraryInitialized,
  normalizeLibraryMutationBody,
  normalizeLibraryOperation,
  normalizeLibraryState,
  requireLibraryOperationPermission,
  sanitizeDocumentForCreate,
} = require("../api/_library-contract");

const sampleDocument = {
  id: "doc-1",
  slug: "sample",
  title: "Sample",
  description: "Description",
  category: "Guides",
  type: "Guide",
  tags: ["sample"],
  updatedAt: "2026-07-23",
  status: "published",
  hidden: false,
  readingMinutes: 1,
  body: "Legacy body",
  topics: [],
};
const sampleCategory = { id: "category-1", name: "Guides", hidden: false };

assert.deepEqual(normalizeLibraryState({ version: 1, documents: [sampleDocument], categories: [sampleCategory] }), {
  version: 1,
  documents: [sampleDocument],
  categories: [sampleCategory],
});

assert.equal(isLibraryInitialized(0), false);
assert.equal(isLibraryInitialized(1), true);
assert.deepEqual(getDocumentProtectedFields("ADMIN"), ["id", "slug"]);
assert.deepEqual(getDocumentProtectedFields("USER"), ["id", "slug", "hidden", "status"]);
assert.deepEqual(sanitizeDocumentForCreate({ ...sampleDocument, hidden: true, status: "draft", deletedAt: "2026-01-01" }, "USER"), {
  ...sampleDocument,
  hidden: false,
  status: "published",
});
assert.deepEqual(sanitizeDocumentForCreate({ ...sampleDocument, hidden: true, status: "draft", deletedAt: "2026-01-01" }, "ADMIN"), {
  ...sampleDocument,
  hidden: true,
  status: "draft",
});

const userUpdatedDocument = applyDocumentUpdatePolicy(sampleDocument, {
  ...sampleDocument,
  id: "malicious-id",
  slug: "malicious-slug",
  type: "SOP",
  tags: ["edited"],
  body: "Edited body",
  status: "draft",
  hidden: true,
  deletedAt: "2026-01-01T00:00:00.000Z",
}, "USER");
assert.equal(userUpdatedDocument.id, sampleDocument.id);
assert.equal(userUpdatedDocument.slug, sampleDocument.slug);
assert.equal(userUpdatedDocument.type, "SOP");
assert.deepEqual(userUpdatedDocument.tags, ["edited"]);
assert.equal(userUpdatedDocument.body, "Edited body");
assert.equal(userUpdatedDocument.status, "published");
assert.equal(userUpdatedDocument.hidden, false);
assert.equal("deletedAt" in userUpdatedDocument, false);

const adminUpdatedDocument = applyDocumentUpdatePolicy(sampleDocument, { ...sampleDocument, status: "draft", hidden: true }, "ADMIN");
assert.equal(adminUpdatedDocument.status, "draft");
assert.equal(adminUpdatedDocument.hidden, true);

assert.throws(() => normalizeLibraryOperation({ type: "document.create", document: { ...sampleDocument, type: "Unknown" } }), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({ type: "document.create", document: { ...sampleDocument, tags: ["ok", 2] } }), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({ type: "document.create", document: { ...sampleDocument, hidden: "false" } }), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({ type: "document.create", document: { ...sampleDocument, contentElements: [{ type: "topic" }] } }), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({ type: "category.create", category: { id: "bad", name: "", hidden: false } }), (error) => error.statusCode === 400);

assert.deepEqual(normalizeLibraryOperation({
  type: "document.update",
  documentId: "doc-1",
  expectedVersion: 4,
  document: sampleDocument,
}), {
  type: "document.update",
  documentId: "doc-1",
  expectedVersion: 4,
  document: sampleDocument,
});

assert.deepEqual(normalizeLibraryMutationBody({
  operation: "document.update",
  documentId: "doc-1",
  expectedVersion: 4,
  document: sampleDocument,
}), {
  type: "document.update",
  documentId: "doc-1",
  expectedVersion: 4,
  document: sampleDocument,
});

assert.deepEqual(normalizeLibraryMutationBody({
  operation: {
    type: "document.update",
    documentId: "doc-1",
    expectedVersion: 4,
    document: sampleDocument,
  },
}), {
  type: "document.update",
  documentId: "doc-1",
  expectedVersion: 4,
  document: sampleDocument,
});

assert.deepEqual(normalizeLibraryOperation({
  type: "documents.restoreSystemDeleted",
  documentIds: ["doc-1", "doc-2"],
  expectedRevision: 9,
}), {
  type: "documents.restoreSystemDeleted",
  documentIds: ["doc-1", "doc-2"],
  expectedRevision: 9,
});
assert.deepEqual(normalizeLibraryOperation({
  type: "document.purge",
  documentId: "doc-1",
  expectedVersion: 4,
}), {
  type: "document.purge",
  documentId: "doc-1",
  expectedVersion: 4,
});

assert.doesNotThrow(() => requireLibraryOperationPermission("ADMIN", "document.delete"));
assert.doesNotThrow(() => requireLibraryOperationPermission("ADMIN", "document.purge"));
assert.doesNotThrow(() => requireLibraryOperationPermission("ADMIN", "documents.restoreSystemDeleted"));
assert.doesNotThrow(() => requireLibraryOperationPermission("ADMIN", "category.restore"));
assert.doesNotThrow(() => requireLibraryOperationPermission("USER", "document.create"));
assert.doesNotThrow(() => requireLibraryOperationPermission("USER", "document.update"));
assert.throws(() => requireLibraryOperationPermission("USER", "document.delete"), (error) => error.statusCode === 403);
assert.throws(() => requireLibraryOperationPermission("USER", "document.purge"), (error) => error.statusCode === 403);
assert.throws(() => requireLibraryOperationPermission("USER", "documents.restoreSystemDeleted"), (error) => error.statusCode === 403);
assert.throws(() => requireLibraryOperationPermission("VIEWER", "document.update"), (error) => error.statusCode === 403);
assert.throws(() => requireLibraryOperationPermission("USER", "category.update"), (error) => error.statusCode === 403);
assert.throws(() => normalizeLibraryOperation({
  type: "document.update",
  documentId: "doc-1",
  expectedVersion: 1,
  document: { ...sampleDocument, id: "doc-2" },
}), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({
  type: "documents.restoreSystemDeleted",
  documentIds: [],
  expectedRevision: 1,
}), (error) => error.statusCode === 400);
assert.throws(() => normalizeLibraryOperation({
  type: "documents.reorder",
  documentIds: ["doc-1", "doc-1"],
  expectedRevision: 1,
}), (error) => error.statusCode === 400);

const authSource = fs.readFileSync(path.join(__dirname, "..", "api", "_auth.js"), "utf8");
const librarySource = fs.readFileSync(path.join(__dirname, "..", "api", "library-state.js"), "utf8");
assert.match(authSource, /to_regclass\('public\.launchflow_users'\)/, "Auth schema bootstrap must have a read-only ready fast path.");
assert.match(authSource, /pg_advisory_xact_lock/, "Auth schema bootstrap must serialize cross-instance DDL.");
assert.match(authSource, /connection:\s*\{[\s\S]*statement_timeout:\s*10_000[\s\S]*lock_timeout:\s*3_000[\s\S]*idle_in_transaction_session_timeout:\s*10_000/, "Every Postgres connection must enforce database-side query and lock deadlines.");
assert.doesNotMatch(authSource.match(/async function isAuthSchemaReady[\s\S]*?\n}/)?.[0] || "", /SELECT id FROM launchflow_users/, "Auth readiness must not queue behind user-table DDL locks.");
assert.match(librarySource, /isLibrarySchemaReady/, "Library schema bootstrap must check readiness before DDL.");
assert.doesNotMatch(librarySource.match(/module\.exports = async function handler[\s\S]*?\n};/)?.[0] || "", /ensureSchema\(\)/, "Library reads must not run auth DDL bootstrap.");
assert.match(librarySource, /pg_advisory_xact_lock/, "Library schema bootstrap must serialize cross-instance DDL.");
assert.match(librarySource, /SET lock_timeout = '3s'/, "Library requests must bound schema lock waits.");
assert.doesNotMatch(librarySource, /FROM launchflow_users/, "Library requests should trust the signed session payload instead of querying the user table on every refresh.");
assert.match(librarySource, /LIBRARY_DATABASE_TIMEOUT_MS = 12_000/, "The server deadline must remain longer than the database statement timeout.");
assert.match(librarySource.match(/async function mutateLibraryState[\s\S]*?\n}/)?.[0] || "", /read-before-library-mutation[\s\S]*applyLibraryOperation/, "Library mutations must bound their preflight read before applying a write.");
assert.match(librarySource, /typeof promise\?\.cancel === "function"/, "Timed-out Postgres queries must request cancellation.");
assert.doesNotMatch(librarySource, /resetSqlClient\(\)/, "One timed-out Library query must not destroy the shared connection pool used by concurrent requests.");
assert.match(librarySource, /retryable:\s*true/, "Retryable Library database failures must expose a structured 503 response.");
assert.match(librarySource, /requestId[\s\S]*queryStages/, "Library runtime logs must correlate requests with database stages and durations.");
const getLibraryStatePayloadSource = librarySource.match(/async function getLibraryStatePayload[\s\S]*?\n}\n\nasync function getDocumentDeletionAudit/)?.[0] || "";
assert.match(getLibraryStatePayloadSource, /normalized_documents[\s\S]*normalized_categories[\s\S]*document_status/, "Required Library metadata, documents, categories, and document status must come from one consistent snapshot query.");
assert.match(librarySource.match(/async function mutateLibraryState[\s\S]*?\n}/)?.[0] || "", /SELECT revision FROM launchflow_library_meta/, "Mutation preflight must read only the catalog revision instead of rebuilding the full catalog.");
assert.match(librarySource.match(/async function initializeCatalog[\s\S]*?\n}/)?.[0] || "", /COUNT\(\*\) FROM inserted_documents/, "Catalog initialization must consume document inserts before advancing its revision.");
assert.match(librarySource.match(/async function initializeCatalog[\s\S]*?\n}/)?.[0] || "", /COUNT\(\*\) FROM inserted_categories/, "Catalog initialization must consume category inserts before advancing its revision.");
assert.match(librarySource, /summary: String\(req\.query\?\.summary/, "Catalog requests must support compact summary payloads.");
assert.match(librarySource, /const recovery = String\(req\.query\?\.recovery/, "Deleted documents and deletion attribution must be opt-in through an explicit recovery read.");
assert.match(getLibraryStatePayloadSource, /document->>'slug' = \$\{slug\}/, "Reader requests must fetch only the requested full document.");
assert.match(librarySource, /jsonb_typeof\(data_json\) = 'string'/, "Library reads must support legacy string-encoded JSONB records.");
const updateDocumentSource = librarySource.match(/async function updateDocument[\s\S]*?\n}/)?.[0] || "";
const setDocumentDeletedSource = librarySource.match(/async function setDocumentDeleted[\s\S]*?\n}/)?.[0] || "";
const setCategoryDeletedSource = librarySource.match(/async function setCategoryDeleted[\s\S]*?\n}/)?.[0] || "";
const purgeDocumentSource = librarySource.match(/async function purgeDocument[\s\S]*?\n}/)?.[0] || "";
const restoreSystemDeletedSource = librarySource.match(/async function restoreSystemDeletedDocuments[\s\S]*?\n}/)?.[0] || "";
const reorderRecordsSource = librarySource.match(/async function reorderRecords[\s\S]*?\n}/)?.[0] || "";
const replaceCatalogFromBackupSource = librarySource.match(/async function replaceCatalogFromBackup[\s\S]*?\n}/)?.[0] || "";
assert.doesNotMatch(updateDocumentSource, /jsonb_array_elements_text/, "Document updates must not expand a parameterized JSON value as an array.");
assert.match(updateDocumentSource, /jsonb_strip_nulls\(jsonb_build_object/, "Document updates must preserve protected fields with a JSON object patch.");
assert.match(updateDocumentSource, /jsonb_typeof\(data_json\) = 'string'/, "Document updates must normalize legacy string-encoded JSONB records.");
assert.match(setDocumentDeletedSource, /jsonb_typeof\(data_json\) = 'string'/, "Document delete and restore must normalize legacy string-encoded JSONB records.");
assert.match(setCategoryDeletedSource, /jsonb_typeof\(data_json\) = 'string'/, "Category delete and restore must normalize legacy string-encoded JSONB records.");
assert.match(setCategoryDeletedSource, /COUNT\(\*\) FROM launchflow_library_categories WHERE deleted_at IS NULL\) > 1/, "Category deletion must preserve the final active category.");
assert.match(setCategoryDeletedSource, /LAST_ACTIVE_CATEGORY/, "Final-category deletion must return a clear conflict reason.");
assert.match(getLibraryStatePayloadSource, /optional deletion audit unavailable/, "Optional deletion attribution failures must not take the Library offline.");
assert.match(getLibraryStatePayloadSource, /\.catch\(\(error\) =>/, "Library state reads must fail open when optional deletion attribution is unavailable.");
assert.match(getLibraryStatePayloadSource, /includeDeletionAudit/, "Normal catalog reads must not request deletion attribution.");
assert.match(getLibraryStatePayloadSource, /recoveryDocumentCount/, "Catalog reads must expose the recoverable-document count without returning tombstones.");
assert.match(librarySource, /LIBRARY_DELETION_AUDIT_TIMEOUT_MS = 1_500/, "Optional deletion attribution must use a short deadline.");
assert.match(setDocumentDeletedSource, /'source', 'user'/, "Direct document deletes must record user attribution.");
assert.match(setDocumentDeletedSource, /'actorName', \$\{user\.name\}::text/, "Direct deletion audit metadata must cast dynamic text parameters for PostgreSQL.");
assert.match(purgeDocumentSource, /DELETE FROM launchflow_library_documents/, "Permanent deletion must remove the document record.");
assert.match(purgeDocumentSource, /deleted_at IS NOT NULL/, "Only recoverable tombstones may be permanently deleted.");
assert.match(purgeDocumentSource, /Permanent document deletion/, "Permanent deletion must retain a metadata-only audit event.");
assert.match(purgeDocumentSource, /'documentSlug', COALESCE\(changed\.slug, ''\)/, "Permanent deletion audit metadata must retain the slug so stale links can explain the purge.");
assert.match(purgeDocumentSource, /'actorName', \$\{user\.name\}::text/, "Permanent deletion audit metadata must cast dynamic text parameters for PostgreSQL.");
assert.match(restoreSystemDeletedSource, /'system_migration'/, "Bulk recovery must be restricted to migration-deleted documents.");
assert.match(restoreSystemDeletedSource, /'actorName', \$\{user\.name\}::text/, "Bulk recovery audit metadata must cast dynamic text parameters for PostgreSQL.");
assert.match(restoreSystemDeletedSource, /revision = \$\{operation\.expectedRevision\}/, "Bulk recovery must reject stale catalog revisions.");
assert.match(reorderRecordsSource, /Buffer\.from\(id, "utf8"\)\.toString\("base64"\)/, "Reorder must encode ids into a delimiter-safe scalar text parameter.");
assert.match(reorderRecordsSource, /unnest\(string_to_array\(\$\{idsText\}, ','\)\)/, "Reorder must expand its scalar text parameter with ordinality.");
assert.match(reorderRecordsSource, /convert_from\(decode\(encoded_id, 'base64'\), 'UTF8'\)/, "Reorder must decode the exact submitted ids after expansion.");
assert.doesNotMatch(reorderRecordsSource, /jsonb_array_elements_text/, "Reorder must not expand a string-encoded JSON scalar.");
assert.match(reorderRecordsSource, /SELECT id, sort_order FROM input[\s\S]*UNION ALL/, "Reorder must place submitted ids first in the requested order.");
assert.match(reorderRecordsSource, /NOT EXISTS \(SELECT 1 FROM input i WHERE i\.id = [dc]\.id\)/, "Reorder must preserve active records omitted from a client snapshot.");
assert.doesNotMatch(reorderRecordsSource, /COUNT\(\*\) FROM input\) = \(SELECT COUNT\(\*\) FROM launchflow_library_(documents|categories) WHERE/, "Reorder must not reject a valid client order merely because an unrendered active row exists.");
assert.match(reorderRecordsSource, /jsonb_agg\(id ORDER BY sort_order\) FROM ordered/, "Reorder audit details must preserve the complete resulting order without rebinding JSON.");
assert.doesNotMatch(replaceCatalogFromBackupSource, /tombstoned_documents|tombstoned_categories/, "Backup restore must not tombstone records absent from the backup.");
assert.match(replaceCatalogFromBackupSource, /non_destructive_merge/, "Backup restore must record its non-destructive merge mode.");
assert.match(replaceCatalogFromBackupSource, /deleted_at IS NULL\s+AND EXCLUDED\.deleted_at IS NOT NULL/, "Backup restore must never tombstone an active record.");
assert.match(replaceCatalogFromBackupSource, /purge\.operation_type = 'document\.purge'/, "Backup restore must not recreate permanently deleted documents.");
assert.match(replaceCatalogFromBackupSource, /'backupId', \$\{backupId\}::text/, "Backup audit metadata must cast dynamic text parameters for PostgreSQL.");
assert.match(replaceCatalogFromBackupSource, /'initiatorName', \$\{user\.name\}::text/, "Backup initiator audit metadata must cast dynamic text parameters for PostgreSQL.");
assert.match(librarySource, /historicalBackfill/, "Historical migration deletions must receive an idempotent audit backfill.");
assert.match(librarySource, /jsonb_build_object\(/, "Summary responses must project lightweight document metadata instead of full rich content.");
assert.doesNotMatch(librarySource.match(/async function isLibrarySchemaReady[\s\S]*?\n}/)?.[0] || "", /SELECT id FROM launchflow_library_meta/, "Library readiness must not queue behind table DDL locks.");
assert.match(librarySource, /\[library-state\] request failed/, "Library failures must emit structured runtime logs.");

console.log("Library API contract checks passed.");
