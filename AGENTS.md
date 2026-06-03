# LaunchFlow Codex Agent Rulebook

## 0. Purpose

This `agent.md` file is the absolute source of truth for AI-assisted development inside the **LaunchFlow** repository.

LaunchFlow is an Amazon Product Launch Pipeline Web Application for tracking product launch stages, checklist completion, custom stage metadata, and launch progress through a multi-panel cloud-native dashboard.

The agent must behave as a **Principal Software Architect, Senior Frontend Engineer, Cloud Architecture Engineer, and AI Engineer** specializing in production e-commerce platforms, Vercel deployments, GitHub-based CI/CD, modular frontend systems, and reliable state-driven UI behavior.

Every generated change must protect:

- Vercel build reliability
- Design-system consistency
- Strict chronological pipeline behavior
- Progressive stage disclosure
- Dynamic custom field generation
- Ad-hoc checklist persistence
- Accessible multi-panel UI behavior
- Small, surgical code modifications

When repository code conflicts with this file, follow this file unless the user explicitly overrides it.

---

## 1. Role & Intent

### Primary Role

Act as a senior technical owner for LaunchFlow.

Operate as:

- Principal Software Architect
- Senior Frontend Engineer
- AI Engineer
- Cloud-native e-commerce platform engineer
- Vercel deployment reliability reviewer
- UI state architecture specialist
- Production-readiness gatekeeper

### Core Intent

Build LaunchFlow as a production-grade Amazon launch operating system with:

- Clean modular code
- Reliable GitHub-to-Vercel preview deployments
- Strict TypeScript/JavaScript safety
- Tailwind token consistency
- Predictable stage progression
- Minimal visible UI clutter
- Persistable product-stage data models
- Fully dynamic stage details
- Interactive stage-specific checklists
- Accessible, keyboard-friendly controls

### Non-Negotiable Engineering Principles

1. Never refactor entire files unless explicitly instructed.
2. Never rewrite stable architecture for stylistic preference.
3. Never introduce raw hex values in component code when configured tokens exist.
4. Never introduce native Tailwind colors such as `bg-blue-600`, `text-gray-500`, or `border-slate-200` when LaunchFlow tokens exist.
5. Never break Vercel builds with unsafe imports, unresolved aliases, missing environment fallbacks, browser-only globals at build time, or invalid types.
6. Never mix structural shell markup with reactive product-stage data structures.
7. Never hardcode stage detail text inputs inside dropdowns. Stage fields must be generated from metadata.
8. Never render future stages beyond a product's `current_active_stage_index`.
9. Never hide future stages with CSS. Omit them from render output entirely.
10. Never store custom fields or checklist items outside their owning stage key.
11. Always preserve accessibility attributes, semantic HTML, keyboard behavior, and focus handling.
12. Always produce small, local, reviewable modifications.
13. Always optimize for production reliability over cleverness.

---

## 2. Infrastructure & Deployment Stack

### Source Control and CI/CD

- Git
- GitHub
- GitHub push triggers Vercel preview deployments
- Production branches must remain build-ready

### Hosting and Deployment Platform

- Vercel
- Global edge-optimized frontend delivery
- Serverless functions where applicable
- Preview deployments per branch/push
- Production promotion only after successful build validation

### Build Reliability Requirements

Assume every code change will be built by Vercel in a clean Linux environment.

Avoid:

- Case-sensitive import mismatches
- Missing exports
- Dead imports
- Unused variables that fail linting
- Unsafe browser globals during build/SSR
- Unvalidated environment variables
- Hardcoded local paths
- Missing dependency declarations
- Ambiguous aliases not configured in the project
- Runtime crashes from undefined data
- TypeScript compilation failures

---

## 3. Design System Contract

LaunchFlow uses an extended Tailwind configuration with Material Design 3-inspired naming conventions.

The agent must strictly reuse existing utility classes and configured design tokens.

### Font Family

Use the configured font family:

```txt
Inter, sans-serif
```

Do not introduce alternative font stacks unless explicitly requested.

### Text Utilities

Use configured text utilities:

```txt
text-headline-md
text-body-md
text-label-md
text-label-sm
```

Avoid replacing these with generic Tailwind text sizes such as `text-sm`, `text-base`, `text-lg`, or `text-xl` unless the existing component already uses them and the task is not styling-related.

### Icon System

Use Material Symbols Outlined only.

Required markup:

```html
<span class="material-symbols-outlined">icon_name</span>
```

Do not replace this icon system with SVG libraries, emojis, inline SVG, Lucide, Heroicons, Font Awesome, or custom icon packages unless explicitly instructed.

### Layout Utilities

Use and preserve:

```txt
w-sidebar_width
px-lg
gap-md
```

`w-sidebar_width` represents the fixed 260px sidebar width.

### Theme Tokens and Color Intent

Known LaunchFlow color intent:

```txt
Primary: #003d9b
Sidebar Background: #0052cc
App Background: #f8f9fb
Surface Lowest: bg-surface-container-lowest (#ffffff)
Surface Low: bg-surface-container-low (#f3f4f6)
Primary Text: text-on-surface
Secondary Text: text-on-surface-variant
Sidebar Text: text-white/90
```

Raw hex values are acceptable only in token configuration files such as Tailwind config, centralized theme files, or design-token documentation.

Raw hex values are prohibited in:

- JSX/TSX markup
- HTML templates
- Component style strings
- Inline styles
- Feature components
- Page-level layout files

### Prohibited Styling Patterns

Do not introduce these when LaunchFlow tokens exist:

```txt
bg-blue-600
bg-gray-50
bg-slate-100
text-gray-500
text-blue-700
border-gray-200
ring-blue-500
```

Use configured semantic tokens instead.

---

## 4. Core Layout Architecture

LaunchFlow uses a fixed multi-panel shell.

### Header

The header is a fixed/sticky top navigation bar.

Required classes:

```txt
h-16 sticky top-0 z-50
```

Header contains:

- LaunchFlow branding
- Global search
- Notifications
- User avatar dropdown

Header rules:

- Preserve `h-16`.
- Preserve `sticky top-0 z-50`.
- Keep branding, search, notifications, and avatar dropdown visually stable.
- Do not couple header state to product pipeline state.
- Do not place sidebar or stage content inside the header.
- Preserve accessible labels and keyboard behavior for icon-only controls.

### Sidebar Navigation

The sidebar is fixed on the left below the header.

Required classes:

```txt
w-sidebar_width fixed left-0 top-16 z-20
```

Sidebar rules:

- Preserve `w-sidebar_width`.
- Preserve `fixed left-0 top-16 z-20`.
- Use the LaunchFlow sidebar background token/color intent.
- Sidebar must not overlap the header.
- Sidebar must support scrolling for visible stage navigation.
- Sidebar must never render stages beyond `current_active_stage_index` for the selected product.
- Active navigation state must be derived from the selected product and selected visible stage.

### Main Workspace

The main workspace is offset by the fixed sidebar width.

Required class:

```txt
pl-[260px]
```

Workspace rules:

- Preserve the left offset while the sidebar is visible.
- Dynamically shift or resize when a contextual details panel/drawer opens.
- Avoid horizontal overflow.
- Do not duplicate sidebar-width constants across unrelated components.
- Do not use absolute positioning hacks unless already part of the component architecture.

### Contextual Details Panel / Drawer

The contextual panel displays selected product, visible stage, checklist, and custom-field details.

Panel rules:

- Opening the panel must not break the header/sidebar shell.
- Closing the panel must restore workspace sizing.
- Panel state must be explicit and controlled.
- Panel must not own canonical product-stage data.
- Panel receives selected data through props, selectors, or framework-native state boundaries.
- Panel must handle missing product or stage data without crashing.

---

## 5. Canonical Pipeline Model

LaunchFlow has **14 strict chronological stages**.

The stage order is authoritative and must not change unless the user explicitly requests a pipeline redesign.

### Ordered Stages

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

### Phase Mapping

Stages 1 through 12 belong to the launch pipeline.

Stages 13 through 14 belong to optimization.

```ts
type LaunchFlowPhase = "pipeline" | "optimization";

type LaunchFlowStageId =
  | "product-research"
  | "product-development"
  | "supplier-sourcing"
  | "under-final-order"
  | "shipping"
  | "keyword-research"
  | "listing-creation"
  | "image-planning"
  | "campaign-prep"
  | "amazon-inbound"
  | "enrolled-to-vines"
  | "launch"
  | "stable"
  | "scaling";

type LaunchFlowStage = {
  id: LaunchFlowStageId;
  label: string;
  phase: LaunchFlowPhase;
  index: number;
};
```

### Canonical Stage Constant

Prefer one centralized constant equivalent to:

```ts
export const LAUNCHFLOW_STAGES = [
  { id: "product-research", label: "Product Research", phase: "pipeline", index: 1 },
  { id: "product-development", label: "Product Development", phase: "pipeline", index: 2 },
  { id: "supplier-sourcing", label: "Supplier Sourcing", phase: "pipeline", index: 3 },
  { id: "under-final-order", label: "Under Final Order", phase: "pipeline", index: 4 },
  { id: "shipping", label: "Shipping", phase: "pipeline", index: 5 },
  { id: "keyword-research", label: "Keyword Research", phase: "pipeline", index: 6 },
  { id: "listing-creation", label: "Listing Creation", phase: "pipeline", index: 7 },
  { id: "image-planning", label: "Image Planning", phase: "pipeline", index: 8 },
  { id: "campaign-prep", label: "Campaign Prep", phase: "pipeline", index: 9 },
  { id: "amazon-inbound", label: "Amazon Inbound", phase: "pipeline", index: 10 },
  { id: "enrolled-to-vines", label: "Enrolled to Vines", phase: "pipeline", index: 11 },
  { id: "launch", label: "Launch", phase: "pipeline", index: 12 },
  { id: "stable", label: "Stable", phase: "optimization", index: 13 },
  { id: "scaling", label: "Scaling", phase: "optimization", index: 14 },
] as const;
```

### Stage Model Rules

- Do not duplicate stage arrays across components.
- Do not derive stage order alphabetically.
- Do not use display labels as persistent keys.
- Use stable IDs for state, routes, storage, APIs, and database records.
- Use numeric `index` for chronological logic and progressive disclosure.
- Treat unknown stage IDs as invalid and handle them safely.
- Treat unknown indexes as invalid and clamp or reject them safely.

---

## 6. Critical Engine Feature A: Progressive Stage Disclosure UI

Progressive Stage Disclosure is mandatory.

Every product has a trackable field:

```ts
current_active_stage_index: number; // valid range: 1 through 14
```

### Disclosure Rule

The UI must completely hide all future stages beyond the product's current active stage.

Visible stages are exactly:

```ts
stage.index <= product.current_active_stage_index
```

Future stages are exactly:

```ts
stage.index > product.current_active_stage_index
```

Future stages must be completely omitted from the rendered output.

### Example

If a product is in Stage 3, Supplier Sourcing:

Render only:

1. Product Research
2. Product Development
3. Supplier Sourcing

Do not render:

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

### Strict DOM Rule

Future stages must not appear as:

- Hidden rows
- Disabled rows
- Collapsed dropdowns
- Skeleton rows
- Placeholder cards
- `display: none` nodes
- `hidden` nodes
- `aria-hidden` nodes
- Off-screen nodes
- Zero-opacity nodes
- Disabled menu options

They must not exist in the DOM/view until the product officially transitions to that stage.

### Correct Implementation Pattern

Filter the stage collection before mapping to JSX/HTML:

```ts
const visibleStages = LAUNCHFLOW_STAGES.filter(
  (stage) => stage.index <= product.current_active_stage_index,
);
```

Then render only `visibleStages`.

### Incorrect Implementation Pattern

Do not render the full stage list and hide future items with CSS:

```tsx
{LAUNCHFLOW_STAGES.map((stage) => (
  <StageRow className={stage.index > product.current_active_stage_index ? "hidden" : ""} />
))}
```

This violates the zero-clutter DOM requirement.

### Stage Transition Rules

When a product advances stages:

- Increment or explicitly set `current_active_stage_index`.
- Validate that the new value is between 1 and 14.
- Reveal the new stage only after the index changes.
- Initialize the new stage data container if missing.
- Preserve all previous stage data.
- Do not auto-create visible future UI before the transition.

When a product regresses stages, if supported:

- Update `current_active_stage_index` safely.
- Future stages become omitted from the DOM again.
- Persisted future-stage data may remain in storage but must not render while future-hidden.
- Do not delete future-stage data unless the user explicitly confirms destructive rollback behavior.

---

## 7. Critical Engine Feature B: Dynamic Custom Fields Generator

Dynamic Custom Fields are mandatory.

Stage details dropdowns must contain zero hardcoded business text inputs.

All stage-specific detail inputs must be generated from metadata stored under the owning stage key.

### Required User Behavior

Inside any visible stage dropdown, the user must be able to click:

```txt
Add Custom Field
```

The UI must then prompt the user to provide:

1. Field Label
2. Field Type

### Strict Field Types

Supported field types are exactly:

```ts
type CustomFieldType =
  | "TEXT"
  | "NUMBER"
  | "LINK"
  | "CURRENCY"
  | "WEIGHT"
  | "SIZING"
  | "DATE";
```

### Field Type Meaning

```txt
TEXT      Plain alphanumeric string
NUMBER    Float or integer value
LINK      Clickable URL anchor tag
CURRENCY  Financial value with currency symbol/code formatting
WEIGHT    Numeric mass value with unit string
SIZING    Dimensions or package sizing format
DATE      Native date-picker element
```

### Custom Field Metadata Shape

Use a persistable shape equivalent to:

```ts
type CustomFieldValue =
  | string
  | number
  | null
  | {
      amount?: number;
      currency?: string;
      symbol?: string;
    }
  | {
      value?: number;
      unit?: string;
    }
  | {
      length?: number;
      width?: number;
      height?: number;
      unit?: string;
    };

type StageCustomField = {
  id: string;
  label: string;
  type: CustomFieldType;
  value: CustomFieldValue;
  created_at: string;
  updated_at: string;
};
```

### Field Rendering Rules

Render fields dynamically from `custom_fields`.

Do not hardcode stage-specific inputs like:

```tsx
<input name="supplierName" />
<input name="factoryAddress" />
<input name="shippingCost" />
```

Instead, render based on metadata:

```tsx
{stageData.custom_fields.map((field) => (
  <CustomFieldRenderer key={field.id} field={field} />
))}
```

### Field Input Rules by Type

For `TEXT`:

- Render a standard text input or textarea according to existing UI pattern.
- Store string values.

For `NUMBER`:

- Render numeric input.
- Store finite numbers or `null`.
- Do not store formatted numeric strings.

For `LINK`:

- Validate and normalize URLs.
- Render clickable anchor tags for saved values.
- Use `target="_blank"` and `rel="noreferrer"` for external links.
- Do not render unsafe JavaScript URLs.

For `CURRENCY`:

- Store numeric amount separately from symbol/code.
- Format only at render time.
- Avoid storing formatted strings as canonical values.

For `WEIGHT`:

- Store numeric value and unit separately.
- Use explicit unit strings such as `g`, `kg`, `lb`, or `oz` if the existing project does not define a unit enum.

For `SIZING`:

- Store dimensions as structured values.
- Avoid ambiguous freeform strings when structured data is possible.
- Include a unit field.

For `DATE`:

- Render a native date-picker input where possible.
- Store date values as ISO-compatible `YYYY-MM-DD` strings.
- Do not store locale-formatted display dates as canonical values.

### Field Creation Rules

When adding a custom field:

- Generate a stable unique `id`.
- Trim and validate `label`.
- Reject empty labels.
- Require one of the strict field types.
- Initialize value according to field type.
- Append the field to the current visible stage only.
- Update persistence state immediately.
- Do not mutate arrays in place.

### Prompt UI Rules

Prefer an accessible modal, inline form, or popover consistent with the existing component system.

Avoid `window.prompt` unless the project already uses it or the user explicitly requests minimal browser-native prompts.

The prompt UI must include:

- Field Label input
- Field Type dropdown
- Confirm/Add button
- Cancel button
- Keyboard-accessible controls
- Accessible labels
- Error state for invalid label/type

---

## 8. Critical Engine Feature C: Ad-Hoc Stage Checklists

Ad-hoc stage checklists are mandatory.

At the absolute bottom of each visible stage's details dropdown, render an interactive checklist area.

### Required User Behavior

For each visible stage, users must be able to:

1. Type a task name.
2. Click `Add Task`.
3. Append a new checklist item to that specific stage.
4. Toggle completion with a checkbox.
5. See visual strike-through/completion state instantly.
6. See global progress metrics update instantly.

### Checklist Task Shape

Use a persistable structure equivalent to:

```ts
type StageChecklistTask = {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
```

### Checklist Storage Rule

Checklist tasks must be stored as an array under the owning stage key.

Correct:

```ts
product.stage_data[stageId].checklist_tasks
```

Incorrect:

```ts
product.allTasks
product.checklist
standaloneChecklistByProductOnly
```

unless such structures are derived indexes only and never canonical storage.

### Checklist Placement Rule

Checklist UI must appear at the absolute bottom of each visible stage details dropdown, after dynamic custom fields.

Preferred visual order inside a stage dropdown:

1. Stage heading/summary
2. Dynamic custom fields list
3. Add Custom Field control
4. Stage checklist section
5. Add Task input and button

### Checklist Interaction Rules

When adding a task:

- Trim task title.
- Reject empty titles.
- Generate a stable unique `id`.
- Append to the current stage's `checklist_tasks` array.
- Preserve existing tasks.
- Update `updated_at` timestamps.
- Persist immediately.

When toggling a task:

- Update only the target task in the owning stage.
- Set `completed` to the new checkbox state.
- Set `completed_at` when completed.
- Clear or null `completed_at` when reopened.
- Trigger derived progress metrics immediately.
- Apply visual completed state such as line-through using existing design tokens/classes.

### Progress Metrics Rules

Global and stage-level progress should be derived from checklist state whenever possible.

Recommended derived values:

```ts
type StageProgress = {
  total_tasks: number;
  completed_tasks: number;
  completion_ratio: number;
  is_complete: boolean;
};

type ProductProgress = {
  visible_stage_count: number;
  total_visible_tasks: number;
  completed_visible_tasks: number;
  visible_completion_ratio: number;
};
```

Metric calculation rules:

- Only visible stages should contribute to visible dashboard metrics.
- Future hidden stages must not affect visible progress indicators.
- If hidden future stages contain persisted tasks, exclude them from visible metrics until revealed.
- Avoid storing derived progress permanently unless required by backend constraints.
- If stored, recalculate after every checklist mutation to prevent stale data.

---

## 9. Global Product Schema Rules

State must support local storage and database persistence compatibility.

Custom fields and checklist tasks must be arrays of objects nested under their respective stage keys within the global product schema object.

### Canonical Product Shape

Use or adapt a shape equivalent to:

```ts
type StageData = {
  custom_fields: StageCustomField[];
  checklist_tasks: StageChecklistTask[];
};

type StageDataByStageId = Partial<Record<LaunchFlowStageId, StageData>>;

type LaunchFlowProduct = {
  id: string;
  name: string;
  current_active_stage_index: number;
  stage_data: StageDataByStageId;
  created_at: string;
  updated_at: string;
};
```

### Stage Data Initialization

When a stage becomes visible, ensure its data container exists:

```ts
const defaultStageData: StageData = {
  custom_fields: [],
  checklist_tasks: [],
};
```

Do not assume `product.stage_data[stageId]` already exists.

### State Update Pattern

Use immutable updates.

Correct:

```ts
const nextProduct = {
  ...product,
  stage_data: {
    ...product.stage_data,
    [stageId]: {
      ...existingStageData,
      checklist_tasks: [...existingStageData.checklist_tasks, newTask],
    },
  },
  updated_at: now,
};
```

Incorrect:

```ts
product.stage_data[stageId].checklist_tasks.push(newTask);
```

### Persistence Compatibility Rules

The schema must remain serializable.

Allowed values:

- Strings
- Numbers
- Booleans
- Nulls
- Plain objects
- Arrays

Avoid storing:

- Functions
- Class instances
- DOM nodes
- Dates as `Date` objects
- Maps/Sets
- Circular references
- Framework-specific proxy objects

### Local Storage Rules

When using local storage:

- Guard access with `typeof window !== "undefined"`.
- Parse JSON defensively.
- Validate schema shape after parsing.
- Fallback to safe defaults on invalid data.
- Never allow malformed stored data to crash the app.

### Database Rules

When mapping to a database:

- Store stable IDs, not labels.
- Store `current_active_stage_index` as a number between 1 and 14.
- Store stage data by stable stage key.
- Use migration-safe object structures.
- Do not couple UI-only expansion state to persisted business data unless explicitly needed.

---

## 10. Component and DOM Mutation Rules

### Precision Editing

When modifying code:

1. Inspect the relevant file or component first.
2. Identify the smallest safe change.
3. Preserve existing component boundaries.
4. Output precise code modifications and local component blocks.
5. Avoid whole-file rewrites.
6. Avoid unrelated cleanup.
7. Avoid renaming files, exports, props, routes, or state keys unless required.

### Structural Separation

Keep structural layout markup separate from reactive product-stage data structures.

Structural layout components own:

- Header shell
- Sidebar shell
- Workspace shell
- Context panel shell
- Layout spacing and offsets

Reactive feature components own:

- Selected product
- Current active stage index
- Visible stage derivation
- Custom field collections
- Checklist task collections
- Progress metrics

Do not place canonical schema objects inside layout markup files unless the existing architecture has no better location.

### Preferred Folder Responsibility

Preserve or move toward this separation when making local changes:

```txt
components/
  shell and visual components
features/
  pipeline-specific UI
hooks/
  reusable stateful logic
constants/
  stage constants and strict enums
lib/
  pure utilities and derived calculations
services/
  persistence and API access
types/
  shared TypeScript types
```

### DOM Preservation

When extending markup:

- Preserve exact existing class names whenever possible.
- Preserve configured Tailwind utilities.
- Preserve Material Symbols markup.
- Preserve ARIA attributes.
- Preserve `role`, `aria-*`, `tabIndex`, `htmlFor`, `id`, and keyboard handlers.
- Preserve semantic tags such as `header`, `nav`, `main`, `aside`, `section`, `button`, `label`, and `form`.
- Preserve responsive classes.
- Preserve sticky/fixed layout classes.
- Preserve workspace offsets.
- Preserve test attributes.

---

## 11. UI Rendering Rules for Stages

### Visible Stage Derivation

Always derive visible stages from canonical stages and selected product state.

```ts
function getVisibleStages(product: LaunchFlowProduct): readonly LaunchFlowStage[] {
  const activeIndex = clampActiveStageIndex(product.current_active_stage_index);
  return LAUNCHFLOW_STAGES.filter((stage) => stage.index <= activeIndex);
}
```

### Active Index Validation

Use a safe validation helper equivalent to:

```ts
function clampActiveStageIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(14, Math.max(1, Math.trunc(value)));
}
```

### Stage Dropdown Rule

Render dropdowns only for visible stages.

```tsx
{visibleStages.map((stage) => (
  <StageDetailsDropdown
    key={stage.id}
    stage={stage}
    stageData={getStageData(product, stage.id)}
  />
))}
```

Do not render future dropdowns in disabled, collapsed, or hidden states.

### Empty Stage Rule

If a visible stage has no custom fields and no checklist tasks, show a minimal empty state inside that stage dropdown only.

The empty state should encourage:

- Adding a custom field
- Adding a checklist task

Do not show future-stage teasers.

---

## 12. Custom Field Renderer Rules

Implement custom field rendering as a generic renderer, not as stage-specific markup.

### Required Renderer Contract

Use a component or function equivalent to:

```ts
type CustomFieldRendererProps = {
  field: StageCustomField;
  onChange: (fieldId: string, value: CustomFieldValue) => void;
  onRemove?: (fieldId: string) => void;
};
```

### Renderer Behavior

- Switch by `field.type`.
- Render the correct input control.
- Preserve accessible labels.
- Keep formatting separate from stored values.
- Sanitize unsafe link values.
- Do not throw on malformed values.
- Fallback gracefully for unknown field types.

### Unknown Type Rule

Unknown custom field types should not crash the UI.

Render a safe unsupported-field message or ignore the field with telemetry/logging if the project has a logging pattern.

Do not silently corrupt data.

---

## 13. Checklist Component Rules

Implement checklist behavior as a reusable stage-scoped component.

### Required Component Contract

Use props equivalent to:

```ts
type StageChecklistProps = {
  stageId: LaunchFlowStageId;
  tasks: StageChecklistTask[];
  onAddTask: (stageId: LaunchFlowStageId, title: string) => void;
  onToggleTask: (stageId: LaunchFlowStageId, taskId: string, completed: boolean) => void;
  onRemoveTask?: (stageId: LaunchFlowStageId, taskId: string) => void;
};
```

### Checklist UI Requirements

Each checklist item must include:

- Checkbox input
- Task title
- Visual completed state
- Stable key
- Optional remove action if project UX supports it

The add-task area must include:

- Text input
- `Add Task` button
- Validation for non-empty task title
- Submit-on-enter behavior when implemented accessibly

### Visual Completion Rules

When completed:

- Checkbox reflects completed state.
- Title receives visual strike-through or completion styling.
- Styling must use existing design classes/tokens.
- Completion state updates immediately.

---

## 14. Application State Rules

LaunchFlow state must remain explicit, serializable, and debuggable.

### State Domains

Expected state domains include:

- Selected product
- Product list
- Selected visible stage
- Current active stage index
- Custom fields by stage
- Checklist tasks by stage
- Stage dropdown expansion state
- Contextual panel open/closed state
- Global search query
- Filters
- Notifications
- User menu state

### State Rules

- Use explicit initial state.
- Use strict unions for known modes and statuses.
- Use stable IDs for state keys.
- Keep UI-only state separate from persisted business state.
- Do not persist ephemeral dropdown expansion state unless explicitly required.
- Use immutable updates.
- Avoid ambiguous booleans when a union is clearer.
- Treat remote and stored data as nullable until validated.
- Handle loading, error, empty, and success states.

### Derived Data Rules

Derive rather than duplicate:

- Visible stages
- Stage progress
- Product progress
- Completed task counts
- Current stage label
- Whether a stage has custom fields
- Whether a stage has checklist tasks

Persist derived data only if backend requirements demand it.

---

## 15. Routing and Navigation Rules

If routing exists:

- Use stable stage IDs in URLs.
- Do not use labels as route params.
- Normalize incoming params before lookup.
- Reject or fallback safely on invalid params.
- Do not crash on unknown stage IDs.
- Preserve browser back/forward behavior.
- Do not route users to hidden future stages.

### Hidden Future Stage Routing Rule

If a route points to a future stage for the selected product:

- Do not render that stage.
- Redirect or fallback to the current active stage.
- Preserve a safe user experience.
- Do not expose future stage UI through route manipulation.

Preferred route shapes:

```txt
/stages/product-research
/stages/product-development
/stages/supplier-sourcing
/stages/under-final-order
/stages/shipping
/stages/keyword-research
/stages/listing-creation
/stages/image-planning
/stages/campaign-prep
/stages/amazon-inbound
/stages/enrolled-to-vines
/stages/launch
/optimization/stable
/optimization/scaling
```

---

## 16. Accessibility Rules

Accessibility is mandatory.

### Buttons and Interactive Elements

- Use `<button>` for actions.
- Use links only for navigation.
- Provide accessible labels for icon-only buttons.
- Preserve focus visibility.
- Preserve keyboard activation.
- Do not replace semantic controls with clickable `div`s.
- Use `aria-expanded` for dropdowns and collapsible panels.
- Use `aria-current` for active navigation items.
- Use `aria-controls` where controls open specific panels.

### Custom Field Accessibility

- Field Label input must have an accessible label.
- Field Type dropdown must have an accessible label.
- Validation errors must be announced or associated with inputs.
- Dynamic fields must have stable IDs and labels.
- Date fields must use accessible native date inputs where possible.

### Checklist Accessibility

- Task input must have an accessible label.
- Add Task button must be keyboard reachable.
- Checkbox labels must be associated with task text.
- Completed visual state must not rely only on color.
- Strike-through/completion state must not remove readable text.

### Sidebar Accessibility

- Sidebar navigation should use `nav` where appropriate.
- Active visible stage should expose `aria-current` or equivalent.
- Future hidden stages must not be exposed to screen readers.
- Keyboard navigation must only reach visible stages.

### Context Panel Accessibility

- Close button must have an accessible label.
- Focus behavior must be predictable.
- Do not trap focus unless the panel is modal.
- If modal behavior is implemented, use complete modal accessibility semantics.

---

## 17. Vercel Production Constraints

### Import Safety

- Use valid relative paths.
- Use configured aliases only when confirmed in project config.
- Respect case-sensitive file systems.
- Remove unused imports.
- Avoid circular dependencies.
- Do not import from files that do not exist.

### Environment Variables

- Do not assume environment variables exist at build time.
- Provide safe fallbacks where appropriate.
- Validate required variables at server-only boundaries.
- Never expose server secrets to client bundles.
- Never log secrets.
- Avoid non-null assertions on `process.env` unless intentionally server-only and validated.

Safe pattern:

```ts
const value = process.env.MY_ENV_VAR;

if (!value) {
  // fallback, safe error, or server-only fail-fast behavior
}
```

### Browser and Server Boundaries

Guard browser-only APIs:

```txt
window
document
localStorage
sessionStorage
navigator
matchMedia
ResizeObserver
IntersectionObserver
```

Use:

```ts
const isBrowser = typeof window !== "undefined";
```

### Error Boundaries and Failsafes

Production UI must fail gracefully.

Use:

- Error boundaries where applicable
- Empty states
- Loading states
- Null-safe access
- Defensive JSON parsing
- Async try/catch
- Schema normalization
- Safe fallbacks for malformed product data

Do not allow:

- Blank screens from render errors
- Unhandled promise rejections
- Undefined property crashes
- Malformed local storage crashes
- Future-stage route manipulation crashes

---

## 18. TypeScript / JavaScript Standards

### TypeScript Preferred

When the repository uses TypeScript:

- Prefer explicit types at public boundaries.
- Use inferred types for obvious local values.
- Avoid `any`.
- Use `unknown` for uncertain external data.
- Narrow unknown values before use.
- Use `as const` for static stage/type arrays.
- Use unions for field types, phases, and modes.
- Avoid non-null assertions.
- Avoid broad `Record<string, any>` structures.

### JavaScript Projects

If the repository uses JavaScript:

- Preserve JavaScript unless asked to migrate.
- Use JSDoc where helpful.
- Avoid TypeScript-only syntax.
- Keep runtime guards strong.
- Preserve Vercel build compatibility.

---

## 19. Utility Function Expectations

Prefer pure utilities for reusable pipeline logic.

Recommended utilities:

```ts
clampActiveStageIndex(value: unknown): number
getVisibleStages(product: LaunchFlowProduct): readonly LaunchFlowStage[]
getStageData(product: LaunchFlowProduct, stageId: LaunchFlowStageId): StageData
createCustomField(label: string, type: CustomFieldType): StageCustomField
updateCustomFieldValue(product, stageId, fieldId, value): LaunchFlowProduct
createChecklistTask(title: string): StageChecklistTask
addChecklistTask(product, stageId, title): LaunchFlowProduct
toggleChecklistTask(product, stageId, taskId, completed): LaunchFlowProduct
calculateStageProgress(stageData: StageData): StageProgress
calculateVisibleProductProgress(product: LaunchFlowProduct): ProductProgress
```

Utility rules:

- Keep utilities pure where possible.
- Do not access DOM from utilities.
- Do not access local storage from pure data utilities.
- Do not mutate inputs.
- Return safe defaults for malformed data.

---

## 20. Performance Rules

LaunchFlow should remain fast and responsive.

- Keep canonical stage constants outside render functions.
- Memoize derived visible stages and progress metrics when needed.
- Avoid rendering future stages at all.
- Avoid recreating large arrays inline in hot render paths.
- Split large components only when it improves clarity.
- Lazy-load heavy contextual panels where appropriate.
- Do not add large dependencies for simple field/checklist behavior.
- Keep frontend bundle size suitable for Vercel deployments.

Progressive disclosure is also a performance requirement: hidden future stages must not consume DOM, event handlers, form state, or rendering work.

---

## 21. Testing and Validation Rules

When tests exist, add or update tests for changed behavior.

Critical behavior to test:

- Stage order is exactly 1 through 14.
- `current_active_stage_index` clamps or validates correctly.
- Visible stages exclude future stages.
- Future stages are not rendered in the DOM.
- Custom fields are generated from metadata.
- Custom field types render correct controls.
- Add Custom Field appends to the correct stage.
- Add Task appends to the correct stage.
- Checklist toggle updates completed state.
- Checklist toggle updates progress metrics.
- Hidden future stage tasks do not affect visible metrics.
- Local storage malformed data does not crash the app.
- Route manipulation cannot reveal future stages.
- Accessibility labels remain present.

If tests do not exist:

- Keep changes minimal and strongly typed.
- Do not introduce a new testing framework without permission.
- Provide manual validation notes when relevant.

---

## 22. Dependency Rules

Do not add dependencies unless the task clearly requires them.

Before adding a package, prefer:

1. Existing project utilities
2. Native platform APIs
3. Small local helpers
4. Framework-native features
5. New dependency only as a last resort

Never add:

- UI component libraries that conflict with Tailwind tokens
- Icon libraries replacing Material Symbols Outlined
- State management libraries for simple local state
- Date libraries for basic `YYYY-MM-DD` handling
- Heavy utility libraries for small transformations

---

## 23. AI Coding Behavior

### Before Coding

The agent must:

1. Understand the requested change.
2. Inspect relevant files when available.
3. Identify the smallest safe modification.
4. Protect LaunchFlow layout invariants.
5. Protect design-token usage.
6. Protect progressive stage disclosure.
7. Protect stage-scoped custom field storage.
8. Protect stage-scoped checklist storage.
9. Consider Vercel build implications.
10. Consider accessibility implications.

### While Coding

The agent must:

- Make surgical edits.
- Preserve exact shell classes.
- Preserve canonical stage order.
- Filter stages before render.
- Generate fields from metadata.
- Append checklist tasks under stage keys.
- Use strict types.
- Separate layout from data structures.
- Avoid raw hex values in component code.
- Avoid native Tailwind colors when tokens exist.
- Guard browser APIs.
- Guard environment variables.

### After Coding

The agent must verify:

- Imports resolve.
- Types compile.
- No unused variables remain.
- No future stages render for the selected product.
- Custom fields persist under the correct stage key.
- Checklist tasks persist under the correct stage key.
- Progress metrics update from checklist state.
- Accessibility remains intact.
- Vercel deployment should compile cleanly.

---

## 24. Response Rules for Code Tasks

When responding to the user:

- Be direct and implementation-focused.
- Provide precise file paths when known.
- Provide patches or exact snippets rather than broad rewrites.
- Explain only architectural decisions that matter.
- Mention build or deployment risks if relevant.
- Do not claim tests were run unless they were actually run.
- Do not invent files that have not been inspected.
- Do not obscure uncertainty.
- Do not provide massive rewrites when a local patch is enough.

Preferred response shape:

```txt
Changed:
- ...

Why:
- ...

Validation:
- ...
```

If no files are accessible, provide precise implementation guidance and safe code blocks that can be applied manually.

---

## 25. LaunchFlow UI Invariants

These must remain true unless the user explicitly requests a redesign:

- Header remains `h-16 sticky top-0 z-50`.
- Sidebar remains `w-sidebar_width fixed left-0 top-16 z-20`.
- Main workspace remains offset with `pl-[260px]`.
- Layout uses `px-lg` and `gap-md` where established.
- Material Symbols Outlined icon markup is preserved.
- Inter font usage is preserved.
- Configured text utilities are preserved.
- Semantic surface and text tokens are preserved.
- Pipeline stage order remains exactly 1 through 14.
- Future stages beyond `current_active_stage_index` are omitted from the DOM.
- Stage details fields are generated dynamically from metadata.
- Each visible stage dropdown ends with an ad-hoc checklist.
- Custom fields are stored under their owning stage key.
- Checklist tasks are stored under their owning stage key.
- UI remains keyboard accessible.
- Vercel builds remain clean.

---

## 26. Prohibited Changes

Do not perform these actions unless explicitly instructed:

- Full application rewrite
- Whole-file refactor
- Design system replacement
- Tailwind config overhaul
- New UI framework installation
- Replacing Material Symbols icons
- Replacing Inter font
- Removing sticky header behavior
- Removing fixed sidebar behavior
- Changing sidebar width
- Changing workspace offset
- Changing pipeline stage order
- Rendering future stages beyond active index
- Hiding future stages with CSS instead of filtering before render
- Hardcoding stage-specific detail inputs
- Storing checklist tasks outside stage keys
- Storing custom fields outside stage keys
- Introducing raw hex component styles
- Introducing native Tailwind color utilities where semantic tokens exist
- Adding unvalidated environment dependencies
- Adding browser-only code to server/build paths
- Removing accessibility attributes
- Making unrelated formatting-only changes
- Adding dependencies without clear need

---

## 27. Safe Defaults

When uncertain, choose:

- Smaller change over larger change
- Existing token over new style
- Existing component pattern over new abstraction
- Stable stage ID over display label
- Explicit type over implicit ambiguity
- Derived progress over duplicated progress state
- Metadata-driven fields over hardcoded inputs
- Stage-scoped storage over global flat task lists
- Filtering before render over CSS hiding
- Defensive fallback over crash
- Relative path over invented alias
- Presentational component over stateful component when possible
- Server-safe code over browser-assuming code
- Vercel build stability over local-only convenience

---

## 28. Final Pre-Commit Checklist

Before considering LaunchFlow code complete, confirm:

```txt
[ ] No unnecessary full-file rewrites
[ ] No raw hex values in components
[ ] No native Tailwind colors replacing LaunchFlow tokens
[ ] Header layout classes preserved
[ ] Sidebar layout classes preserved
[ ] Workspace offset preserved
[ ] Pipeline stage order preserved exactly 1 through 14
[ ] current_active_stage_index validated within 1 through 14
[ ] Future stages filtered before render
[ ] Future stages omitted from DOM/view entirely
[ ] Material Symbols markup preserved
[ ] Inter/text utility usage preserved
[ ] Dynamic fields generated from metadata
[ ] No hardcoded business text inputs inside stage dropdowns
[ ] Add Custom Field creates field under current stage key
[ ] Field Type restricted to TEXT, NUMBER, LINK, CURRENCY, WEIGHT, SIZING, DATE
[ ] Checklist rendered at bottom of each visible stage dropdown
[ ] Add Task appends task under current stage key
[ ] Checkbox toggle updates task completion state
[ ] Checklist completion updates progress metrics instantly
[ ] Hidden future-stage data excluded from visible metrics
[ ] Accessibility attributes preserved
[ ] Types are strict and safe
[ ] Nullable data is handled defensively
[ ] Local storage/database schema remains serializable
[ ] Environment variables are guarded
[ ] Browser-only APIs are guarded
[ ] Imports resolve on case-sensitive file systems
[ ] No unused imports or variables
[ ] No duplicate canonical stage arrays
[ ] No new dependency without necessity
[ ] Vercel preview deployment should compile cleanly
```

---

## 29. Canonical Reminder

LaunchFlow is not a generic dashboard.

It is a focused Amazon product launch operating system built around:

- Strict chronological stage progression
- Minimal visible stage clutter
- Dynamic custom metadata capture
- Stage-scoped checklist execution
- Instant progress visibility
- Durable persistence-ready state
- Cloud-native deployment reliability
- Material Design 3-inspired Tailwind consistency

Every code change must reinforce these behaviors.
