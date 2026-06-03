# LaunchFlow Product Specification

## 0. Document Purpose

This `product-spec.md` is the functional specification blueprint for **LaunchFlow**, an Amazon Product Launch Pipeline Web Application used to track product launch progress, stage-specific details, custom fields, and ad-hoc checklist completion through a minimal multi-panel interface.

This document is intended for an AI coding agent operating in a Codex environment. It defines the required layout, interface elements, data behavior, UI visibility rules, and interaction mechanics that must guide implementation.

LaunchFlow is not a generic project dashboard. It is a structured, progressive Amazon product launch operations system built around strict chronological stage disclosure, user-generated metadata, and per-stage checklist execution.

---

## 1. Product Intent

LaunchFlow helps e-commerce teams manage Amazon product launches by exposing only the launch stages that are currently relevant to a product.

The application must reduce clutter by hiding future workflow stages until the product formally advances. Each visible stage acts as a flexible container where users can add unlimited custom data fields and operational checklist tasks.

Core product values:

- Minimal visible complexity
- Strict chronological stage progression
- Dynamic product-specific metadata
- Fast checklist execution
- Clear launch progress visibility
- Persistent structured data
- Production-grade UI behavior
- Predictable multi-panel workspace layout

---

## 2. Primary User Goals

Users must be able to:

1. View the current launch status of a product.
2. See only the stages that are active or historically reached.
3. Advance a product to the next chronological launch stage.
4. Add unlimited custom fields to any visible stage.
5. Select strict custom field types for consistent rendering and persistence.
6. Add ad-hoc checklist tasks to any visible stage.
7. Mark checklist tasks complete or incomplete.
8. See stage progress update immediately after checklist changes.
9. See overall pipeline progress update immediately after stage advancement or checklist completion.
10. Search globally across products, stages, tasks, and custom fields.
11. Access notifications, settings, and user profile actions from the top navigation.

---

## 3. Layout Blueprint

LaunchFlow uses a three-panel application shell:

1. Header / Top Navigation
2. Left Navigation Sidebar
3. Main Workspace
4. Contextual Input Modals or Drawers

Panel 3 is event-driven and appears only when the user starts an input action such as adding a custom field or adding a checklist task, depending on the selected implementation pattern.

---

## 4. Header / Top Navigation

### Purpose

The header provides persistent global application controls.

### Required Position

The header must remain fixed or sticky at the top of the application shell.

Required structural intent:

- Height: `h-16`
- Positioning: `sticky top-0 z-50`
- Full-width top navigation
- Always visible above sidebar and workspace content

### Required Contents

The header must contain:

1. LaunchFlow branding
2. Global application search input
3. Notifications icon
4. Settings icon
5. User profile avatar dropdown

### Branding

Display the product name:

- Text: `LaunchFlow`
- Use strong visual hierarchy
- Recommended typography: `text-headline-md`
- Must use the configured Inter font system

### Global Search Input

The search input must support global application search.

Search scope should include:

- Product names
- Product identifiers
- Visible stage names
- Custom field labels
- Custom field values
- Checklist task names
- Stage status metadata

Search behavior:

- Input should update local query state immediately.
- Search should not mutate product data.
- Search should not reveal hidden future stages.
- Results must respect progressive stage visibility rules.
- If a hidden future stage contains matching data, it must not be displayed until that stage becomes visible.

### Notifications Icon

Use Material Symbols Outlined markup:

```html
<span class="material-symbols-outlined">notifications</span>
```

Behavior:

- Opens notifications menu or drawer.
- Must have accessible label.
- Must not interfere with stage state.

### Settings Icon

Use Material Symbols Outlined markup:

```html
<span class="material-symbols-outlined">settings</span>
```

Behavior:

- Opens settings menu, drawer, or route.
- Must have accessible label.
- Must not mutate active product data unless explicitly saving settings.

### User Profile Avatar Dropdown

Behavior:

- Opens account dropdown.
- Supports keyboard navigation.
- Uses `aria-expanded`.
- Includes profile/account actions as supported by the app.
- Does not affect product launch data.

---

## 5. Panel 1: Left Navigation Sidebar

### Purpose

The sidebar displays the chronological launch stages available for the active product.

### Required Width

Use:

- `w-sidebar_width`
- Width value: 260px

### Required Color

The sidebar background color intent is:

- `#0052cc`

Use the configured Tailwind token or theme utility when available. Do not hard-code raw hex in component markup if a semantic token exists.

### Required Position

The sidebar must be fixed beneath the top header.

Required structural intent:

- `w-sidebar_width`
- `fixed left-0 top-16 z-20`

### Content

The sidebar dynamically lists only the chronological stages up to the active product's `current_active_stage_index`.

Example:

If `current_active_stage_index = 3`, sidebar renders:

1. Product Research
2. Product Development
3. Supplier Sourcing

Sidebar must not render:

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

### Sidebar Stage Item Requirements

Each visible stage item must include:

- Stage label
- Optional stage index
- Active/selected state
- Progress indicator or completion marker when available
- Keyboard-accessible navigation behavior
- `aria-current` when selected

### Sidebar Visibility Rule

The sidebar must derive its stage list from the same visibility function used by the main workspace.

Required logic:

```ts
visibleStages = allStages.filter(stage => stage.index <= activeProduct.current_active_stage_index);
```

Do not create independent sidebar visibility logic.

### Sidebar Non-Negotiables

- Hidden future stages must be completely omitted from the DOM.
- Hidden future stages must not be visually hidden with CSS.
- Hidden future stages must not be disabled placeholders.
- Hidden future stages must not be rendered as locked cards.
- Hidden future stages must not appear in search results, dropdowns, sidebar lists, breadcrumbs, or progress cards.
- Stage ordering must always be chronological.

---

## 6. Panel 2: Main Workspace

### Purpose

The main workspace displays the active product launch dashboard, KPIs, pipeline progress, and visible stage dropdown cards.

### Required Offset

The main workspace must be offset by the sidebar width.

Required structural intent:

- `pl-[260px]`

### Required Content Order

The main workspace must render in this order:

1. Global product launch KPI row
2. Overall pipeline progress meter
3. Cascading list of visible stage dropdown cards

---

## 7. Main Workspace KPI Row

### Purpose

The KPI row summarizes launch operations across the current workspace context.

### Required KPI Cards

The top of the workspace must display:

1. Total Launches
2. Sourcing
3. Active PPC
4. Avg Conversion Rate

### KPI Behavior

KPI cards should be read-only summary components unless a specific interaction is added later.

Expected behavior:

- Render current metric values.
- Show safe empty state values if data is missing.
- Do not block the main workspace if one metric fails to load.
- Use semantic surface tokens.
- Use configured typography utilities.

### KPI Definitions

#### Total Launches

Represents total number of product launch records in the selected workspace or account context.

#### Sourcing

Represents count of products currently in sourcing-related stages.

Sourcing-related stages include:

- Supplier Sourcing
- Under Final Order

Optional extended sourcing interpretation may include Product Development if the product team chooses to treat early development as sourcing preparation.

#### Active PPC

Represents count of launches with active paid advertising or campaign preparation.

Relevant stages include:

- Campaign Prep
- Launch
- Stable
- Scaling

#### Avg Conversion Rate

Represents average conversion rate across active or tracked launches when available.

Rules:

- Display as percentage.
- If unavailable, show an empty state such as `—`.
- Do not crash when conversion rate data is null.

---

## 8. Overall Pipeline Progress Meter

### Purpose

The overall progress meter communicates how far the active product has advanced through the 14-stage launch lifecycle.

### Calculation

Primary progress should be based on the active product's current stage index.

Required calculation:

```ts
overallPipelineProgress = (current_active_stage_index / 14) * 100;
```

Example:

- Stage 1 = 7.14%
- Stage 7 = 50%
- Stage 14 = 100%

### Optional Checklist-Weighted Progress

If a checklist-weighted system is implemented, it must not replace the core stage-index progress unless explicitly requested.

Optional secondary progress:

```ts
checklistCompletionProgress = completedChecklistTasks / totalChecklistTasks;
```

### Display Requirements

The progress meter must show:

- Percentage value
- Current stage label
- Visual progress bar
- Optional text such as `Stage 3 of 14`

### Visibility Constraint

The progress meter may communicate that the product is in stage 3 of 14, but it must not render future stage cards or future stage controls.

---

## 9. Stage System

### Canonical Pipeline

The pipeline consists of 14 strict chronological stages.

Required stage array:

1. Product Research
2. Product Development
3. Supplier Sourcing
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

### Canonical Stage Object

Each stage must have:

- Stable ID
- Human-readable label
- Index from 1 to 14
- Phase value
- Optional description
- Optional progress metadata

Recommended object shape:

```ts
type LaunchStage = {
  id: LaunchStageId;
  index: number;
  label: string;
  phase: "pipeline" | "optimization";
  description?: string;
};
```

### Canonical Stage IDs

Use these stable IDs:

- `product-research`
- `product-development`
- `supplier-sourcing`
- `under-final-order`
- `shipping`
- `keyword-research`
- `listing-creation`
- `image-planning`
- `campaign-prep`
- `amazon-inbound`
- `enrolled-to-vines`
- `launch`
- `stable`
- `scaling`

### Stage ID Rules

- Use IDs for state keys.
- Use IDs for persistence.
- Use IDs for URLs.
- Use labels only for display.
- Never use labels as object keys if IDs are available.
- Never sort stages alphabetically.
- Never allow duplicate stage IDs.

---

## 10. Progressive Stage Disclosure

### Purpose

Progressive Stage Disclosure keeps the dashboard minimal by rendering only the stages the product has reached.

### Core Field

Every active product must track:

```ts
current_active_stage_index: number;
```

Allowed values:

- Minimum: 1
- Maximum: 14

### Visibility Rule

A stage is visible only if:

```ts
stage.index <= activeProduct.current_active_stage_index;
```

A stage is hidden if:

```ts
stage.index > activeProduct.current_active_stage_index;
```

### DOM Rule

Hidden stages must be completely omitted from the DOM.

Not allowed:

- Rendering hidden stages with `display: none`
- Rendering hidden stages with `visibility: hidden`
- Rendering hidden stages as disabled future cards
- Rendering hidden stages as locked placeholders
- Rendering hidden stages in hidden dropdown options
- Rendering hidden stages in searchable content
- Rendering hidden stages in accessible tree
- Rendering hidden stages in offscreen containers

Required implementation pattern:

```tsx
const visibleStages = STAGES.filter(
  stage => stage.index <= activeProduct.current_active_stage_index
);

return visibleStages.map(stage => (
  <StageDropdownCard key={stage.id} stage={stage} />
));
```

### Stage 1 Example

If active product has:

```ts
current_active_stage_index: 1;
```

Render only:

- Product Research

Do not render:

- Product Development
- Supplier Sourcing
- Under Final Order
- Shipping
- Keyword Research
- Listing Creation
- Image Planning
- Campaign Prep
- Amazon Inbound
- Enrolled to Vines
- Launch
- Stable
- Scaling

### Stage 3 Example

If active product has:

```ts
current_active_stage_index: 3;
```

Render only:

- Product Research
- Product Development
- Supplier Sourcing

Do not render stages 4 through 14.

### Stage 14 Example

If active product has:

```ts
current_active_stage_index: 14;
```

Render all stages.

### Advance to Next Stage

Each active product must provide a clear action to advance to the next chronological stage.

Button label:

- `Advance to Next Stage`

Expected behavior:

1. User clicks `Advance to Next Stage`.
2. App validates that `current_active_stage_index < 14`.
3. App increments `current_active_stage_index` by 1.
4. State updates immediately.
5. Sidebar re-renders with the newly visible stage.
6. Main workspace appends the newly visible stage card below prior stages.
7. Overall progress meter updates.
8. Newly revealed stage may optionally animate into view.
9. Data object is persisted locally or remotely depending on configured persistence layer.

Required mutation concept:

```ts
activeProduct.current_active_stage_index = activeProduct.current_active_stage_index + 1;
```

Use immutable state updates in UI frameworks:

```ts
setActiveProduct(prev => ({
  ...prev,
  current_active_stage_index: Math.min(prev.current_active_stage_index + 1, 14),
}));
```

### Advance Button Placement

Recommended placements:

- Top of current active stage card
- Bottom of current active stage card
- Near overall progress meter as a primary workflow action

Rules:

- Do not show `Advance to Next Stage` when product is already at Stage 14.
- Do not allow skipping stages.
- Do not decrement stages unless an explicit rollback feature is implemented.
- Do not reveal multiple stages from a single standard advance click.
- Do not reveal future stages until state changes.

### Smooth Reveal Behavior

When a new stage is revealed:

- It should appear below previously visible stage cards.
- Animation may be used but must not delay state correctness.
- Animation must respect reduced-motion preferences.
- Focus may optionally move to the newly revealed stage header.
- The reveal must be based on actual data state, not temporary UI-only state.

---

## 11. Visible Stage Dropdown Cards

### Purpose

Each visible stage is represented by an expandable accordion/dropdown card.

### Required Card Contents

Each stage dropdown card must contain:

1. Stage header
2. Expand/collapse control
3. Stage progress indicator
4. Dynamic custom fields area
5. `+ Add Custom Field` action
6. Ad-hoc checklist area at the absolute bottom
7. Add task input and submit button
8. Existing checklist items for that stage
9. Optional `Advance to Next Stage` action if this is the current active stage

### Stage Header

The stage header must display:

- Stage index
- Stage label
- Stage progress percentage
- Expand/collapse icon
- Optional completion count

Example display:

```txt
Stage 3 · Supplier Sourcing · 67%
```

### Accordion Behavior

Rules:

- Stage card can expand and collapse.
- Collapsed state hides custom fields and checklist details.
- Collapsed state must still show stage label and progress.
- Accordion state must not affect whether a stage is considered visible.
- Future stages must not exist even if accordion logic attempts to reference them.

### Stage Progress

Stage progress is based on checklist completion within the stage.

Required calculation:

```ts
stageProgress = completedTasksForStage / totalTasksForStage;
```

Display:

- If no tasks exist, show `0%` or `No tasks yet`.
- If all tasks are completed, show `100%`.
- Recalculate immediately when checklist item completion changes.

### Stage Card Empty State

If a visible stage has no custom fields and no checklist tasks:

- Show minimal empty-state guidance.
- Do not render default text fields.
- Do not prepopulate field rows.
- Do not show fake placeholder checklist tasks.

Example empty message:

```txt
Add custom fields or checklist tasks to start tracking this stage.
```

---

## 12. Dynamic Infinite Custom Fields

### Purpose

Custom fields let users define product-stage-specific metadata without hardcoded form inputs.

### Core Rule

Dropdown details must contain zero hardcoded text inputs for product metadata.

No default fields should be pre-rendered inside stage cards.

Every field must be user-created through `+ Add Custom Field`.

### Add Custom Field Action

Every visible stage dropdown card must include:

- Button label: `+ Add Custom Field`

Button behavior:

1. User clicks `+ Add Custom Field`.
2. App opens an inline config menu, modal, or drawer.
3. User enters `Field Name`.
4. User selects `Field Type`.
5. User saves.
6. App creates a custom field object under that stage.
7. App renders the appropriate input component for that field type.
8. App persists the updated active product data object.

### Field Config Inputs

The configuration UI must ask for:

1. Field Name
2. Field Type

### Field Name Rules

Field name must:

- Be user-entered.
- Be required.
- Be trimmed before save.
- Be unique within the same stage when practical.
- Be allowed to repeat across different stages.
- Not be used as the stable field ID.
- Render as the field label.

If duplicate labels are allowed, the implementation must still assign unique field IDs.

### Field Type Dropdown

Field type must be selected from this strict list:

1. `TEXT`
2. `NUMBER`
3. `LINK`
4. `CURRENCY`
5. `WEIGHT`
6. `SIZING`
7. `DATE`

No other field type may be added unless the product specification is updated.

### Field Type Behavior

#### TEXT

Purpose:

- Plain alphanumeric string.

Rendering:

- Text input or textarea depending on implementation.
- Stores string values.

Value examples:

- Supplier contact note
- Product idea
- Manufacturing comment

Expected value shape:

```ts
value: string;
```

#### NUMBER

Purpose:

- Float or integer values.

Rendering:

- Numeric input.
- May support decimal precision.

Value examples:

- MOQ
- Unit count
- Sample quantity

Expected value shape:

```ts
value: number | null;
```

Validation:

- Must reject non-numeric values.
- Empty value should persist as null or empty according to schema.

#### LINK

Purpose:

- Clickable URL anchor tags.

Rendering:

- URL input.
- Display saved valid URL as clickable anchor.
- Anchor should open safely.

Expected anchor behavior:

- Use `target="_blank"` when opening new tab.
- Use `rel="noopener noreferrer"`.

Expected value shape:

```ts
value: string;
```

Validation:

- Must validate basic URL structure.
- Invalid URLs should show inline error state.
- Do not crash on malformed links.

#### CURRENCY

Purpose:

- Formatted financial values with symbols.

Rendering:

- Numeric input with currency selector or fixed currency symbol.
- Display formatted financial value.

Expected value shape:

```ts
value: number | null;
currencyCode?: string;
```

Examples:

- `$12.50`
- `USD 1,500.00`

Validation:

- Must store numeric value separately from formatted display when possible.
- Must support integer and decimal values.

#### WEIGHT

Purpose:

- Numerical values tied to mass unit strings.

Rendering:

- Numeric input plus unit selector or unit text.
- Supported units should be explicit.

Recommended units:

- `g`
- `kg`
- `oz`
- `lb`

Expected value shape:

```ts
value: number | null;
unit: "g" | "kg" | "oz" | "lb";
```

Validation:

- Numeric value required for completed field.
- Unit must be one of allowed unit strings.

#### SIZING

Purpose:

- Dimensions or package sizing formats.

Rendering:

- Structured dimension inputs or flexible sizing text input.
- Preferred structured format includes length, width, height, and unit.

Recommended units:

- `cm`
- `in`

Expected value shape:

```ts
length?: number | null;
width?: number | null;
height?: number | null;
unit?: "cm" | "in";
raw?: string;
```

Validation:

- Must support partial input without crashing.
- Display should remain readable.

#### DATE

Purpose:

- Native date-picker element.

Rendering:

- Native date input.

Expected markup behavior:

```html
<input type="date" />
```

Expected value shape:

```ts
value: string;
```

Storage format:

- Prefer ISO-like date string: `YYYY-MM-DD`

Validation:

- Empty date is allowed until user selects value.
- Invalid date strings must not crash rendering.

---

## 13. Custom Field Data Structure

### Stage-Nested Storage Requirement

Custom fields must be stored as arrays of objects nested under their respective stage keys within the active product schema object.

Required concept:

```ts
activeProduct.stageData[stageId].customFields;
```

### Recommended Shape

```ts
type CustomFieldType =
  | "TEXT"
  | "NUMBER"
  | "LINK"
  | "CURRENCY"
  | "WEIGHT"
  | "SIZING"
  | "DATE";

type CustomField = {
  id: string;
  stageId: LaunchStageId;
  label: string;
  type: CustomFieldType;
  value: unknown;
  createdAt: string;
  updatedAt: string;
};

type StageData = {
  customFields: CustomField[];
  checklistTasks: ChecklistTask[];
  accordionOpen?: boolean;
};

type ActiveProduct = {
  id: string;
  name: string;
  current_active_stage_index: number;
  stageData: Record<LaunchStageId, StageData>;
};
```

### Field Creation Rules

When saving a new custom field:

1. Generate stable unique field ID.
2. Use selected stage ID.
3. Store trimmed label.
4. Store selected type.
5. Initialize value according to type.
6. Append to `stageData[stageId].customFields`.
7. Persist active product object.
8. Re-render stage field list.

### Initial Values by Type

Recommended defaults:

- `TEXT`: empty string
- `NUMBER`: null
- `LINK`: empty string
- `CURRENCY`: `{ value: null, currencyCode: "USD" }`
- `WEIGHT`: `{ value: null, unit: "lb" }`
- `SIZING`: `{ length: null, width: null, height: null, unit: "in", raw: "" }`
- `DATE`: empty string

### Field Update Rules

When a user edits a custom field value:

- Update only that field object.
- Do not mutate other fields.
- Do not mutate checklist tasks.
- Preserve field ID and type.
- Update `updatedAt`.
- Re-render the field display immediately.
- Persist the updated active product object.

### Field Deletion Rules

If delete behavior is implemented:

- Confirm destructive action when appropriate.
- Remove only the selected field from the stage's custom field array.
- Do not remove the stage.
- Do not remove checklist tasks.
- Recalculate no checklist progress unless checklist data changed.

---

## 14. Contextual Input Modals / Drawers

### Purpose

Panel 3 handles action-specific data entry.

It may be implemented as:

- Inline config menu
- Popover
- Drawer
- Modal

The chosen implementation must be consistent with the existing UI architecture.

### Triggering Actions

Panel 3 is triggered by:

1. `+ Add Custom Field`
2. `+ Add Task` when using expanded task configuration
3. Optional edit field action
4. Optional edit task action

### Add Custom Field Panel

Required inputs:

- Field Name
- Field Type dropdown

Required actions:

- Save
- Cancel

Save behavior:

- Validate field name.
- Validate field type.
- Append field to selected stage.
- Close panel.
- Reset temporary form state.
- Preserve accordion open state.

Cancel behavior:

- Close panel.
- Discard unsaved temporary input.
- Do not mutate active product data.

### Add Task Panel

The default implementation should keep Add Task inline at the bottom of the stage dropdown.

A modal/drawer may be used only if task creation becomes more complex.

Minimum task input:

- Task name

Required actions:

- Add Task
- Optional Cancel if modal/drawer is used

---

## 15. Ad-Hoc Stage Checklists

### Purpose

Each visible stage has a flexible checklist at the bottom of its dropdown to track operational work.

### Placement

The checklist must appear at the absolute bottom of every visible stage dropdown menu.

Within the stage card content, order should be:

1. Custom fields
2. Add custom field action
3. Checklist section
4. Add task input
5. Task list or task list plus input, depending on layout

The checklist must remain stage-specific.

### Add Task UI

Each visible stage checklist must include:

- Text input field
- `+ Add Task` submit button

Behavior:

1. User types a task name.
2. User clicks `+ Add Task` or presses Enter if supported.
3. App validates non-empty task text.
4. App creates a checklist task object.
5. App appends task to the selected stage's `checklistTasks` array.
6. App clears the input.
7. App updates stage progress.
8. App updates global metrics if affected.
9. App persists active product object.

### Checklist Item UI

Each checklist item must include:

- Custom checkbox input
- Task name
- Completion visual state
- Optional created timestamp
- Optional delete action
- Optional edit action

### Checkbox Behavior

When checkbox is checked:

- Task `completed` value becomes true.
- Task text receives visual strikethrough.
- Stage progress recalculates instantly.
- Overall derived metrics update instantly.
- Product data persists.

When checkbox is unchecked:

- Task `completed` value becomes false.
- Strikethrough is removed.
- Stage progress recalculates instantly.
- Overall derived metrics update instantly.
- Product data persists.

### Strikethrough Animation

Completion state should visually communicate success.

Expected behavior:

- Text transitions to completed state.
- Strikethrough appears.
- Opacity may reduce if consistent with design tokens.
- Animation must not block data mutation.
- Must respect reduced-motion preferences.

### Empty Checklist State

If no checklist tasks exist:

- Show compact empty state.
- Keep Add Task input visible.
- Do not pre-render fake tasks.

Example:

```txt
No tasks yet. Add the first checklist item for this stage.
```

---

## 16. Checklist Data Structure

### Stage-Nested Storage Requirement

Checklist tasks must be stored as arrays of objects nested under their respective stage keys within the active product schema object.

Required concept:

```ts
activeProduct.stageData[stageId].checklistTasks;
```

### Recommended Shape

```ts
type ChecklistTask = {
  id: string;
  stageId: LaunchStageId;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};
```

### Task Creation Rules

When adding a task:

1. Generate stable unique task ID.
2. Use selected stage ID.
3. Trim task title.
4. Reject empty titles.
5. Initialize `completed` as false.
6. Set `createdAt`.
7. Set `updatedAt`.
8. Set `completedAt` as null.
9. Append to `stageData[stageId].checklistTasks`.
10. Recalculate progress.
11. Persist active product.

### Task Toggle Rules

When toggling a task:

1. Locate task by stage ID and task ID.
2. Invert `completed`.
3. Update `updatedAt`.
4. Set `completedAt` if completed.
5. Clear `completedAt` if reopened.
6. Recalculate stage progress.
7. Recalculate relevant global metrics.
8. Persist active product.

### Task Delete Rules

If deletion is implemented:

- Remove only selected task.
- Recalculate stage progress.
- Do not remove custom fields.
- Do not remove stage data.
- Persist active product.

---

## 17. Active Product Data Model

### Required Active Product Concept

The UI must mutate a localized data object representing the active product.

This object must be the source of truth for:

- Current active stage index
- Visible stages
- Stage custom fields
- Stage checklist tasks
- Stage progress
- Overall pipeline progress

### Recommended Active Product Shape

```ts
type ActiveProduct = {
  id: string;
  name: string;
  sku?: string;
  asin?: string;
  current_active_stage_index: number;
  stageData: Record<LaunchStageId, StageData>;
  createdAt: string;
  updatedAt: string;
};
```

### Required Stage Data Shape

```ts
type StageData = {
  customFields: CustomField[];
  checklistTasks: ChecklistTask[];
  accordionOpen?: boolean;
};
```

### Persistence Compatibility

The schema must remain compatible with:

- Local component state
- Browser local storage
- Database persistence
- JSON serialization
- API transport
- Future backend services

Data must avoid non-serializable values such as:

- Functions
- DOM nodes
- Class instances
- Circular references
- Date objects that are not serialized

Use strings for timestamps.

---

## 18. State Mutation Expectations

### Core Rule

UI events must immediately mutate localized active product state through safe immutable updates.

### Required Event Sources

State mutations occur from:

- Advancing to next stage
- Adding a custom field
- Updating a custom field value
- Deleting a custom field if supported
- Adding a checklist task
- Toggling checklist task completion
- Deleting checklist task if supported
- Expanding/collapsing a visible stage accordion

### Immutable Update Requirement

Do not mutate nested arrays or objects directly.

Avoid:

```ts
activeProduct.stageData[stageId].checklistTasks.push(newTask);
```

Prefer:

```ts
setActiveProduct(prev => ({
  ...prev,
  stageData: {
    ...prev.stageData,
    [stageId]: {
      ...prev.stageData[stageId],
      checklistTasks: [
        ...prev.stageData[stageId].checklistTasks,
        newTask,
      ],
    },
  },
}));
```

### Re-render Requirement

Every state update must cause the conditional DOM to re-render to match current visibility constraints.

Required after stage advancement:

- Newly visible stage appears.
- Sidebar updates.
- Progress meter updates.
- Future stages beyond new index remain omitted.

Required after checklist toggle:

- Checkbox state updates.
- Text completion style updates.
- Stage progress updates.
- Relevant KPI/progress values update.

Required after custom field creation:

- New field input appears in selected stage.
- No other stage is affected.
- Field config UI closes or resets.

---

## 19. Derived Data

### Visible Stages

```ts
visibleStages = STAGES.filter(stage => stage.index <= current_active_stage_index);
```

### Current Active Stage

```ts
currentStage = STAGES.find(stage => stage.index === current_active_stage_index);
```

### Next Stage

```ts
nextStage = STAGES.find(stage => stage.index === current_active_stage_index + 1);
```

If no next stage exists, product is at final stage.

### Stage Checklist Progress

```ts
totalTasks = stageData[stageId].checklistTasks.length;
completedTasks = stageData[stageId].checklistTasks.filter(task => task.completed).length;
stageProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
```

### Overall Pipeline Progress

```ts
overallPipelineProgress = Math.round((current_active_stage_index / 14) * 100);
```

### Global Checklist Progress

Optional:

```ts
allVisibleTasks = visibleStages.flatMap(stage => stageData[stage.id].checklistTasks);
completedVisibleTasks = allVisibleTasks.filter(task => task.completed);
globalChecklistProgress =
  allVisibleTasks.length === 0
    ? 0
    : Math.round((completedVisibleTasks.length / allVisibleTasks.length) * 100);
```

---

## 20. Interaction Flow: Advance Stage

### User Story

As a launch manager, I want to advance a product to the next stage so that the next relevant workflow section becomes available without cluttering the dashboard with future stages.

### Trigger

User clicks:

```txt
Advance to Next Stage
```

### Preconditions

- Active product exists.
- `current_active_stage_index` is between 1 and 14.
- Product is not already at stage 14.

### Flow

1. User clicks advance button.
2. App checks current index.
3. If current index is less than 14, increment by 1.
4. Persist updated active product.
5. Recompute visible stages.
6. Render newly visible stage below prior stages.
7. Update sidebar.
8. Update progress meter.
9. Optionally focus the new stage header.
10. Optionally animate reveal.

### Edge Cases

- If current index is 14, hide or disable advance button.
- If current index is invalid, clamp to valid range.
- If active product is missing, show safe empty state.
- If persistence fails, show non-blocking error and preserve local UI state if appropriate.

### Acceptance Criteria

- Future stage is absent before advancement.
- Next stage appears immediately after advancement.
- No stages are skipped.
- No hidden stages appear in DOM.
- Progress meter updates correctly.
- Sidebar updates correctly.

---

## 21. Interaction Flow: Add Custom Field

### User Story

As a launch manager, I want to define custom fields inside any visible stage so that I can track product-specific launch metadata without relying on hardcoded forms.

### Trigger

User clicks:

```txt
+ Add Custom Field
```

### Preconditions

- Stage is visible.
- Stage exists in canonical stage array.
- Active product has initialized `stageData` for the stage.

### Flow

1. User clicks `+ Add Custom Field`.
2. Config UI opens inline, in a modal, or in a drawer.
3. User enters Field Name.
4. User selects Field Type.
5. User clicks Save.
6. App validates Field Name and Field Type.
7. App creates custom field object.
8. App appends field to selected stage's `customFields` array.
9. App renders the field input according to selected type.
10. App resets temporary config state.
11. App persists active product.

### Validation

Field Name:

- Required
- Trimmed
- Cannot be empty after trimming

Field Type:

- Required
- Must be one of:
  - `TEXT`
  - `NUMBER`
  - `LINK`
  - `CURRENCY`
  - `WEIGHT`
  - `SIZING`
  - `DATE`

### Edge Cases

- If user cancels, no field is created.
- If field label is duplicated, still generate unique ID.
- If stage becomes hidden due to product switch, close config UI.
- If active product changes while config UI is open, discard temporary input or rebind safely.
- If persistence fails, show recoverable error state.

### Acceptance Criteria

- No default fields render before user creates them.
- Field appears only in selected stage.
- Field type controls rendered input behavior.
- Field persists under correct stage key.
- Hidden stages cannot receive fields through UI.
- Adding a field does not affect checklist progress.

---

## 22. Interaction Flow: Update Custom Field Value

### User Story

As a launch manager, I want to edit custom field values so that stage-specific launch metadata stays current.

### Trigger

User changes a rendered custom field input.

### Preconditions

- Field exists.
- Stage is visible.
- Field belongs to selected stage.

### Flow

1. User edits value.
2. App validates or normalizes based on field type.
3. App updates field object immutably.
4. App updates `updatedAt`.
5. App persists active product.
6. UI re-renders with updated value.

### Acceptance Criteria

- Only selected field changes.
- Field type remains stable.
- Invalid values show inline feedback when applicable.
- App does not crash on partial input.
- Data remains JSON-serializable.

---

## 23. Interaction Flow: Add Checklist Task

### User Story

As a launch manager, I want to add checklist tasks to any visible stage so that I can track operational work as it emerges.

### Trigger

User types a task and clicks:

```txt
+ Add Task
```

### Preconditions

- Stage is visible.
- Task input is non-empty after trimming.
- Active product has initialized `stageData` for the stage.

### Flow

1. User types task name.
2. User clicks `+ Add Task`.
3. App validates task name.
4. App creates checklist task object.
5. App appends task to selected stage's `checklistTasks` array.
6. App clears task input.
7. App recalculates stage progress.
8. App recalculates relevant global progress metrics.
9. App persists active product.
10. UI renders new unchecked task.

### Edge Cases

- Empty task names are rejected.
- Duplicate task names are allowed unless product rules later prohibit them.
- Very long task names should wrap or truncate gracefully.
- Hidden stages cannot receive tasks through UI.
- Persistence failure should not crash the stage card.

### Acceptance Criteria

- Task appears immediately.
- Task is nested under correct stage key.
- Task begins unchecked.
- Stage progress updates.
- Add Task input clears after success.
- No future stages are revealed by adding tasks.

---

## 24. Interaction Flow: Toggle Checklist Task

### User Story

As a launch manager, I want to check off completed tasks so that LaunchFlow immediately updates stage progress and visually confirms completion.

### Trigger

User clicks a checklist checkbox.

### Preconditions

- Task exists.
- Stage is visible.
- Task belongs to selected stage.

### Flow

1. User checks or unchecks checkbox.
2. App updates task `completed`.
3. App updates `completedAt`.
4. App updates `updatedAt`.
5. App recalculates stage progress.
6. App recalculates global checklist metrics.
7. App applies or removes visual strikethrough.
8. App persists active product.

### Visual Completion Behavior

Checked task:

- Checkbox is selected.
- Text has strikethrough.
- Completion style animates if motion is allowed.
- Stage progress increases.

Unchecked task:

- Checkbox is cleared.
- Text returns to active style.
- Stage progress decreases.

### Acceptance Criteria

- Completion toggles instantly.
- Strikethrough reflects state.
- Stage progress changes immediately.
- Data persists under correct stage.
- Toggling one task does not affect other tasks.

---

## 25. Component Inventory

### Application Shell Components

#### `AppShell`

Responsibilities:

- Own top-level layout.
- Render Header.
- Render Sidebar.
- Render Main Workspace.
- Provide contextual panel slot if needed.

Must not:

- Hard-code stage-specific forms.
- Own detailed custom field rendering logic if separable.

#### `HeaderNav`

Responsibilities:

- Render branding.
- Render global search.
- Render notification control.
- Render settings control.
- Render user avatar dropdown.

Must not:

- Mutate stage data.
- Reveal hidden stages.

#### `StageSidebar`

Responsibilities:

- Render visible stage navigation.
- Indicate selected stage.
- Reflect progressive disclosure.
- Use canonical visible stage selector.

Must not:

- Render hidden future stages.
- Maintain independent stage order.

#### `MainWorkspace`

Responsibilities:

- Render KPI row.
- Render pipeline progress meter.
- Render visible stage dropdown cards.
- Handle empty active product state.

Must not:

- Directly define canonical stages if constants already exist elsewhere.
- Render hidden future stages.

---

## 26. Feature Components

#### `KpiSummaryRow`

Renders:

- Total Launches
- Sourcing
- Active PPC
- Avg Conversion Rate

Rules:

- Must handle missing values.
- Must be read-only by default.

#### `PipelineProgressMeter`

Renders:

- Overall stage-index progress
- Current stage label
- Stage count text

Rules:

- Must use `current_active_stage_index`.
- Must not require future stage DOM nodes.

#### `StageDropdownCard`

Props should include:

- `stage`
- `stageData`
- `isCurrentStage`
- `stageProgress`
- `onAddCustomField`
- `onUpdateCustomField`
- `onAddTask`
- `onToggleTask`
- `onAdvanceStage`

Responsibilities:

- Render one visible stage.
- Own expand/collapse UI.
- Render custom fields.
- Render Add Custom Field action.
- Render checklist at bottom.
- Render Add Task input.
- Render Advance button if applicable.

Must not:

- Render if stage is hidden.
- Fetch product data directly.
- Own global product state if state is centralized.

#### `CustomFieldConfigPanel`

Responsibilities:

- Capture field name.
- Capture field type.
- Validate input.
- Submit field creation request.
- Cancel cleanly.

#### `CustomFieldRenderer`

Responsibilities:

- Render correct input for field type.
- Normalize value changes.
- Emit field update events.
- Display validation errors.

#### `StageChecklist`

Responsibilities:

- Render checklist tasks for one stage.
- Render Add Task input.
- Render checklist items.
- Emit add/toggle/delete events.
- Show empty state.

#### `ChecklistItem`

Responsibilities:

- Render checkbox.
- Render task title.
- Apply completion style.
- Emit toggle event.
- Optionally render edit/delete controls.

---

## 27. Technical Expectations

### Localized Active Product Mutation

The UI must use a localized data object representing the active product.

The active product object is the immediate state source for:

- Stage visibility
- Stage data
- Custom fields
- Checklist tasks
- Stage progress
- Overall progress

All core interactions must update this object first.

Persistence may happen after local state mutation.

### State Update Priority

Order of operations:

1. Validate user input.
2. Update local active product state.
3. Recompute derived UI.
4. Render updated DOM.
5. Persist state.
6. Show success/error feedback if needed.

### Persistence Compatibility

The active product schema must support:

- Local storage
- Remote database
- Serverless API
- JSON document persistence
- Versioned future migrations

### Conditional DOM Re-rendering

The DOM must always reflect:

```ts
current_active_stage_index;
```

If this value changes:

- Visible stage list must update.
- Sidebar list must update.
- Workspace stage cards must update.
- Search scope must update.
- Progress must update.

No independent UI flag should reveal future stages without updating the product's active stage index.

---

## 28. Initialization Rules

### Active Product Initialization

When creating or loading an active product:

- Ensure `current_active_stage_index` exists.
- Clamp invalid index to 1 through 14.
- Ensure `stageData` exists.
- Ensure each canonical stage ID has initialized stage data.
- Ensure `customFields` is an array.
- Ensure `checklistTasks` is an array.

Recommended normalization:

```ts
function normalizeActiveProduct(product) {
  return {
    ...product,
    current_active_stage_index: clamp(product.current_active_stage_index ?? 1, 1, 14),
    stageData: initializeStageData(product.stageData),
  };
}
```

### Stage Data Initialization

Every stage key may be initialized for persistence compatibility, but only visible stages may render.

Allowed:

- Data object contains all stage keys.

Required:

- DOM renders only visible stages.

This distinction is critical.

---

## 29. Search Behavior

### Scope

Global search should search active and visible data only unless a future product requirement explicitly allows hidden-stage search.

Searchable visible data:

- Visible stage labels
- Visible custom field labels
- Visible custom field values
- Visible checklist task titles

### Hidden Stage Constraint

Search must not reveal or expose hidden future stages.

If a hidden future stage contains matching persisted data, do not show it until:

```ts
stage.index <= current_active_stage_index;
```

### Search UI Behavior

- Search query updates immediately.
- Results should be filtered from visible stage data.
- Empty results should show a minimal empty state.
- Search must not mutate active product data.

---

## 30. Accessibility Requirements

### Global Requirements

- Use semantic HTML.
- Use buttons for actions.
- Use links for navigation.
- Use labels for inputs.
- Use accessible names for icon-only buttons.
- Preserve keyboard navigation.
- Preserve visible focus states.
- Do not use clickable divs for primary actions.
- Do not hide focus outlines without replacement.

### Accordion Accessibility

Stage dropdown cards should support:

- `aria-expanded`
- `aria-controls`
- Keyboard activation
- Clear focus state

### Custom Field Config Accessibility

The field configuration UI must include:

- Label for Field Name
- Label for Field Type
- Error message association where applicable
- Save and Cancel buttons

### Checklist Accessibility

Each checklist item must include:

- Native checkbox input or fully accessible custom checkbox
- Associated task label
- Keyboard toggle support
- Clear checked state

### Modal / Drawer Accessibility

If Panel 3 uses a modal:

- Provide dialog role.
- Provide accessible title.
- Manage focus.
- Support Escape close.
- Prevent focus loss.

If Panel 3 uses a drawer:

- Provide accessible title.
- Provide close button.
- Do not trap focus unless drawer is modal.

---

## 31. Motion and Animation

### Smooth Stage Reveal

When advancing stages:

- Newly visible stage may animate into view.
- Animation should be subtle.
- Must respect reduced-motion preferences.
- DOM correctness must not depend on animation.

### Checklist Completion Animation

When checking a task:

- Apply strikethrough transition.
- Optional opacity shift.
- Optional checkmark animation.
- Must not delay state update.

### Reduced Motion

If reduced motion is enabled:

- Disable non-essential transitions.
- Keep state changes immediate.

---

## 32. Empty, Loading, and Error States

### No Active Product

Display:

```txt
Select or create a product launch to begin.
```

Do not render stage cards without an active product.

### Loading Active Product

Display skeletons or compact loading state for:

- KPI row
- Progress meter
- Stage list

Do not render incorrect placeholder stages.

### No Custom Fields

Display:

```txt
No custom fields yet.
```

Keep `+ Add Custom Field` visible.

### No Checklist Tasks

Display:

```txt
No tasks yet. Add the first checklist item for this stage.
```

Keep Add Task input visible.

### Persistence Error

Display non-blocking error:

```txt
Changes are saved locally but could not sync yet.
```

or:

```txt
Could not save changes. Please retry.
```

Do not crash or erase unsaved local state automatically.

---

## 33. Validation Rules

### `current_active_stage_index`

- Must be number.
- Must be integer.
- Must be clamped from 1 to 14.
- Must not be null in normalized active product state.

### Field Name

- Required.
- Trim whitespace.
- Reject empty string.
- Store as label.
- Do not use as stable ID.

### Field Type

- Required.
- Must match strict enum:
  - `TEXT`
  - `NUMBER`
  - `LINK`
  - `CURRENCY`
  - `WEIGHT`
  - `SIZING`
  - `DATE`

### Task Name

- Required.
- Trim whitespace.
- Reject empty string.
- Store as task title.

### URL Field

- Must validate before rendering as clickable anchor.
- Malformed links must not crash UI.

### Numeric Fields

- Must handle empty state.
- Must reject invalid non-numeric value.
- Must preserve decimal support where applicable.

---

## 34. Design System Requirements

LaunchFlow must use the configured Tailwind and Material Design 3-inspired utility system.

### Required Font

- Inter, sans-serif

### Required Text Utilities

Use:

- `text-headline-md`
- `text-body-md`
- `text-label-md`
- `text-label-sm`

### Required Icon System

Use Material Symbols Outlined:

```html
<span class="material-symbols-outlined">icon_name</span>
```

### Required Layout Utilities

Use:

- `w-sidebar_width`
- `px-lg`
- `gap-md`
- `pl-[260px]`

### Required Surface Tokens

Use configured surface tokens:

- `bg-surface-container-lowest`
- `bg-surface-container-low`

### Color Intent

Key theme color intents:

- Primary: `#003d9b`
- Sidebar Background: `#0052cc`
- Background: `#f8f9fb`
- Surface lowest: `#ffffff`
- Surface low: `#f3f4f6`

Use semantic tokens or configured utilities in implementation. Avoid hard-coded component colors when theme tokens exist.

---

## 35. Non-Negotiable UI Rules

1. The sidebar must list only visible stages.
2. The workspace must render only visible stages.
3. Future stages must be omitted from DOM.
4. No default custom fields may appear in stage dropdowns.
5. Users must create every metadata field manually.
6. Every visible stage must support `+ Add Custom Field`.
7. Every visible stage must support ad-hoc checklist task creation.
8. Checklist tasks must be nested under stage keys.
9. Custom fields must be nested under stage keys.
10. Checking a task must instantly update progress.
11. Advancing a stage must reveal exactly one next stage.
12. Stage order must always follow the canonical 14-stage sequence.
13. Hidden stages must not appear in search results.
14. UI state must remain persistence-compatible.
15. Layout must preserve header, sidebar, and workspace structure.

---

## 36. Anti-Patterns

Do not implement:

- Rendering all 14 stages and hiding future stages with CSS
- Disabled future-stage placeholders
- Locked future-stage preview cards
- Hardcoded metadata input fields inside stages
- Stage-specific static forms
- Checklist tasks stored outside their stage
- Custom fields stored globally without stage association
- Labels used as persistent IDs
- Alphabetical stage sorting
- Unbounded stage indexes
- Direct nested state mutation
- Search results exposing hidden future stages
- Advance button that skips multiple stages
- Future stage dropdowns in the sidebar
- Modal state that mutates product data before Save
- Checklist progress that updates only after page refresh

---

## 37. Acceptance Criteria Summary

### Layout

- Header contains LaunchFlow branding, search, notifications, settings, and avatar dropdown.
- Sidebar is 260px wide and uses the sidebar blue color intent.
- Main workspace is offset by 260px.
- KPI row appears at top of workspace.
- Overall progress meter appears below KPI row.
- Visible stage dropdown cards render below progress meter.

### Progressive Disclosure

- Active product has `current_active_stage_index`.
- UI renders stages where `stage.index <= current_active_stage_index`.
- Future stages are omitted from DOM.
- `Advance to Next Stage` increments stage index by one.
- New stage appears immediately after advancement.
- Stage 14 hides the advance action.

### Dynamic Custom Fields

- No default metadata fields render.
- Each visible stage has `+ Add Custom Field`.
- Field config asks for Field Name and Field Type.
- Field Type dropdown contains only TEXT, NUMBER, LINK, CURRENCY, WEIGHT, SIZING, DATE.
- Saved fields render appropriate input controls.
- Fields persist under `activeProduct.stageData[stageId].customFields`.

### Ad-Hoc Checklists

- Checklist appears at bottom of every visible stage dropdown.
- Each checklist has task input and `+ Add Task`.
- Added tasks appear immediately.
- Tasks include checkbox input.
- Checking tasks applies strikethrough.
- Checking tasks updates stage progress instantly.
- Tasks persist under `activeProduct.stageData[stageId].checklistTasks`.

### Technical

- State updates are immutable.
- Data remains JSON-serializable.
- UI re-renders from active product state.
- Hidden stages remain hidden after search/filtering.
- Missing data is normalized safely.
- Production UI avoids crashes from null or malformed values.

---

## 38. Final Product Definition

LaunchFlow is a progressive Amazon product launch pipeline interface.

Its defining mechanics are:

1. A strict 14-stage launch lifecycle.
2. A product-level `current_active_stage_index`.
3. Complete DOM omission of unreached future stages.
4. User-generated custom fields inside visible stages.
5. Strict custom field types.
6. Ad-hoc stage checklists.
7. Instant checklist-based progress updates.
8. A fixed multi-panel layout optimized for focused launch execution.

Every implementation decision must protect these mechanics.
