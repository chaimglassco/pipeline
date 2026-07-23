const NEW_PRODUCT_TABLE_TARGETS = Object.freeze({
  "product-research": Object.freeze({
    fieldIds: Object.freeze(["workspace_field_mqt9tnuh_f2ys09"]),
    labels: Object.freeze(["competitors quick details"]),
  }),
  "product-development": Object.freeze({
    fieldIds: Object.freeze([]),
    labels: Object.freeze(["competitors specs"]),
  }),
  "supplier-sourcing": Object.freeze({
    fieldIds: Object.freeze(["workspace_field_mqtd17hp_3qyh37"]),
    labels: Object.freeze([]),
  }),
});

export const NEW_PRODUCT_BLANK_TABLE_STAGE_IDS = Object.freeze(Object.keys(NEW_PRODUCT_TABLE_TARGETS));

function normalizeIdentity(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeIdentityList(values) {
  return Array.isArray(values) ? values.map(normalizeIdentity).filter(Boolean) : [];
}

export function isNewProductBlankTableTarget(stageId, field) {
  const cleanStageId = normalizeIdentity(stageId);
  const target = NEW_PRODUCT_TABLE_TARGETS[cleanStageId];
  if (!target || !field || typeof field !== "object") return false;
  if (!["CUSTOM_TABLE", "HALF_TABLE"].includes(String(field.type ?? ""))) return false;

  const fieldId = String(field.fieldId ?? "").trim();
  if (fieldId && target.fieldIds.includes(fieldId)) return true;

  const label = normalizeIdentity(field.label);
  if (label && target.labels.includes(label)) return true;

  if (cleanStageId !== "supplier-sourcing") return false;
  const cornerHeader = normalizeIdentity(field.tableCornerHeader);
  const columns = new Set(normalizeIdentityList(field.tableColumns));
  return cornerHeader === "supplier name"
    && columns.has("alibaba company link")
    && columns.has("moq");
}

export function blankNewProductTargetTable(stageId, field, rowCount, columnCount) {
  if (!isNewProductBlankTableTarget(stageId, field)) return false;
  const safeRowCount = Number.isInteger(rowCount) && rowCount >= 0 ? rowCount : 0;
  const safeColumnCount = Number.isInteger(columnCount) && columnCount >= 0 ? columnCount : 0;
  field.tableRowLabels = Array.from({ length: safeRowCount }, () => "");
  field.tableRowLabelsInitialized = true;
  field.tableRowLabelsIntentionallyBlank = true;
  field.value = Array.from({ length: safeRowCount }, () => Array.from({ length: safeColumnCount }, () => ""));
  return true;
}

export function shouldRestoreDefaultTableRowLabels({
  defaultLabels,
  savedLabels,
  tableRowLabelsIntentionallyBlank,
  hasCellData,
}) {
  return Array.isArray(defaultLabels)
    && defaultLabels.length > 0
    && !(Array.isArray(savedLabels) && savedLabels.some((label) => String(label ?? "").trim()))
    && !Boolean(tableRowLabelsIntentionallyBlank)
    && !Boolean(hasCellData);
}

function tableHasCellData(value) {
  return Array.isArray(value) && value.some((row) => Array.isArray(row)
    && row.some((cell) => String(cell ?? "").trim()));
}

function getNormalizedRowLabels(values) {
  return Array.isArray(values) ? values.map((value) => String(value ?? "").trim()) : [];
}

function rowLabelsMatchTemplateDefaults(field) {
  const labels = getNormalizedRowLabels(field?.tableRowLabels);
  const defaults = getNormalizedRowLabels(field?.tableRows);
  return defaults.length > 0
    && labels.length === defaults.length
    && labels.every((label, index) => label === defaults[index]);
}

function cloneWorkspaceDetails(details) {
  if (!details || typeof details !== "object") return {};
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(details);
  return JSON.parse(JSON.stringify(details));
}

export function repairLegacyTargetTableDefaults(details) {
  const workspaceDetails = cloneWorkspaceDetails(details);
  const changes = [];
  const products = workspaceDetails?.products;
  if (!products || typeof products !== "object" || Array.isArray(products)) {
    return { workspaceDetails, changes };
  }

  for (const [productId, productDetails] of Object.entries(products)) {
    const stages = productDetails?.stages;
    if (!stages || typeof stages !== "object" || Array.isArray(stages)) continue;
    for (const stageId of NEW_PRODUCT_BLANK_TABLE_STAGE_IDS) {
      const fields = stages?.[stageId]?.customFields;
      if (!Array.isArray(fields)) continue;
      for (const field of fields) {
        if (!isNewProductBlankTableTarget(stageId, field)) continue;
        if (field.tableRowLabelsIntentionallyBlank) continue;
        if (tableHasCellData(field.value) || !rowLabelsMatchTemplateDefaults(field)) continue;
        field.tableRowLabels = getNormalizedRowLabels(field.tableRows).map(() => "");
        field.tableRowLabelsInitialized = true;
        field.tableRowLabelsIntentionallyBlank = true;
        changes.push({
          productId: String(productId),
          stageId,
          fieldId: String(field.fieldId ?? ""),
        });
      }
    }
  }

  return { workspaceDetails, changes };
}

export function applyProductTableRowLabels(stageId, field, labels) {
  if (!field || typeof field !== "object") return false;
  field.tableRowLabels = getNormalizedRowLabels(labels);
  field.tableRowLabelsInitialized = true;
  if (isNewProductBlankTableTarget(stageId, field)) {
    field.tableRowLabelsIntentionallyBlank = field.tableRowLabels.every((label) => !label);
  }
  return true;
}

export function getProductScopedVineEntries(settings, mapKey, legacyKey, productId) {
  const cleanProductId = String(productId ?? "").trim();
  const legacyEntries = Array.isArray(settings?.[legacyKey]) ? settings[legacyKey] : [];
  if (!cleanProductId) return legacyEntries;
  const entriesByProductId = settings?.[mapKey];
  if (!entriesByProductId || typeof entriesByProductId !== "object" || Array.isArray(entriesByProductId)) {
    return legacyEntries;
  }
  return Object.prototype.hasOwnProperty.call(entriesByProductId, cleanProductId)
    ? Array.isArray(entriesByProductId[cleanProductId]) ? entriesByProductId[cleanProductId] : []
    : legacyEntries;
}

export function setProductScopedVineEntries(settings, mapKey, productId, entries) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return settings;
  const currentMap = settings?.[mapKey] && typeof settings[mapKey] === "object" && !Array.isArray(settings[mapKey])
    ? settings[mapKey]
    : {};
  return {
    ...settings,
    [mapKey]: {
      ...currentMap,
      [cleanProductId]: Array.isArray(entries) ? entries : [],
    },
  };
}

export function initializeNewProductVineCollections(settings, productId) {
  return setProductScopedVineEntries(
    setProductScopedVineEntries(settings, "reviewsByProductId", productId, []),
    "feedbackByProductId",
    productId,
    [],
  );
}

export function collectUniqueVineEntries(settings, mapKey, legacyKey) {
  const entries = new Map();
  const addEntries = (values) => {
    if (!Array.isArray(values)) return;
    values.forEach((entry, index) => {
      const key = String(entry?.id ?? "").trim() || `anonymous-${entries.size}-${index}`;
      entries.set(key, entry);
    });
  };
  addEntries(settings?.[legacyKey]);
  const entriesByProductId = settings?.[mapKey];
  if (entriesByProductId && typeof entriesByProductId === "object" && !Array.isArray(entriesByProductId)) {
    Object.values(entriesByProductId).forEach(addEntries);
  }
  return [...entries.values()];
}
