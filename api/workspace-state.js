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

module.exports = async function handler(req, res) {
  try {
    await ensureSchema();
    await ensureWorkspaceStateSchema();
    const user = requireWorkspaceUser(req);
    if (req.method === "GET") return getWorkspaceState(res);
    if (req.method === "PATCH") return saveWorkspaceState(req, res, user);
    res.setHeader("Allow", "GET, PATCH");
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
