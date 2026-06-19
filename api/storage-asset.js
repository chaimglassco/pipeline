const {
  getSql,
} = require("./_auth");

async function getAssetById(id) {
  const sql = getSql();
  const rows = await sql`
    SELECT content_type, file_base64
    FROM launchflow_storage_assets
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const id = String(req.query?.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "Storage asset id is required." });
      return;
    }

    const asset = await getAssetById(id);
    if (!asset) {
      res.status(404).json({ error: "Storage asset not found." });
      return;
    }

    const body = Buffer.from(asset.file_base64, "base64");
    res.setHeader("Content-Type", asset.content_type || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).end(body);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Storage asset could not be loaded." });
  }
};
