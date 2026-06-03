# LaunchFlow Data Contract

## 0. Document Purpose

This `data-contract.md` file defines the canonical data structures, allowed values, schema rules, normalization rules, mutation contracts, persistence expectations, and derived-data formulas for **LaunchFlow**, the Amazon Product Launch Pipeline Web App.

This document is written for the AI coding agent working in Codex. Treat this file as the strict data source of truth when creating or modifying:

- `/js/store.js`
- `/js/app.js`
- `/js/components/*.js`
- LocalStorage persistence
- Future API payloads
- Future database records
- Stage rendering logic
- Custom field logic
- Checklist logic
- Progress calculations

The UI must remain a direct reflection of this data contract.

---

## 1. Core Data Principles

LaunchFlow data must be:

- Plain JavaScript objects
- JSON-serializable
- Safe for LocalStorage
- Safe for future database persistence
- Safe for future serverless API payloads
- Deterministic when rendered
- Immutable during state updates
- Defensive against missing or malformed loaded data

Never store these inside app state:

- DOM nodes
- Functions
- Class instances
- Circular references
- Raw `Date` objects
- Browser event objects
- Promises
- Framework-specific component instances

Use strings, numbers, booleans, arrays, objects, and null values only.

---

## 2. Naming Standard

### Canonical Stage Index Field

The canonical product field is:

```js
current_active_stage_index
```

This field controls progressive stage disclosure.

Allowed values:

```txt
1 through 14
```

### Compatibility Alias

Some planning documents may reference:

```js
current_stage_index
```

This is a compatibility alias only.

When loading data, normalize this alias into `current_active_stage_index`.

Do not store both fields in final normalized state.

Correct normalization behavior:

```js
const currentStageIndex = clampStageIndex(
  product.current_active_stage_index ?? product.current_stage_index ?? 1
);
```

After normalization, only this should remain:

```js
product.current_active_stage_index
```

---

## 3. Global App State Contract

The root state object must track all products and the active selected product.

### Canonical Shape

```js
const appState = {
  schema_version: 1,
  products: [],
  activeProductId: null,
  ui: {
    selectedStageId: null,
    searchQuery: "",
    customFieldConfig: null,
    notificationPanelOpen: false,
    settingsPanelOpen: false,
    userMenuOpen: false
  },
  meta: {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  }
};
```

### Field Definitions

| Field | Type | Required | Description |
|---|---:|---:|---|
| `schema_version` | number | Yes | Integer schema version used for future migrations. |
| `products` | Product[] | Yes | Array of product launch records. |
| `activeProductId` | string \| null | Yes | ID of the product currently shown in the workspace. |
| `ui` | object | Yes | Temporary interface-only state. Must not contain business records. |
| `meta` | object | Yes | Root-level metadata for persistence and sync. |

### Root State Rules

- `products` must always be an array.
- `activeProductId` may be null if no product exists or no product is selected.
- `activeProductId` must point to a product ID when a product is active.
- UI state must not duplicate business data.
- Business state must not depend on temporary UI state.
- Search state must never reveal hidden future-stage data.
- All timestamps must be strings.

---

## 4. Product Entity Contract

Each product is a tracked Amazon product launch.

### Canonical Shape

```js
const product = {
  id: "product_001",
  name: "Sample Amazon Product",
  asin: "",
  sku: "",
  current_active_stage_index: 1,
  stage_blocks: [],
  metrics: {
    conversionRate: null,
    activePpc: false
  },
  meta: {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  }
};
```

### Field Definitions

| Field | Type | Required | Description |
|---|---:|---:|---|
| `id` | string | Yes | Stable unique product ID. |
| `name` | string | Yes | Human-readable product launch name. |
| `asin` | string | No | Amazon ASIN when available. Empty string allowed. |
| `sku` | string | No | Internal SKU when available. Empty string allowed. |
| `current_active_stage_index` | number | Yes | Current visible maximum stage index, clamped 1 to 14. |
| `stage_blocks` | StageBlock[] | Yes | Array of exactly 14 stage blocks, one per canonical stage. |
| `metrics` | object | Yes | Optional KPI support fields. |
| `meta` | object | Yes | Product timestamps and sync metadata. |

### Product Rules

- Product IDs must be stable.
- Product IDs must not be generated from product names.
- Product names may change without breaking data references.
- `current_active_stage_index` must be an integer from 1 through 14.
- `stage_blocks` must contain exactly 14 records after normalization.
- Each canonical stage must have one corresponding stage block.
- Product records must remain JSON-serializable.
- Future database persistence must be able to store this object without transformation.

---

## 5. Canonical Stage Registry

LaunchFlow has exactly 14 chronological stages.

This registry is static configuration, not mutable product data.

### Canonical Stage Array

```js
const LAUNCHFLOW_STAGES = [
  { stage_id: "product-research", stage_index: 1, label: "Product Research", phase: "pipeline" },
  { stage_id: "product-development", stage_index: 2, label: "Product Development", phase: "pipeline" },
  { stage_id: "supplier-sourcing", stage_index: 3, label: "Supplier Sourcing", phase: "pipeline" },
  { stage_id: "under-final-order", stage_index: 4, label: "Under Final Order", phase: "pipeline" },
  { stage_id: "shipping", stage_index: 5, label: "Shipping", phase: "pipeline" },
  { stage_id: "keyword-research", stage_index: 6, label: "Keyword Research", phase: "pipeline" },
  { stage_id: "listing-creation", stage_index: 7, label: "Listing Creation", phase: "pipeline" },
  { stage_id: "image-planning", stage_index: 8, label: "Image Planning", phase: "pipeline" },
  { stage_id: "campaign-prep", stage_index: 9, label: "Campaign Prep", phase: "pipeline" },
  { stage_id: "amazon-inbound", stage_index: 10, label: "Amazon Inbound", phase: "pipeline" },
  { stage_id: "enrolled-to-vines", stage_index: 11, label: "Enrolled to Vines", phase: "pipeline" },
  { stage_id: "launch", stage_index: 12, label: "Launch", phase: "pipeline" },
  { stage_id: "stable", stage_index: 13, label: "Stable", phase: "optimization" },
  { stage_id: "scaling", stage_index: 14, label: "Scaling", phase: "optimization" }
];
```

### Stage Registry Rules

- Do not reorder this array.
- Do not sort this array alphabetically.
- Do not generate stage IDs from labels at runtime.
- Do not mutate the registry from UI interactions.
- Do not persist duplicate copies of the full stage registry inside every product.
- Product-level `stage_blocks` should reference `stage_id` and `stage_index` only.
- Display labels should come from this registry whenever possible.

---

## 6. Stage Block Entity Contract

Each product must contain one stage block per canonical stage.

Stage blocks store the dynamic user-created data for a specific product and stage.

### Canonical Shape

```js
const stageBlock = {
  stage_id: "product-research",
  stage_index: 1,
  is_expanded: true,
  custom_fields: [],
  checklist_tasks: [],
  meta: {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  }
};
```

### Field Definitions

| Field | Type | Required | Description |
|---|---:|---:|---|
| `stage_id` | string | Yes | Must match one canonical stage ID. |
| `stage_index` | number | Yes | Must match the canonical stage index. |
| `is_expanded` | boolean | Yes | Accordion open/closed state for this stage. |
| `custom_fields` | CustomField[] | Yes | User-created custom fields for this product stage. |
| `checklist_tasks` | ChecklistTask[] | Yes | User-created checklist tasks for this product stage. |
| `meta` | object | Yes | Stage-block timestamps and sync metadata. |

### Stage Block Rules

- `stage_blocks` may contain all 14 blocks for persistence compatibility.
- Rendering must still show only blocks where `stage_index <= current_active_stage_index`.
- Hidden stage blocks may exist in data but must not render in the DOM.
- `custom_fields` must always be an array.
- `checklist_tasks` must always be an array.
- `is_expanded` controls accordion state only.
- `is_expanded` must never override progressive disclosure.
- Hidden stages must not be shown even when `is_expanded` is true.

---

## 7. Custom Field Entity Contract

Custom fields are user-created metadata fields inside a visible stage block.

No metadata fields are hardcoded in the UI.

### Canonical Shape

```js
const customField = {
  field_id: "field_001",
  label: "Supplier Quote Link",
  type: "LINK",
  value: "",
  meta: {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  }
};
```

### Field Definitions

| Field | Type | Required | Description |
|---|---:|---:|---|
| `field_id` | string | Yes | Stable unique custom field ID. |
| `label` | string | Yes | User-facing field label. |
| `type` | CustomFieldType | Yes | Strict field type enum. |
| `value` | unknown | Yes | Field value. Shape depends on `type`. |
| `meta` | object | Yes | Field timestamps and sync metadata. |

### Custom Field Rules

- Fields are created only by user action.
- No default metadata fields may render inside stage dropdowns.
- `field_id` must be stable and unique at least within a product.
- `label` must not be used as the stable ID.
- `label` may be edited later if edit behavior is implemented.
- `type` must not change after creation unless explicit conversion logic is implemented.
- `value` must follow the selected field type.
- Fields must be stored only inside the owning stage block's `custom_fields` array.
- Hidden stages cannot receive new fields through the UI.

---

## 8. Custom Field Type Enum

Allowed field types are strict.

```js
const CUSTOM_FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "LINK",
  "CURRENCY",
  "WEIGHT",
  "SIZING",
  "DATE"
];
```

### Enum Rules

- Do not add new field types without updating this contract.
- Do not store lowercase field type values.
- Do not store display labels instead of enum values.
- Validate every loaded field type.
- Unknown field types must normalize to `TEXT` or be excluded with a recoverable warning.

---

## 9. Custom Field Value Contracts

Each custom field type has a required value shape.

### TEXT

Use for plain alphanumeric text.

```js
{
  field_id: "field_text_001",
  label: "Factory Notes",
  type: "TEXT",
  value: "Waiting for updated material sample."
}
```

Value type:

```txt
string
```

Default:

```js
""
```

Rules:

- Store plain text as a string.
- Empty string is allowed.
- Do not store HTML.

### NUMBER

Use for integer or decimal values.

```js
{
  field_id: "field_number_001",
  label: "MOQ",
  type: "NUMBER",
  value: null
}
```

Value type:

```txt
number | null
```

Default:

```js
null
```

Rules:

- Store valid numeric values as numbers.
- Store empty input as null.
- Do not store formatted strings such as `"1,000"`.

### LINK

Use for clickable URLs.

```js
{
  field_id: "field_link_001",
  label: "Supplier Quote Link",
  type: "LINK",
  value: "https://example.com/quote"
}
```

Value type:

```txt
string
```

Default:

```js
""
```

Rules:

- Store URL as a string.
- Validate before rendering as an anchor.
- Invalid URLs must not crash the UI.
- Render valid saved links with `target="_blank"` and `rel="noopener noreferrer"`.

### CURRENCY

Use for financial values.

```js
{
  field_id: "field_currency_001",
  label: "Unit Cost",
  type: "CURRENCY",
  value: {
    amount: null,
    currency: "USD"
  }
}
```

Value type:

```js
{
  amount: number | null,
  currency: string
}
```

Default:

```js
{
  amount: null,
  currency: "USD"
}
```

Rules:

- Store numeric amount separately from display formatting.
- Store currency code as uppercase ISO-like string.
- Do not store values as strings like `"$12.50"`.
- Empty amount is null.

### WEIGHT

Use for mass values.

```js
{
  field_id: "field_weight_001",
  label: "Product Weight",
  type: "WEIGHT",
  value: {
    amount: null,
    unit: "lb"
  }
}
```

Value type:

```js
{
  amount: number | null,
  unit: "g" | "kg" | "oz" | "lb"
}
```

Default:

```js
{
  amount: null,
  unit: "lb"
}
```

Allowed units:

```txt
g, kg, oz, lb
```

Rules:

- Amount must be number or null.
- Unit must be one of the allowed unit strings.
- Do not store combined strings such as `"2 lb"` as the canonical value.

### SIZING

Use for product or package dimensions.

```js
{
  field_id: "field_sizing_001",
  label: "Package Size",
  type: "SIZING",
  value: {
    length: null,
    width: null,
    height: null,
    unit: "in",
    raw: ""
  }
}
```

Value type:

```js
{
  length: number | null,
  width: number | null,
  height: number | null,
  unit: "cm" | "in",
  raw: string
}
```

Default:

```js
{
  length: null,
  width: null,
  height: null,
  unit: "in",
  raw: ""
}
```

Allowed units:

```txt
cm, in
```

Rules:

- Structured dimensions are preferred.
- `raw` may store flexible sizing notes.
- Partial values are allowed.
- Invalid numeric values normalize to null.

### DATE

Use for native date-picker values.

```js
{
  field_id: "field_date_001",
  label: "Sample Arrival Date",
  type: "DATE",
  value: "2026-06-02"
}
```

Value type:

```txt
string
```

Default:

```js
""
```

Rules:

- Prefer `YYYY-MM-DD` format.
- Empty string is allowed.
- Invalid dates must not crash the UI.
- Render with native `input type="date"` where possible.

---

## 10. Checklist Task Entity Contract

Checklist tasks are user-created action items inside a visible stage block.

### Canonical Shape

```js
const checklistTask = {
  task_id: "task_001",
  task_name: "Request supplier quote",
  is_completed: false,
  meta: {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    completedAt: null
  }
};
```

### Field Definitions

| Field | Type | Required | Description |
|---|---:|---:|---|
| `task_id` | string | Yes | Stable unique task ID. |
| `task_name` | string | Yes | User-entered task title. |
| `is_completed` | boolean | Yes | Completion state. |
| `meta` | object | Yes | Task timestamps and completion timestamp. |

### Checklist Task Rules

- Tasks are created only by user action.
- No default checklist tasks may render inside stage dropdowns.
- `task_id` must be stable and unique at least within a product.
- `task_name` must be trimmed before save.
- Empty task names are rejected.
- Duplicate task names are allowed unless a future rule changes this.
- Tasks must be stored only inside the owning stage block's `checklist_tasks` array.
- Hidden stages cannot receive new tasks through the UI.
- Toggling a task must update the parent stage progress instantly.

---

## 11. UI State Contract

The `ui` object stores temporary interface state only.

### Canonical Shape

```js
const uiState = {
  selectedStageId: null,
  searchQuery: "",
  customFieldConfig: null,
  notificationPanelOpen: false,
  settingsPanelOpen: false,
  userMenuOpen: false
};
```

### Custom Field Config Shape

When a user starts adding a custom field, use a temporary config object.

```js
const customFieldConfig = {
  stage_id: "supplier-sourcing",
  fieldLabelDraft: "",
  fieldTypeDraft: "TEXT",
  error: null
};
```

### UI State Rules

- UI state may be reset without losing product business data.
- UI state must not store duplicate custom field records.
- UI state must not store duplicate checklist task records.
- UI state must not reveal hidden stages.
- If the active product changes, clear temporary field config state.
- If the selected stage becomes invalid, reset `selectedStageId` to the current active stage or null.

---

## 12. Progressive Disclosure Contract

Progressive disclosure is the defining LaunchFlow behavior.

### Visibility Formula

```js
const visibleStages = LAUNCHFLOW_STAGES.filter(stage => {
  return stage.stage_index <= activeProduct.current_active_stage_index;
});
```

### Rendering Rule

When rendering, future stages must be omitted from the DOM entirely.

Correct:

```js
for (const stage of LAUNCHFLOW_STAGES) {
  if (stage.stage_index > activeProduct.current_active_stage_index) {
    break;
  }

  renderStageCard(stage);
}
```

Also correct:

```js
LAUNCHFLOW_STAGES
  .filter(stage => stage.stage_index <= activeProduct.current_active_stage_index)
  .map(renderStageCard);
```

Incorrect:

```js
LAUNCHFLOW_STAGES.map(stage => `
  <section style="display: ${stage.stage_index > currentIndex ? "none" : "block"}">
    ...
  </section>
`);
```

### Hidden Stage Restrictions

Stages with `stage_index > current_active_stage_index` must not appear in:

- Main workspace DOM
- Sidebar DOM
- Dropdown menus
- Search results
- Offscreen containers
- Disabled cards
- Locked preview cards
- Breadcrumbs
- Keyboard navigation
- Screen-reader accessibility tree

### Data vs DOM Distinction

Allowed:

- A product may have all 14 `stage_blocks` in data.

Required:

- The DOM renders only visible stages.

This is intentional. Data can be complete while the UI stays minimal.

---

## 13. Mutation Contracts

All state mutations must be performed through store functions in `/js/store.js`.

Do not mutate state directly from component render functions.

### Required Store Functions

The store should expose functions equivalent to:

```js
getState()
setState(nextState)
subscribe(listener)
initializeState()
normalizeAppState(rawState)
createProduct(productInput)
setActiveProduct(productId)
advanceActiveProductStage()
toggleStageExpanded(stageId)
addCustomField(stageId, label, type)
updateCustomFieldValue(stageId, fieldId, nextValue)
deleteCustomField(stageId, fieldId)
addChecklistTask(stageId, taskName)
toggleChecklistTask(stageId, taskId)
deleteChecklistTask(stageId, taskId)
calculateStageProgress(product, stageId)
calculateOverallPipelineProgress(product)
getVisibleStages(product)
```

### Mutation Rules

- Validate all inputs before writing state.
- Use immutable updates.
- Never push directly into existing arrays.
- Never mutate nested objects in place.
- Update relevant `updatedAt` timestamps.
- Persist after successful state update.
- Re-render subscribed views after state changes.
- Fail safely if active product is missing.

---

## 14. Product Creation Contract

Creating a product must initialize a complete, valid product record.

### Input Shape

```js
const productInput = {
  name: "New Product Launch",
  asin: "",
  sku: ""
};
```

### Output Shape

```js
const newProduct = {
  id: "product_generated_id",
  name: "New Product Launch",
  asin: "",
  sku: "",
  current_active_stage_index: 1,
  stage_blocks: createInitialStageBlocks(),
  metrics: {
    conversionRate: null,
    activePpc: false
  },
  meta: {
    createdAt: nowIsoString,
    updatedAt: nowIsoString
  }
};
```

### Creation Rules

- Product starts at stage 1.
- Product must contain all 14 stage blocks after creation.
- Only stage 1 renders after creation.
- First stage may default to expanded.
- Future stages must not render.

---

## 15. Stage Advancement Contract

Advancing a product stage updates `current_active_stage_index` by exactly one.

### Function Contract

```js
advanceActiveProductStage()
```

### Required Behavior

1. Find active product by `activeProductId`.
2. Read `current_active_stage_index`.
3. If index is 14, do nothing and return safe result.
4. Increment index by exactly 1.
5. Clamp result to maximum 14.
6. Optionally expand the newly visible stage.
7. Update product `meta.updatedAt`.
8. Persist state.
9. Notify subscribers.

### Immutable Update Pattern

```js
const nextProducts = state.products.map(product => {
  if (product.id !== state.activeProductId) return product;

  const nextIndex = Math.min(product.current_active_stage_index + 1, 14);

  return {
    ...product,
    current_active_stage_index: nextIndex,
    stage_blocks: product.stage_blocks.map(block => ({
      ...block,
      is_expanded: block.stage_index === nextIndex ? true : block.is_expanded
    })),
    meta: {
      ...product.meta,
      updatedAt: getNowIso()
    }
  };
});
```

### Advancement Rules

- Never skip stages.
- Never reveal more than one new stage from the standard advance action.
- Never advance past stage 14.
- Never reveal future stages without changing `current_active_stage_index`.
- Never decrement stages unless a future rollback feature is defined.

---

## 16. Add Custom Field Contract

Adding a field appends a field object to one visible stage block.

### Function Contract

```js
addCustomField(stageId, label, type)
```

### Required Validation

- Active product must exist.
- Stage ID must exist.
- Stage must be visible.
- Label must be a non-empty trimmed string.
- Type must be one of the allowed custom field types.

### Required Behavior

1. Trim label.
2. Validate field type.
3. Locate active product.
4. Locate target stage block.
5. Confirm target stage is visible.
6. Create field object.
7. Append field to `custom_fields`.
8. Update timestamps.
9. Persist state.
10. Notify subscribers.

### Field Creation Shape

```js
const newField = {
  field_id: createId("field"),
  label: trimmedLabel,
  type,
  value: getDefaultValueForFieldType(type),
  meta: {
    createdAt: nowIso,
    updatedAt: nowIso
  }
};
```

### Dynamic Field Mutation Rule

Adding a field must push a new blank field object with the selected type's default value into the active stage block's `custom_fields` array through an immutable update.

The active DOM block must re-render immediately and show the correct input component for that field type.

---

## 17. Update Custom Field Value Contract

Updating a field changes only that field's `value`.

### Function Contract

```js
updateCustomFieldValue(stageId, fieldId, nextValue)
```

### Required Validation

- Active product must exist.
- Stage must be visible.
- Field must exist inside the stage block.
- Next value must normalize according to field type.

### Required Behavior

1. Locate field.
2. Normalize value by field type.
3. Update field value.
4. Update field `meta.updatedAt`.
5. Update parent stage block `meta.updatedAt`.
6. Update product `meta.updatedAt`.
7. Persist state.
8. Notify subscribers.

### Rules

- Do not change field ID.
- Do not change field type.
- Do not move field to another stage.
- Do not mutate checklist tasks.
- Do not recalculate checklist progress unless task data changed.

---

## 18. Add Checklist Task Contract

Adding a task appends a task object to one visible stage block.

### Function Contract

```js
addChecklistTask(stageId, taskName)
```

### Required Validation

- Active product must exist.
- Stage ID must exist.
- Stage must be visible.
- Task name must be a non-empty trimmed string.

### Required Behavior

1. Trim task name.
2. Locate active product.
3. Locate target stage block.
4. Confirm target stage is visible.
5. Create task object.
6. Append task to `checklist_tasks`.
7. Update timestamps.
8. Recalculate stage progress in derived data.
9. Persist state.
10. Notify subscribers.

### Task Creation Shape

```js
const newTask = {
  task_id: createId("task"),
  task_name: trimmedTaskName,
  is_completed: false,
  meta: {
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null
  }
};
```

### Rules

- Task starts incomplete.
- Empty task names are rejected.
- Task appears only in its owning stage.
- Adding a task does not advance product stage.
- Adding a task does not reveal future stages.

---

## 19. Toggle Checklist Task Contract

Toggling a task changes completion status and recalculates progress.

### Function Contract

```js
toggleChecklistTask(stageId, taskId)
```

### Required Validation

- Active product must exist.
- Stage must be visible.
- Task must exist inside the stage block.

### Required Behavior

1. Locate active product.
2. Locate stage block.
3. Locate task.
4. Invert `is_completed`.
5. Set `meta.completedAt` to current ISO string if completed.
6. Set `meta.completedAt` to null if reopened.
7. Update `meta.updatedAt`.
8. Recalculate stage progress in derived data.
9. Recalculate global checklist progress if used.
10. Persist state.
11. Notify subscribers.

### Checklist Calculation Hook

Any mutation of `task.is_completed` must trigger a recalculation loop for the parent stage's progress metric.

The UI must immediately reflect:

- Checkbox state
- Strikethrough state
- Stage progress percentage
- Overall checklist metrics if displayed

---

## 20. Delete Contracts

Delete functionality is optional but should follow these contracts when implemented.

### Delete Custom Field

```js
deleteCustomField(stageId, fieldId)
```

Rules:

- Remove only the matching field.
- Do not remove checklist tasks.
- Do not remove the stage block.
- Do not change stage progress.
- Update timestamps.
- Persist state.

### Delete Checklist Task

```js
deleteChecklistTask(stageId, taskId)
```

Rules:

- Remove only the matching task.
- Do not remove custom fields.
- Do not remove the stage block.
- Recalculate stage progress.
- Update timestamps.
- Persist state.

---

## 21. Derived Data Contract

Derived data must be calculated from canonical state.

Do not persist derived progress values unless later required for reporting optimization.

### Active Product

```js
function getActiveProduct(state) {
  return state.products.find(product => product.id === state.activeProductId) ?? null;
}
```

### Current Active Stage

```js
function getCurrentActiveStage(product) {
  return LAUNCHFLOW_STAGES.find(
    stage => stage.stage_index === product.current_active_stage_index
  ) ?? LAUNCHFLOW_STAGES[0];
}
```

### Visible Stages

```js
function getVisibleStages(product) {
  if (!product) return [];

  return LAUNCHFLOW_STAGES.filter(
    stage => stage.stage_index <= product.current_active_stage_index
  );
}
```

### Visible Stage Blocks

```js
function getVisibleStageBlocks(product) {
  if (!product) return [];

  return product.stage_blocks.filter(
    block => block.stage_index <= product.current_active_stage_index
  );
}
```

### Stage Block Lookup

```js
function getStageBlock(product, stageId) {
  return product.stage_blocks.find(block => block.stage_id === stageId) ?? null;
}
```

### Stage Progress

```js
function calculateStageProgress(product, stageId) {
  const block = getStageBlock(product, stageId);
  if (!block) return 0;

  const totalTasks = block.checklist_tasks.length;
  if (totalTasks === 0) return 0;

  const completedTasks = block.checklist_tasks.filter(task => task.is_completed).length;
  return Math.round((completedTasks / totalTasks) * 100);
}
```

### Overall Pipeline Progress

```js
function calculateOverallPipelineProgress(product) {
  if (!product) return 0;

  const index = clampStageIndex(product.current_active_stage_index);
  return Math.round((index / 14) * 100);
}
```

### Global Visible Checklist Progress

```js
function calculateVisibleChecklistProgress(product) {
  const visibleBlocks = getVisibleStageBlocks(product);
  const tasks = visibleBlocks.flatMap(block => block.checklist_tasks);

  if (tasks.length === 0) return 0;

  const completed = tasks.filter(task => task.is_completed).length;
  return Math.round((completed / tasks.length) * 100);
}
```

### KPI Support Values

KPI values may be calculated from all products.

```js
function calculateTotalLaunches(state) {
  return state.products.length;
}

function calculateSourcingCount(state) {
  const sourcingStageIds = new Set(["supplier-sourcing", "under-final-order"]);

  return state.products.filter(product => {
    const currentStage = getCurrentActiveStage(product);
    return sourcingStageIds.has(currentStage.stage_id);
  }).length;
}

function calculateActivePpcCount(state) {
  return state.products.filter(product => product.metrics?.activePpc === true).length;
}

function calculateAvgConversionRate(state) {
  const values = state.products
    .map(product => product.metrics?.conversionRate)
    .filter(value => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}
```

---

## 22. Normalization Contract

All loaded state must be normalized before rendering.

This includes data loaded from:

- Hardcoded seed state
- LocalStorage
- Future API calls
- Future database records
- Imported JSON

### Root Normalization

```js
function normalizeAppState(rawState) {
  const safeState = rawState && typeof rawState === "object" ? rawState : {};
  const products = Array.isArray(safeState.products) ? safeState.products : [];

  const normalizedProducts = products.map(normalizeProduct);
  const activeProductExists = normalizedProducts.some(
    product => product.id === safeState.activeProductId
  );

  return {
    schema_version: Number.isInteger(safeState.schema_version) ? safeState.schema_version : 1,
    products: normalizedProducts,
    activeProductId: activeProductExists
      ? safeState.activeProductId
      : normalizedProducts[0]?.id ?? null,
    ui: normalizeUiState(safeState.ui),
    meta: normalizeMeta(safeState.meta)
  };
}
```

### Product Normalization

```js
function normalizeProduct(rawProduct) {
  const now = getNowIso();
  const safeProduct = rawProduct && typeof rawProduct === "object" ? rawProduct : {};

  return {
    id: typeof safeProduct.id === "string" && safeProduct.id.trim()
      ? safeProduct.id
      : createId("product"),
    name: typeof safeProduct.name === "string" && safeProduct.name.trim()
      ? safeProduct.name.trim()
      : "Untitled Product",
    asin: typeof safeProduct.asin === "string" ? safeProduct.asin : "",
    sku: typeof safeProduct.sku === "string" ? safeProduct.sku : "",
    current_active_stage_index: clampStageIndex(
      safeProduct.current_active_stage_index ?? safeProduct.current_stage_index ?? 1
    ),
    stage_blocks: normalizeStageBlocks(safeProduct.stage_blocks),
    metrics: normalizeMetrics(safeProduct.metrics),
    meta: normalizeMeta(safeProduct.meta, now)
  };
}
```

### Stage Block Normalization

```js
function normalizeStageBlocks(rawBlocks) {
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];

  return LAUNCHFLOW_STAGES.map(stage => {
    const existingBlock = blocks.find(block => block?.stage_id === stage.stage_id);

    return normalizeStageBlock(existingBlock, stage);
  });
}
```

### Stage Block Rules During Normalization

- Missing stage blocks must be created.
- Extra unknown stage blocks must be ignored.
- Stage index must be corrected from canonical registry.
- `custom_fields` must normalize to array.
- `checklist_tasks` must normalize to array.

---

## 23. Validation Helpers

The store should include small pure validation helpers.

### Clamp Stage Index

```js
function clampStageIndex(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 1;

  const integerValue = Math.trunc(numberValue);
  return Math.min(Math.max(integerValue, 1), 14);
}
```

### Is Valid Stage ID

```js
function isValidStageId(stageId) {
  return LAUNCHFLOW_STAGES.some(stage => stage.stage_id === stageId);
}
```

### Is Stage Visible

```js
function isStageVisible(product, stageId) {
  const stage = LAUNCHFLOW_STAGES.find(item => item.stage_id === stageId);
  if (!product || !stage) return false;

  return stage.stage_index <= product.current_active_stage_index;
}
```

### Is Valid Field Type

```js
function isValidFieldType(type) {
  return CUSTOM_FIELD_TYPES.includes(type);
}
```

### Safe Trim

```js
function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}
```

---

## 24. ID Contract

IDs must be stable strings.

Recommended client-side ID generator for the vanilla version:

```js
function createId(prefix) {
  const safePrefix = typeof prefix === "string" && prefix.trim() ? prefix.trim() : "id";
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);

  return `${safePrefix}_${timePart}_${randomPart}`;
}
```

### ID Rules

- Prefix IDs by entity type where practical.
- Use stable IDs for product, field, and task records.
- Do not use labels as IDs.
- Do not use array indexes as persistent IDs.
- Do not regenerate IDs during render.
- Do not regenerate IDs during normalization if a valid ID already exists.

Recommended prefixes:

```txt
product_
field_
task_
```

---

## 25. Timestamp Contract

All timestamps must be ISO strings.

### Timestamp Helper

```js
function getNowIso() {
  return new Date().toISOString();
}
```

### Timestamp Fields

Root state:

```js
meta.createdAt
meta.updatedAt
```

Product:

```js
product.meta.createdAt
product.meta.updatedAt
```

Stage block:

```js
stageBlock.meta.createdAt
stageBlock.meta.updatedAt
```

Custom field:

```js
customField.meta.createdAt
customField.meta.updatedAt
```

Checklist task:

```js
checklistTask.meta.createdAt
checklistTask.meta.updatedAt
checklistTask.meta.completedAt
```

### Timestamp Rules

- Create timestamps when records are created.
- Update `updatedAt` when records are modified.
- Use null for incomplete `completedAt`.
- Clear `completedAt` when a task is reopened.
- Do not store raw `Date` objects.

---

## 26. Persistence Contract

Initial persistence should use LocalStorage.

Future persistence may use database-backed API endpoints.

### LocalStorage Key

```js
const STORAGE_KEY = "launchflow.appState.v1";
```

### Save Contract

```js
function saveState(state) {
  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    console.error("Unable to save LaunchFlow state", error);
    return { ok: false, error };
  }
}
```

### Load Contract

```js
function loadState() {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (!serialized) return getDefaultAppState();

    const parsed = JSON.parse(serialized);
    return normalizeAppState(parsed);
  } catch (error) {
    console.error("Unable to load LaunchFlow state", error);
    return getDefaultAppState();
  }
}
```

### Persistence Rules

- Wrap LocalStorage access in try/catch.
- Treat LocalStorage as unavailable when it fails.
- Normalize loaded data before rendering.
- Do not crash on malformed JSON.
- Do not persist UI-only transient form errors unless useful.
- Keep schema JSON-serializable.

### Browser Guard

If code may execute in an environment without `window`, guard browser APIs:

```js
const canUseLocalStorage =
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined";
```

For the initial static vanilla app, this is mostly defensive, but it protects future Vercel/server-rendered migration paths.

---

## 27. Default State Contract

The app must load a safe default state if no stored data exists.

### Default State Shape

```js
function getDefaultAppState() {
  const now = getNowIso();
  const starterProduct = createDefaultProduct({
    name: "Sample Launch Product",
    asin: "",
    sku: ""
  });

  return {
    schema_version: 1,
    products: [starterProduct],
    activeProductId: starterProduct.id,
    ui: {
      selectedStageId: "product-research",
      searchQuery: "",
      customFieldConfig: null,
      notificationPanelOpen: false,
      settingsPanelOpen: false,
      userMenuOpen: false
    },
    meta: {
      createdAt: now,
      updatedAt: now
    }
  };
}
```

### Default Product Rules

- Default product starts at stage 1.
- Only Product Research renders.
- No default custom fields render.
- No default checklist tasks render.
- Stage 1 may be expanded.
- Future stages remain omitted from DOM.

---

## 28. Render Data Flow Contract

Rendering must be one-directional.

### Required Flow

```txt
State -> Selectors -> Render Functions -> DOM -> User Event -> Store Mutation -> State -> Re-render
```

### Component Data Flow

- `app.js` initializes state and root event delegation.
- `store.js` owns state and mutation functions.
- Components receive data and return markup or DOM fragments.
- Components emit events through handlers.
- Store mutates state immutably.
- App re-renders affected panels.

### Prohibited Flow

Do not allow:

```txt
DOM -> Direct Nested State Mutation -> Partial UI Patch Without Store
```

Do not allow components to mutate `appState` directly.

---

## 29. Search Data Contract

Search must operate only on visible data.

### Searchable Entities

For the active product, search may include:

- Product name
- ASIN
- SKU
- Visible stage labels
- Visible custom field labels
- Visible custom field values
- Visible checklist task names

### Hidden Stage Restriction

Search must not include stages where:

```js
stage.stage_index > activeProduct.current_active_stage_index
```

### Search Rules

- Search query is UI state.
- Search must not mutate product records.
- Search results must not reveal future stages.
- Search should handle empty strings safely.
- Search should stringify custom field values defensively.

---

## 30. Sample Complete JSON State

This sample represents a valid minimal state with one active product at stage 3.

```json
{
  "schema_version": 1,
  "products": [
    {
      "id": "product_sample_001",
      "name": "Insulated Travel Mug",
      "asin": "",
      "sku": "MUG-001",
      "current_active_stage_index": 3,
      "stage_blocks": [
        {
          "stage_id": "product-research",
          "stage_index": 1,
          "is_expanded": false,
          "custom_fields": [
            {
              "field_id": "field_sample_001",
              "label": "Competitor Link",
              "type": "LINK",
              "value": "https://example.com",
              "meta": {
                "createdAt": "2026-06-02T00:00:00.000Z",
                "updatedAt": "2026-06-02T00:00:00.000Z"
              }
            }
          ],
          "checklist_tasks": [
            {
              "task_id": "task_sample_001",
              "task_name": "Validate market demand",
              "is_completed": true,
              "meta": {
                "createdAt": "2026-06-02T00:00:00.000Z",
                "updatedAt": "2026-06-02T00:00:00.000Z",
                "completedAt": "2026-06-02T00:00:00.000Z"
              }
            }
          ],
          "meta": {
            "createdAt": "2026-06-02T00:00:00.000Z",
            "updatedAt": "2026-06-02T00:00:00.000Z"
          }
        },
        {
          "stage_id": "product-development",
          "stage_index": 2,
          "is_expanded": false,
          "custom_fields": [],
          "checklist_tasks": [],
          "meta": {
            "createdAt": "2026-06-02T00:00:00.000Z",
            "updatedAt": "2026-06-02T00:00:00.000Z"
          }
        },
        {
          "stage_id": "supplier-sourcing",
          "stage_index": 3,
          "is_expanded": true,
          "custom_fields": [
            {
              "field_id": "field_sample_002",
              "label": "Unit Cost",
              "type": "CURRENCY",
              "value": {
                "amount": 4.75,
                "currency": "USD"
              },
              "meta": {
                "createdAt": "2026-06-02T00:00:00.000Z",
                "updatedAt": "2026-06-02T00:00:00.000Z"
              }
            }
          ],
          "checklist_tasks": [
            {
              "task_id": "task_sample_002",
              "task_name": "Contact three suppliers",
              "is_completed": false,
              "meta": {
                "createdAt": "2026-06-02T00:00:00.000Z",
                "updatedAt": "2026-06-02T00:00:00.000Z",
                "completedAt": null
              }
            }
          ],
          "meta": {
            "createdAt": "2026-06-02T00:00:00.000Z",
            "updatedAt": "2026-06-02T00:00:00.000Z"
          }
        }
      ],
      "metrics": {
        "conversionRate": null,
        "activePpc": false
      },
      "meta": {
        "createdAt": "2026-06-02T00:00:00.000Z",
        "updatedAt": "2026-06-02T00:00:00.000Z"
      }
    }
  ],
  "activeProductId": "product_sample_001",
  "ui": {
    "selectedStageId": "supplier-sourcing",
    "searchQuery": "",
    "customFieldConfig": null,
    "notificationPanelOpen": false,
    "settingsPanelOpen": false,
    "userMenuOpen": false
  },
  "meta": {
    "createdAt": "2026-06-02T00:00:00.000Z",
    "updatedAt": "2026-06-02T00:00:00.000Z"
  }
}
```

Note: a real normalized product must include all 14 `stage_blocks`. The sample is shortened for readability. Rendering must still show only stages 1 through 3 when `current_active_stage_index` is 3.

---

## 31. Future Cloud Data Mapping

This contract is designed to migrate cleanly into a cloud database.

### Option A: Single Document Per Product

Store each product as one JSON document.

Good for:

- Simple persistence
- Small teams
- Fast reads
- LocalStorage-to-cloud migration

Document shape:

```txt
products/{productId}
  id
  name
  asin
  sku
  current_active_stage_index
  stage_blocks[]
  metrics
  meta
```

### Option B: Relational Tables

Possible future relational model:

```txt
products
  id
  name
  asin
  sku
  current_active_stage_index
  conversion_rate
  active_ppc
  created_at
  updated_at

stage_blocks
  product_id
  stage_id
  stage_index
  is_expanded
  created_at
  updated_at

custom_fields
  field_id
  product_id
  stage_id
  label
  type
  value_json
  created_at
  updated_at

checklist_tasks
  task_id
  product_id
  stage_id
  task_name
  is_completed
  created_at
  updated_at
  completed_at
```

### Cloud Migration Rule

Do not change frontend behavior during persistence migration.

The UI contract remains:

```txt
State -> Visible stages -> Stage blocks -> Custom fields + tasks
```

---

## 32. Vercel Build-Safety Data Rules

Data code must not break Vercel builds.

### Rules

- Do not require environment variables to initialize default state.
- Do not fetch remote data during initial static build.
- Do not use absolute local file paths.
- Do not import JSON from machine-specific locations.
- Do not assume LocalStorage exists without guard if code is reused outside browser.
- Do not allow malformed stored JSON to crash the app.
- Do not use Node-specific APIs in browser modules.
- Keep all imports relative and case-correct.

### Safe Startup Requirement

The app must always be able to start with:

```js
const state = loadStateOrDefault();
```

Even when:

- LocalStorage is empty
- LocalStorage is corrupted
- Browser privacy settings block LocalStorage
- No product exists
- Product data is missing stage blocks
- Stage index is invalid

---

## 33. Acceptance Criteria

The data layer is correct when all of these are true:

```txt
[ ] Root state contains schema_version, products, activeProductId, ui, and meta.
[ ] Active product uses current_active_stage_index as canonical stage index field.
[ ] Loaded current_stage_index aliases normalize into current_active_stage_index.
[ ] current_active_stage_index is clamped from 1 to 14.
[ ] Canonical stage registry contains exactly 14 stages.
[ ] Product stage_blocks normalize to exactly 14 records.
[ ] Stage blocks store custom_fields arrays.
[ ] Stage blocks store checklist_tasks arrays.
[ ] Hidden future stages may exist in data but never render in DOM.
[ ] Custom fields support only TEXT, NUMBER, LINK, CURRENCY, WEIGHT, SIZING, DATE.
[ ] Custom field values match their type-specific value contracts.
[ ] Checklist tasks store task_id, task_name, and is_completed.
[ ] Checklist toggles update stage progress instantly.
[ ] Add field mutates only the selected visible stage block.
[ ] Add task mutates only the selected visible stage block.
[ ] Stage advancement increments by exactly one.
[ ] Stage advancement never skips or exceeds stage 14.
[ ] Derived progress values calculate from current state.
[ ] LocalStorage load/save is guarded and safe.
[ ] State remains JSON-serializable.
[ ] Vercel deployment cannot fail because of missing data or unguarded storage access.
```

---

## 34. Non-Negotiable Data Rules

1. Use `current_active_stage_index` as the canonical stage visibility field.
2. Normalize `current_stage_index` only as an import/load alias.
3. Keep exactly 14 canonical stages.
4. Keep stage order chronological.
5. Store custom fields under their owning stage block.
6. Store checklist tasks under their owning stage block.
7. Never use labels as persistent IDs.
8. Never render future stages to the DOM.
9. Never mutate nested state directly.
10. Never store non-serializable data.
11. Never let corrupted persisted data crash startup.
12. Never reveal hidden stage data through search.
13. Never create hardcoded metadata fields.
14. Never create default checklist tasks.
15. Never make UI-only state the source of truth for product progress.

---

## 35. Final Implementation Reminder

LaunchFlow data must be simple, explicit, and durable.

The active product object controls the entire user experience:

```txt
active product -> current_active_stage_index -> visible stages -> stage blocks -> custom fields + checklist tasks -> progress
```

Every component, mutation, selector, and persistence function must respect that chain.
