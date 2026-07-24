import {
  createDefaultCogsTemplateSettings,
  findCogsTemplateRow,
  findCogsTemplateRowByLegacyCategory,
  getCogsTemplateRows,
  normalizeCogsTemplateSettings,
} from "./cogs-template.mjs";

export const COGS_MARKETPLACE_CURRENCY = "USD";
export const COGS_ENTRY_BASES = Object.freeze([
  Object.freeze({ value: "batch-total", label: "Batch Total" }),
  Object.freeze({ value: "per-unit", label: "Per Unit" }),
]);

const DEFAULT_COGS_TEMPLATE = createDefaultCogsTemplateSettings();

export const COGS_COST_CATEGORY_GROUPS = Object.freeze(DEFAULT_COGS_TEMPLATE.categories.map((category) => (
  Object.freeze({ value: category.id, label: category.label })
)));

export const COGS_COST_CATEGORIES = Object.freeze(getCogsTemplateRows(DEFAULT_COGS_TEMPLATE).map((row) => (
  Object.freeze({
    value: row.legacyCategory || row.id,
    templateRowId: row.id,
    label: row.label,
    group: row.categoryId,
    defaultEntryBasis: row.defaultEntryBasis,
    ...(row.requiresCustomName ? { requiresCustomName: true } : {}),
  })
)));

const COGS_ENTRY_BASIS_VALUES = new Set(COGS_ENTRY_BASES.map((basis) => basis.value));
const COGS_CATEGORY_BY_VALUE = new Map(COGS_COST_CATEGORIES.map((category) => [category.value, category]));
const CALCULATION_PRECISION = 6;

export function getCogsCostCategory(categoryValue) {
  return COGS_CATEGORY_BY_VALUE.get(categoryValue) ?? COGS_CATEGORY_BY_VALUE.get("other");
}

export function createBlankCogsCostElement({
  id = "",
  category = "manufacturing",
  batchUnits = "",
  legacyDuplicate = false,
  legacyRemoved = false,
  templateCategoryId = "",
  templateRowId = "",
  categoryLabel = "",
  rowLabel = "",
  defaultEntryBasis = "",
  requiresCustomName = null,
} = {}) {
  const categoryDefinition = getCogsCostCategory(category);
  const resolvedEntryBasis = COGS_ENTRY_BASIS_VALUES.has(defaultEntryBasis)
    ? defaultEntryBasis
    : categoryDefinition.defaultEntryBasis;
  return {
    id,
    category: categoryDefinition.value,
    templateCategoryId: String(templateCategoryId ?? "").trim() || categoryDefinition.group,
    templateRowId: String(templateRowId ?? "").trim() || categoryDefinition.templateRowId || categoryDefinition.value,
    categoryLabel: String(categoryLabel ?? "").trim() || COGS_COST_CATEGORY_GROUPS.find((group) => group.value === categoryDefinition.group)?.label || "Other",
    rowLabel: String(rowLabel ?? "").trim() || categoryDefinition.label,
    defaultEntryBasis: resolvedEntryBasis,
    requiresCustomName: Boolean(requiresCustomName ?? categoryDefinition.requiresCustomName),
    customName: "",
    provider: "",
    entryBasis: resolvedEntryBasis,
    amountPaid: "",
    paymentCurrency: COGS_MARKETPLACE_CURRENCY,
    exchangeRate: "1",
    unitsCovered: batchUnits === null || batchUnits === undefined ? "" : String(batchUnits),
    notes: "",
    ...(legacyDuplicate ? { legacyDuplicate: true } : {}),
    ...(legacyRemoved ? { legacyRemoved: true } : {}),
  };
}

export function resetCogsCostElement(costElement, batchUnits = "", templateSettings = DEFAULT_COGS_TEMPLATE) {
  const templateRow = findCogsTemplateRow(templateSettings, costElement?.templateRowId);
  const category = templateRow?.category;
  const row = templateRow?.row;
  return createBlankCogsCostElement({
    id: String(costElement?.id ?? ""),
    category: row?.legacyCategory || costElement?.category,
    batchUnits,
    templateCategoryId: category?.id || costElement?.templateCategoryId,
    templateRowId: row?.id || costElement?.templateRowId,
    categoryLabel: category?.label || costElement?.categoryLabel,
    rowLabel: row?.label || costElement?.rowLabel,
    defaultEntryBasis: "batch-total",
    requiresCustomName: row ? Boolean(row.requiresCustomName) : Boolean(costElement?.requiresCustomName),
  });
}

export function createPresetCogsCostElements({ batchUnits = "", idPrefix = "cogs_cost", templateSettings = DEFAULT_COGS_TEMPLATE } = {}) {
  const template = normalizeCogsTemplateSettings(templateSettings);
  return getCogsTemplateRows(template).map((row) => createBlankCogsCostElement({
    id: `${idPrefix}_${row.id}`,
    category: row.legacyCategory || row.id,
    batchUnits,
    templateCategoryId: row.categoryId,
    templateRowId: row.id,
    categoryLabel: row.categoryLabel,
    rowLabel: row.label,
    defaultEntryBasis: row.defaultEntryBasis,
    requiresCustomName: Boolean(row.requiresCustomName),
  }));
}

export function createBlankCogsBatchDraft({ id = "", effectiveDate = "", costElementId = "", templateSettings = DEFAULT_COGS_TEMPLATE } = {}) {
  const idPrefix = costElementId || `${id || "cogs_batch"}_cost`;
  return {
    id,
    name: "",
    effectiveDate,
    sellableUnits: "",
    marketplaceCurrency: COGS_MARKETPLACE_CURRENCY,
    costElements: createPresetCogsCostElements({ idPrefix, templateSettings }).map((costElement) => ({
      ...costElement,
      defaultEntryBasis: "batch-total",
      entryBasis: "batch-total",
    })),
    createdAt: "",
    updatedAt: "",
  };
}

export function isCogsCostElementActive(costElement, batchUnits = "") {
  const amountPaid = String(costElement?.amountPaid ?? "");
  if (amountPaid.trim() !== "") return true;
  if (String(costElement?.customName ?? "").trim()) return true;
  if (String(costElement?.provider ?? "").trim()) return true;
  if (String(costElement?.notes ?? "").trim()) return true;
  if (String(costElement?.paymentCurrency ?? COGS_MARKETPLACE_CURRENCY).trim().toUpperCase() !== COGS_MARKETPLACE_CURRENCY) return true;
  if (String(costElement?.exchangeRate ?? "1").trim() !== "1") return true;
  const defaultEntryBasis = COGS_ENTRY_BASIS_VALUES.has(costElement?.defaultEntryBasis)
    ? costElement.defaultEntryBasis
    : getCogsCostCategory(costElement?.category).defaultEntryBasis;
  if ((COGS_ENTRY_BASIS_VALUES.has(costElement?.entryBasis) ? costElement.entryBasis : "batch-total") !== defaultEntryBasis) return true;
  if (defaultEntryBasis === "batch-total") {
    return String(costElement?.unitsCovered ?? "").trim() !== String(batchUnits ?? "").trim();
  }
  return false;
}

export function getActiveCogsCostElements(costElements, batchUnits = "") {
  return (Array.isArray(costElements) ? costElements : []).filter((costElement) => (
    isCogsCostElementActive(costElement, batchUnits)
  ));
}

export function hydrateCogsBatchDraft(batch, { idPrefix = "cogs_cost", templateSettings = DEFAULT_COGS_TEMPLATE } = {}) {
  return reconcileCogsBatchDraftWithTemplate(batch, templateSettings, { idPrefix, preserveUnmatchedBlankRows: true });
}

export function reconcileCogsBatchDraftWithTemplate(
  batch,
  templateSettings = DEFAULT_COGS_TEMPLATE,
  { idPrefix = "cogs_cost", preserveUnmatchedBlankRows = false } = {},
) {
  const template = normalizeCogsTemplateSettings(templateSettings);
  const sellableUnits = String(batch?.sellableUnits ?? "");
  const presetRows = createPresetCogsCostElements({ batchUnits: sellableUnits, idPrefix, templateSettings: template }).map((costElement) => ({
    ...costElement,
    defaultEntryBasis: "batch-total",
    entryBasis: "batch-total",
  }));
  const presetIndexByRowId = new Map(presetRows.map((row, index) => [row.templateRowId, index]));
  const legacyRowByCategory = new Map(getCogsTemplateRows(template)
    .filter((row) => row.legacyCategory)
    .map((row) => [row.legacyCategory, row]));
  const usedTemplateRowIds = new Set();
  const legacyExtras = [];

  (Array.isArray(batch?.costElements) ? batch.costElements : []).forEach((costElement, index) => {
    const matchedById = findCogsTemplateRow(template, costElement?.templateRowId);
    const matchedLegacyRow = !matchedById ? legacyRowByCategory.get(String(costElement?.category ?? "").trim()) : null;
    const matchedRemovedBuiltInRow = !matchedById && !matchedLegacyRow
      ? findCogsTemplateRowByLegacyCategory(DEFAULT_COGS_TEMPLATE, costElement?.category)
      : null;
    const matchedRow = matchedById
      ? { ...matchedById.row, categoryId: matchedById.category.id, categoryLabel: matchedById.category.label }
      : matchedLegacyRow || matchedRemovedBuiltInRow;
    const matchedRowId = matchedRow?.id || "";
    const category = String(costElement?.category ?? matchedRow?.legacyCategory ?? "other").trim() || "other";
    const hydrated = {
      ...createBlankCogsCostElement({
        id: String(costElement?.id ?? "").trim() || `${idPrefix}_saved_${index + 1}`,
        category,
        batchUnits: sellableUnits,
        templateCategoryId: matchedRow?.categoryId || costElement?.templateCategoryId,
        templateRowId: matchedRowId || costElement?.templateRowId,
        categoryLabel: matchedRow?.categoryLabel || costElement?.categoryLabel,
        rowLabel: matchedRow?.label || costElement?.rowLabel || costElement?.customName,
        defaultEntryBasis: matchedRow?.defaultEntryBasis || costElement?.defaultEntryBasis || costElement?.entryBasis,
        requiresCustomName: matchedRow
          ? Boolean(matchedRow.requiresCustomName)
          : Boolean(costElement?.requiresCustomName || category === "other"),
      }),
      ...costElement,
      category,
      templateCategoryId: matchedRow?.categoryId || String(costElement?.templateCategoryId ?? "").trim(),
      templateRowId: matchedRowId || String(costElement?.templateRowId ?? "").trim(),
      categoryLabel: matchedRow?.categoryLabel || String(costElement?.categoryLabel ?? "Legacy Costs").trim() || "Legacy Costs",
      rowLabel: matchedRow?.label || String(costElement?.rowLabel ?? costElement?.customName ?? getCogsCostCategory(category).label).trim(),
      defaultEntryBasis: "batch-total",
      requiresCustomName: matchedRow
        ? Boolean(matchedRow.requiresCustomName)
        : Boolean(costElement?.requiresCustomName || category === "other"),
      amountPaid: String(costElement?.amountPaid ?? ""),
      exchangeRate: String(costElement?.exchangeRate ?? "1"),
      unitsCovered: String(costElement?.unitsCovered ?? sellableUnits),
    };
    if (matchedRowId && presetIndexByRowId.has(matchedRowId) && !usedTemplateRowIds.has(matchedRowId)) {
      presetRows[presetIndexByRowId.get(matchedRowId)] = hydrated;
      usedTemplateRowIds.add(matchedRowId);
      return;
    }
    if (!preserveUnmatchedBlankRows && !isCogsCostElementActive(hydrated, sellableUnits)) return;
    legacyExtras.push({
      ...hydrated,
      legacyDuplicate: Boolean(matchedRowId && presetIndexByRowId.has(matchedRowId)),
      legacyRemoved: !matchedRowId || !presetIndexByRowId.has(matchedRowId),
    });
  });

  return {
    ...batch,
    sellableUnits,
    marketplaceCurrency: COGS_MARKETPLACE_CURRENCY,
    costElements: presetRows.flatMap((presetRow) => [
      presetRow,
      ...legacyExtras.filter((legacyRow) => legacyRow.templateRowId === presetRow.templateRowId),
    ]).concat(legacyExtras.filter((legacyRow) => !legacyRow.templateRowId || !presetIndexByRowId.has(legacyRow.templateRowId))),
  };
}

export function calculateCogsCostPerUnit(costElement, batchUnits = 0) {
  const amountPaid = toFiniteNumber(costElement?.amountPaid);
  const exchangeRate = toFiniteNumber(costElement?.exchangeRate);
  if (amountPaid === null || amountPaid < 0 || exchangeRate === null || exchangeRate <= 0) return 0;

  const convertedAmount = amountPaid * exchangeRate;
  if (costElement?.entryBasis === "per-unit") return roundCalculation(convertedAmount);

  const totalOrderUnits = toFiniteNumber(batchUnits);
  if (totalOrderUnits === null || totalOrderUnits <= 0) return 0;
  return roundCalculation(convertedAmount / totalOrderUnits);
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
  const sellableUnits = toFiniteNumber(batch?.sellableUnits);
  const costElements = Array.isArray(batch?.costElements) ? batch.costElements : [];
  const activeCostElements = getActiveCogsCostElements(costElements, batch?.sellableUnits);

  if (sellableUnits === null || sellableUnits <= 0) errors.sellableUnits = "Total order units must be greater than zero.";
  if (activeCostElements.length === 0) errors.costElements = "Enter an amount for at least one landed-cost category.";

  costElements.forEach((costElement, index) => {
    if (!isCogsCostElementActive(costElement, batch?.sellableUnits)) return;
    const prefix = `costElements.${index}`;
    const amountPaid = toFiniteNumber(costElement?.amountPaid);
    const exchangeRate = toFiniteNumber(costElement?.exchangeRate);
    const paymentCurrency = String(costElement?.paymentCurrency ?? "").trim().toUpperCase();

    if (!String(costElement?.templateRowId ?? costElement?.rowLabel ?? costElement?.category ?? "").trim()) {
      errors[`${prefix}.category`] = "Choose a cost category.";
    }
    const hasNamedTemplateRow = Boolean(String(costElement?.templateRowId ?? "").trim());
    const requiresCustomName = !hasNamedTemplateRow && (
      Boolean(costElement?.requiresCustomName)
      || costElement?.category === "other"
    );
    if (requiresCustomName && !String(costElement?.customName ?? "").trim()) {
      errors[`${prefix}.customName`] = "Enter a name for the custom landed cost.";
    }
    if (amountPaid === null) errors[`${prefix}.amountPaid`] = "Enter the amount paid for this category.";
    else if (amountPaid < 0) errors[`${prefix}.amountPaid`] = "Amount paid must be zero or greater.";
    if (!/^[A-Z]{3}$/.test(paymentCurrency)) errors[`${prefix}.paymentCurrency`] = "Enter a three-letter currency code.";
    if (exchangeRate === null || exchangeRate <= 0) errors[`${prefix}.exchangeRate`] = "Exchange rate must be greater than zero.";
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function normalizeCogsCostElement(costElement, { fallbackId = "", batchUnits = 0 } = {}) {
  const category = String(costElement?.category ?? "").trim() || "other";
  const entryBasis = COGS_ENTRY_BASIS_VALUES.has(costElement?.entryBasis) ? costElement.entryBasis : "batch-total";
  const amountPaid = normalizeNonNegativeNumber(costElement?.amountPaid);
  const exchangeRate = normalizePositiveNumber(costElement?.exchangeRate, 1);
  const unitsCovered = normalizePositiveNumber(batchUnits, 1);
  const normalized = {
    id: String(costElement?.id ?? fallbackId).trim() || fallbackId,
    category,
    templateCategoryId: String(costElement?.templateCategoryId ?? "").trim(),
    templateRowId: String(costElement?.templateRowId ?? "").trim(),
    categoryLabel: String(costElement?.categoryLabel ?? "").trim(),
    rowLabel: String(costElement?.rowLabel ?? costElement?.customName ?? getCogsCostCategory(category).label).trim(),
    defaultEntryBasis: COGS_ENTRY_BASIS_VALUES.has(costElement?.defaultEntryBasis)
      ? costElement.defaultEntryBasis
      : entryBasis,
    requiresCustomName: Boolean(costElement?.requiresCustomName),
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
  const costElements = getActiveCogsCostElements(batch?.costElements, batch?.sellableUnits).map((costElement, index) => (
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
