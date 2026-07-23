import assert from "node:assert/strict";
import {
  NEW_PRODUCT_BLANK_TABLE_STAGE_IDS,
  blankNewProductTargetTable,
  collectUniqueVineEntries,
  getProductScopedVineEntries,
  initializeNewProductVineCollections,
  isNewProductBlankTableTarget,
  setProductScopedVineEntries,
  shouldRestoreDefaultTableRowLabels,
} from "../js/product-defaults.mjs";

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
