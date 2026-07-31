const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const {
  getBearerToken,
  getJsonBody,
  getSql,
  handleApiError,
  normalizeRole,
  sendJson,
  verifyToken,
} = require("./_auth");
const {
  getDocumentProtectedFields,
  isLibraryInitialized,
  normalizeLibraryCategory,
  normalizeLibraryDocument,
  normalizeLibraryMutationBody,
  normalizeLibraryState,
  requireLibraryOperationPermission,
  sanitizeDocumentForCreate,
} = require("./_library-contract");

const SHARED_LIBRARY_ID = "shared";
const LIBRARY_DELETION_BACKFILL_MARKER_ID = "library_audit_backfill_deletions_v1";
const LIBRARY_BACKUP_LIMIT = 100;
const LIBRARY_DATABASE_TIMEOUT_MS = 12_000;
const LIBRARY_DELETION_AUDIT_TIMEOUT_MS = 1_500;
const LIBRARY_INTEGRITY_TIMEOUT_MS = 6_000;
const LIBRARY_MAINTENANCE_USER = Object.freeze({
  email: "system@glassco.library",
  name: "Library Protection",
  role: "ADMIN",
});
const DESTRUCTIVE_LIBRARY_OPERATIONS = new Set([
  "document.delete",
  "document.archive",
  "document.purge",
  "category.delete",
  "category.archive",
  "documents.restoreSystemDeleted",
  "records.restoreFromSnapshot",
]);
const libraryRequestStorage = new AsyncLocalStorage();
let librarySchemaReadyPromise;
let libraryDeletionAuditBackfillPromise;

module.exports = function handler(req, res) {
  const requestId = String(req.headers?.["x-request-id"] || crypto.randomUUID());
  const context = {
    requestId,
    method: req.method,
    operation: undefined,
    startedAt: Date.now(),
    queryStages: [],
  };
  res.setHeader("X-Request-ID", requestId);
  return libraryRequestStorage.run(context, async () => {
    try {
      if (String(req.query?.maintenance || "") === "1") {
        context.operation = "library.maintenance";
        requireLibraryMaintenanceSecret(req);
        await ensureLibrarySchema();
        return await runLibraryMaintenance(res);
      }
      const user = requireLibraryUser(req);
      await ensureLibrarySchema();

      if (req.method === "GET" && req.query?.backups === "1") return await listLibraryBackups(res, user);
      if (req.method === "GET" && req.query?.backupId) return await getLibraryBackup(res, user, req.query.backupId);
      if (req.method === "GET" && req.query?.versions === "1") return await listLibraryVersions(req, res, user);
      if (req.method === "GET" && req.query?.incidents === "1") return await listLibraryIntegrityIncidents(res, user);
      if (req.method === "GET") {
        const readOptions = getLibraryReadOptions(req);
        context.operation = readOptions.recovery
          ? "library.read.recovery"
          : readOptions.slug
            ? "library.read.document"
            : "library.read.catalog";
        return await sendLibraryState(res, 200, {}, readOptions, user);
      }
      if (req.method === "PATCH") return await mutateLibraryState(req, res, user);
      if (req.method === "POST") return await handleLibraryBackupAction(req, res, user);

      res.setHeader("Allow", "GET, PATCH, POST");
      return sendJson(res, 405, { error: "Method not allowed." });
    } catch (error) {
      console.error("[library-state] request failed", {
        requestId,
        method: req.method,
        operation: context.operation,
        durationMs: Date.now() - context.startedAt,
        queryStages: context.queryStages,
        stage: error?.stage,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      });
      if (error?.code === "23505" && [
        "launchflow_library_documents_pkey",
        "launchflow_library_documents_slug_idx",
        "launchflow_library_categories_pkey",
      ].includes(error?.constraint)) {
        error.statusCode = 409;
        error.message = "A Library record with that id or slug already exists.";
      }
      if ([
        "55P03",
        "57014",
        "CONNECTION_DESTROYED",
        "CONNECTION_CLOSED",
        "ECONNRESET",
        "ETIMEDOUT",
      ].includes(error?.code)) error.statusCode = 503;
      if (error?.statusCode === 503) {
        return sendJson(res, 503, {
          error: error.message || "The shared Library is temporarily unavailable.",
          code: error.code || "LIBRARY_DATABASE_UNAVAILABLE",
          stage: error.stage || "database",
          retryable: true,
          requestId,
        });
      }
      return handleApiError(res, error);
    } finally {
      console.info("[library-state] request completed", {
        requestId,
        method: req.method,
        operation: context.operation,
        statusCode: res.statusCode,
        durationMs: Date.now() - context.startedAt,
        queryStages: context.queryStages,
      });
    }
  });
};

function withLibraryDatabaseDeadline(promise, stage, timeoutMs = LIBRARY_DATABASE_TIMEOUT_MS) {
  const context = libraryRequestStorage.getStore();
  const startedAt = Date.now();
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (stage === "verify-schema") librarySchemaReadyPromise = null;
      const error = new Error("The shared Library database did not respond in time. Please retry.");
      error.code = "LIBRARY_DATABASE_TIMEOUT";
      error.statusCode = 503;
      error.stage = stage;
      const cancellationSupported = typeof promise?.cancel === "function";
      if (cancellationSupported) {
        Promise.resolve(promise.cancel()).then(
          () => console.warn("[library-state] timed-out query cancelled", {
            requestId: context?.requestId,
            operation: context?.operation,
            stage,
            durationMs: Date.now() - startedAt,
          }),
          (cancelError) => console.error("[library-state] timed-out query cancellation failed", {
            requestId: context?.requestId,
            operation: context?.operation,
            stage,
            durationMs: Date.now() - startedAt,
            message: cancelError?.message,
          }),
        );
      }
      console.error("[library-state] database deadline exceeded", {
        requestId: context?.requestId,
        operation: context?.operation,
        stage,
        durationMs: Date.now() - startedAt,
        cancellation: cancellationSupported ? "requested" : "unsupported",
      });
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, deadline]).then(
    (value) => {
      context?.queryStages.push({ stage, durationMs: Date.now() - startedAt, status: "ok" });
      return value;
    },
    (error) => {
      context?.queryStages.push({
        stage,
        durationMs: Date.now() - startedAt,
        status: error?.code === "LIBRARY_DATABASE_TIMEOUT" ? "timeout" : "error",
      });
      throw error;
    },
  ).finally(() => clearTimeout(timeoutId));
}

function createDeadlineSql(client, stage) {
  return (strings, ...values) => withLibraryDatabaseDeadline(client(strings, ...values), stage);
}

function requireLibraryUser(req) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload?.email) {
    const error = new Error("Library login required.");
    error.statusCode = 401;
    throw error;
  }
  return {
    email: String(payload.email).trim().toLowerCase(),
    name: String(payload.name || ""),
    role: normalizeRole(payload.role),
  };
}

function safeSecretMatches(left, right) {
  const expected = Buffer.from(String(right || ""), "utf8");
  const actual = Buffer.from(String(left || ""), "utf8");
  return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function requireLibraryMaintenanceSecret(req) {
  const configured = String(process.env.LIBRARY_BACKUP_SECRET || "");
  const authorization = String(req.headers?.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const supplied = String(req.headers?.["x-library-backup-secret"] || bearer);
  if (!safeSecretMatches(supplied, configured)) {
    const error = new Error("Library maintenance authorization failed.");
    error.statusCode = 401;
    throw error;
  }
}

async function ensureLibrarySchema() {
  if (!librarySchemaReadyPromise) {
    librarySchemaReadyPromise = ensureLibrarySchemaInternal()
      .then(() => ensureLibraryDeletionAuditBackfill())
      .catch((error) => {
        librarySchemaReadyPromise = null;
        libraryDeletionAuditBackfillPromise = null;
        if (error?.code === "55P03" || error?.code === "57014") error.statusCode = 503;
        throw error;
      });
  }
  return librarySchemaReadyPromise;
}

async function ensureLibraryDeletionAuditBackfill() {
  if (libraryDeletionAuditBackfillPromise) return libraryDeletionAuditBackfillPromise;
  libraryDeletionAuditBackfillPromise = (async () => {
    const sql = getSql();
    const query = createDeadlineSql(sql, "backfill-library-deletion-audit");
    const markerRows = await query`
      SELECT id
      FROM launchflow_library_audit
      WHERE id = ${LIBRARY_DELETION_BACKFILL_MARKER_ID}
      LIMIT 1
    `;
    if (markerRows.length) return;
    await query`
      WITH initialization AS (
        SELECT actor_email, actor_role, resulting_revision, created_at
        FROM launchflow_library_audit
        WHERE operation_type = 'catalog.initialize'
          AND created_at >= '2026-07-22T00:00:00.000Z'::timestamptz
          AND created_at < '2026-07-23T00:00:00.000Z'::timestamptz
        ORDER BY created_at ASC
        LIMIT 1
      ), matching_timestamps AS (
        SELECT d.deleted_at
        FROM launchflow_library_documents d
        CROSS JOIN initialization initialization_event
        WHERE d.deleted_at IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (d.created_at - initialization_event.created_at))) <= 600
          AND ABS(EXTRACT(EPOCH FROM (d.deleted_at - initialization_event.created_at))) <= 600
        GROUP BY d.deleted_at
        HAVING COUNT(*) >= 2
      ), candidates AS (
        SELECT d.id, d.deleted_at, initialization_event.actor_email,
          initialization_event.actor_role, initialization_event.resulting_revision
        FROM launchflow_library_documents d
        INNER JOIN matching_timestamps timestamp_group ON timestamp_group.deleted_at = d.deleted_at
        CROSS JOIN initialization initialization_event
        WHERE NOT EXISTS (
          SELECT 1
          FROM launchflow_library_audit existing
          WHERE existing.record_type = 'document'
            AND existing.record_id = d.id
            AND existing.operation_type IN ('document.delete', 'document.system_delete')
        )
      )
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json, created_at
      )
      SELECT
        'library_audit_backfill_migration_' || md5(id || deleted_at::text),
        'document.system_delete',
        'document',
        id,
        actor_email,
        actor_role,
        resulting_revision,
        jsonb_build_object(
          'source', 'system_migration',
          'reason', 'Initial Library cleanup',
          'initiatorEmail', actor_email,
          'initiatorRole', actor_role,
          'historicalBackfill', true
        ),
        deleted_at
      FROM candidates
      ON CONFLICT (id) DO NOTHING
    `;
    await query`
      WITH candidates AS (
        SELECT DISTINCT ON (document.id)
          document.id,
          document.deleted_at,
          restore.actor_email,
          restore.actor_role,
          restore.resulting_revision,
          restore.details_json
        FROM launchflow_library_documents document
        INNER JOIN launchflow_library_audit restore
          ON restore.operation_type = 'backup.restore'
          AND ABS(EXTRACT(EPOCH FROM (document.deleted_at - restore.created_at))) <= 120
        WHERE document.deleted_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM launchflow_library_audit existing
            WHERE existing.record_type = 'document'
              AND existing.record_id = document.id
              AND existing.operation_type IN ('document.delete', 'document.system_delete')
          )
        ORDER BY document.id, ABS(EXTRACT(EPOCH FROM (document.deleted_at - restore.created_at))) ASC
      )
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json, created_at
      )
      SELECT
        'library_audit_backfill_backup_' || md5(id || deleted_at::text),
        'document.system_delete',
        'document',
        id,
        actor_email,
        actor_role,
        resulting_revision,
        jsonb_build_object(
          'source', 'system_backup_restore',
          'reason', 'Backup restore',
          'backupId', details_json->>'backupId',
          'initiatorName', COALESCE(details_json->>'initiatorName', ''),
          'initiatorEmail', actor_email,
          'initiatorRole', actor_role,
          'historicalBackfill', true
        ),
        deleted_at
      FROM candidates
      ON CONFLICT (id) DO NOTHING
    `;
    await query`
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT
        ${LIBRARY_DELETION_BACKFILL_MARKER_ID},
        'audit.backfill',
        'catalog',
        ${SHARED_LIBRARY_ID},
        'system',
        'SYSTEM',
        revision,
        jsonb_build_object(
          'migrationDate', '2026-07-22',
          'sources', jsonb_build_array('system_migration', 'system_backup_restore'),
          'idempotent', true
        )
      FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID}
      ON CONFLICT (id) DO NOTHING
    `;
  })();
  return libraryDeletionAuditBackfillPromise;
}

async function ensureLibrarySchemaInternal() {
  const sql = getSql();
  const schemaSql = createDeadlineSql(sql, "verify-schema");
  if (typeof sql.begin === "function") {
    await schemaSql`SET statement_timeout = '10s'`;
    await schemaSql`SET lock_timeout = '3s'`;
  }
  if (await isLibrarySchemaReady(sql)) {
    await ensureLibraryProtectionSchema(sql);
    return;
  }

  const bootstrap = async (client) => {
    const query = createDeadlineSql(client, "verify-schema");
    if (await isLibrarySchemaReady(client)) return;
    await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_meta (
      id TEXT PRIMARY KEY,
      revision BIGINT NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ
    )
  `;
    await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_documents (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      record_version BIGINT NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_categories (
      id TEXT PRIMARY KEY,
      data_json JSONB NOT NULL,
      record_version BIGINT NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_backups (
      id TEXT PRIMARY KEY,
      state_json JSONB NOT NULL,
      source_revision BIGINT NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT 'manual-backup',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      state_size INTEGER NOT NULL DEFAULT 0,
      is_manual BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;
    await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_audit (
      id TEXT PRIMARY KEY,
      operation_type TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT '',
      record_id TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      resulting_revision BIGINT NOT NULL,
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    await query`CREATE INDEX IF NOT EXISTS launchflow_library_documents_order_idx ON launchflow_library_documents (sort_order, created_at)`;
    await query`CREATE UNIQUE INDEX IF NOT EXISTS launchflow_library_documents_slug_idx ON launchflow_library_documents ((data_json->>'slug'))`;
    await query`CREATE INDEX IF NOT EXISTS launchflow_library_categories_order_idx ON launchflow_library_categories (sort_order, created_at)`;
    await query`CREATE INDEX IF NOT EXISTS launchflow_library_backups_created_idx ON launchflow_library_backups (created_at DESC)`;
    await query`CREATE INDEX IF NOT EXISTS launchflow_library_audit_created_idx ON launchflow_library_audit (created_at DESC)`;
    await query`
    INSERT INTO launchflow_library_meta (id, revision)
    VALUES (${SHARED_LIBRARY_ID}, 0)
    ON CONFLICT (id) DO NOTHING
  `;
  };

  if (typeof sql.begin === "function") {
    await withLibraryDatabaseDeadline(sql.begin(async (transaction) => {
      const query = createDeadlineSql(transaction, "verify-schema");
      await query`SET LOCAL lock_timeout = '3s'`;
      await query`SET LOCAL statement_timeout = '10s'`;
      await query`SELECT pg_advisory_xact_lock(hashtext('launchflow_library_schema_v1'))`;
    await bootstrap(transaction);
    await ensureLibraryProtectionSchema(transaction);
    }), "verify-schema");
    return;
  }

  await bootstrap(sql);
  await ensureLibraryProtectionSchema(sql);
}

async function ensureLibraryProtectionSchema(client) {
  const query = createDeadlineSql(client, "verify-protection-schema");
  await query`ALTER TABLE launchflow_library_documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await query`ALTER TABLE launchflow_library_categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await query`ALTER TABLE launchflow_library_meta ADD COLUMN IF NOT EXISTS catalog_checksum TEXT NOT NULL DEFAULT ''`;
  await query`ALTER TABLE launchflow_library_meta ADD COLUMN IF NOT EXISTS active_document_count INTEGER NOT NULL DEFAULT 0`;
  await query`ALTER TABLE launchflow_library_meta ADD COLUMN IF NOT EXISTS deleted_document_count INTEGER NOT NULL DEFAULT 0`;
  await query`ALTER TABLE launchflow_library_meta ADD COLUMN IF NOT EXISTS archived_document_count INTEGER NOT NULL DEFAULT 0`;
  await query`ALTER TABLE launchflow_library_backups ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT ''`;
  await query`ALTER TABLE launchflow_library_backups ADD COLUMN IF NOT EXISTS snapshot_type TEXT NOT NULL DEFAULT 'manual'`;
  await query`ALTER TABLE launchflow_library_backups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete'`;
  await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_versions (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_version BIGINT NOT NULL,
      catalog_revision BIGINT NOT NULL DEFAULT 0,
      lifecycle_state TEXT NOT NULL DEFAULT 'active',
      data_json JSONB NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      operation_type TEXT NOT NULL DEFAULT '',
      operation_source TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL DEFAULT '',
      trusted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await query`ALTER TABLE launchflow_library_versions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await query`ALTER TABLE launchflow_library_versions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await query`
    CREATE TABLE IF NOT EXISTS launchflow_library_integrity_incidents (
      id TEXT PRIMARY KEY,
      incident_type TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT '',
      record_id TEXT NOT NULL DEFAULT '',
      detected_checksum TEXT NOT NULL DEFAULT '',
      restored_version_id TEXT NOT NULL DEFAULT '',
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await query`CREATE INDEX IF NOT EXISTS launchflow_library_versions_record_idx ON launchflow_library_versions (record_type, record_id, created_at DESC)`;
  await query`CREATE INDEX IF NOT EXISTS launchflow_library_versions_trusted_idx ON launchflow_library_versions (record_type, record_id, trusted, created_at DESC)`;
  await query`CREATE INDEX IF NOT EXISTS launchflow_library_incidents_created_idx ON launchflow_library_integrity_incidents (created_at DESC)`;
  await query`
    CREATE OR REPLACE FUNCTION launchflow_library_record_lifecycle(
      deleted_at_value TIMESTAMPTZ,
      archived_at_value TIMESTAMPTZ
    )
    RETURNS TEXT
    LANGUAGE SQL
    IMMUTABLE
    AS $$
      SELECT CASE
        WHEN archived_at_value IS NOT NULL THEN 'archived'
        WHEN deleted_at_value IS NOT NULL THEN 'deleted'
        ELSE 'active'
      END
    $$
  `;
  await query`
    CREATE OR REPLACE FUNCTION launchflow_library_block_physical_delete()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'Library records cannot be physically deleted; move them to the protected archive instead.'
        USING ERRCODE = 'P0001';
    END
    $$
  `;
  await query`
    CREATE OR REPLACE FUNCTION launchflow_library_guard_lifecycle()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      operation TEXT := COALESCE(current_setting('launchflow.library_operation', true), '');
    BEGIN
      IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
        OR OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
        IF operation NOT IN (
          'document.delete', 'document.restore', 'document.archive', 'document.purge',
          'document.restoreArchived', 'category.delete', 'category.restore', 'category.archive',
          'record.restoreVersion', 'records.restoreFromSnapshot',
          'documents.restoreSystemDeleted', 'backup.restore'
        ) THEN
          RAISE EXCEPTION 'Unauthorized Library lifecycle change.'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
      RETURN NEW;
    END
    $$
  `;
  await query`
    CREATE OR REPLACE FUNCTION launchflow_library_journal_change()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      operation TEXT := COALESCE(NULLIF(current_setting('launchflow.library_operation', true), ''), 'unknown');
      source TEXT := COALESCE(NULLIF(current_setting('launchflow.library_source', true), ''), 'unknown');
      actor_email_value TEXT := COALESCE(current_setting('launchflow.library_actor_email', true), '');
      actor_role_value TEXT := COALESCE(current_setting('launchflow.library_actor_role', true), '');
      request_id_value TEXT := COALESCE(current_setting('launchflow.library_request_id', true), '');
      record_type_value TEXT := CASE WHEN TG_TABLE_NAME = 'launchflow_library_documents' THEN 'document' ELSE 'category' END;
      revision_value BIGINT := COALESCE((SELECT revision FROM launchflow_library_meta WHERE id = 'shared'), 0);
      lifecycle_value TEXT := launchflow_library_record_lifecycle(NEW.deleted_at, NEW.archived_at);
      normalized_json JSONB := CASE WHEN jsonb_typeof(NEW.data_json) = 'string' THEN (NEW.data_json #>> '{}')::jsonb ELSE NEW.data_json END;
      checksum_value TEXT;
      trusted_value BOOLEAN := source IN ('api', 'maintenance', 'migration', 'backup');
    BEGIN
      checksum_value := md5(normalized_json::text || '|' || NEW.sort_order::text || '|' || lifecycle_value);
      INSERT INTO launchflow_library_versions (
        id, record_type, record_id, record_version, catalog_revision, lifecycle_state,
        data_json, sort_order, deleted_at, archived_at, operation_type, operation_source, actor_email, actor_role,
        request_id, checksum, trusted
      ) VALUES (
        'library_version_' || md5(record_type_value || NEW.id || NEW.record_version::text || clock_timestamp()::text || random()::text),
        record_type_value, NEW.id, NEW.record_version, revision_value, lifecycle_value,
        normalized_json, NEW.sort_order, NEW.deleted_at, NEW.archived_at, operation, source, actor_email_value, actor_role_value,
        request_id_value, checksum_value, trusted_value
      );
      IF trusted_value THEN
        UPDATE launchflow_library_meta
        SET catalog_checksum = md5(
              COALESCE((SELECT string_agg(id || ':' || record_version::text || ':' || COALESCE(deleted_at::text, '') || ':' || COALESCE(archived_at::text, ''), '|' ORDER BY id) FROM launchflow_library_documents), '')
              || '#'
              || COALESCE((SELECT string_agg(id || ':' || record_version::text || ':' || COALESCE(deleted_at::text, '') || ':' || COALESCE(archived_at::text, ''), '|' ORDER BY id) FROM launchflow_library_categories), '')
            ),
            active_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE deleted_at IS NULL AND archived_at IS NULL),
            deleted_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE deleted_at IS NOT NULL AND archived_at IS NULL),
            archived_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE archived_at IS NOT NULL)
        WHERE id = 'shared';
      END IF;
      RETURN NEW;
    END
    $$
  `;
  await query`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_documents_no_delete'
          AND tgrelid = 'launchflow_library_documents'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_documents_no_delete
          BEFORE DELETE ON launchflow_library_documents
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_block_physical_delete();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_categories_no_delete'
          AND tgrelid = 'launchflow_library_categories'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_categories_no_delete
          BEFORE DELETE ON launchflow_library_categories
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_block_physical_delete();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_documents_lifecycle_guard'
          AND tgrelid = 'launchflow_library_documents'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_documents_lifecycle_guard
          BEFORE UPDATE ON launchflow_library_documents
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_guard_lifecycle();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_categories_lifecycle_guard'
          AND tgrelid = 'launchflow_library_categories'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_categories_lifecycle_guard
          BEFORE UPDATE ON launchflow_library_categories
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_guard_lifecycle();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_documents_journal'
          AND tgrelid = 'launchflow_library_documents'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_documents_journal
          AFTER INSERT OR UPDATE ON launchflow_library_documents
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_journal_change();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'launchflow_library_categories_journal'
          AND tgrelid = 'launchflow_library_categories'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER launchflow_library_categories_journal
          AFTER INSERT OR UPDATE ON launchflow_library_categories
          FOR EACH ROW EXECUTE FUNCTION launchflow_library_journal_change();
      END IF;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$
  `;
  await query`
    INSERT INTO launchflow_library_versions (
      id, record_type, record_id, record_version, catalog_revision, lifecycle_state,
      data_json, sort_order, deleted_at, archived_at, operation_type, operation_source, actor_email, actor_role,
      request_id, checksum, trusted, created_at
    )
    SELECT
      'library_baseline_document_' || md5(document.id),
      'document',
      document.id,
      document.record_version,
      meta.revision,
      launchflow_library_record_lifecycle(document.deleted_at, document.archived_at),
      CASE WHEN jsonb_typeof(document.data_json) = 'string' THEN (document.data_json #>> '{}')::jsonb ELSE document.data_json END,
      document.sort_order,
      document.deleted_at,
      document.archived_at,
      'baseline.backfill',
      'migration',
      document.updated_by,
      'ADMIN',
      'schema-backfill',
      md5((CASE WHEN jsonb_typeof(document.data_json) = 'string' THEN (document.data_json #>> '{}')::jsonb ELSE document.data_json END)::text || '|' || document.sort_order::text || '|' || launchflow_library_record_lifecycle(document.deleted_at, document.archived_at)),
      TRUE,
      document.updated_at
    FROM launchflow_library_documents document
    CROSS JOIN launchflow_library_meta meta
    WHERE meta.id = ${SHARED_LIBRARY_ID}
      AND NOT EXISTS (
        SELECT 1 FROM launchflow_library_versions version
        WHERE version.record_type = 'document' AND version.record_id = document.id AND version.trusted
      )
    ON CONFLICT (id) DO NOTHING
  `;
  await query`
    INSERT INTO launchflow_library_versions (
      id, record_type, record_id, record_version, catalog_revision, lifecycle_state,
      data_json, sort_order, deleted_at, archived_at, operation_type, operation_source, actor_email, actor_role,
      request_id, checksum, trusted, created_at
    )
    SELECT
      'library_baseline_category_' || md5(category.id),
      'category',
      category.id,
      category.record_version,
      meta.revision,
      launchflow_library_record_lifecycle(category.deleted_at, category.archived_at),
      CASE WHEN jsonb_typeof(category.data_json) = 'string' THEN (category.data_json #>> '{}')::jsonb ELSE category.data_json END,
      category.sort_order,
      category.deleted_at,
      category.archived_at,
      'baseline.backfill',
      'migration',
      category.updated_by,
      'ADMIN',
      'schema-backfill',
      md5((CASE WHEN jsonb_typeof(category.data_json) = 'string' THEN (category.data_json #>> '{}')::jsonb ELSE category.data_json END)::text || '|' || category.sort_order::text || '|' || launchflow_library_record_lifecycle(category.deleted_at, category.archived_at)),
      TRUE,
      category.updated_at
    FROM launchflow_library_categories category
    CROSS JOIN launchflow_library_meta meta
    WHERE meta.id = ${SHARED_LIBRARY_ID}
      AND NOT EXISTS (
        SELECT 1 FROM launchflow_library_versions version
        WHERE version.record_type = 'category' AND version.record_id = category.id AND version.trusted
      )
    ON CONFLICT (id) DO NOTHING
  `;
  await query`
    UPDATE launchflow_library_meta
    SET catalog_checksum = md5(
          COALESCE((SELECT string_agg(id || ':' || record_version::text || ':' || COALESCE(deleted_at::text, '') || ':' || COALESCE(archived_at::text, ''), '|' ORDER BY id) FROM launchflow_library_documents), '')
          || '#'
          || COALESCE((SELECT string_agg(id || ':' || record_version::text || ':' || COALESCE(deleted_at::text, '') || ':' || COALESCE(archived_at::text, ''), '|' ORDER BY id) FROM launchflow_library_categories), '')
        ),
        active_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE deleted_at IS NULL AND archived_at IS NULL),
        deleted_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE deleted_at IS NOT NULL AND archived_at IS NULL),
        archived_document_count = (SELECT COUNT(*) FROM launchflow_library_documents WHERE archived_at IS NOT NULL)
    WHERE id = ${SHARED_LIBRARY_ID}
  `;
}

async function isLibrarySchemaReady(sql) {
  const rows = await withLibraryDatabaseDeadline(sql`
    SELECT
      to_regclass('public.launchflow_library_meta')::text AS meta,
      to_regclass('public.launchflow_library_documents')::text AS documents,
      to_regclass('public.launchflow_library_categories')::text AS categories,
      to_regclass('public.launchflow_library_backups')::text AS backups,
      to_regclass('public.launchflow_library_audit')::text AS audit,
      to_regclass('public.launchflow_library_versions')::text AS versions,
      to_regclass('public.launchflow_library_integrity_incidents')::text AS incidents
  `, "verify-schema");
  const relations = rows[0] || {};
  return Boolean(relations.meta && relations.documents && relations.categories && relations.backups && relations.audit && relations.versions && relations.incidents);
}

function parseJsonRecord(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function unwrapLibraryRecordEnvelope(value, envelopeKeys = []) {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    current = parseJsonRecord(current);
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const envelopeKey = envelopeKeys.find((key) => Object.prototype.hasOwnProperty.call(current, key));
    if (!envelopeKey) return current;
    current = current[envelopeKey];
  }
  return null;
}

function getLibraryReadOptions(req) {
  const slugValue = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const recovery = String(req.query?.recovery || "") === "1";
  const archive = String(req.query?.archive || "") === "1";
  return {
    summary: String(req.query?.summary || "") === "1",
    slug: typeof slugValue === "string" ? slugValue.trim() : "",
    recovery,
    archive,
    includeDeleted: recovery,
    includeArchived: archive,
    includeDeletionAudit: recovery || String(req.query?.includeDeletionAudit || "") === "1",
    integrityPreview: String(req.query?.integrityPreview || "") === "1",
  };
}

function normalizeSnapshotEntries(value) {
  const entries = Array.isArray(value) ? value : parseJsonRecord(value);
  return Array.isArray(entries) ? entries : [];
}

function libraryReadIntegrityError(message, stage) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = "LIBRARY_CATALOG_INCOMPLETE";
  error.stage = stage;
  return error;
}

function inspectLibraryVersionRecord(row, recordType, recordId) {
  const envelopeKeys = recordType === "document" ? ["dataJson", "document"] : ["dataJson", "category"];
  const rawData = unwrapLibraryRecordEnvelope(row?.data_json, envelopeKeys);
  try {
    const normalized = recordType === "document"
      ? normalizeLibraryDocument({ ...rawData, id: recordId })
      : normalizeLibraryCategory({ ...rawData, id: recordId });
    return {
      data: normalized,
      restorable: true,
      validationErrorCode: null,
    };
  } catch {
    return {
      data: rawData && typeof rawData === "object" && !Array.isArray(rawData) ? rawData : {},
      restorable: false,
      validationErrorCode: "SCHEMA_VALIDATION_FAILED",
    };
  }
}

function serializeLibraryVersionRow(row) {
  const recordType = String(row.record_type || "");
  const recordId = String(row.record_id || "");
  const inspected = inspectLibraryVersionRecord(row, recordType, recordId);
  return {
    id: row.id,
    recordType,
    recordId,
    recordVersion: Number(row.record_version || 0),
    catalogRevision: Number(row.catalog_revision || 0),
    lifecycleState: row.lifecycle_state,
    data: inspected.data,
    sortOrder: Number(row.sort_order || 0),
    deletedAt: row.deleted_at,
    archivedAt: row.archived_at,
    operationType: row.operation_type,
    operationSource: row.operation_source,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    requestId: row.request_id,
    checksum: row.checksum,
    trusted: Boolean(row.trusted),
    restorable: inspected.restorable,
    validationErrorCode: inspected.validationErrorCode,
    createdAt: row.created_at,
  };
}

async function getLatestRestorableDocumentVersions(documentIds, stage) {
  if (!documentIds.length) return new Map();
  const sql = getSql();
  const documentIdsText = documentIds
    .map((id) => Buffer.from(String(id), "utf8").toString("base64"))
    .join(",");
  const rows = await withLibraryDatabaseDeadline(sql`
    SELECT id, record_type, record_id, record_version, catalog_revision, lifecycle_state,
      data_json, sort_order, deleted_at, archived_at, operation_type, operation_source, actor_email, actor_role,
      request_id, checksum, trusted, created_at
    FROM launchflow_library_versions
    WHERE record_type = 'document'
      AND record_id IN (
        SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8')
        FROM unnest(string_to_array(${documentIdsText}, ',')) AS requested(encoded_id)
        WHERE encoded_id <> ''
      )
    ORDER BY record_id ASC, record_version DESC, created_at DESC, id DESC
  `, stage);
  const selected = new Map();
  for (const row of rows) {
    if (selected.has(row.record_id)) continue;
    const version = serializeLibraryVersionRow(row);
    if (version.restorable) selected.set(row.record_id, version);
  }
  return selected;
}

function createSafeLibraryDocumentSummary(value, row) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const topics = Array.isArray(source.topics) && source.topics.every((topic) => topic
    && typeof topic === "object"
    && !Array.isArray(topic)
    && typeof topic.id === "string"
    && typeof topic.title === "string"
    && typeof topic.level === "number"
    && Number.isFinite(topic.level))
    ? source.topics
    : [];
  const updatedAt = typeof source.updatedAt === "string"
    ? source.updatedAt
    : String(row.rowUpdatedAt || row.rowCreatedAt || new Date(0).toISOString());
  return normalizeLibraryDocument({
    id: String(row.id),
    slug: typeof source.slug === "string" && source.slug.trim() ? source.slug.trim() : String(row.id),
    title: typeof source.title === "string" && source.title.trim() ? source.title : "Untitled document",
    description: typeof source.description === "string" ? source.description : "",
    category: typeof source.category === "string" && source.category.trim() ? source.category : "Uncategorized",
    type: ["Guide", "SOP", "Checklist", "Template", "Playbook"].includes(source.type) ? source.type : "Guide",
    tags: Array.isArray(source.tags) && source.tags.every((tag) => typeof tag === "string") ? source.tags : [],
    updatedAt,
    status: ["published", "draft"].includes(source.status) ? source.status : "published",
    hidden: source.hidden === true,
    readingMinutes: typeof source.readingMinutes === "number"
      && Number.isFinite(source.readingMinutes)
      && source.readingMinutes >= 0
      ? source.readingMinutes
      : 0,
    body: "",
    topics,
    ...(row.rowDeletedAt ? { deletedAt: String(row.rowDeletedAt) } : {}),
    ...(row.rowArchivedAt ? { archivedAt: String(row.rowArchivedAt) } : {}),
  });
}

function normalizeDocumentManifest(entries, stage) {
  const seenIds = new Set();
  return entries.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw libraryReadIntegrityError("The Library record manifest is malformed.", stage);
    }
    const id = String(value.id || "").trim();
    const slug = String(value.slug || "").trim();
    const recordVersion = Number(value.recordVersion);
    const lifecycleState = String(value.lifecycleState || "");
    if (!id || !slug || !Number.isSafeInteger(recordVersion) || recordVersion < 1
      || !["active", "deleted", "archived"].includes(lifecycleState)
      || typeof value.hidden !== "boolean"
      || !["published", "draft"].includes(String(value.status || ""))
      || seenIds.has(id)) {
      throw libraryReadIntegrityError("The Library record manifest is incomplete.", stage);
    }
    seenIds.add(id);
    return {
      id,
      slug,
      recordVersion,
      lifecycleState,
      hidden: value.hidden,
      status: String(value.status),
    };
  });
}

async function getLibraryStatePayload({
  summary = false,
  slug = "",
  recovery = false,
  archive = false,
  includeDeleted = false,
  includeArchived = false,
  includeDeletionAudit = false,
  integrityPreview = false,
} = {}, stage = "read-library-state", user = null) {
  const sql = getSql();
  const snapshotStage = `${stage}-${archive ? "archive" : recovery ? "recovery" : slug ? "document" : summary ? "catalog" : "full"}-snapshot`;
  const rows = await withLibraryDatabaseDeadline(sql`
    WITH raw_documents AS (
      SELECT id, record_version, sort_order, created_at, updated_at, deleted_at, archived_at,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS raw_document
      FROM launchflow_library_documents
    ), normalized_documents AS (
      SELECT id, record_version, sort_order, created_at, updated_at, deleted_at, archived_at,
        CASE
          WHEN jsonb_typeof(raw_document->'dataJson') = 'object' THEN raw_document->'dataJson'
          WHEN jsonb_typeof(raw_document->'document') = 'object' THEN raw_document->'document'
          ELSE raw_document
        END AS document
      FROM raw_documents
    ), selected_documents AS (
      SELECT id, record_version, sort_order, created_at, updated_at, deleted_at, archived_at, document
      FROM normalized_documents
      WHERE (
          (${Boolean(archive)}::boolean AND archived_at IS NOT NULL)
          OR (
            NOT ${Boolean(archive)}::boolean
            AND (${Boolean(includeArchived)}::boolean OR archived_at IS NULL)
            AND (
              ${Boolean(includeDeleted)}::boolean
              OR (deleted_at IS NULL AND archived_at IS NULL)
            )
          )
        )
        AND (${slug}::text = '' OR COALESCE(NULLIF(document->>'slug', ''), id) = ${slug})
    ), raw_categories AS (
      SELECT id, record_version, sort_order, created_at, deleted_at, archived_at,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS raw_category
      FROM launchflow_library_categories
      WHERE archived_at IS NULL
    ), normalized_categories AS (
      SELECT id, record_version, sort_order, created_at, deleted_at, archived_at,
        CASE
          WHEN jsonb_typeof(raw_category->'dataJson') = 'object' THEN raw_category->'dataJson'
          WHEN jsonb_typeof(raw_category->'category') = 'object' THEN raw_category->'category'
          ELSE raw_category
        END AS category
      FROM raw_categories
    ), latest_purge AS (
      SELECT audit.record_id, audit.details_json, audit.created_at
      FROM launchflow_library_audit audit
      WHERE ${slug}::text <> ''
        AND audit.record_type = 'document'
        AND audit.operation_type = 'document.purge'
        AND audit.details_json->>'documentSlug' = ${slug}
      ORDER BY audit.created_at DESC
      LIMIT 1
    )
    SELECT
      meta.revision,
      meta.updated_by,
      meta.updated_at,
      meta.catalog_checksum,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', selected.id,
            'dataJson', CASE WHEN ${Boolean(summary)}::boolean
              THEN jsonb_strip_nulls(jsonb_build_object(
                'id', selected.id,
                'slug', COALESCE(NULLIF(selected.document->>'slug', ''), selected.id),
                'title', COALESCE(NULLIF(selected.document->>'title', ''), 'Untitled document'),
                'description', COALESCE(selected.document->>'description', ''),
                'category', COALESCE(NULLIF(selected.document->>'category', ''), 'Uncategorized'),
                'type', CASE
                  WHEN selected.document->>'type' IN ('Guide', 'SOP', 'Checklist', 'Template', 'Playbook')
                    THEN selected.document->>'type'
                  ELSE 'Guide'
                END,
                'tags', CASE
                  WHEN jsonb_typeof(selected.document->'tags') = 'array' THEN selected.document->'tags'
                  ELSE '[]'::jsonb
                END,
                'updatedAt', COALESCE(selected.document->>'updatedAt', selected.updated_at::text, selected.created_at::text),
                'status', CASE
                  WHEN selected.document->>'status' IN ('published', 'draft') THEN selected.document->>'status'
                  ELSE 'published'
                END,
                'hidden', CASE
                  WHEN LOWER(COALESCE(selected.document->>'hidden', 'false')) = 'true' THEN true
                  ELSE false
                END,
                'readingMinutes', CASE
                  WHEN jsonb_typeof(selected.document->'readingMinutes') = 'number'
                    THEN GREATEST((selected.document->>'readingMinutes')::numeric, 0)
                  ELSE 0
                END,
                'body', '',
                'topics', CASE
                  WHEN jsonb_typeof(selected.document->'topics') = 'array' THEN selected.document->'topics'
                  ELSE '[]'::jsonb
                END,
                'deletedAt', COALESCE(selected.document->'deletedAt', to_jsonb(selected.deleted_at)),
                'archivedAt', COALESCE(selected.document->'archivedAt', to_jsonb(selected.archived_at))
              ))
              ELSE selected.document
            END,
            'recordVersion', selected.record_version,
            'sourceDataJson', CASE WHEN ${Boolean(integrityPreview)}::boolean THEN selected.document ELSE NULL END,
            'rowUpdatedAt', selected.updated_at,
            'rowCreatedAt', selected.created_at,
            'rowDeletedAt', selected.deleted_at,
            'rowArchivedAt', selected.archived_at
          )
          ORDER BY selected.sort_order ASC, selected.created_at ASC, selected.id ASC
        )
        FROM selected_documents selected
      ), '[]'::jsonb) AS documents,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', document.id,
            'slug', COALESCE(NULLIF(document.document->>'slug', ''), document.id),
            'recordVersion', document.record_version,
            'lifecycleState', CASE
              WHEN document.archived_at IS NOT NULL THEN 'archived'
              WHEN document.deleted_at IS NOT NULL THEN 'deleted'
              ELSE 'active'
            END,
            'hidden', CASE
              WHEN LOWER(COALESCE(document.document->>'hidden', 'false')) = 'true' THEN true
              ELSE false
            END,
            'status', CASE
              WHEN document.document->>'status' IN ('published', 'draft') THEN document.document->>'status'
              ELSE 'published'
            END
          )
          ORDER BY document.id ASC
        )
        FROM normalized_documents document
      ), '[]'::jsonb) AS document_manifest,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', category.id,
            'dataJson', category.category,
            'recordVersion', category.record_version
          )
          ORDER BY category.sort_order ASC, category.created_at ASC, category.id ASC
        )
        FROM normalized_categories category
      ), '[]'::jsonb) AS categories,
      (SELECT COUNT(*)::integer FROM selected_documents) AS selected_document_count,
      (SELECT COUNT(*)::integer FROM normalized_categories) AS selected_category_count,
      (SELECT COUNT(*)::integer FROM normalized_documents WHERE deleted_at IS NULL AND archived_at IS NULL) AS active_document_count,
      (SELECT COUNT(*)::integer FROM normalized_documents) AS manifest_document_count,
      (SELECT COUNT(*)::integer FROM normalized_documents WHERE deleted_at IS NOT NULL AND archived_at IS NULL) AS recovery_document_count,
      (SELECT COUNT(*)::integer FROM normalized_documents WHERE archived_at IS NOT NULL) AS archived_document_count,
      (SELECT COUNT(*)::integer FROM launchflow_library_integrity_incidents WHERE acknowledged_at IS NULL) AS unacknowledged_incident_count,
      CASE WHEN ${slug}::text = '' THEN NULL ELSE COALESCE((
        SELECT jsonb_strip_nulls(jsonb_build_object(
          'status', CASE WHEN document.archived_at IS NOT NULL THEN 'archived' WHEN document.deleted_at IS NULL THEN 'active' ELSE 'deleted' END,
          'slug', document.document->>'slug',
          'documentId', document.id,
          'title', document.document->>'title',
          'deletedAt', document.deleted_at,
          'archivedAt', document.archived_at,
          'hidden', CASE
            WHEN LOWER(COALESCE(document.document->>'hidden', 'false')) = 'true' THEN true
            ELSE false
          END,
          'recordVersion', document.record_version
        ))
        FROM normalized_documents document
        WHERE COALESCE(NULLIF(document.document->>'slug', ''), document.id) = ${slug}
        ORDER BY
          CASE WHEN document.deleted_at IS NULL AND document.archived_at IS NULL THEN 0
            WHEN document.deleted_at IS NOT NULL AND document.archived_at IS NULL THEN 1
            ELSE 2
          END ASC,
          document.record_version DESC,
          document.updated_at DESC,
          document.id ASC
        LIMIT 1
      ), (
        SELECT jsonb_strip_nulls(jsonb_build_object(
          'status', 'purged',
          'slug', ${slug}::text,
          'documentId', purge.record_id,
          'title', purge.details_json->>'documentTitle',
          'deletedAt', purge.details_json->>'deletedAt'
        ))
        FROM latest_purge purge
      ), jsonb_build_object('status', 'not_found', 'slug', ${slug}::text)) END AS document_status
    FROM launchflow_library_meta meta
    WHERE meta.id = ${SHARED_LIBRARY_ID}
    LIMIT 1
  `, snapshotStage);
  const snapshot = rows[0];
  if (!snapshot) throw libraryReadIntegrityError("The Library catalog metadata is unavailable.", snapshotStage);
  const documentRows = normalizeSnapshotEntries(snapshot.documents);
  const categoryRows = normalizeSnapshotEntries(snapshot.categories);
  const manifestRows = normalizeSnapshotEntries(snapshot.document_manifest);
  const expectedDocumentCount = Number(snapshot.selected_document_count);
  const expectedCategoryCount = Number(snapshot.selected_category_count);
  const activeDocumentCount = Number(snapshot.active_document_count);
  const manifestDocumentCount = Number(snapshot.manifest_document_count);
  if (![expectedDocumentCount, expectedCategoryCount, activeDocumentCount, manifestDocumentCount]
    .every((count) => Number.isSafeInteger(count) && count >= 0)
    || expectedDocumentCount !== documentRows.length
    || expectedCategoryCount !== categoryRows.length
    || manifestDocumentCount !== manifestRows.length) {
    throw libraryReadIntegrityError("The Library catalog snapshot is incomplete.", snapshotStage);
  }
  const documentStatus = parseJsonRecord(snapshot.document_status);
  const auditDocumentIds = documentStatus?.status === "deleted" && documentStatus.documentId
    ? [String(documentStatus.documentId)]
    : [];
  const shouldLoadDeletionAudit = Boolean(includeDeletionAudit) && normalizeRole(user?.role) === "ADMIN";
  const deletionAudit = shouldLoadDeletionAudit
    ? await getDocumentDeletionAudit(`${stage}-deletion-audit`, auditDocumentIds).catch((error) => {
      const context = libraryRequestStorage.getStore();
      console.warn("[library-state] optional deletion audit unavailable", {
        requestId: context?.requestId,
        operation: context?.operation,
        stage: error?.stage,
        code: error?.code,
        message: error?.message,
      });
      return null;
    })
    : null;
  let documents;
  let categories;
  let documentManifest;
  const incompleteDocuments = [];
  try {
    documents = documentRows.map((row) => {
      const recordVersion = Number(row.recordVersion);
      if (!row.id || !Number.isSafeInteger(recordVersion) || recordVersion < 1) {
        throw new Error("Document row identity or version is invalid.");
      }
      if (integrityPreview) {
        const sourceData = unwrapLibraryRecordEnvelope(row.sourceDataJson, ["dataJson", "document"]);
        try {
          const normalized = normalizeLibraryDocument({ ...sourceData, id: row.id });
          return summary ? createSafeLibraryDocumentSummary(normalized, row) : normalized;
        } catch {
          const displayDocument = createSafeLibraryDocumentSummary(sourceData, row);
          incompleteDocuments.push({
            documentId: String(row.id),
            recordVersion,
            slug: displayDocument.slug,
            displayDocument,
          });
          return displayDocument;
        }
      }
      const data = unwrapLibraryRecordEnvelope(row.dataJson, ["dataJson", "document"]);
      return normalizeLibraryDocument({ ...data, id: row.id });
    });
    categories = categoryRows.map((row) => {
      const recordVersion = Number(row.recordVersion);
      if (!row.id || !Number.isSafeInteger(recordVersion) || recordVersion < 1) {
        throw new Error("Category row identity or version is invalid.");
      }
      const data = unwrapLibraryRecordEnvelope(row.dataJson, ["dataJson", "category"]);
      return normalizeLibraryCategory({ ...data, id: row.id });
    });
    documentManifest = normalizeDocumentManifest(manifestRows, snapshotStage);
  } catch (error) {
    if (error?.code === "LIBRARY_CATALOG_INCOMPLETE") throw error;
    throw libraryReadIntegrityError("The Library contains a malformed record and the partial response was rejected.", snapshotStage);
  }
  const recoveryCandidates = integrityPreview && incompleteDocuments.length
    ? await getLatestRestorableDocumentVersions(
      incompleteDocuments.map((document) => document.documentId),
      `${stage}-recovery-candidates`,
    )
    : new Map();
  const recordIntegrityDocuments = Object.fromEntries(incompleteDocuments.map((document) => {
    const candidate = recoveryCandidates.get(document.documentId);
    return [document.documentId, {
      status: "incomplete",
      documentId: document.documentId,
      slug: document.slug,
      title: candidate?.data?.title || document.displayDocument.title,
      recordVersion: document.recordVersion,
      reasonCode: "DOCUMENT_SCHEMA_INVALID",
      hasRecoveryCandidate: Boolean(candidate),
      ...(candidate ? {
        recoveryCandidateVersionId: candidate.id,
        recoveryCandidateRecordVersion: candidate.recordVersion,
        recoveryCandidateCreatedAt: candidate.createdAt,
      } : {}),
    }];
  }));
  let resolvedDocumentStatus = documentStatus;
  let recoveryPreview;
  if (slug && integrityPreview) {
    const incomplete = incompleteDocuments.find((document) => document.slug === slug);
    if (incomplete) {
      const integrity = recordIntegrityDocuments[incomplete.documentId];
      const candidate = recoveryCandidates.get(incomplete.documentId);
      resolvedDocumentStatus = {
        status: "incomplete",
        slug,
        documentId: incomplete.documentId,
        title: integrity.title,
        hidden: incomplete.displayDocument.hidden,
        recordVersion: incomplete.recordVersion,
        reasonCode: integrity.reasonCode,
        hasRecoveryCandidate: integrity.hasRecoveryCandidate,
      };
      if (candidate) {
        recoveryPreview = {
          document: candidate.data,
          versionId: candidate.id,
          recordVersion: candidate.recordVersion,
          createdAt: candidate.createdAt,
          operationType: candidate.operationType,
          actorEmail: candidate.actorEmail,
        };
      }
    }
  }
  const scope = archive
    ? "archive"
    : recovery
      ? "recovery"
      : slug
        ? "document"
        : summary
          ? "catalog"
          : "state";
  if (scope === "catalog" && expectedDocumentCount !== activeDocumentCount) {
    throw libraryReadIntegrityError("The active Library catalog snapshot is incomplete.", snapshotStage);
  }
  const payload = {
    state: { version: 1, documents, categories },
    revision: Number(snapshot.revision || 0),
    initialized: isLibraryInitialized(snapshot.revision),
    recordVersions: {
      documents: Object.fromEntries(documentRows.map((row) => [row.id, Number(row.recordVersion || 0)])),
      categories: Object.fromEntries(categoryRows.map((row) => [row.id, Number(row.recordVersion || 0)])),
    },
    updatedAt: snapshot.updated_at || null,
    updatedBy: snapshot.updated_by || "",
    snapshotAt: new Date().toISOString(),
    recordManifest: {
      documents: documentManifest,
    },
    catalogCompleteness: {
      complete: true,
      scope,
      expectedDocumentCount,
      returnedDocumentCount: documents.length,
      expectedCategoryCount,
      returnedCategoryCount: categories.length,
      activeDocumentCount,
      manifestDocumentCount,
      checksum: String(snapshot.catalog_checksum || ""),
    },
    recoveryDocumentCount: Number(snapshot.recovery_document_count || 0),
    archivedDocumentCount: Number(snapshot.archived_document_count || 0),
    integrityStatus: {
      status: Number(snapshot.unacknowledged_incident_count || 0) > 0 ? "blocked" : "healthy",
      checksum: String(snapshot.catalog_checksum || ""),
      unacknowledgedIncidentCount: Number(snapshot.unacknowledged_incident_count || 0),
    },
  };
  if (resolvedDocumentStatus) {
    payload.documentStatus = {
      ...resolvedDocumentStatus,
      ...(resolvedDocumentStatus.status === "deleted" && deletionAudit?.[resolvedDocumentStatus.documentId]
        ? { deletionAudit: deletionAudit[resolvedDocumentStatus.documentId] }
        : {}),
    };
  }
  if (integrityPreview) {
    payload.recordIntegrity = {
      documents: recordIntegrityDocuments,
    };
    if (recoveryPreview) payload.recoveryPreview = recoveryPreview;
  }
  if (deletionAudit) {
    payload.deletionAudit = {
      documents: deletionAudit,
    };
  }
  return payload;
}

async function getDocumentDeletionAudit(stage, documentIds = []) {
  const sql = getSql();
  const documentIdsText = documentIds
    .map((id) => Buffer.from(String(id), "utf8").toString("base64"))
    .join(",");
  const rows = await withLibraryDatabaseDeadline(sql`
    WITH deleted_documents AS (
      SELECT id, deleted_at
      FROM launchflow_library_documents
      WHERE deleted_at IS NOT NULL
        AND (
          ${documentIdsText}::text = ''
          OR id IN (
            SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8')
            FROM unnest(string_to_array(${documentIdsText}, ',')) AS requested(encoded_id)
            WHERE encoded_id <> ''
          )
        )
    ), latest_deletions AS (
      SELECT DISTINCT ON (audit.record_id)
        audit.record_id,
        audit.operation_type,
        audit.actor_email,
        audit.actor_role,
        audit.details_json,
        audit.created_at
      FROM launchflow_library_audit audit
      INNER JOIN deleted_documents document ON document.id = audit.record_id
      WHERE audit.record_type = 'document'
        AND audit.operation_type IN ('document.delete', 'document.system_delete')
      ORDER BY audit.record_id, audit.created_at DESC
    )
    SELECT document.id, document.deleted_at, deletion.operation_type,
      deletion.actor_email, deletion.actor_role, deletion.details_json
    FROM deleted_documents document
    LEFT JOIN latest_deletions deletion ON deletion.record_id = document.id
    ORDER BY document.id
  `, stage, LIBRARY_DELETION_AUDIT_TIMEOUT_MS);
  return Object.fromEntries(rows.map((row) => {
    const details = parseJsonRecord(row.details_json) || {};
    const source = ["user", "system_migration", "system_backup_restore"].includes(details.source)
      ? details.source
      : row.operation_type === "document.delete" ? "user" : "unknown";
    const actor = source === "user" && row.actor_email ? {
      name: String(details.actorName || ""),
      email: String(row.actor_email || ""),
      role: normalizeRole(row.actor_role),
    } : null;
    const initiatorEmail = String(details.initiatorEmail || row.actor_email || "");
    const initiatedBy = source.startsWith("system_") && initiatorEmail ? {
      name: String(details.initiatorName || ""),
      email: initiatorEmail,
      role: normalizeRole(details.initiatorRole || row.actor_role),
    } : null;
    return [row.id, {
      source,
      deletedAt: row.deleted_at,
      reason: String(details.reason || (source === "user" ? "Manual document deletion" : "Deletion source unavailable")),
      actor,
      initiatedBy,
    }];
  }));
}

async function sendLibraryState(res, statusCode = 200, extra = {}, options = {}, user = null) {
  const readStage = options.archive
    ? "read-library-archive"
    : options.recovery
    ? "read-library-recovery"
    : options.slug
      ? "read-library-document"
      : options.summary
        ? "read-library-catalog"
        : "read-library-state";
  const payload = await getLibraryStatePayload(options, readStage, user);
  return sendJson(res, statusCode, { ...extra, ...payload });
}

function createAuditId() {
  return `library_audit_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function createBackupId() {
  return `library_backup_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function recordTarget(operation) {
  if (operation.documentId || operation.document?.id) return { recordType: "document", recordId: operation.documentId || operation.document.id };
  if (operation.categoryId || operation.category?.id) return { recordType: "category", recordId: operation.categoryId || operation.category.id };
  return { recordType: "catalog", recordId: SHARED_LIBRARY_ID };
}

async function mutateLibraryState(req, res, user) {
  const context = libraryRequestStorage.getStore();
  const mutationBody = getJsonBody(req);
  let operation;
  try {
    operation = normalizeLibraryMutationBody(mutationBody);
  } catch (error) {
    const requestedOperation = typeof mutationBody?.operation === "string"
      ? mutationBody.operation
      : mutationBody?.operation?.type;
    console.warn("[library-state] mutation validation failed", {
      requestId: context?.requestId,
      operation: requestedOperation,
      documentId: mutationBody?.documentId || mutationBody?.document?.id,
      code: error?.code,
      message: error?.message,
    });
    throw error;
  }
  if (context) context.operation = operation.type;
  const readOptions = getLibraryReadOptions(req);
  requireLibraryOperationPermission(user.role, operation.type);
  if (operation.type !== "catalog.initialize") {
    const sql = getSql();
    const metaRows = await withLibraryDatabaseDeadline(
      sql`SELECT revision FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} LIMIT 1`,
      "read-before-library-mutation",
    );
    if (!isLibraryInitialized(metaRows[0]?.revision)) {
      const current = await getLibraryStatePayload({ summary: true }, "read-library-state", user);
      return sendJson(res, 409, {
        error: "The shared Library is waiting for its one-time administrator migration.",
        conflict: true,
        ...current,
      });
    }
  }
  const safetyBackup = DESTRUCTIVE_LIBRARY_OPERATIONS.has(operation.type)
    ? await createLibraryBackup(user, `before-${operation.type}`, false, { snapshotType: "safety" })
    : null;
  const changed = await applyLibraryOperation(operation, user);
  if (!changed) {
    return sendLibraryState(res, 409, {
      error: "The library changed in another session or the requested record is unavailable. Reloaded the latest shared state.",
      conflict: true,
    }, readOptions, user);
  }
  const result = typeof changed === "object" ? changed : {};
  if (safetyBackup) result.safetyBackup = safetyBackup;
  return sendLibraryState(res, 200, result, readOptions, user);
}

async function applyLibraryOperation(operation, user) {
  switch (operation.type) {
    case "catalog.initialize": return initializeCatalog(operation, user);
    case "document.create": return createDocument(operation, user);
    case "document.update": return updateDocument(operation, user);
    case "document.delete": return setDocumentDeleted(operation, user, true);
    case "document.restore": return setDocumentDeleted(operation, user, false);
    case "document.archive": return purgeDocument(operation, user);
    case "document.restoreArchived": return restoreArchivedDocument(operation, user);
    case "document.purge": return purgeDocument(operation, user);
    case "record.restoreVersion": return restoreLibraryVersion(operation, user);
    case "documents.restoreIncomplete": return restoreIncompleteDocuments(operation, user);
    case "records.restoreFromSnapshot": return restoreRecordsFromSnapshot(operation, user);
    case "integrity.acknowledge": return acknowledgeIntegrityIncident(operation, user);
    case "documents.restoreSystemDeleted": return restoreSystemDeletedDocuments(operation, user);
    case "documents.reorder": return reorderRecords("documents", operation.documentIds, operation.expectedRevision, operation.type, user);
    case "category.create": return createCategory(operation, user);
    case "category.update": return updateCategory(operation, user);
    case "category.delete": return setCategoryDeleted(operation, user, true);
    case "category.restore": return setCategoryDeleted(operation, user, false);
    case "category.archive": return archiveCategory(operation, user);
    case "categories.reorder": return reorderRecords("categories", operation.categoryIds, operation.expectedRevision, operation.type, user);
    default: return false;
  }
}

async function initializeCatalog(operation, user) {
  if (operation.expectedRevision !== 0) return false;
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const stateJson = JSON.stringify(operation.state);
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'migration', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), payload AS (
      SELECT ${stateJson}::jsonb AS state
    ), can_initialize AS (
      SELECT 1
      FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = 0
        AND NOT EXISTS (SELECT 1 FROM launchflow_library_documents)
        AND NOT EXISTS (SELECT 1 FROM launchflow_library_categories)
      FOR UPDATE
    ), inserted_documents AS (
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by)
      SELECT document->>'id', document, (ordinality - 1)::integer,
        CASE WHEN jsonb_typeof(document->'deletedAt') = 'string' THEN (document->>'deletedAt')::timestamptz ELSE NULL END,
        CASE WHEN jsonb_typeof(document->'archivedAt') = 'string' THEN (document->>'archivedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload, jsonb_array_elements(state->'documents') WITH ORDINALITY AS item(document, ordinality)
      WHERE EXISTS (SELECT 1 FROM can_initialize) AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), inserted_categories AS (
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by)
      SELECT category->>'id', category, (ordinality - 1)::integer,
        CASE WHEN jsonb_typeof(category->'deletedAt') = 'string' THEN (category->>'deletedAt')::timestamptz ELSE NULL END,
        CASE WHEN jsonb_typeof(category->'archivedAt') = 'string' THEN (category->>'archivedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload, jsonb_array_elements(state->'categories') WITH ORDINALITY AS item(category, ordinality)
      WHERE EXISTS (SELECT 1 FROM can_initialize) AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND EXISTS (SELECT 1 FROM can_initialize)
        AND (SELECT COUNT(*) FROM inserted_documents) >= 0
        AND (SELECT COUNT(*) FROM inserted_categories) >= 0
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'catalog', ${SHARED_LIBRARY_ID}, ${user.email}, ${user.role}, revision
      FROM bumped
      RETURNING id
    )
    SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function createDocument(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const documentJson = JSON.stringify(sanitizeDocumentForCreate(operation.document, user.role));
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), inserted AS (
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, created_by, updated_by)
      SELECT
        ${operation.document.id}, ${documentJson}::jsonb,
        COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_documents), 0),
        ${user.email}, ${user.email}
      FROM initialized, operation_context
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM inserted)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'document', ${operation.document.id}, ${user.email}, ${user.role}, revision FROM bumped
      RETURNING id
    )
    SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function updateDocument(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const documentJson = JSON.stringify({ ...operation.document, deletedAt: undefined, archivedAt: undefined });
  const protectVisibility = getDocumentProtectedFields(user.role, operation.updateScope).includes("hidden");
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), current_document AS (
      SELECT id, deleted_at, archived_at,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS current_json
      FROM launchflow_library_documents
      WHERE id = ${operation.documentId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM initialized)
        AND EXISTS (SELECT 1 FROM operation_context)
    ), changed AS (
      UPDATE launchflow_library_documents document
      SET data_json = ${documentJson}::jsonb
            || jsonb_strip_nulls(jsonb_build_object(
              'id', COALESCE(current.current_json->'id', to_jsonb(document.id::text)),
              'slug', COALESCE(current.current_json->'slug', (${documentJson}::jsonb)->'slug'),
              'hidden', CASE WHEN ${protectVisibility} THEN COALESCE(current.current_json->'hidden', 'false'::jsonb) ELSE NULL END,
              'status', CASE WHEN ${protectVisibility} THEN COALESCE(current.current_json->'status', to_jsonb('published'::text)) ELSE NULL END
            )),
          record_version = record_version + 1,
          updated_by = ${user.email}, updated_at = NOW()
      FROM current_document current
      WHERE document.id = current.id
        AND document.record_version = ${operation.expectedVersion}
        AND document.deleted_at IS NULL
      RETURNING document.id, document.data_json, document.record_version, document.deleted_at, document.archived_at
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'document', ${operation.documentId}, ${user.email}, ${user.role}, revision FROM bumped
      RETURNING id
    )
    SELECT
      bumped.revision,
      changed.id,
      changed.data_json,
      changed.record_version,
      changed.deleted_at,
      changed.archived_at
    FROM bumped
    CROSS JOIN changed
  `;
  if (!rows.length) return false;
  const saved = rows[0];
  const savedDocument = parseJsonRecord(saved.data_json);
  const mutationResult = {
    operation: operation.type,
    documentId: String(saved.id || operation.documentId),
    document: savedDocument,
    recordVersion: Number(saved.record_version || operation.expectedVersion + 1),
    lifecycleState: saved.deleted_at ? "deleted" : saved.archived_at ? "archived" : "active",
  };
  const context = libraryRequestStorage.getStore();
  console.info("[library-state] document update committed", {
    requestId: context?.requestId,
    operation: operation.type,
    documentId: mutationResult.documentId,
    updateScope: operation.updateScope || "general",
    expectedVersion: operation.expectedVersion,
    recordVersion: mutationResult.recordVersion,
    lifecycleBefore: "active",
    lifecycleAfter: mutationResult.lifecycleState,
  });
  return { mutationResult };
}

async function setDocumentDeleted(operation, user, shouldDelete) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const deletedAt = new Date().toISOString();
  const rows = shouldDelete ? await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_documents
      SET deleted_at = ${deletedAt}::timestamptz,
          data_json = jsonb_set(
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END,
            '{deletedAt}', to_jsonb(${deletedAt}::text), true
          ),
          record_version = record_version + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.documentId} AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NULL AND archived_at IS NULL
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 AND EXISTS (SELECT 1 FROM changed) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision, details_json)
      SELECT ${auditId}, ${operation.type}, 'document', ${operation.documentId}, ${user.email}, ${user.role}, revision,
        jsonb_build_object(
          'source', 'user',
          'reason', 'Manual document deletion',
          'actorName', ${user.name}::text
        )
      FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  ` : await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_documents
      SET deleted_at = NULL,
          data_json = (
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END
          ) - 'deletedAt',
          record_version = record_version + 1,
          updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.documentId} AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL AND archived_at IS NULL
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 AND EXISTS (SELECT 1 FROM changed) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'document', ${operation.documentId}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function restoreSystemDeletedDocuments(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const documentIdsJson = JSON.stringify(operation.documentIds);
  const auditRunId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), requested AS (
      SELECT value AS id
      FROM jsonb_array_elements_text(${documentIdsJson}::jsonb)
    ), allowed AS (
      SELECT revision
      FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = ${operation.expectedRevision}
        AND revision > 0
      FOR UPDATE
    ), eligible AS (
      SELECT document.id
      FROM launchflow_library_documents document
      INNER JOIN requested requested_document ON requested_document.id = document.id
      INNER JOIN LATERAL (
        SELECT audit.details_json
        FROM launchflow_library_audit audit
        WHERE audit.record_type = 'document'
          AND audit.record_id = document.id
          AND audit.operation_type IN ('document.delete', 'document.system_delete')
        ORDER BY audit.created_at DESC
        LIMIT 1
      ) deletion ON TRUE
      WHERE document.deleted_at IS NOT NULL
        AND document.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM operation_context)
        AND deletion.details_json->>'source' = 'system_migration'
    ), can_restore AS (
      SELECT 1
      WHERE EXISTS (SELECT 1 FROM allowed)
        AND (SELECT COUNT(*) FROM requested) = ${operation.documentIds.length}
        AND (SELECT COUNT(*) FROM eligible) = ${operation.documentIds.length}
    ), changed AS (
      UPDATE launchflow_library_documents document
      SET deleted_at = NULL,
          data_json = (
            CASE
              WHEN jsonb_typeof(document.data_json) = 'string' THEN (document.data_json #>> '{}')::jsonb
              ELSE document.data_json
            END
          ) - 'deletedAt',
          record_version = document.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      FROM eligible
      WHERE document.id = eligible.id
        AND EXISTS (SELECT 1 FROM can_restore)
      RETURNING document.id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = ${operation.expectedRevision}
        AND (SELECT COUNT(*) FROM changed) = ${operation.documentIds.length}
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT
        ${auditRunId} || '_' || md5(changed.id),
        'document.restore',
        'document',
        changed.id,
        ${user.email},
        ${user.role},
        bumped.revision,
        jsonb_build_object(
          'source', 'bulk_system_recovery',
          'reason', 'Recovered documents deleted by Initial Library cleanup',
          'actorName', ${user.name}::text
        )
      FROM changed
      CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision, (SELECT COUNT(*) FROM audited)::integer AS restored_count
    FROM bumped
  `;
  if (!rows.length) return false;
  return { restoredCount: Number(rows[0].restored_count || 0) };
}

async function purgeDocument(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const archivedAt = new Date().toISOString();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_documents
      SET archived_at = ${archivedAt}::timestamptz,
          data_json = jsonb_set(
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END,
            '{archivedAt}', to_jsonb(${archivedAt}::text), true
          ),
          record_version = record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      WHERE id = ${operation.documentId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL
        AND archived_at IS NULL
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id,
        CASE WHEN jsonb_typeof(data_json) = 'string' THEN ((data_json #>> '{}')::jsonb)->>'title' ELSE data_json->>'title' END AS title,
        CASE WHEN jsonb_typeof(data_json) = 'string' THEN ((data_json #>> '{}')::jsonb)->>'slug' ELSE data_json->>'slug' END AS slug,
        deleted_at,
        archived_at
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision > 0
        AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT
        ${auditId},
        'document.archive',
        'document',
        changed.id,
        ${user.email},
        ${user.role},
        bumped.revision,
        jsonb_build_object(
          'source', 'user',
          'reason', 'Moved to protected archive',
          'actorName', ${user.name}::text,
          'documentTitle', COALESCE(changed.title, ''),
          'documentSlug', COALESCE(changed.slug, ''),
          'deletedAt', changed.deleted_at,
          'archivedAt', changed.archived_at,
          'legacyOperation', ${operation.type}::text
        )
      FROM changed
      CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision FROM bumped
    WHERE EXISTS (SELECT 1 FROM audited)
  `;
  return rows.length > 0;
}

async function restoreArchivedDocument(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_documents
      SET archived_at = NULL,
          deleted_at = NULL,
          data_json = (
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END
          ) - 'archivedAt' - 'deletedAt',
          record_version = record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      WHERE id = ${operation.documentId}
        AND record_version = ${operation.expectedVersion}
        AND archived_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision > 0
        AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT ${auditId}, ${operation.type}, 'document', changed.id, ${user.email}, ${user.role},
        bumped.revision,
        jsonb_build_object(
          'source', 'user',
          'reason', 'Restored from protected archive',
          'actorName', ${user.name}::text
        )
      FROM changed CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision FROM bumped WHERE EXISTS (SELECT 1 FROM audited)
  `;
  return rows.length > 0;
}

async function createCategory(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const categoryJson = JSON.stringify({ ...operation.category, deletedAt: undefined, archivedAt: undefined });
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), inserted AS (
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, created_by, updated_by)
      SELECT ${operation.category.id}, ${categoryJson}::jsonb, COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_categories), 0), ${user.email}, ${user.email}
      FROM initialized, operation_context
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM inserted) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'category', ${operation.category.id}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function updateCategory(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const categoryJson = JSON.stringify({ ...operation.category, deletedAt: undefined, archivedAt: undefined });
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), current_category AS (
      SELECT id, data_json->>'name' AS old_name
      FROM launchflow_library_categories
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM initialized)
        AND EXISTS (SELECT 1 FROM operation_context)
    ), changed AS (
      UPDATE launchflow_library_categories category
      SET data_json = ${categoryJson}::jsonb, record_version = record_version + 1, updated_by = ${user.email}, updated_at = NOW()
      FROM current_category current
      WHERE category.id = current.id
      RETURNING category.id, current.old_name
    ), cascaded_documents AS (
      UPDATE launchflow_library_documents document
      SET data_json = jsonb_set(document.data_json, '{category}', to_jsonb(${String(operation.category.name || "")}::text), true),
          record_version = document.record_version + 1, updated_by = ${user.email}, updated_at = NOW()
      FROM changed
      WHERE document.deleted_at IS NULL AND document.archived_at IS NULL AND document.data_json->>'category' = changed.old_name
      RETURNING document.id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed)
        AND (SELECT COUNT(*) FROM cascaded_documents) >= 0
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'category', ${operation.categoryId}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function setCategoryDeleted(operation, user, shouldDelete) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const rows = shouldDelete ? await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), changed AS (
      UPDATE launchflow_library_categories
      SET deleted_at = NOW(), data_json = jsonb_set(
            CASE
              WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
              ELSE data_json
            END,
            '{deletedAt}',
            to_jsonb(NOW()::text),
            true
          ),
          record_version = record_version + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NULL AND archived_at IS NULL
        AND (SELECT COUNT(*) FROM launchflow_library_categories WHERE deleted_at IS NULL AND archived_at IS NULL) > 1
        AND EXISTS (SELECT 1 FROM initialized)
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'category', ${operation.categoryId}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  ` : await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), changed AS (
      UPDATE launchflow_library_categories
      SET deleted_at = NULL, data_json = (
            CASE
              WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
              ELSE data_json
            END
          ) - 'deletedAt', record_version = record_version + 1,
          updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL AND archived_at IS NULL
        AND EXISTS (SELECT 1 FROM initialized)
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'category', ${operation.categoryId}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  if (!rows.length && shouldDelete) {
    const guardRows = await query`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND archived_at IS NULL)::integer AS active_count,
        COUNT(*) FILTER (
          WHERE id = ${operation.categoryId}
            AND record_version = ${operation.expectedVersion}
            AND deleted_at IS NULL
            AND archived_at IS NULL
        )::integer AS matching_target
      FROM launchflow_library_categories
    `;
    if (Number(guardRows[0]?.matching_target || 0) > 0 && Number(guardRows[0]?.active_count || 0) <= 1) {
      const error = new Error("At least one active category must remain. Create or recover another category before deleting this one.");
      error.code = "LAST_ACTIVE_CATEGORY";
      error.statusCode = 409;
      throw error;
    }
  }
  return rows.length > 0;
}

async function archiveCategory(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const archivedAt = new Date().toISOString();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), current_category AS (
      SELECT
        id,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS category,
        deleted_at
      FROM launchflow_library_categories
      WHERE id = ${operation.categoryId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL
        AND archived_at IS NULL
      FOR UPDATE
    ), referenced_documents AS (
      SELECT document.id
      FROM launchflow_library_documents document
      CROSS JOIN current_category current
      WHERE (
        CASE
          WHEN jsonb_typeof(document.data_json) = 'string' THEN (document.data_json #>> '{}')::jsonb
          ELSE document.data_json
        END
      )->>'category' = current.category->>'name'
    ), changed AS (
      UPDATE launchflow_library_categories category
      SET archived_at = ${archivedAt}::timestamptz,
          data_json = jsonb_set(
            CASE
              WHEN jsonb_typeof(category.data_json) = 'string' THEN (category.data_json #>> '{}')::jsonb
              ELSE category.data_json
            END,
            '{archivedAt}',
            to_jsonb(${archivedAt}::text),
            true
          ),
          record_version = record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      FROM current_category current
      WHERE category.id = current.id
        AND NOT EXISTS (SELECT 1 FROM referenced_documents)
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING
        category.id,
        current.category->>'name' AS name,
        current.deleted_at,
        category.archived_at
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision, details_json
      )
      SELECT
        ${auditId},
        ${operation.type},
        'category',
        changed.id,
        ${user.email},
        ${user.role},
        bumped.revision,
        jsonb_build_object(
          'source', 'user',
          'reason', 'Removed from normal category recovery',
          'actorName', ${user.name}::text,
          'categoryName', COALESCE(changed.name, ''),
          'deletedAt', changed.deleted_at,
          'archivedAt', changed.archived_at
        )
      FROM changed
      CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision FROM bumped
    WHERE EXISTS (SELECT 1 FROM audited)
  `;
  if (rows.length) return true;

  const guardRows = await query`
    WITH current_category AS (
      SELECT
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS category
      FROM launchflow_library_categories
      WHERE id = ${operation.categoryId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL
        AND archived_at IS NULL
    )
    SELECT COUNT(document.id)::integer AS reference_count
    FROM current_category current
    JOIN launchflow_library_documents document ON (
      CASE
        WHEN jsonb_typeof(document.data_json) = 'string' THEN (document.data_json #>> '{}')::jsonb
        ELSE document.data_json
      END
    )->>'category' = current.category->>'name'
  `;
  if (Number(guardRows[0]?.reference_count || 0) > 0) {
    const error = new Error("This category still contains documents. Move or permanently archive those documents before deleting the category forever.");
    error.code = "CATEGORY_NOT_EMPTY";
    error.statusCode = 409;
    throw error;
  }
  return false;
}

async function reorderRecords(kind, ids, expectedRevision, operationType, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const idsText = ids.map((id) => Buffer.from(id, "utf8").toString("base64")).join(",");
  const auditId = createAuditId();
  const target = kind === "documents" ? "document" : "category";
  const rows = kind === "documents" ? await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operationType}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), input AS (
      SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8') AS id, (ordinality - 1)::integer AS sort_order
      FROM unnest(string_to_array(${idsText}, ',')) WITH ORDINALITY AS item(encoded_id, ordinality)
    ), valid AS (
      SELECT 1
      WHERE (SELECT COUNT(*) FROM input) > 0
        AND (SELECT COUNT(*) FROM input) = (
          SELECT COUNT(*) FROM launchflow_library_documents d JOIN input i ON i.id = d.id WHERE d.deleted_at IS NULL AND d.archived_at IS NULL
        )
    ), ordered AS (
      SELECT id, sort_order FROM input
      UNION ALL
      SELECT d.id,
        ((SELECT COUNT(*) FROM input) + ROW_NUMBER() OVER (ORDER BY d.sort_order ASC, d.created_at ASC, d.id ASC) - 1)::integer AS sort_order
      FROM launchflow_library_documents d
      WHERE d.deleted_at IS NULL AND d.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM input i WHERE i.id = d.id)
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
        AND EXISTS (SELECT 1 FROM valid) AND EXISTS (SELECT 1 FROM operation_context) RETURNING revision
    ), changed AS (
      UPDATE launchflow_library_documents d SET sort_order = ordered.sort_order, record_version = d.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      FROM ordered WHERE d.id = ordered.id AND EXISTS (SELECT 1 FROM bumped) RETURNING d.id
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision, details_json)
      SELECT ${auditId}, ${operationType}, ${target}, ${SHARED_LIBRARY_ID}, ${user.email}, ${user.role}, revision,
        jsonb_build_object('ids', COALESCE((SELECT jsonb_agg(id ORDER BY sort_order) FROM ordered), '[]'::jsonb))
      FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  ` : await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operationType}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), input AS (
      SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8') AS id, (ordinality - 1)::integer AS sort_order
      FROM unnest(string_to_array(${idsText}, ',')) WITH ORDINALITY AS item(encoded_id, ordinality)
    ), valid AS (
      SELECT 1
      WHERE (SELECT COUNT(*) FROM input) > 0
        AND (SELECT COUNT(*) FROM input) = (
          SELECT COUNT(*) FROM launchflow_library_categories c JOIN input i ON i.id = c.id WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
        )
    ), ordered AS (
      SELECT id, sort_order FROM input
      UNION ALL
      SELECT c.id,
        ((SELECT COUNT(*) FROM input) + ROW_NUMBER() OVER (ORDER BY c.sort_order ASC, c.created_at ASC, c.id ASC) - 1)::integer AS sort_order
      FROM launchflow_library_categories c
      WHERE c.deleted_at IS NULL AND c.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM input i WHERE i.id = c.id)
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
        AND EXISTS (SELECT 1 FROM valid) AND EXISTS (SELECT 1 FROM operation_context) RETURNING revision
    ), changed AS (
      UPDATE launchflow_library_categories c SET sort_order = ordered.sort_order, record_version = c.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      FROM ordered WHERE c.id = ordered.id AND EXISTS (SELECT 1 FROM bumped) RETURNING c.id
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision, details_json)
      SELECT ${auditId}, ${operationType}, ${target}, ${SHARED_LIBRARY_ID}, ${user.email}, ${user.role}, revision,
        jsonb_build_object('ids', COALESCE((SELECT jsonb_agg(id ORDER BY sort_order) FROM ordered), '[]'::jsonb))
      FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function listLibraryVersions(req, res, user) {
  requireLibraryAdmin(user);
  const recordType = String(req.query?.recordType || "").trim();
  const recordId = String(req.query?.recordId || "").trim();
  if (!["document", "category"].includes(recordType) || !recordId) {
    return sendJson(res, 400, { error: "Record type and record id are required." });
  }
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-versions");
  const rows = await query`
    SELECT id, record_type, record_id, record_version, catalog_revision, lifecycle_state,
      data_json, sort_order, deleted_at, archived_at, operation_type, operation_source, actor_email, actor_role,
      request_id, checksum, trusted, created_at
    FROM launchflow_library_versions
    WHERE record_type = ${recordType} AND record_id = ${recordId}
    ORDER BY created_at DESC
    LIMIT 250
  `;
  return sendJson(res, 200, {
    versions: rows.map(serializeLibraryVersionRow),
  });
}

async function listLibraryIntegrityIncidents(res, user) {
  requireLibraryAdmin(user);
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-integrity-incidents");
  const rows = await query`
    SELECT id, incident_type, record_type, record_id, detected_checksum,
      restored_version_id, details_json, acknowledged_at, acknowledged_by, created_at
    FROM launchflow_library_integrity_incidents
    ORDER BY created_at DESC
    LIMIT 250
  `;
  return sendJson(res, 200, {
    incidents: rows.map((row) => ({
      id: row.id,
      incidentType: row.incident_type,
      recordType: row.record_type,
      recordId: row.record_id,
      detectedChecksum: row.detected_checksum,
      restoredVersionId: row.restored_version_id,
      details: parseJsonRecord(row.details_json) || {},
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      createdAt: row.created_at,
    })),
  });
}

async function restoreLibraryVersion(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-version-restore");
  const auditId = createAuditId();
  const table = operation.recordType === "document" ? "launchflow_library_documents" : "launchflow_library_categories";
  const versionRows = await query`
    SELECT data_json, sort_order, trusted
    FROM launchflow_library_versions
    WHERE id = ${operation.versionId}
      AND record_type = ${operation.recordType}
      AND record_id = ${operation.recordId}
    LIMIT 1
  `;
  if (!versionRows.length) return false;
  const envelopeKeys = operation.recordType === "document" ? ["dataJson", "document"] : ["dataJson", "category"];
  const versionData = unwrapLibraryRecordEnvelope(versionRows[0].data_json, envelopeKeys);
  if (!versionData || typeof versionData !== "object" || Array.isArray(versionData)) {
    const error = new Error("The selected Library version is malformed and cannot be restored.");
    error.statusCode = 400;
    throw error;
  }
  if (versionData.id !== undefined && String(versionData.id) !== operation.recordId) {
    const error = new Error("The selected Library version does not match this record.");
    error.statusCode = 400;
    throw error;
  }
  const restoredRecord = operation.recordType === "document"
    ? normalizeLibraryDocument({ ...versionData, id: operation.recordId })
    : normalizeLibraryCategory({ ...versionData, id: operation.recordId });
  delete restoredRecord.deletedAt;
  delete restoredRecord.archivedAt;
  const restoredJson = JSON.stringify(restoredRecord);
  const restoredSortOrder = Number.isSafeInteger(Number(versionRows[0].sort_order))
    ? Number(versionRows[0].sort_order)
    : 0;
  const restoredVersionWasTrusted = Boolean(versionRows[0].trusted);
  const rows = table === "launchflow_library_documents" ? await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_documents document
      SET data_json = ${restoredJson}::jsonb,
          sort_order = ${restoredSortOrder},
          deleted_at = NULL,
          archived_at = NULL,
          record_version = document.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      WHERE document.id = ${operation.recordId}
        AND document.record_version = ${operation.expectedVersion}
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING document.id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT ${auditId}, ${operation.type}, 'document', changed.id, ${user.email}, ${user.role},
        bumped.revision,
        jsonb_build_object(
          'versionId', ${operation.versionId}::text,
          'reason', 'Restored validated document version',
          'versionWasTrusted', ${restoredVersionWasTrusted}::boolean,
          'actorName', ${user.name}::text
        )
      FROM changed CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision FROM bumped WHERE EXISTS (SELECT 1 FROM audited)
  ` : await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), changed AS (
      UPDATE launchflow_library_categories category
      SET data_json = ${restoredJson}::jsonb,
          sort_order = ${restoredSortOrder},
          deleted_at = NULL,
          archived_at = NULL,
          record_version = category.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      WHERE category.id = ${operation.recordId}
        AND category.record_version = ${operation.expectedVersion}
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING category.id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed)
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT ${auditId}, ${operation.type}, 'category', changed.id, ${user.email}, ${user.role},
        bumped.revision,
        jsonb_build_object(
          'versionId', ${operation.versionId}::text,
          'reason', 'Restored validated category version',
          'versionWasTrusted', ${restoredVersionWasTrusted}::boolean,
          'actorName', ${user.name}::text
        )
      FROM changed CROSS JOIN bumped
      RETURNING id
    )
    SELECT revision FROM bumped WHERE EXISTS (SELECT 1 FROM audited)
  `;
  return rows.length > 0;
}

async function restoreIncompleteDocuments(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-incomplete-document-restore");
  const requestedVersionIds = operation.records.map((record) => record.versionId);
  const requestedVersionIdsText = requestedVersionIds
    .map((id) => Buffer.from(String(id), "utf8").toString("base64"))
    .join(",");
  const versionRows = await query`
    SELECT id, record_type, record_id, record_version, data_json, trusted
    FROM launchflow_library_versions
    WHERE id IN (
      SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8')
      FROM unnest(string_to_array(${requestedVersionIdsText}, ',')) AS requested(encoded_id)
      WHERE encoded_id <> ''
    )
  `;
  const versionsById = new Map(versionRows.map((row) => [String(row.id), row]));
  const selected = operation.records.map((record) => {
    const row = versionsById.get(record.versionId);
    if (!row || row.record_type !== "document" || String(row.record_id) !== record.documentId) {
      const error = new Error("A selected protected version is unavailable or does not match its document.");
      error.statusCode = 400;
      throw error;
    }
    const inspected = inspectLibraryVersionRecord(row, "document", record.documentId);
    if (!inspected.restorable) {
      const error = new Error("A selected protected version does not pass the current document validator.");
      error.statusCode = 400;
      error.code = inspected.validationErrorCode;
      throw error;
    }
    const restoredDocument = { ...inspected.data };
    delete restoredDocument.deletedAt;
    delete restoredDocument.archivedAt;
    return {
      documentId: record.documentId,
      versionId: record.versionId,
      expectedVersion: record.expectedVersion,
      dataJson: restoredDocument,
      versionWasTrusted: Boolean(row.trusted),
    };
  });
  const selectedJsonBase64 = Buffer.from(JSON.stringify(selected), "utf8").toString("base64");
  const auditPrefix = createAuditId();
  const requestId = libraryRequestStorage.getStore()?.requestId || "";
  const expectedCount = selected.length;
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'api', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${requestId}, true)
    ), allowed AS (
      SELECT revision
      FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = ${operation.expectedRevision}
      FOR UPDATE
    ), input AS (
      SELECT
        record->>'documentId' AS document_id,
        record->>'versionId' AS version_id,
        (record->>'expectedVersion')::integer AS expected_version,
        record->'dataJson' AS data_json,
        COALESCE((record->>'versionWasTrusted')::boolean, false) AS version_was_trusted
      FROM jsonb_array_elements(
        convert_from(decode(${selectedJsonBase64}, 'base64'), 'UTF8')::jsonb
      ) AS item(record)
    ), eligible AS (
      SELECT COUNT(*)::integer AS matched_count
      FROM input
      INNER JOIN launchflow_library_documents document
        ON document.id = input.document_id
        AND document.record_version = input.expected_version
        AND document.deleted_at IS NULL
        AND document.archived_at IS NULL
      WHERE EXISTS (SELECT 1 FROM allowed)
    ), changed AS (
      UPDATE launchflow_library_documents document
      SET data_json = input.data_json,
          record_version = document.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      FROM input
      WHERE document.id = input.document_id
        AND document.record_version = input.expected_version
        AND document.deleted_at IS NULL
        AND document.archived_at IS NULL
        AND (SELECT matched_count FROM eligible) = ${expectedCount}
        AND EXISTS (SELECT 1 FROM operation_context)
      RETURNING document.id, input.version_id, input.version_was_trusted
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1,
          updated_by = ${user.email},
          updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND (SELECT COUNT(*) FROM changed) = ${expectedCount}
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT
        ${auditPrefix} || '_' || SUBSTRING(MD5(changed.id) FROM 1 FOR 12),
        ${operation.type},
        'document',
        changed.id,
        ${user.email},
        ${user.role},
        bumped.revision,
        jsonb_build_object(
          'versionId', changed.version_id,
          'reason', 'Restored validated incomplete document version',
          'versionWasTrusted', changed.version_was_trusted,
          'actorName', ${user.name}::text
        )
      FROM changed CROSS JOIN bumped
      RETURNING record_id
    )
    SELECT
      bumped.revision,
      (SELECT COUNT(*)::integer FROM audited) AS restored_count
    FROM bumped
    WHERE (SELECT COUNT(*) FROM audited) = ${expectedCount}
  `;
  if (!rows.length) return false;
  return {
    restoredCount: Number(rows[0].restored_count || 0),
  };
}

async function restoreRecordsFromSnapshot(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-snapshot-record-restore");
  const backupRows = await query`SELECT state_json FROM launchflow_library_backups WHERE id = ${operation.snapshotId} LIMIT 1`;
  if (!backupRows.length) return false;
  const selected = normalizeSelectedSnapshotRecords(
    parseJsonRecord(backupRows[0].state_json),
    operation.recordType,
    operation.recordIds,
  );
  if (selected.length !== operation.recordIds.length) return false;
  const selectedJson = JSON.stringify(selected);
  const selectedJsonBase64 = Buffer.from(selectedJson, "utf8").toString("base64");
  const recordIdsJsonBase64 = Buffer.from(JSON.stringify(operation.recordIds), "utf8").toString("base64");
  const auditId = createAuditId();
  const rows = operation.recordType === "document" ? await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'backup', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), allowed AS (
      SELECT revision FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${operation.expectedRevision}
      FOR UPDATE
    ), input AS (
      SELECT record, ordinality
      FROM jsonb_array_elements(
        convert_from(decode(${selectedJsonBase64}, 'base64'), 'UTF8')::jsonb
      ) WITH ORDINALITY AS item(record, ordinality)
    ), changed AS (
      INSERT INTO launchflow_library_documents (
        id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by
      )
      SELECT input.record->>'id',
        input.record - 'deletedAt' - 'archivedAt',
        COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_documents), 0) + input.ordinality::integer - 1,
        NULL,
        NULL,
        ${user.email},
        ${user.email}
      FROM input
      WHERE EXISTS (SELECT 1 FROM allowed)
        AND EXISTS (SELECT 1 FROM operation_context)
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        deleted_at = NULL,
        archived_at = NULL,
        record_version = launchflow_library_documents.record_version + 1,
        updated_by = ${user.email},
        updated_at = NOW()
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = ${operation.expectedRevision}
        AND (SELECT COUNT(*) FROM changed) = ${selected.length}
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT ${auditId}, ${operation.type}, 'document', ${SHARED_LIBRARY_ID},
        ${user.email}, ${user.role}, revision,
        jsonb_build_object(
          'snapshotId', ${operation.snapshotId}::text,
          'recordIds', convert_from(decode(${recordIdsJsonBase64}, 'base64'), 'UTF8')::jsonb,
          'mode', 'record_level_restore',
          'actorName', ${user.name}::text
        )
      FROM bumped
      RETURNING id
    )
    SELECT revision, (SELECT COUNT(*) FROM changed)::integer AS restored_count
    FROM bumped WHERE EXISTS (SELECT 1 FROM audited)
  ` : await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', ${operation.type}, true),
        set_config('launchflow.library_source', 'backup', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), allowed AS (
      SELECT revision FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${operation.expectedRevision}
      FOR UPDATE
    ), input AS (
      SELECT record, ordinality
      FROM jsonb_array_elements(
        convert_from(decode(${selectedJsonBase64}, 'base64'), 'UTF8')::jsonb
      ) WITH ORDINALITY AS item(record, ordinality)
    ), changed AS (
      INSERT INTO launchflow_library_categories (
        id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by
      )
      SELECT input.record->>'id',
        input.record - 'deletedAt' - 'archivedAt',
        COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_categories), 0) + input.ordinality::integer - 1,
        NULL,
        NULL,
        ${user.email},
        ${user.email}
      FROM input
      WHERE EXISTS (SELECT 1 FROM allowed)
        AND EXISTS (SELECT 1 FROM operation_context)
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        deleted_at = NULL,
        archived_at = NULL,
        record_version = launchflow_library_categories.record_version + 1,
        updated_by = ${user.email},
        updated_at = NOW()
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID}
        AND revision = ${operation.expectedRevision}
        AND (SELECT COUNT(*) FROM changed) = ${selected.length}
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (
        id, operation_type, record_type, record_id, actor_email, actor_role,
        resulting_revision, details_json
      )
      SELECT ${auditId}, ${operation.type}, 'category', ${SHARED_LIBRARY_ID},
        ${user.email}, ${user.role}, revision,
        jsonb_build_object(
          'snapshotId', ${operation.snapshotId}::text,
          'recordIds', convert_from(decode(${recordIdsJsonBase64}, 'base64'), 'UTF8')::jsonb,
          'mode', 'record_level_restore',
          'actorName', ${user.name}::text
        )
      FROM bumped
      RETURNING id
    )
    SELECT revision, (SELECT COUNT(*) FROM changed)::integer AS restored_count
    FROM bumped WHERE EXISTS (SELECT 1 FROM audited)
  `;
  if (!rows.length) return false;
  return { restoredCount: Number(rows[0].restored_count || 0) };
}

async function acknowledgeIntegrityIncident(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "acknowledge-library-integrity-incident");
  const rows = await query`
    WITH allowed AS (
      SELECT revision FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${operation.expectedRevision}
    ), changed AS (
      UPDATE launchflow_library_integrity_incidents
      SET acknowledged_at = NOW(), acknowledged_by = ${user.email}
      WHERE id = ${operation.incidentId}
        AND acknowledged_at IS NULL
        AND EXISTS (SELECT 1 FROM allowed)
      RETURNING id
    )
    SELECT id FROM changed
  `;
  return rows.length > 0;
}

function normalizeSelectedSnapshotRecords(state, recordType, recordIds) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const collection = recordType === "document" ? state.documents : state.categories;
  if (!Array.isArray(collection)) return [];
  const requested = new Set(recordIds);
  const normalizeRecord = recordType === "document" ? normalizeLibraryDocument : normalizeLibraryCategory;
  const selectedById = new Map();
  for (const candidate of collection) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !requested.has(candidate.id)) continue;
    const normalized = normalizeRecord(candidate);
    if (selectedById.has(normalized.id)) return [];
    selectedById.set(normalized.id, normalized);
  }
  return recordIds.map((id) => selectedById.get(id)).filter(Boolean);
}

async function repairLibraryIntegrity(user = LIBRARY_MAINTENANCE_USER) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "repair-library-integrity");
  const anomalies = await withLibraryDatabaseDeadline(query`
    WITH latest_trusted AS (
      SELECT DISTINCT ON (record_type, record_id)
        id, record_type, record_id, data_json, sort_order, lifecycle_state, deleted_at, archived_at, checksum, created_at
      FROM launchflow_library_versions
      WHERE trusted = TRUE
      ORDER BY record_type, record_id, record_version DESC, created_at DESC, id DESC
    ), current_records AS (
      SELECT 'document'::text AS record_type, id AS record_id,
        CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END AS data_json,
        sort_order, launchflow_library_record_lifecycle(deleted_at, archived_at) AS lifecycle_state
      FROM launchflow_library_documents
      UNION ALL
      SELECT 'category'::text AS record_type, id AS record_id,
        CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END AS data_json,
        sort_order, launchflow_library_record_lifecycle(deleted_at, archived_at) AS lifecycle_state
      FROM launchflow_library_categories
    )
    SELECT trusted.*,
      current.record_id IS NULL AS record_missing,
      current.lifecycle_state AS detected_lifecycle_state,
      CASE WHEN current.record_id IS NULL THEN '' ELSE md5(current.data_json::text || '|' || current.sort_order::text || '|' || current.lifecycle_state) END AS detected_checksum
    FROM latest_trusted trusted
    LEFT JOIN current_records current
      ON current.record_type = trusted.record_type AND current.record_id = trusted.record_id
    WHERE current.record_id IS NULL
      OR md5(current.data_json::text || '|' || current.sort_order::text || '|' || current.lifecycle_state) <> trusted.checksum
    ORDER BY trusted.created_at DESC
    LIMIT 50
  `, "repair-library-integrity", LIBRARY_INTEGRITY_TIMEOUT_MS);
  let restoredCount = 0;
  let blockedCount = 0;
  for (const anomaly of anomalies) {
    const incidentId = `library_incident_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    const lifecycleBlocked = Boolean(anomaly.record_missing)
      || String(anomaly.detected_lifecycle_state || "") !== String(anomaly.lifecycle_state || "");
    if (lifecycleBlocked) {
      const incidentType = anomaly.record_missing ? "unexpected_record_missing" : "unexpected_lifecycle_change";
      const blocked = await query`
        INSERT INTO launchflow_library_integrity_incidents (
          id, incident_type, record_type, record_id, detected_checksum,
          restored_version_id, details_json
        )
        SELECT
          ${incidentId}, ${incidentType}, ${anomaly.record_type}, ${anomaly.record_id},
          ${anomaly.detected_checksum || ""}, ${anomaly.id},
          jsonb_build_object(
            'reason', ${anomaly.record_missing
              ? "A protected Library record is missing"
              : "A Library lifecycle value differs from the latest trusted version"},
            'action', 'No automatic lifecycle change was made',
            'trustedLifecycle', ${String(anomaly.lifecycle_state || "")},
            'detectedLifecycle', ${String(anomaly.detected_lifecycle_state || "")},
            'actorName', ${user.name}
          )
        WHERE NOT EXISTS (
          SELECT 1
          FROM launchflow_library_integrity_incidents incident
          WHERE incident.record_type = ${anomaly.record_type}
            AND incident.record_id = ${anomaly.record_id}
            AND incident.incident_type = ${incidentType}
            AND incident.acknowledged_at IS NULL
        )
        RETURNING id
      `;
      blockedCount += blocked.length;
      continue;
    }
    const rows = anomaly.record_type === "document" ? await query`
      WITH operation_context AS (
        SELECT
          set_config('launchflow.library_operation', 'integrity.repair_content', true),
          set_config('launchflow.library_source', 'maintenance', true),
          set_config('launchflow.library_actor_email', ${user.email}, true),
          set_config('launchflow.library_actor_role', ${user.role}, true),
          set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || "maintenance"}, true)
      ), restored AS (
        UPDATE launchflow_library_documents document
        SET data_json = ${JSON.stringify(parseJsonRecord(anomaly.data_json))}::jsonb,
          sort_order = ${Number(anomaly.sort_order || 0)},
          record_version = document.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
        WHERE document.id = ${anomaly.record_id}
          AND launchflow_library_record_lifecycle(document.deleted_at, document.archived_at) = ${anomaly.lifecycle_state}
          AND EXISTS (SELECT 1 FROM operation_context)
        RETURNING id
      ), bumped AS (
        UPDATE launchflow_library_meta
        SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
        WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM restored)
        RETURNING revision
      )
      SELECT revision FROM bumped
    ` : await query`
      WITH operation_context AS (
        SELECT
          set_config('launchflow.library_operation', 'integrity.repair_content', true),
          set_config('launchflow.library_source', 'maintenance', true),
          set_config('launchflow.library_actor_email', ${user.email}, true),
          set_config('launchflow.library_actor_role', ${user.role}, true),
          set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || "maintenance"}, true)
      ), restored AS (
        UPDATE launchflow_library_categories category
        SET data_json = ${JSON.stringify(parseJsonRecord(anomaly.data_json))}::jsonb,
          sort_order = ${Number(anomaly.sort_order || 0)},
          record_version = category.record_version + 1,
          updated_by = ${user.email},
          updated_at = NOW()
        WHERE category.id = ${anomaly.record_id}
          AND launchflow_library_record_lifecycle(category.deleted_at, category.archived_at) = ${anomaly.lifecycle_state}
          AND EXISTS (SELECT 1 FROM operation_context)
        RETURNING id
      ), bumped AS (
        UPDATE launchflow_library_meta
        SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
        WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM restored)
        RETURNING revision
      )
      SELECT revision FROM bumped
    `;
    if (!rows.length) continue;
    await query`
      INSERT INTO launchflow_library_integrity_incidents (
        id, incident_type, record_type, record_id, detected_checksum,
        restored_version_id, details_json
      ) VALUES (
        ${incidentId}, 'unexpected_record_change', ${anomaly.record_type}, ${anomaly.record_id},
        ${anomaly.detected_checksum || ""}, ${anomaly.id},
        jsonb_build_object(
          'reason', 'Record differed from the latest trusted Library version',
          'action', 'Content and order drift repaired; lifecycle was unchanged',
          'trustedChecksum', ${anomaly.checksum},
          'actorName', ${user.name}
        )
      )
    `;
    restoredCount += 1;
  }
  return { restoredCount, blockedCount };
}

async function runLibraryMaintenance(res) {
  const repair = await repairLibraryIntegrity(LIBRARY_MAINTENANCE_USER);
  const backup = await createLibraryBackup(
    LIBRARY_MAINTENANCE_USER,
    "daily-integrity-snapshot",
    false,
    { snapshotType: "daily", dedupe: true },
  );
  const payload = await getLibraryStatePayload(
    { includeDeleted: true, includeArchived: true },
    "read-library-maintenance-snapshot",
    LIBRARY_MAINTENANCE_USER,
  );
  return sendJson(res, 200, {
    repair,
    backup,
    state: payload.state,
    revision: payload.revision,
    snapshotAt: payload.snapshotAt,
  });
}

function requireLibraryAdmin(user) {
  if (user.role !== "ADMIN") {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
}

function summarizeBackup(row) {
  return {
    id: row.id,
    revision: Number(row.source_revision || 0),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    stateSize: Number(row.state_size || 0),
    isManual: Boolean(row.is_manual),
    checksum: String(row.checksum || ""),
    snapshotType: String(row.snapshot_type || (row.is_manual ? "manual" : "automatic")),
    status: String(row.status || "complete"),
  };
}

async function createLibraryBackup(user, reason = "manual-backup", isManual = true, options = {}) {
  const payload = await getLibraryStatePayload({ includeDeleted: true, includeArchived: true }, "read-before-library-backup");
  const stateJson = JSON.stringify(payload.state);
  const checksum = crypto.createHash("sha256").update(stateJson).digest("hex");
  const snapshotType = String(options.snapshotType || (isManual ? "manual" : "automatic")).slice(0, 40);
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-backup");
  if (options.dedupe) {
    const existing = await query`
      SELECT id, source_revision, reason, created_by, created_at, state_size, is_manual, checksum, snapshot_type, status
      FROM launchflow_library_backups
      WHERE checksum = ${checksum} AND snapshot_type = ${snapshotType}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (existing.length) return { ...summarizeBackup(existing[0]), deduplicated: true };
  }
  const rows = await query`
    INSERT INTO launchflow_library_backups (
      id, state_json, source_revision, reason, created_by, state_size, is_manual,
      checksum, snapshot_type, status
    )
    VALUES (
      ${createBackupId()}, ${stateJson}::jsonb, ${payload.revision},
      ${String(reason || "manual-backup").slice(0, 120)}, ${user.email},
      ${stateJson.length}, ${isManual}, ${checksum}, ${snapshotType}, 'complete'
    )
    RETURNING id, source_revision, reason, created_by, created_at, state_size, is_manual, checksum, snapshot_type, status
  `;
  return summarizeBackup(rows[0]);
}

async function listLibraryBackups(res, user) {
  requireLibraryAdmin(user);
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-backups");
  const rows = await query`
    SELECT id, source_revision, reason, created_by, created_at, state_size, is_manual, checksum, snapshot_type, status
    FROM launchflow_library_backups ORDER BY created_at DESC LIMIT ${LIBRARY_BACKUP_LIMIT}
  `;
  return sendJson(res, 200, { backups: rows.map(summarizeBackup) });
}

async function getLibraryBackup(res, user, backupIdValue) {
  requireLibraryAdmin(user);
  const backupId = String(backupIdValue || "").trim();
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-backup");
  const rows = await query`
    SELECT id, state_json, source_revision, reason, created_by, created_at, state_size, is_manual, checksum, snapshot_type, status
    FROM launchflow_library_backups WHERE id = ${backupId} LIMIT 1
  `;
  if (!rows.length) return sendJson(res, 404, { error: "Library backup not found." });
  return sendJson(res, 200, { backup: summarizeBackup(rows[0]), state: parseJsonRecord(rows[0].state_json) });
}

async function handleLibraryBackupAction(req, res, user) {
  requireLibraryAdmin(user);
  const body = getJsonBody(req);
  const action = String(body?.action || "").trim();
  const context = libraryRequestStorage.getStore();
  if (context) context.operation = action || "unknown-backup-action";
  if (action === "create-backup") {
    const backup = await createLibraryBackup(user, String(body?.reason || "manual-backup"), true);
    return sendJson(res, 200, { backup });
  }
  if (action === "restore-backup") return restoreLibraryBackup(res, user, body);
  return sendJson(res, 400, { error: "Unknown library backup action." });
}

async function restoreLibraryBackup(res, user, body) {
  const backupId = String(body?.backupId || "").trim();
  const expectedRevision = Number(body?.expectedRevision);
  if (!backupId) return sendJson(res, 400, { error: "Backup id is required." });
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return sendJson(res, 400, { error: "Expected revision is required." });
  const current = await getLibraryStatePayload({ includeDeleted: true, includeArchived: true }, "read-before-library-backup-restore");
  if (!current.initialized) {
    return sendJson(res, 409, {
      error: "The shared Library must complete its one-time administrator migration before a backup can be restored.",
      conflict: true,
      ...current,
    });
  }
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-backup");
  const backupRows = await query`SELECT state_json FROM launchflow_library_backups WHERE id = ${backupId} LIMIT 1`;
  if (!backupRows.length) return sendJson(res, 404, { error: "Library backup not found." });
  const state = normalizeLibraryState(parseJsonRecord(backupRows[0].state_json));

  await createLibraryBackup(user, "before-restore", false, { snapshotType: "safety" });
  const restored = await replaceCatalogFromBackup(state, expectedRevision, backupId, user);
  if (!restored) {
    return sendLibraryState(res, 409, { error: "The library changed before the backup could be restored.", conflict: true }, {}, user);
  }
  return sendLibraryState(res, 200, {}, {}, user);
}

async function replaceCatalogFromBackup(state, expectedRevision, backupId, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-backup");
  const stateJson = JSON.stringify(state);
  const auditId = createAuditId();
  const rows = await query`
    WITH operation_context AS (
      SELECT
        set_config('launchflow.library_operation', 'backup.restore', true),
        set_config('launchflow.library_source', 'backup', true),
        set_config('launchflow.library_actor_email', ${user.email}, true),
        set_config('launchflow.library_actor_role', ${user.role}, true),
        set_config('launchflow.library_request_id', ${libraryRequestStorage.getStore()?.requestId || ""}, true)
    ), payload AS (SELECT ${stateJson}::jsonb AS state), allowed AS (
      SELECT 1 FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
      FOR UPDATE
    ), payload_documents AS (
      SELECT document, (ordinality - 1)::integer AS sort_order
      FROM payload, jsonb_array_elements(state->'documents') WITH ORDINALITY AS item(document, ordinality)
    ), upserted_documents AS (
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by)
      SELECT document->>'id', document, sort_order,
        CASE WHEN jsonb_typeof(document->'deletedAt') = 'string' THEN (document->>'deletedAt')::timestamptz ELSE NULL END,
        CASE WHEN jsonb_typeof(document->'archivedAt') = 'string' THEN (document->>'archivedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload_documents
      WHERE EXISTS (SELECT 1 FROM allowed)
        AND EXISTS (SELECT 1 FROM operation_context)
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        sort_order = EXCLUDED.sort_order,
        deleted_at = EXCLUDED.deleted_at,
        archived_at = EXCLUDED.archived_at,
        record_version = launchflow_library_documents.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      WHERE NOT (
        launchflow_library_documents.deleted_at IS NULL
        AND EXCLUDED.deleted_at IS NOT NULL
      )
        AND NOT (
          launchflow_library_documents.archived_at IS NULL
          AND EXCLUDED.archived_at IS NOT NULL
        )
        AND NOT (
          launchflow_library_documents.deleted_at IS NULL
          AND EXCLUDED.deleted_at IS NULL
          AND COALESCE(
            CASE
              WHEN jsonb_typeof(launchflow_library_documents.data_json) = 'string'
                THEN ((launchflow_library_documents.data_json #>> '{}')::jsonb)->>'updatedAt'
              ELSE launchflow_library_documents.data_json->>'updatedAt'
            END,
            ''
          ) > COALESCE(EXCLUDED.data_json->>'updatedAt', '')
        )
      RETURNING id
    ), payload_categories AS (
      SELECT category, (ordinality - 1)::integer AS sort_order
      FROM payload, jsonb_array_elements(state->'categories') WITH ORDINALITY AS item(category, ordinality)
    ), upserted_categories AS (
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, deleted_at, archived_at, created_by, updated_by)
      SELECT category->>'id', category, sort_order,
        CASE WHEN jsonb_typeof(category->'deletedAt') = 'string' THEN (category->>'deletedAt')::timestamptz ELSE NULL END,
        CASE WHEN jsonb_typeof(category->'archivedAt') = 'string' THEN (category->>'archivedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload_categories WHERE EXISTS (SELECT 1 FROM allowed) AND EXISTS (SELECT 1 FROM operation_context)
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        sort_order = EXCLUDED.sort_order,
        deleted_at = EXCLUDED.deleted_at,
        archived_at = EXCLUDED.archived_at,
        record_version = launchflow_library_categories.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      WHERE NOT (
        launchflow_library_categories.deleted_at IS NULL
        AND EXCLUDED.deleted_at IS NOT NULL
      )
        AND NOT (
          launchflow_library_categories.archived_at IS NULL
          AND EXCLUDED.archived_at IS NOT NULL
        )
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta
      SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision}
        AND EXISTS (SELECT 1 FROM allowed)
        AND (SELECT COUNT(*) FROM upserted_documents) >= 0
        AND (SELECT COUNT(*) FROM upserted_categories) >= 0
      RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision, details_json)
      SELECT ${auditId}, 'backup.restore', 'catalog', ${SHARED_LIBRARY_ID}, ${user.email}, ${user.role}, revision,
        jsonb_build_object(
          'backupId', ${backupId}::text,
          'mode', 'non_destructive_merge',
          'preservedBackupAbsentRecords', true,
          'preservedNewerDocuments', true,
          'preventedActiveTombstones', true,
          'initiatorName', ${user.name}::text,
          'initiatorEmail', ${user.email}::text,
          'initiatorRole', ${user.role}::text
        ) FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

module.exports._test = {
  withLibraryDatabaseDeadline,
  ensureLibrarySchema,
  getLibraryStatePayload,
  inspectLibraryVersionRecord,
  normalizeSelectedSnapshotRecords,
  requireLibraryUser,
  serializeLibraryVersionRow,
};
