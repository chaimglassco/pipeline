const {
  ensureSchema,
  getBearerToken,
  getJsonBody,
  getSql,
  handleApiError,
  sendJson: sendApiJson,
  verifyToken,
} = require("./_auth");
const crypto = require("crypto");

const SHARED_WORKSPACE_ID = "shared";
const WORKSPACE_BACKUP_LIMIT = 100;
const WORKSPACE_STATE_TRANSPORT_TARGET_BYTES = 3 * 1024 * 1024;
const WORKSPACE_STATE_CHUNK_BYTES = 512 * 1024;
const WORKSPACE_STATE_BINARY_CHUNK_BYTES = 1024 * 1024;
const WORKSPACE_PATCH_MAX_BYTES = 1024 * 1024;
const WORKSPACE_UPLOAD_CHUNK_MAX_BYTES = 1024 * 1024;
const WORKSPACE_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const WORKSPACE_UPLOAD_MAX_CHUNKS = 128;
const WORKSPACE_UPLOAD_TTL_MINUTES = 30;
const WORKSPACE_MUTATION_HISTORY_LIMIT = 500;
const WORKSPACE_TABLE_FIELD_TYPES = new Set(["CUSTOM_TABLE", "HALF_TABLE"]);
const DEFAULT_PRODUCT_STAGE_IDS = new Set([
  "product-research",
  "product-development",
  "keyword-research",
  "supplier-sourcing",
  "under-final-order",
  "shipping",
  "listing-creation",
  "image-planning",
  "campaign-prep",
  "enrolled-to-vines",
  "launch",
  "amazon-inbound",
  "optimization",
  "stable",
  "scaling",
]);
let workspaceStateSchemaReadyPromise;

function sendJson(res, statusCode, payload) {
  return sendApiJson(res, statusCode, createWorkspaceTransportPayload(payload));
}

function createWorkspaceTransportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Object.prototype.hasOwnProperty.call(payload, "state")) {
    return payload;
  }
  const state = parseWorkspaceStateJson(payload.state);
  if (!state || getJsonByteLength(payload) <= WORKSPACE_STATE_TRANSPORT_TARGET_BYTES) return payload;
  if (!payload.updatedAt) return payload;
  const stateBytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  const chunkedPayload = {
    ...payload,
    state: null,
    workspaceStateChunked: true,
    workspaceStateEncoding: "base64-json",
    workspaceStateBytes: stateBytes,
    workspaceStateChunkBytes: WORKSPACE_STATE_CHUNK_BYTES,
    workspaceStateChunkCount: Math.ceil(stateBytes / WORKSPACE_STATE_CHUNK_BYTES),
  };
  console.warn("[workspace-state] serving oversized state in chunks", {
    stateBytes,
    chunkCount: chunkedPayload.workspaceStateChunkCount,
  });
  return chunkedPayload;
}

function getJsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

module.exports = async function handler(req, res) {
  try {
    const user = requireWorkspaceUser(req);
    const isBackupRequest = req.method === "POST" || (req.method === "GET" && (req.query?.backups === "1" || req.query?.backupId));
    if (isBackupRequest) {
      await ensureSchema();
      await ensureWorkspaceStateSchema();
    }
    if (req.method === "GET" && req.query?.backups === "1") return listWorkspaceBackups(req, res, user);
    if (req.method === "GET" && req.query?.backupId) return getWorkspaceBackup(req, res, user);
    if (req.method === "GET") return getWorkspaceState(req, res);
    if (req.method === "POST") return handleWorkspaceBackupAction(req, res, user);
    if (req.method === "PATCH") {
      const body = getJsonBody(req);
      const operation = String(body?.operation || "").trim();
      if (operation === "product.move") return moveWorkspaceProduct(res, user, body);
      if (operation.startsWith("workspace.replace.")) {
        await ensureSchema();
        await ensureWorkspaceStateSchema();
        return handleWorkspaceReplacement(res, user, body);
      }
      return saveWorkspaceState(req, res, user, body);
    }
    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return handleApiError(res, error);
  }
};

function requireWorkspaceUser(req) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload?.email) {
    const error = new Error("Workspace login required.");
    error.statusCode = 401;
    throw error;
  }
  return payload;
}

async function ensureWorkspaceStateSchema() {
  if (!workspaceStateSchemaReadyPromise) {
    workspaceStateSchemaReadyPromise = ensureWorkspaceStateSchemaInternal().catch((error) => {
      workspaceStateSchemaReadyPromise = null;
      throw error;
    });
  }
  return workspaceStateSchemaReadyPromise;
}

async function ensureWorkspaceStateSchemaInternal() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_storage_assets (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_base64 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(bucket, storage_path)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_workspace_state (
      id TEXT PRIMARY KEY,
      state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_workspace_state_backups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'shared',
      state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason TEXT NOT NULL DEFAULT 'auto-save',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_updated_at TIMESTAMPTZ,
      state_size INTEGER NOT NULL DEFAULT 0,
      storage_assets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      storage_asset_count INTEGER NOT NULL DEFAULT 0,
      storage_asset_size INTEGER NOT NULL DEFAULT 0,
      is_manual BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
  await sql`ALTER TABLE launchflow_workspace_state_backups ADD COLUMN IF NOT EXISTS storage_assets_json JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE launchflow_workspace_state_backups ADD COLUMN IF NOT EXISTS storage_asset_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE launchflow_workspace_state_backups ADD COLUMN IF NOT EXISTS storage_asset_size INTEGER NOT NULL DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS launchflow_workspace_state_backups_created_at_idx ON launchflow_workspace_state_backups (created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_workspace_uploads (
      upload_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'shared',
      uploaded_by TEXT NOT NULL,
      base_updated_at TIMESTAMPTZ,
      reason TEXT NOT NULL DEFAULT 'workspace-replace',
      total_bytes INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_workspace_upload_chunks (
      upload_id TEXT NOT NULL REFERENCES launchflow_workspace_uploads(upload_id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_base64 TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (upload_id, chunk_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS launchflow_workspace_uploads_expiry_idx ON launchflow_workspace_uploads (expires_at)`;
}

async function getWorkspaceState(req, res) {
  const sql = getSql();
  const startedAt = Date.now();
  const mode = String(req.query?.mode ?? "").trim();
  if (mode === "version") {
    const versionRows = await sql`SELECT updated_by, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
    const versionRow = versionRows[0];
    const payload = {
      updatedBy: versionRow?.updated_by ?? "",
      updatedAt: versionRow?.updated_at ?? null,
    };
    console.info("[workspace-state] version checked", {
      operation: "workspace.read.version",
      responseBytes: getJsonByteLength(payload),
      resultType: versionRow ? "version" : "empty",
      durationMs: Date.now() - startedAt,
    });
    return sendApiJson(res, 200, payload);
  }
  const rows = await sql`SELECT state_json, updated_by, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const row = rows[0];
  const state = parseWorkspaceStateJson(row?.state_json);
  const requestedChunk = String(req.query?.chunk ?? "").trim();
  const transport = String(req.query?.transport ?? "").trim();
  if (transport === "binary-v2") {
    if (requestedChunk) {
      return sendWorkspaceStateBinaryChunk(res, state, row?.updated_at ?? null, requestedChunk, req.query?.version);
    }
    const stateBytes = Buffer.byteLength(JSON.stringify(state ?? null), "utf8");
    const manifest = {
      state: stateBytes <= WORKSPACE_STATE_BINARY_CHUNK_BYTES ? state : null,
      workspaceStateExists: Boolean(state),
      updatedBy: row?.updated_by ?? "",
      updatedAt: row?.updated_at ?? null,
      workspaceStateBinaryChunked: stateBytes > WORKSPACE_STATE_BINARY_CHUNK_BYTES,
      workspaceStateEncoding: "binary-json-v2",
      workspaceStateBytes: stateBytes,
      workspaceStateChunkBytes: WORKSPACE_STATE_BINARY_CHUNK_BYTES,
      workspaceStateChunkCount: Math.max(1, Math.ceil(stateBytes / WORKSPACE_STATE_BINARY_CHUNK_BYTES)),
    };
    console.info("[workspace-state] binary manifest served", {
      operation: "workspace.read.binary-v2",
      responseBytes: getJsonByteLength(manifest),
      stateBytes,
      resultType: manifest.workspaceStateBinaryChunked ? "manifest" : (state ? "inline" : "empty"),
      durationMs: Date.now() - startedAt,
    });
    return sendApiJson(res, 200, manifest);
  }
  if (requestedChunk) {
    return sendWorkspaceStateChunk(res, state, row?.updated_at ?? null, requestedChunk, req.query?.version);
  }
  return sendJson(res, 200, {
    state,
    updatedBy: row?.updated_by ?? "",
    updatedAt: row?.updated_at ?? null,
  });
}

function sendWorkspaceStateBinaryChunk(res, state, updatedAt, requestedChunk, requestedVersion) {
  const startedAt = Date.now();
  const chunkIndex = Number(requestedChunk);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return sendApiJson(res, 400, { error: "Workspace state chunk index is invalid." });
  }
  const currentVersion = updatedAt ? new Date(updatedAt).toISOString() : "";
  const expectedVersion = String(requestedVersion ?? "").trim();
  if (!currentVersion || !expectedVersion || new Date(expectedVersion).getTime() !== new Date(currentVersion).getTime()) {
    return sendApiJson(res, 409, { error: "Shared workspace changed while it was loading. Retrying with the latest version is required." });
  }
  const stateBuffer = Buffer.from(JSON.stringify(state ?? null), "utf8");
  const chunkCount = Math.max(1, Math.ceil(stateBuffer.length / WORKSPACE_STATE_BINARY_CHUNK_BYTES));
  if (chunkIndex >= chunkCount) {
    return sendApiJson(res, 416, { error: "Workspace state chunk is outside the available range." });
  }
  const start = chunkIndex * WORKSPACE_STATE_BINARY_CHUNK_BYTES;
  const chunk = stateBuffer.subarray(start, start + WORKSPACE_STATE_BINARY_CHUNK_BYTES);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(chunk.length));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Workspace-Version", currentVersion);
  res.setHeader("X-Workspace-Chunk-Index", String(chunkIndex));
  res.setHeader("X-Workspace-Chunk-Count", String(chunkCount));
  console.info("[workspace-state] binary chunk served", {
    operation: "workspace.read.binary-v2",
    chunkIndex,
    responseBytes: chunk.length,
    resultType: "chunk",
    durationMs: Date.now() - startedAt,
  });
  res.end(chunk);
  return chunk;
}

function sendWorkspaceStateChunk(res, state, updatedAt, requestedChunk, requestedVersion) {
  const chunkIndex = Number(requestedChunk);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return sendApiJson(res, 400, { error: "Workspace state chunk index is invalid." });
  }
  const currentVersion = updatedAt ? new Date(updatedAt).toISOString() : "";
  const expectedVersion = String(requestedVersion ?? "").trim();
  if (!currentVersion || !expectedVersion || new Date(expectedVersion).getTime() !== new Date(currentVersion).getTime()) {
    return sendApiJson(res, 409, { error: "Shared workspace changed while it was loading. Retrying with the latest version is required." });
  }
  const stateBuffer = Buffer.from(JSON.stringify(state ?? null), "utf8");
  const chunkCount = Math.ceil(stateBuffer.length / WORKSPACE_STATE_CHUNK_BYTES);
  if (chunkIndex >= chunkCount) {
    return sendApiJson(res, 416, { error: "Workspace state chunk is outside the available range." });
  }
  const start = chunkIndex * WORKSPACE_STATE_CHUNK_BYTES;
  const chunk = stateBuffer.subarray(start, start + WORKSPACE_STATE_CHUNK_BYTES).toString("base64");
  return sendApiJson(res, 200, {
    workspaceStateChunk: chunk,
    workspaceStateChunkIndex: chunkIndex,
    workspaceStateChunkCount: chunkCount,
    workspaceStateEncoding: "base64-json",
    updatedAt: currentVersion,
  });
}

async function saveWorkspaceState(req, res, user, parsedBody = null) {
  const body = parsedBody ?? getJsonBody(req);
  const state = body?.state && typeof body.state === "object" && !Array.isArray(body.state) ? body.state : null;
  if (!state) return sendJson(res, 400, { error: "Workspace state is required." });
  const operation = String(body?.operation || "").trim() || "workspace.replace.legacy";
  const isSparsePatch = operation === "workspace.patch";
  const mutationId = String(body?.mutationId || "").trim();
  const rawRequestBytes = getJsonByteLength(body);
  if (isSparsePatch && !mutationId) return sendApiJson(res, 400, { error: "Workspace patch mutation id is required." });
  if (isSparsePatch && rawRequestBytes > WORKSPACE_PATCH_MAX_BYTES) {
    return sendApiJson(res, 413, {
      error: "Workspace patch is too large. Retry as a chunked workspace replacement.",
      maxBytes: WORKSPACE_PATCH_MAX_BYTES,
    });
  }

  const sql = getSql();
  const reason = String(body?.reason ?? "").trim();
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  if (reason.startsWith("cogs-template-save") && !isAdmin) {
    return sendJson(res, 403, { error: "Only administrators can update the shared COGS template." });
  }

  const startedAt = Date.now();
  let outcome;
  if (typeof sql.begin === "function") {
    outcome = await sql.begin(async (transaction) => {
      await transaction`SET LOCAL lock_timeout = '20s'`;
      await transaction`SET LOCAL statement_timeout = '45s'`;
      return persistWorkspaceState(transaction, user, body, { lockRow: true });
    });
  } else {
    outcome = await persistWorkspaceState(sql, user, body, { lockRow: false });
  }

  const logDetails = {
    operation,
    mutationId: mutationId || null,
    reason: reason || "workspace-save",
    rawRequestBytes,
    responseBytes: getJsonByteLength(outcome.payload),
    strategy: typeof sql.begin === "function" ? "row-lock" : "optimistic-fallback",
    durationMs: Date.now() - startedAt,
    statusCode: outcome.statusCode,
    resultType: outcome.resultType,
  };
  if (outcome.statusCode >= 400) console.warn("[workspace-state] shared save rejected", logDetails);
  else console.info("[workspace-state] shared save committed", logDetails);
  return sendJson(res, outcome.statusCode, outcome.payload);
}

async function persistWorkspaceState(sql, user, body, { lockRow = false } = {}) {
  let state = { ...body.state };
  const baseUpdatedAt = String(body?.baseUpdatedAt ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const operation = String(body?.operation || "").trim();
  const isSparsePatch = operation === "workspace.patch";
  const mutationId = String(body?.mutationId || "").trim();
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  const currentRows = lockRow
    ? await sql`SELECT state_json, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1 FOR UPDATE`
    : await sql`SELECT state_json, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);
  const currentUpdatedAt = currentRows[0]?.updated_at ?? null;
  const scopedSave = getScopedWorkspaceSaveMetadata(body);
  const appliedProductIds = scopedSave?.dirtyProductIds ?? [];
  if (isSparsePatch && currentState && hasAppliedWorkspaceMutation(currentState, mutationId)) {
    return {
      statusCode: 200,
      resultType: "already-applied",
      payload: createWorkspacePatchAcknowledgement({
        mutationId,
        updatedAt: currentUpdatedAt,
        updatedBy: String(user?.email || ""),
        appliedProductIds,
        alreadyApplied: true,
      }),
    };
  }
  const isAdminFullReplacement = isAdmin && ["admin-publish", "recovery-upload"].includes(reason);
  if (currentState && !isAdminFullReplacement) {
    if (!scopedSave) {
      if (String(body?.syncMode || "").trim() === "scoped") {
        return {
          statusCode: 200,
          resultType: "no-changes",
          payload: isSparsePatch
            ? createWorkspacePatchAcknowledgement({ mutationId, updatedAt: currentUpdatedAt, updatedBy: String(user?.email || ""), appliedProductIds: [] })
            : { state: currentState, updatedAt: currentUpdatedAt },
        };
      }
      return {
        statusCode: 409,
        resultType: "missing-scope",
        payload: compactWorkspaceConflictPayload(isSparsePatch, {
          error: "This browser needs the latest workspace sync update before it can save. Reload the app, then retry your change.",
          conflict: true,
          state: currentState,
          updatedAt: currentUpdatedAt,
        }),
      };
    }
    state = mergeScopedWorkspaceSave(currentState, state, scopedSave);
  }
  if (!baseUpdatedAt && currentUpdatedAt && !isAdminFullReplacement) {
    return {
      statusCode: 409,
      resultType: "missing-version",
      payload: compactWorkspaceConflictPayload(isSparsePatch, {
        error: "Shared workspace version is required before saving. Reloaded the latest shared version.",
        conflict: true,
        state: currentState ?? null,
        updatedAt: currentUpdatedAt,
      }),
    };
  }
  if (baseUpdatedAt && currentUpdatedAt && new Date(baseUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime()) {
    return {
      statusCode: 409,
      resultType: "stale-version",
      payload: compactWorkspaceConflictPayload(isSparsePatch, {
        error: "Shared workspace changed in another session. Reloaded the latest shared version.",
        conflict: true,
        state: currentState ?? null,
        updatedAt: currentUpdatedAt,
      }),
    };
  }

  if (!isAdmin) {
    if (currentState && typeof currentState === "object" && Object.prototype.hasOwnProperty.call(currentState, "stageSettings")) {
      state.stageSettings = currentState.stageSettings;
    } else {
      delete state.stageSettings;
    }
    if (currentState?.workspaceDetails && typeof currentState.workspaceDetails === "object") {
      const nextWorkspaceDetails = state.workspaceDetails && typeof state.workspaceDetails === "object" && !Array.isArray(state.workspaceDetails)
        ? { ...state.workspaceDetails }
        : {};
      nextWorkspaceDetails.stageFieldTemplates = mergeTableTemplateAdjustments(
        currentState.workspaceDetails.stageFieldTemplates ?? {},
        nextWorkspaceDetails.stageFieldTemplates ?? {},
      );
      state.workspaceDetails = nextWorkspaceDetails;
    }
    preserveAdminKeywordResearchStructure(state, currentState?.keywordResearchSettings);
    preserveAdminCogsTemplate(state, currentState?.cogsTemplateSettings);
    sanitizeProductStagesForStageSettings(state, currentState?.stageSettings);
    sanitizeWorkspaceDetailsStagesForStageSettings(state, currentState?.stageSettings);
  }
  preserveWorkspaceProductImages(state, currentState, reason);
  prunePurgedProductHistoryEntries(state);
  appendWorkspaceSaveAuditEntry(state, currentState, { reason, user });
  if (isSparsePatch) appendAppliedWorkspaceMutation(state, mutationId);
  const stateJson = JSON.stringify(state);
  let rows;
  if (isAdminFullReplacement) {
    rows = await sql`
      INSERT INTO launchflow_workspace_state (id, state_json, updated_by, updated_at)
      VALUES (${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${user.email}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        state_json = EXCLUDED.state_json,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING state_json, updated_by, updated_at
    `;
  } else if (currentRows[0]) {
    rows = lockRow
      ? await sql`
        UPDATE launchflow_workspace_state
        SET state_json = ${stateJson}::jsonb,
            updated_by = ${user.email},
            updated_at = NOW()
        WHERE id = ${SHARED_WORKSPACE_ID}
        RETURNING state_json, updated_by, updated_at
      `
      : await sql`
        UPDATE launchflow_workspace_state
        SET state_json = ${stateJson}::jsonb,
            updated_by = ${user.email},
            updated_at = NOW()
        WHERE id = ${SHARED_WORKSPACE_ID}
          AND updated_at = ${currentUpdatedAt}
        RETURNING state_json, updated_by, updated_at
      `;
  } else {
    rows = await sql`
      INSERT INTO launchflow_workspace_state (id, state_json, updated_by, updated_at)
      VALUES (${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${user.email}, NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING state_json, updated_by, updated_at
    `;
  }
  if (!rows.length) {
    const latestRows = await sql`SELECT state_json, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
    return {
      statusCode: 409,
      resultType: "commit-race",
      payload: compactWorkspaceConflictPayload(isSparsePatch, {
        error: "Shared workspace changed while this save was being committed. Reloaded the latest shared version.",
        conflict: true,
        state: parseWorkspaceStateJson(latestRows[0]?.state_json),
        updatedAt: latestRows[0]?.updated_at ?? null,
      }),
    };
  }
  const row = rows[0];
  return {
    statusCode: 200,
    resultType: "committed",
    payload: isSparsePatch
      ? createWorkspacePatchAcknowledgement({
        mutationId,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
        appliedProductIds,
      })
      : {
        state: parseWorkspaceStateJson(row.state_json),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      },
  };
}

function compactWorkspaceConflictPayload(isSparsePatch, payload) {
  if (!isSparsePatch) return payload;
  const { state, ...compactPayload } = payload;
  return compactPayload;
}

function createWorkspacePatchAcknowledgement({ mutationId, updatedBy, updatedAt, appliedProductIds, alreadyApplied = false }) {
  return {
    updatedBy: updatedBy || "",
    updatedAt: updatedAt ?? null,
    mutationResult: {
      mutationId,
      appliedProductIds: normalizeIdList(appliedProductIds),
      alreadyApplied: Boolean(alreadyApplied),
    },
  };
}

function hasAppliedWorkspaceMutation(state, mutationId) {
  if (!mutationId) return false;
  return (Array.isArray(state?.workspaceMutationIds) ? state.workspaceMutationIds : [])
    .some((entry) => String(entry?.id ?? entry ?? "").trim() === mutationId);
}

function appendAppliedWorkspaceMutation(state, mutationId) {
  if (!state || typeof state !== "object" || !mutationId) return;
  const existing = Array.isArray(state.workspaceMutationIds) ? state.workspaceMutationIds : [];
  state.workspaceMutationIds = [
    { id: mutationId, appliedAt: new Date().toISOString() },
    ...existing.filter((entry) => String(entry?.id ?? entry ?? "").trim() !== mutationId),
  ].slice(0, WORKSPACE_MUTATION_HISTORY_LIMIT);
}

async function handleWorkspaceReplacement(res, user, body) {
  requireWorkspaceAdmin(user);
  const operation = String(body?.operation || "").trim();
  if (operation === "workspace.replace.begin") return beginWorkspaceReplacement(res, user, body);
  if (operation === "workspace.replace.chunk") return uploadWorkspaceReplacementChunk(res, user, body);
  if (operation === "workspace.replace.finalize") return finalizeWorkspaceReplacement(res, user, body);
  return sendApiJson(res, 400, { error: "Unknown workspace replacement operation." });
}

function normalizeWorkspaceUploadId(value) {
  const uploadId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{12,160}$/.test(uploadId) ? uploadId : "";
}

async function beginWorkspaceReplacement(res, user, body) {
  const sql = getSql();
  const startedAt = Date.now();
  const uploadId = normalizeWorkspaceUploadId(body?.uploadId);
  const totalBytes = Number(body?.totalBytes);
  const chunkCount = Number(body?.chunkCount);
  const sha256 = String(body?.sha256 || "").trim().toLowerCase();
  const reason = String(body?.reason || "admin-publish").trim() || "admin-publish";
  const baseUpdatedAt = String(body?.baseUpdatedAt || "").trim() || null;
  if (!uploadId || !["admin-publish", "recovery-upload"].includes(reason)
    || !Number.isInteger(totalBytes) || totalBytes < 1 || totalBytes > WORKSPACE_UPLOAD_MAX_BYTES
    || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > WORKSPACE_UPLOAD_MAX_CHUNKS
    || chunkCount !== Math.ceil(totalBytes / WORKSPACE_UPLOAD_CHUNK_MAX_BYTES)
    || !/^[a-f0-9]{64}$/.test(sha256)) {
    return sendApiJson(res, 400, { error: "Workspace replacement manifest is invalid." });
  }
  await sql`DELETE FROM launchflow_workspace_uploads WHERE expires_at <= NOW()`;
  const rows = await sql`
    INSERT INTO launchflow_workspace_uploads (upload_id, workspace_id, uploaded_by, base_updated_at, reason, total_bytes, chunk_count, sha256, expires_at)
    VALUES (${uploadId}, ${SHARED_WORKSPACE_ID}, ${user.email}, ${baseUpdatedAt}, ${reason}, ${totalBytes}, ${chunkCount}, ${sha256}, NOW() + (${WORKSPACE_UPLOAD_TTL_MINUTES} * INTERVAL '1 minute'))
    ON CONFLICT (upload_id) DO NOTHING
    RETURNING upload_id, expires_at
  `;
  if (!rows.length) {
    const existing = await sql`
      SELECT upload_id, uploaded_by, total_bytes, chunk_count, sha256, expires_at
      FROM launchflow_workspace_uploads WHERE upload_id = ${uploadId} LIMIT 1
    `;
    const upload = existing[0];
    if (!upload || String(upload.uploaded_by).toLowerCase() !== String(user.email).toLowerCase()
      || Number(upload.total_bytes) !== totalBytes || Number(upload.chunk_count) !== chunkCount || String(upload.sha256) !== sha256) {
      return sendApiJson(res, 409, { error: "Workspace replacement upload id is already in use." });
    }
  }
  const payload = { uploadId, chunkCount, maxChunkBytes: WORKSPACE_UPLOAD_CHUNK_MAX_BYTES, expiresAt: rows[0]?.expires_at ?? null };
  console.info("[workspace-state] replacement upload begun", {
    operation: "workspace.replace.begin",
    mutationId: uploadId,
    rawRequestBytes: getJsonByteLength(body),
    responseBytes: getJsonByteLength(payload),
    resultType: "upload-begun",
    durationMs: Date.now() - startedAt,
  });
  return sendApiJson(res, 200, payload);
}

async function uploadWorkspaceReplacementChunk(res, user, body) {
  const sql = getSql();
  const startedAt = Date.now();
  const uploadId = normalizeWorkspaceUploadId(body?.uploadId);
  const chunkIndex = Number(body?.chunkIndex);
  const chunkBase64 = String(body?.chunk || "");
  if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !chunkBase64) {
    return sendApiJson(res, 400, { error: "Workspace replacement chunk is invalid." });
  }
  let chunk;
  try {
    chunk = Buffer.from(chunkBase64, "base64");
  } catch {
    return sendApiJson(res, 400, { error: "Workspace replacement chunk encoding is invalid." });
  }
  if (chunk.length < 1 || chunk.length > WORKSPACE_UPLOAD_CHUNK_MAX_BYTES
    || chunk.toString("base64").replace(/=+$/, "") !== chunkBase64.replace(/=+$/, "")) {
    return sendApiJson(res, 400, { error: "Workspace replacement chunk encoding or size is invalid." });
  }
  const uploads = await sql`
    SELECT upload_id, uploaded_by, total_bytes, chunk_count, expires_at
    FROM launchflow_workspace_uploads
    WHERE upload_id = ${uploadId} AND workspace_id = ${SHARED_WORKSPACE_ID} AND expires_at > NOW()
    LIMIT 1
  `;
  const upload = uploads[0];
  if (!upload) return sendApiJson(res, 404, { error: "Workspace replacement upload expired or was not found." });
  if (String(upload.uploaded_by).toLowerCase() !== String(user.email).toLowerCase()) return sendApiJson(res, 403, { error: "Workspace replacement upload belongs to another user." });
  if (chunkIndex >= Number(upload.chunk_count)) return sendApiJson(res, 416, { error: "Workspace replacement chunk index is outside the manifest." });
  const expectedBytes = chunkIndex === Number(upload.chunk_count) - 1
    ? Number(upload.total_bytes) - (chunkIndex * WORKSPACE_UPLOAD_CHUNK_MAX_BYTES)
    : WORKSPACE_UPLOAD_CHUNK_MAX_BYTES;
  if (chunk.length !== expectedBytes) return sendApiJson(res, 400, { error: "Workspace replacement chunk size does not match the manifest." });
  await sql`
    INSERT INTO launchflow_workspace_upload_chunks (upload_id, chunk_index, chunk_base64, byte_length)
    VALUES (${uploadId}, ${chunkIndex}, ${chunkBase64}, ${chunk.length})
    ON CONFLICT (upload_id, chunk_index) DO UPDATE SET
      chunk_base64 = EXCLUDED.chunk_base64,
      byte_length = EXCLUDED.byte_length,
      created_at = NOW()
  `;
  const payload = { uploadId, chunkIndex, receivedBytes: chunk.length };
  console.info("[workspace-state] replacement chunk stored", {
    operation: "workspace.replace.chunk",
    mutationId: uploadId,
    rawRequestBytes: getJsonByteLength(body),
    responseBytes: getJsonByteLength(payload),
    chunkIndex,
    resultType: "chunk-stored",
    durationMs: Date.now() - startedAt,
  });
  return sendApiJson(res, 200, payload);
}

async function finalizeWorkspaceReplacement(res, user, body) {
  const sql = getSql();
  const startedAt = Date.now();
  const uploadId = normalizeWorkspaceUploadId(body?.uploadId);
  if (!uploadId) return sendApiJson(res, 400, { error: "Workspace replacement upload id is invalid." });
  const outcome = typeof sql.begin === "function"
    ? await sql.begin((transaction) => finalizeWorkspaceReplacementTransaction(transaction, user, uploadId))
    : await finalizeWorkspaceReplacementTransaction(sql, user, uploadId);
  console.info("[workspace-state] replacement finalized", {
    operation: "workspace.replace.finalize",
    mutationId: uploadId,
    rawRequestBytes: getJsonByteLength(body),
    responseBytes: getJsonByteLength(outcome.payload),
    resultType: outcome.resultType,
    durationMs: Date.now() - startedAt,
  });
  return sendApiJson(res, outcome.statusCode, outcome.payload);
}

async function finalizeWorkspaceReplacementTransaction(sql, user, uploadId) {
  const uploads = await sql`
    SELECT upload_id, uploaded_by, base_updated_at, reason, total_bytes, chunk_count, sha256, expires_at
    FROM launchflow_workspace_uploads
    WHERE upload_id = ${uploadId} AND workspace_id = ${SHARED_WORKSPACE_ID}
    LIMIT 1 FOR UPDATE
  `;
  const upload = uploads[0];
  if (!upload || new Date(upload.expires_at).getTime() <= Date.now()) {
    return { statusCode: 404, resultType: "upload-expired", payload: { error: "Workspace replacement upload expired or was not found." } };
  }
  if (String(upload.uploaded_by).toLowerCase() !== String(user.email).toLowerCase()) {
    return { statusCode: 403, resultType: "wrong-owner", payload: { error: "Workspace replacement upload belongs to another user." } };
  }
  const rows = await sql`
    SELECT chunk_index, chunk_base64, byte_length
    FROM launchflow_workspace_upload_chunks
    WHERE upload_id = ${uploadId}
    ORDER BY chunk_index ASC
  `;
  try {
    const { bytes, state } = assembleWorkspaceReplacement(upload, rows);
    const saved = await persistWorkspaceState(sql, user, {
      state,
      baseUpdatedAt: upload.base_updated_at,
      reason: String(upload.reason || "admin-publish"),
    }, { lockRow: true });
    if (saved.statusCode >= 400) return saved;
    await sql`DELETE FROM launchflow_workspace_uploads WHERE upload_id = ${uploadId}`;
    return {
      statusCode: 200,
      resultType: "replacement-committed",
      payload: {
        uploadId,
        updatedBy: saved.payload.updatedBy,
        updatedAt: saved.payload.updatedAt,
        appliedBytes: bytes.length,
      },
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 400,
      resultType: error.resultType || "invalid-upload",
      payload: { error: error.message || "Workspace replacement upload is invalid." },
    };
  }
}

function assembleWorkspaceReplacement(upload, rows) {
  if (!upload || new Date(upload.expires_at).getTime() <= Date.now()) {
    const error = new Error("Workspace replacement upload expired or was not found.");
    error.statusCode = 404;
    error.resultType = "upload-expired";
    throw error;
  }
  if (!Array.isArray(rows) || rows.length !== Number(upload.chunk_count)
    || rows.some((row, index) => Number(row.chunk_index) !== index)) {
    const error = new Error("Workspace replacement upload is incomplete.");
    error.statusCode = 409;
    error.resultType = "incomplete-upload";
    throw error;
  }
  const bytes = Buffer.concat(rows.map((row) => Buffer.from(String(row.chunk_base64), "base64")));
  if (bytes.length !== Number(upload.total_bytes) || crypto.createHash("sha256").update(bytes).digest("hex") !== String(upload.sha256)) {
    const error = new Error("Workspace replacement upload checksum validation failed.");
    error.resultType = "checksum-mismatch";
    throw error;
  }
  let state;
  try {
    state = JSON.parse(bytes.toString("utf8"));
  } catch {
    const error = new Error("Workspace replacement is not valid JSON.");
    error.resultType = "invalid-json";
    throw error;
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    const error = new Error("Workspace replacement state is invalid.");
    error.resultType = "invalid-state";
    throw error;
  }
  return { bytes, state };
}

async function moveWorkspaceProduct(res, user, body) {
  const sql = getSql();
  const startedAt = Date.now();
  const mutationId = String(body?.mutationId || "").trim();
  console.info("[workspace-state] compact product move started", {
    mutationId,
    expectedStageId: String(body?.expectedStageId || "").trim(),
    targetStageId: String(body?.targetStageId || "").trim(),
  });
  if (typeof sql.begin === "function") {
    const outcome = await sql.begin(async (transaction) => {
      await transaction`SET LOCAL lock_timeout = '5s'`;
      await transaction`SET LOCAL statement_timeout = '15s'`;
      const currentRows = await transaction`
        SELECT state_json, updated_at
        FROM launchflow_workspace_state
        WHERE id = ${SHARED_WORKSPACE_ID}
        LIMIT 1
        FOR UPDATE
      `;
      const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);
      const currentUpdatedAt = currentRows[0]?.updated_at ?? null;
      if (!currentState) {
        return { statusCode: 404, payload: { error: "Shared workspace has not been initialized yet." }, resultType: "missing" };
      }

      let result;
      try {
        result = applyWorkspaceProductMove(currentState, body, user);
      } catch (error) {
        return {
          statusCode: error.statusCode || 400,
          payload: {
            error: error.message || "Product could not be moved.",
            conflict: Boolean(error.conflict),
            updatedAt: currentUpdatedAt,
            mutationResult: error.mutationResult,
          },
          resultType: "rejected",
        };
      }

      if (!result.changed) {
        return {
          statusCode: 200,
          payload: {
            updatedBy: String(user?.email || ""),
            updatedAt: currentUpdatedAt,
            mutationResult: result.mutationResult,
          },
          resultType: "already-applied",
        };
      }

      const stateJson = JSON.stringify(result.state);
      const updatedRows = await transaction`
        UPDATE launchflow_workspace_state
        SET state_json = ${stateJson}::jsonb,
            updated_by = ${String(user?.email || "")},
            updated_at = NOW()
        WHERE id = ${SHARED_WORKSPACE_ID}
        RETURNING updated_by, updated_at
      `;
      return {
        statusCode: 200,
        payload: {
          updatedBy: updatedRows[0].updated_by,
          updatedAt: updatedRows[0].updated_at,
          mutationResult: result.mutationResult,
        },
        resultType: "committed",
      };
    });

    const logDetails = {
      mutationId,
      strategy: "row-lock",
      durationMs: Date.now() - startedAt,
    };
    if (outcome.resultType === "committed") {
      console.info("[workspace-state] compact product move committed", {
        ...logDetails,
        responseBytes: JSON.stringify(outcome.payload.mutationResult).length,
      });
    } else if (outcome.resultType === "already-applied") {
      console.info("[workspace-state] compact product move already applied", logDetails);
    } else {
      console.warn("[workspace-state] compact product move rejected", {
        ...logDetails,
        statusCode: outcome.statusCode,
        conflict: Boolean(outcome.payload.conflict),
      });
    }
    return sendJson(res, outcome.statusCode, outcome.payload);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentRows = await sql`SELECT state_json, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
    const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);
    const currentUpdatedAt = currentRows[0]?.updated_at ?? null;
    if (!currentState) return sendJson(res, 404, { error: "Shared workspace has not been initialized yet." });

    let result;
    try {
      result = applyWorkspaceProductMove(currentState, body, user);
    } catch (error) {
      console.warn("[workspace-state] compact product move rejected", {
        mutationId,
        attempt: attempt + 1,
        statusCode: error.statusCode || 400,
        conflict: Boolean(error.conflict),
        durationMs: Date.now() - startedAt,
      });
      return sendJson(res, error.statusCode || 400, {
        error: error.message || "Product could not be moved.",
        conflict: Boolean(error.conflict),
        updatedAt: currentUpdatedAt,
        mutationResult: error.mutationResult,
      });
    }

    if (!result.changed) {
      console.info("[workspace-state] compact product move already applied", {
        mutationId,
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
      });
      return sendJson(res, 200, {
        updatedBy: String(user?.email || ""),
        updatedAt: currentUpdatedAt,
        mutationResult: result.mutationResult,
      });
    }

    const stateJson = JSON.stringify(result.state);
    const updatedRows = await sql`
      UPDATE launchflow_workspace_state
      SET state_json = ${stateJson}::jsonb,
          updated_by = ${String(user?.email || "")},
          updated_at = NOW()
      WHERE id = ${SHARED_WORKSPACE_ID}
      AND updated_at = ${currentUpdatedAt}
      RETURNING updated_by, updated_at
    `;
    if (!updatedRows.length) continue;

    console.info("[workspace-state] compact product move committed", {
      mutationId,
      attempt: attempt + 1,
      strategy: "optimistic-fallback",
      durationMs: Date.now() - startedAt,
      responseBytes: JSON.stringify(result.mutationResult).length,
    });
    return sendJson(res, 200, {
      updatedBy: updatedRows[0].updated_by,
      updatedAt: updatedRows[0].updated_at,
      mutationResult: result.mutationResult,
    });
  }

  console.warn("[workspace-state] compact product move exhausted retries", {
    mutationId,
    strategy: "optimistic-fallback",
    durationMs: Date.now() - startedAt,
  });
  return sendJson(res, 409, {
    error: "The shared workspace changed while this product was moving. Please retry.",
    conflict: true,
  });
}

function applyWorkspaceProductMove(currentState, body, user) {
  const productId = String(body?.productId || "").trim();
  const expectedStageId = String(body?.expectedStageId || "").trim();
  const targetStageId = String(body?.targetStageId || "").trim();
  const mutationId = String(body?.mutationId || "").trim();
  if (!productId || !expectedStageId || !targetStageId || !mutationId) {
    throw createWorkspaceMoveError("Product, current stage, target stage, and mutation id are required.");
  }

  const allowedStageIds = getAllowedProductStageIds(currentState);
  if (!allowedStageIds.has(targetStageId)) {
    throw createWorkspaceMoveError("The selected product stage is unavailable.");
  }

  const userProducts = Array.isArray(currentState.userProducts) ? currentState.userProducts : [];
  const userProductIndex = userProducts.findIndex((product) => String(product?.id || "").trim() === productId);
  const currentEdit = currentState?.productSettings?.edits?.[productId];
  const currentStageId = String(userProductIndex >= 0 ? userProducts[userProductIndex]?.stageId : currentEdit?.stageId || expectedStageId).trim();
  const mutationResult = { mutationId, productId, previousStageId: expectedStageId, stageId: targetStageId };

  if (currentStageId === targetStageId) return { state: currentState, changed: false, mutationResult };
  if (currentStageId !== expectedStageId) {
    const error = createWorkspaceMoveError("This product was already moved in another session. Latest stage loaded.", 409);
    error.conflict = true;
    error.mutationResult = { ...mutationResult, stageId: currentStageId };
    throw error;
  }

  const nextState = cloneJsonObject(currentState);
  if (userProductIndex >= 0) {
    nextState.userProducts = userProducts.map((product, index) => index === userProductIndex ? { ...product, stageId: targetStageId } : product);
  } else {
    const product = body?.product && typeof body.product === "object" && !Array.isArray(body.product) ? body.product : {};
    nextState.productSettings = cloneJsonObject(currentState.productSettings);
    nextState.productSettings.edits = cloneJsonObject(currentState?.productSettings?.edits);
    nextState.productSettings.edits[productId] = {
      ...cloneJsonObject(currentEdit),
      name: String(product.name ?? currentEdit?.name ?? "").trim(),
      sku: String(product.sku ?? currentEdit?.sku ?? "").trim(),
      asin: String(product.asin ?? currentEdit?.asin ?? "").trim(),
      stageId: targetStageId,
    };
  }

  const historyEntry = createCompactMoveHistoryEntry(currentState, body, user, {
    productId,
    currentStageId,
    targetStageId,
    userProduct: userProductIndex >= 0 ? userProducts[userProductIndex] : null,
    currentEdit,
  });
  if (historyEntry) {
    nextState.workspaceDetails = cloneJsonObject(currentState.workspaceDetails);
    nextState.workspaceDetails.productHistory = mergeHistoryEntries(currentState?.workspaceDetails?.productHistory, [historyEntry]);
  }
  const activityEntry = normalizeCompactMoveEntry(body?.activityEntry, productId);
  if (activityEntry) nextState.activityLog = mergeActivityLogEntries(currentState.activityLog, [activityEntry]);
  appendWorkspaceSaveAuditEntry(nextState, currentState, { reason: "product-move", user });

  return { state: nextState, changed: true, mutationResult };
}

function getAllowedProductStageIds(state) {
  const order = Array.isArray(state?.stageSettings?.order) ? state.stageSettings.order : [];
  const hiddenStageIds = new Set(Array.isArray(state?.stageSettings?.hiddenStageIds) ? state.stageSettings.hiddenStageIds.map((stageId) => String(stageId || "").trim()) : []);
  const configuredStageIds = order.map((stageId) => String(stageId || "").trim()).filter((stageId) => stageId && !hiddenStageIds.has(stageId));
  return new Set(configuredStageIds.length > 0 ? configuredStageIds : DEFAULT_PRODUCT_STAGE_IDS);
}

function normalizeCompactMoveEntry(entry, productId) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const id = String(entry.id || "").trim();
  if (!id || String(entry.productId || "").trim() !== productId) return null;
  return cloneJsonObject(entry);
}

function createCompactMoveHistoryEntry(currentState, body, user, { productId, currentStageId, targetStageId, userProduct, currentEdit }) {
  const metadata = body?.productHistoryEntry;
  const id = String(metadata?.id || "").trim();
  if (!id) return null;
  const suppliedProduct = body?.product && typeof body.product === "object" && !Array.isArray(body.product) ? body.product : {};
  const currentProduct = userProduct || {
    id: productId,
    name: String(suppliedProduct.name ?? currentEdit?.name ?? "").trim(),
    sku: String(suppliedProduct.sku ?? currentEdit?.sku ?? "").trim(),
    asin: String(suppliedProduct.asin ?? currentEdit?.asin ?? "").trim(),
    readinessPercent: Number(suppliedProduct.readinessPercent ?? 0),
  };
  if (!String(currentProduct?.name || "").trim()) return null;
  const previousProduct = { ...cloneJsonObject(currentProduct), id: productId, stageId: currentStageId };
  const nextProduct = { ...previousProduct, stageId: targetStageId };
  return {
    id,
    action: "move",
    productId,
    productName: String(nextProduct.name || "").trim(),
    previousProduct: { product: previousProduct, productDetails: null },
    nextProduct: { product: nextProduct, productDetails: null },
    changedByName: String(user?.name || "").trim(),
    changedByEmail: String(user?.email || "").trim().toLowerCase(),
    changedByRole: String(user?.role || "").trim().toUpperCase(),
    timestamp: Number(metadata?.timestamp) || Date.now(),
  };
}

function createWorkspaceMoveError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function preserveAdminCogsTemplate(state, currentTemplateSettings) {
  if (!state || typeof state !== "object") return;
  if (currentTemplateSettings && typeof currentTemplateSettings === "object" && !Array.isArray(currentTemplateSettings)) {
    state.cogsTemplateSettings = currentTemplateSettings;
  } else {
    delete state.cogsTemplateSettings;
  }
}

function getScopedWorkspaceSaveMetadata(body) {
  if (String(body?.syncMode || "").trim() !== "scoped") return null;
  const dirtyKeys = Array.from(new Set((Array.isArray(body?.dirtyKeys) ? body.dirtyKeys : [])
    .map((key) => String(key || "").trim())
    .filter(Boolean)));
  const dirtyProductIds = Array.from(new Set((Array.isArray(body?.dirtyProductIds) ? body.dirtyProductIds : [])
    .map((productId) => String(productId || "").trim())
    .filter(Boolean)));
  const dirtyTemplateStageIds = Array.from(new Set((Array.isArray(body?.dirtyTemplateStageIds) ? body.dirtyTemplateStageIds : [])
    .map((stageId) => String(stageId || "").trim())
    .filter(Boolean)));
  const dirtyProductStageIds = normalizeDirtyProductStageIds(body?.dirtyProductStageIds);
  const dirtyProductFieldIds = normalizeDirtyProductFieldIds(body?.dirtyProductFieldIds);
  const dirtyProductMetadataIds = Array.from(new Set((Array.isArray(body?.dirtyProductMetadataIds) ? body.dirtyProductMetadataIds : [])
    .map((productId) => String(productId || "").trim())
    .filter(Boolean)));
  const dirtyFieldHistoryIds = normalizeIdList(body?.dirtyFieldHistoryIds);
  const removedFieldHistoryIds = normalizeIdList(body?.removedFieldHistoryIds);
  const dirtyProductHistoryIds = normalizeIdList(body?.dirtyProductHistoryIds);
  const removedProductHistoryIds = normalizeIdList(body?.removedProductHistoryIds);
  const dirtyActivityIds = normalizeIdList(body?.dirtyActivityIds);
  const removedActivityIds = normalizeIdList(body?.removedActivityIds);
  const historyDeltaV2 = String(body?.operation || "").trim() === "workspace.patch";
  return dirtyKeys.length > 0 || dirtyProductIds.length > 0 || dirtyTemplateStageIds.length > 0
    || dirtyFieldHistoryIds.length > 0 || removedFieldHistoryIds.length > 0
    || dirtyProductHistoryIds.length > 0 || removedProductHistoryIds.length > 0
    || dirtyActivityIds.length > 0 || removedActivityIds.length > 0
    ? {
      dirtyKeys,
      dirtyProductIds,
      dirtyTemplateStageIds,
      dirtyProductStageIds,
      dirtyProductFieldIds,
      dirtyProductMetadataIds,
      dirtyFieldHistoryIds,
      removedFieldHistoryIds,
      dirtyProductHistoryIds,
      removedProductHistoryIds,
      dirtyActivityIds,
      removedActivityIds,
      historyDeltaV2,
    }
    : null;
}

function normalizeIdList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function normalizeDirtyProductStageIds(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source)
    .map(([productId, stageIds]) => [String(productId || "").trim(), Array.from(new Set((Array.isArray(stageIds) ? stageIds : [])
      .map((stageId) => String(stageId || "").trim())
      .filter(Boolean)))] )
    .filter(([productId, stageIds]) => productId && stageIds.length > 0));
}

function normalizeDirtyProductFieldIds(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source)
    .map(([productId, stages]) => [String(productId || "").trim(), normalizeDirtyProductStageIds(stages)])
    .filter(([productId, stages]) => productId && Object.keys(stages).length > 0));
}

function mergeScopedWorkspaceSave(currentState, nextState, {
  dirtyKeys,
  dirtyProductIds,
  dirtyTemplateStageIds = [],
  dirtyProductStageIds = {},
  dirtyProductFieldIds = {},
  dirtyProductMetadataIds = [],
  dirtyFieldHistoryIds = [],
  removedFieldHistoryIds = [],
  dirtyProductHistoryIds = [],
  removedProductHistoryIds = [],
  dirtyActivityIds = [],
  removedActivityIds = [],
  historyDeltaV2 = false,
}) {
  const current = currentState && typeof currentState === "object" ? currentState : {};
  const incoming = nextState && typeof nextState === "object" ? nextState : {};
  const merged = { ...current };
  const changedKeys = new Set(dirtyKeys);

  if (changedKeys.has("userProducts") || dirtyProductIds.length > 0) {
    merged.userProducts = mergeScopedProducts(current.userProducts, incoming.userProducts, dirtyProductIds);
  }
  if (changedKeys.has("productSettings") || dirtyProductIds.length > 0) {
    merged.productSettings = mergeScopedProductSettings(current.productSettings, incoming.productSettings, dirtyProductIds);
  }
  if (changedKeys.has("workspaceDetails") || dirtyProductIds.length > 0) {
    merged.workspaceDetails = mergeScopedWorkspaceDetails(
      current.workspaceDetails,
      incoming.workspaceDetails,
      dirtyProductIds,
      dirtyTemplateStageIds,
      dirtyProductStageIds,
      dirtyProductFieldIds,
      dirtyProductMetadataIds,
      dirtyFieldHistoryIds,
      removedFieldHistoryIds,
      dirtyProductHistoryIds,
      removedProductHistoryIds,
      historyDeltaV2,
      incoming.userProducts,
      incoming.productSettings,
    );
  }

  const wholeWorkspaceKeys = [
    "stageSettings",
    "workspaceBranding",
    "dashboardSettings",
    "campaignPrepSettings",
    "keywordResearchSettings",
    "vineSettings",
    "launchMonitoringSettings",
    "cogsTemplateSettings",
  ];
  for (const key of wholeWorkspaceKeys) {
    if (changedKeys.has(key) && Object.prototype.hasOwnProperty.call(incoming, key)) merged[key] = incoming[key];
  }
  if (changedKeys.has("activityLog") || dirtyActivityIds.length || removedActivityIds.length) {
    merged.activityLog = mergeActivityLogEntries(
      removeHistoryEntries(current.activityLog, removedActivityIds),
      historyDeltaV2 ? selectHistoryEntries(incoming.activityLog, dirtyActivityIds) : incoming.activityLog,
    );
  }
  return merged;
}

function mergeScopedProducts(currentProducts, incomingProducts, dirtyProductIds) {
  const currentById = new Map(normalizeWorkspaceProducts(currentProducts).map((product) => [product.id, product]));
  const incomingById = new Map(normalizeWorkspaceProducts(incomingProducts).map((product) => [product.id, product]));
  for (const productId of dirtyProductIds) {
    if (incomingById.has(productId)) currentById.set(productId, incomingById.get(productId));
    else currentById.delete(productId);
  }
  return Array.from(currentById.values());
}

function mergeScopedProductSettings(currentSettings, incomingSettings, dirtyProductIds) {
  const current = normalizeWorkspaceProductSettings(currentSettings);
  const incoming = normalizeWorkspaceProductSettings(incomingSettings);
  const edits = { ...current.edits };
  const deletedProductIds = new Set(current.deletedProductIds);
  const deletedProductSnapshots = new Map(current.deletedProductSnapshots);
  for (const productId of dirtyProductIds) {
    if (Object.prototype.hasOwnProperty.call(incoming.edits, productId)) edits[productId] = incoming.edits[productId];
    else delete edits[productId];
    if (incoming.deletedProductIds.has(productId)) deletedProductIds.add(productId);
    else deletedProductIds.delete(productId);
    if (incoming.deletedProductSnapshots.has(productId)) deletedProductSnapshots.set(productId, incoming.deletedProductSnapshots.get(productId));
    else deletedProductSnapshots.delete(productId);
  }
  return {
    edits,
    deletedProductIds: Array.from(deletedProductIds),
    deletedProductSnapshots: Array.from(deletedProductSnapshots.values()),
    purgedProductHistoryIds: Array.from(new Set([...current.purgedProductHistoryIds, ...incoming.purgedProductHistoryIds])),
  };
}

function mergeScopedWorkspaceDetails(currentDetails, incomingDetails, dirtyProductIds, dirtyTemplateStageIds, dirtyProductStageIds, dirtyProductFieldIds, dirtyProductMetadataIds, dirtyFieldHistoryIds, removedFieldHistoryIds, dirtyProductHistoryIds, removedProductHistoryIds, historyDeltaV2, incomingProducts, incomingProductSettings) {
  const current = normalizeWorkspaceDetailsForScopedSave(currentDetails);
  const incoming = normalizeWorkspaceDetailsForScopedSave(incomingDetails);
  const products = { ...current.products };
  const incomingProductIds = new Set(normalizeWorkspaceProducts(incomingProducts).map((product) => product.id));
  const incomingDeletedProductIds = normalizeWorkspaceProductSettings(incomingProductSettings).deletedProductIds;
  for (const productId of dirtyProductIds) {
    if (incomingDeletedProductIds.has(productId) && !incomingProductIds.has(productId)) {
      delete products[productId];
    } else if (Object.prototype.hasOwnProperty.call(incoming.products, productId)) {
      products[productId] = mergeScopedWorkspaceProductDetails(
        current.products[productId],
        incoming.products[productId],
        dirtyProductStageIds[productId] ?? [],
        dirtyProductFieldIds[productId] ?? {},
        dirtyProductMetadataIds.includes(productId),
      );
    }
  }
  return {
    products,
    stageFieldTemplates: mergeScopedStageFieldTemplates(current.stageFieldTemplates, incoming.stageFieldTemplates, dirtyTemplateStageIds),
    fieldHistory: mergeHistoryEntries(
      removeHistoryEntries(current.fieldHistory, removedFieldHistoryIds),
      historyDeltaV2 ? selectHistoryEntries(incoming.fieldHistory, dirtyFieldHistoryIds) : incoming.fieldHistory,
    ),
    productHistory: mergeHistoryEntries(
      removeHistoryEntries(current.productHistory, removedProductHistoryIds),
      historyDeltaV2 ? selectHistoryEntries(incoming.productHistory, dirtyProductHistoryIds) : incoming.productHistory,
    ),
  };
}

function selectHistoryEntries(entries, dirtyIds) {
  const allowedIds = new Set(normalizeIdList(dirtyIds));
  if (allowedIds.size === 0) return [];
  return (Array.isArray(entries) ? entries : []).filter((entry) => allowedIds.has(String(entry?.id || "").trim()));
}

function removeHistoryEntries(entries, removedIds) {
  const ids = new Set(normalizeIdList(removedIds));
  if (ids.size === 0) return Array.isArray(entries) ? entries : [];
  return (Array.isArray(entries) ? entries : []).filter((entry) => !ids.has(String(entry?.id || "").trim()));
}

function mergeScopedWorkspaceProductDetails(currentDetails, incomingDetails, dirtyStageIds, dirtyFieldIdsByStage, shouldMergeMetadata) {
  if (!currentDetails || typeof currentDetails !== "object") return incomingDetails;
  const current = currentDetails;
  const incoming = incomingDetails && typeof incomingDetails === "object" ? incomingDetails : {};
  const merged = { ...current, stages: { ...(current.stages && typeof current.stages === "object" ? current.stages : {}) } };
  if (shouldMergeMetadata) {
    ["imageDataUrl", "imageStoragePath", "imageUrl", "financials", "chatReadBy", "chatMessages"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) merged[key] = incoming[key];
    });
  }
  const incomingStages = incoming.stages && typeof incoming.stages === "object" ? incoming.stages : {};
  for (const stageId of dirtyStageIds) {
    if (Object.prototype.hasOwnProperty.call(incomingStages, stageId)) merged.stages[stageId] = incomingStages[stageId];
    else delete merged.stages[stageId];
  }
  for (const [stageId, fieldIds] of Object.entries(dirtyFieldIdsByStage)) {
    if (dirtyStageIds.includes(stageId)) continue;
    merged.stages[stageId] = mergeScopedWorkspaceStageDetails(
      merged.stages[stageId],
      incomingStages[stageId],
      fieldIds,
    );
  }
  return merged;
}

function mergeScopedWorkspaceStageDetails(currentDetails, incomingDetails, dirtyFieldIds) {
  if (!currentDetails || typeof currentDetails !== "object") return incomingDetails;
  const current = currentDetails;
  const incoming = incomingDetails && typeof incomingDetails === "object" ? incomingDetails : {};
  const currentFields = new Map((Array.isArray(current.customFields) ? current.customFields : [])
    .filter((field) => String(field?.fieldId || "").trim())
    .map((field) => [String(field.fieldId).trim(), field]));
  const incomingFields = new Map((Array.isArray(incoming.customFields) ? incoming.customFields : [])
    .filter((field) => String(field?.fieldId || "").trim())
    .map((field) => [String(field.fieldId).trim(), field]));
  for (const fieldId of dirtyFieldIds) {
    if (incomingFields.has(fieldId)) currentFields.set(fieldId, incomingFields.get(fieldId));
    else currentFields.delete(fieldId);
  }
  return {
    ...current,
    customFields: Array.from(currentFields.values()),
  };
}

function mergeScopedStageFieldTemplates(currentTemplates, incomingTemplates, dirtyTemplateStageIds) {
  const templates = { ...(currentTemplates && typeof currentTemplates === "object" ? currentTemplates : {}) };
  const incoming = incomingTemplates && typeof incomingTemplates === "object" ? incomingTemplates : {};
  for (const stageId of dirtyTemplateStageIds) {
    if (Object.prototype.hasOwnProperty.call(incoming, stageId)) templates[stageId] = incoming[stageId];
    else delete templates[stageId];
  }
  return templates;
}

function normalizeWorkspaceProducts(products) {
  return (Array.isArray(products) ? products : [])
    .filter((product) => product && typeof product === "object" && String(product.id || "").trim())
    .map((product) => ({ ...product, id: String(product.id).trim() }));
}

function normalizeWorkspaceProductSettings(settings) {
  const snapshots = Array.isArray(settings?.deletedProductSnapshots) ? settings.deletedProductSnapshots : [];
  const snapshotByProductId = new Map(snapshots
    .filter((entry) => entry && typeof entry === "object" && String(entry.productId || "").trim())
    .map((entry) => [String(entry.productId).trim(), { ...entry, productId: String(entry.productId).trim() }]));
  return {
    edits: settings?.edits && typeof settings.edits === "object" ? { ...settings.edits } : {},
    deletedProductIds: new Set((Array.isArray(settings?.deletedProductIds) ? settings.deletedProductIds : []).map((productId) => String(productId || "")).filter(Boolean)),
    deletedProductSnapshots: snapshotByProductId,
    purgedProductHistoryIds: new Set((Array.isArray(settings?.purgedProductHistoryIds) ? settings.purgedProductHistoryIds : []).map((entryId) => String(entryId || "")).filter(Boolean)),
  };
}

function normalizeWorkspaceDetailsForScopedSave(details) {
  const source = details && typeof details === "object" ? details : {};
  return {
    products: source.products && typeof source.products === "object" ? { ...source.products } : {},
    stageFieldTemplates: source.stageFieldTemplates && typeof source.stageFieldTemplates === "object" ? source.stageFieldTemplates : {},
    fieldHistory: Array.isArray(source.fieldHistory) ? source.fieldHistory : [],
    productHistory: Array.isArray(source.productHistory) ? source.productHistory : [],
  };
}

function mergeHistoryEntries(currentEntries, incomingEntries) {
  const entries = new Map();
  for (const entry of [...(Array.isArray(currentEntries) ? currentEntries : []), ...(Array.isArray(incomingEntries) ? incomingEntries : [])]) {
    const id = String(entry?.id || "").trim();
    if (id) entries.set(id, entry);
  }
  return Array.from(entries.values())
    .sort((firstEntry, secondEntry) => Number(secondEntry?.timestamp || 0) - Number(firstEntry?.timestamp || 0))
    .slice(0, 1000);
}

function mergeActivityLogEntries(currentEntries, incomingEntries) {
  return mergeHistoryEntries(currentEntries, incomingEntries)
    .sort((firstEntry, secondEntry) => Number(secondEntry?.timestamp || 0) - Number(firstEntry?.timestamp || 0))
    .slice(0, 250);
}

function parseWorkspaceStateJson(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsedValue = JSON.parse(value);
    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

function appendWorkspaceSaveAuditEntry(nextState, currentState, { reason, user }) {
  const cleanReason = String(reason || "workspace-save").trim() || "workspace-save";
  const diff = getWorkspaceProductDiff(currentState, nextState);
  const beforeCount = getVisibleWorkspaceProducts(currentState).length;
  const afterCount = getVisibleWorkspaceProducts(nextState).length;
  const isConflictRetry = cleanReason.includes("conflict-retry") || cleanReason.includes("product-confirm-retry");
  const isAdminPublish = cleanReason === "admin-publish";
  const isBackupRelated = cleanReason.includes("backup");
  const isProductReason = cleanReason.startsWith("product-");
  const shouldAudit = isAdminPublish || isConflictRetry || isBackupRelated || isProductReason || diff.addedProducts.length || diff.removedProducts.length;
  if (!shouldAudit) return;

  let actionType = cleanReason;
  let icon = "history";
  let label = "Saved shared workspace";
  let detail = summarizeWorkspaceProductCountChange(currentState, nextState);
  let productId = "";
  let productName = "";
  let stageId = "";

  const firstAdded = diff.addedProducts[0];
  const firstRemoved = diff.removedProducts[0];
  const firstChanged = diff.changedProducts[0];
  const firstMoved = diff.movedProducts[0];

  if (isAdminPublish) {
    actionType = "workspace-admin-publish";
    icon = "cloud_upload";
    label = "Published admin workspace";
    detail = summarizeWorkspaceOverwrite("Admin publish", currentState, nextState, diff);
  } else if (cleanReason.startsWith("product-delete-forever")) {
    const purgedProducts = getPurgedDeletedProducts(currentState, nextState);
    const product = purgedProducts[0] || firstRemoved || firstChanged;
    actionType = "product-delete-forever";
    icon = "delete_forever";
    label = product ? `Deleted forever: ${product.name}` : "Deleted product forever";
    detail = product ? summarizeProductAuditDetail(product, "Removed from recovery") : "Removed a product from recovery.";
    productId = product?.id || "";
    productName = product?.name || "";
    stageId = product?.stageId || "";
  } else if (cleanReason.startsWith("product-delete")) {
    const product = firstRemoved || firstChanged;
    actionType = "product-delete";
    icon = "delete";
    label = product ? `Deleted product: ${product.name}` : "Deleted product";
    detail = product ? summarizeProductAuditDetail(product, "Moved to recovery") : "Moved a product to recovery.";
    productId = product?.id || "";
    productName = product?.name || "";
    stageId = product?.stageId || "";
  } else if (cleanReason.startsWith("product-restore")) {
    const product = firstAdded || firstChanged;
    actionType = "product-restore";
    icon = "restore";
    label = product ? `Restored product: ${product.name}` : "Restored product";
    detail = product ? summarizeProductAuditDetail(product, "Returned from recovery") : "Restored a product from recovery.";
    productId = product?.id || "";
    productName = product?.name || "";
    stageId = product?.stageId || "";
  } else if (cleanReason.startsWith("product-move")) {
    const product = firstMoved || firstChanged;
    actionType = "product-move";
    icon = "move_up";
    label = product ? `Moved product: ${product.name}` : "Moved product";
    detail = product ? `${product.beforeStageLabel} -> ${product.afterStageLabel}` : "Moved a product.";
    productId = product?.id || "";
    productName = product?.name || "";
    stageId = product?.stageId || "";
  } else if (cleanReason.startsWith("product-save")) {
    const product = firstAdded || firstChanged;
    actionType = firstAdded ? "product-create" : "product-edit";
    icon = firstAdded ? "add_box" : "edit";
    label = product ? `${firstAdded ? "Created" : "Edited"} product: ${product.name}` : "Saved product";
    detail = product ? summarizeProductAuditDetail(product, firstAdded ? "Saved to shared workspace" : "Updated in shared workspace") : "Saved product changes to shared workspace.";
    productId = product?.id || "";
    productName = product?.name || "";
    stageId = product?.stageId || "";
  } else if (isConflictRetry) {
    actionType = "workspace-conflict-retry";
    icon = "sync_problem";
    label = "Resolved workspace save conflict";
    detail = summarizeWorkspaceProductCountChange(currentState, nextState);
  }

  appendWorkspaceAuditEntry(nextState, createWorkspaceAuditEntry({
    actionType,
    icon,
    label,
    detail,
    user,
    productId,
    productName,
    stageId,
    beforeCount,
    afterCount,
    removedProducts: diff.removedProducts,
    addedProducts: diff.addedProducts,
  }));
}

function appendWorkspaceAuditEntry(state, entry) {
  if (!state || typeof state !== "object" || !entry) return;
  const currentActivity = Array.isArray(state.activityLog) ? state.activityLog : [];
  state.activityLog = [entry, ...currentActivity.filter((item) => String(item?.id || "") !== entry.id)].slice(0, 250);
}

function createWorkspaceAuditEntry({ actionType, icon, label, detail, user, productId = "", productName = "", stageId = "", beforeCount, afterCount, removedProducts = [], addedProducts = [] }) {
  return {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    icon: icon || "history",
    label: label || "Workspace audit",
    detail: detail || "",
    stageId: stageId || "",
    productId: productId || "",
    productName: productName || "",
    timestamp: Date.now(),
    auditType: actionType || "workspace-audit",
    actorName: String(user?.name || "").trim(),
    actorEmail: String(user?.email || "").trim().toLowerCase(),
    actorRole: String(user?.role || "").trim().toUpperCase(),
    productCountBefore: Number(beforeCount) || 0,
    productCountAfter: Number(afterCount) || 0,
    removedProducts: normalizeAuditProductList(removedProducts),
    addedProducts: normalizeAuditProductList(addedProducts),
  };
}

function getWorkspaceProductDiff(beforeState, afterState) {
  const beforeProducts = getVisibleWorkspaceProducts(beforeState);
  const afterProducts = getVisibleWorkspaceProducts(afterState);
  const beforeById = new Map(beforeProducts.map((product) => [product.id, product]));
  const afterById = new Map(afterProducts.map((product) => [product.id, product]));
  const addedProducts = afterProducts.filter((product) => !beforeById.has(product.id));
  const removedProducts = beforeProducts.filter((product) => !afterById.has(product.id));
  const changedProducts = [];
  const movedProducts = [];
  for (const [productId, afterProduct] of afterById.entries()) {
    const beforeProduct = beforeById.get(productId);
    if (!beforeProduct) continue;
    if (JSON.stringify(beforeProduct) !== JSON.stringify(afterProduct)) {
      changedProducts.push(afterProduct);
    }
    if (beforeProduct.stageId !== afterProduct.stageId) {
      movedProducts.push({
        ...afterProduct,
        beforeStageId: beforeProduct.stageId,
        beforeStageLabel: getAuditStageLabel(beforeProduct.stageId),
        afterStageLabel: getAuditStageLabel(afterProduct.stageId),
      });
    }
  }
  return { addedProducts, removedProducts, changedProducts, movedProducts };
}

function getVisibleWorkspaceProducts(state) {
  const rawProducts = Array.isArray(state?.userProducts) ? state.userProducts : [];
  const edits = state?.productSettings?.edits && typeof state.productSettings.edits === "object" ? state.productSettings.edits : {};
  const deletedProductIds = new Set(Array.isArray(state?.productSettings?.deletedProductIds)
    ? state.productSettings.deletedProductIds.map((productId) => String(productId || ""))
    : []);
  return rawProducts
    .map((product) => normalizeAuditProduct({ ...product, ...(edits[String(product?.id || "")] || {}) }))
    .filter((product) => product && !deletedProductIds.has(product.id));
}

function getPurgedDeletedProducts(beforeState, afterState) {
  const beforeSnapshots = getDeletedProductSnapshotsByProductId(beforeState);
  const afterSnapshots = getDeletedProductSnapshotsByProductId(afterState);
  return Array.from(beforeSnapshots.entries())
    .filter(([productId]) => !afterSnapshots.has(productId))
    .map(([, product]) => product)
    .filter(Boolean);
}

function getDeletedProductSnapshotsByProductId(state) {
  const snapshots = Array.isArray(state?.productSettings?.deletedProductSnapshots) ? state.productSettings.deletedProductSnapshots : [];
  const map = new Map();
  for (const snapshot of snapshots) {
    const product = normalizeAuditProduct(snapshot?.previousProduct?.product || snapshot?.nextProduct?.product || snapshot?.product);
    if (product) map.set(product.id, product);
  }
  return map;
}

function normalizeAuditProduct(product) {
  const id = String(product?.id || "").trim();
  const name = String(product?.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    sku: String(product?.sku || "").trim(),
    asin: String(product?.asin || "").trim(),
    stageId: String(product?.stageId || "").trim(),
    stageLabel: getAuditStageLabel(product?.stageId),
  };
}

function normalizeAuditProductList(products) {
  return (Array.isArray(products) ? products : [])
    .map(normalizeAuditProduct)
    .filter(Boolean)
    .slice(0, 20);
}

function summarizeWorkspaceProductCountChange(beforeState, afterState) {
  return `${getVisibleWorkspaceProducts(beforeState).length} products before -> ${getVisibleWorkspaceProducts(afterState).length} products after`;
}

function summarizeWorkspaceOverwrite(prefix, beforeState, afterState, diff) {
  const removed = diff.removedProducts.length ? ` Removed: ${diff.removedProducts.map((product) => product.name).slice(0, 5).join(", ")}.` : "";
  const added = diff.addedProducts.length ? ` Added: ${diff.addedProducts.map((product) => product.name).slice(0, 5).join(", ")}.` : "";
  return `${prefix}: ${summarizeWorkspaceProductCountChange(beforeState, afterState)}.${removed}${added}`.trim();
}

function summarizeProductAuditDetail(product, suffix) {
  const identifiers = [`Stage: ${product.stageLabel || "Pipeline"}`];
  if (product.sku) identifiers.push(`SKU: ${product.sku}`);
  if (product.asin) identifiers.push(`ASIN: ${product.asin}`);
  return `${identifiers.join(" | ")}. ${suffix}.`;
}

function getAuditStageLabel(stageId) {
  const cleanStageId = String(stageId || "").trim();
  if (!cleanStageId) return "";
  return cleanStageId
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function preserveAdminKeywordResearchStructure(state, currentKeywordSettings) {
  if (!state || typeof state !== "object") return;
  if (!currentKeywordSettings || typeof currentKeywordSettings !== "object" || Array.isArray(currentKeywordSettings)) return;
  const nextKeywordSettings = state.keywordResearchSettings && typeof state.keywordResearchSettings === "object" && !Array.isArray(state.keywordResearchSettings)
    ? { ...state.keywordResearchSettings }
    : {};
  if (Object.prototype.hasOwnProperty.call(currentKeywordSettings, "columns")) {
    nextKeywordSettings.columns = currentKeywordSettings.columns;
  }
  if (Object.prototype.hasOwnProperty.call(currentKeywordSettings, "spreadsheetUrl")) {
    nextKeywordSettings.spreadsheetUrl = currentKeywordSettings.spreadsheetUrl;
  }
  state.keywordResearchSettings = nextKeywordSettings;
}

function getVisibleStageIds(stageSettings) {
  const order = Array.isArray(stageSettings?.order) ? stageSettings.order.map((stageId) => String(stageId ?? "").trim()).filter(Boolean) : [];
  const hiddenStageIds = new Set(Array.isArray(stageSettings?.hiddenStageIds)
    ? stageSettings.hiddenStageIds.map((stageId) => String(stageId ?? "").trim()).filter(Boolean)
    : []);
  const visibleStageIds = order.filter((stageId) => !hiddenStageIds.has(stageId));
  return visibleStageIds.length ? visibleStageIds : ["product-research"];
}

function sanitizeProductStagesForStageSettings(state, stageSettings) {
  if (!state || typeof state !== "object") return;
  const visibleStageIds = getVisibleStageIds(stageSettings);
  const visibleStageIdSet = new Set(visibleStageIds);
  const fallbackStageId = visibleStageIds[0] || "product-research";
  if (Array.isArray(state.userProducts)) {
    state.userProducts = state.userProducts.map((product) => {
      if (!product || typeof product !== "object") return product;
      const stageId = String(product.stageId ?? "").trim();
      return visibleStageIdSet.has(stageId) ? product : { ...product, stageId: fallbackStageId };
    });
  }
  const edits = state.productSettings?.edits;
  if (edits && typeof edits === "object" && !Array.isArray(edits)) {
    state.productSettings = { ...state.productSettings, edits: { ...edits } };
    for (const [productId, edit] of Object.entries(edits)) {
      if (!edit || typeof edit !== "object") continue;
      const stageId = String(edit.stageId ?? "").trim();
      if (!visibleStageIdSet.has(stageId)) {
        state.productSettings.edits[productId] = { ...edit, stageId: fallbackStageId };
      }
    }
  }
}

function sanitizeWorkspaceDetailsStagesForStageSettings(state, stageSettings) {
  if (!state?.workspaceDetails || typeof state.workspaceDetails !== "object" || Array.isArray(state.workspaceDetails)) return;
  const visibleStageIdSet = new Set(getVisibleStageIds(stageSettings));
  const products = state.workspaceDetails.products;
  if (!products || typeof products !== "object" || Array.isArray(products)) return;

  state.workspaceDetails = { ...state.workspaceDetails, products: { ...products } };
  for (const [productId, productDetails] of Object.entries(products)) {
    if (!productDetails || typeof productDetails !== "object" || Array.isArray(productDetails)) continue;
    const stages = productDetails.stages;
    if (!stages || typeof stages !== "object" || Array.isArray(stages)) continue;
    const sanitizedStages = Object.fromEntries(
      Object.entries(stages).filter(([stageId]) => visibleStageIdSet.has(String(stageId ?? "").trim())),
    );
    state.workspaceDetails.products[productId] = { ...productDetails, stages: sanitizedStages };
  }
}

function prunePurgedProductHistoryEntries(state) {
  if (!state?.workspaceDetails || typeof state.workspaceDetails !== "object" || Array.isArray(state.workspaceDetails)) return;
  const purgedHistoryIds = Array.isArray(state.productSettings?.purgedProductHistoryIds)
    ? new Set(state.productSettings.purgedProductHistoryIds.map((entryId) => String(entryId ?? "").trim()).filter(Boolean))
    : new Set();
  if (purgedHistoryIds.size === 0 || !Array.isArray(state.workspaceDetails.productHistory)) return;
  state.workspaceDetails = {
    ...state.workspaceDetails,
    productHistory: state.workspaceDetails.productHistory.filter((entry) => !purgedHistoryIds.has(String(entry?.id ?? "").trim())),
  };
}

function requireWorkspaceAdmin(user) {
  if (String(user?.role || "").toUpperCase() !== "ADMIN") {
    const error = new Error("Admin access required.");
    error.statusCode = 401;
    throw error;
  }
}

function createBackupId() {
  return `workspace_backup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeWorkspaceBackup(row) {
  return {
    id: row.id,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sourceUpdatedAt: row.source_updated_at,
    stateSize: row.state_size,
    storageAssetCount: Number(row.storage_asset_count ?? 0) || 0,
    storageAssetSize: Number(row.storage_asset_size ?? 0) || 0,
    isManual: Boolean(row.is_manual),
  };
}

async function createWorkspaceBackupFromCurrentState({ reason, user, isManual }) {
  const sql = getSql();
  const currentRows = await sql`SELECT state_json, updated_by, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);
  if (!currentState || typeof currentState !== "object") return null;
  const stateJson = JSON.stringify(currentState);
  const storageAssets = isManual ? await getStorageAssetBackupSnapshot() : [];
  const storageAssetsJson = JSON.stringify(storageAssets);
  const id = createBackupId();
  const rows = await sql`
    INSERT INTO launchflow_workspace_state_backups (id, workspace_id, state_json, reason, created_by, source_updated_at, state_size, storage_assets_json, storage_asset_count, storage_asset_size, is_manual)
    VALUES (${id}, ${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${reason}, ${user.email}, ${currentRows[0].updated_at ?? null}, ${stateJson.length}, ${storageAssetsJson}::jsonb, ${storageAssets.length}, ${storageAssetsJson.length}, ${Boolean(isManual)})
    RETURNING id, reason, created_by, created_at, source_updated_at, state_size, storage_asset_count, storage_asset_size, is_manual
  `;
  await pruneWorkspaceBackups();
  return summarizeWorkspaceBackup(rows[0]);
}

async function getStorageAssetBackupSnapshot() {
  const sql = getSql();
  const rows = await sql`
    SELECT id, bucket, storage_path, content_type, file_base64, uploaded_by, created_at, updated_at
    FROM launchflow_storage_assets
    ORDER BY updated_at DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    bucket: row.bucket,
    storagePath: row.storage_path,
    contentType: row.content_type,
    fileBase64: row.file_base64,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function restoreStorageAssetBackupSnapshot(storageAssets) {
  const assets = Array.isArray(storageAssets) ? storageAssets : [];
  if (assets.length === 0) return;
  const sql = getSql();
  for (const asset of assets) {
    const id = String(asset?.id || `${asset?.bucket || ""}/${asset?.storagePath || ""}`).trim();
    const bucket = String(asset?.bucket || "").trim();
    const storagePath = String(asset?.storagePath ?? asset?.storage_path ?? "").trim();
    const contentType = String(asset?.contentType ?? asset?.content_type ?? "application/octet-stream").trim() || "application/octet-stream";
    const fileBase64 = String(asset?.fileBase64 ?? asset?.file_base64 ?? "");
    const uploadedBy = String(asset?.uploadedBy ?? asset?.uploaded_by ?? "");
    if (!id || !bucket || !storagePath || !fileBase64) continue;
    await sql`
      INSERT INTO launchflow_storage_assets (id, bucket, storage_path, content_type, file_base64, uploaded_by, updated_at)
      VALUES (${id}, ${bucket}, ${storagePath}, ${contentType}, ${fileBase64}, ${uploadedBy}, NOW())
      ON CONFLICT (bucket, storage_path) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        file_base64 = EXCLUDED.file_base64,
        uploaded_by = EXCLUDED.uploaded_by,
        updated_at = NOW()
    `;
  }
}

async function pruneWorkspaceBackups() {
  const sql = getSql();
  await sql`
    DELETE FROM launchflow_workspace_state_backups
    WHERE id IN (
      SELECT id FROM launchflow_workspace_state_backups
      WHERE workspace_id = ${SHARED_WORKSPACE_ID}
      AND is_manual = FALSE
      ORDER BY created_at DESC
      OFFSET ${WORKSPACE_BACKUP_LIMIT}
    )
  `;
}

async function listWorkspaceBackups(req, res, user) {
  requireWorkspaceAdmin(user);
  const sql = getSql();
  const rows = await sql`
    SELECT id, reason, created_by, created_at, source_updated_at, state_size, storage_asset_count, storage_asset_size, is_manual
    FROM launchflow_workspace_state_backups
    WHERE workspace_id = ${SHARED_WORKSPACE_ID}
    ORDER BY created_at DESC
    LIMIT ${WORKSPACE_BACKUP_LIMIT}
  `;
  return sendJson(res, 200, { backups: rows.map(summarizeWorkspaceBackup) });
}

async function getWorkspaceBackup(req, res, user) {
  requireWorkspaceAdmin(user);
  const backupId = String(req.query.backupId || "").trim();
  const sql = getSql();
  const rows = await sql`
    SELECT id, state_json, storage_assets_json, reason, created_by, created_at, source_updated_at, state_size, storage_asset_count, storage_asset_size, is_manual
    FROM launchflow_workspace_state_backups
    WHERE id = ${backupId}
    AND workspace_id = ${SHARED_WORKSPACE_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return sendJson(res, 404, { error: "Workspace backup not found." });
  return sendJson(res, 200, { backup: summarizeWorkspaceBackup(row), state: parseWorkspaceStateJson(row.state_json), storageAssets: row.storage_assets_json ?? [] });
}

function mergeTableTemplateAdjustments(currentTemplatesByStage, nextTemplatesByStage) {
  const mergedTemplatesByStage = cloneJsonObject(currentTemplatesByStage);
  const proposedTemplatesByStage = nextTemplatesByStage && typeof nextTemplatesByStage === "object" && !Array.isArray(nextTemplatesByStage)
    ? nextTemplatesByStage
    : {};
  for (const [stageId, proposedTemplates] of Object.entries(proposedTemplatesByStage)) {
    if (!Array.isArray(proposedTemplates)) continue;
    const currentTemplates = Array.isArray(mergedTemplatesByStage[stageId]) ? mergedTemplatesByStage[stageId] : [];
    mergedTemplatesByStage[stageId] = currentTemplates.map((currentTemplate) => {
      if (!WORKSPACE_TABLE_FIELD_TYPES.has(String(currentTemplate?.type ?? ""))) return currentTemplate;
      const proposedTemplate = proposedTemplates.find((template) => (
        String(template?.fieldId ?? "") === String(currentTemplate.fieldId ?? "")
        && String(template?.type ?? "") === String(currentTemplate.type ?? "")
      ));
      if (!proposedTemplate) return currentTemplate;
      return {
        ...currentTemplate,
        tableColumns: normalizeStringList(proposedTemplate.tableColumns),
        tableRows: normalizeStringList(proposedTemplate.tableRows),
        tableCornerHeader: String(proposedTemplate.tableCornerHeader ?? "").trim(),
        tableColumnWidths: normalizeNumberList(proposedTemplate.tableColumnWidths),
        tableRowHeights: normalizeNumberList(proposedTemplate.tableRowHeights),
      };
    });
  }
  return mergedTemplatesByStage;
}

function preserveWorkspaceProductImages(nextState, currentState, reason) {
  if (String(reason || "").includes("product-image-delete")) return;
  const nextProducts = nextState?.workspaceDetails?.products;
  const currentProducts = currentState?.workspaceDetails?.products;
  if (!nextProducts || typeof nextProducts !== "object" || Array.isArray(nextProducts)) return;
  if (!currentProducts || typeof currentProducts !== "object" || Array.isArray(currentProducts)) return;

  for (const [productId, nextProductDetails] of Object.entries(nextProducts)) {
    const currentProductDetails = currentProducts[productId];
    if (!nextProductDetails || typeof nextProductDetails !== "object" || Array.isArray(nextProductDetails)) continue;
    if (hasWorkspaceProductImageReference(nextProductDetails) || !hasWorkspaceProductImageReference(currentProductDetails)) continue;
    nextProductDetails.imageStoragePath = String(currentProductDetails.imageStoragePath ?? "");
    nextProductDetails.imageUrl = String(currentProductDetails.imageUrl ?? "");
  }
}

function hasWorkspaceProductImageReference(productDetails) {
  return Boolean(String(productDetails?.imageStoragePath ?? "").trim() || String(productDetails?.imageUrl ?? "").trim());
}

function cloneJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function normalizeNumberList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
}

async function handleWorkspaceBackupAction(req, res, user) {
  requireWorkspaceAdmin(user);
  const body = getJsonBody(req);
  const action = String(body?.action || "").trim();
  if (action === "create-backup") {
    const backup = await createWorkspaceBackupFromCurrentState({ reason: "manual-backup", user, isManual: true });
    if (!backup) return sendJson(res, 404, { error: "There is no shared workspace state to back up yet." });
    return sendJson(res, 200, { backup });
  }
  if (action === "restore-backup") return restoreWorkspaceBackup(req, res, user, body);
  return sendJson(res, 400, { error: "Unknown workspace backup action." });
}

async function restoreWorkspaceBackup(req, res, user, body) {
  const backupId = String(body?.backupId || "").trim();
  if (!backupId) return sendJson(res, 400, { error: "Backup id is required." });
  const sql = getSql();
  const rows = await sql`
    SELECT state_json, storage_assets_json
    FROM launchflow_workspace_state_backups
    WHERE id = ${backupId}
    AND workspace_id = ${SHARED_WORKSPACE_ID}
    LIMIT 1
  `;
  const backupState = parseWorkspaceStateJson(rows[0]?.state_json);
  if (!backupState || typeof backupState !== "object") return sendJson(res, 404, { error: "Workspace backup not found." });

  const currentRows = await sql`SELECT state_json, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);
  await createWorkspaceBackupFromCurrentState({ reason: "before-restore", user, isManual: true });
  await restoreStorageAssetBackupSnapshot(rows[0]?.storage_assets_json);
  appendWorkspaceAuditEntry(backupState, createWorkspaceAuditEntry({
    actionType: "workspace-backup-restore",
    icon: "restore",
    label: "Restored workspace backup",
    detail: summarizeWorkspaceProductCountChange(currentState, backupState),
    user,
    beforeCount: getVisibleWorkspaceProducts(currentState).length,
    afterCount: getVisibleWorkspaceProducts(backupState).length,
    removedProducts: getWorkspaceProductDiff(currentState, backupState).removedProducts,
    addedProducts: getWorkspaceProductDiff(currentState, backupState).addedProducts,
  }));
  const stateJson = JSON.stringify(backupState);
  const updatedRows = await sql`
    INSERT INTO launchflow_workspace_state (id, state_json, updated_by, updated_at)
    VALUES (${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${user.email}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      state_json = EXCLUDED.state_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING state_json, updated_by, updated_at
  `;
  const row = updatedRows[0];
  return sendApiJson(res, 200, {
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    restoreResult: { backupId, appliedProductIds: getVisibleWorkspaceProducts(backupState).map((product) => product.id) },
  });
}
