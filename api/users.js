const {
  createPasswordHash,
  createInviteToken,
  createInviteTokenHash,
  createTemporaryPasswordHash,
  createUserId,
  ensureSchema,
  getInviteExpiresAt,
  getSql,
  handleApiError,
  getJsonBody,
  normalizeEmail,
  normalizeRole,
  requireAdmin,
  sanitizeUser,
  sendJson,
} = require("./_auth");
const { sendInviteEmail } = require("./_email");

module.exports = async function handler(req, res) {
  try {
    await ensureSchema();
    await requireAdmin(req);
    if (req.method === "GET") return listUsers(res);
    if (req.method === "POST") return createUser(req, res);
    if (req.method === "PATCH") return updateUser(req, res);
    if (req.method === "DELETE") return deleteUser(req, res);
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return handleApiError(res, error);
  }
};

async function listUsers(res) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM launchflow_users ORDER BY created_at ASC`;
  return sendJson(res, 200, { users: rows.map(sanitizeUser) });
}

async function createUser(req, res) {
  const { name, email, role, password, jobTitle, sendInvite } = getJsonBody(req);
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || "").trim();
  const cleanPassword = String(password || "").trim();
  const shouldSendInvite = Boolean(sendInvite || !cleanPassword);
  if (!displayName || !normalizedEmail || (!cleanPassword && !shouldSendInvite)) return sendJson(res, 400, { error: "Name, email, and password or invite email are required." });
  const sql = getSql();
  const existing = await sql`SELECT * FROM launchflow_users WHERE email = ${normalizedEmail} LIMIT 1`;
  if (existing.length) {
    const existingUser = existing[0];
    if (!shouldSendInvite || existingUser.status === "Active") return sendJson(res, 409, { error: "A user with this email already exists." });
    const token = createInviteToken();
    await sql`
      UPDATE launchflow_users
      SET name = ${displayName},
          role = ${normalizeRole(role)},
          job_title = ${String(jobTitle || existingUser.job_title || "Team Member").trim() || "Team Member"},
          status = 'Pending',
          invite_token_hash = ${createInviteTokenHash(token)},
          invite_expires_at = ${getInviteExpiresAt()},
          invited_at = NOW(),
          updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;
    const inviteEmail = await sendInviteEmail(req, { to: normalizedEmail, name: displayName, role: normalizeRole(role), token });
    const rows = await sql`SELECT * FROM launchflow_users ORDER BY created_at ASC`;
    return sendJson(res, 200, { users: rows.map(sanitizeUser), inviteEmail });
  }
  const id = createUserId();
  const token = shouldSendInvite ? createInviteToken() : "";
  const inviteExpiresAt = shouldSendInvite ? getInviteExpiresAt() : null;
  await sql`
    INSERT INTO launchflow_users (id, name, email, role, password_hash, job_title, status, invite_token_hash, invite_expires_at, invited_at)
    VALUES (
      ${id},
      ${displayName},
      ${normalizedEmail},
      ${normalizeRole(role)},
      ${cleanPassword ? createPasswordHash(cleanPassword) : createTemporaryPasswordHash()},
      ${String(jobTitle || "Team Member").trim() || "Team Member"},
      ${shouldSendInvite ? "Pending" : "Active"},
      ${shouldSendInvite ? createInviteTokenHash(token) : null},
      ${inviteExpiresAt},
      ${shouldSendInvite ? new Date().toISOString() : null}
    )
  `;
  let inviteEmail = null;
  if (shouldSendInvite) {
    inviteEmail = await sendInviteEmail(req, { to: normalizedEmail, name: displayName, role: normalizeRole(role), token });
  }
  const rows = await sql`SELECT * FROM launchflow_users ORDER BY created_at ASC`;
  return sendJson(res, 200, { users: rows.map(sanitizeUser), inviteEmail });
}

async function updateUser(req, res) {
  const { id, name, email, role, password, jobTitle } = getJsonBody(req);
  if (!id) return sendJson(res, 400, { error: "User id is required." });
  const sql = getSql();
  let existingRows = await sql`SELECT * FROM launchflow_users WHERE id = ${id} LIMIT 1`;
  if (!existingRows.length && email) existingRows = await sql`SELECT * FROM launchflow_users WHERE email = ${normalizeEmail(email)} LIMIT 1`;
  const existingUser = existingRows[0];
  const nextPassword = String(password || "").trim();
  if (!existingUser) {
    if (!nextPassword) return sendJson(res, 400, { error: "Save a password before this user can log in remotely." });
    return createUser(req, res);
  }
  const updatedEmail = existingUser.role === "ADMIN" && existingUser.email === "chaim@glasscosupplies.com" ? existingUser.email : normalizeEmail(email || existingUser.email);
  const updatedRole = existingUser.email === "chaim@glasscosupplies.com" ? "ADMIN" : normalizeRole(role || existingUser.role);
  const updatedName = String(name || existingUser.name).trim();
  const updatedJobTitle = String(jobTitle || existingUser.job_title || "Team Member").trim();
  if (nextPassword) {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, password_hash = ${createPasswordHash(nextPassword)}, job_title = ${updatedJobTitle}, status = 'Active', invite_token_hash = NULL, invite_expires_at = NULL, updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;
  } else {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, job_title = ${updatedJobTitle}, updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;
  }
  return listUsers(res);
}

async function deleteUser(req, res) {
  const id = req.query?.id || getJsonBody(req).id;
  if (!id) return sendJson(res, 400, { error: "User id is required." });
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM launchflow_users WHERE id = ${id} LIMIT 1`;
  const existingUser = existingRows[0];
  if (!existingUser) return sendJson(res, 404, { error: "User not found." });
  if (existingUser.email === "chaim@glasscosupplies.com") return sendJson(res, 400, { error: "The workspace owner cannot be removed." });
  await sql`DELETE FROM launchflow_users WHERE id = ${existingUser.id}`;
  return listUsers(res);
}
