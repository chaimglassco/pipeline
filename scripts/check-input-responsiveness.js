const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`);
  const end = appSource.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Expected ${name} before ${nextName}.`);
  return appSource.slice(start, end);
}

const inputHandler = getFunctionSource("handleAppInput", "handleAppPointerDown");
const changeHandler = getFunctionSource("handleAppChange", "handleAppSubmit");
const workspaceSetter = getFunctionSource("setWorkspaceDetails", "normalizeWorkspaceDetails");

assert.match(appSource, /const DEFERRED_INPUT_COMMIT_DELAY_MS = 300;/);
assert.match(appSource, /const SEARCH_RENDER_DELAY_MS = 150;/);
assert.match(appSource, /requestIdleCallback\(\(\) => \{/);
assert.match(appSource, /window\.addEventListener\("pagehide", flushPendingInputEdits\);/);
assert.match(appSource, /document\.addEventListener\("visibilitychange", handleWorkspaceVisibilityChange\);/);
assert.match(appSource, /async function prepareSharedWorkspaceSnapshotForSync[\s\S]*?flushPendingInputEdits\(\);/);

[
  "updateLaunchPlanFromInput",
  "updateKeywordCellFromInput",
  "updateKeywordColumnLabelFromInput",
  "updateProductFinancialFromInput",
  "updateListingContentFromInput",
  "updateWorkspaceFieldFromInput",
  "updateStructuredWorkspaceFieldFromInput",
  "renameWorkspaceTableSectionFromInput",
].forEach((updaterName) => {
  assert.match(
    inputHandler,
    new RegExp(`queueDeferredInputEdit\\(target, ${updaterName}\\)`),
    `${updaterName} must stay outside the synchronous keystroke path.`,
  );
});

assert.doesNotMatch(
  inputHandler,
  /renderFromCurrentState\(\);/,
  "Typing must not synchronously rebuild the application.",
);
assert.match(inputHandler, /scheduleSearchRender\("team"/);
assert.match(inputHandler, /scheduleSearchRender\("chat"/);
assert.match(inputHandler, /scheduleSearchRender\("products"/);
assert.match(appSource, /placeholder: "Search products\.\.\.",[\s\S]*?dataAction: "update-search"/);
assert.match(changeHandler, /const flushedDeferredInput = flushPendingInputEditForTarget\(target\);/);
assert.match(changeHandler, /const previouslyCommittedInput = consumePreviouslyCommittedInputValue\(target\);/);
assert.match(changeHandler, /const committedDeferredInput = flushedDeferredInput \|\| previouslyCommittedInput;/);
assert.match(changeHandler, /if \(!committedDeferredInput\) updateWorkspaceFieldFromInput\(target\);/);

assert.match(workspaceSetter, /const isScopedFieldEdit =/);
assert.match(workspaceSetter, /markRemoteWorkspaceDirtyProductFieldIds\(/);
assert.match(workspaceSetter, /runOrDeferInputPostCommitTask\("persist-workspace-details"/);
assert.match(appSource, /function cloneWorkspaceDetailsForFieldEdit\(/);
assert.match(appSource, /function isUsdCurrencyMultiShortBarLabel\(label\)/);
assert.match(appSource, /normalizedLabel === "avg\. sales" \|\| normalizedLabel === "avg\. selling price"/);
assert.match(appSource, /className: "workspace-multi-short-bars__currency-prefix", ariaHidden: "true" }, "\$"/);
assert.match(appSource, /stripLeadingUsdCurrencySymbol\(value\)/);

const isUsdCurrencyMultiShortBarLabel = Function(`${getFunctionSource("isUsdCurrencyMultiShortBarLabel", "isUsdCurrencyMultiShortBar")} return isUsdCurrencyMultiShortBarLabel;`)();
const stripLeadingUsdCurrencySymbol = Function(`${getFunctionSource("stripLeadingUsdCurrencySymbol", "normalizeWorkspaceLinkValue")} return stripLeadingUsdCurrencySymbol;`)();
assert.equal(isUsdCurrencyMultiShortBarLabel("Avg. Sales"), true);
assert.equal(isUsdCurrencyMultiShortBarLabel(" AVG.   SELLING PRICE "), true);
assert.equal(isUsdCurrencyMultiShortBarLabel("Avg. Sold Units"), false);
assert.equal(stripLeadingUsdCurrencySymbol("$123.45"), "123.45");
assert.equal(stripLeadingUsdCurrencySymbol("  $  1,234.56"), "1,234.56");
assert.equal(stripLeadingUsdCurrencySymbol("123.45"), "123.45");

console.log("Input responsiveness checks passed.");
