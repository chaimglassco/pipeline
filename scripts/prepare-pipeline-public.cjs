const fs = require("node:fs");
const path = require("node:path");

// Only publish the Pipeline files needed at runtime, never repository backups.
const root = path.resolve(__dirname, "..");
for (const directory of ["js", "css"]) {
  fs.cpSync(path.join(root, directory), path.join(root, "public", directory), { recursive: true });
}
fs.copyFileSync(path.join(root, "index.html"), path.join(root, "public", "pipeline.html"));
fs.copyFileSync(path.join(root, "recovery-import.html"), path.join(root, "public", "recovery-import.html"));
