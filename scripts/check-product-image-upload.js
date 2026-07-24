const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "api", "storage-upload.js"), "utf8");

assert.match(appSource, /const PRODUCT_IMAGE_MAX_BYTES = 10 \* 1024 \* 1024;/);
assert.match(apiSource, /const PRODUCT_IMAGE_MAX_BYTES = 10 \* 1024 \* 1024;/);
assert.match(appSource, /new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
assert.match(apiSource, /new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
assert.match(appSource, /action: "create-product-image-upload"/);
assert.match(appSource, /action: "finalize-product-image-upload"/);
assert.match(appSource, /method: "PUT"/);
assert.match(apiSource, /createSignedProductImageUpload/);
assert.match(apiSource, /fetchStoredProductImage/);
assert.match(apiSource, /saveDatabaseStorageAsset/);
assert.match(apiSource, /!key\.startsWith\("sb_secret_"\) \? \{ Authorization: `Bearer \$\{key\}` \} : \{\}/);
assert.match(appSource, /Please choose an image smaller than 10 MB\./);
assert.match(appSource, /Please use a JPG, PNG, or WebP image\./);
assert.match(appSource, /The image could not be uploaded\. Please try again\./);

console.log("Product image direct-upload contract check passed.");
