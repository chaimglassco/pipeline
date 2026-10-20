const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.equal(config.framework, "nextjs");
assert.equal(config.outputDirectory, ".next");
assert.equal(config.rewrites.find(rule => rule.source === "/")?.destination, "/ppc/pipeline.html");
assert.equal(config.rewrites.find(rule => rule.source === "/api/:path*")?.destination, "/ppc/api/pipeline/:path*");
assert.ok(config.rewrites.every(rule => !rule.destination.startsWith("https://")), "No cross-project runtime dependency");
for (const endpoint of ["auth/login", "auth/session", "users", "workspace-state", "library-state", "storage-upload", "storage-asset", "sheet-preview"]) {
  const wrapper = fs.readFileSync(path.join(root, `src/pages/api/pipeline/${endpoint}.ts`), "utf8");
  assert.ok(wrapper.includes(`api/${endpoint}"`));
  assert.ok(wrapper.includes("export default handler"));
  if (endpoint === "storage-upload") assert.ok(wrapper.includes("bodyParser: false"));
}
assert.equal(fs.readFileSync(path.join(root, "public/pipeline.html"), "utf8"), fs.readFileSync(path.join(root, "index.html"), "utf8"));
assert.ok(!fs.existsSync(path.join(root, "public/recovery-workspace-bundle.json")), "Backups must not become public assets");
console.log("Unified deployment contracts passed.");
