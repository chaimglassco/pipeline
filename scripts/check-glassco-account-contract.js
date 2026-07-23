const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

assert.match(appSource, /const GLASSCO_LOGOUT_STORAGE_KEY = "glassco\.logout\.v1";/, "Pipeline and Library must share the logout broadcast key.");
assert.match(appSource, /url\.searchParams\.get\("open"\) !== "profile"/, "Pipeline must recognize the profile deep link.");
assert.match(appSource, /uiState\.activeView = "settings";\s*uiState\.settingsCategory = "profile";/, "The profile deep link must open Profile settings.");
assert.match(appSource, /url\.searchParams\.delete\("open"\)/, "The one-time profile deep link must be removed after consumption.");
assert.match(appSource, /window\.addEventListener\("storage", handleGlasscoSharedLogout\)/, "Pipeline must listen for shared logout broadcasts.");
assert.match(appSource, /function handleGlasscoSharedLogout[\s\S]*?clearAuthSession\(\);\s*renderFromCurrentState\(\);/, "Shared logout must clear the Pipeline session and return to the login UI.");

console.log("Glassco account navigation contract passed.");
