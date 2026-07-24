import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  COGS_COST_CATEGORIES,
  calculateCogsBatchTotal,
  calculateCogsCostPerUnit,
  createBlankCogsBatchDraft,
  getActiveCogsCostElements,
  getCurrentCogsValue,
  getLatestCogsBatch,
  hydrateCogsBatchDraft,
  isCogsCostElementActive,
  normalizeCogsBatch,
  normalizeCogsBatches,
  reconcileCogsBatchDraftWithTemplate,
  resetCogsCostElement,
  validateCogsBatchDraft,
} from "../js/cogs-calculator.mjs";
import {
  addCogsTemplateRow,
  createDefaultCogsTemplateSettings,
  deleteCogsTemplateRow,
} from "../js/cogs-template.mjs";

const blankPresetDraft = createBlankCogsBatchDraft({
  id: "batch_preset",
  effectiveDate: "2026-07-23",
  costElementId: "preset_cost",
});
assert.equal(blankPresetDraft.costElements.length, 18);
assert.equal(new Set(blankPresetDraft.costElements.map((costElement) => costElement.templateRowId)).size, 18);
assert.deepEqual(
  blankPresetDraft.costElements.filter((costElement) => costElement.entryBasis === "per-unit").map((costElement) => costElement.templateRowId),
  [],
);
assert.equal(blankPresetDraft.costElements.every((costElement) => costElement.entryBasis === "batch-total"), true);
assert.equal(blankPresetDraft.costElements.find((costElement) => costElement.templateRowId === "amazon-inbound").templateCategoryId, "amazon-costs");
assert.equal(blankPresetDraft.costElements.every((costElement) => costElement.paymentCurrency === "USD"), true);
assert.equal(blankPresetDraft.costElements.every((costElement) => costElement.exchangeRate === "1"), true);
assert.equal(getActiveCogsCostElements(blankPresetDraft.costElements, blankPresetDraft.sellableUnits).length, 0);
const blankPresetValidation = validateCogsBatchDraft({
  ...blankPresetDraft,
  sellableUnits: "100",
  costElements: blankPresetDraft.costElements.map((costElement) => ({ ...costElement, unitsCovered: "100" })),
});
assert.equal(blankPresetValidation.isValid, false);
assert.ok(blankPresetValidation.errors.costElements);
assert.equal(Object.keys(blankPresetValidation.errors).some((key) => key.endsWith(".amountPaid")), false);

const activePresetDraft = structuredClone(blankPresetDraft);
activePresetDraft.sellableUnits = "100";
activePresetDraft.costElements = activePresetDraft.costElements.map((costElement) => ({
  ...costElement,
  unitsCovered: "100",
}));
activePresetDraft.costElements[0].amountPaid = "2.5";
assert.equal(validateCogsBatchDraft(activePresetDraft).isValid, true);
const normalizedActivePresetDraft = normalizeCogsBatch(activePresetDraft);
assert.equal(normalizedActivePresetDraft.costElements.length, 1);
assert.equal(normalizedActivePresetDraft.totalCogsPerUnit, 0.025);
assert.equal(normalizedActivePresetDraft.costElements[0].templateCategoryId, "product-preparation");
assert.equal(normalizedActivePresetDraft.costElements[0].templateRowId, "manufacturing");
assert.equal(normalizedActivePresetDraft.costElements[0].categoryLabel, "Product and Preparation");
assert.equal(normalizedActivePresetDraft.costElements[0].rowLabel, "Manufacturing or supplier product cost");

const zeroAmountDraft = structuredClone(activePresetDraft);
zeroAmountDraft.costElements[0].amountPaid = "0";
assert.equal(isCogsCostElementActive(zeroAmountDraft.costElements[0], "100"), true);
assert.equal(validateCogsBatchDraft(zeroAmountDraft).isValid, true);

const metadataWithoutAmountDraft = structuredClone(activePresetDraft);
metadataWithoutAmountDraft.costElements[0].amountPaid = "";
metadataWithoutAmountDraft.costElements[0].provider = "Supplier";
const metadataWithoutAmountValidation = validateCogsBatchDraft(metadataWithoutAmountDraft);
assert.equal(metadataWithoutAmountValidation.isValid, false);
assert.ok(metadataWithoutAmountValidation.errors["costElements.0.amountPaid"]);

const clearedPresetRow = resetCogsCostElement(activePresetDraft.costElements[0], "100");
assert.equal(clearedPresetRow.id, activePresetDraft.costElements[0].id);
assert.equal(clearedPresetRow.category, "manufacturing");
assert.equal(clearedPresetRow.entryBasis, "batch-total");
assert.equal(clearedPresetRow.amountPaid, "");
assert.equal(isCogsCostElementActive(clearedPresetRow, "100"), false);
assert.deepEqual(COGS_COST_CATEGORIES.map((category) => category.templateRowId), blankPresetDraft.costElements.map((costElement) => costElement.templateRowId));

const mixedBatch = {
  id: "batch_mixed",
  name: "PO-100",
  effectiveDate: "2026-07-20",
  sellableUnits: 100,
  marketplaceCurrency: "USD",
  costElements: [
    {
      id: "manufacturing",
      category: "manufacturing",
      entryBasis: "batch-total",
      amountPaid: 500,
      paymentCurrency: "USD",
      exchangeRate: 1,
      unitsCovered: 100,
    },
    {
      id: "packaging",
      category: "packaging",
      entryBasis: "per-unit",
      amountPaid: 0.75,
      paymentCurrency: "USD",
      exchangeRate: 1,
      unitsCovered: 100,
    },
    {
      id: "freight",
      category: "international-freight",
      entryBasis: "batch-total",
      amountPaid: 200,
      paymentCurrency: "EUR",
      exchangeRate: 1.1,
      unitsCovered: 100,
    },
  ],
};

assert.equal(calculateCogsCostPerUnit(mixedBatch.costElements[0], mixedBatch.sellableUnits), 5);
assert.equal(calculateCogsCostPerUnit(mixedBatch.costElements[1], mixedBatch.sellableUnits), 0.75);
assert.equal(calculateCogsCostPerUnit(mixedBatch.costElements[2], mixedBatch.sellableUnits), 2.2);
assert.equal(calculateCogsBatchTotal(mixedBatch), 7.95);

const precisionBatch = {
  ...mixedBatch,
  id: "batch_precision",
  costElements: [{
    ...mixedBatch.costElements[0],
    amountPaid: 1,
    unitsCovered: 3,
  }],
};
assert.equal(calculateCogsBatchTotal(precisionBatch), 0.01);
assert.equal(calculateCogsCostPerUnit({
  ...mixedBatch.costElements[0],
  amountPaid: 1000,
  unitsCovered: 25,
}, 500), 2);
assert.equal(calculateCogsCostPerUnit({
  ...mixedBatch.costElements[0],
  entryBasis: "per-unit",
  amountPaid: 1000,
}, 500), 1000);

const normalizedBatch = normalizeCogsBatch(mixedBatch, { now: "2026-07-21T10:00:00.000Z" });
assert.equal(normalizedBatch.totalCogsPerUnit, 7.95);
assert.equal(normalizedBatch.costElements[2].paymentCurrency, "EUR");
assert.equal(normalizedBatch.createdAt, "2026-07-21T10:00:00.000Z");

const hydratedDuplicateDraft = hydrateCogsBatchDraft({
  ...normalizedBatch,
  costElements: [
    normalizedBatch.costElements[0],
    { ...normalizedBatch.costElements[0], id: "manufacturing_duplicate", amountPaid: 25 },
  ],
}, { idPrefix: "hydrated_cost" });
assert.equal(hydratedDuplicateDraft.costElements.length, 19);
assert.equal(hydratedDuplicateDraft.costElements.filter((costElement) => costElement.category === "manufacturing").length, 2);
assert.equal(hydratedDuplicateDraft.costElements.find((costElement) => costElement.id === "manufacturing_duplicate").legacyDuplicate, true);
assert.equal(normalizeCogsBatch(hydratedDuplicateDraft).costElements.length, 2);

let latestTemplate = createDefaultCogsTemplateSettings();
latestTemplate = deleteCogsTemplateRow(latestTemplate, "manufacturing");
latestTemplate = deleteCogsTemplateRow(latestTemplate, "packaging");
latestTemplate = addCogsTemplateRow(latestTemplate, "product-preparation", {
  id: "workspace-custom-cost",
  label: "Workspace custom cost",
  defaultEntryBasis: "per-unit",
});
const openDraftBeforeTemplateChange = createBlankCogsBatchDraft({
  id: "open-draft",
  effectiveDate: "2026-07-23",
  costElementId: "open-cost",
});
openDraftBeforeTemplateChange.sellableUnits = "50";
openDraftBeforeTemplateChange.costElements = openDraftBeforeTemplateChange.costElements.map((costElement) => ({
  ...costElement,
  unitsCovered: "50",
}));
openDraftBeforeTemplateChange.costElements.find((costElement) => costElement.templateRowId === "manufacturing").amountPaid = "4.25";
const reconciledOpenDraft = reconcileCogsBatchDraftWithTemplate(openDraftBeforeTemplateChange, latestTemplate, {
  idPrefix: "reconciled",
  preserveUnmatchedBlankRows: false,
});
const preservedDeletedRow = reconciledOpenDraft.costElements.find((costElement) => costElement.templateRowId === "manufacturing");
assert.equal(preservedDeletedRow.amountPaid, "4.25");
assert.equal(preservedDeletedRow.legacyRemoved, true);
assert.equal(reconciledOpenDraft.costElements.some((costElement) => costElement.templateRowId === "packaging"), false);
const newTemplateRow = reconciledOpenDraft.costElements.find((costElement) => costElement.templateRowId === "workspace-custom-cost");
assert.ok(newTemplateRow);
assert.equal(newTemplateRow.amountPaid, "");
assert.equal(newTemplateRow.paymentCurrency, "USD");
assert.equal(newTemplateRow.exchangeRate, "1");
assert.equal(newTemplateRow.entryBasis, "batch-total");
assert.equal(newTemplateRow.requiresCustomName, false);

const historicalBatchBeforeReconcile = JSON.stringify(normalizedBatch);
const hydratedHistoricalBatch = reconcileCogsBatchDraftWithTemplate(normalizedBatch, latestTemplate, {
  idPrefix: "historical",
  preserveUnmatchedBlankRows: false,
});
assert.equal(JSON.stringify(normalizedBatch), historicalBatchBeforeReconcile);
assert.equal(hydratedHistoricalBatch.costElements.find((costElement) => costElement.templateRowId === "manufacturing").amountPaid, "500");
assert.equal(hydratedHistoricalBatch.costElements.find((costElement) => costElement.templateRowId === "manufacturing").legacyRemoved, true);

const latestTemplateDraft = createBlankCogsBatchDraft({
  id: "latest-template-batch",
  effectiveDate: "2026-07-23",
  costElementId: "latest-template-cost",
  templateSettings: latestTemplate,
});
assert.deepEqual(
  latestTemplateDraft.costElements.map((costElement) => costElement.templateRowId),
  latestTemplate.categories.flatMap((category) => category.rows.map((row) => row.id)),
);

const olderBatch = normalizeCogsBatch({
  ...mixedBatch,
  id: "batch_older",
  effectiveDate: "2026-06-01",
  costElements: [{ ...mixedBatch.costElements[0], amountPaid: 400 }],
}, { now: "2026-06-01T10:00:00.000Z" });
const laterBatch = normalizeCogsBatch({
  ...mixedBatch,
  id: "batch_later",
  effectiveDate: "2026-08-01",
  costElements: [{ ...mixedBatch.costElements[0], amountPaid: 600 }],
}, { now: "2026-08-01T10:00:00.000Z" });
assert.equal(getLatestCogsBatch([olderBatch, normalizedBatch, laterBatch]).id, "batch_later");
assert.equal(getLatestCogsBatch([olderBatch, normalizedBatch, laterBatch].filter((batch) => batch.id !== laterBatch.id)).id, "batch_mixed");
assert.equal(getCurrentCogsValue({ cogs: 3.25, cogsBatches: [olderBatch, laterBatch] }), 6);
assert.equal(getCurrentCogsValue({ cogs: 3.25, cogsBatches: [] }), 3.25);
assert.equal(getCurrentCogsValue({ cogs: 3.25 }), 3.25);

const duplicateBatches = normalizeCogsBatches([
  olderBatch,
  { ...olderBatch, name: "Updated duplicate" },
]);
assert.equal(duplicateBatches.length, 1);
assert.equal(duplicateBatches[0].name, "Updated duplicate");

const validDraft = {
  ...mixedBatch,
  costElements: [
    ...mixedBatch.costElements,
    {
      id: "other",
      category: "other",
      customName: "Port documentation",
      entryBasis: "batch-total",
      amountPaid: 25,
      paymentCurrency: "USD",
      exchangeRate: 1,
      unitsCovered: 100,
    },
  ],
};
assert.equal(validateCogsBatchDraft(validDraft).isValid, true);

const invalidDraft = {
  effectiveDate: "",
  sellableUnits: 0,
  costElements: [{
    category: "other",
    customName: "",
    entryBasis: "batch-total",
    amountPaid: -1,
    paymentCurrency: "",
    exchangeRate: 0,
    unitsCovered: 0,
  }],
};
const invalidResult = validateCogsBatchDraft(invalidDraft);
assert.equal(invalidResult.isValid, false);
assert.equal(invalidResult.errors.effectiveDate, undefined);
assert.ok(invalidResult.errors.sellableUnits);
assert.ok(invalidResult.errors["costElements.0.customName"]);
assert.ok(invalidResult.errors["costElements.0.amountPaid"]);
assert.ok(invalidResult.errors["costElements.0.paymentCurrency"]);
assert.ok(invalidResult.errors["costElements.0.exchangeRate"]);
assert.equal(invalidResult.errors["costElements.0.unitsCovered"], undefined);

const appSource = fs.readFileSync(path.resolve(import.meta.dirname, "..", "js", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.resolve(import.meta.dirname, "..", "css", "styles.css"), "utf8");
const calculatorModalSource = appSource.match(/function renderCogsCalculatorModal\(\) \{[\s\S]*?\n\}/)?.[0] || "";
const calculatorEditorSource = appSource.match(/function renderCogsBatchEditor\(product, modal, isSaving\) \{[\s\S]*?\n\}/)?.[0] || "";
const calculatorRowSource = appSource.match(/function renderCogsCostRow\(costElement, index, batchUnits, errors, modal, isSaving\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(calculatorModalSource, /Shipment batches|Saved batches|Latest batch|Add shipment batch|Marketplace currency/);
assert.doesNotMatch(calculatorModalSource, /isSharedWorkspaceSaving\(\)/);
assert.match(appSource, /function renderCogsOrderUnitsCard[\s\S]*?Total order units/);
assert.match(calculatorEditorSource, /renderCogsSummaryValue\("Current COGS"/);
assert.match(calculatorEditorSource, /renderCogsSummaryValue\("Current COGS"[\s\S]*?renderCogsOrderUnitsCard/);
assert.doesNotMatch(calculatorEditorSource, /cogs-batch-editor__live-total/);
assert.match(calculatorEditorSource, /Save COGS/);
assert.doesNotMatch(calculatorEditorSource, /Batch name|Effective \/ received date|Marketplace currency|Save shipment batch/);
assert.doesNotMatch(calculatorRowSource, /renderCogsCompactInput\("Currency"|renderCogsCompactInput\("Units"/);
assert.match(appSource, /const nextBatches = \[savedBatch\];/);
assert.match(appSource, /modal\.templateDeleteConfirmation = \{ \.\.\.confirmation, deleting: true \};/);
assert.match(appSource, /modalSuccessNotice: `“\$\{itemLabel\}” deleted successfully\.`/);
assert.match(appSource, /cogs-delete-confirmation__spinner/);
assert.match(appSource, /const COGS_SUCCESS_NOTICE_DURATION_MS = 2 \* 60 \* 1000;/);
assert.match(appSource, /function setCogsModalSuccessNotice\(modal, message\)/);
assert.equal((appSource.match(/renderCogsCalculatorPreservingScroll\(\);/g) || []).length >= 4, true);
assert.match(cssSource, /\.cogs-delete-confirmation__delete \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/);
assert.match(cssSource, /\.cogs-calculator__summary-item--input input \{[\s\S]*?box-sizing: border-box;[\s\S]*?width: 100%;/);
assert.match(cssSource, /\.cogs-cost-row__note-button--populated \{[\s\S]*?background: var\(--color-primary\);[\s\S]*?color: #ffffff;/);
assert.match(appSource, /preserveCogsScroll: true/);
assert.match(appSource, /uiState\.cogsCalculatorModal = null;/);
assert.match(appSource, /summaryText: `\$\{formatCurrency\(categoryTotal\)\} \/ unit`/);
assert.match(appSource, /dataCogsCategoryTotalOutput: categoryTotalOutputId/);
assert.match(appSource, /querySelectorAll\("\[data-cogs-category-total-output\]"\)/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf("function renderCogsCostGroup"), appSource.indexOf("function renderCogsCategoryToggle")),
  /rowCount: rows\.length/,
);
assert.match(cssSource, /\.cogs-cost-group__row-count,\s*\.cogs-cost-group__summary \{/);

console.log("COGS calculator checks passed.");
