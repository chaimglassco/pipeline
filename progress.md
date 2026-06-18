# LaunchFlow Progress Tracker

> **Operational note for Codex / AI coding agent:** Read this file at the start of every coding session. Treat it as the live project tracker and persistent session memory log. Update task checkboxes only after code is generated, reviewed, and confirmed against `agent.md`, `product-spec.md`, and `architecture.md`. Append new tasks, blockers, decisions, and follow-up items as they surface. Preserve structural dependency order.

---

## Project Snapshot

**Project:** LaunchFlow  
**Product Type:** Amazon Product Launch Pipeline Web App  
**Current Milestone:** Phase 1 — Core Foundation & Data Architecture  
**Primary Deployment Target:** Vercel via GitHub  
**Architecture Direction:** Static Vercel-optimized frontend using `/index.html`, `/css/styles.css`, `/js/app.js`, `/js/store.js`, and modular `/js/components/` renderers.  
**Core UX Rule:** Future stages beyond the active product stage must be completely omitted from the DOM.  
**Core Data Rule:** Custom fields and checklist tasks must be nested under each product stage block for persistence compatibility.

---

## Session Memory Log

### 2026-06-02 — Initial Planning & Documentation Setup

- [x] Defined LaunchFlow as a progressive Amazon product launch pipeline dashboard.
- [x] Confirmed strict 14-stage lifecycle from Product Research through Scaling.
- [x] Confirmed `current_active_stage_index` / `current_stage_index` as the visibility driver.
- [x] Confirmed future stages must be omitted from the DOM, not hidden with CSS.
- [x] Confirmed dynamic custom fields must be user-generated, with no default hardcoded metadata inputs.
- [x] Confirmed ad-hoc checklist tasks must be stage-specific and progress-aware.
- [x] Confirmed Vercel/GitHub deployment flow requires relative paths, safe defaults, and build-safe vanilla JS architecture.

---

# 3-Tier Roadmap

---

## Phase 1: Core Foundation & Data Architecture — Current Milestone

### Documentation Foundation

- [x] Generate `agent.md` as the AI behavior rulebook and coding guardrail source.
- [x] Generate `product-spec.md` as the functional UX/product specification.
- [x] Generate `architecture.md` as the structural engineering and deployment blueprint.
- [x] Generate `progress.md` as the live Agile tracker and session memory log.

### Static Project Framework

- [x] Create `/index.html` as the main application entry point.
- [x] Add Vercel-safe relative asset links from `/index.html` to `./css/styles.css` and `./js/app.js`.
- [x] Build the static shell layout with Header, Sidebar, Main Workspace, and contextual modal/drawer mount points.
- [x] Implement Header structure with `LaunchFlow` branding, global search input, notifications icon, settings icon, and user avatar dropdown.
- [x] Implement Sidebar container using the configured sidebar width and fixed left-panel behavior.
- [x] Implement Main Workspace container with `pl-[260px]` offset behavior.
- [x] Add KPI row placeholders for Total Launches, Sourcing, Active PPC, and Avg Conversion Rate.
- [x] Add overall pipeline progress meter placeholder wired for later state injection.
- [x] Add empty DOM containers for visible stage accordion rendering.
- [x] Add empty DOM containers for contextual field/task forms or drawers.

### Styling Foundation

- [x] Create `/css/styles.css` for Tailwind layers, standard custom styles, scrollbar behavior, and app-level base rules.
- [x] Preserve LaunchFlow design tokens and avoid component-level raw hex usage where tokens exist.
- [x] Confirm Inter font usage across the app shell.
- [x] Confirm Material Symbols Outlined icon rendering pattern.
- [x] Add minimal reduced-motion-safe transition utilities for stage reveals and checklist completion styling.
- [x] Add safe empty/loading/error visual states using existing surface and text tokens.

### State Engine Foundation

- [x] Create `/js/store.js` as the localized state engine.
- [x] Define canonical 14-stage array with stable IDs, labels, stage indexes, and phase metadata.
- [x] Define global app state object with `products` array and `activeProductId`.
- [x] Define product entity shape with `id`, `name`, `asin`, canonical `current_active_stage_index`, normalized `current_stage_index` alias support, and `stage_blocks`.
- [x] Define stage block shape with `stage_id`, `is_expanded`, `custom_fields`, and `checklist_tasks`.
- [x] Define custom field shape with `field_id`, `label`, `type`, and `value`.
- [x] Define checklist task shape with `task_id`, `task_name`, and `is_completed`.
- [x] Add default state factory for a first demo product.
- [x] Add stage block initializer that creates exactly 14 stage blocks per product.
- [x] Add state normalization for missing products, missing stage blocks, invalid stage indexes, missing field arrays, and missing task arrays.
- [x] Clamp `current_stage_index` / `current_active_stage_index` to integer values from 1 through 14.
- [x] Add immutable mutation helpers for active product updates.
- [x] Add ID generation helper for products, fields, and tasks.
- [x] Add local persistence adapter with safe browser guards for `localStorage`.
- [x] Add fallback default state if persisted state is missing, malformed, or unavailable.

### Core Store Mutations

- [x] Implement `getActiveProduct()` selector.
- [x] Implement `getVisibleStages(product)` selector.
- [x] Implement `getStageBlock(product, stageId)` selector.
- [x] Implement `advanceProductStage(productId)` mutation.
- [x] Implement `toggleStageExpanded(productId, stageId)` mutation.
- [x] Implement `addCustomField(productId, stageId, fieldConfig)` mutation.
- [x] Implement `updateCustomFieldValue(productId, stageId, fieldId, value)` mutation.
- [x] Implement `addChecklistTask(productId, stageId, taskName)` mutation.
- [x] Implement `toggleChecklistTask(productId, stageId, taskId)` mutation.
- [x] Implement `calculateStageProgress(product, stageId)` selector.
- [x] Implement `calculateOverallPipelineProgress(product)` selector.
- [x] Implement `subscribe(listener)` / `notify()` pattern or equivalent render-trigger mechanism.

---

## Phase 2: Progressive UI & Hidden Stages Engine — Next Up

### Rendering Controller

- [x] Create `/js/app.js` as the core app controller.
- [x] Wire DOM selection for Header, Sidebar, Workspace, KPI row, progress meter, and contextual form containers.
- [x] Initialize state from `/js/store.js` on page load.
- [x] Add single `renderApp()` entry point for deterministic UI refreshes.
- [x] Ensure all render flows fail safely if the active product is missing.
- [x] Ensure all event handlers are registered without duplicate listener stacking after re-renders.

### Progressive Disclosure Rendering Rules

- [x] Implement stage rendering loop over the canonical 14-stage array.
- [x] Add hard stop rule: if `stage_index > current_stage_index`, break or omit markup generation entirely.
- [x] Confirm hidden future stages are not rendered in the Workspace DOM.
- [x] Confirm hidden future stages are not rendered in the Sidebar DOM.
- [x] Confirm hidden future stages are not rendered inside dropdown options, search results, templates, offscreen containers, or accessibility tree.
- [ ] Add DOM audit helper or manual QA checklist to verify future-stage omission.
- [x] Keep all stage order rendering chronological and index-driven.

### Sidebar Navigation Component

- [ ] Create `/js/components/sidebar.js`.
- [x] Render only visible stages from `getVisibleStages(activeProduct)`.
- [x] Render active/selected stage state.
- [ ] Render stage progress indicator or compact status marker where available.
- [x] Add keyboard-accessible stage navigation behavior.
- [x] Add `aria-current` to selected stage item.
- [x] Ensure sidebar uses the same visible stage selector as the Workspace.
- [x] Ensure sidebar never owns a duplicate stage array.

### Workspace Stage Rendering

- [ ] Create `/js/components/workspace.js`.
- [x] Render KPI summary row from current state.
- [x] Render overall pipeline progress meter using `current_stage_index / 14`.
- [x] Render visible stage accordion cards in chronological order.
- [x] Render empty state when no active product exists.
- [x] Ensure Workspace never renders stages beyond `current_stage_index`.
- [x] Ensure Workspace re-renders immediately after every state mutation.

### Advance to Next Stage Engine

- [x] Add `Advance to Next Stage` action for the current active stage.
- [x] Hide the advance button when the product reaches Stage 14.
- [x] Prevent stage skipping.
- [x] Prevent stage index overflow above 14.
- [x] Persist stage advancement to the active product object.
- [x] Re-render Sidebar immediately after advancement.
- [x] Re-render Workspace immediately after advancement.
- [x] Update overall pipeline progress immediately after advancement.
- [ ] Add optional smooth reveal animation for newly visible stage.
- [x] Respect reduced-motion preferences for reveal animation.

### Search Visibility Guardrails

- [x] Implement global search input state.
- [x] Scope search to active product and visible stages only.
- [x] Search visible stage labels, custom field labels, custom field values, and checklist task names.
- [x] Prevent search from exposing hidden future-stage data.
- [x] Render compact empty result state when no visible matches exist.

---

## Phase 3: Dynamic Inputs & Ad-Hoc Checklists — Backlog

### Accordion Stage Cards

- [ ] Create `/js/components/stageAccordion.js`.
- [x] Render stage header with stage index, label, progress, and expand/collapse control.
- [ ] Wire `is_expanded` state to each stage block.
- [x] Preserve accordion state across re-renders.
- [x] Add `aria-expanded` and `aria-controls` support.
- [x] Keep accordion state separate from progressive visibility state.
- [x] Ensure collapsed visible stages remain rendered while hidden future stages remain omitted.

### Dynamic Infinite Custom Field Generator

- [ ] Create `/js/components/customFields.js`.
- [x] Render `+ Add Custom Field` action inside every visible expanded stage.
- [x] Create inline config form, modal, or drawer for Field Name and Field Type.
- [x] Support strict field type dropdown values: `TEXT`, `NUMBER`, `LINK`, `CURRENCY`, `WEIGHT`, `SIZING`, `DATE`.
- [x] Validate Field Name as required and trimmed.
- [x] Validate Field Type against strict enum values.
- [x] Append new field objects into the active stage block's `custom_fields` array.
- [x] Render newly added field immediately in the active DOM block.
- [x] Ensure no metadata fields are pre-rendered by default.
- [x] Ensure adding fields to hidden stages is impossible through the UI.
- [x] Add field value update handling for each supported type.
- [x] Add safe LINK validation and clickable anchor rendering.
- [x] Add CURRENCY formatting and numeric-value preservation.
- [x] Add WEIGHT value/unit handling.
- [x] Add SIZING dimension/unit handling.
- [x] Add DATE rendering with native `input[type="date"]`.
- [x] Persist field additions and field value edits through store mutations.

### Contextual Forms / Drawers

- [ ] Create `/js/components/forms.js` or `/js/components/drawer.js` for reusable contextual input UI.
- [x] Support Add Custom Field config flow.
- [ ] Support optional Add/Edit Task config flow if task creation expands beyond inline input.
- [x] Add Save handling after validation succeeds.
- [ ] Ensure Cancel discards temporary draft state.
- [x] Ensure Save mutates state only after validation succeeds.
- [x] Add accessible labels and focus states for field/task forms.
- [ ] Ensure active product changes close or safely reset open form state.

### Bottom-Aligned Ad-Hoc Stage Checklist

- [ ] Create `/js/components/checklist.js`.
- [x] Render checklist section at the bottom of every visible expanded stage dropdown.
- [x] Render task text input and `+ Add Task` button.
- [x] Allow Enter key submission when focus is inside task input.
- [x] Validate task name as required and trimmed.
- [x] Append new task objects into the active stage block's `checklist_tasks` array.
- [x] Clear task input after successful task creation.
- [x] Render task rows with custom checkbox input.
- [x] Toggle `is_completed` through store mutation.
- [x] Apply strikethrough visual state when complete.
- [x] Remove strikethrough visual state when reopened.
- [x] Recalculate parent stage progress immediately after every toggle.
- [x] Update overall visible-task metrics immediately after every toggle.
- [ ] Add optional task delete action.
- [ ] Add optional task edit action.
- [x] Persist checklist additions and completion toggles.

### Progress Metric Integration

- [x] Wire stage progress into each stage accordion header.
- [x] Wire checklist completion into sidebar compact indicators.
- [x] Wire overall pipeline progress into the main progress meter.
- [x] Add global checklist completion metric for visible stages.
- [x] Ensure progress does not depend on hidden future-stage DOM nodes.
- [x] Ensure stages with zero tasks display `No tasks yet` safely.

### KPI Integration

- [ ] Implement Total Launches metric from products array length.
- [ ] Implement Sourcing metric from products in sourcing-related stages.
- [ ] Implement Active PPC metric from products in Campaign Prep, Launch, Stable, or Scaling.
- [ ] Implement Avg Conversion Rate placeholder with safe empty value until conversion data exists.
- [ ] Ensure KPI failures do not block Workspace rendering.

### Persistence & Recovery

- [ ] Persist global app state after every successful mutation.
- [ ] Load persisted state on app initialization.
- [ ] Recover gracefully from malformed persisted JSON.
- [ ] Add state version field if migrations become necessary.
- [ ] Add local-only save failure messaging if browser storage is unavailable.

### Integration Testing & QA

- [ ] Verify initial product renders only Stage 1.
- [ ] Verify Stage 3 product renders only Stages 1 through 3.
- [ ] Verify Stage 14 product renders all stages.
- [ ] Verify hidden stages do not appear in DOM queries.
- [ ] Verify hidden stages do not appear in Sidebar.
- [x] Verify hidden stages do not appear in search results.
- [ ] Verify Advance to Next Stage reveals exactly one stage.
- [x] Verify Add Custom Field appends field to the correct stage only.
- [x] Verify all field types render correct inputs.
- [x] Verify Add Task appends task to the correct stage only.
- [x] Verify checkbox toggle applies/removes strikethrough instantly.
- [x] Verify checklist toggle updates stage progress instantly.
- [ ] Verify local persistence survives page refresh.
- [ ] Verify app recovers from missing or malformed persisted data.
- [ ] Verify keyboard accessibility for Header controls, Sidebar navigation, accordions, forms, and checklist inputs.

### GitHub & Vercel Readiness

- [ ] Initialize Git repository if not already initialized.
- [ ] Commit documentation files: `agent.md`, `product-spec.md`, `architecture.md`, and `progress.md`.
- [ ] Commit static app scaffold files.
- [ ] Push repository to GitHub.
- [ ] Connect GitHub repository to Vercel.
- [ ] Confirm Vercel preview deployment on push.
- [ ] Confirm all asset paths are relative and case-correct.
- [ ] Confirm app loads from Vercel preview URL without missing assets.
- [ ] Confirm no build step is required unless intentionally configured.
- [ ] Confirm no unguarded build-time variables can crash deployment.
- [ ] Confirm production deployment after preview validation.

---

## Current Blockers

- [ ] No code repository files have been generated yet in the working app scaffold.
- [ ] Tailwind configuration details must be verified in the actual repo before final class enforcement.
- [ ] Persistence target is currently local-first; remote database/API layer remains undefined.
- [ ] Authentication/user profile behavior is currently shell-level only.

---

## Decisions Locked So Far

- [x] Use a strict 14-stage chronological launch lifecycle.
- [x] Use `current_stage_index` / `current_active_stage_index` as the single progressive disclosure driver.
- [x] Completely omit future stages from the DOM.
- [x] Store custom fields inside stage blocks.
- [x] Store checklist tasks inside stage blocks.
- [x] Use dynamic custom fields instead of default hardcoded stage forms.
- [x] Use ad-hoc checklists at the bottom of each visible stage dropdown.
- [x] Optimize for Vercel deployment through clean relative paths and safe default state.

---

## Definition of Done for Initial MVP

- [ ] App shell loads from `/index.html` with no console-breaking errors.
- [ ] Header, Sidebar, Workspace, and contextual form areas render correctly.
- [ ] Active product state initializes safely.
- [ ] Only stages up to the active product stage render into DOM.
- [ ] Advance button reveals one next stage at a time.
- [ ] Visible stages support accordion expansion.
- [ ] Visible stages support dynamic custom field creation.
- [ ] Visible stages support ad-hoc checklist task creation.
- [ ] Checklist completion updates stage progress instantly.
- [ ] State persists locally and reloads safely.
- [ ] GitHub push triggers successful Vercel preview deployment.
- [x] No hidden future stages leak through DOM, Sidebar, search, or accessibility tree.

---

## Next Session Start Checklist

1. Read `agent.md` for coding behavior rules.
2. Read `product-spec.md` for functional UX rules.
3. Read `architecture.md` for file structure and schema rules.
4. Read this `progress.md` to identify the next unchecked dependency.
5. Work from Phase 1 downward unless the user explicitly reprioritizes.
6. Update this file after each completed implementation step.

### 2026-06-18 — Normalized Supabase Product Schema

- [x] Added `supabase/schema/005_normalized_launchflow_tables.sql` to replace the temporary JSONB bridge with normalized product, stage, custom field, checklist, launch monitoring, campaign prep, and Vine feedback tables.
- [x] Kept `workspace_app_state` documented as a migration/fallback bridge until the frontend completes normalized table reads/writes.
- [ ] Wire frontend persistence from `workspace_app_state` to the normalized Supabase tables.
- [ ] Backfill existing JSONB snapshots into normalized rows after validating production data shape.

### 2026-06-18 — USER-Level Supabase Field Editing Fix

- [x] Allowed active Supabase `user` workspace members to edit workspace field data in the frontend permission checks.
- [x] Added `supabase/schema/006_allow_user_workspace_state_edits.sql` to update existing `workspace_app_state` RLS policies for USER-level shared field saves.
- [x] Updated the normalized schema draft so future normalized table writes allow active `owner`, `admin`, and `user` editors while keeping `viewer` read-only.

### 2026-06-18 — Vercel Blank Page Guardrails

- [x] Added a Vercel build/check script so JavaScript syntax regressions fail deployment instead of publishing a blank page.
- [x] Added a static app boot fallback that remains visible if the JavaScript module fails before LaunchFlow can render.
- [x] Hardened Supabase shared workspace refresh so unexpected refresh errors cannot leave refresh state stuck.

### 2026-06-18 — Vercel Output Directory Fix

- [x] Added `vercel.json` so Vercel publishes the repository root instead of looking for a generated `public` directory after the build check completes.

### 2026-06-18 — Supabase Field Typing Sync Stabilization

- [x] Debounced shared workspace field saves and serialized Supabase writes so older partial keystroke payloads cannot overwrite newer completed field values.
- [x] Skipped auto-refresh while workspace field edits or pending workspace writes are active to prevent remote stale data from cutting off in-progress typing.
- [x] Added a lightweight periodic refresh for visible Supabase sessions so other users see saved workspace field changes without waiting for a tab refocus.

### 2026-06-18 — Refresh-Safe Workspace Field Persistence

- [x] Added a local dirty marker for workspace details so refreshed Supabase sessions upload unsynced local field edits before applying remote state.
- [x] Flush pending shared-state writes on page hide/unload to reduce the chance of losing recent edits during refreshes.

### 2026-06-18 — Disable Background Polling Overwrites

- [x] Removed periodic shared-state polling because it could apply stale remote JSONB a few seconds after a local field edit and make text disappear before a save completed.
- [x] Kept focus/visibility refresh guards so workspace state still refreshes when returning to the tab, but not continuously while actively editing.

### 2026-06-18 — Version-Aware Cross-User Workspace Sync

- [x] Added version-aware `workspace_app_state.updated_at` reads so remote Chaim/Ruben changes apply only when they are newer than the last applied state.
- [x] Re-enabled guarded shared-state refresh for cross-user/viewer updates without allowing stale JSONB to overwrite active or pending field edits.
- [x] Compared local dirty timestamps against remote update timestamps so stale local dirty state cannot overwrite newer remote edits.

### 2026-06-18 — Cross-Account Stale Dirty Recovery

- [x] Changed remote update application to react to changed `updated_at` values instead of only strictly greater timestamps, so locally stored fallback timestamps cannot block newer Chaim/Ruben updates.
- [x] Added stale dirty recovery so old unsynced browser state cannot keep overwriting or hiding newer remote workspace edits after the local grace window passes.

### 2026-06-18 — Supabase Session Refresh for Cross-Browser Sync

- [x] Added Supabase access-token refresh before shared-state reads/writes so older browser sessions can continue receiving and saving workspace updates.
- [x] Retried workspace state REST reads/writes once after a 401 by refreshing the Supabase session, preventing expired tokens from silently blocking Chaim/Ruben sync.

### 2026-06-18 — Modal Form Draft Preservation

- [x] Stored Add/Edit Product modal text fields in UI draft state so background renders cannot clear typed Product Name, SKU, or ASIN values.
- [x] Paused shared-state refresh while modal/form drafts are open to avoid clearing in-progress form inputs such as product image/file selections.
