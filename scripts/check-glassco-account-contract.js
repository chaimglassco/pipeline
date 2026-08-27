const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const authSource = fs.readFileSync(path.join(__dirname, "..", "api", "_auth.js"), "utf8");
const usersApiSource = fs.readFileSync(path.join(__dirname, "..", "api", "users.js"), "utf8");

assert.match(appSource, /const GLASSCO_LOGOUT_STORAGE_KEY = "glassco\.logout\.v1";/, "Pipeline and Library must share the logout broadcast key.");
assert.match(appSource, /url\.searchParams\.get\("open"\) !== "profile"/, "Pipeline must recognize the profile deep link.");
assert.match(appSource, /uiState\.activeView = "settings";\s*uiState\.settingsCategory = "profile";/, "The profile deep link must open Profile settings.");
assert.match(appSource, /url\.searchParams\.delete\("open"\)/, "The one-time profile deep link must be removed after consumption.");
assert.match(appSource, /window\.addEventListener\("storage", handleGlasscoSharedLogout\)/, "Pipeline must listen for shared logout broadcasts.");
assert.match(appSource, /function handleGlasscoSharedLogout[\s\S]*?clearAuthSession\(\);\s*renderFromCurrentState\(\);/, "Shared logout must clear the Pipeline session and return to the login UI.");
assert.match(appSource, /email: "support@glasscosupplies\.com"/, "The browser owner identity must use the support email.");
assert.match(appSource, /LEGACY_ADMIN_OWNER_EMAIL[\s\S]*?hasCurrentOwner[\s\S]*?email: ADMIN_OWNER_CREDENTIALS\.email/, "Stored legacy owner data must migrate to the support email without adding a duplicate owner.");
assert.match(authSource, /const DEFAULT_OWNER_EMAIL = "support@glasscosupplies\.com";/, "The API owner identity must default to the support email.");
assert.match(authSource, /configuredOwnerEmail !== LEGACY_OWNER_EMAIL[\s\S]*?: DEFAULT_OWNER_EMAIL;/, "A stale legacy owner environment value must resolve to the new support owner.");
assert.match(authSource, /UPDATE launchflow_users[\s\S]*?SET email = \$\{OWNER_EMAIL\}[\s\S]*?WHERE id = \$\{legacyOwnerRows\[0\]\.id\}/, "The API must migrate the legacy owner record in place.");
assert.match(usersApiSource, /const OWNER_EMAIL = getOwnerEmail\(\);/, "Owner protections must use the canonical API owner email.");
assert.doesNotMatch(usersApiSource, /chaim@glasscosupplies\.com/, "The users API must not hardcode the legacy owner identity.");

console.log("Glassco account navigation contract passed.");
