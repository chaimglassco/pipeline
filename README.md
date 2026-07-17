# LaunchFlow

**LaunchFlow** is an Amazon Product Launch Pipeline Web Application designed to help e-commerce teams track product launch stages, dynamic stage data, checklist execution, and launch progress in a clean multi-panel workspace.

This repository is built with a beginner-friendly, step-by-step workflow. The project owner has zero coding experience, so implementation notes, debugging, Git, GitHub, and Vercel steps should be explained plainly and one step at a time.

---

## Current Implementation Snapshot

LaunchFlow is now a vanilla HTML/CSS/JavaScript app with Vercel serverless APIs for shared team login, shared workspace sync, upload handling, backups, and disaster recovery.

Current production target:

```txt
GitHub: chaimglassco/pipeline
Vercel: glasscopipeline.vercel.app
Local path: C:\Users\HomePC\Documents\GitHub\pipeline
```

Major implemented areas:

- 14-stage Amazon launch pipeline with progressive stage visibility.
- Product list panel, product cards, product workspace, stage movement, product image upload, SKU/ASIN handling, product chat, and product card history/restore.
- Shared custom stage fields with many field types, including dropdowns, tables, files, image gallery, payment/transaction records, checklist notes, shipment tracker, listing content, and keyword tracking.
- Custom field history/restore, stage history, deleted-field restore, table-cell history, and multi-short-bar history.
- Remote auth/team users with ADMIN, USER, and VIEWER roles through Vercel APIs and database-backed users.
- Shared remote workspace sync through `api/workspace-state.js`.
- Supabase Postgres is the canonical shared workspace for ADMIN and USER accounts; browser storage is only a local cache.
- Scoped shared saves protect product, stage, and individual field/table changes from delayed stale-browser overwrites.
- Shared Workspace Audit records product mutations, explicit admin publishes, backup restores, and save conflict/retry outcomes.
- Workspace disaster recovery through Settings > Backups, automatic/manual restore points, JSON download, and before-restore safeguards.
- File/image disaster recovery through database-backed storage assets and `storageAssets` in downloaded backup JSON.
- Serverless upload proxy and asset serving through `api/storage-upload.js` and `api/storage-asset.js`.
- Vercel-safe boot/recovery behavior to reduce blank-page failures.
- Shared admin/USER workspace behavior: users share products, stage data, recovery state, product chat, product images, and workspace details, with admin-only controls preserved where intended.
- USER accounts can adjust workspace table sheets, including row/column add/remove, header edits, reorder, and resize.
- Product images and profile avatars are stored with remote metadata so they survive refresh, logout/login, and cross-account workspace sync.
- Campaign Preparation and Enrolled to Vines metrics are product-specific; new products start with blank/zero metric cards instead of inheriting old global/demo values.
- Shipping has a built-in per-product Shipping Timeline with a shipping-date calendar, expected-days input, expected-arrival calculation, and animated current-day route marker.
- Under Final Order and Shipping are separate records: moving a product into Shipping no longer copies payment/order fields from Under Final Order.

Current important note:

```txt
Before starting new work, run git status --short --branch.
At the last documentation handoff, recent app fixes were committed and pushed through commit eb3833a.
```

---

## Project Vision

LaunchFlow exists to give Amazon operators, brand teams, and e-commerce managers a focused launch command center that shows only the work that matters right now.

Instead of displaying an overwhelming full pipeline, LaunchFlow progressively reveals each product launch stage only when the product reaches that stage. The system combines stage-based progress tracking, flexible custom metadata, and ad-hoc checklist execution into one minimal operating dashboard.

The long-term vision is to make LaunchFlow a practical product launch operating system for Amazon sellers, agencies, and brand teams that need repeatable launch workflows without rigid, hardcoded forms.

---

## Business Goals

LaunchFlow should help users:

- Reduce launch-management clutter by hiding unreached future stages.
- Track every product through a strict 14-stage Amazon launch lifecycle.
- Capture product-specific details without requiring hardcoded form fields.
- Add checklist tasks as real launch work appears.
- Instantly see progress changes as checklist tasks are completed.
- Keep launch teams aligned on what stage each product is currently in.
- Prepare the app for future persistence through local storage, database storage, or cloud APIs.
- Deploy safely through GitHub and Vercel.

---

## Product Goals

The application must provide:

1. A clean fixed-header, fixed-sidebar, main-workspace layout.
2. A strict chronological 14-stage launch pipeline.
3. Product-level progressive stage disclosure.
4. Stage-specific dynamic custom fields.
5. Stage-specific ad-hoc checklist tasks.
6. Instant stage progress recalculation.
7. A global KPI and progress summary area.
8. A beginner-friendly codebase that can be built step by step.
9. Vercel-safe static/frontend deployment behavior.

---

## Core Business Logic

LaunchFlow is built around three non-negotiable mechanics.

### 1. Progressive Stage Disclosure

Each product tracks a current stage number:

```js
current_stage_index
```

Only stages with an index less than or equal to the product's current stage may render.

Example:

```js
visibleStages = allStages.filter(stage => stage.index <= activeProduct.current_stage_index);
```

If a product is at Stage 3, the UI may render:

```txt
1. Product Research
2. Product Development
3. Supplier Sourcing
```

The UI must not render stages 4 through 14 in the DOM.

Future stages must not be:

- Hidden with CSS
- Rendered as locked cards
- Rendered as disabled placeholders
- Included in sidebar navigation
- Included in search results
- Included in the accessibility tree

### 2. Dynamic Custom Fields

Each visible stage supports shared custom fields. Admins manage stage field templates; ADMIN and USER accounts can edit permitted product field values.

Allowed field types:

```txt
TEXT
NUMBER
LINK
CURRENCY
WEIGHT
SIZING
DATE
```

Most metadata fields are created through the stage-field controls. A small number of product-stage tools are intentionally built in, including the Under Final Order transaction record, Listing Content Builder, Image Planning tables, and Shipping Timeline.

Custom fields must be stored under the correct stage block.

Example:

```js
{
  field_id: "field_001",
  label: "Supplier Quote",
  type: "CURRENCY",
  value: {
    amount: 12.5,
    currency: "USD"
  }
}
```

### 3. Ad-Hoc Stage Checklists

Every visible stage includes a checklist area at the bottom of its dropdown card.

Users must be able to:

- Type a task name.
- Click `+ Add Task`.
- Add the task to the active stage.
- Check or uncheck the task.
- See strikethrough completion state.
- See the stage progress percentage update instantly.

Checklist tasks must be stored under the correct stage block.

Example:

```js
{
  task_id: "task_001",
  task_name: "Confirm supplier lead time",
  is_completed: false
}
```

---

## App Layout

LaunchFlow uses a multi-panel application shell.

### Header / Top Navigation

The top navigation contains:

- LaunchFlow branding
- Global search input
- Notifications icon
- User profile avatar dropdown

Required layout behavior:

```txt
h-16
sticky top-0 z-50
```

### Panel 1: Left Navigation Sidebar

The sidebar contains only the product stages currently visible to the active product.

Required layout behavior:

```txt
w-sidebar_width
fixed left-0 top-16 z-20
```

Sidebar width:

```txt
260px
```

Sidebar color intent:

```txt
#0052cc
```

### Panel 2: Main Workspace

The main workspace contains:

- Global product launch KPI cards
- Overall pipeline progress meter
- Cascading visible stage dropdown cards

Required layout behavior:

```txt
pl-[260px]
```

### Panel 3: Contextual Forms / Drawers

Contextual UI appears when users trigger actions such as:

- Add Custom Field
- Add Task
- Edit Field
- Edit Task

---

## KPI Area

The main workspace should display these launch KPIs at the top:

| KPI | Meaning |
|---|---|
| Total Launches | Total tracked product launches. |
| Sourcing | Products currently in sourcing-related stages. |
| Active PPC | Products currently in campaign or PPC-related launch phases. |
| Avg Conversion Rate | Average conversion rate across tracked launch products when available. |

KPI cards should be safe, read-only summary components. Missing values should show a safe empty state such as `—` instead of crashing the app.

---

## Canonical Pipeline Stages

LaunchFlow uses a strict 14-stage chronological pipeline.

| Index | Stage |
|---:|---|
| 1 | Product Research |
| 2 | Product Development |
| 3 | Supplier Sourcing |
| 4 | Under Final Order |
| 5 | Shipping |
| 6 | Keyword Research |
| 7 | Listing Creation |
| 8 | Image Planning |
| 9 | Campaign Prep |
| 10 | Amazon Inbound |
| 11 | Enrolled to Vines |
| 12 | Launch |
| 13 | Stable |
| 14 | Scaling |

The stage order must never be changed unless the product specification is intentionally updated.

---

## Data Model Overview

The global app state should follow this general shape:

```js
const appState = {
  products: [],
  activeProductId: null
};
```

Each product should follow this general shape:

```js
const product = {
  id: "product_001",
  name: "Sample Product",
  asin: "",
  current_stage_index: 1,
  stage_blocks: []
};
```

Each product must have 14 stage blocks available in data, but the UI must only render visible stage blocks.

Each stage block should follow this shape:

```js
const stageBlock = {
  stage_id: "product-research",
  is_expanded: true,
  custom_fields: [],
  checklist_tasks: []
};
```

---

## Current Documentation Set

The following project files define how LaunchFlow should be built and maintained:

| File | Purpose |
|---|---|
| [`agent.md`](./agent.md) | Behavioral rulebook for the AI coding agent. |
| [`product-spec.md`](./product-spec.md) | Functional product and UX specification. |
| [`architecture.md`](./architecture.md) | Repository structure, data schema, rendering rules, and Vercel constraints. |
| [`progress.md`](./progress.md) | Live project tracker and session memory log. |
| [`README.md`](./README.md) | Human-facing project overview and setup guide. |

The AI coding agent should read these files before making implementation decisions.

---

## Beginner Build Protocol

The project owner has zero coding experience, so every build session must follow this workflow:

1. Show only the first/current step.
2. Explain the step in plain language.
3. Provide the exact file, folder, command, or code needed.
4. Wait for the current step to be completed or confirmed.
5. Do not introduce the next step early.
6. Avoid overwhelming the user with long multi-step instructions unless they explicitly ask for the full roadmap.

This rule applies to setup, coding, GitHub usage, Vercel deployment, debugging, and testing.

---

## Planned Technology Stack

LaunchFlow is currently planned as a lightweight frontend-first web application optimized for GitHub and Vercel.

Expected stack:

- **Source Control:** Git and GitHub
- **Deployment:** Vercel
- **Frontend:** HTML, CSS, JavaScript
- **Styling:** Custom CSS with shared design tokens
- **State Engine:** Local JavaScript store module
- **Persistence:** Supabase Postgres shared workspace through Vercel APIs, with browser storage used as a cache/fallback only

The final tooling may evolve during implementation, but all changes must remain compatible with the architecture and deployment rules defined in `architecture.md`.

---

## Planned Repository Structure

The intended project structure is:

```txt
/
├── index.html
├── README.md
├── agent.md
├── product-spec.md
├── architecture.md
├── progress.md
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── store.js
    └── components/
        ├── header.js
        ├── sidebar.js
        ├── workspace.js
        ├── stage-card.js
        ├── custom-field-form.js
        └── checklist.js
```

Additional build files may be added as needed, such as:

```txt
package.json
tailwind.config.js
postcss.config.js
.gitignore
.env.example
vercel.json
```

These should be introduced step by step during the build process.

---

## Design System Requirements

LaunchFlow uses an extended Tailwind configuration with Material Design 3-inspired naming.

Required typography utilities:

```txt
text-headline-md
text-body-md
text-label-md
text-label-sm
```

Required layout utilities:

```txt
w-sidebar_width
px-lg
gap-md
pl-[260px]
```

Required surface utilities:

```txt
bg-surface-container-lowest
bg-surface-container-low
```

Required icon pattern:

```html
<span class="material-symbols-outlined">icon_name</span>
```

Do not replace the icon system with other icon libraries unless the specification changes.

---

## Local Development

From the repo root:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```txt
http://127.0.0.1:4173/index.html
```

Main check commands:

```powershell
node --check .\js\app.js
node --check .\js\store.js
node --check .\js\constants\stages.js
node --check .\api\workspace-state.js
node --check .\api\storage-upload.js
node --check .\api\storage-asset.js
npm.cmd run build --if-present
git diff --check
```

Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.

---

## Deployment Model

LaunchFlow is intended to deploy through this flow:

```txt
Local project files
→ Git commit
→ GitHub repository
→ Vercel preview deployment
→ Production deployment
```

All source paths should use clean relative links to avoid deployment issues.

Vercel build safety rules:

- Avoid broken imports.
- Avoid absolute local machine paths.
- Avoid missing files referenced by HTML, CSS, or JavaScript.
- Avoid unsafe environment variable assumptions.
- Avoid browser/server boundary issues if a framework is later introduced.
- Keep the app buildable from a clean GitHub clone.

---

## Current Project Status

Current milestone:

```txt
Active prototype / production-hardening phase
```

The app is no longer just Phase 1 foundation work. Current work is focused on:

- Shared multi-user reliability.
- Product save and stage-move sync reliability.
- History and restore coverage.
- Backup/download/restore safety.
- File and image disaster recovery.
- Product-specific stage metric correctness.
- Profile/team account polish.
- Keeping GitHub/Vercel deployment stable.

Before starting each build session, check `handoff.md` for current active context.

Recent production-hardening work includes:

- Profile avatars persist remotely and render in the header profile icon.
- Product image references are protected during shared workspace sync and cannot be wiped by stale local snapshots unless the user explicitly deletes the image.
- USER accounts can adjust workspace table sheets while broader field/template and tab structure controls remain admin-owned.
- Campaign Preparation and Enrolled to Vines numeric cards are saved per product.
- The Launch metric add control is now an icon-only `+` button.
- The top-right account pill now keeps only profile and logout actions.

---

## AI Coding Agent Instruction

Before editing code, the AI coding agent must read:

1. `agent.md`
2. `product-spec.md`
3. `architecture.md`
4. `progress.md`
5. `README.md`

The agent must preserve:

- Beginner step-by-step guidance
- Progressive stage disclosure
- Stage-nested custom fields
- Stage-nested checklist tasks
- Tailwind design token usage
- Vercel-safe relative paths
- Small, precise file changes

---

## Final Product Definition

LaunchFlow is a focused Amazon product launch pipeline system that shows only the work that matters now.

Its defining behavior is simple:

```txt
A product starts at Stage 1.
Users add fields and tasks as needed.
Users complete checklist items.
Users advance one stage at a time.
The interface reveals only the stages the product has reached.
```

Every file, component, and feature should protect this workflow.

---

## GitHub Web Sync Note

When updates are created from the hosted coding workspace, GitHub web will only show them after the workspace publishes the branch as a pull request. If the GitHub web UI does not show a new pull request yet, refresh the repository Pull Requests page and look for the latest PR title from the coding workspace.

## Git Push Note

The expected push target is:

```txt
https://github.com/chaimglassco/pipeline.git
```

If push fails with a message like:

```txt
Permission to chaimglassco/pipeline.git denied to rubentiongson
```

the terminal is authenticated as the wrong GitHub account. Switch credentials to an account with write access to `chaimglassco/pipeline`, then retry the push.
# Unified Glassco applications

The Pipeline deployment is the canonical Glassco entry point. Its sidebar application selector opens either Product Pipeline at `/` or the PPC Dashboard mounted at `/ppc/library`. The PPC interface remains an independently deployed Next.js application and is served under this origin through the `/ppc/:path*` Vercel rewrite.

The selector remembers the last valid route for each application in `glassco.appRoutes.v1`. Pipeline remains the default landing application after login.
