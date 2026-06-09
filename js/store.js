import {
  LAUNCHFLOW_STAGES,
  MAX_STAGE_INDEX,
  MIN_STAGE_INDEX,
  getStageById,
  isLaunchFlowStageId,
} from "./constants/stages.js";

const STORAGE_KEY = "launchflow.appState.v1";
const SCHEMA_VERSION = 1;
const DEFAULT_PRODUCT_ID = "product_demo_001";
const CUSTOM_FIELD_TYPES = Object.freeze(["TEXT", "NUMBER", "LINK", "CURRENCY", "WEIGHT", "SIZING", "DATE"]);
const CUSTOM_FIELD_TYPE_SET = new Set(CUSTOM_FIELD_TYPES);
const listeners = new Set();
let state = normalizeAppState(loadPersistedState() ?? createDefaultAppState());

export { CUSTOM_FIELD_TYPES, LAUNCHFLOW_STAGES };

export function getState() {
  return state;
}

export function subscribe(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveProduct(appState = state) {
  if (!Array.isArray(appState.products)) return null;
  return appState.products.find((product) => product.id === appState.activeProductId) ?? appState.products[0] ?? null;
}

export function getVisibleStages(product) {
  const activeStageIndex = clampStageIndex(product?.current_active_stage_index);
  return LAUNCHFLOW_STAGES.filter((stage) => stage.stage_index <= activeStageIndex);
}

export function getStageBlock(product, stageId) {
  if (!product || !isLaunchFlowStageId(stageId)) return null;
  return product.stage_blocks.find((stageBlock) => stageBlock.stage_id === stageId) ?? null;
}

export function advanceProductStage(productId = state.activeProductId) {
  return updateProduct(productId, (product) => {
    const currentIndex = clampStageIndex(product.current_active_stage_index);
    const nextIndex = Math.min(currentIndex + 1, MAX_STAGE_INDEX);
    return normalizeProduct({
      ...product,
      current_active_stage_index: nextIndex,
      meta: touchMeta(product.meta),
    });
  });
}

export function toggleStageExpanded(productId, stageId) {
  if (!isVisibleStageId(productId, stageId)) return state;

  return updateStageBlock(productId, stageId, (stageBlock) => ({
    ...stageBlock,
    is_expanded: !stageBlock.is_expanded,
    meta: touchMeta(stageBlock.meta),
  }));
}

export function addCustomField(productId, stageId, fieldConfig) {
  if (!isVisibleStageId(productId, stageId)) return state;

  const label = normalizeString(fieldConfig?.label ?? fieldConfig?.fieldLabelDraft);
  const type = normalizeCustomFieldType(fieldConfig?.type ?? fieldConfig?.fieldTypeDraft);
  if (!label || !type) return state;

  const now = createTimestamp();
  const field = {
    field_id: createId("field"),
    label,
    type,
    value: createInitialFieldValue(type),
    meta: createMeta(now),
  };

  return updateStageBlock(productId, stageId, (stageBlock) => ({
    ...stageBlock,
    custom_fields: [...stageBlock.custom_fields, field],
    meta: touchMeta(stageBlock.meta, now),
  }));
}

export function updateCustomFieldValue(productId, stageId, fieldId, value) {
  if (!isVisibleStageId(productId, stageId)) return state;

  return updateStageBlock(productId, stageId, (stageBlock) => ({
    ...stageBlock,
    custom_fields: stageBlock.custom_fields.map((field) => {
      if (field.field_id !== fieldId) return field;
      return {
        ...field,
        value: normalizeCustomFieldValue(field.type, value),
        meta: touchMeta(field.meta),
      };
    }),
    meta: touchMeta(stageBlock.meta),
  }));
}

export function addChecklistTask(productId, stageId, taskName) {
  if (!isVisibleStageId(productId, stageId)) return state;

  const trimmedTaskName = normalizeString(taskName);
  if (!trimmedTaskName) return state;

  const now = createTimestamp();
  const task = {
    task_id: createId("task"),
    task_name: trimmedTaskName,
    is_completed: false,
    meta: {
      ...createMeta(now),
      completedAt: null,
    },
  };

  return updateStageBlock(productId, stageId, (stageBlock) => ({
    ...stageBlock,
    checklist_tasks: [...stageBlock.checklist_tasks, task],
    meta: touchMeta(stageBlock.meta, now),
  }));
}

export function toggleChecklistTask(productId, stageId, taskId) {
  if (!isVisibleStageId(productId, stageId)) return state;

  const now = createTimestamp();
  return updateStageBlock(productId, stageId, (stageBlock) => ({
    ...stageBlock,
    checklist_tasks: stageBlock.checklist_tasks.map((task) => {
      if (task.task_id !== taskId) return task;
      const isCompleted = !task.is_completed;
      return {
        ...task,
        is_completed: isCompleted,
        meta: {
          ...task.meta,
          updatedAt: now,
          completedAt: isCompleted ? now : null,
        },
      };
    }),
    meta: touchMeta(stageBlock.meta, now),
  }));
}

export function calculateStageProgress(product, stageId) {
  const stageBlock = getStageBlock(product, stageId);
  const tasks = Array.isArray(stageBlock?.checklist_tasks) ? stageBlock.checklist_tasks : [];
  const total_tasks = tasks.length;
  const completed_tasks = tasks.filter((task) => task.is_completed).length;
  const completion_ratio = total_tasks === 0 ? 0 : completed_tasks / total_tasks;

  return {
    total_tasks,
    completed_tasks,
    completion_ratio,
    is_complete: total_tasks > 0 && completed_tasks === total_tasks,
  };
}

export function calculateOverallPipelineProgress(product) {
  if (!product) {
    return {
      visible_stage_count: 0,
      total_visible_tasks: 0,
      completed_visible_tasks: 0,
      visible_completion_ratio: 0,
      stage_index_ratio: 0,
    };
  }

  const visibleStages = getVisibleStages(product);
  const taskCounts = visibleStages.reduce(
    (counts, stage) => {
      const progress = calculateStageProgress(product, stage.stage_id);
      return {
        total_visible_tasks: counts.total_visible_tasks + progress.total_tasks,
        completed_visible_tasks: counts.completed_visible_tasks + progress.completed_tasks,
      };
    },
    { total_visible_tasks: 0, completed_visible_tasks: 0 },
  );

  return {
    visible_stage_count: visibleStages.length,
    ...taskCounts,
    visible_completion_ratio:
      taskCounts.total_visible_tasks === 0 ? 0 : taskCounts.completed_visible_tasks / taskCounts.total_visible_tasks,
    stage_index_ratio: clampStageIndex(product.current_active_stage_index) / MAX_STAGE_INDEX,
  };
}

export function createDefaultAppState() {
  const now = createTimestamp();
  return {
    schema_version: SCHEMA_VERSION,
    products: [createDemoProduct(now)],
    activeProductId: DEFAULT_PRODUCT_ID,
    ui: createDefaultUiState(),
    meta: createMeta(now),
  };
}

export function clampStageIndex(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return MIN_STAGE_INDEX;
  return Math.min(MAX_STAGE_INDEX, Math.max(MIN_STAGE_INDEX, Math.trunc(numericValue)));
}

function setState(nextState) {
  state = normalizeAppState(nextState);
  savePersistedState(state);
  notify();
  return state;
}

function updateProduct(productId, updater) {
  let productWasUpdated = false;
  const nextProducts = state.products.map((product) => {
    if (product.id !== productId) return product;
    productWasUpdated = true;
    return updater(product);
  });

  if (!productWasUpdated) return state;
  return setState({
    ...state,
    products: nextProducts,
    meta: touchMeta(state.meta),
  });
}

function updateStageBlock(productId, stageId, updater) {
  return updateProduct(productId, (product) => {
    const nextStageBlocks = product.stage_blocks.map((stageBlock) => {
      if (stageBlock.stage_id !== stageId) return stageBlock;
      return updater(stageBlock);
    });

    return normalizeProduct({
      ...product,
      stage_blocks: nextStageBlocks,
      meta: touchMeta(product.meta),
    });
  });
}

function isVisibleStageId(productId, stageId) {
  const product = state.products.find((item) => item.id === productId) ?? null;
  const stage = getStageById(stageId);
  if (!product || !stage) return false;
  return stage.stage_index <= clampStageIndex(product.current_active_stage_index);
}

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

function normalizeAppState(rawState) {
  const now = createTimestamp();
  const products = Array.isArray(rawState?.products) ? rawState.products.map(normalizeProduct) : [];
  const defaultState = createDefaultAppStateWithoutNormalization(now);
  const safeProducts = products.length > 0 ? products : defaultState.products;
  const activeProductId = safeProducts.some((product) => product.id === rawState?.activeProductId)
    ? rawState.activeProductId
    : safeProducts[0]?.id ?? null;

  return {
    schema_version: SCHEMA_VERSION,
    products: safeProducts,
    activeProductId,
    ui: normalizeUiState(rawState?.ui),
    meta: normalizeMeta(rawState?.meta, now),
  };
}

function normalizeProduct(rawProduct) {
  const now = createTimestamp();
  const productId = normalizeString(rawProduct?.id) || createId("product");
  const currentStageIndex = clampStageIndex(
    rawProduct?.current_active_stage_index ?? rawProduct?.current_stage_index,
  );

  return {
    id: productId,
    name: normalizeString(rawProduct?.name) || "Sample Amazon Product",
    asin: normalizeString(rawProduct?.asin),
    sku: normalizeString(rawProduct?.sku),
    current_active_stage_index: currentStageIndex,
    stage_blocks: normalizeStageBlocks(rawProduct?.stage_blocks),
    metrics: {
      conversionRate: Number.isFinite(rawProduct?.metrics?.conversionRate) ? rawProduct.metrics.conversionRate : null,
      activePpc: Boolean(rawProduct?.metrics?.activePpc),
    },
    meta: normalizeMeta(rawProduct?.meta, now),
  };
}

function normalizeStageBlocks(rawStageBlocks) {
  return LAUNCHFLOW_STAGES.map((stage) => {
    const rawStageBlock = Array.isArray(rawStageBlocks)
      ? rawStageBlocks.find((stageBlock) => stageBlock?.stage_id === stage.stage_id)
      : null;
    return normalizeStageBlock(rawStageBlock, stage);
  });
}

function normalizeStageBlock(rawStageBlock, stage) {
  const now = createTimestamp();
  return {
    stage_id: stage.stage_id,
    stage_index: stage.stage_index,
    is_expanded: typeof rawStageBlock?.is_expanded === "boolean" ? rawStageBlock.is_expanded : stage.stage_index === 1,
    custom_fields: Array.isArray(rawStageBlock?.custom_fields)
      ? rawStageBlock.custom_fields.map(normalizeCustomField).filter(Boolean)
      : [],
    checklist_tasks: Array.isArray(rawStageBlock?.checklist_tasks)
      ? rawStageBlock.checklist_tasks.map(normalizeChecklistTask).filter(Boolean)
      : [],
    meta: normalizeMeta(rawStageBlock?.meta, now),
  };
}

function normalizeCustomField(rawField) {
  const label = normalizeString(rawField?.label);
  const type = normalizeCustomFieldType(rawField?.type);
  if (!label || !type) return null;

  return {
    field_id: normalizeString(rawField?.field_id) || createId("field"),
    label,
    type,
    value: normalizeCustomFieldValue(type, rawField?.value),
    meta: normalizeMeta(rawField?.meta),
  };
}

function normalizeChecklistTask(rawTask) {
  const taskName = normalizeString(rawTask?.task_name);
  if (!taskName) return null;

  const isCompleted = Boolean(rawTask?.is_completed);
  return {
    task_id: normalizeString(rawTask?.task_id) || createId("task"),
    task_name: taskName,
    is_completed: isCompleted,
    meta: {
      ...normalizeMeta(rawTask?.meta),
      completedAt: isCompleted ? normalizeTimestamp(rawTask?.meta?.completedAt) : null,
    },
  };
}

function normalizeCustomFieldType(type) {
  return CUSTOM_FIELD_TYPE_SET.has(type) ? type : null;
}

function createInitialFieldValue(type) {
  switch (type) {
    case "NUMBER":
      return null;
    case "CURRENCY":
      return { amount: null, currency: "USD" };
    case "WEIGHT":
      return { amount: null, unit: "lb" };
    case "SIZING":
      return { length: null, width: null, height: null, unit: "in", raw: "" };
    case "TEXT":
    case "LINK":
    case "DATE":
    default:
      return "";
  }
}

function normalizeCustomFieldValue(type, value) {
  switch (type) {
    case "NUMBER":
      return normalizeNullableNumber(value);
    case "CURRENCY":
      return {
        amount: normalizeNullableNumber(value?.amount),
        currency: normalizeString(value?.currency).toUpperCase() || "USD",
      };
    case "WEIGHT":
      return {
        amount: normalizeNullableNumber(value?.amount),
        unit: ["g", "kg", "oz", "lb"].includes(value?.unit) ? value.unit : "lb",
      };
    case "SIZING":
      return {
        length: normalizeNullableNumber(value?.length),
        width: normalizeNullableNumber(value?.width),
        height: normalizeNullableNumber(value?.height),
        unit: ["cm", "in"].includes(value?.unit) ? value.unit : "in",
        raw: normalizeString(value?.raw),
      };
    case "TEXT":
    case "LINK":
    case "DATE":
    default:
      return normalizeString(value);
  }
}

function normalizeNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeUiState(rawUi) {
  const selectedStageId = isLaunchFlowStageId(rawUi?.selectedStageId) ? rawUi.selectedStageId : null;
  return {
    selectedStageId,
    searchQuery: normalizeString(rawUi?.searchQuery),
    customFieldConfig: null,
    notificationPanelOpen: Boolean(rawUi?.notificationPanelOpen),
    settingsPanelOpen: Boolean(rawUi?.settingsPanelOpen),
    userMenuOpen: Boolean(rawUi?.userMenuOpen),
  };
}

function createDemoProduct(now = createTimestamp()) {
  return normalizeProduct({
    id: DEFAULT_PRODUCT_ID,
    name: "Sample Amazon Product",
    asin: "",
    sku: "",
    current_active_stage_index: MIN_STAGE_INDEX,
    stage_blocks: createStageBlocks(now),
    metrics: {
      conversionRate: null,
      activePpc: false,
    },
    meta: createMeta(now),
  });
}

function createDefaultAppStateWithoutNormalization(now = createTimestamp()) {
  return {
    schema_version: SCHEMA_VERSION,
    products: [createDemoProduct(now)],
    activeProductId: DEFAULT_PRODUCT_ID,
    ui: createDefaultUiState(),
    meta: createMeta(now),
  };
}

function createDefaultUiState() {
  return {
    selectedStageId: null,
    searchQuery: "",
    customFieldConfig: null,
    notificationPanelOpen: false,
    settingsPanelOpen: false,
    userMenuOpen: false,
  };
}

function createStageBlocks(now = createTimestamp()) {
  return LAUNCHFLOW_STAGES.map((stage) => ({
    stage_id: stage.stage_id,
    stage_index: stage.stage_index,
    is_expanded: stage.stage_index === MIN_STAGE_INDEX,
    custom_fields: [],
    checklist_tasks: [],
    meta: createMeta(now),
  }));
}

function createMeta(now = createTimestamp()) {
  return {
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeMeta(rawMeta, fallbackTimestamp = createTimestamp()) {
  return {
    createdAt: normalizeTimestamp(rawMeta?.createdAt) ?? fallbackTimestamp,
    updatedAt: normalizeTimestamp(rawMeta?.updatedAt) ?? fallbackTimestamp,
  };
}

function touchMeta(rawMeta, now = createTimestamp()) {
  return {
    ...normalizeMeta(rawMeta, now),
    updatedAt: now,
  };
}

function normalizeTimestamp(value) {
  return typeof value === "string" && value ? value : null;
}

function createTimestamp() {
  return new Date().toISOString();
}

function createId(prefix) {
  const randomValue = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomValue}`;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadPersistedState() {
  if (typeof window === "undefined") return null;

  try {
    const storage = window.localStorage;
    if (!storage) return null;
    const rawState = storage.getItem(STORAGE_KEY);
    return rawState ? JSON.parse(rawState) : null;
  } catch (error) {
    console.warn("LaunchFlow state load failed.", error);
    return null;
  }
}

function savePersistedState(nextState) {
  if (typeof window === "undefined") return;

  try {
    const storage = window.localStorage;
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn("LaunchFlow state save failed.", error);
  }
}
