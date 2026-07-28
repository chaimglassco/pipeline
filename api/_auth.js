const crypto = require("crypto");

const USER_ROLES = new Set(["ADMIN", "USER", "VIEWER"]);
const OWNER_EMAIL = String(process.env.LAUNCHFLOW_OWNER_EMAIL || "chaim@glasscosupplies.com").trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.LAUNCHFLOW_OWNER_PASSWORD || "Cg.123456");
const OWNER_NAME = String(process.env.LAUNCHFLOW_OWNER_NAME || "Chaim Glass");
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let sqlClient;
let neonClientFactory;
let postgresClientFactory;
let schemaReadyPromise;
const AUTH_SCHEMA_LOCK_NAME = "launchflow_auth_schema_v2";

function getDatabaseUrl() {
  return process.env.SUPABASE_DATABASE_URL
    || process.env.SUPABASE_DB_URL
    || process.env.SUPABASE_POSTGRES_URL
    || process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.STORAGE_DATABASE_URL
    || process.env.NEON_DATABASE_URL
    || process.env.NEON_URL;
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error("Database URL is not configured. Set SUPABASE_DATABASE_URL or DATABASE_URL to a Postgres connection string.");
  if (!sqlClient) sqlClient = createSqlClient(databaseUrl);
  return sqlClient;
}

async function resetSqlClient() {
  const client = sqlClient;
  sqlClient = undefined;
  schemaReadyPromise = undefined;
  if (!client || typeof client.end !== "function") return false;
  try {
    await client.end({ timeout: 0 });
    return true;
  } catch {
    return false;
  }
}

function createSqlClient(databaseUrl) {
  if (isNeonDatabaseUrl(databaseUrl)) {
    if (!neonClientFactory) neonClientFactory = loadNeonClientFactory();
    return neonClientFactory(databaseUrl);
  }
  if (!postgresClientFactory) postgresClientFactory = loadPostgresClientFactory();
  return postgresClientFactory(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: "require",
    connection: {
      statement_timeout: 10_000,
      lock_timeout: 3_000,
      idle_in_transaction_session_timeout: 10_000,
    },
  });
}

function isNeonDatabaseUrl(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname.toLowerCase().includes("neon.tech");
  } catch {
    return String(databaseUrl).toLowerCase().includes("neon.tech");
  }
}

function loadNeonClientFactory() {
  try {
    return require("@neondatabase/serverless").neon;
  } catch (error) {
    const setupError = new Error("@neondatabase/serverless is not installed for this deployment. Run npm install before local API testing and redeploy Vercel so serverless dependencies are installed.");
    setupError.statusCode = 500;
    setupError.cause = error;
    throw setupError;
  }
}

function loadPostgresClientFactory() {
  try {
    return require("postgres");
  } catch (error) {
    const setupError = new Error("The postgres package is not installed for this deployment. Run npm install and redeploy Vercel before using Supabase Postgres.");
    setupError.statusCode = 500;
    setupError.cause = error;
    throw setupError;
  }
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
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSchemaInternal().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function ensureSchemaInternal() {
  const sql = getSql();
  if (typeof sql.begin === "function") {
    await sql`SET statement_timeout = '10s'`;
    await sql`SET lock_timeout = '3s'`;
  }
  if (await isAuthSchemaReady(sql)) return;

  const bootstrap = async (client) => {
    if (await isAuthSchemaReady(client)) return;
    await client`
    CREATE TABLE IF NOT EXISTS launchflow_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      password_hash TEXT NOT NULL,
      job_title TEXT NOT NULL DEFAULT 'Team Member',
      status TEXT NOT NULL DEFAULT 'Active',
      avatar_data_url TEXT NOT NULL DEFAULT '',
      avatar_storage_path TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `;
    await client`ALTER TABLE launchflow_users ADD COLUMN IF NOT EXISTS avatar_data_url TEXT NOT NULL DEFAULT ''`;
    await client`ALTER TABLE launchflow_users ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT NOT NULL DEFAULT ''`;
    await client`ALTER TABLE launchflow_users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`;
    const ownerRows = await client`SELECT id FROM launchflow_users WHERE email = ${OWNER_EMAIL} LIMIT 1`;
    if (!ownerRows.length) {
      await client`
      INSERT INTO launchflow_users (id, name, email, role, password_hash, job_title, status)
      VALUES (${createUserId()}, ${OWNER_NAME}, ${OWNER_EMAIL}, 'ADMIN', ${createPasswordHash(OWNER_PASSWORD)}, 'Workspace Owner', 'Active')
    `;
    }
  };

  if (typeof sql.begin === "function") {
    await sql.begin(async (transaction) => {
      await transaction`SET LOCAL lock_timeout = '3s'`;
      await transaction`SET LOCAL statement_timeout = '10s'`;
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${AUTH_SCHEMA_LOCK_NAME}))`;
      await bootstrap(transaction);
    });
    return;
  }

  await bootstrap(sql);
}

async function isAuthSchemaReady(sql) {
  const relationRows = await sql`SELECT to_regclass('public.launchflow_users')::text AS users`;
  if (!relationRows[0]?.users) return false;
  const columnRows = await sql`
    SELECT COUNT(*)::integer AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'launchflow_users'
      AND column_name IN ('avatar_data_url', 'avatar_storage_path', 'avatar_url')
  `;
  if (Number(columnRows[0]?.count || 0) !== 3) return false;
  return true;
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
    avatarStoragePath: user.avatar_storage_path || "",
    avatarUrl: user.avatar_url || "",
    inviteSentAt: user.created_at || null,
    lastLoginAt: user.last_login_at || null,
    hasPassword: Boolean(user.password_hash),
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
  resetSqlClient,
};
