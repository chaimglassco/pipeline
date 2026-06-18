const { ensureSchema, getBearerToken, getSql, handleApiError, sanitizeUser, sendJson, verifyToken } = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });
  try {
    await ensureSchema();
    const payload = verifyToken(getBearerToken(req));
    if (!payload) return sendJson(res, 401, { error: "Session expired." });
    const sql = getSql();
    const rows = await sql`SELECT * FROM launchflow_users WHERE email = ${payload.email} AND status = 'Active' LIMIT 1`;
    if (!rows.length) return sendJson(res, 401, { error: "Session user not found." });
    return sendJson(res, 200, { user: sanitizeUser(rows[0]) });
  } catch (error) {
    return handleApiError(res, error);
  }
};
