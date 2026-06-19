const {
  getBearerToken,
  getSql,
  verifyToken,
} = require("./_auth");

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getSupabaseServerConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.LAUNCHFLOW_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.LAUNCHFLOW_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_ANON_KEY
      || process.env.LAUNCHFLOW_SUPABASE_ANON_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || "",
  );
  return { url, key };
}

function createPublicStorageUrl(url, bucket, storagePath) {
  const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function ensureDatabaseStorageSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS launchflow_storage_assets (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_base64 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(bucket, storage_path)
    )
  `;
}

function requireUploadUser(req) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload?.email) {
    const error = new Error("Workspace login required before uploading files.");
    error.statusCode = 401;
    throw error;
  }
  return payload;
}

function createDatabaseStorageAssetId(bucket, storagePath) {
  return `${bucket}/${storagePath}`;
}

async function saveDatabaseStorageAsset({ bucket, storagePath, contentType, fileBase64, user }) {
  await ensureDatabaseStorageSchema();
  const sql = getSql();
  const id = createDatabaseStorageAssetId(bucket, storagePath);
  await sql`
    INSERT INTO launchflow_storage_assets (id, bucket, storage_path, content_type, file_base64, uploaded_by, updated_at)
    VALUES (${id}, ${bucket}, ${storagePath}, ${contentType}, ${fileBase64}, ${user.email}, NOW())
    ON CONFLICT (bucket, storage_path) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      file_base64 = EXCLUDED.file_base64,
      uploaded_by = EXCLUDED.uploaded_by,
      updated_at = NOW()
  `;
  return {
    bucket,
    storagePath,
    storageUrl: `/api/storage-asset?id=${encodeURIComponent(id)}`,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const user = requireUploadUser(req);
    const payload = JSON.parse(await getRequestBody(req) || "{}");
    const bucket = String(payload.bucket || "").trim();
    const storagePath = String(payload.storagePath || "").trim();
    const contentType = String(payload.contentType || "application/octet-stream");
    const fileBase64 = String(payload.fileBase64 || "");

    if (!bucket || !storagePath || !fileBase64) {
      res.status(400).json({ error: "bucket, storagePath, and fileBase64 are required." });
      return;
    }

    const { url, key } = getSupabaseServerConfig();
    if (!url || !key) {
      res.status(200).json(await saveDatabaseStorageAsset({ bucket, storagePath, contentType, fileBase64, user }));
      return;
    }

    const uploadUrl = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: Buffer.from(fileBase64, "base64"),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => "");
      res.status(uploadResponse.status).json({ error: errorText || `Supabase Storage upload failed (${uploadResponse.status}).` });
      return;
    }

    res.status(200).json({
      bucket,
      storagePath,
      storageUrl: createPublicStorageUrl(url, bucket, storagePath),
    });
  } catch (error) {
    res.status(error?.statusCode || 500).json({ error: error?.message || "Storage upload failed." });
  }
};
