export const COGS_TEMPLATE_SCHEMA_VERSION = 1;
export const COGS_TEMPLATE_ENTRY_BASES = Object.freeze(["batch-total", "per-unit"]);

const DEFAULT_TEMPLATE_SOURCE = Object.freeze([
  Object.freeze({
    id: "product-preparation",
    label: "Product and Preparation",
    rows: Object.freeze([
      Object.freeze({ id: "manufacturing", label: "Manufacturing or supplier product cost", defaultEntryBasis: "per-unit", legacyCategory: "manufacturing" }),
      Object.freeze({ id: "packaging", label: "Packaging materials", defaultEntryBasis: "per-unit", legacyCategory: "packaging" }),
      Object.freeze({ id: "printing-labels", label: "Printing, inserts, labels, and barcodes", defaultEntryBasis: "per-unit", legacyCategory: "printing-labels" }),
      Object.freeze({ id: "preparation", label: "Assembly, bundling, kitting, and product preparation", defaultEntryBasis: "per-unit", legacyCategory: "preparation" }),
      Object.freeze({ id: "inspection", label: "Inspection and quality control", defaultEntryBasis: "batch-total", legacyCategory: "inspection" }),
      Object.freeze({ id: "tooling", label: "Tooling, molds, samples, and design amortization", defaultEntryBasis: "batch-total", legacyCategory: "tooling" }),
    ]),
  }),
  Object.freeze({
    id: "international-import",
    label: "International Logistics and Import",
    rows: Object.freeze([
      Object.freeze({ id: "international-freight", label: "International freight", defaultEntryBasis: "batch-total", legacyCategory: "international-freight" }),
      Object.freeze({ id: "cargo-insurance", label: "Cargo insurance", defaultEntryBasis: "batch-total", legacyCategory: "cargo-insurance" }),
      Object.freeze({ id: "customs-duties", label: "Customs duties and tariffs", defaultEntryBasis: "batch-total", legacyCategory: "customs-duties" }),
      Object.freeze({ id: "customs-clearance", label: "Customs brokerage and clearance", defaultEntryBasis: "batch-total", legacyCategory: "customs-clearance" }),
    ]),
  }),
  Object.freeze({
    id: "domestic-amazon",
    label: "Domestic and Amazon Inbound",
    rows: Object.freeze([
      Object.freeze({ id: "domestic-freight", label: "Domestic freight", defaultEntryBasis: "batch-total", legacyCategory: "domestic-freight" }),
      Object.freeze({ id: "third-party-logistics", label: "3PL receiving, handling, and preparation", defaultEntryBasis: "batch-total", legacyCategory: "third-party-logistics" }),
    ]),
  }),
  Object.freeze({
    id: "amazon-costs",
    label: "Amazon Costs",
    rows: Object.freeze([
      Object.freeze({ id: "amazon-referral-fee", label: "Amazon referral fee", defaultEntryBasis: "per-unit", legacyCategory: "" }),
      Object.freeze({ id: "fba-fulfillment-fee", label: "FBA fulfillment fee", defaultEntryBasis: "per-unit", legacyCategory: "" }),
      Object.freeze({ id: "amazon-storage-fee", label: "Amazon storage fee", defaultEntryBasis: "batch-total", legacyCategory: "" }),
      Object.freeze({ id: "amazon-inbound", label: "Amazon inbound placement or service fees", defaultEntryBasis: "batch-total", legacyCategory: "amazon-inbound" }),
      Object.freeze({ id: "other-amazon-fee", label: "Other Amazon fee", defaultEntryBasis: "batch-total", legacyCategory: "" }),
    ]),
  }),
  Object.freeze({
    id: "other",
    label: "Other",
    rows: Object.freeze([
      Object.freeze({
        id: "other",
        label: "Other custom landed cost",
        defaultEntryBasis: "batch-total",
        legacyCategory: "other",
        requiresCustomName: true,
      }),
    ]),
  }),
]);

export function createDefaultCogsTemplateSettings({ updatedAt = "", updatedBy = "" } = {}) {
  return {
    version: COGS_TEMPLATE_SCHEMA_VERSION,
    categories: DEFAULT_TEMPLATE_SOURCE.map((category) => ({
      id: category.id,
      label: category.label,
      rows: category.rows.map((row) => ({ ...row })),
    })),
    updatedAt: normalizeTimestamp(updatedAt),
    updatedBy: String(updatedBy ?? "").trim(),
  };
}

export function normalizeCogsTemplateSettings(settings, fallbackMetadata = {}) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : null;
  if (!source || !Array.isArray(source.categories)) return createDefaultCogsTemplateSettings(fallbackMetadata);

  const categoryIds = new Set();
  const rowIds = new Set();
  const categories = [];

  source.categories.forEach((category, categoryIndex) => {
    if (!category || typeof category !== "object") return;
    const id = normalizeTemplateId(category.id, `cogs-category-${categoryIndex + 1}`);
    const label = String(category.label ?? "").trim();
    if (!id || !label || categoryIds.has(id)) return;
    categoryIds.add(id);

    const rows = [];
    (Array.isArray(category.rows) ? category.rows : []).forEach((row, rowIndex) => {
      if (!row || typeof row !== "object") return;
      const rowId = normalizeTemplateId(row.id, `${id}-row-${rowIndex + 1}`);
      const rowLabel = String(row.label ?? "").trim();
      if (!rowId || !rowLabel || rowIds.has(rowId)) return;
      rowIds.add(rowId);
      rows.push({
        id: rowId,
        label: rowLabel,
        defaultEntryBasis: normalizeEntryBasis(row.defaultEntryBasis),
        legacyCategory: String(row.legacyCategory ?? "").trim(),
        ...(row.requiresCustomName ? { requiresCustomName: true } : {}),
      });
    });

    categories.push({ id, label, rows });
  });

  if (categories.length === 0 || rowIds.size === 0) return createDefaultCogsTemplateSettings(fallbackMetadata);

  return {
    version: COGS_TEMPLATE_SCHEMA_VERSION,
    categories,
    updatedAt: normalizeTimestamp(source.updatedAt) || normalizeTimestamp(fallbackMetadata.updatedAt),
    updatedBy: String(source.updatedBy ?? fallbackMetadata.updatedBy ?? "").trim(),
  };
}

export function validateCogsTemplateSettings(settings) {
  const errors = {};
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const categories = Array.isArray(source.categories) ? source.categories : [];
  const categoryIds = new Set();
  const rowIds = new Set();
  let rowCount = 0;

  if (categories.length === 0) errors.categories = "Keep at least one COGS category.";

  categories.forEach((category, categoryIndex) => {
    const categoryPrefix = `categories.${categoryIndex}`;
    const categoryId = String(category?.id ?? "").trim();
    const categoryLabel = String(category?.label ?? "").trim();
    if (!categoryId || categoryIds.has(categoryId)) errors[`${categoryPrefix}.id`] = "Category IDs must be unique.";
    else categoryIds.add(categoryId);
    if (!categoryLabel) errors[`${categoryPrefix}.label`] = "Enter a category name.";

    (Array.isArray(category?.rows) ? category.rows : []).forEach((row, rowIndex) => {
      rowCount += 1;
      const rowPrefix = `${categoryPrefix}.rows.${rowIndex}`;
      const rowId = String(row?.id ?? "").trim();
      if (!rowId || rowIds.has(rowId)) errors[`${rowPrefix}.id`] = "Cost row IDs must be unique.";
      else rowIds.add(rowId);
      if (!String(row?.label ?? "").trim()) errors[`${rowPrefix}.label`] = "Enter a cost row name.";
      if (!COGS_TEMPLATE_ENTRY_BASES.includes(row?.defaultEntryBasis)) {
        errors[`${rowPrefix}.defaultEntryBasis`] = "Choose Batch Total or Per Unit.";
      }
    });
  });

  if (rowCount === 0) errors.rows = "Keep at least one COGS cost row.";
  return { isValid: Object.keys(errors).length === 0, errors };
}

export function createCogsTemplateId(prefix = "cogs-template") {
  const cleanPrefix = normalizeTemplateId(prefix, "cogs-template");
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function addCogsTemplateCategory(settings, { id = createCogsTemplateId("cogs-category"), label = "New Category" } = {}) {
  const next = cloneCogsTemplateSettings(settings);
  next.categories.push({ id: normalizeTemplateId(id, createCogsTemplateId("cogs-category")), label: String(label).trim() || "New Category", rows: [] });
  return next;
}

export function renameCogsTemplateCategory(settings, categoryId, label) {
  const next = cloneCogsTemplateSettings(settings);
  const category = next.categories.find((item) => item.id === categoryId);
  if (category) category.label = String(label ?? "");
  return next;
}

export function deleteCogsTemplateCategory(settings, categoryId) {
  const next = cloneCogsTemplateSettings(settings);
  if (next.categories.length <= 1) throw new Error("Keep at least one COGS category.");
  const category = next.categories.find((item) => item.id === categoryId);
  const totalRows = getCogsTemplateRows(next).length;
  if (category && totalRows - category.rows.length < 1) throw new Error("Keep at least one COGS cost row.");
  next.categories = next.categories.filter((item) => item.id !== categoryId);
  return next;
}

export function addCogsTemplateRow(settings, categoryId, {
  id = createCogsTemplateId("cogs-row"),
  label = "New cost row",
  defaultEntryBasis = "batch-total",
} = {}) {
  const next = cloneCogsTemplateSettings(settings);
  const category = next.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("Choose a COGS category.");
  category.rows.push({
    id: normalizeTemplateId(id, createCogsTemplateId("cogs-row")),
    label: String(label).trim() || "New cost row",
    defaultEntryBasis: normalizeEntryBasis(defaultEntryBasis),
    legacyCategory: "",
  });
  return next;
}

export function updateCogsTemplateRow(settings, rowId, updates = {}) {
  const next = cloneCogsTemplateSettings(settings);
  const match = findCogsTemplateRow(next, rowId);
  if (!match) return next;
  if (Object.prototype.hasOwnProperty.call(updates, "label")) match.row.label = String(updates.label ?? "");
  if (Object.prototype.hasOwnProperty.call(updates, "defaultEntryBasis")) {
    match.row.defaultEntryBasis = normalizeEntryBasis(updates.defaultEntryBasis);
  }
  return next;
}

export function deleteCogsTemplateRow(settings, rowId) {
  const next = cloneCogsTemplateSettings(settings);
  if (getCogsTemplateRows(next).length <= 1) throw new Error("Keep at least one COGS cost row.");
  next.categories.forEach((category) => {
    category.rows = category.rows.filter((row) => row.id !== rowId);
  });
  return next;
}

export function reorderCogsTemplateCategories(settings, draggedCategoryId, dropCategoryId) {
  const next = cloneCogsTemplateSettings(settings);
  next.categories = reorderById(next.categories, draggedCategoryId, dropCategoryId);
  return next;
}

export function reorderCogsTemplateRows(settings, categoryId, draggedRowId, dropRowId) {
  const next = cloneCogsTemplateSettings(settings);
  const category = next.categories.find((item) => item.id === categoryId);
  if (category) category.rows = reorderById(category.rows, draggedRowId, dropRowId);
  return next;
}

export function moveCogsTemplateRow(settings, rowId, targetCategoryId) {
  const next = cloneCogsTemplateSettings(settings);
  const source = findCogsTemplateRow(next, rowId);
  const target = next.categories.find((category) => category.id === targetCategoryId);
  if (!source || !target || source.category.id === target.id) return next;
  source.category.rows = source.category.rows.filter((row) => row.id !== rowId);
  target.rows.push(source.row);
  return next;
}

export function getCogsTemplateRows(settings) {
  const source = settings && typeof settings === "object" && Array.isArray(settings.categories)
    ? settings
    : normalizeCogsTemplateSettings(settings);
  return source.categories.flatMap((category) => (
    (Array.isArray(category?.rows) ? category.rows : []).map((row) => ({
      ...row,
      categoryId: String(category?.id ?? ""),
      categoryLabel: String(category?.label ?? ""),
    }))
  ));
}

export function findCogsTemplateRow(settings, rowId) {
  const categories = Array.isArray(settings?.categories) ? settings.categories : [];
  for (const category of categories) {
    const row = (Array.isArray(category?.rows) ? category.rows : []).find((item) => item.id === rowId);
    if (row) return { category, row };
  }
  return null;
}

export function findCogsTemplateRowByLegacyCategory(settings, legacyCategory) {
  const cleanLegacyCategory = String(legacyCategory ?? "").trim();
  if (!cleanLegacyCategory) return null;
  return getCogsTemplateRows(settings).find((row) => row.legacyCategory === cleanLegacyCategory) ?? null;
}

export function cloneCogsTemplateSettings(settings) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) && Array.isArray(settings.categories)
    ? settings
    : normalizeCogsTemplateSettings(settings);
  return {
    ...source,
    version: COGS_TEMPLATE_SCHEMA_VERSION,
    updatedAt: String(source.updatedAt ?? ""),
    updatedBy: String(source.updatedBy ?? ""),
    categories: source.categories.map((category) => ({
      ...category,
      id: String(category?.id ?? ""),
      label: String(category?.label ?? ""),
      rows: (Array.isArray(category?.rows) ? category.rows : []).map((row) => ({
        ...row,
        id: String(row?.id ?? ""),
        label: String(row?.label ?? ""),
        defaultEntryBasis: normalizeEntryBasis(row?.defaultEntryBasis),
        legacyCategory: String(row?.legacyCategory ?? ""),
      })),
    })),
  };
}

function reorderById(items, draggedId, dropId) {
  const next = Array.isArray(items) ? [...items] : [];
  const draggedIndex = next.findIndex((item) => item.id === draggedId);
  const dropIndex = next.findIndex((item) => item.id === dropId);
  if (draggedIndex < 0 || dropIndex < 0 || draggedIndex === dropIndex) return next;
  const [draggedItem] = next.splice(draggedIndex, 1);
  next.splice(dropIndex, 0, draggedItem);
  return next;
}

function normalizeTemplateId(value, fallback) {
  const id = String(value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || String(fallback ?? "").trim();
}

function normalizeEntryBasis(value) {
  return COGS_TEMPLATE_ENTRY_BASES.includes(value) ? value : "batch-total";
}

function normalizeTimestamp(value) {
  const timestamp = String(value ?? "").trim();
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : "";
}
