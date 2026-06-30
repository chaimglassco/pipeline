const {
  ensureSchema,
  getBearerToken,
  getJsonBody,
  getSql,
  handleApiError,
  sendJson,
  verifyToken,
} = require("./_auth");

const SHARED_WORKSPACE_ID = "shared";
const WORKSPACE_BACKUP_LIMIT = 100;

module.exports = async function handler(req, res) {
  try {
    await ensureSchema();
    await ensureWorkspaceStateSchema();
    const user = requireWorkspaceUser(req);
    if (req.method === "GET" && req.query?.backups === "1") return listWorkspaceBackups(req, res, user);
    if (req.method === "GET" && req.query?.backupId) return getWorkspaceBackup(req, res, user);
    if (req.method === "GET") return getWorkspaceState(res);
    if (req.method === "POST") return handleWorkspaceBackupAction(req, res, user);
    if (req.method === "PATCH") return saveWorkspaceState(req, res, user);
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
  const sql = getSql();
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
      is_manual BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS launchflow_workspace_state_backups_created_at_idx ON launchflow_workspace_state_backups (created_at DESC)`;
}

async function getWorkspaceState(res) {
  const sql = getSql();
  const rows = await sql`SELECT state_json, updated_by, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const row = rows[0];
  return sendJson(res, 200, {
    state: row?.state_json ?? null,
    updatedBy: row?.updated_by ?? "",
    updatedAt: row?.updated_at ?? null,
  });
}

async function saveWorkspaceState(req, res, user) {
  const body = getJsonBody(req);
  const state = body?.state && typeof body.state === "object" && !Array.isArray(body.state) ? body.state : null;
  if (!state) return sendJson(res, 400, { error: "Workspace state is required." });

  const sql = getSql();
  await createWorkspaceBackupFromCurrentState({ reason: "auto-save", user, isManual: false });
  const stateJson = JSON.stringify(state);
  const rows = await sql`
    INSERT INTO launchflow_workspace_state (id, state_json, updated_by, updated_at)
    VALUES (${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${user.email}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      state_json = EXCLUDED.state_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING state_json, updated_by, updated_at
  `;
  const row = rows[0];
  return sendJson(res, 200, {
    state: row.state_json,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  });
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
    isManual: Boolean(row.is_manual),
  };
}

async function createWorkspaceBackupFromCurrentState({ reason, user, isManual }) {
  const sql = getSql();
  const currentRows = await sql`SELECT state_json, updated_by, updated_at FROM launchflow_workspace_state WHERE id = ${SHARED_WORKSPACE_ID} LIMIT 1`;
  const currentState = currentRows[0]?.state_json;
  if (!currentState || typeof currentState !== "object") return null;
  const stateJson = JSON.stringify(currentState);
  const id = createBackupId();
  const rows = await sql`
    INSERT INTO launchflow_workspace_state_backups (id, workspace_id, state_json, reason, created_by, source_updated_at, state_size, is_manual)
    VALUES (${id}, ${SHARED_WORKSPACE_ID}, ${stateJson}::jsonb, ${reason}, ${user.email}, ${currentRows[0].updated_at ?? null}, ${stateJson.length}, ${Boolean(isManual)})
    RETURNING id, reason, created_by, created_at, source_updated_at, state_size, is_manual
  `;
  await pruneWorkspaceBackups();
  return summarizeWorkspaceBackup(rows[0]);
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
    SELECT id, reason, created_by, created_at, source_updated_at, state_size, is_manual
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
    SELECT id, state_json, reason, created_by, created_at, source_updated_at, state_size, is_manual
    FROM launchflow_workspace_state_backups
    WHERE id = ${backupId}
    AND workspace_id = ${SHARED_WORKSPACE_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return sendJson(res, 404, { error: "Workspace backup not found." });
  return sendJson(res, 200, { backup: summarizeWorkspaceBackup(row), state: row.state_json });
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
    SELECT state_json
    FROM launchflow_workspace_state_backups
    WHERE id = ${backupId}
    AND workspace_id = ${SHARED_WORKSPACE_ID}
    LIMIT 1
  `;
  const backupState = rows[0]?.state_json;
  if (!backupState || typeof backupState !== "object") return sendJson(res, 404, { error: "Workspace backup not found." });

  await createWorkspaceBackupFromCurrentState({ reason: "before-restore", user, isManual: true });
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
  return sendJson(res, 200, {
    state: row.state_json,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  });
}
