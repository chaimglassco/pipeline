const {
  createPasswordHash,
  createUserId,
  ensureSchema,
  getSql,
  handleApiError,
  getJsonBody,
  getBearerToken,
  getOwnerEmail,
  normalizeEmail,
  normalizeRole,
  requireAdmin,
  sanitizeUser,
  sendJson,
  verifyToken,
} = require("./_auth");

const OWNER_EMAIL = getOwnerEmail();

module.exports = async function handler(req, res) {
  try {
    await ensureSchema();
    if (req.method === "GET") {
      await requireAdmin(req);
      return listUsers(res);
    }
    if (req.method === "POST") {
      await requireAdmin(req);
      return createUser(req, res);
    }
    if (req.method === "PATCH") return updateUser(req, res);
    if (req.method === "DELETE") {
      await requireAdmin(req);
      return deleteUser(req, res);
    }
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
  const { name, email, role, password, jobTitle } = getJsonBody(req);
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || "").trim();
  const cleanPassword = String(password || "").trim();
  if (!displayName || !normalizedEmail || !cleanPassword) return sendJson(res, 400, { error: "Name, email, and password are required." });
  const sql = getSql();
  const existing = await sql`SELECT id FROM launchflow_users WHERE email = ${normalizedEmail} LIMIT 1`;
  if (existing.length) return sendJson(res, 409, { error: "A user with this email already exists." });
  const id = createUserId();
  await sql`
    INSERT INTO launchflow_users (id, name, email, role, password_hash, job_title, status)
    VALUES (${id}, ${displayName}, ${normalizedEmail}, ${normalizeRole(role)}, ${createPasswordHash(cleanPassword)}, ${String(jobTitle || "Team Member").trim() || "Team Member"}, 'Active')
  `;
  return listUsers(res);
}

async function updateUser(req, res) {
  const actor = verifyToken(getBearerToken(req));
  if (!actor) return sendJson(res, 401, { error: "Session expired." });
  const isAdmin = normalizeRole(actor.role) === "ADMIN";
  const { id, name, email, role, password, jobTitle, avatarStoragePath, avatarUrl } = getJsonBody(req);
  if (!id) return sendJson(res, 400, { error: "User id is required." });
  const sql = getSql();
  let existingRows = await sql`SELECT * FROM launchflow_users WHERE id = ${id} LIMIT 1`;
  if (!existingRows.length && email) existingRows = await sql`SELECT * FROM launchflow_users WHERE email = ${normalizeEmail(email)} LIMIT 1`;
  const existingUser = existingRows[0];
  const nextPassword = String(password || "").trim();
  if (!existingUser) {
    if (!isAdmin) return sendJson(res, 401, { error: "Admin access required." });
    if (!nextPassword) return sendJson(res, 400, { error: "Save a password before this user can log in remotely." });
    return createUser(req, res);
  }
  if (!isAdmin && normalizeEmail(actor.email) !== normalizeEmail(existingUser.email)) {
    return sendJson(res, 401, { error: "You can only update your own profile." });
  }
  const existingUserIsOwner = normalizeEmail(existingUser.email) === OWNER_EMAIL;
  const updatedEmail = !isAdmin || existingUserIsOwner ? existingUser.email : normalizeEmail(email || existingUser.email);
  const updatedRole = !isAdmin || existingUserIsOwner ? existingUser.role : normalizeRole(role || existingUser.role);
  const updatedName = String(name || existingUser.name).trim();
  const updatedJobTitle = String(jobTitle || existingUser.job_title || "Team Member").trim();
  const updatedAvatarStoragePath = typeof avatarStoragePath === "string" ? avatarStoragePath : existingUser.avatar_storage_path || "";
  const updatedAvatarUrl = typeof avatarUrl === "string" ? avatarUrl : existingUser.avatar_url || "";
  if (nextPassword && !isAdmin) return sendJson(res, 401, { error: "Admin access required to change passwords." });
  if (nextPassword) {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, password_hash = ${createPasswordHash(nextPassword)}, job_title = ${updatedJobTitle}, avatar_storage_path = ${updatedAvatarStoragePath}, avatar_url = ${updatedAvatarUrl}, status = 'Active', updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;
  } else {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, job_title = ${updatedJobTitle}, avatar_storage_path = ${updatedAvatarStoragePath}, avatar_url = ${updatedAvatarUrl}, status = 'Active', updated_at = NOW()
      WHERE id = ${existingUser.id}
    `;
  }
  if (isAdmin) return listUsers(res);
  const updatedRows = await sql`SELECT * FROM launchflow_users WHERE id = ${existingUser.id} LIMIT 1`;
  return sendJson(res, 200, { user: sanitizeUser(updatedRows[0]) });
}

async function deleteUser(req, res) {
  const id = req.query?.id || getJsonBody(req).id;
  if (!id) return sendJson(res, 400, { error: "User id is required." });
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM launchflow_users WHERE id = ${id} LIMIT 1`;
  const existingUser = existingRows[0];
  if (!existingUser) return sendJson(res, 404, { error: "User not found." });
  if (normalizeEmail(existingUser.email) === OWNER_EMAIL) return sendJson(res, 400, { error: "The workspace owner cannot be removed." });
  await sql`DELETE FROM launchflow_users WHERE id = ${existingUser.id}`;
  return listUsers(res);
}
