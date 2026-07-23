import assert from "node:assert/strict";
import {
  addCogsTemplateCategory,
  addCogsTemplateRow,
  createDefaultCogsTemplateSettings,
  deleteCogsTemplateCategory,
  deleteCogsTemplateRow,
  getCogsTemplateRows,
  moveCogsTemplateRow,
  normalizeCogsTemplateSettings,
  renameCogsTemplateCategory,
  reorderCogsTemplateCategories,
  reorderCogsTemplateRows,
  updateCogsTemplateRow,
  validateCogsTemplateSettings,
} from "../js/cogs-template.mjs";

const defaults = createDefaultCogsTemplateSettings();
assert.equal(defaults.version, 1);
assert.equal(defaults.categories.length, 5);
assert.equal(getCogsTemplateRows(defaults).length, 18);
const amazon = defaults.categories.find((category) => category.id === "amazon-costs");
assert.ok(amazon);
assert.deepEqual(amazon.rows.map((row) => row.id), [
  "amazon-referral-fee",
  "fba-fulfillment-fee",
  "amazon-storage-fee",
  "amazon-inbound",
  "other-amazon-fee",
]);
assert.equal(amazon.rows.find((row) => row.id === "amazon-referral-fee").defaultEntryBasis, "per-unit");
assert.equal(amazon.rows.find((row) => row.id === "fba-fulfillment-fee").defaultEntryBasis, "per-unit");
assert.equal(amazon.rows.find((row) => row.id === "amazon-storage-fee").defaultEntryBasis, "batch-total");
assert.equal(getCogsTemplateRows(defaults).filter((row) => row.id === "amazon-inbound").length, 1);
assert.equal(new Set(defaults.categories.map((category) => category.id)).size, defaults.categories.length);
assert.equal(new Set(getCogsTemplateRows(defaults).map((row) => row.id)).size, getCogsTemplateRows(defaults).length);

let generatedIds = addCogsTemplateCategory(defaults);
generatedIds = addCogsTemplateCategory(generatedIds);
const generatedCategories = generatedIds.categories.slice(-2);
assert.notEqual(generatedCategories[0].id, generatedCategories[1].id);
generatedIds = addCogsTemplateRow(generatedIds, generatedCategories[0].id);
generatedIds = addCogsTemplateRow(generatedIds, generatedCategories[0].id);
const generatedRows = generatedIds.categories.find((category) => category.id === generatedCategories[0].id).rows;
assert.notEqual(generatedRows[0].id, generatedRows[1].id);

let edited = addCogsTemplateCategory(defaults, { id: "local-costs", label: "Local Costs" });
edited = addCogsTemplateRow(edited, "local-costs", { id: "delivery", label: "Delivery", defaultEntryBasis: "batch-total" });
edited = renameCogsTemplateCategory(edited, "local-costs", "Local Delivery");
edited = updateCogsTemplateRow(edited, "delivery", { label: "Last-mile delivery", defaultEntryBasis: "per-unit" });
assert.equal(edited.categories.find((category) => category.id === "local-costs").label, "Local Delivery");
assert.equal(getCogsTemplateRows(edited).find((row) => row.id === "delivery").defaultEntryBasis, "per-unit");

let invalidDraft = renameCogsTemplateCategory(edited, "local-costs", "");
invalidDraft = updateCogsTemplateRow(invalidDraft, "delivery", { label: "" });
invalidDraft = updateCogsTemplateRow(invalidDraft, "delivery", { defaultEntryBasis: "batch-total" });
assert.ok(invalidDraft.categories.find((category) => category.id === "local-costs"));
assert.ok(getCogsTemplateRows(invalidDraft).find((row) => row.id === "delivery"));
assert.equal(validateCogsTemplateSettings(invalidDraft).isValid, false);
assert.ok(validateCogsTemplateSettings(invalidDraft).errors["categories.5.label"]);
assert.ok(validateCogsTemplateSettings(invalidDraft).errors["categories.5.rows.0.label"]);

edited = moveCogsTemplateRow(edited, "delivery", "amazon-costs");
assert.equal(getCogsTemplateRows(edited).find((row) => row.id === "delivery").categoryId, "amazon-costs");
edited = reorderCogsTemplateRows(edited, "amazon-costs", "delivery", "amazon-referral-fee");
assert.equal(edited.categories.find((category) => category.id === "amazon-costs").rows[0].id, "delivery");
edited = reorderCogsTemplateCategories(edited, "local-costs", "product-preparation");
assert.equal(edited.categories[0].id, "local-costs");

edited = deleteCogsTemplateRow(edited, "delivery");
edited = deleteCogsTemplateCategory(edited, "local-costs");
assert.equal(validateCogsTemplateSettings(edited).isValid, true);

assert.throws(
  () => deleteCogsTemplateCategory({ ...defaults, categories: [defaults.categories[0]] }, defaults.categories[0].id),
  /at least one COGS category/i,
);
assert.throws(
  () => deleteCogsTemplateRow({
    version: 1,
    categories: [{ id: "only", label: "Only", rows: [{ id: "only-row", label: "Only row", defaultEntryBasis: "per-unit" }] }],
  }, "only-row"),
  /at least one COGS cost row/i,
);

const normalized = normalizeCogsTemplateSettings({
  ...defaults,
  updatedAt: "2026-07-23T12:00:00.000Z",
  updatedBy: "admin@example.com",
});
assert.equal(normalized.updatedBy, "admin@example.com");
assert.equal(normalized.updatedAt, "2026-07-23T12:00:00.000Z");

console.log("COGS template checks passed.");
