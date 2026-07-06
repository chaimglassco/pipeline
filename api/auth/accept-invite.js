const {
  createInviteTokenHash,
  createPasswordHash,
  ensureSchema,
  getJsonBody,
  getSql,
  handleApiError,
  normalizeEmail,
  sanitizeUser,
  sendJson,
  signToken,
} = require("../_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
  try {
    await ensureSchema();
    const { email, token, password } = getJsonBody(req);
    const normalizedEmail = normalizeEmail(email);
    const inviteTokenHash = createInviteTokenHash(token);
    const cleanPassword = String(password || "").trim();
    if (!normalizedEmail || !token || cleanPassword.length < 8) {
      return sendJson(res, 400, { error: "Email, invite token, and an 8+ character password are required." });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT * FROM launchflow_users
      WHERE email = ${normalizedEmail}
        AND invite_token_hash = ${inviteTokenHash}
        AND invite_expires_at > NOW()
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return sendJson(res, 400, { error: "This invite link is invalid or expired. Ask an admin to resend the invite." });

    await sql`
      UPDATE launchflow_users
      SET password_hash = ${createPasswordHash(cleanPassword)},
          status = 'Active',
          invite_token_hash = NULL,
          invite_expires_at = NULL,
          last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = ${user.id}
    `;
    const updatedRows = await sql`SELECT * FROM launchflow_users WHERE id = ${user.id} LIMIT 1`;
    const cleanUser = sanitizeUser(updatedRows[0]);
    return sendJson(res, 200, { user: cleanUser, token: signToken({ email: cleanUser.email, role: cleanUser.role, name: cleanUser.name }) });
  } catch (error) {
    return handleApiError(res, error);
  }
};
