export const COGS_MARKETPLACE_CURRENCY = "USD";
export const COGS_ENTRY_BASES = Object.freeze([
  Object.freeze({ value: "batch-total", label: "Batch Total" }),
  Object.freeze({ value: "per-unit", label: "Per Unit" }),
]);

export const COGS_COST_CATEGORIES = Object.freeze([
  Object.freeze({ value: "manufacturing", label: "Manufacturing or supplier product cost" }),
  Object.freeze({ value: "packaging", label: "Packaging materials" }),
  Object.freeze({ value: "printing-labels", label: "Printing, inserts, labels, and barcodes" }),
  Object.freeze({ value: "preparation", label: "Assembly, bundling, kitting, and product preparation" }),
  Object.freeze({ value: "inspection", label: "Inspection and quality control" }),
  Object.freeze({ value: "tooling", label: "Tooling, molds, samples, and design amortization" }),
  Object.freeze({ value: "international-freight", label: "International freight" }),
  Object.freeze({ value: "cargo-insurance", label: "Cargo insurance" }),
  Object.freeze({ value: "customs-duties", label: "Customs duties and tariffs" }),
  Object.freeze({ value: "customs-clearance", label: "Customs brokerage and clearance" }),
  Object.freeze({ value: "domestic-freight", label: "Domestic freight" }),
  Object.freeze({ value: "third-party-logistics", label: "3PL receiving, handling, and preparation" }),
  Object.freeze({ value: "amazon-inbound", label: "Amazon inbound placement or service fees" }),
  Object.freeze({ value: "other", label: "Other custom landed cost" }),
]);

const COGS_CATEGORY_VALUES = new Set(COGS_COST_CATEGORIES.map((category) => category.value));
const COGS_ENTRY_BASIS_VALUES = new Set(COGS_ENTRY_BASES.map((basis) => basis.value));
const CALCULATION_PRECISION = 6;

export function createBlankCogsCostElement({ id = "", batchUnits = "" } = {}) {
  return {
    id,
    category: "manufacturing",
    customName: "",
    provider: "",
    entryBasis: "batch-total",
    amountPaid: "",
    paymentCurrency: COGS_MARKETPLACE_CURRENCY,
    exchangeRate: "1",
    unitsCovered: batchUnits === null || batchUnits === undefined ? "" : String(batchUnits),
    notes: "",
  };
}

export function createBlankCogsBatchDraft({ id = "", effectiveDate = "", costElementId = "" } = {}) {
  return {
    id,
    name: "",
    effectiveDate,
    sellableUnits: "",
    marketplaceCurrency: COGS_MARKETPLACE_CURRENCY,
    costElements: [createBlankCogsCostElement({ id: costElementId })],
    createdAt: "",
    updatedAt: "",
  };
}

export function calculateCogsCostPerUnit(costElement, batchUnits = 0) {
  const amountPaid = toFiniteNumber(costElement?.amountPaid);
  const exchangeRate = toFiniteNumber(costElement?.exchangeRate);
  if (amountPaid === null || amountPaid < 0 || exchangeRate === null || exchangeRate <= 0) return 0;

  const convertedAmount = amountPaid * exchangeRate;
  if (costElement?.entryBasis === "per-unit") return roundCalculation(convertedAmount);

  const unitsCovered = toFiniteNumber(costElement?.unitsCovered) ?? toFiniteNumber(batchUnits);
  if (unitsCovered === null || unitsCovered <= 0) return 0;
  return roundCalculation(convertedAmount / unitsCovered);
}

export function calculateCogsBatchTotal(batch) {
  const batchUnits = toFiniteNumber(batch?.sellableUnits) ?? 0;
  const costElements = Array.isArray(batch?.costElements) ? batch.costElements : [];
  return roundCalculation(costElements.reduce(
    (total, costElement) => total + calculateCogsCostPerUnit(costElement, batchUnits),
    0,
  ));
}

export function validateCogsBatchDraft(batch) {
  const errors = {};
  const effectiveDate = String(batch?.effectiveDate ?? "").trim();
  const sellableUnits = toFiniteNumber(batch?.sellableUnits);
  const costElements = Array.isArray(batch?.costElements) ? batch.costElements : [];

  if (!isIsoDate(effectiveDate)) errors.effectiveDate = "Enter a valid effective or received date.";
  if (sellableUnits === null || sellableUnits <= 0) errors.sellableUnits = "Sellable units must be greater than zero.";
  if (costElements.length === 0) errors.costElements = "Add at least one landed-cost row.";

  costElements.forEach((costElement, index) => {
    const prefix = `costElements.${index}`;
    const category = String(costElement?.category ?? "").trim();
    const amountPaid = toFiniteNumber(costElement?.amountPaid);
    const exchangeRate = toFiniteNumber(costElement?.exchangeRate);
    const unitsCovered = toFiniteNumber(costElement?.unitsCovered);
    const paymentCurrency = String(costElement?.paymentCurrency ?? "").trim().toUpperCase();
    const entryBasis = COGS_ENTRY_BASIS_VALUES.has(costElement?.entryBasis) ? costElement.entryBasis : "batch-total";

    if (!COGS_CATEGORY_VALUES.has(category)) errors[`${prefix}.category`] = "Choose a cost category.";
    if (category === "other" && !String(costElement?.customName ?? "").trim()) {
      errors[`${prefix}.customName`] = "Enter a name for the custom landed cost.";
    }
    if (amountPaid === null || amountPaid < 0) errors[`${prefix}.amountPaid`] = "Amount paid must be zero or greater.";
    if (!/^[A-Z]{3}$/.test(paymentCurrency)) errors[`${prefix}.paymentCurrency`] = "Enter a three-letter currency code.";
    if (exchangeRate === null || exchangeRate <= 0) errors[`${prefix}.exchangeRate`] = "Exchange rate must be greater than zero.";
    if (entryBasis === "batch-total" && (unitsCovered === null || unitsCovered <= 0)) {
      errors[`${prefix}.unitsCovered`] = "Units covered must be greater than zero for a batch-total cost.";
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function normalizeCogsCostElement(costElement, { fallbackId = "", batchUnits = 0 } = {}) {
  const category = COGS_CATEGORY_VALUES.has(costElement?.category) ? costElement.category : "other";
  const entryBasis = COGS_ENTRY_BASIS_VALUES.has(costElement?.entryBasis) ? costElement.entryBasis : "batch-total";
  const amountPaid = normalizeNonNegativeNumber(costElement?.amountPaid);
  const exchangeRate = normalizePositiveNumber(costElement?.exchangeRate, 1);
  const unitsCovered = entryBasis === "batch-total"
    ? normalizePositiveNumber(costElement?.unitsCovered, normalizePositiveNumber(batchUnits, 1))
    : normalizePositiveNumber(costElement?.unitsCovered, normalizePositiveNumber(batchUnits, 1));
  const normalized = {
    id: String(costElement?.id ?? fallbackId).trim() || fallbackId,
    category,
    customName: String(costElement?.customName ?? "").trim(),
    provider: String(costElement?.provider ?? "").trim(),
    entryBasis,
    amountPaid,
    paymentCurrency: normalizeCurrencyCode(costElement?.paymentCurrency),
    exchangeRate,
    unitsCovered,
    notes: String(costElement?.notes ?? "").trim(),
  };
  return {
    ...normalized,
    costPerUnit: calculateCogsCostPerUnit(normalized, batchUnits),
  };
}

export function normalizeCogsBatch(batch, { fallbackId = "", now = "" } = {}) {
  const sellableUnits = normalizePositiveNumber(batch?.sellableUnits, 0);
  const createdAt = normalizeTimestamp(batch?.createdAt) || normalizeTimestamp(now);
  const updatedAt = normalizeTimestamp(batch?.updatedAt) || normalizeTimestamp(now) || createdAt;
  const costElements = (Array.isArray(batch?.costElements) ? batch.costElements : []).map((costElement, index) => (
    normalizeCogsCostElement(costElement, {
      fallbackId: String(costElement?.id ?? "").trim() || `${fallbackId || "cogs_batch"}_cost_${index + 1}`,
      batchUnits: sellableUnits,
    })
  ));
  const normalized = {
    id: String(batch?.id ?? fallbackId).trim() || fallbackId,
    name: String(batch?.name ?? "").trim(),
    effectiveDate: isIsoDate(String(batch?.effectiveDate ?? "").trim()) ? String(batch.effectiveDate).trim() : "",
    sellableUnits,
    marketplaceCurrency: COGS_MARKETPLACE_CURRENCY,
    costElements,
    createdAt,
    updatedAt,
  };
  return {
    ...normalized,
    totalCogsPerUnit: calculateCogsBatchTotal(normalized),
  };
}

export function normalizeCogsBatches(batches) {
  const normalizedById = new Map();
  (Array.isArray(batches) ? batches : []).forEach((batch, index) => {
    const normalized = normalizeCogsBatch(batch, { fallbackId: `cogs_batch_${index + 1}` });
    if (!normalized.id || !normalized.effectiveDate || normalized.sellableUnits <= 0 || normalized.costElements.length === 0) return;
    normalizedById.set(normalized.id, normalized);
  });
  return Array.from(normalizedById.values()).sort(compareCogsBatchesNewestFirst);
}

export function getLatestCogsBatch(batches) {
  return normalizeCogsBatches(batches)[0] ?? null;
}

export function getCurrentCogsValue(financials, fallbackCogs = 0) {
  const latestBatch = getLatestCogsBatch(financials?.cogsBatches);
  if (latestBatch) return latestBatch.totalCogsPerUnit;
  return normalizeNonNegativeNumber(financials?.cogs, fallbackCogs);
}

export function compareCogsBatchesNewestFirst(left, right) {
  const dateComparison = String(right?.effectiveDate ?? "").localeCompare(String(left?.effectiveDate ?? ""));
  if (dateComparison !== 0) return dateComparison;
  const updatedComparison = String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
  if (updatedComparison !== 0) return updatedComparison;
  return String(right?.id ?? "").localeCompare(String(left?.id ?? ""));
}

function normalizeCurrencyCode(value) {
  const currency = String(value ?? COGS_MARKETPLACE_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : COGS_MARKETPLACE_CURRENCY;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null || numericValue < 0) return roundCalculation(Math.max(0, Number(fallback) || 0));
  return roundCalculation(numericValue);
}

function normalizePositiveNumber(value, fallback = 1) {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null || numericValue <= 0) return roundCalculation(Math.max(0, Number(fallback) || 0));
  return roundCalculation(numericValue);
}

function normalizeTimestamp(value) {
  const timestamp = String(value ?? "").trim();
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : "";
}

function toFiniteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function roundCalculation(value) {
  return Number((Number(value) || 0).toFixed(CALCULATION_PRECISION));
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
