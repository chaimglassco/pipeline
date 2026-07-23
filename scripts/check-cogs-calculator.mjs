import assert from "node:assert/strict";
import {
  calculateCogsBatchTotal,
  calculateCogsCostPerUnit,
  getCurrentCogsValue,
  getLatestCogsBatch,
  normalizeCogsBatch,
  normalizeCogsBatches,
  validateCogsBatchDraft,
} from "../js/cogs-calculator.mjs";

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
assert.equal(calculateCogsBatchTotal(precisionBatch), 0.333333);

const normalizedBatch = normalizeCogsBatch(mixedBatch, { now: "2026-07-21T10:00:00.000Z" });
assert.equal(normalizedBatch.totalCogsPerUnit, 7.95);
assert.equal(normalizedBatch.costElements[2].paymentCurrency, "EUR");
assert.equal(normalizedBatch.createdAt, "2026-07-21T10:00:00.000Z");

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
assert.ok(invalidResult.errors.effectiveDate);
assert.ok(invalidResult.errors.sellableUnits);
assert.ok(invalidResult.errors["costElements.0.customName"]);
assert.ok(invalidResult.errors["costElements.0.amountPaid"]);
assert.ok(invalidResult.errors["costElements.0.paymentCurrency"]);
assert.ok(invalidResult.errors["costElements.0.exchangeRate"]);
assert.ok(invalidResult.errors["costElements.0.unitsCovered"]);

console.log("COGS calculator checks passed.");
