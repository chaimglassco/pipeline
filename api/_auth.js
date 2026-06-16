const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const USER_ROLES = new Set(["ADMIN", "USER", "VIEWER"]);
const OWNER_EMAIL = String(process.env.LAUNCHFLOW_OWNER_EMAIL || "chaim@glasscosupplies.com").trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.LAUNCHFLOW_OWNER_PASSWORD || "Cg.123456");
const OWNER_NAME = String(process.env.LAUNCHFLOW_OWNER_NAME || "Chaim Glass");
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let sqlClient;

function getDatabaseUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.STORAGE_URL
    || process.env.STORAGE_DATABASE_URL
    || process.env.NEON_DATABASE_URL
    || process.env.NEON_URL;
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error("Database URL is not configured. Connect Neon to this Vercel project first.");
  if (!sqlClient) sqlClient = neon(databaseUrl);
  return sqlClient;
}

function normalizeRole(role) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  return USER_ROLES.has(normalizedRole) ? normalizedRole : "USER";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const nextHash = crypto.scryptSync(String(password || ""), salt, 64);
  const storedBuffer = Buffer.from(hash, "hex");
  return storedBuffer.length === nextHash.length && crypto.timingSafeEqual(storedBuffer, nextHash);
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || getDatabaseUrl() || "launchflow-local-dev-secret";
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(payload) {
  const body = encodeBase64Url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expectedSignature = crypto.createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  const payload = JSON.parse(decodeBase64Url(body));
  if (!payload?.email || Number(payload.exp) < Date.now()) return null;
  return payload;
}

function getJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || req.headers.Authorization || "";
  return String(authorization).replace(/^Bearer\s+/i, "").trim();
}

async function ensureSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      password_hash TEXT NOT NULL,
      job_title TEXT NOT NULL DEFAULT 'Team Member',
      status TEXT NOT NULL DEFAULT 'Active',
      avatar_data_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `;
  const ownerRows = await sql`SELECT id FROM launchflow_users WHERE email = ${OWNER_EMAIL} LIMIT 1`;
  if (!ownerRows.length) {
    await sql`
      INSERT INTO launchflow_users (id, name, email, role, password_hash, job_title, status)
      VALUES (${createUserId()}, ${OWNER_NAME}, ${OWNER_EMAIL}, 'ADMIN', ${createPasswordHash(OWNER_PASSWORD)}, 'Workspace Owner', 'Active')
    `;
  }
}

function createUserId() {
  return `team-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    status: user.status || "Active",
    jobTitle: user.job_title || "Team Member",
    avatarDataUrl: user.avatar_data_url || "",
    inviteSentAt: user.created_at || null,
    lastLoginAt: user.last_login_at || null,
  };
}

async function requireAdmin(req) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload || normalizeRole(payload.role) !== "ADMIN") {
    const error = new Error("Admin access required.");
    error.statusCode = 401;
    throw error;
  }
  return payload;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function handleApiError(res, error) {
  sendJson(res, error.statusCode || 500, { error: error.message || "Request failed." });
}

module.exports = {
  createPasswordHash,
  createUserId,
  ensureSchema,
  getDatabaseUrl,
  getSql,
  handleApiError,
  normalizeEmail,
  normalizeRole,
  requireAdmin,
  sanitizeUser,
  sendJson,
  signToken,
  verifyPassword,
  verifyToken,
  getBearerToken,
  getJsonBody,
};
