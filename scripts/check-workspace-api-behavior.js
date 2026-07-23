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
  preserveAdminCogsTemplate,
};`, sandbox, { filename: "workspace-state.js" });

const {
  parseWorkspaceStateJson,
  preserveAdminKeywordResearchStructure,
  sanitizeProductStagesForStageSettings,
  sanitizeWorkspaceDetailsStagesForStageSettings,
  prunePurgedProductHistoryEntries,
  mergeScopedWorkspaceSave,
  getScopedWorkspaceSaveMetadata,
  preserveAdminCogsTemplate,
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

const adminCogsTemplate = {
  version: 1,
  categories: [{ id: "admin-costs", label: "Admin Costs", rows: [{ id: "admin-row", label: "Admin row", defaultEntryBasis: "per-unit" }] }],
  updatedAt: "2026-07-23T00:00:00.000Z",
  updatedBy: "admin@example.com",
};
const maliciousUserCogsState = {
  cogsTemplateSettings: {
    version: 1,
    categories: [{ id: "hijacked", label: "Hijacked", rows: [{ id: "bad-row", label: "Bad", defaultEntryBasis: "batch-total" }] }],
  },
};
preserveAdminCogsTemplate(maliciousUserCogsState, adminCogsTemplate);
assert.deepEqual(maliciousUserCogsState.cogsTemplateSettings, adminCogsTemplate);
const firstUserCogsState = { cogsTemplateSettings: maliciousUserCogsState.cogsTemplateSettings };
preserveAdminCogsTemplate(firstUserCogsState, null);
assert.equal(Object.prototype.hasOwnProperty.call(firstUserCogsState, "cogsTemplateSettings"), false);

assert.deepEqual(parseWorkspaceStateJson(JSON.stringify({ userProducts: [{ id: "p-1" }] })), { userProducts: [{ id: "p-1" }] });
assert.equal(parseWorkspaceStateJson("not json"), null);

const currentWorkspace = {
  userProducts: [
    { id: "p-admin", name: "Admin product", stageId: "product-research" },
    { id: "p-louie", name: "Louie product", stageId: "product-research" },
    { id: "p-keep", name: "Keep product", stageId: "shipping" },
  ],
  productSettings: { edits: {}, deletedProductIds: [], deletedProductSnapshots: [], purgedProductHistoryIds: [] },
  workspaceDetails: {
    products: {
      "p-admin": { stages: { "product-research": { customFields: [{ fieldId: "admin-note", value: "admin" }] } } },
      "p-louie": {
        stages: {
          "product-research": { customFields: [{ fieldId: "research-note", value: "keep research" }] },
          launch: {
            customFields: [
              { fieldId: "launch-note", value: "before launch" },
              { fieldId: "launch-table", value: [["keep table value"]] },
            ],
          },
        },
      },
      "p-keep": { stages: { shipping: { customFields: [{ fieldId: "shipping-note", value: "keep" }] } } },
    },
    fieldHistory: [],
    productHistory: [],
  },
};
const staleBrowserWorkspace = {
  userProducts: [{ id: "p-louie", name: "Louie product", stageId: "product-research" }],
  productSettings: { edits: {}, deletedProductIds: [], deletedProductSnapshots: [], purgedProductHistoryIds: [] },
  workspaceDetails: {
    products: {
      "p-louie": {
        stages: {
          "product-research": { customFields: [{ fieldId: "research-note", value: "stale research" }] },
          launch: {
            customFields: [
              { fieldId: "launch-note", value: "after launch" },
              { fieldId: "launch-table", value: [["stale table value"]] },
            ],
          },
        },
      },
    },
    fieldHistory: [{ id: "history-louie" }],
    productHistory: [],
  },
};
const scopedWorkspace = mergeScopedWorkspaceSave(currentWorkspace, staleBrowserWorkspace, {
  dirtyKeys: ["userProducts", "workspaceDetails"],
  dirtyProductIds: ["p-louie"],
  dirtyTemplateStageIds: [],
  dirtyProductStageIds: {},
  dirtyProductFieldIds: { "p-louie": { launch: ["launch-note"] } },
  dirtyProductMetadataIds: [],
});
assert.deepEqual(scopedWorkspace.userProducts.map((product) => product.id).sort(), ["p-admin", "p-keep", "p-louie"]);
assert.equal(scopedWorkspace.workspaceDetails.products["p-louie"].stages.launch.customFields[0].value, "after launch");
assert.equal(scopedWorkspace.workspaceDetails.products["p-louie"].stages.launch.customFields[1].value[0][0], "keep table value");
assert.equal(scopedWorkspace.workspaceDetails.products["p-louie"].stages["product-research"].customFields[0].value, "keep research");
assert.equal(scopedWorkspace.workspaceDetails.products["p-admin"].stages["product-research"].customFields[0].value, "admin");

const cogsBatch = {
  id: "cogs-batch-1",
  effectiveDate: "2026-07-20",
  sellableUnits: 100,
  totalCogsPerUnit: 7.95,
  costElements: [{ id: "cost-1", category: "manufacturing", amountPaid: 795, unitsCovered: 100 }],
};
const cogsWorkspace = mergeScopedWorkspaceSave(currentWorkspace, {
  ...staleBrowserWorkspace,
  workspaceDetails: {
    ...staleBrowserWorkspace.workspaceDetails,
    products: {
      ...staleBrowserWorkspace.workspaceDetails.products,
      "p-louie": {
        ...staleBrowserWorkspace.workspaceDetails.products["p-louie"],
        financials: {
          sellingPrice: 19.99,
          cogs: 7.95,
          legacyCogs: 4.5,
          cogsBatches: [cogsBatch],
        },
      },
    },
  },
}, {
  dirtyKeys: ["workspaceDetails"],
  dirtyProductIds: ["p-louie"],
  dirtyTemplateStageIds: [],
  dirtyProductStageIds: {},
  dirtyProductFieldIds: {},
  dirtyProductMetadataIds: ["p-louie"],
});
assert.equal(cogsWorkspace.workspaceDetails.products["p-louie"].financials.cogs, 7.95);
assert.deepEqual(cogsWorkspace.workspaceDetails.products["p-louie"].financials.cogsBatches, [cogsBatch]);
assert.equal(cogsWorkspace.workspaceDetails.products["p-louie"].stages["product-research"].customFields[0].value, "keep research");

const sharedTemplateWorkspace = mergeScopedWorkspaceSave({
  ...currentWorkspace,
  cogsTemplateSettings: adminCogsTemplate,
}, {
  ...staleBrowserWorkspace,
  cogsTemplateSettings: {
    ...adminCogsTemplate,
    categories: [{
      id: "published-costs",
      label: "Published Costs",
      rows: [{ id: "published-row", label: "Published row", defaultEntryBasis: "batch-total" }],
    }],
    updatedAt: "2026-07-23T01:00:00.000Z",
  },
}, {
  dirtyKeys: ["cogsTemplateSettings"],
  dirtyProductIds: [],
  dirtyTemplateStageIds: [],
  dirtyProductStageIds: {},
  dirtyProductFieldIds: {},
  dirtyProductMetadataIds: [],
});
assert.equal(sharedTemplateWorkspace.cogsTemplateSettings.categories[0].id, "published-costs");
assert.deepEqual(sharedTemplateWorkspace.userProducts, currentWorkspace.userProducts);

assert.deepEqual(getScopedWorkspaceSaveMetadata({ syncMode: "scoped", dirtyKeys: ["userProducts"], dirtyProductIds: ["p-louie"] }), {
  dirtyKeys: ["userProducts"],
  dirtyProductIds: ["p-louie"],
  dirtyTemplateStageIds: [],
  dirtyProductStageIds: {},
  dirtyProductFieldIds: {},
  dirtyProductMetadataIds: [],
});

console.log("Workspace API behavior checks passed.");
