# LaunchFlow QA Checklist

## 0. Purpose

This `qa-checklist.md` is the quality assurance checklist for **LaunchFlow**, the Amazon Product Launch Pipeline Web App.

The AI coding agent must read this file before validating, committing, or deploying code changes. This checklist protects the core LaunchFlow rules: progressive stage disclosure, dynamic custom fields, ad-hoc checklists, strict layout behavior, data persistence compatibility, and Vercel-safe deployment.

Use this file as a live QA tracker. Mark items as completed only after the feature has been manually verified or tested in code.

---

## 1. QA Operating Rules

- [ ] Read `agent.md` before making code changes.
- [ ] Read `product-spec.md` before changing product behavior.
- [ ] Read `architecture.md` before changing structure, state, or rendering flow.
- [ ] Read `progress.md` before deciding what milestone is active.
- [ ] Use this checklist before every GitHub push.
- [ ] Never mark a QA item complete unless it was actually verified.
- [ ] Do not assume visual behavior works because code compiles.
- [ ] Do not assume Vercel will pass because local preview works.
- [ ] Do not skip progressive disclosure checks.
- [ ] Do not skip DOM omission checks for hidden stages.

---

## 2. Critical Definition of Done

A LaunchFlow feature is not complete until all relevant items are true:

- [ ] The feature works in the browser.
- [ ] The feature does not break the fixed header/sidebar/workspace layout.
- [ ] The feature respects progressive stage disclosure.
- [ ] Future stages are not rendered in the DOM.
- [ ] State updates are immutable and predictable.
- [ ] Data remains JSON-serializable.
- [ ] Custom fields remain nested under the correct stage block.
- [ ] Checklist tasks remain nested under the correct stage block.
- [ ] Progress metrics update immediately after checklist changes.
- [ ] The UI remains usable with keyboard navigation.
- [ ] No custom design-system rules are violated.
- [ ] The app builds successfully for Vercel.

---

## 3. Documentation QA

- [ ] `README.md` exists.
- [ ] `README.md` explains the project vision.
- [ ] `README.md` explains the business goals.
- [ ] `README.md` explains the app layout.
- [ ] `README.md` explains the core business logic.
- [ ] `agent.md` exists.
- [ ] `agent.md` defines AI coding behavior and restrictions.
- [ ] `product-spec.md` exists.
- [ ] `product-spec.md` defines product behavior and interaction mechanics.
- [ ] `architecture.md` exists.
- [ ] `architecture.md` defines directory structure and data flow.
- [ ] `progress.md` exists.
- [ ] `progress.md` tracks completed work and active milestones.
- [ ] `qa-checklist.md` exists.
- [ ] All documentation files agree on the 14-stage pipeline order.
- [ ] All documentation files agree that future stages must be omitted from the DOM.

---

## 4. Repository Structure QA

Expected starter structure:

```txt
/
  index.html
  README.md
  agent.md
  product-spec.md
  architecture.md
  progress.md
  qa-checklist.md
  css/
    styles.css
  js/
    app.js
    store.js
    components/
      sidebar.js
      workspace.js
      stageAccordion.js
      customFieldForm.js
      checklist.js
```

Checklist:

- [ ] `index.html` exists at the project root.
- [ ] `/css/styles.css` exists.
- [ ] `/js/app.js` exists.
- [ ] `/js/store.js` exists.
- [ ] `/js/components/` exists.
- [ ] Component files are split by UI responsibility.
- [ ] State logic is not buried inside markup-only rendering files.
- [ ] Rendering files do not duplicate canonical stage data unnecessarily.
- [ ] Paths use relative links.
- [ ] File names match import paths exactly, including capitalization.

---

## 5. Design System QA

### Typography

- [ ] The app uses Inter as the primary font.
- [ ] Headline text uses `text-headline-md` where appropriate.
- [ ] Body text uses `text-body-md` where appropriate.
- [ ] Labels use `text-label-md` or `text-label-sm` where appropriate.
- [ ] Native Tailwind text sizes are not used as replacements for configured tokens unless already established.

### Icons

- [ ] Icons use Material Symbols Outlined.
- [ ] Icon markup follows this format:

```html
<span class="material-symbols-outlined">icon_name</span>
```

- [ ] No unrelated icon library is introduced.
- [ ] Icon-only buttons have accessible labels.

### Layout Tokens

- [ ] Sidebar uses `w-sidebar_width`.
- [ ] Main workspace uses `pl-[260px]`.
- [ ] Spacing uses configured utilities such as `px-lg` and `gap-md` where appropriate.
- [ ] Header keeps `h-16`.
- [ ] Header keeps `sticky top-0 z-50`.
- [ ] Sidebar keeps `fixed left-0 top-16 z-20`.

### Color Tokens

- [ ] Sidebar follows the `#0052cc` color intent through configured tokens or approved styling.
- [ ] Primary accents follow the `#003d9b` color intent through configured tokens or approved styling.
- [ ] App background follows the `#f8f9fb` color intent.
- [ ] Surface cards use `bg-surface-container-lowest` or `bg-surface-container-low` where available.
- [ ] Text uses `text-on-surface` and `text-on-surface-variant` where available.
- [ ] Component markup does not introduce random raw hex values.
- [ ] Component markup does not introduce unrelated Tailwind colors such as `bg-blue-600`, `text-gray-500`, or `border-slate-200` when LaunchFlow tokens exist.

---

## 6. Layout QA

### Header

- [ ] Header is visible at the top of the app.
- [ ] Header contains `LaunchFlow` branding.
- [ ] Header contains global search input.
- [ ] Header contains notifications icon.
- [ ] Header contains settings icon.
- [ ] Header contains user profile avatar dropdown.
- [ ] Header does not overlap the sidebar incorrectly.
- [ ] Header remains above other panels.
- [ ] Header controls do not mutate product stage state accidentally.

### Sidebar

- [ ] Sidebar appears on the left side.
- [ ] Sidebar width is 260px.
- [ ] Sidebar starts below the header.
- [ ] Sidebar displays only visible stages.
- [ ] Sidebar does not display hidden future stages.
- [ ] Sidebar stage order is chronological.
- [ ] Active or selected stage is visually clear.
- [ ] Sidebar remains scrollable when content exceeds viewport height.

### Main Workspace

- [ ] Main workspace is offset by 260px.
- [ ] Main workspace does not sit underneath the sidebar.
- [ ] Main workspace renders KPI cards at the top.
- [ ] Main workspace renders overall progress meter below KPIs.
- [ ] Main workspace renders visible stage accordions below the progress meter.
- [ ] Main workspace does not render future hidden stage cards.
- [ ] Main workspace remains uncluttered at early product stages.

### Contextual Panels / Inline Forms

- [ ] Add Custom Field UI appears only when triggered.
- [ ] Add Task input appears inside the correct visible stage.
- [ ] Modal/drawer/inline form closes cleanly on cancel.
- [ ] Temporary form input does not mutate product data until saved.
- [ ] Contextual UI does not break the page layout.

---

## 7. Canonical Stage QA

Canonical order:

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

Checklist:

- [ ] All 14 stages exist in the canonical stage array.
- [ ] Stage indexes run from 1 through 14.
- [ ] Stage labels match the canonical names exactly.
- [ ] Stable stage IDs exist for every stage.
- [ ] Stage order is not alphabetical.
- [ ] Stage order is not duplicated inconsistently across files.
- [ ] Stage labels are not used as persistent object keys.
- [ ] Stage IDs are used for data storage and lookup.

---

## 8. Progressive Stage Disclosure QA

This is the most important LaunchFlow behavior.

### Required Rule

A stage renders only when:

```js
stage.index <= activeProduct.current_active_stage_index
```

or, if the code uses `current_stage_index`:

```js
stage.index <= activeProduct.current_stage_index
```

### DOM Omission Requirements

- [ ] Future stages are not rendered in the workspace DOM.
- [ ] Future stages are not rendered in the sidebar DOM.
- [ ] Future stages are not rendered and hidden with CSS.
- [ ] Future stages are not rendered as disabled placeholders.
- [ ] Future stages are not rendered as locked preview cards.
- [ ] Future stages are not available in hidden dropdown menus.
- [ ] Future stages are not exposed in search results.
- [ ] Future stages are not present in the accessibility tree.

### Stage 1 Test

Set active product stage index to `1`.

Expected visible stage:

- Product Research

Checklist:

- [ ] Only Product Research appears in the workspace.
- [ ] Only Product Research appears in the sidebar.
- [ ] Product Development does not exist in the DOM.
- [ ] Stages 2 through 14 do not exist in the DOM.

### Stage 3 Test

Set active product stage index to `3`.

Expected visible stages:

- Product Research
- Product Development
- Supplier Sourcing

Checklist:

- [ ] Exactly three stage cards appear in the workspace.
- [ ] Exactly three stage items appear in the sidebar.
- [ ] Under Final Order does not exist in the DOM.
- [ ] Stages 4 through 14 do not exist in the DOM.

### Stage 14 Test

Set active product stage index to `14`.

Expected visible stages:

- All 14 stages

Checklist:

- [ ] All 14 stages appear in the workspace.
- [ ] All 14 stages appear in the sidebar.
- [ ] Advance button is hidden or disabled.
- [ ] Overall progress displays 100%.

---

## 9. Advance to Next Stage QA

- [ ] `Advance to Next Stage` button appears when current stage index is less than 14.
- [ ] Button does not appear or is disabled at stage 14.
- [ ] Clicking the button increments stage index by exactly 1.
- [ ] Clicking the button does not skip stages.
- [ ] Clicking the button reveals exactly one new stage.
- [ ] Newly revealed stage appears below previous stages.
- [ ] Sidebar updates immediately after advancement.
- [ ] Overall progress meter updates immediately.
- [ ] New stage is not visible before the click.
- [ ] Data persists after advancement if persistence is enabled.
- [ ] Invalid stage index is safely clamped between 1 and 14.

---

## 10. KPI Row QA

Required KPI cards:

- Total Launches
- Sourcing
- Active PPC
- Avg Conversion Rate

Checklist:

- [ ] KPI row appears at the top of the workspace.
- [ ] Total Launches card renders safely.
- [ ] Sourcing card renders safely.
- [ ] Active PPC card renders safely.
- [ ] Avg Conversion Rate card renders safely.
- [ ] Missing metric values display a safe fallback such as `—` or `0`.
- [ ] KPI rendering does not depend on hidden future stage DOM nodes.
- [ ] KPI row does not mutate active product stage data.

---

## 11. Overall Progress Meter QA

- [ ] Progress meter appears below KPI row.
- [ ] Progress is based on current stage index over 14.
- [ ] Stage 1 displays approximately 7%.
- [ ] Stage 7 displays 50%.
- [ ] Stage 14 displays 100%.
- [ ] Progress meter updates after advancing stage.
- [ ] Progress meter handles missing active product safely.
- [ ] Progress meter does not require rendering hidden stages.

Expected calculation:

```js
Math.round((current_stage_index / 14) * 100)
```

or:

```js
Math.round((current_active_stage_index / 14) * 100)
```

---

## 12. Stage Accordion QA

- [ ] Every visible stage renders as a dropdown or accordion card.
- [ ] Accordion header displays stage label.
- [ ] Accordion header displays stage index or order.
- [ ] Accordion header displays local stage progress or task status.
- [ ] Accordion can expand and collapse.
- [ ] Collapsing does not remove the stage from the product workflow.
- [ ] Expanding shows dynamic fields and checklist area.
- [ ] Hidden future stage accordions do not exist.
- [ ] Accordion state is stored safely per stage if persisted.
- [ ] Accordion controls are keyboard-accessible.
- [ ] Accordion controls use `aria-expanded` where applicable.

---

## 13. Dynamic Custom Field QA

### Field Creation UI

- [ ] Every visible stage has a `+ Add Custom Field` action.
- [ ] Hidden stages do not expose custom field creation UI.
- [ ] Clicking `+ Add Custom Field` opens a config UI.
- [ ] Config UI asks for Field Name.
- [ ] Config UI asks for Field Type.
- [ ] Config UI has Save action.
- [ ] Config UI has Cancel action.
- [ ] Cancel closes the UI without mutating active product data.

### Allowed Field Types

- [ ] `TEXT` is available.
- [ ] `NUMBER` is available.
- [ ] `LINK` is available.
- [ ] `CURRENCY` is available.
- [ ] `WEIGHT` is available.
- [ ] `SIZING` is available.
- [ ] `DATE` is available.
- [ ] No unsupported field type appears.

### Field Creation Behavior

- [ ] Empty Field Name is rejected.
- [ ] Field Name is trimmed before save.
- [ ] Field gets a unique `field_id`.
- [ ] Field stores selected type.
- [ ] Field stores initial value safely.
- [ ] Field is appended only to the selected stage block.
- [ ] Field appears immediately after save.
- [ ] Field does not appear in other stages.
- [ ] Adding a field does not change checklist progress.
- [ ] Adding a field does not reveal future stages.

### No Default Metadata Fields

- [ ] Stage dropdowns contain zero hardcoded metadata text inputs before user-created fields.
- [ ] No fake default supplier fields appear.
- [ ] No fake default keyword fields appear.
- [ ] No fake default listing fields appear.
- [ ] Every metadata field is user-created through the generator.

---

## 14. Custom Field Type Rendering QA

### TEXT

- [ ] TEXT field renders a text-compatible input.
- [ ] TEXT field stores string values.
- [ ] TEXT field handles empty string safely.

### NUMBER

- [ ] NUMBER field renders a numeric input.
- [ ] NUMBER field supports integer values.
- [ ] NUMBER field supports decimal values if required.
- [ ] NUMBER field rejects or normalizes non-numeric input.
- [ ] Empty NUMBER value does not crash UI.

### LINK

- [ ] LINK field renders a URL-compatible input.
- [ ] Valid LINK value can render as clickable anchor.
- [ ] Clickable anchor uses safe external link attributes when opening a new tab.
- [ ] Malformed LINK value does not crash UI.

### CURRENCY

- [ ] CURRENCY field stores numeric amount separately from formatted display when possible.
- [ ] CURRENCY field displays financial formatting.
- [ ] Empty CURRENCY value does not crash UI.
- [ ] Decimal currency values are supported.

### WEIGHT

- [ ] WEIGHT field stores numeric value.
- [ ] WEIGHT field stores unit string.
- [ ] Supported units are clear, such as `g`, `kg`, `oz`, and `lb`.
- [ ] Empty WEIGHT value does not crash UI.

### SIZING

- [ ] SIZING field supports dimensions or structured size data.
- [ ] Length can be stored safely.
- [ ] Width can be stored safely.
- [ ] Height can be stored safely.
- [ ] Unit can be stored safely.
- [ ] Partial dimensions do not crash UI.

### DATE

- [ ] DATE field renders a native date input.
- [ ] DATE field stores date as a string.
- [ ] Empty DATE value does not crash UI.
- [ ] Invalid date value is handled safely.

---

## 15. Ad-Hoc Checklist QA

### Checklist Placement

- [ ] Every visible stage has a checklist area.
- [ ] Checklist appears at the bottom of the stage dropdown content.
- [ ] Checklist remains stage-specific.
- [ ] Hidden stages do not expose checklist UI.

### Add Task Behavior

- [ ] Checklist has task text input.
- [ ] Checklist has `+ Add Task` button.
- [ ] Empty task names are rejected.
- [ ] Task name is trimmed before save.
- [ ] Task receives a unique `task_id`.
- [ ] Task starts with `is_completed: false`.
- [ ] Task is appended only to the selected stage block.
- [ ] Task appears immediately after creation.
- [ ] Add Task input clears after successful creation.
- [ ] Adding task does not reveal future stages.

### Checklist Item Behavior

- [ ] Each task has a checkbox.
- [ ] Checkbox reflects `is_completed` state.
- [ ] Checking task marks it completed.
- [ ] Unchecking task marks it incomplete.
- [ ] Checking task applies visual strikethrough.
- [ ] Unchecking task removes visual strikethrough.
- [ ] Toggling one task does not affect other tasks.
- [ ] Toggling task updates parent stage progress instantly.
- [ ] Toggling task updates relevant global metrics instantly.

---

## 16. Stage Progress Calculation QA

Expected local stage progress:

```js
const totalTasks = stageBlock.checklist_tasks.length;
const completedTasks = stageBlock.checklist_tasks.filter(task => task.is_completed).length;
const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
```

Checklist:

- [ ] Stage with zero tasks shows 0% or `No tasks yet`.
- [ ] Stage with one incomplete task shows 0%.
- [ ] Stage with one complete task shows 100%.
- [ ] Stage with two tasks and one complete shows 50%.
- [ ] Stage progress updates immediately after checkbox toggle.
- [ ] Stage progress updates immediately after task creation.
- [ ] Stage progress updates immediately after task deletion if deletion exists.
- [ ] Stage progress calculation only uses tasks from that stage.
- [ ] Stage progress does not count hidden future stage tasks.

---

## 17. Data Model QA

### Global App State

- [ ] Global app state has `products` array.
- [ ] Global app state has `activeProductId`.
- [ ] Active product can be selected safely.
- [ ] Missing active product shows safe empty state.

Expected concept:

```js
const appState = {
  products: [],
  activeProductId: null
};
```

### Product Entity

- [ ] Product has `id`.
- [ ] Product has `name`.
- [ ] Product has `asin`.
- [ ] Product has `current_stage_index` or `current_active_stage_index`.
- [ ] Product has 14 `stage_blocks`.
- [ ] Stage index is clamped from 1 to 14.

### Stage Block Entity

- [ ] Stage block has `stage_id`.
- [ ] Stage block has `is_expanded` boolean.
- [ ] Stage block has `custom_fields` array.
- [ ] Stage block has `checklist_tasks` array.
- [ ] Stage blocks are initialized safely.

### Custom Field Entity

- [ ] Custom field has `field_id`.
- [ ] Custom field has `label`.
- [ ] Custom field has `type`.
- [ ] Custom field has `value`.
- [ ] Custom field type is one of the approved values.

### Checklist Task Entity

- [ ] Checklist task has `task_id`.
- [ ] Checklist task has `task_name`.
- [ ] Checklist task has `is_completed` boolean.

### JSON Compatibility

- [ ] State does not contain functions.
- [ ] State does not contain DOM nodes.
- [ ] State does not contain circular references.
- [ ] State can be serialized with `JSON.stringify`.
- [ ] State can be restored with `JSON.parse`.

---

## 18. Store / Mutation QA

- [ ] `store.js` owns or exports global app state.
- [ ] `store.js` owns canonical stage mutation helpers.
- [ ] Stage advancement mutation exists.
- [ ] Add custom field mutation exists.
- [ ] Update custom field mutation exists.
- [ ] Add checklist task mutation exists.
- [ ] Toggle checklist task mutation exists.
- [ ] Progress calculation helper exists.
- [ ] Visible stage selector/helper exists.
- [ ] Mutations are safe when active product is missing.
- [ ] Mutations are safe when stage block is missing.
- [ ] Mutations do not directly corrupt nested arrays.
- [ ] Mutations trigger re-render after state changes.

---

## 19. Rendering Engine QA

- [ ] `app.js` initializes state safely.
- [ ] `app.js` selects required DOM containers safely.
- [ ] Missing DOM containers fail gracefully or show clear errors.
- [ ] Render function reads active product state.
- [ ] Render function computes visible stages from active product stage index.
- [ ] Render function omits future stages completely.
- [ ] Render function updates sidebar and workspace consistently.
- [ ] Event handlers are rebound safely after re-render if using direct DOM rendering.
- [ ] Event delegation is used where appropriate.
- [ ] Re-render does not duplicate event listeners excessively.
- [ ] Re-render does not erase unsaved input unexpectedly except after intentional form reset.

---

## 20. Search QA

- [ ] Global search input updates query state.
- [ ] Search includes visible stage labels.
- [ ] Search includes visible custom field labels.
- [ ] Search includes visible custom field values where appropriate.
- [ ] Search includes visible checklist task names.
- [ ] Search does not include hidden future stages.
- [ ] Search does not reveal hidden future stages.
- [ ] Search empty state is clear.
- [ ] Clearing search restores visible stage list.
- [ ] Search does not mutate product data.

---

## 21. Accessibility QA

### General

- [ ] Interactive controls use `button`, `input`, `select`, or links appropriately.
- [ ] Icon-only buttons have accessible labels.
- [ ] Inputs have associated labels.
- [ ] Keyboard users can navigate through header controls.
- [ ] Keyboard users can navigate sidebar stage controls.
- [ ] Keyboard users can expand/collapse accordions.
- [ ] Keyboard users can add custom fields.
- [ ] Keyboard users can add checklist tasks.
- [ ] Keyboard users can toggle checklist checkboxes.
- [ ] Visible focus state exists.

### Header

- [ ] Search input has accessible name.
- [ ] Notifications button has accessible name.
- [ ] Settings button has accessible name.
- [ ] Avatar dropdown uses `aria-expanded` where applicable.

### Sidebar

- [ ] Sidebar navigation uses semantic navigation markup when practical.
- [ ] Selected stage uses `aria-current` where applicable.
- [ ] Hidden future stages are not present in screen reader tree.

### Accordions

- [ ] Accordion trigger uses `aria-expanded` where applicable.
- [ ] Accordion content is associated with trigger when practical.
- [ ] Collapsed content behavior is accessible.

### Forms

- [ ] Field Name input has label.
- [ ] Field Type select has label.
- [ ] Task Name input has label or accessible name.
- [ ] Validation errors are readable and understandable.

---

## 22. Responsive / Visual QA

- [ ] App is usable on common desktop widths.
- [ ] Header does not wrap destructively.
- [ ] Sidebar remains usable on expected desktop sizes.
- [ ] Main workspace does not create unintended horizontal scroll.
- [ ] Stage cards have readable spacing.
- [ ] Long task names wrap or truncate safely.
- [ ] Long custom field labels wrap or truncate safely.
- [ ] Progress bars remain visually aligned.
- [ ] Dropdowns/modals/drawers do not overflow the viewport incorrectly.
- [ ] Reduced-motion users are not forced into unnecessary animations.

---

## 23. Persistence QA

If LocalStorage is implemented:

- [ ] App loads saved state on startup.
- [ ] App handles missing LocalStorage data.
- [ ] App handles malformed LocalStorage data.
- [ ] App saves after advancing stage.
- [ ] App saves after adding custom field.
- [ ] App saves after updating custom field value.
- [ ] App saves after adding checklist task.
- [ ] App saves after toggling checklist task.
- [ ] Refreshing the page preserves product data.
- [ ] LocalStorage errors do not crash the app.

If remote persistence is implemented later:

- [ ] API errors are handled safely.
- [ ] Failed saves show recoverable feedback.
- [ ] Local UI does not become blank after failed sync.
- [ ] Server data is normalized before rendering.
- [ ] Hidden future stages remain hidden after data reload.

---

## 24. Error Handling QA

- [ ] Missing active product shows a friendly empty state.
- [ ] Invalid active product ID does not crash UI.
- [ ] Invalid stage index is clamped or corrected.
- [ ] Missing stage block is initialized safely.
- [ ] Missing custom field array defaults to `[]`.
- [ ] Missing checklist task array defaults to `[]`.
- [ ] Invalid custom field type is rejected or ignored safely.
- [ ] Invalid URL does not crash the LINK field.
- [ ] Invalid numeric value does not crash NUMBER/CURRENCY/WEIGHT fields.
- [ ] Rendering errors do not leave a blank screen where avoidable.

---

## 25. Vercel / Build QA

Before pushing to GitHub:

- [ ] All paths use relative links where required.
- [ ] `index.html` references CSS and JS files correctly.
- [ ] File paths match exact case.
- [ ] No local absolute file paths exist.
- [ ] No broken imports exist.
- [ ] No missing exported functions exist.
- [ ] No browser globals are used in build-time-only code without guards.
- [ ] No required environment variable can crash build when missing.
- [ ] No secrets are committed.
- [ ] `.env` files are ignored.
- [ ] App works from a clean install/build.
- [ ] Vercel preview deployment should compile successfully.

If using Vite or another build tool:

- [ ] `npm install` completes.
- [ ] `npm run dev` starts local app.
- [ ] `npm run build` completes.
- [ ] `npm run preview` works after build.

If using pure static files:

- [ ] Static files load correctly without a build step.
- [ ] Relative asset paths work in Vercel deployment.
- [ ] No module import fails in browser console.

---

## 26. Browser Console QA

- [ ] Browser console has no uncaught JavaScript errors on load.
- [ ] Browser console has no errors when advancing stage.
- [ ] Browser console has no errors when adding custom fields.
- [ ] Browser console has no errors when changing custom field values.
- [ ] Browser console has no errors when adding checklist tasks.
- [ ] Browser console has no errors when toggling checklist items.
- [ ] Browser console has no missing asset errors.
- [ ] Browser console has no failed module import errors.

---

## 27. Manual Smoke Test Script

Run this after meaningful UI changes.

### Start State

- [ ] Open the app.
- [ ] Confirm header is visible.
- [ ] Confirm sidebar is visible.
- [ ] Confirm workspace is visible.
- [ ] Confirm only Stage 1 appears when product starts at stage 1.

### Stage Advancement

- [ ] Click `Advance to Next Stage`.
- [ ] Confirm Stage 2 appears.
- [ ] Confirm Stage 3 does not appear yet.
- [ ] Click `Advance to Next Stage` again.
- [ ] Confirm Stage 3 appears.
- [ ] Confirm Stage 4 does not appear yet.

### Custom Field

- [ ] Open Stage 1 accordion.
- [ ] Click `+ Add Custom Field`.
- [ ] Enter Field Name: `Supplier Quote`.
- [ ] Select Field Type: `CURRENCY`.
- [ ] Save.
- [ ] Confirm field appears in Stage 1.
- [ ] Confirm field does not appear in Stage 2.
- [ ] Enter a currency value.
- [ ] Refresh if persistence exists.
- [ ] Confirm field value remains.

### Checklist

- [ ] In Stage 1, type task: `Validate product demand`.
- [ ] Click `+ Add Task`.
- [ ] Confirm task appears unchecked.
- [ ] Confirm Stage 1 progress is still 0%.
- [ ] Check the task.
- [ ] Confirm strikethrough appears.
- [ ] Confirm Stage 1 progress updates to 100%.
- [ ] Uncheck the task.
- [ ] Confirm strikethrough disappears.
- [ ] Confirm Stage 1 progress returns to 0%.

### Hidden DOM

- [ ] Inspect DOM with browser dev tools.
- [ ] Confirm future unreached stages are not present.
- [ ] Confirm hidden stages are not merely hidden by CSS.

---

## 28. Regression Guardrails

After every feature or bug fix, confirm:

- [ ] Stage 1 still renders alone for new products.
- [ ] Stage advancement still reveals one stage at a time.
- [ ] Sidebar still matches workspace visible stages.
- [ ] Custom field creation still works.
- [ ] Checklist task creation still works.
- [ ] Checklist completion still updates progress.
- [ ] No future stages are leaked in DOM.
- [ ] Vercel build assumptions remain safe.

---

## 29. Release Readiness Checklist

Before merging to the main branch or promoting to production:

- [ ] `progress.md` is updated.
- [ ] QA checklist items relevant to the changed feature are completed.
- [ ] Browser smoke test has passed.
- [ ] No console errors are present.
- [ ] Build command passes if applicable.
- [ ] Preview deployment passes on Vercel.
- [ ] Product behavior matches `product-spec.md`.
- [ ] Architecture matches `architecture.md`.
- [ ] AI behavior constraints in `agent.md` were followed.
- [ ] README remains accurate.

---

## 30. Current QA Status

Initial status:

- [x] Documentation foundation created.
- [x] `agent.md` created.
- [x] `product-spec.md` created.
- [x] `architecture.md` created.
- [x] `progress.md` created.
- [x] `README.md` created.
- [x] `qa-checklist.md` created.
- [ ] Static app framework created.
- [ ] Store/state engine created.
- [ ] Progressive disclosure rendering implemented.
- [ ] Dynamic custom fields implemented.
- [ ] Ad-hoc stage checklists implemented.
- [ ] Vercel deployment verified.

---

## 31. Final QA Principle

LaunchFlow succeeds only if the interface stays minimal and stage-aware.

The most important QA rule is this:

**If a product has not reached a future stage, that stage must not exist in the rendered DOM.**

Everything else must support that rule.
