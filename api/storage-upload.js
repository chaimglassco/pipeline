const {
  getBearerToken,
  getSql,
  verifyToken,
} = require("./_auth");

let databaseStorageSchemaReadyPromise;
let productImageBucketReadyPromise;
const PRODUCT_IMAGE_BUCKET = "product-images";
const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRODUCT_IMAGE_CONTENT_TYPE_LIST = [...PRODUCT_IMAGE_CONTENT_TYPES];

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

function getSupabaseServerHeaders(key, additionalHeaders = {}) {
  return {
    apikey: key,
    ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}),
    ...additionalHeaders,
  };
}

async function readSupabaseResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getSupabaseErrorDetails(response, payload = {}) {
  return {
    status: Number(response?.status) || 0,
    code: String(payload?.code || payload?.error || payload?.statusCode || "").slice(0, 80),
    requestId: String(
      response?.headers?.get?.("sb-request-id")
        || response?.headers?.get?.("x-request-id")
        || payload?.requestId
        || "",
    ).slice(0, 120),
  };
}

function createStorageServiceError(stage, response, payload, publicMessage = "The image could not be uploaded. Please try again.") {
  const details = getSupabaseErrorDetails(response, payload);
  const error = new Error(publicMessage);
  error.statusCode = details.status || 502;
  error.storageStage = stage;
  error.storageStatus = details.status;
  error.storageCode = details.code;
  error.storageRequestId = details.requestId;
  error.storageBucketMissing = response?.status === 404
    || /not.?found|nosuchbucket|bucketnotfound/i.test(`${details.code} ${payload?.message || ""}`);
  return error;
}

function reportStorageServiceError(error, bucket = PRODUCT_IMAGE_BUCKET) {
  console.error("[storage-upload] product image storage failure", {
    stage: String(error?.storageStage || "handler"),
    status: Number(error?.storageStatus || error?.statusCode) || 500,
    code: String(error?.storageCode || "").slice(0, 80),
    requestId: String(error?.storageRequestId || "").slice(0, 120),
    bucket,
  });
}

function createPublicStorageUrl(url, bucket, storagePath) {
  const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function ensureDatabaseStorageSchema() {
  if (!databaseStorageSchemaReadyPromise) {
    databaseStorageSchemaReadyPromise = ensureDatabaseStorageSchemaInternal().catch((error) => {
      databaseStorageSchemaReadyPromise = null;
      throw error;
    });
  }
  return databaseStorageSchemaReadyPromise;
}

function isValidProductImagePath(storagePath) {
  return /^products\/[^/]+\/\d{4}-\d{2}-\d{2}\/[^/]+$/i.test(String(storagePath || ""));
}

function validateProductImageRequest({ bucket, storagePath, contentType, fileSize }) {
  if (bucket !== PRODUCT_IMAGE_BUCKET || !isValidProductImagePath(storagePath)) {
    const error = new Error("Invalid product image upload destination.");
    error.statusCode = 400;
    throw error;
  }
  if (!PRODUCT_IMAGE_CONTENT_TYPES.has(contentType)) {
    const error = new Error("Please use a JPG, PNG, or WebP image.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > PRODUCT_IMAGE_MAX_BYTES) {
    const error = new Error("Please choose an image smaller than 10 MB.");
    error.statusCode = 413;
    throw error;
  }
}

function isProductImageBucketConfigured(bucket) {
  const allowedMimeTypes = Array.isArray(bucket?.allowed_mime_types) ? bucket.allowed_mime_types : [];
  return bucket?.public === true
    && Number(bucket?.file_size_limit) === PRODUCT_IMAGE_MAX_BYTES
    && PRODUCT_IMAGE_CONTENT_TYPE_LIST.every((type) => allowedMimeTypes.includes(type))
    && allowedMimeTypes.every((type) => PRODUCT_IMAGE_CONTENT_TYPES.has(type));
}

async function updateProductImageBucket({ url, key, fetchImpl = fetch }) {
  const response = await fetchImpl(`${url}/storage/v1/bucket/${encodeURIComponent(PRODUCT_IMAGE_BUCKET)}`, {
    method: "PUT",
    headers: getSupabaseServerHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: PRODUCT_IMAGE_BUCKET,
      name: PRODUCT_IMAGE_BUCKET,
      public: true,
      file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
      allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
    }),
  });
  if (!response.ok) {
    throw createStorageServiceError("bucket-update", response, await readSupabaseResponse(response));
  }
}

async function createProductImageBucket({ url, key, fetchImpl = fetch }) {
  const response = await fetchImpl(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: getSupabaseServerHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: PRODUCT_IMAGE_BUCKET,
      name: PRODUCT_IMAGE_BUCKET,
      public: true,
      file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
      allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
    }),
  });
  if (response.ok) return;

  const payload = await readSupabaseResponse(response);
  const details = getSupabaseErrorDetails(response, payload);
  const alreadyExists = response.status === 409
    || /already.?exists|duplicate/i.test(`${details.code} ${payload?.message || ""}`);
  if (!alreadyExists) throw createStorageServiceError("bucket-create", response, payload);
}

async function prepareProductImageBucketInternal({ url, key, fetchImpl = fetch }) {
  const bucketUrl = `${url}/storage/v1/bucket/${encodeURIComponent(PRODUCT_IMAGE_BUCKET)}`;
  let response = await fetchImpl(bucketUrl, { headers: getSupabaseServerHeaders(key) });
  if (response.ok) {
    const bucket = await readSupabaseResponse(response);
    if (!isProductImageBucketConfigured(bucket)) {
      await updateProductImageBucket({ url, key, fetchImpl });
    }
    return;
  }

  const payload = await readSupabaseResponse(response);
  const details = getSupabaseErrorDetails(response, payload);
  const missing = response.status === 404
    || /not.?found|nosuchbucket|bucketnotfound/i.test(`${details.code} ${payload?.message || ""}`);
  if (!missing) throw createStorageServiceError("bucket-inspect", response, payload);

  await createProductImageBucket({ url, key, fetchImpl });
  response = await fetchImpl(bucketUrl, { headers: getSupabaseServerHeaders(key) });
  if (!response.ok) {
    throw createStorageServiceError("bucket-verify", response, await readSupabaseResponse(response));
  }
  const bucket = await readSupabaseResponse(response);
  if (!isProductImageBucketConfigured(bucket)) {
    await updateProductImageBucket({ url, key, fetchImpl });
  }
}

async function prepareProductImageBucket(options) {
  if (!productImageBucketReadyPromise) {
    productImageBucketReadyPromise = prepareProductImageBucketInternal(options).catch((error) => {
      productImageBucketReadyPromise = null;
      throw error;
    });
  }
  return productImageBucketReadyPromise;
}

async function createSignedProductImageUpload({ url, key, bucket, storagePath, fetchImpl = fetch }) {
  const endpoint = `${url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: getSupabaseServerHeaders(key, {
      "Content-Type": "application/json",
      "x-upsert": "true",
    }),
    body: "{}",
  });
  const payload = await readSupabaseResponse(response);
  if (!response.ok || !payload.url) {
    throw createStorageServiceError("signed-url", response, payload);
  }
  if (/^https?:\/\//i.test(payload.url)) return payload.url;
  return `${url}/storage/v1${payload.url.startsWith("/") ? "" : "/"}${payload.url}`;
}

async function createPreparedSignedProductImageUpload(options) {
  await prepareProductImageBucket(options);
  try {
    return await createSignedProductImageUpload(options);
  } catch (error) {
    if (!error?.storageBucketMissing) throw error;
    productImageBucketReadyPromise = null;
    await prepareProductImageBucket(options);
    return createSignedProductImageUpload(options);
  }
}

function resetProductImageBucketPreparation() {
  productImageBucketReadyPromise = null;
}

async function fetchStoredProductImage({ url, key, bucket, storagePath, expectedContentType, expectedFileSize, fetchImpl = fetch }) {
  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetchImpl(endpoint, {
    headers: getSupabaseServerHeaders(key),
  });
  if (!response.ok) {
    throw createStorageServiceError("object-verify", response, await readSupabaseResponse(response));
  }
  const contentType = String(response.headers.get("content-type") || expectedContentType).split(";")[0].trim().toLowerCase();
  const body = Buffer.from(await response.arrayBuffer());
  validateProductImageRequest({ bucket, storagePath, contentType, fileSize: body.length });
  if (contentType !== expectedContentType || body.length !== expectedFileSize) {
    const error = new Error("The uploaded image could not be verified. Please try again.");
    error.statusCode = 400;
    throw error;
  }
  return { contentType, fileBase64: body.toString("base64") };
}

async function finalizeProductImageUpload({
  url,
  key,
  bucket,
  storagePath,
  contentType,
  fileSize,
  user,
  fetchImpl = fetch,
  saveAsset = saveDatabaseStorageAsset,
}) {
  const storedImage = await fetchStoredProductImage({
    url,
    key,
    bucket,
    storagePath,
    expectedContentType: contentType,
    expectedFileSize: fileSize,
    fetchImpl,
  });
  const asset = await saveAsset({
    bucket,
    storagePath,
    contentType: storedImage.contentType,
    fileBase64: storedImage.fileBase64,
    user,
  });
  return {
    ...asset,
    storageUrl: createPublicStorageUrl(url, bucket, storagePath),
    backupStorageUrl: asset.storageUrl,
    mirrorStorageUrl: createPublicStorageUrl(url, bucket, storagePath),
  };
}

async function ensureDatabaseStorageSchemaInternal() {
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

function shouldFallbackToDatabaseStorage(status) {
  return [400, 413, 500, 502, 503, 504].includes(Number(status));
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
    const contentType = String(payload.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
    const fileBase64 = String(payload.fileBase64 || "");
    const action = String(payload.action || "").trim();
    const fileSize = Number(payload.fileSize);
    const { url, key } = getSupabaseServerConfig();

    if (action === "report-product-image-upload-failure") {
      validateProductImageRequest({ bucket, storagePath, contentType, fileSize });
      console.error("[storage-upload] product image storage failure", {
        stage: "direct-upload",
        status: Number(payload.status) || 0,
        code: String(payload.code || "").slice(0, 80),
        requestId: String(payload.requestId || "").slice(0, 120),
        bucket,
      });
      res.status(204).end();
      return;
    }

    if (action === "create-product-image-upload") {
      validateProductImageRequest({ bucket, storagePath, contentType, fileSize });
      if (!url || !key) {
        res.status(503).json({ error: "The image upload service is not configured." });
        return;
      }
      const signedUploadUrl = await createPreparedSignedProductImageUpload({ url, key, bucket, storagePath });
      res.status(200).json({ bucket, storagePath, signedUploadUrl });
      return;
    }

    if (action === "finalize-product-image-upload") {
      validateProductImageRequest({ bucket, storagePath, contentType, fileSize });
      if (!url || !key) {
        res.status(503).json({ error: "The image upload service is not configured." });
        return;
      }
      const asset = await finalizeProductImageUpload({
        url,
        key,
        bucket,
        storagePath,
        contentType,
        fileSize,
        user,
      });
      res.status(200).json(asset);
      return;
    }

    if (!bucket || !storagePath || !fileBase64) {
      res.status(400).json({ error: "bucket, storagePath, and fileBase64 are required." });
      return;
    }

    if (!url || !key) {
      res.status(200).json(await saveDatabaseStorageAsset({ bucket, storagePath, contentType, fileBase64, user }));
      return;
    }

    const uploadUrl = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: getSupabaseServerHeaders(key, {
        "Content-Type": contentType,
        "x-upsert": "true",
      }),
      body: Buffer.from(fileBase64, "base64"),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => "");
      if (shouldFallbackToDatabaseStorage(uploadResponse.status)) {
        const fallbackAsset = await saveDatabaseStorageAsset({ bucket, storagePath, contentType, fileBase64, user });
        res.status(200).json({
          ...fallbackAsset,
          fallbackStorage: true,
          fallbackReason: errorText || `Supabase Storage upload failed (${uploadResponse.status}).`,
        });
        return;
      }
      res.status(uploadResponse.status).json({ error: errorText || `Supabase Storage upload failed (${uploadResponse.status}).` });
      return;
    }

    const databaseAsset = await saveDatabaseStorageAsset({ bucket, storagePath, contentType, fileBase64, user });

    res.status(200).json({
      bucket,
      storagePath,
      storageUrl: databaseAsset.storageUrl,
      mirrorStorageUrl: createPublicStorageUrl(url, bucket, storagePath),
    });
  } catch (error) {
    if (error?.storageStage) reportStorageServiceError(error);
    res.status(error?.statusCode || 500).json({ error: error?.message || "Storage upload failed." });
  }
};

module.exports._test = {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_CONTENT_TYPE_LIST,
  createPreparedSignedProductImageUpload,
  createSignedProductImageUpload,
  finalizeProductImageUpload,
  fetchStoredProductImage,
  getSupabaseServerHeaders,
  isProductImageBucketConfigured,
  prepareProductImageBucketInternal,
  requireUploadUser,
  resetProductImageBucketPreparation,
  validateProductImageRequest,
};
