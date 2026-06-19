function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getSupabaseServerConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "");
  return { url, key };
}

function createPublicStorageUrl(url, bucket, storagePath) {
  const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const { url, key } = getSupabaseServerConfig();
    if (!url || !key) {
      res.status(500).json({ error: "Supabase Storage is not configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in Vercel." });
      return;
    }

    const payload = JSON.parse(await getRequestBody(req) || "{}");
    const bucket = String(payload.bucket || "").trim();
    const storagePath = String(payload.storagePath || "").trim();
    const contentType = String(payload.contentType || "application/octet-stream");
    const fileBase64 = String(payload.fileBase64 || "");

    if (!bucket || !storagePath || !fileBase64) {
      res.status(400).json({ error: "bucket, storagePath, and fileBase64 are required." });
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
    res.status(500).json({ error: error?.message || "Storage upload failed." });
  }
};
