const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "api", "workspace-state.js"), "utf8");

const sandbox = {
  console,
  require(moduleName) {
    if (moduleName === "./_auth") {
      return {
        ensureSchema: async () => {},
        getBearerToken: () => "",
        getJsonBody: () => ({}),
        getSql: () => {
          throw new Error("SQL should not be called by the workspace API behavior checker.");
        },
        handleApiError: () => {},
        sendJson: () => {},
        verifyToken: () => ({ email: "tester@example.com", role: "ADMIN" }),
      };
    }
    return require(moduleName);
  },
  module: { exports: {} },
  exports: {},
};

vm.runInNewContext(`${source}
module.exports.__workspaceBehavior = {
  parseWorkspaceStateJson,
  preserveAdminKeywordResearchStructure,
  sanitizeProductStagesForStageSettings,
  sanitizeWorkspaceDetailsStagesForStageSettings,
  prunePurgedProductHistoryEntries,
  mergeScopedWorkspaceSave,
  getScopedWorkspaceSaveMetadata,
};`, sandbox, { filename: "workspace-state.js" });

const {
  parseWorkspaceStateJson,
  preserveAdminKeywordResearchStructure,
  sanitizeProductStagesForStageSettings,
  sanitizeWorkspaceDetailsStagesForStageSettings,
  prunePurgedProductHistoryEntries,
  mergeScopedWorkspaceSave,
  getScopedWorkspaceSaveMetadata,
} = sandbox.module.exports.__workspaceBehavior;

const adminStageSettings = {
  order: ["product-research", "product-development", "under-final-order"],
  hiddenStageIds: ["product-development"],
};

const userState = {
  userProducts: [
    { id: "p-visible", name: "Visible", stageId: "under-final-order" },
    { id: "p-hidden", name: "Hidden", stageId: "product-development" },
    { id: "p-unknown", name: "Unknown", stageId: "stale-stage" },
  ],
  productSettings: {
    edits: {
      "p-visible": { stageId: "under-final-order" },
      "p-hidden": { stageId: "product-development" },
      "p-unknown": { stageId: "stale-stage" },
    },
  },
  workspaceDetails: {
    products: {
      "p-visible": {
        stages: {
          "product-research": { customFields: [{ fieldId: "research-note", value: "keep" }] },
          "product-development": { customFields: [{ fieldId: "dev-note", value: "remove" }] },
          "under-final-order": { customFields: [{ fieldId: "final-note", value: "keep" }] },
        },
      },
    },
    productHistory: [
      { id: "history-keep", productId: "p-visible" },
      { id: "history-purge", productId: "p-hidden" },
    ],
  },
};

sanitizeProductStagesForStageSettings(userState, adminStageSettings);
assert.equal(userState.userProducts.find((product) => product.id === "p-visible").stageId, "under-final-order");
assert.equal(userState.userProducts.find((product) => product.id === "p-hidden").stageId, "product-research");
assert.equal(userState.userProducts.find((product) => product.id === "p-unknown").stageId, "product-research");
assert.equal(userState.productSettings.edits["p-hidden"].stageId, "product-research");
assert.equal(userState.productSettings.edits["p-unknown"].stageId, "product-research");

sanitizeWorkspaceDetailsStagesForStageSettings(userState, adminStageSettings);
assert.deepEqual(Object.keys(userState.workspaceDetails.products["p-visible"].stages).sort(), ["product-research", "under-final-order"]);

userState.productSettings.purgedProductHistoryIds = ["history-purge"];
prunePurgedProductHistoryEntries(userState);
assert.deepEqual(userState.workspaceDetails.productHistory.map((entry) => entry.id), ["history-keep"]);

const keywordState = {
  keywordResearchSettings: {
    columns: [{ id: "user-column", label: "User Column" }],
    spreadsheetUrl: "https://example.com/user-sheet",
    keywordsByProductId: { "p-visible": [{ id: "kw-1", keyword: "glass" }] },
  },
};
preserveAdminKeywordResearchStructure(keywordState, {
  columns: [{ id: "admin-column", label: "Admin Column" }],
  spreadsheetUrl: "https://example.com/admin-sheet",
});
assert.equal(keywordState.keywordResearchSettings.spreadsheetUrl, "https://example.com/admin-sheet");
assert.deepEqual(keywordState.keywordResearchSettings.columns, [{ id: "admin-column", label: "Admin Column" }]);
assert.deepEqual(keywordState.keywordResearchSettings.keywordsByProductId, { "p-visible": [{ id: "kw-1", keyword: "glass" }] });

assert.deepEqual(parseWorkspaceStateJson(JSON.stringify({ userProducts: [{ id: "p-1" }] })), { userProducts: [{ id: "p-1" }] });
assert.equal(parseWorkspaceStateJson("not json"), null);

const currentWorkspace = {
  userProducts: [
    { id: "p-admin", name: "Admin product", stageId: "product-research" },
    { id: "p-louie", name: "Louie product", stageId: "product-research" },
    { id: "p-keep", name: "Keep product", stageId: "shipping" },
  ],
  productSettings: { edits: {}, deletedProductIds: [], deletedProductSnapshots: [], purgedProductHistoryIds: [] },
  workspaceDetails: { products: { "p-admin": { value: "admin" }, "p-louie": { value: "before" }, "p-keep": { value: "keep" } }, fieldHistory: [], productHistory: [] },
};
const staleBrowserWorkspace = {
  userProducts: [{ id: "p-louie", name: "Louie product", stageId: "product-research" }],
  productSettings: { edits: {}, deletedProductIds: [], deletedProductSnapshots: [], purgedProductHistoryIds: [] },
  workspaceDetails: { products: { "p-louie": { value: "after" } }, fieldHistory: [{ id: "history-louie" }], productHistory: [] },
};
const scopedWorkspace = mergeScopedWorkspaceSave(currentWorkspace, staleBrowserWorkspace, {
  dirtyKeys: ["userProducts", "workspaceDetails"],
  dirtyProductIds: ["p-louie"],
  dirtyTemplateStageIds: [],
});
assert.deepEqual(scopedWorkspace.userProducts.map((product) => product.id).sort(), ["p-admin", "p-keep", "p-louie"]);
assert.equal(scopedWorkspace.workspaceDetails.products["p-louie"].value, "after");
assert.equal(scopedWorkspace.workspaceDetails.products["p-admin"].value, "admin");
assert.deepEqual(getScopedWorkspaceSaveMetadata({ syncMode: "scoped", dirtyKeys: ["userProducts"], dirtyProductIds: ["p-louie"] }), { dirtyKeys: ["userProducts"], dirtyProductIds: ["p-louie"], dirtyTemplateStageIds: [] });

console.log("Workspace API behavior checks passed.");
