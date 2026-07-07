const {
  ensureSchema,
  getSql,
  handleApiError,
  normalizeEmail,
  sanitizeUser,
  sendJson,
  signToken,
  verifyPassword,
  getJsonBody,
} = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
  try {
    await ensureSchema();
    const { email, password } = getJsonBody(req);
    const normalizedEmail = normalizeEmail(email);
    const sql = getSql();
    const rows = await sql`SELECT * FROM launchflow_users WHERE email = ${normalizedEmail} LIMIT 1`;
    const user = rows[0];
    if (!user || user.status !== "Active" || !verifyPassword(password, user.password_hash)) {
      return sendJson(res, 401, { error: "Invalid email or password. Ask an admin to create or reset your manual access." });
    }
    await sql`UPDATE launchflow_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ${user.id}`;
    const cleanUser = sanitizeUser({ ...user, last_login_at: new Date().toISOString() });
    return sendJson(res, 200, { user: cleanUser, token: signToken({ email: cleanUser.email, role: cleanUser.role, name: cleanUser.name }) });
  } catch (error) {
    return handleApiError(res, error);
  }
};
