import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEW_PRODUCT_BLANK_TABLE_STAGE_IDS,
  applyProductTableRowLabels,
  blankNewProductTargetTable,
  collectUniqueVineEntries,
  getProductScopedVineEntries,
  initializeNewProductVineCollections,
  isNewProductBlankTableTarget,
  repairLegacyTargetTableDefaults,
  setProductScopedVineEntries,
  shouldRestoreDefaultTableRowLabels,
} from "../js/product-defaults.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

assert.deepEqual(
  [...NEW_PRODUCT_BLANK_TABLE_STAGE_IDS].sort(),
  ["product-development", "product-research", "supplier-sourcing"],
  "Only the three requested table stages should be initialized.",
);

const researchTable = {
  fieldId: "workspace_field_mqt9tnuh_f2ys09",
  label: "Competitors Quick Details",
  type: "CUSTOM_TABLE",
  tableCornerHeader: "Product Name",
  tableColumns: ["Listing Link", "Brand Name", "Selling Price"],
  tableRows: ["Competitor A", "Competitor B", "Competitor C", "Competitor D"],
  tableColumnWidths: [210, 180, 180, 150],
  tableRowHeights: [58, 58, 58, 58],
  tableRowLabels: ["Competitor A", "Competitor B", "Competitor C", "Competitor D"],
  value: [["link-a", "brand-a", "10"], ["", "", ""], ["", "", ""], ["", "", ""]],
};
const researchStructure = {
  label: researchTable.label,
  corner: researchTable.tableCornerHeader,
  columns: [...researchTable.tableColumns],
  rows: [...researchTable.tableRows],
  widths: [...researchTable.tableColumnWidths],
  heights: [...researchTable.tableRowHeights],
};
assert.equal(blankNewProductTargetTable("product-research", researchTable, 4, 3), true);
assert.deepEqual(researchTable.tableRowLabels, ["", "", "", ""]);
assert.deepEqual(researchTable.value, [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]]);
assert.equal(researchTable.tableRowLabelsInitialized, true);
assert.equal(researchTable.tableRowLabelsIntentionallyBlank, true);
assert.deepEqual({
  label: researchTable.label,
  corner: researchTable.tableCornerHeader,
  columns: researchTable.tableColumns,
  rows: researchTable.tableRows,
  widths: researchTable.tableColumnWidths,
  heights: researchTable.tableRowHeights,
}, researchStructure, "Blank initialization must preserve the table definition and dimensions.");

const developmentTable = {
  label: " COMPETITORS   SPECS ",
  type: "CUSTOM_TABLE",
  tableCornerHeader: "Competitors Brand Name",
  tableColumns: ["Bundle", "Price Point", "Key Materials", "Dimensions"],
  tableRows: ["ROW 1", "ROW 2", "ROW 3", "ROW 4"],
};
assert.equal(isNewProductBlankTableTarget("product-development", developmentTable), true);

const supplierTable = {
  label: "",
  type: "CUSTOM_TABLE",
  tableCornerHeader: "Supplier Name",
  tableColumns: ["Alibaba Company Link", "MOQ", "MOQ Price Per Unit", "Sample Cost"],
  tableRows: ["OPHELIA"],
};
assert.equal(isNewProductBlankTableTarget("supplier-sourcing", supplierTable), true);

const intentionalDefaultsTable = {
  fieldId: "required-prefilled-table",
  label: "Final Product Specification",
  tableCornerHeader: "Specification",
  tableColumns: ["Requirement"],
  tableRows: ["Material", "Dimensions"],
  tableRowLabels: ["Material", "Dimensions"],
  value: [["Required default"], ["Required default"]],
};
const intentionalSnapshot = structuredClone(intentionalDefaultsTable);
assert.equal(blankNewProductTargetTable("product-development", intentionalDefaultsTable, 2, 1), false);
assert.deepEqual(intentionalDefaultsTable, intentionalSnapshot, "Non-target tables must remain untouched.");

assert.equal(shouldRestoreDefaultTableRowLabels({
  defaultLabels: ["ROW 1"],
  savedLabels: [""],
  tableRowLabelsIntentionallyBlank: true,
  hasCellData: false,
}), false, "Explicitly initialized blank labels must not be restored from the template.");
assert.equal(shouldRestoreDefaultTableRowLabels({
  defaultLabels: ["Required row"],
  savedLabels: [],
  tableRowLabelsIntentionallyBlank: false,
  hasCellData: false,
}), true, "Uninitialized tables must retain intentional template defaults.");
assert.equal(shouldRestoreDefaultTableRowLabels({
  defaultLabels: ["Required row"],
  savedLabels: [""],
  tableRowLabelsIntentionallyBlank: false,
  hasCellData: false,
}), true, "Older non-target blank records must continue receiving their required template defaults.");

const legacyWorkspace = {
  stageFieldTemplates: {
    "product-research": [structuredClone(researchTable)],
    "product-development": [structuredClone(developmentTable), structuredClone(intentionalDefaultsTable)],
    "supplier-sourcing": [structuredClone(supplierTable)],
  },
  products: {
    "legacy-empty": {
      stages: {
        "product-research": {
          customFields: [{
            ...structuredClone(researchTable),
            tableRowLabels: [...researchTable.tableRows],
            tableRowLabelsIntentionallyBlank: false,
            value: [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]],
          }],
        },
      },
    },
    "legacy-populated": {
      stages: {
        "product-research": {
          customFields: [{
            ...structuredClone(researchTable),
            tableRowLabels: [...researchTable.tableRows],
            tableRowLabelsIntentionallyBlank: false,
            value: [["https://example.com", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]],
          }],
        },
      },
    },
    "legacy-customized": {
      stages: {
        "product-research": {
          customFields: [{
            ...structuredClone(researchTable),
            tableRowLabels: ["Custom competitor", ...researchTable.tableRows.slice(1)],
            tableRowLabelsIntentionallyBlank: false,
            value: [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]],
          }],
        },
      },
    },
    "non-target": {
      stages: {
        "product-development": {
          customFields: [structuredClone(intentionalDefaultsTable)],
        },
      },
    },
  },
};
const legacyTemplatesBeforeRepair = structuredClone(legacyWorkspace.stageFieldTemplates);
const legacyRepair = repairLegacyTargetTableDefaults(legacyWorkspace);
assert.deepEqual(legacyRepair.changes, [{
  productId: "legacy-empty",
  stageId: "product-research",
  fieldId: researchTable.fieldId,
}], "Only the exact empty legacy target field should be marked for scoped sync.");
const repairedLegacyField = legacyRepair.workspaceDetails.products["legacy-empty"].stages["product-research"].customFields[0];
assert.deepEqual(repairedLegacyField.tableRowLabels, ["", "", "", ""]);
assert.equal(repairedLegacyField.tableRowLabelsIntentionallyBlank, true);
assert.equal(repairedLegacyField.tableRowLabelsInitialized, true);
assert.deepEqual(
  legacyRepair.workspaceDetails.products["legacy-populated"],
  legacyWorkspace.products["legacy-populated"],
  "A populated target table must be preserved.",
);
assert.deepEqual(
  legacyRepair.workspaceDetails.products["legacy-customized"],
  legacyWorkspace.products["legacy-customized"],
  "A customized target table must be preserved.",
);
assert.deepEqual(
  legacyRepair.workspaceDetails.products["non-target"],
  legacyWorkspace.products["non-target"],
  "A non-target table must be preserved.",
);
assert.deepEqual(legacyRepair.workspaceDetails.stageFieldTemplates, legacyTemplatesBeforeRepair, "Shared templates must not be modified.");
assert.deepEqual(legacyWorkspace.stageFieldTemplates, legacyTemplatesBeforeRepair, "The repair must not mutate its input.");
const secondLegacyRepair = repairLegacyTargetTableDefaults(legacyRepair.workspaceDetails);
assert.deepEqual(secondLegacyRepair.changes, [], "A second legacy repair pass must be idempotent.");
assert.deepEqual(secondLegacyRepair.workspaceDetails, legacyRepair.workspaceDetails);

const manuallyClearedField = {
  ...structuredClone(researchTable),
  tableRowLabels: [...researchTable.tableRows],
  tableRowLabelsIntentionallyBlank: false,
};
applyProductTableRowLabels("product-research", manuallyClearedField, ["", "", "", ""]);
assert.equal(manuallyClearedField.tableRowLabelsIntentionallyBlank, true);
assert.equal(shouldRestoreDefaultTableRowLabels({
  defaultLabels: manuallyClearedField.tableRows,
  savedLabels: manuallyClearedField.tableRowLabels,
  tableRowLabelsIntentionallyBlank: manuallyClearedField.tableRowLabelsIntentionallyBlank,
  hasCellData: false,
}), false, "A manually cleared target table must remain blank during normalization.");

assert.match(
  appSource,
  /const legacyTableRepair = repairLegacyTargetTableDefaults\(normalizeWorkspaceDetails\(state\.workspaceDetails\)\);/,
  "Remote hydration must repair the canonical shared workspace snapshot.",
);
assert.match(
  appSource,
  /markRemoteWorkspaceDirtyProductFieldIds\(change\.productId, change\.stageId, \[change\.fieldId\]\);/,
  "Legacy repair must mark only the affected product fields for scoped sync.",
);
assert.match(
  appSource,
  /legacyTableRepair\.changes\.length > 0 && canEditProductFieldValues\(\)/,
  "Only users allowed to edit product fields may persist the automatic repair.",
);
assert.match(
  appSource,
  /applyProductTableRowLabels\(section\.stageId, field, labels\);/,
  "Manual row-label edits must update the persistent blank marker.",
);

const legacyReview = { id: "legacy-review", title: "Existing review" };
const legacyFeedback = { id: "legacy-feedback", issue: "Existing feedback", status: "Pending" };
const existingSettings = {
  reviews: [legacyReview],
  feedback: [legacyFeedback],
  reviewsByProductId: {},
  feedbackByProductId: {},
};
assert.deepEqual(
  getProductScopedVineEntries(existingSettings, "reviewsByProductId", "reviews", "existing-product"),
  [legacyReview],
  "Existing products must keep the legacy review fallback.",
);

const initializedSettings = initializeNewProductVineCollections(existingSettings, "new-product");
assert.deepEqual(getProductScopedVineEntries(initializedSettings, "reviewsByProductId", "reviews", "new-product"), []);
assert.deepEqual(getProductScopedVineEntries(initializedSettings, "feedbackByProductId", "feedback", "new-product"), []);
assert.deepEqual(initializedSettings.reviews, [legacyReview], "New-product initialization must not modify legacy reviews.");
assert.deepEqual(initializedSettings.feedback, [legacyFeedback], "New-product initialization must not modify legacy feedback.");

const productAReview = { id: "product-a-review", title: "Product A review" };
const productASettings = setProductScopedVineEntries(initializedSettings, "reviewsByProductId", "product-a", [productAReview]);
assert.deepEqual(getProductScopedVineEntries(productASettings, "reviewsByProductId", "reviews", "product-a"), [productAReview]);
assert.deepEqual(getProductScopedVineEntries(productASettings, "reviewsByProductId", "reviews", "new-product"), []);
assert.deepEqual(
  getProductScopedVineEntries(productASettings, "reviewsByProductId", "reviews", "existing-product"),
  [legacyReview],
  "A product-specific edit must not transfer to another product.",
);

const aggregatedFeedback = collectUniqueVineEntries({
  feedback: [legacyFeedback],
  feedbackByProductId: {
    "product-a": [{ ...legacyFeedback, status: "Resolved" }],
    "product-b": [{ id: "product-b-feedback", issue: "B", status: "Pending" }],
  },
}, "feedbackByProductId", "feedback");
assert.deepEqual(aggregatedFeedback.map((entry) => [entry.id, entry.status]), [
  ["legacy-feedback", "Resolved"],
  ["product-b-feedback", "Pending"],
], "Dashboard aggregation should de-duplicate legacy entries that have a product-scoped version.");

console.log("New product default behavior passed.");
