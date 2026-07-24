# Pipeline Handoff for a New Codex Chat

## Current status — July 24, 2026

- Repository: `C:\Users\HomePC\Documents\GitHub\pipeline`
- GitHub: `https://github.com/chaimglassco/pipeline.git`
- Branch: `main`
- Latest local and pushed commit: `b7cae6a`
- `main`, `origin/main`, and `origin/HEAD` were aligned before this documentation update.
- The working tree was clean before `HANDOFF.md` and `README.md` were updated.
- Production target: `glasscopipeline.vercel.app`
- The production deployment status of commit `b7cae6a` was not rechecked during this documentation-only turn.
- No unfinished code implementation is pending from the previous chat.

Start every new coding session with:

```powershell
Set-Location "C:\Users\HomePC\Documents\GitHub\pipeline"
git status --short --branch
git log -1 --oneline
```

## Repository boundaries

Use this repository for:

- Product Pipeline
- Shared workspace state and product data
- Product deletion/history
- Landed COGS calculator and template
- The unified Glassco header/navigation gateway
- Pipeline-side API routes, including shared workspace and Library API support

The separately deployed Team SOP Library/PPC application is in:

```text
C:\Users\HomePC\Documents\GitHub\library
```

Do not edit the Library repository for Pipeline/COGS work. Do not edit this Pipeline repository for Library document-builder UI work unless the requested change is specifically to the Pipeline API, proxy, session handoff, or unified navigation.

## Application architecture

This is a vanilla HTML/CSS/JavaScript application with Vercel serverless API routes.

Important files:

- `index.html` — static entry point and frontend runtime configuration
- `js/app.js` — main UI, event handling, modals, workspace sync, COGS UI
- `js/store.js` — core product and stage state
- `js/constants/stages.js` — canonical 14-stage pipeline
- `js/product-defaults.mjs` — clean defaults for new product tables/fields
- `js/cogs-calculator.mjs` — COGS normalization, validation, and calculations
- `js/cogs-template.mjs` — shared COGS category/row template helpers
- `css/styles.css` — all UI styling
- `api/workspace-state.js` — canonical shared Pipeline workspace endpoint
- `api/library-state.js` — authoritative Team SOP Library state endpoint
- `api/storage-upload.js` / `api/storage-asset.js` — uploaded asset handling
- `scripts/check-*.js` / `scripts/check-*.mjs` — contract and regression checks
- `vercel.json` — cache headers and `/ppc/:path*` proxy rewrite

## Most recent completed work

### 1. Landed COGS calculator

The COGS card in each product header opens an itemized Landed COGS calculator.

Current behavior:

- COGS is saved as one product-launch worksheet per product; shipment history is not exposed.
- The worksheet has one Total order units input and fixed USD calculations.
- Expense rows show Expense name, Amount, Basis, calculated Cost / Unit, and note/clear actions.
- Each expense row supports Amount, Basis, calculated Cost/Unit, a note icon, and Clear.
- `Batch Total` is the default and divides the amount across the worksheet’s Total order units.
- `Per Unit` uses the entered amount directly.
- Cost categories are blue, compact, and independently collapsible.
- Categories start collapsed when the calculator/batch editor opens.
- Saved historical batches remain intact.

Latest simplification:

- Provider was removed from the visible row UI.
- Rate to USD was removed from the visible row UI.
- The underlying legacy fields remain in the data model so existing historical batches are not destructively rewritten.
- New USD rows still default to `exchangeRate: 1`.
- Notes now use an icon in the row action area.
- Clicking the note icon opens a dedicated note popup.
- A populated note changes the icon state.
- The `Other` row’s custom cost name remains editable inside the note popup.
- Opening/closing the note popup preserves the COGS modal’s internal scroll position.

### 2. Shared COGS template

Administrators can edit the unified COGS structure inline inside the calculator.

Current behavior:

- The eye icon enters template edit mode; the pencil state indicates editing.
- The top `+` adds a category.
- Each expanded category has a bottom `+` to add a row.
- New rows append at the bottom, use the default name `New Row`, focus/select the name, and do not jump the modal to the top.
- Categories and rows can be created, renamed, reordered, and deleted.
- Rows support a default Basis.
- The old Move to Category column was removed from the inline editor.
- Template edit mode shows product-batch Amount alongside the row when a batch is open.
- The calculated Per Unit output appears only when the default Basis is `Batch Total`; otherwise it shows a dash.
- Save publishes the staged template; Cancel discards structural edits.
- Only ADMIN accounts can publish the shared template.
- USER/stale payloads cannot overwrite `cogsTemplateSettings`.
- Open unsaved batches reconcile by stable row IDs after template changes.
- Populated rows removed from the template are preserved as historical legacy extras.

### 3. New-product defaults and legacy prefilled rows

New products no longer receive unwanted demo data in the targeted tables:

- Product Research — Competitors Quick Details
- Product Development — Competitors Specs row labels
- Supplier Sourcing — supplier row values
- Enrolled to Vines — review/feedback defaults

The repair logic also prevents manually cleared legacy prefilled values from being reintroduced on older products.

Do not remove defaults from unrelated tables. Some tables intentionally require predefined rows and columns.

### 4. Product deletion

- Deleting a product requires a confirmation popup.
- The deletion flow includes progress/success handling.
- Deleted products remain available through product history/recovery until permanently purged.

### 5. Team SOP Library and unified Glassco navigation

- Pipeline is the canonical Glassco entry point.
- Header tabs: Product Pipeline, Team SOP Library, PPC Dashboard.
- Team SOP Library uses `/ppc/library/*`.
- PPC Dashboard uses `/ppc/dashboard` and may still be a placeholder.
- `/ppc/:path*` is proxied to `https://glasscoppc.vercel.app/ppc/:path*`.
- Session-only login handoff uses a short-lived, target-scoped, one-use record.
- Persistent “Remember me” sessions retain their normal behavior.
- The Library state API includes versioning, scoped mutations, role enforcement, timeouts/cancellation, ADMIN-only deletion attribution, atomic recovery of migration-deleted documents, and non-destructive backup merging.
- Direct document deletes record the user identity and reason. A narrowly matched, idempotent audit backfill identifies the July 22 same-time initialization deletions; unmatched historical tombstones remain `unknown`.
- Deploy the Pipeline API changes before the Library UI changes so `deletionAudit` and `documents.restoreSystemDeleted` are available first.

## Shared workspace and data-safety rules

- Supabase/Postgres-backed shared state is the team source of truth.
- Browser storage is a local cache/fallback, not the canonical multi-user database.
- Preserve scoped product/stage/field saves; do not return to whole-workspace last-write-wins behavior.
- Preserve ADMIN-only controls and server-side enforcement.
- Product images, profile avatars, gallery media, and attachments use uploaded storage metadata, not durable base64 blobs.
- Stale local snapshots must not erase existing remote product images.
- Do not silently fall back to local-only data for a feature the user expects to sync across accounts.
- Do not destructively rewrite historical COGS batches.

## User UX preferences

- Keep UI compact and screenshot-aligned.
- Prefer icon controls and small popups over large extra panels.
- Use blue category/header bars for clear grouping.
- Keep forms easy to absorb: one cost item per row.
- Successful/destructive operations should show visible progress and success/error feedback.
- Preserve the user’s current tab, category, topic, or scroll position when switching modes.
- Changes must be narrowly scoped; do not alter unrelated tables or stages.
- Explain commands plainly because the owner prefers step-by-step guidance.

## Local development

Serve the repository as a static site from the repo root. Any local static server is acceptable.

Common options:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

or, if Python is unavailable:

```powershell
npx.cmd serve . -l 4173
```

Open:

```text
http://127.0.0.1:4173/
```

Default local/admin credentials:

- Email: `chaim@glasscosupplies.com`
- Password: `Cg.123456`

## Required verification

Run after code changes:

```powershell
npm.cmd run check
git diff --check
git status --short
```

`npm.cmd run check` currently covers:

- JavaScript syntax
- Shared workspace invariants
- Workspace API behavior
- Library API contract and timeout behavior
- Glassco account/navigation contract
- New-product default behavior
- COGS template behavior
- COGS calculator behavior

For UI changes, also test the actual interaction in a browser and inspect console errors.

### COGS browser checks

- Open a product and click its COGS card.
- Add or edit the product’s landed COGS worksheet.
- Expand categories independently.
- Confirm Amount/Basis/Cost per Unit calculate correctly from Total order units.
- Confirm Provider and Rate to USD are not displayed.
- Click a row note icon, enter a note, click Done once, and confirm the icon changes to the populated state.
- Confirm closing the note popup does not jump the calculator to the top.
- Enter template edit mode as ADMIN.
- Add a row and confirm it appears at the category bottom as `New Row`, remains visible, and is ready to rename.
- Cancel template edits when testing unless the test intentionally publishes a shared template.
- Confirm no horizontal overflow around 390px width.

## Latest relevant commits

The recent commit subjects are generic (`message`), so use hashes and file diffs when investigating:

- `b7cae6a` — removed visible Provider/Rate-to-USD controls; added note-icon popup
- `a6cc0d5` — fixed Add Row append/focus/scroll behavior and default `New Row`
- `880fd56` — restored template Amount, removed Move to Category UI, refined Per Unit display
- `efd3966` — inline shared-template editing and collapsible blue category redesign
- `e9f95f2` — shared configurable COGS template, Amazon costs, admin protections
- `0923719` — simplified preset category/row cost layout
- `37484f8` — initial itemized Landed COGS calculator
- `e5b8554` — product deletion confirmation
- `8a75f33` — clean new-product table defaults
- `d6b8ef1` — authoritative Library API and contracts
- `5d2a1e4` — expired workspace-session handling
- `abc2629` — top application tabs
- `f19a7ce` — unified Glassco app gateway

## Deployment and Git

- Do not commit, push, or deploy unless the user explicitly requests it.
- Before deploying, verify the intended Vercel project is `pipeline`.
- A Git push to `main` may trigger Vercel automatically, but do not assume production is current without checking the deployment.
- If push fails with access denied for another GitHub identity, fix terminal credentials; do not rewrite repository history.
- Never use destructive Git commands such as `git reset --hard` or discard unrelated user changes.

## Recommended first response in the new chat

1. Read `handoff.md` and `README.md`.
2. Run `git status --short --branch`.
3. Restate the current repo, branch, latest commit, and whether the tree is clean.
4. Ask what the user wants to work on next, unless they already supplied a concrete request.
