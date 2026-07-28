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
      const user = requireLibraryUser(req);
      await ensureLibrarySchema();

      if (req.method === "GET" && req.query?.backups === "1") return await listLibraryBackups(res, user);
      if (req.method === "GET" && req.query?.backupId) return await getLibraryBackup(res, user, req.query.backupId);
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
  if (await isLibrarySchemaReady(sql)) return;

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
    }), "verify-schema");
    return;
  }

  await bootstrap(sql);
}

async function isLibrarySchemaReady(sql) {
  const rows = await withLibraryDatabaseDeadline(sql`
    SELECT
      to_regclass('public.launchflow_library_meta')::text AS meta,
      to_regclass('public.launchflow_library_documents')::text AS documents,
      to_regclass('public.launchflow_library_categories')::text AS categories,
      to_regclass('public.launchflow_library_backups')::text AS backups,
      to_regclass('public.launchflow_library_audit')::text AS audit
  `, "verify-schema");
  const relations = rows[0] || {};
  return Boolean(relations.meta && relations.documents && relations.categories && relations.backups && relations.audit);
}

function parseJsonRecord(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function getLibraryReadOptions(req) {
  const slugValue = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const recovery = String(req.query?.recovery || "") === "1";
  return {
    summary: String(req.query?.summary || "") === "1",
    slug: typeof slugValue === "string" ? slugValue.trim() : "",
    recovery,
    includeDeleted: recovery,
    includeDeletionAudit: recovery || String(req.query?.includeDeletionAudit || "") === "1",
  };
}

function normalizeSnapshotEntries(value) {
  const entries = Array.isArray(value) ? value : parseJsonRecord(value);
  return Array.isArray(entries) ? entries : [];
}

async function getLibraryStatePayload({
  summary = false,
  slug = "",
  recovery = false,
  includeDeleted = false,
  includeDeletionAudit = false,
} = {}, stage = "read-library-state", user = null) {
  const sql = getSql();
  const snapshotStage = `${stage}-${recovery ? "recovery" : slug ? "document" : summary ? "catalog" : "full"}-snapshot`;
  const rows = await withLibraryDatabaseDeadline(sql`
    WITH normalized_documents AS (
      SELECT id, record_version, sort_order, created_at, deleted_at,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS document
      FROM launchflow_library_documents
    ), selected_documents AS (
      SELECT id, record_version, sort_order, created_at, deleted_at, document
      FROM normalized_documents
      WHERE (${Boolean(includeDeleted)}::boolean OR deleted_at IS NULL)
        AND (${slug}::text = '' OR document->>'slug' = ${slug})
    ), normalized_categories AS (
      SELECT id, record_version, sort_order, created_at,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS category
      FROM launchflow_library_categories
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
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', selected.id,
            'dataJson', CASE WHEN ${Boolean(summary)}::boolean
              THEN jsonb_strip_nulls(jsonb_build_object(
                'id', selected.document->'id',
                'slug', selected.document->'slug',
                'title', selected.document->'title',
                'description', selected.document->'description',
                'category', selected.document->'category',
                'type', selected.document->'type',
                'tags', COALESCE(selected.document->'tags', '[]'::jsonb),
                'updatedAt', selected.document->'updatedAt',
                'status', selected.document->'status',
                'hidden', COALESCE(selected.document->'hidden', 'false'::jsonb),
                'readingMinutes', COALESCE(selected.document->'readingMinutes', '0'::jsonb),
                'body', '',
                'topics', COALESCE(selected.document->'topics', '[]'::jsonb),
                'deletedAt', selected.document->'deletedAt'
              ))
              ELSE selected.document
            END,
            'recordVersion', selected.record_version
          )
          ORDER BY selected.sort_order ASC, selected.created_at ASC, selected.id ASC
        )
        FROM selected_documents selected
      ), '[]'::jsonb) AS documents,
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
      (SELECT COUNT(*)::integer FROM normalized_documents WHERE deleted_at IS NOT NULL) AS recovery_document_count,
      CASE WHEN ${slug}::text = '' THEN NULL ELSE COALESCE((
        SELECT jsonb_strip_nulls(jsonb_build_object(
          'status', CASE WHEN document.deleted_at IS NULL THEN 'active' ELSE 'deleted' END,
          'slug', document.document->>'slug',
          'documentId', document.id,
          'title', document.document->>'title',
          'deletedAt', document.deleted_at,
          'hidden', COALESCE((document.document->>'hidden')::boolean, false),
          'recordVersion', document.record_version
        ))
        FROM normalized_documents document
        WHERE document.document->>'slug' = ${slug}
        ORDER BY document.created_at ASC, document.id ASC
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
  const snapshot = rows[0] || {};
  const documentRows = normalizeSnapshotEntries(snapshot.documents);
  const categoryRows = normalizeSnapshotEntries(snapshot.categories);
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
  const documents = documentRows.map((row) => parseJsonRecord(row.dataJson)).filter(Boolean);
  const categories = categoryRows.map((row) => parseJsonRecord(row.dataJson)).filter(Boolean);
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
    recoveryDocumentCount: Number(snapshot.recovery_document_count || 0),
  };
  if (documentStatus) {
    payload.documentStatus = {
      ...documentStatus,
      ...(documentStatus.status === "deleted" && deletionAudit?.[documentStatus.documentId]
        ? { deletionAudit: deletionAudit[documentStatus.documentId] }
        : {}),
    };
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
  const documentIdsJson = JSON.stringify(documentIds);
  const rows = await withLibraryDatabaseDeadline(sql`
    WITH deleted_documents AS (
      SELECT id, deleted_at
      FROM launchflow_library_documents
      WHERE deleted_at IS NOT NULL
        AND (
          ${documentIdsJson}::jsonb = '[]'::jsonb
          OR id IN (SELECT value FROM jsonb_array_elements_text(${documentIdsJson}::jsonb))
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
  const readStage = options.recovery
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
  const operation = normalizeLibraryMutationBody(getJsonBody(req));
  const context = libraryRequestStorage.getStore();
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
  const changed = await applyLibraryOperation(operation, user);
  if (!changed) {
    return sendLibraryState(res, 409, {
      error: "The library changed in another session or the requested record is unavailable. Reloaded the latest shared state.",
      conflict: true,
    }, readOptions, user);
  }
  const result = typeof changed === "object" ? changed : {};
  return sendLibraryState(res, 200, result, readOptions, user);
}

async function applyLibraryOperation(operation, user) {
  switch (operation.type) {
    case "catalog.initialize": return initializeCatalog(operation, user);
    case "document.create": return createDocument(operation, user);
    case "document.update": return updateDocument(operation, user);
    case "document.delete": return setDocumentDeleted(operation, user, true);
    case "document.restore": return setDocumentDeleted(operation, user, false);
    case "document.purge": return purgeDocument(operation, user);
    case "documents.restoreSystemDeleted": return restoreSystemDeletedDocuments(operation, user);
    case "documents.reorder": return reorderRecords("documents", operation.documentIds, operation.expectedRevision, operation.type, user);
    case "category.create": return createCategory(operation, user);
    case "category.update": return updateCategory(operation, user);
    case "category.delete": return setCategoryDeleted(operation, user, true);
    case "category.restore": return setCategoryDeleted(operation, user, false);
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
    WITH payload AS (
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
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, deleted_at, created_by, updated_by)
      SELECT document->>'id', document, (ordinality - 1)::integer,
        CASE WHEN jsonb_typeof(document->'deletedAt') = 'string' THEN (document->>'deletedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload, jsonb_array_elements(state->'documents') WITH ORDINALITY AS item(document, ordinality)
      WHERE EXISTS (SELECT 1 FROM can_initialize)
      RETURNING id
    ), inserted_categories AS (
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, deleted_at, created_by, updated_by)
      SELECT category->>'id', category, (ordinality - 1)::integer,
        CASE WHEN jsonb_typeof(category->'deletedAt') = 'string' THEN (category->>'deletedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload, jsonb_array_elements(state->'categories') WITH ORDINALITY AS item(category, ordinality)
      WHERE EXISTS (SELECT 1 FROM can_initialize)
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
    WITH initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), inserted AS (
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, created_by, updated_by)
      SELECT
        ${operation.document.id}, ${documentJson}::jsonb,
        COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_documents), 0),
        ${user.email}, ${user.email}
      FROM initialized
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
  const documentJson = JSON.stringify({ ...operation.document, deletedAt: undefined });
  const protectVisibility = getDocumentProtectedFields(user.role).includes("hidden");
  const auditId = createAuditId();
  const rows = await query`
    WITH initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), current_document AS (
      SELECT id,
        CASE
          WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb
          ELSE data_json
        END AS current_json
      FROM launchflow_library_documents
      WHERE id = ${operation.documentId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM initialized)
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
      RETURNING document.id
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
    SELECT revision FROM bumped
  `;
  return rows.length > 0;
}

async function setDocumentDeleted(operation, user, shouldDelete) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const auditId = createAuditId();
  const deletedAt = new Date().toISOString();
  const rows = shouldDelete ? await query`
    WITH changed AS (
      UPDATE launchflow_library_documents
      SET deleted_at = ${deletedAt}::timestamptz,
          data_json = jsonb_set(
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END,
            '{deletedAt}', to_jsonb(${deletedAt}::text), true
          ),
          record_version = record_version + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.documentId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NULL
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
    WITH changed AS (
      UPDATE launchflow_library_documents
      SET deleted_at = NULL,
          data_json = (
            CASE WHEN jsonb_typeof(data_json) = 'string' THEN (data_json #>> '{}')::jsonb ELSE data_json END
          ) - 'deletedAt',
          record_version = record_version + 1,
          updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${operation.documentId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NOT NULL
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
    WITH requested AS (
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
  const rows = await query`
    WITH changed AS (
      DELETE FROM launchflow_library_documents
      WHERE id = ${operation.documentId}
        AND record_version = ${operation.expectedVersion}
        AND deleted_at IS NOT NULL
      RETURNING id,
        CASE
          WHEN jsonb_typeof(data_json) = 'string'
            THEN ((data_json #>> '{}')::jsonb)->>'title'
          ELSE data_json->>'title'
        END AS title,
        CASE
          WHEN jsonb_typeof(data_json) = 'string'
            THEN ((data_json #>> '{}')::jsonb)->>'slug'
          ELSE data_json->>'slug'
        END AS slug,
        deleted_at
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
        ${operation.type},
        'document',
        changed.id,
        ${user.email},
        ${user.role},
        bumped.revision,
        jsonb_build_object(
          'source', 'user',
          'reason', 'Permanent document deletion',
          'actorName', ${user.name}::text,
          'documentTitle', COALESCE(changed.title, ''),
          'documentSlug', COALESCE(changed.slug, ''),
          'deletedAt', changed.deleted_at
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

async function createCategory(operation, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const categoryJson = JSON.stringify({ ...operation.category, deletedAt: undefined });
  const auditId = createAuditId();
  const rows = await query`
    WITH initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), inserted AS (
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, created_by, updated_by)
      SELECT ${operation.category.id}, ${categoryJson}::jsonb, COALESCE((SELECT MAX(sort_order) + 1 FROM launchflow_library_categories), 0), ${user.email}, ${user.email}
      FROM initialized
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
  const categoryJson = JSON.stringify({ ...operation.category, deletedAt: undefined });
  const auditId = createAuditId();
  const rows = await query`
    WITH initialized AS (
      SELECT 1 FROM launchflow_library_meta WHERE id = ${SHARED_LIBRARY_ID} AND revision > 0 FOR UPDATE
    ), current_category AS (
      SELECT id, data_json->>'name' AS old_name
      FROM launchflow_library_categories
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM initialized)
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
      WHERE document.deleted_at IS NULL AND document.data_json->>'category' = changed.old_name
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
    WITH initialized AS (
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
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NULL
        AND (SELECT COUNT(*) FROM launchflow_library_categories WHERE deleted_at IS NULL) > 1
        AND EXISTS (SELECT 1 FROM initialized)
      RETURNING id
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND EXISTS (SELECT 1 FROM changed) RETURNING revision
    ), audited AS (
      INSERT INTO launchflow_library_audit (id, operation_type, record_type, record_id, actor_email, actor_role, resulting_revision)
      SELECT ${auditId}, ${operation.type}, 'category', ${operation.categoryId}, ${user.email}, ${user.role}, revision FROM bumped RETURNING id
    ) SELECT revision FROM bumped
  ` : await query`
    WITH initialized AS (
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
      WHERE id = ${operation.categoryId} AND record_version = ${operation.expectedVersion} AND deleted_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM initialized)
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
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::integer AS active_count,
        COUNT(*) FILTER (
          WHERE id = ${operation.categoryId}
            AND record_version = ${operation.expectedVersion}
            AND deleted_at IS NULL
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

async function reorderRecords(kind, ids, expectedRevision, operationType, user) {
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-mutation");
  const idsText = ids.map((id) => Buffer.from(id, "utf8").toString("base64")).join(",");
  const auditId = createAuditId();
  const target = kind === "documents" ? "document" : "category";
  const rows = kind === "documents" ? await query`
    WITH input AS (
      SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8') AS id, (ordinality - 1)::integer AS sort_order
      FROM unnest(string_to_array(${idsText}, ',')) WITH ORDINALITY AS item(encoded_id, ordinality)
    ), valid AS (
      SELECT 1
      WHERE (SELECT COUNT(*) FROM input) > 0
        AND (SELECT COUNT(*) FROM input) = (
          SELECT COUNT(*) FROM launchflow_library_documents d JOIN input i ON i.id = d.id WHERE d.deleted_at IS NULL
        )
    ), ordered AS (
      SELECT id, sort_order FROM input
      UNION ALL
      SELECT d.id,
        ((SELECT COUNT(*) FROM input) + ROW_NUMBER() OVER (ORDER BY d.sort_order ASC, d.created_at ASC, d.id ASC) - 1)::integer AS sort_order
      FROM launchflow_library_documents d
      WHERE d.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM input i WHERE i.id = d.id)
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
        AND EXISTS (SELECT 1 FROM valid) RETURNING revision
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
    WITH input AS (
      SELECT convert_from(decode(encoded_id, 'base64'), 'UTF8') AS id, (ordinality - 1)::integer AS sort_order
      FROM unnest(string_to_array(${idsText}, ',')) WITH ORDINALITY AS item(encoded_id, ordinality)
    ), valid AS (
      SELECT 1
      WHERE (SELECT COUNT(*) FROM input) > 0
        AND (SELECT COUNT(*) FROM input) = (
          SELECT COUNT(*) FROM launchflow_library_categories c JOIN input i ON i.id = c.id WHERE c.deleted_at IS NULL
        )
    ), ordered AS (
      SELECT id, sort_order FROM input
      UNION ALL
      SELECT c.id,
        ((SELECT COUNT(*) FROM input) + ROW_NUMBER() OVER (ORDER BY c.sort_order ASC, c.created_at ASC, c.id ASC) - 1)::integer AS sort_order
      FROM launchflow_library_categories c
      WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM input i WHERE i.id = c.id)
    ), bumped AS (
      UPDATE launchflow_library_meta SET revision = revision + 1, updated_by = ${user.email}, updated_at = NOW()
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
        AND EXISTS (SELECT 1 FROM valid) RETURNING revision
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
  };
}

async function createLibraryBackup(user, reason = "manual-backup", isManual = true) {
  const payload = await getLibraryStatePayload({ includeDeleted: true }, "read-before-library-backup");
  const stateJson = JSON.stringify(payload.state);
  const sql = getSql();
  const query = createDeadlineSql(sql, "apply-library-backup");
  const rows = await query`
    INSERT INTO launchflow_library_backups (id, state_json, source_revision, reason, created_by, state_size, is_manual)
    VALUES (${createBackupId()}, ${stateJson}::jsonb, ${payload.revision}, ${String(reason || "manual-backup").slice(0, 120)}, ${user.email}, ${stateJson.length}, ${isManual})
    RETURNING id, source_revision, reason, created_by, created_at, state_size, is_manual
  `;
  await query`
    DELETE FROM launchflow_library_backups
    WHERE id IN (
      SELECT id FROM launchflow_library_backups WHERE is_manual = FALSE ORDER BY created_at DESC OFFSET ${LIBRARY_BACKUP_LIMIT}
    )
  `;
  return summarizeBackup(rows[0]);
}

async function listLibraryBackups(res, user) {
  requireLibraryAdmin(user);
  const sql = getSql();
  const query = createDeadlineSql(sql, "read-library-backups");
  const rows = await query`
    SELECT id, source_revision, reason, created_by, created_at, state_size, is_manual
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
    SELECT id, state_json, source_revision, reason, created_by, created_at, state_size, is_manual
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
  const current = await getLibraryStatePayload({ includeDeleted: true }, "read-before-library-backup-restore");
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

  await createLibraryBackup(user, "before-restore", false);
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
    WITH payload AS (SELECT ${stateJson}::jsonb AS state), allowed AS (
      SELECT 1 FROM launchflow_library_meta
      WHERE id = ${SHARED_LIBRARY_ID} AND revision = ${expectedRevision} AND revision > 0
      FOR UPDATE
    ), payload_documents AS (
      SELECT document, (ordinality - 1)::integer AS sort_order
      FROM payload, jsonb_array_elements(state->'documents') WITH ORDINALITY AS item(document, ordinality)
    ), upserted_documents AS (
      INSERT INTO launchflow_library_documents (id, data_json, sort_order, deleted_at, created_by, updated_by)
      SELECT document->>'id', document, sort_order,
        CASE WHEN jsonb_typeof(document->'deletedAt') = 'string' THEN (document->>'deletedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload_documents
      WHERE EXISTS (SELECT 1 FROM allowed)
        AND NOT EXISTS (
          SELECT 1
          FROM launchflow_library_audit purge
          WHERE purge.record_type = 'document'
            AND purge.record_id = payload_documents.document->>'id'
            AND purge.operation_type = 'document.purge'
        )
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        sort_order = EXCLUDED.sort_order,
        deleted_at = EXCLUDED.deleted_at,
        record_version = launchflow_library_documents.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      WHERE NOT (
        launchflow_library_documents.deleted_at IS NULL
        AND EXCLUDED.deleted_at IS NOT NULL
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
      INSERT INTO launchflow_library_categories (id, data_json, sort_order, deleted_at, created_by, updated_by)
      SELECT category->>'id', category, sort_order,
        CASE WHEN jsonb_typeof(category->'deletedAt') = 'string' THEN (category->>'deletedAt')::timestamptz ELSE NULL END,
        ${user.email}, ${user.email}
      FROM payload_categories WHERE EXISTS (SELECT 1 FROM allowed)
      ON CONFLICT (id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        sort_order = EXCLUDED.sort_order,
        deleted_at = EXCLUDED.deleted_at,
        record_version = launchflow_library_categories.record_version + 1,
        updated_by = ${user.email}, updated_at = NOW()
      WHERE NOT (
        launchflow_library_categories.deleted_at IS NULL
        AND EXCLUDED.deleted_at IS NOT NULL
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
  requireLibraryUser,
};
