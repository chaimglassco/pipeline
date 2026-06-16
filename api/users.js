const {
  createPasswordHash,
  createUserId,
  ensureSchema,
  getSql,
  handleApiError,
  getJsonBody,
  normalizeEmail,
  normalizeRole,
  requireAdmin,
  sanitizeUser,
  sendJson,
} = require("./_auth");

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
  const { id, name, email, role, password, jobTitle } = getJsonBody(req);
  if (!id) return sendJson(res, 400, { error: "User id is required." });
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM launchflow_users WHERE id = ${id} LIMIT 1`;
  const existingUser = existingRows[0];
  if (!existingUser) return sendJson(res, 404, { error: "User not found." });
  const updatedEmail = existingUser.role === "ADMIN" && existingUser.email === "chaim@glasscosupplies.com" ? existingUser.email : normalizeEmail(email || existingUser.email);
  const updatedRole = existingUser.email === "chaim@glasscosupplies.com" ? "ADMIN" : normalizeRole(role || existingUser.role);
  const updatedName = String(name || existingUser.name).trim();
  const updatedJobTitle = String(jobTitle || existingUser.job_title || "Team Member").trim();
  const nextPassword = String(password || "").trim();
  if (nextPassword) {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, password_hash = ${createPasswordHash(nextPassword)}, job_title = ${updatedJobTitle}, status = 'Active', updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE launchflow_users
      SET name = ${updatedName}, email = ${updatedEmail}, role = ${updatedRole}, job_title = ${updatedJobTitle}, status = 'Active', updated_at = NOW()
      WHERE id = ${id}
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
  await sql`DELETE FROM launchflow_users WHERE id = ${id}`;
  return listUsers(res);
}
