const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const storageUploadHandler = require("../api/storage-upload");

const {
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
} = storageUploadHandler._test;

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createFetchSequence(responses, calls) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch call: ${url}`);
    return response;
  };
}

async function checkMissingBucketCreation() {
  const calls = [];
  const configuredBucket = {
    id: PRODUCT_IMAGE_BUCKET,
    public: true,
    file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
    allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
  };
  const fetchImpl = createFetchSequence([
    jsonResponse(404, { code: "BucketNotFound", message: "Bucket not found" }),
    jsonResponse(200, { name: PRODUCT_IMAGE_BUCKET }),
    jsonResponse(200, configuredBucket),
  ], calls);

  await prepareProductImageBucketInternal({ url: "https://example.supabase.co", key: "sb_secret_test", fetchImpl });
  assert.deepEqual(calls.map((call) => call.options.method || "GET"), ["GET", "POST", "GET"]);
  const createPayload = JSON.parse(calls[1].options.body);
  assert.equal(createPayload.public, true);
  assert.equal(createPayload.file_size_limit, PRODUCT_IMAGE_MAX_BYTES);
  assert.deepEqual(createPayload.allowed_mime_types, PRODUCT_IMAGE_CONTENT_TYPE_LIST);
}

async function checkExistingBucketRepair() {
  const calls = [];
  const fetchImpl = createFetchSequence([
    jsonResponse(200, {
      id: PRODUCT_IMAGE_BUCKET,
      public: false,
      file_size_limit: 1024,
      allowed_mime_types: ["image/png"],
    }),
    jsonResponse(200, { message: "Successfully updated" }),
  ], calls);

  await prepareProductImageBucketInternal({ url: "https://example.supabase.co", key: "sb_secret_test", fetchImpl });
  assert.deepEqual(calls.map((call) => call.options.method || "GET"), ["GET", "PUT"]);
}

async function checkConcurrentBucketCreation() {
  const calls = [];
  const fetchImpl = createFetchSequence([
    jsonResponse(404, { code: "BucketNotFound" }),
    jsonResponse(409, { code: "Duplicate", message: "Bucket already exists" }),
    jsonResponse(200, {
      id: PRODUCT_IMAGE_BUCKET,
      public: true,
      file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
      allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
    }),
  ], calls);

  await prepareProductImageBucketInternal({ url: "https://example.supabase.co", key: "sb_secret_test", fetchImpl });
  assert.equal(calls.length, 3);
}

async function checkSignedUploadAndVerification() {
  const signedCalls = [];
  const signedUrl = await createSignedProductImageUpload({
    url: "https://example.supabase.co",
    key: "sb_secret_test",
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.png",
    fetchImpl: createFetchSequence([
      jsonResponse(200, { url: "/object/upload/sign/product-images/example.png?token=signed" }),
    ], signedCalls),
  });
  assert.equal(signedUrl, "https://example.supabase.co/storage/v1/object/upload/sign/product-images/example.png?token=signed");
  assert.equal(signedCalls[0].options.headers.Authorization, undefined);

  const imageBytes = Buffer.from("valid-image-bytes");
  const verified = await fetchStoredProductImage({
    url: "https://example.supabase.co",
    key: "sb_secret_test",
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.png",
    expectedContentType: "image/png",
    expectedFileSize: imageBytes.length,
    fetchImpl: async () => new Response(imageBytes, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    }),
  });
  assert.equal(Buffer.from(verified.fileBase64, "base64").toString(), imageBytes.toString());

  await assert.rejects(() => fetchStoredProductImage({
    url: "https://example.supabase.co",
    key: "sb_secret_test",
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.png",
    expectedContentType: "image/png",
    expectedFileSize: imageBytes.length + 1,
    fetchImpl: async () => new Response(imageBytes, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    }),
  }), /could not be verified/i);
}

async function checkSignedUploadMissingBucketRetry() {
  resetProductImageBucketPreparation();
  const calls = [];
  const configuredBucket = {
    id: PRODUCT_IMAGE_BUCKET,
    public: true,
    file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
    allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
  };
  const fetchImpl = createFetchSequence([
    jsonResponse(200, configuredBucket),
    jsonResponse(404, { code: "BucketNotFound", message: "Bucket not found" }),
    jsonResponse(404, { code: "BucketNotFound", message: "Bucket not found" }),
    jsonResponse(200, { name: PRODUCT_IMAGE_BUCKET }),
    jsonResponse(200, configuredBucket),
    jsonResponse(200, { url: "/object/upload/sign/product-images/example.png?token=retry" }),
  ], calls);

  const signedUrl = await createPreparedSignedProductImageUpload({
    url: "https://example.supabase.co",
    key: "sb_secret_test",
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.png",
    fetchImpl,
  });
  assert.match(signedUrl, /token=retry$/);
  assert.deepEqual(calls.map((call) => call.options.method || "GET"), ["GET", "POST", "GET", "POST", "GET", "POST"]);
  resetProductImageBucketPreparation();
}

async function checkFinalizeAndRecoveryOrdering() {
  const imageBytes = Buffer.from("verified-image");
  const savedAssets = [];
  const baseOptions = {
    url: "https://example.supabase.co",
    key: "sb_secret_test",
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.webp",
    contentType: "image/webp",
    fileSize: imageBytes.length,
    user: { email: "user@example.com" },
    saveAsset: async (asset) => {
      savedAssets.push(asset);
      return { bucket: asset.bucket, storagePath: asset.storagePath, storageUrl: "/api/storage-asset?id=backup" };
    },
  };
  const finalized = await finalizeProductImageUpload({
    ...baseOptions,
    fetchImpl: async () => new Response(imageBytes, {
      status: 200,
      headers: { "Content-Type": "image/webp" },
    }),
  });
  assert.equal(savedAssets.length, 1);
  assert.match(finalized.storageUrl, /\/storage\/v1\/object\/public\/product-images\//);
  assert.equal(finalized.backupStorageUrl, "/api/storage-asset?id=backup");

  await assert.rejects(() => finalizeProductImageUpload({
    ...baseOptions,
    fileSize: imageBytes.length + 1,
    fetchImpl: async () => new Response(imageBytes, {
      status: 200,
      headers: { "Content-Type": "image/webp" },
    }),
  }), /could not be verified/i);
  assert.equal(savedAssets.length, 1, "Recovery save must not run when object verification fails.");
}

function checkValidationAndHeaders() {
  const validRequest = {
    bucket: PRODUCT_IMAGE_BUCKET,
    storagePath: "products/product-1/2026-07-24/example.jpg",
    contentType: "image/jpeg",
    fileSize: PRODUCT_IMAGE_MAX_BYTES,
  };
  assert.doesNotThrow(() => validateProductImageRequest(validRequest));
  assert.throws(() => validateProductImageRequest({ ...validRequest, fileSize: PRODUCT_IMAGE_MAX_BYTES + 1 }), /smaller than 10 MB/);
  assert.throws(() => validateProductImageRequest({ ...validRequest, contentType: "image/gif" }), /JPG, PNG, or WebP/);

  assert.deepEqual(getSupabaseServerHeaders("sb_secret_test"), { apikey: "sb_secret_test" });
  assert.equal(getSupabaseServerHeaders("legacy.jwt.key").Authorization, "Bearer legacy.jwt.key");
  assert.equal(isProductImageBucketConfigured({
    public: true,
    file_size_limit: PRODUCT_IMAGE_MAX_BYTES,
    allowed_mime_types: PRODUCT_IMAGE_CONTENT_TYPE_LIST,
  }), true);
  assert.throws(() => requireUploadUser({ headers: {} }), /login required/i);
}

function checkFrontendFailurePreservation() {
  const appSource = fs.readFileSync(path.resolve(__dirname, "..", "js", "app.js"), "utf8");
  const updateFunction = appSource.match(/async function updateProductImageFromInput\(input\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(updateFunction.indexOf("await uploadProductImageMetadata") < updateFunction.indexOf("saveProductImageIfPresent"));
  assert.match(appSource, /const PRODUCT_IMAGE_MAX_BYTES = 10 \* 1024 \* 1024;/);
  assert.match(appSource, /Please use a JPG, PNG, or WebP image\./);
  assert.match(appSource, /action: "report-product-image-upload-failure"/);
  assert.match(appSource, /existingStoragePath && !isBrowserLocalImageUrl\(imageUrl\)/);
  assert.match(appSource, /if \(!imageUrl \|\| imageIsAlreadyShared\) continue;/);
}

async function main() {
  checkValidationAndHeaders();
  await checkMissingBucketCreation();
  await checkExistingBucketRepair();
  await checkConcurrentBucketCreation();
  await checkSignedUploadAndVerification();
  await checkSignedUploadMissingBucketRetry();
  await checkFinalizeAndRecoveryOrdering();
  checkFrontendFailurePreservation();
  console.log("Product image upload behavior checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
