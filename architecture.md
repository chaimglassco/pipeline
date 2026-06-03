# LaunchFlow Architecture Specification

## 0. Document Purpose

This `architecture.md` file is the structural engineering map for **LaunchFlow**, an Amazon Product Launch Pipeline Web App. It defines the repository layout, module boundaries, reactive state model, rendering lifecycle, mutation contracts, and Vercel deployment constraints for a GitHub-driven production workflow.

This document is intended for an AI coding agent operating in a Codex environment. Treat it as the implementation blueprint for all architecture, file placement, data modeling, rendering, and build-safety decisions.

LaunchFlow is a vanilla, modular, cloud-deployable web application optimized for Vercel static hosting and future migration to serverless or database-backed persistence.

---

## 1. Architectural Objective

LaunchFlow must provide a clean, deterministic, multi-panel interface for tracking Amazon product launches across 14 chronological stages.

The architecture must support:

- Static Vercel deployment from GitHub.
- Modular vanilla JavaScript files.
- Relative browser-safe imports.
- Localized reactive state mutation.
- Progressive stage disclosure.
- Dynamic custom field generation.
- Ad-hoc checklist management.
- Stage-level progress recalculation.
- Future migration to cloud storage or APIs.
- Zero hidden future-stage DOM clutter.

The system must remain simple enough to deploy as a static site while structured enough to scale into a cloud-native application.

---

## 2. Deployment Model

### Target Platform

- Source control: Git + GitHub
- Deployment: Vercel
- Deployment trigger: GitHub push
- Runtime model: Static frontend by default
- Future extension points: Vercel serverless functions, edge-safe API calls, database persistence

### Default Deployment Strategy

The initial architecture should deploy as a static frontend application using:

```txt
/index.html
/css/styles.css
/js/app.js
/js/store.js
/js/components/*.js
```

No server runtime is required for the initial version.

### Vercel Build Assumption

The repository must be valid when deployed by Vercel from a clean GitHub checkout.

This means:

- No machine-local absolute paths.
- No missing imports.
- No case-sensitive path mismatches.
- No undeclared build-time variables.
- No browser code depending on Node APIs.
- No module imports without correct relative paths and file extensions.
- No runtime crash when local storage is empty, unavailable, or malformed.

---

## 3. Repository File Tree

The repository must use a clean, modular structure. The following layout is canonical for the initial static application.

```txt
/
├── index.html
├── architecture.md
├── product-spec.md
├── agent.md
├── README.md
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── store.js
│   ├── constants/
│   │   └── stages.js
│   ├── components/
│   │   ├── header.js
│   │   ├── sidebar.js
│   │   ├── workspace.js
│   │   ├── kpiCards.js
│   │   ├── pipelineProgress.js
│   │   ├── stageAccordion.js
│   │   ├── customFieldConfig.js
│   │   ├── customFieldRenderer.js
│   │   ├── checklist.js
│   │   └── contextPanel.js
│   └── utils/
│       ├── dom.js
│       ├── ids.js
│       ├── storage.js
│       ├── validators.js
│       ├── formatters.js
│       └── progress.js
└── assets/
    └── .gitkeep
```

Optional future files may include:

```txt
/vercel.json
/package.json
/tailwind.config.js
/postcss.config.js
/api/
```

Only add these when the project genuinely needs custom routing, Tailwind compilation, package scripts, or serverless functions.

---

## 4. File Responsibilities

### `/index.html`

The main browser entry point.

Responsibilities:

- Defines the root HTML document.
- Loads fonts and Material Symbols if used externally.
- Loads `./css/styles.css` through a relative path.
- Loads `./js/app.js` as the module entry point through a relative path.
- Provides root DOM mount nodes.
- Does not contain large application logic.
- Does not contain product data beyond optional safe placeholders.

Required path pattern:

```html
<link rel="stylesheet" href="./css/styles.css">
<script type="module" src="./js/app.js"></script>
```

Required root shell targets:

```html
<div id="app-root">
  <header id="app-header"></header>
  <aside id="app-sidebar"></aside>
  <main id="app-workspace"></main>
  <div id="app-context-panel"></div>
</div>
```

Rules:

- Use relative links only.
- Do not use absolute local filesystem paths.
- Do not inline large scripts.
- Do not render all 14 stage cards in static HTML.
- Let JavaScript render stage DOM based on active product state.

---

### `/css/styles.css`

The global stylesheet.

Responsibilities:

- Houses Tailwind layers or compiled Tailwind output.
- Houses standard custom styles.
- Houses scrollbar styling.
- Houses global CSS variables if required.
- Houses reduced-motion rules.
- Houses small global resets not covered by Tailwind.

Recommended sections:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --launchflow-primary: #003d9b;
  --launchflow-sidebar: #0052cc;
  --launchflow-background: #f8f9fb;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto;
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    transition-duration: 0.01ms;
  }
}
```

Rules:

- Centralize custom raw color values here or in Tailwind config, not in component markup.
- Keep component JavaScript free from raw hex styling.
- Avoid large one-off style blocks that should be Tailwind utility classes.
- Preserve scrollbar usability and keyboard focus visibility.

---

### `/js/app.js`

The core app controller.

Responsibilities:

- Boots the application after DOM is ready.
- Loads default or persisted state.
- Initializes the store.
- Selects root DOM nodes.
- Coordinates full application render.
- Binds delegated event handlers.
- Routes UI events into store mutations.
- Switches views when needed.
- Keeps structural layout separate from state mutation logic.

Required lifecycle:

```js
import { createStore } from './store.js';
import { createDefaultAppState, normalizeAppState } from './utils/storage.js';
import { renderHeader } from './components/header.js';
import { renderSidebar } from './components/sidebar.js';
import { renderWorkspace } from './components/workspace.js';
import { renderContextPanel } from './components/contextPanel.js';

function boot() {
  const initialState = normalizeAppState(createDefaultAppState());
  const store = createStore(initialState);

  const roots = {
    header: document.querySelector('#app-header'),
    sidebar: document.querySelector('#app-sidebar'),
    workspace: document.querySelector('#app-workspace'),
    contextPanel: document.querySelector('#app-context-panel'),
  };

  renderApp(roots, store.getState());
  store.subscribe((nextState) => renderApp(roots, nextState));
  bindGlobalEvents(roots, store);
}

document.addEventListener('DOMContentLoaded', boot);
```

Rules:

- `app.js` owns orchestration, not business data rules.
- Do not store DOM nodes in application state.
- Do not directly mutate `state` from event handlers.
- Event handlers must dispatch store actions or call store mutation methods.
- Use event delegation through `data-action` attributes where practical.
- Guard all DOM queries before using nodes.

---

### `/js/store.js`

The localized reactive state engine.

Responsibilities:

- Owns the canonical in-memory app state.
- Exposes `getState()`.
- Exposes `subscribe(listener)`.
- Exposes explicit mutation actions.
- Performs immutable updates.
- Normalizes unsafe payloads.
- Persists state through a storage utility if enabled.
- Triggers subscribers after successful mutation.

Required mutation domains:

- Set active product.
- Advance active product stage.
- Toggle stage accordion expansion.
- Add custom field to stage.
- Update custom field value.
- Remove custom field if implemented.
- Add checklist task to stage.
- Toggle checklist task completion.
- Remove checklist task if implemented.
- Update global search query.
- Open or close contextual panels.

Store contract pattern:

```js
export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(updater) {
    const nextState = typeof updater === 'function' ? updater(state) : updater;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    subscribe,
    advanceActiveProductStage,
    addCustomField,
    updateCustomFieldValue,
    addChecklistTask,
    toggleChecklistTask,
    toggleStageExpansion,
  };
}
```

Rules:

- Store must be framework-free and browser-safe.
- Store must not import DOM components.
- Store must not generate HTML.
- Store must not depend on Vercel environment variables.
- Store must use immutable update patterns.
- Store must normalize missing active product and missing stage blocks.

---

### `/js/constants/stages.js`

The canonical stage registry.

Responsibilities:

- Defines the 14 chronological launch stages.
- Provides stable `stage_id` values.
- Provides display labels.
- Provides numeric indexes.
- Provides phase grouping.
- Prevents duplicated stage arrays across the app.

Canonical stage array:

```js
export const STAGES = Object.freeze([
  { stage_id: 'product-research', stage_index: 1, label: 'Product Research', phase: 'pipeline' },
  { stage_id: 'product-development', stage_index: 2, label: 'Product Development', phase: 'pipeline' },
  { stage_id: 'supplier-sourcing', stage_index: 3, label: 'Supplier Sourcing', phase: 'pipeline' },
  { stage_id: 'under-final-order', stage_index: 4, label: 'Under Final Order', phase: 'pipeline' },
  { stage_id: 'shipping', stage_index: 5, label: 'Shipping', phase: 'pipeline' },
  { stage_id: 'keyword-research', stage_index: 6, label: 'Keyword Research', phase: 'pipeline' },
  { stage_id: 'listing-creation', stage_index: 7, label: 'Listing Creation', phase: 'pipeline' },
  { stage_id: 'image-planning', stage_index: 8, label: 'Image Planning', phase: 'pipeline' },
  { stage_id: 'campaign-prep', stage_index: 9, label: 'Campaign Prep', phase: 'pipeline' },
  { stage_id: 'amazon-inbound', stage_index: 10, label: 'Amazon Inbound', phase: 'pipeline' },
  { stage_id: 'enrolled-to-vines', stage_index: 11, label: 'Enrolled to Vines', phase: 'pipeline' },
  { stage_id: 'launch', stage_index: 12, label: 'Launch', phase: 'pipeline' },
  { stage_id: 'stable', stage_index: 13, label: 'Stable', phase: 'optimization' },
  { stage_id: 'scaling', stage_index: 14, label: 'Scaling', phase: 'optimization' },
]);

export const MAX_STAGE_INDEX = 14;
export const MIN_STAGE_INDEX = 1;
```

Rules:

- Never duplicate this array in components.
- Never sort this array alphabetically.
- Never use labels as persistent identifiers.
- Only `stage_id` and `stage_index` define identity and order.

---

### `/js/components/`

The modular rendering layer.

Responsibilities:

- Converts state into HTML strings or DOM fragments.
- Keeps rendering pure where possible.
- Emits actions through `data-action` and `data-*` attributes.
- Does not own canonical state.
- Does not perform direct persistence.
- Does not contain the primary mutation algorithms.

Required component segmentation:

```txt
Panel 1: Sidebar
  /js/components/sidebar.js

Panel 2: Main Workspace Accordions
  /js/components/workspace.js
  /js/components/kpiCards.js
  /js/components/pipelineProgress.js
  /js/components/stageAccordion.js
  /js/components/customFieldRenderer.js
  /js/components/checklist.js

Panel 3: Dynamic Forms / Drawers
  /js/components/contextPanel.js
  /js/components/customFieldConfig.js
```

---

## 5. Component Responsibilities

### `header.js`

Renders the top navigation.

Required elements:

- `LaunchFlow` branding.
- Global search input.
- Notifications icon.
- Settings icon.
- User avatar dropdown trigger.

Rules:

- Must not mutate stage data.
- Must not render pipeline stages.
- Must emit search query events through `data-action="update-search"` or equivalent.
- Must use Material Symbols markup for icons.

---

### `sidebar.js`

Renders Panel 1.

Inputs:

- Active product.
- Canonical stages.
- Selected stage ID.

Responsibilities:

- Compute or receive visible stages.
- Render only stages where `stage_index <= current_stage_index`.
- Emit stage selection events.
- Display stage progress summary if provided.

Hard rule:

```js
if (stage.stage_index > activeProduct.current_stage_index) {
  return '';
}
```

If looping through sorted stages, prefer `break` for progressive disclosure:

```js
for (const stage of STAGES) {
  if (stage.stage_index > activeProduct.current_stage_index) break;
  html += renderSidebarStage(stage);
}
```

---

### `workspace.js`

Renders Panel 2.

Required sections in order:

1. KPI cards.
2. Overall pipeline progress meter.
3. Visible stage accordion cards.

Responsibilities:

- Locate active product.
- Render safe empty state if active product is missing.
- Render stage cards only for visible stages.
- Preserve `pl-[260px]` workspace offset.

Rules:

- Do not render future stages.
- Do not directly mutate product state.
- Do not hard-code stage blocks outside canonical constants.

---

### `kpiCards.js`

Renders summary KPIs.

Required KPI cards:

- Total Launches
- Sourcing
- Active PPC
- Avg Conversion Rate

Responsibilities:

- Compute read-only metrics from app state.
- Fail safely when product arrays are empty.
- Use fallback display values such as `0` or `—`.

---

### `pipelineProgress.js`

Renders overall active product pipeline progress.

Required calculation:

```js
const progress = Math.round((activeProduct.current_stage_index / 14) * 100);
```

Responsibilities:

- Display percent.
- Display current stage label.
- Display `Stage X of 14`.
- Never depend on rendered future-stage DOM.

---

### `stageAccordion.js`

Renders a single visible stage dropdown card.

Inputs:

- Stage definition.
- Stage block.
- Whether this stage is active/current.
- Stage progress.

Required sections:

1. Stage header.
2. Expand/collapse control.
3. Local progress display.
4. Custom fields list.
5. `+ Add Custom Field` button.
6. Checklist section at bottom.
7. `+ Add Task` input and button.
8. Optional `Advance to Next Stage` button if current stage is not 14.

Rules:

- Render only after caller confirms visibility.
- Never render default hardcoded metadata inputs.
- Custom fields must come only from `stage_block.custom_fields`.
- Checklist tasks must come only from `stage_block.checklist_tasks`.
- Buttons must emit events via `data-action`.

---

### `customFieldConfig.js`

Renders Panel 3 custom field creation UI.

Required inputs:

- Field Label / Field Name
- Field Type dropdown

Strict field types:

```txt
TEXT
NUMBER
LINK
CURRENCY
WEIGHT
SIZING
DATE
```

Responsibilities:

- Render config form.
- Validate required label.
- Validate selected type.
- Submit payload to store through app controller.
- Close without mutation on cancel.

Rules:

- Temporary form state must not be persisted until Save.
- Hidden stages cannot open a valid custom field config.
- Field label must not become the field ID.

---

### `customFieldRenderer.js`

Renders field value controls from field metadata.

Responsibilities:

- Render the correct input for each field type.
- Normalize changed values.
- Emit field update events.
- Render validation states safely.

Rendering map:

```txt
TEXT      -> input type="text" or textarea
NUMBER    -> input type="number"
LINK      -> input type="url" plus safe anchor rendering when valid
CURRENCY  -> numeric input plus currency code/symbol display
WEIGHT    -> numeric input plus mass unit selector
SIZING    -> dimension inputs or sizing string structure
DATE      -> input type="date"
```

Rules:

- Do not render a type that is not in the strict enum.
- Unknown field types must render a safe unsupported-field message or be omitted safely.
- Do not crash on malformed field values.

---

### `checklist.js`

Renders ad-hoc stage checklist controls.

Responsibilities:

- Render checklist task input.
- Render `+ Add Task` button.
- Render each checklist item.
- Render checkbox state.
- Apply strikethrough class when completed.
- Emit add/toggle/delete events.

Rules:

- Checklist must render at the bottom of every visible stage accordion.
- Task names must be user-generated.
- No fake starter tasks.
- No global checklist array detached from stages.

---

### `contextPanel.js`

Renders Panel 3 container.

Responsibilities:

- Display active contextual form or drawer.
- Support Add Custom Field flow.
- Support future edit flows.
- Close on cancel.
- Reset temporary state after save/cancel.

Rules:

- Context panel state is UI state, not product data.
- Do not mutate product data until the user confirms Save or Add.
- Validate selected product and selected stage before committing mutations.

---

## 6. Global Data Model

LaunchFlow uses a pure JavaScript/JSON data model. The model must remain serializable, local-storage compatible, database-friendly, and API-ready.

No state object may contain:

- DOM nodes
- Functions
- Class instances
- Circular references
- Raw `Date` objects
- Non-serializable browser APIs

Use strings, numbers, booleans, arrays, objects, and null.

---

## 7. Global App State Object

The global app state tracks the product collection and the currently active product.

Required structure:

```js
const appState = {
  products: [],
  activeProductId: null,
  ui: {
    selectedStageId: null,
    searchQuery: '',
    contextPanel: {
      isOpen: false,
      mode: null,
      productId: null,
      stage_id: null,
    },
  },
};
```

Required fields:

```txt
products         Array of Product entities
activeProductId  ID of the currently selected product or null
ui               Non-persistent or optionally persistent UI state
```

Rules:

- `products` must always be an array.
- `activeProductId` must reference an existing product or be null.
- UI state must not be required for persistence correctness.
- Product data must remain valid even if `ui` is reset.

---

## 8. Product Entity Structure

Each product tracks launch identity, Amazon identifiers, current stage position, and 14 stage blocks.

Required structure:

```js
const product = {
  id: 'product_001',
  name: 'Example Product',
  asin: 'B000000000',
  current_stage_index: 1,
  stage_blocks: [],
};
```

Required fields:

```txt
id                    Stable product ID
name                  Product display name
asin                  Amazon ASIN string or empty string
current_stage_index   Integer from 1 to 14
stage_blocks           Array of 14 Stage Block entities
```

Rules:

- `current_stage_index` is the source of truth for progressive disclosure.
- `current_stage_index` must be clamped between 1 and 14.
- `stage_blocks` must contain exactly 14 blocks after normalization.
- Stage block order must match the canonical stage registry.
- A product may store data for all 14 stages, but the DOM may render only visible stages.
- Do not use `name` or `asin` as the primary key.

Recommended full product shape:

```js
const product = {
  id: 'product_001',
  name: 'Silicone Kitchen Organizer',
  asin: '',
  current_stage_index: 3,
  stage_blocks: [
    // exactly 14 Stage Block objects, one per canonical stage
  ],
  created_at: '2026-06-02T00:00:00.000Z',
  updated_at: '2026-06-02T00:00:00.000Z',
};
```

---

## 9. Stage Block Entity Structure

Each product owns 14 stage blocks. Each stage block contains stage-specific custom fields and checklist tasks.

Required structure:

```js
const stageBlock = {
  stage_id: 'supplier-sourcing',
  is_expanded: true,
  custom_fields: [],
  checklist_tasks: [],
};
```

Required fields:

```txt
stage_id          Stable canonical stage ID
is_expanded       Accordion state boolean
custom_fields     Array of Custom Field entities
checklist_tasks   Array of Checklist Task entities
```

Rules:

- `stage_id` must match one of the 14 canonical stage IDs.
- `is_expanded` controls accordion display only.
- `is_expanded` must not control progressive disclosure.
- `custom_fields` must always be an array.
- `checklist_tasks` must always be an array.
- Stage progress is derived from `checklist_tasks`.
- Do not store stage DOM markup in the stage block.

Recommended expanded structure:

```js
const stageBlock = {
  stage_id: 'supplier-sourcing',
  is_expanded: false,
  custom_fields: [
    {
      field_id: 'field_001',
      label: 'Supplier Quote Link',
      type: 'LINK',
      value: 'https://example.com/quote',
    },
  ],
  checklist_tasks: [
    {
      task_id: 'task_001',
      task_name: 'Request supplier samples',
      is_completed: false,
    },
  ],
};
```

---

## 10. Custom Field Entity Structure

Custom fields are user-generated metadata fields nested inside a stage block.

Required structure:

```js
const customField = {
  field_id: 'field_001',
  label: 'Supplier Quote Link',
  type: 'LINK',
  value: '',
};
```

Required fields:

```txt
field_id  Stable generated field ID
label     User-entered field label
type      Strict field type enum
value     Field value matching type behavior
```

Strict field type enum:

```txt
TEXT
NUMBER
LINK
CURRENCY
WEIGHT
SIZING
DATE
```

Rules:

- Field IDs must be generated, not derived from labels.
- Field labels must be trimmed before save.
- Field labels must not be required to be globally unique.
- Field labels may repeat across different stages.
- Field type must never mutate implicitly after creation.
- Value must remain JSON-serializable.
- Unknown field types must not crash rendering.

Recommended value defaults:

```js
const FIELD_DEFAULT_VALUES = {
  TEXT: '',
  NUMBER: null,
  LINK: '',
  CURRENCY: { amount: null, currency_code: 'USD' },
  WEIGHT: { amount: null, unit: 'lb' },
  SIZING: { length: null, width: null, height: null, unit: 'in', raw: '' },
  DATE: '',
};
```

---

## 11. Checklist Task Entity Structure

Checklist tasks are user-generated action items nested inside a stage block.

Required structure:

```js
const checklistTask = {
  task_id: 'task_001',
  task_name: 'Request supplier samples',
  is_completed: false,
};
```

Required fields:

```txt
task_id       Stable generated task ID
task_name     User-entered checklist item text
is_completed  Boolean completion state
```

Rules:

- Task IDs must be generated.
- Task names must be trimmed before save.
- Empty task names must be rejected.
- `is_completed` defaults to false.
- Completion toggles must update state immediately.
- Completion UI must be derived from `is_completed`.
- Stage progress must be derived from checklist completion.

Recommended expanded task shape for future persistence:

```js
const checklistTask = {
  task_id: 'task_001',
  task_name: 'Request supplier samples',
  is_completed: false,
  created_at: '2026-06-02T00:00:00.000Z',
  updated_at: '2026-06-02T00:00:00.000Z',
  completed_at: null,
};
```

---

## 12. Complete Example State

```js
const appState = {
  products: [
    {
      id: 'product_001',
      name: 'Silicone Kitchen Organizer',
      asin: '',
      current_stage_index: 3,
      stage_blocks: [
        {
          stage_id: 'product-research',
          is_expanded: false,
          custom_fields: [
            {
              field_id: 'field_001',
              label: 'Main Competitor ASIN',
              type: 'TEXT',
              value: 'B012345678',
            },
          ],
          checklist_tasks: [
            {
              task_id: 'task_001',
              task_name: 'Validate market demand',
              is_completed: true,
            },
          ],
        },
        {
          stage_id: 'product-development',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'supplier-sourcing',
          is_expanded: true,
          custom_fields: [
            {
              field_id: 'field_002',
              label: 'Supplier Quote',
              type: 'CURRENCY',
              value: { amount: 4.25, currency_code: 'USD' },
            },
          ],
          checklist_tasks: [
            {
              task_id: 'task_002',
              task_name: 'Request samples from supplier',
              is_completed: false,
            },
          ],
        },
        {
          stage_id: 'under-final-order',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'shipping',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'keyword-research',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'listing-creation',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'image-planning',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'campaign-prep',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'amazon-inbound',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'enrolled-to-vines',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'launch',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'stable',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
        {
          stage_id: 'scaling',
          is_expanded: false,
          custom_fields: [],
          checklist_tasks: [],
        },
      ],
    },
  ],
  activeProductId: 'product_001',
  ui: {
    selectedStageId: 'supplier-sourcing',
    searchQuery: '',
    contextPanel: {
      isOpen: false,
      mode: null,
      productId: null,
      stage_id: null,
    },
  },
};
```

DOM result for this example:

```txt
Rendered stages:
1. Product Research
2. Product Development
3. Supplier Sourcing

Omitted from DOM:
4. Under Final Order
5. Shipping
6. Keyword Research
7. Listing Creation
8. Image Planning
9. Campaign Prep
10. Amazon Inbound
11. Enrolled to Vines
12. Launch
13. Stable
14. Scaling
```

---

## 13. Normalization Layer

Every loaded state must pass through a normalization layer before rendering.

### App State Normalization

Required guarantees after normalization:

- `products` is an array.
- `activeProductId` is null or references an existing product.
- Each product has a valid `current_stage_index`.
- Each product has exactly 14 `stage_blocks`.
- Every stage block has valid arrays for `custom_fields` and `checklist_tasks`.
- Unknown field types are handled safely.

Recommended pattern:

```js
export function normalizeAppState(input) {
  const safeProducts = Array.isArray(input?.products) ? input.products : [];

  const products = safeProducts.map(normalizeProduct);
  const activeProductId = products.some((product) => product.id === input?.activeProductId)
    ? input.activeProductId
    : products[0]?.id ?? null;

  return {
    products,
    activeProductId,
    ui: normalizeUiState(input?.ui),
  };
}
```

### Product Normalization

```js
function normalizeProduct(product) {
  return {
    id: String(product?.id || generateId('product')),
    name: String(product?.name || 'Untitled Product'),
    asin: String(product?.asin || ''),
    current_stage_index: clampInteger(product?.current_stage_index, 1, 14),
    stage_blocks: normalizeStageBlocks(product?.stage_blocks),
  };
}
```

### Stage Block Normalization

```js
function normalizeStageBlocks(stageBlocks) {
  const incoming = Array.isArray(stageBlocks) ? stageBlocks : [];

  return STAGES.map((stage) => {
    const existing = incoming.find((block) => block?.stage_id === stage.stage_id);

    return {
      stage_id: stage.stage_id,
      is_expanded: Boolean(existing?.is_expanded),
      custom_fields: Array.isArray(existing?.custom_fields) ? existing.custom_fields : [],
      checklist_tasks: Array.isArray(existing?.checklist_tasks) ? existing.checklist_tasks : [],
    };
  });
}
```

---

## 14. Reactive Lifecycle

The app must follow a deterministic render cycle.

### Boot Sequence

```txt
1. Browser loads index.html.
2. Browser loads css/styles.css.
3. Browser loads js/app.js as an ES module.
4. app.js waits for DOMContentLoaded.
5. app.js loads persisted state or default state.
6. app.js normalizes state.
7. app.js creates store.
8. app.js selects root DOM nodes.
9. app.js renders header, sidebar, workspace, and context panel.
10. app.js binds delegated event handlers.
11. User action triggers store mutation.
12. Store updates state immutably.
13. Store notifies subscribers.
14. app.js re-renders affected panels or full shell.
15. State is persisted if persistence is enabled.
```

### Reactive Boundary

State drives DOM.

DOM must never be the source of truth for:

- Current active stage index.
- Product records.
- Custom fields.
- Checklist tasks.
- Checklist completion.
- Stage visibility.

DOM may temporarily hold input values before Save/Add actions.

---

## 15. Progressive Disclosure Rendering Rules

Progressive disclosure is a hard architectural invariant.

### Rule

The renderer loops through the 14 chronological stages. If `stage_index > current_stage_index`, the renderer must immediately break or omit that stage from the DOM.

Required logic:

```js
export function getVisibleStages(product) {
  const currentStageIndex = clampInteger(product?.current_stage_index, 1, 14);
  const visibleStages = [];

  for (const stage of STAGES) {
    if (stage.stage_index > currentStageIndex) break;
    visibleStages.push(stage);
  }

  return visibleStages;
}
```

Workspace render pattern:

```js
function renderVisibleStageAccordions(activeProduct) {
  let html = '';

  for (const stage of STAGES) {
    if (stage.stage_index > activeProduct.current_stage_index) break;

    const stageBlock = activeProduct.stage_blocks.find(
      (block) => block.stage_id === stage.stage_id
    );

    html += renderStageAccordion({ stage, stageBlock, activeProduct });
  }

  return html;
}
```

Sidebar render pattern:

```js
function renderSidebarStages(activeProduct) {
  return getVisibleStages(activeProduct)
    .map((stage) => renderSidebarItem(stage, activeProduct))
    .join('');
}
```

### DOM Omission Requirements

For hidden future stages, the app must not render:

- Stage accordion cards.
- Sidebar items.
- Dropdown options.
- Locked placeholders.
- Disabled buttons.
- Hidden divs.
- Offscreen markup.
- Search results.
- Accessible tree entries.

Use state-based omission, not CSS hiding.

### Current Stage Advancement

```js
function advanceActiveProductStage() {
  setState((state) => {
    const activeProduct = getActiveProduct(state);
    if (!activeProduct) return state;

    const nextIndex = Math.min(activeProduct.current_stage_index + 1, 14);

    return updateProduct(state, activeProduct.id, {
      ...activeProduct,
      current_stage_index: nextIndex,
    });
  });
}
```

Rules:

- Do not advance beyond stage 14.
- Do not skip stages.
- Do not reveal stage 4 from stage 2 in one normal click.
- Do not use a separate UI flag to reveal future stages.
- The product's `current_stage_index` is the only source of truth.

---

## 16. Dynamic Field Mutation Rule

Adding a field pushes a blank field object with its chosen type format into the active stage block's `custom_fields` array.

### Input Payload

```js
const payload = {
  productId: 'product_001',
  stage_id: 'supplier-sourcing',
  label: 'Supplier Quote',
  type: 'CURRENCY',
};
```

### Mutation Contract

```js
function addCustomField({ productId, stage_id, label, type }) {
  setState((state) => {
    const trimmedLabel = String(label || '').trim();
    if (!trimmedLabel) return state;
    if (!isAllowedFieldType(type)) return state;

    return updateStageBlock(state, productId, stage_id, (stageBlock) => ({
      ...stageBlock,
      custom_fields: [
        ...stageBlock.custom_fields,
        {
          field_id: generateId('field'),
          label: trimmedLabel,
          type,
          value: createDefaultFieldValue(type),
        },
      ],
    }));
  });
}
```

### Rendering Result

After the mutation:

- Store emits a state update.
- Workspace re-renders the active stage accordion.
- The new field appears only inside the selected stage block.
- No other stage is mutated.
- No progress recalculation is required unless field values later affect metrics.

### Type-Specific Default Values

```js
function createDefaultFieldValue(type) {
  switch (type) {
    case 'TEXT':
      return '';
    case 'NUMBER':
      return null;
    case 'LINK':
      return '';
    case 'CURRENCY':
      return { amount: null, currency_code: 'USD' };
    case 'WEIGHT':
      return { amount: null, unit: 'lb' };
    case 'SIZING':
      return { length: null, width: null, height: null, unit: 'in', raw: '' };
    case 'DATE':
      return '';
    default:
      return '';
  }
}
```

Rules:

- Never pre-render hardcoded metadata fields.
- Only user-created fields appear.
- Hidden stages cannot receive fields through UI actions.
- Field mutation must update `custom_fields`, not global product metadata.

---

## 17. Custom Field Value Update Lifecycle

When a custom field input changes:

```txt
1. User edits rendered field input.
2. app.js captures event through data-action.
3. app.js extracts product ID, stage ID, field ID, value.
4. store.js validates payload.
5. store.js finds target product.
6. store.js finds target stage block.
7. store.js maps custom_fields.
8. Target field value is replaced immutably.
9. Store notifies subscribers.
10. Field renderer shows updated value.
```

Required mutation pattern:

```js
function updateCustomFieldValue({ productId, stage_id, field_id, value }) {
  setState((state) => updateStageBlock(state, productId, stage_id, (stageBlock) => ({
    ...stageBlock,
    custom_fields: stageBlock.custom_fields.map((field) => {
      if (field.field_id !== field_id) return field;
      return { ...field, value };
    }),
  })));
}
```

Rules:

- Preserve field ID.
- Preserve field label.
- Preserve field type.
- Update only value.
- Do not mutate checklist tasks.
- Do not reveal future stages.

---

## 18. Checklist Calculation Hook

Mutating any `task.is_completed` checkbox triggers a recalculation loop that updates the parent stage's local progress metric in the main layout panel.

### Source of Truth

Checklist progress is derived from:

```txt
stageBlock.checklist_tasks[].is_completed
```

### Calculation

```js
export function calculateStageProgress(stageBlock) {
  const tasks = Array.isArray(stageBlock?.checklist_tasks)
    ? stageBlock.checklist_tasks
    : [];

  if (tasks.length === 0) {
    return {
      completed: 0,
      total: 0,
      percent: 0,
    };
  }

  const completed = tasks.filter((task) => task.is_completed).length;

  return {
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
  };
}
```

### Toggle Mutation

```js
function toggleChecklistTask({ productId, stage_id, task_id }) {
  setState((state) => updateStageBlock(state, productId, stage_id, (stageBlock) => ({
    ...stageBlock,
    checklist_tasks: stageBlock.checklist_tasks.map((task) => {
      if (task.task_id !== task_id) return task;
      return {
        ...task,
        is_completed: !task.is_completed,
      };
    }),
  })));
}
```

### Render Update

After toggling:

- The checkbox reflects the new boolean value.
- The task label receives or removes strikethrough styling.
- `calculateStageProgress(stageBlock)` runs for the parent stage.
- Stage progress percent updates in the stage accordion header.
- KPI or global checklist metrics update if they depend on task completion.
- No future stage is revealed.

Rules:

- Do not store stale progress if it can be derived.
- If caching progress is later required, recalculate after every checklist mutation.
- Do not update progress manually from the DOM.

---

## 19. Add Checklist Task Lifecycle

Adding a task appends a new object to the active stage block's `checklist_tasks` array.

### Input Payload

```js
const payload = {
  productId: 'product_001',
  stage_id: 'supplier-sourcing',
  task_name: 'Request supplier samples',
};
```

### Mutation Contract

```js
function addChecklistTask({ productId, stage_id, task_name }) {
  setState((state) => {
    const trimmedTaskName = String(task_name || '').trim();
    if (!trimmedTaskName) return state;

    return updateStageBlock(state, productId, stage_id, (stageBlock) => ({
      ...stageBlock,
      checklist_tasks: [
        ...stageBlock.checklist_tasks,
        {
          task_id: generateId('task'),
          task_name: trimmedTaskName,
          is_completed: false,
        },
      ],
    }));
  });
}
```

### Render Result

After adding:

- New task appears at the bottom of the target stage checklist.
- Checkbox starts unchecked.
- Task input clears.
- Parent stage progress recalculates.
- No other stage data changes.

Rules:

- Empty task names are rejected.
- Duplicate task names may be allowed.
- Tasks are stored only inside their stage block.
- Hidden stages cannot receive tasks through UI.

---

## 20. Shared Update Helpers

Use shared helpers to avoid repeated nested mutation bugs.

### Active Product Selector

```js
function getActiveProduct(state) {
  return state.products.find((product) => product.id === state.activeProductId) || null;
}
```

### Update Product

```js
function updateProduct(state, productId, nextProduct) {
  return {
    ...state,
    products: state.products.map((product) => (
      product.id === productId ? nextProduct : product
    )),
  };
}
```

### Update Stage Block

```js
function updateStageBlock(state, productId, stage_id, updater) {
  return {
    ...state,
    products: state.products.map((product) => {
      if (product.id !== productId) return product;

      return {
        ...product,
        stage_blocks: product.stage_blocks.map((stageBlock) => {
          if (stageBlock.stage_id !== stage_id) return stageBlock;
          return updater(stageBlock);
        }),
      };
    }),
  };
}
```

Rules:

- All deep updates must go through helper patterns like these.
- Do not push directly into nested arrays.
- Do not mutate product objects in place.
- Do not rely on DOM order to locate state records.

---

## 21. Component and State Lifecycle Relationships

### Dependency Direction

Required dependency direction:

```txt
constants -> utils -> store -> app controller -> components -> DOM
```

Allowed imports:

```txt
app.js imports store and components
components import constants and utils if needed
store imports constants and pure utils
utils import no components
constants import nothing app-specific
```

Prohibited imports:

```txt
store.js must not import components
constants must not import store
utils must not import app.js
components must not mutate state directly
```

### Flow Diagram

```txt
User clicks UI
  -> app.js delegated event handler
    -> store.js mutation action
      -> immutable state update
        -> subscriber notification
          -> renderHeader / renderSidebar / renderWorkspace / renderContextPanel
            -> DOM reflects new state
```

### Progressive Disclosure Flow

```txt
Product.current_stage_index changes
  -> getVisibleStages(product)
    -> sidebar renders only visible stage items
    -> workspace renders only visible stage accordions
    -> hidden future stages remain absent from DOM
```

### Dynamic Field Flow

```txt
+ Add Custom Field clicked
  -> context panel opens for selected stage
    -> user enters label and type
      -> store.addCustomField(payload)
        -> field object appended to stageBlock.custom_fields
          -> workspace re-renders selected stage
            -> customFieldRenderer displays type-specific input
```

### Checklist Flow

```txt
+ Add Task clicked
  -> store.addChecklistTask(payload)
    -> task appended to stageBlock.checklist_tasks
      -> calculateStageProgress(stageBlock)
        -> stage accordion header progress updates
```

### Checkbox Toggle Flow

```txt
Checkbox toggled
  -> store.toggleChecklistTask(payload)
    -> task.is_completed flips
      -> calculateStageProgress(stageBlock)
        -> checklist item strikethrough updates
        -> local stage progress updates
        -> derived global metrics update if applicable
```

---

## 22. Event Handling Architecture

Use delegated event handling from stable container nodes.

Recommended pattern:

```js
function bindGlobalEvents(roots, store) {
  roots.workspace?.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;

    const { action } = actionTarget.dataset;

    if (action === 'advance-stage') {
      store.advanceActiveProductStage();
    }
  });

  roots.workspace?.addEventListener('change', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;

    if (actionTarget.dataset.action === 'toggle-task') {
      store.toggleChecklistTask({
        productId: actionTarget.dataset.productId,
        stage_id: actionTarget.dataset.stageId,
        task_id: actionTarget.dataset.taskId,
      });
    }
  });
}
```

Required `data-*` attributes:

```txt
data-action
 data-product-id
 data-stage-id
 data-field-id
 data-task-id
 data-field-type
```

Rules:

- Never infer state identity from visible text.
- Never infer state identity from array index in DOM alone.
- Use IDs for all mutations.
- Keep event handlers centralized in `app.js` or a dedicated event module.

---

## 23. Rendering Contracts

### HTML String Rendering

If components return HTML strings:

- Escape user-entered text before injection.
- Never interpolate raw user input into HTML attributes without escaping.
- Use helper functions for safe rendering.

Required helper:

```js
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
```

### DOM Fragment Rendering

If components create DOM nodes directly:

- Use `textContent` for user content.
- Use `setAttribute` carefully.
- Avoid direct `innerHTML` for user-generated values.

### Required Safety

User-controlled values include:

- Product names
- ASIN strings
- Custom field labels
- Custom field values
- Checklist task names
- Search query text

These must never introduce executable HTML.

---

## 24. Local Persistence Layer

Initial state may persist through browser local storage.

### `/js/utils/storage.js`

Responsibilities:

- Load raw persisted JSON.
- Catch parse errors.
- Normalize loaded state.
- Save serializable state.
- Fallback to default state when storage fails.

Recommended pattern:

```js
const STORAGE_KEY = 'launchflow.appState.v1';

export function loadPersistedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('LaunchFlow state load failed.', error);
    return null;
  }
}

export function savePersistedState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('LaunchFlow state save failed.', error);
  }
}
```

Rules:

- Guard local storage usage.
- Catch JSON parse failures.
- Never block rendering if storage fails.
- Never persist DOM nodes.
- Version storage keys for future migrations.

---

## 25. Cloud Data Migration Readiness

The schema must map cleanly to future database storage.

### Relational Projection

Future database tables or collections may map as:

```txt
products
  id
  name
  asin
  current_stage_index
  created_at
  updated_at

stage_blocks
  product_id
  stage_id
  is_expanded

custom_fields
  field_id
  product_id
  stage_id
  label
  type
  value_json

checklist_tasks
  task_id
  product_id
  stage_id
  task_name
  is_completed
  created_at
  updated_at
```

### Document Projection

Future document storage may persist each product as one JSON document:

```txt
products/{productId}
  id
  name
  asin
  current_stage_index
  stage_blocks[]
```

Rules:

- Current JSON model must support both relational and document storage.
- IDs must be stable before cloud migration.
- Stage IDs must not change after data exists.
- Field and task values must remain JSON-serializable.

---

## 26. Vercel Deployment Configuration

### Static Deployment Defaults

The app should deploy successfully as a static site with:

```txt
index.html
css/styles.css
js/**/*.js
```

Vercel project settings may use a static or framework-agnostic preset.

If no build system exists:

```txt
Build Command: none
Output Directory: project root
```

If Tailwind compilation is added later:

```txt
Build Command: npm run build
Output Directory: project root or configured dist directory
```

Only introduce a build system when required.

### Optional `vercel.json`

Do not add `vercel.json` unless routing or headers require it.

If needed for static fallback:

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Rules:

- Do not add rewrites that break static asset paths.
- Do not route CSS or JS requests to HTML.
- Verify assets still load using relative paths.

---

## 27. Build-Safety Directives

### Relative Path Requirement

All browser asset references must use clean relative paths.

Use:

```html
<link rel="stylesheet" href="./css/styles.css">
<script type="module" src="./js/app.js"></script>
```

Use:

```js
import { createStore } from './store.js';
import { STAGES } from './constants/stages.js';
```

Avoid:

```html
<link rel="stylesheet" href="/Users/local/dev/styles.css">
<script src="C:\\project\\app.js"></script>
```

Avoid unresolved aliases unless explicitly configured:

```js
import { STAGES } from '@/constants/stages';
```

### Browser ES Module Requirement

When using native browser ES modules, include the file extension.

Use:

```js
import { renderSidebar } from './components/sidebar.js';
```

Avoid:

```js
import { renderSidebar } from './components/sidebar';
```

### Case Sensitivity Requirement

Vercel deployments run in a case-sensitive environment.

If the file is:

```txt
/js/components/stageAccordion.js
```

Import it exactly as:

```js
import { renderStageAccordion } from './components/stageAccordion.js';
```

Do not import as:

```js
import { renderStageAccordion } from './components/StageAccordion.js';
```

### Default State Failsafe

The app must render with default state even when:

- No persisted state exists.
- Persisted state is malformed.
- `activeProductId` is missing.
- Product array is empty.
- Stage blocks are incomplete.
- Local storage is unavailable.

Required fallback:

```js
export function createDefaultAppState() {
  const defaultProduct = createDefaultProduct();

  return {
    products: [defaultProduct],
    activeProductId: defaultProduct.id,
    ui: {
      selectedStageId: 'product-research',
      searchQuery: '',
      contextPanel: {
        isOpen: false,
        mode: null,
        productId: null,
        stage_id: null,
      },
    },
  };
}
```

### Environment Variable Safety

Initial static app should not require environment variables.

If future cloud features require environment variables:

- Read them only in appropriate server or build contexts.
- Provide safe fallbacks for optional values.
- Never expose secrets to browser code.
- Never use non-null assertions or hard failure for optional client configuration.

### No Node-Only APIs in Browser Code

Browser modules must not use:

```txt
fs
path
process.cwd()
Buffer without polyfill
Node-only crypto APIs
server-only environment reads
```

Use browser-safe APIs only.

### Browser API Guards

Guard optional browser APIs:

```js
const canUseLocalStorage = typeof window !== 'undefined' && 'localStorage' in window;
```

Although the initial static app runs in the browser, guards keep modules safe for future test/build tooling.

---

## 28. Error Handling Strategy

The app must fail softly.

### Required Safe States

- No active product: render product empty state.
- Missing stage block: normalize or render empty stage block.
- Invalid stage index: clamp to valid range.
- Invalid field type: omit field or render unsupported field notice.
- Invalid link value: render as text with validation message, not unsafe anchor.
- Storage failure: continue in memory.
- Event payload missing IDs: ignore mutation and optionally log warning.

### Mutation Failure Behavior

If a mutation payload is invalid:

```txt
1. Do not mutate state.
2. Do not crash.
3. Optionally log a warning.
4. Keep UI usable.
```

---

## 29. Security and Data Safety

### User Input

All user-generated content must be escaped before HTML injection.

User-generated content includes:

- Product names
- Custom field labels
- Custom field values
- Checklist task names
- Search query

### Link Fields

`LINK` field values must be handled safely.

Rules:

- Validate URL format before rendering clickable anchor.
- Use `target="_blank"` only with `rel="noopener noreferrer"`.
- Do not allow `javascript:` links.
- If invalid, render as editable text with error state.

### Storage

Do not store secrets in local storage.

Local storage is acceptable for:

- Product draft state
- Stage blocks
- Custom fields
- Checklist tasks
- UI state

Local storage is not acceptable for:

- API secrets
- Access tokens unless specifically architected with security controls
- Private credentials

---

## 30. Performance Architecture

The application is small enough for full re-rendering after mutations, but components should remain structured for future selective rendering.

Rules:

- Keep canonical `STAGES` outside render loops.
- Keep derived selectors pure.
- Avoid creating duplicate stage arrays.
- Avoid rendering hidden future stages.
- Avoid heavy dependencies.
- Avoid storing derived HTML in state.
- Debounce global search if it becomes expensive.
- Use document fragments or string joins for batch rendering.

Progressive disclosure is also a performance feature: if product is at stage 3, only 3 stage cards are rendered.

---

## 31. CSS and Design Integration

The architecture must preserve the LaunchFlow visual system.

Required design constants:

```txt
Header: sticky top-0 z-50 h-16
Sidebar: w-sidebar_width fixed left-0 top-16 z-20
Workspace: pl-[260px]
Font: Inter, sans-serif
Icons: Material Symbols Outlined
```

Required Material Symbols markup:

```html
<span class="material-symbols-outlined">notifications</span>
```

Rules:

- Do not replace Material Symbols with another icon library.
- Do not hard-code raw hex values inside JS-rendered class strings.
- Use configured Tailwind utilities and semantic tokens where available.
- Centralize global custom styles in `/css/styles.css`.

---

## 32. Testing and Validation Targets

Even if no formal test runner exists initially, Codex must preserve these validation targets.

### Progressive Disclosure Tests

```txt
current_stage_index = 1  -> render 1 stage
current_stage_index = 3  -> render 3 stages
current_stage_index = 14 -> render 14 stages
future stages do not exist in DOM
sidebar and workspace counts match
```

### Custom Field Tests

```txt
Add TEXT field      -> field appears in selected stage only
Add CURRENCY field  -> default value is currency object
Add DATE field      -> renders date input
Invalid type        -> mutation rejected or rendered safely
Empty label         -> mutation rejected
```

### Checklist Tests

```txt
Add task             -> task appears unchecked
Toggle task true     -> strikethrough appears and progress increases
Toggle task false    -> strikethrough removed and progress decreases
Empty task name      -> mutation rejected
Stage progress       -> completed / total calculation is correct
```

### Vercel Safety Tests

```txt
All imports use relative paths
Browser module imports include .js extension
No case mismatch in file imports
index.html loads ./css/styles.css
index.html loads ./js/app.js
Default state renders with no local storage
Malformed local storage does not crash app
```

---

## 33. GitHub Commit Discipline

Every code change must be safe for automatic Vercel preview deployment.

Rules:

- Commit all referenced files.
- Avoid dead imports.
- Avoid renaming files without updating imports.
- Avoid unrelated formatting churn.
- Avoid committing local-only debug paths.
- Avoid environment-dependent code in static modules.
- Keep generated docs synchronized with architecture changes.

Before pushing:

```txt
[ ] index.html references existing relative assets
[ ] app.js imports existing modules with .js extension
[ ] store.js has safe default state
[ ] STAGES has exactly 14 entries
[ ] products normalize to 14 stage blocks
[ ] future stages are not rendered into DOM
[ ] custom fields are nested under stage blocks
[ ] checklist tasks are nested under stage blocks
[ ] checkbox toggles recalculate stage progress
[ ] local storage failure does not crash app
[ ] no raw local filesystem paths exist
```

---

## 34. Non-Negotiable Architectural Invariants

1. `current_stage_index` controls progressive disclosure.
2. Only stages with `stage_index <= current_stage_index` render.
3. Hidden future stages are omitted from the DOM entirely.
4. The canonical stage array has exactly 14 chronological entries.
5. Product entities own exactly 14 normalized stage blocks.
6. Custom fields are nested under `stage_blocks[].custom_fields`.
7. Checklist tasks are nested under `stage_blocks[].checklist_tasks`.
8. Field IDs and task IDs are generated stable identifiers.
9. Field labels and task names are user content, not state keys.
10. Checklist progress is derived from `is_completed` values.
11. Store mutations are immutable.
12. Components render state; they do not own state.
13. `app.js` orchestrates DOM events; `store.js` mutates state.
14. Vercel deployment must work from clean GitHub checkout.
15. Browser module paths must be relative, exact-case, and extension-complete.

---

## 35. Final Architecture Definition

LaunchFlow is a static-first, Vercel-optimized, modular vanilla JavaScript application with a deterministic reactive state engine.

The architecture centers on a single active product object that contains:

- A `current_stage_index` from 1 to 14.
- Fourteen normalized `stage_blocks`.
- Dynamic `custom_fields` nested per stage.
- Dynamic `checklist_tasks` nested per stage.

The rendering engine must use `current_stage_index` to progressively disclose stages and completely omit future stages from the DOM. User actions flow through delegated DOM events into `store.js`, where immutable mutations update the product object and trigger immediate re-rendering of the sidebar, workspace accordions, custom fields, checklists, and progress metrics.

The repository must remain clean, relative-path safe, browser-module safe, and ready for every GitHub push to trigger a reliable Vercel preview deployment.
