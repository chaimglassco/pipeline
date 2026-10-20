# Deployment Guide

## September 30 weekly metric-order release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, verify the six-week table begins with Total metrics and ends with Traffic metrics in the documented order. Confirm selected-week editing and imported read-only values still map to the correct rows.

## September 30 compact budget-pacing release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, verify the Budget Pacing row recalculates percentage, progress, remaining/overspent balance, elapsed-week burn rate, daily average, and status when spend or cap changes. Expand Budget History to confirm prior cap changes remain available, then check the stacked narrow layout.

## September 29 per-topic formatting release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, verify each Current Week Summary card has its own five text-style controls in the card header and that Add Topic remains in the documentation header. Format selected text in Good and Bad independently, then reload to confirm the saved markup remains.

## September 29 auto-growing summary-composer release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, add enough lines to a Current Week Summary topic to exceed its initial height and confirm the colored card expands to keep every line visible. Reload and confirm the restored content receives the same height.

## September 29 previous-week summary-card release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, select a week whose prior report contains Good and Bad topics and confirm they appear as read-only green and red cards beside Current Week Summary. Legacy plain-text summaries remain visible in a neutral card.

## September 29 compact weekly planning release

This presentation-only release needs no environment, API, database, or storage migration. After deployment, verify Budget Pacing spans the workspace above the two-column Strategic Goals and Action Items row, all planning controls remain editable for authorized users, and the row stacks cleanly at narrow widths. Existing weekly budgets, history, goals, and action items remain compatible.

## September 22 workspace recovery and chunked Products transport

This release makes the Products adapter compatible with Pipeline workspaces larger than the inline response limit. It requests the `binary-v2` workspace manifest and reassembles its versioned chunks server-side; no browser storage migration or new environment variable is required. The shared Pipeline workspace was repaired additively to 23 products, including recovered prior-laptop ASINs `B0D1PHP7HQ` and `B0DYSBW3X5`.

After deployment, authenticate at `/ppc/dashboard`, confirm the Products count is 23, search for `B0D1PHP7HQ` and `B0DYSBW3X5`, and select each recovered product. Confirm the existing 19 products remain visible and that a temporary Pipeline 401 still shows the session-expired message. If the adapter cannot complete chunk assembly, it must show the bounded unavailable state rather than a false empty catalog.

## September 21 account Campaign Compare release

This client-only release adds the Compare tab and browser key `glassco.ppcCampaignAccountSnapshots.v1`. It requires no environment variable, API, database migration, connector request, or Pipeline deployment. After deployment, verify whole-account CSV imports for completed Day, Wednesday–Tuesday Weekly, and calendar Monthly periods, previous-period snapshot reuse, filename validation, mutually exclusive Spend Movement filters, sorting, Show all, and Scale Insights trend links. The existing ASIN-level Products comparison remains available. Rollback may leave harmless local snapshot entries; malformed entries are discarded by the parser.

## September 22 account comparison outcome release

This client-only refinement keeps the same account snapshot key and adds Good/Bad/Neutral outcome filter cards plus Sales, Orders, and Current ACOS table values. It requires no migration or new environment variable. Verify one active outcome card at a time, the existing ASIN comparison, and the expanded table after importing whole-account CSVs.

## September 11 automatic-save and PPC-conversion correction

This release keeps optional `ppcClicks` in the existing weekly-performance DTO and version-1 browser records. It changes the existing advertising request to return one raw ASIN row (`summary_only: false`, `count: 1`, `page: 1`) so exact Clicks can be collected automatically without a third MCP call. It requires no environment variable, database change, storage-key change, or migration. After deployment, verify Refresh Data populates PPC Conversion Rate as a whole percentage with no manual click input; an exact-click omission must remain unavailable with a safe warning.

Also verify the ASIN copy button, whole-number ACOS goal Target, absence of the active-goal count, and the Goal History/Add Goal controls in the upper-right planning header.

## September 11 custom-goal and planning-alignment release

This release adds only the optional `goals[].custom` flag to the existing version-1 browser report. It requires no environment variable, server API, database, storage-key change, or migration. After deployment, add multiple goals and confirm Budget Utilization stays top-aligned; create, reload, resolve, and remove a Custom Goal; then confirm predefined automatic goal Actual values still work.

## September 11 compact-goal and Conversion Rate release

This earlier release extended the existing weekly-performance DTO and version-1 browser records with optional `totalSessions` and `conversionRate` values. The superseding correction above no longer uses Total Sessions for PPC Conversion Rate. Older cached weeks remain valid and display an unavailable state without exact PPC Clicks.

## September 11 workspace-control release

This client-only release adds no environment variable, API change, dependency, or persistence migration. After deployment, verify Refresh Data and automatic saving in the workspace header, the read-only empty-safe Previous Week Summary, date-free Action Items rows, Target above Actual with outcome controls beside status, and the consolidated Budget Utilization tiles. Confirm stored reports containing `previousWeekResult` and `actions[].dueDate` still load without validation loss.

## September 11 dashboard presentation release

This release changes only client presentation and selection state. It adds no environment variables, hosted dependency, API contract, or browser-storage migration. After deployment, verify All Tags ordering, automatic first-product selection for every tag filter, Current/Partial badge colors, and the absence of the workspace-title tag badge using a real populated catalog.

## Campaign comparison release

The campaign comparison now runs from two user-selected Scale Insights Campaign CSV files and needs no connector request, environment variable, database migration, or Pipeline deployment. The release adds browser key `glassco.ppcCampaignCsvComparison.v1`; rollback may leave harmless unused local entries, and the parser drops malformed entries.

After deployment, select a completed Wednesday–Tuesday period and upload product-filtered Campaign CSV exports into the exact Previous Week and Current Week slots. Confirm a recognizable wrong filename range is rejected, valid files persist after reload, Replace CSVs updates only the selected ASIN/week, and switching ASINs does not expose another product's comparison. Reconcile several joined campaigns by CampaignId and verify missing-week rows become zero. Open each of the seven dropdowns and confirm every campaign appears once under Good, Bad, or Neutral. Verify Spend but No Sales This Week requires positive current-week Spend with zero current-week Sales, stopped-Spend losses fall under Spend Down/Sales Down, no Lost Current-Week Sales dropdown appears, and New Spend at 15% or higher ACOS overrides the general rules. Open campaign links and confirm the fixed Scale Insights trend destination spans both weeks without credentials.

In more than one outcome dropdown, click Previous Spend, Current Spend, Spend Change, Previous Sales, Current Sales, Sales Change, Orders, and Current ACOS twice. Verify the first click sorts highest-to-lowest, the second reverses it, Orders uses the current week, unavailable ACOS stays last, and each dropdown retains its own active sort.

## September 10 workspace release

The first-, second-, and third-panel redesigns require no data migration, environment changes, or Pipeline deployment. Deploy the Library/PPC project only after production approval. The dashboard route adds self-hosted Geist and JetBrains Mono using next/font; builds need the same Google font download access already used by the app font. Verify the new panels at /ppc/dashboard and check the Library at /ppc/library. If the local Turbopack dev server reports “Next.js package not found,” use npm run dev -- --webpack for local verification; production build remains a separate gate.

The Products release is presentation-only. After deployment, verify the 300px white panel, compact title/count row, one plus action, bordered search/tag controls, 36px product thumbnails, neutral inactive cards, and solid-black selected card. Exercise selection, search, tag filtering, add/edit/delete, Pipeline-product hiding confirmation, drag/keyboard reorder, Escape dismissal, scrolling, focus states, and responsive layout.

The Reporting Periods release is presentation-only. After deployment, verify the 340px white panel, title-row calendar action, integrated multi-month navigator, abbreviated visible date ranges, black selected/current treatment, status/tag metadata, and four Spend/Sales/Orders/ACoS cells. Exercise month shifting, the month dialog, report switching, metric hydration, keyboard focus, and responsive layout. The full accessible names must continue to state the actual Wednesday–Tuesday range.

## Current deployment model

The Library deploys as a Next.js microfrontend under `/ppc`. Pipeline Postgres is authoritative for documents, categories, tombstones, versions, audit records, and shared backups after the protected one-time legacy Blob migration. Private Vercel Blob remains required for uploaded images and the immutable legacy migration artifact. Repository Markdown is bootstrap/compatibility content only; bookmarks, history, completion, and last-read position remain browser-local.

The third-panel redesign is presentation-only and requires no environment, API, or storage migration. After deployment, verify Strategic Weekly Goals/Budget Utilization precede Weekly PPC Performance, followed by notes, campaign diagnostics, and Action Items. Confirm the performance card has five sales cards, five order/efficiency cards, total revenue, Target ACOS, and live-sync status. Then recheck header Refresh Data, goal progress/actions, budget allocation/spend, burn-rate pacing, five-row history pagination, notes, and action controls.

Goal History extends the existing version-1 browser report value with an optional array and requires no environment variable, database, or server migration. The small Weekly Performance card layout is presentation-only. After deployment, verify resolving one Achieved and one Missed goal survives reload, is scoped to the selected product, and does not reappear in the active list. Also verify the four-card Sales row, split Orders/Efficiency row, centered single-line titles and values, stable vertical card flow, percentage badges only for available current data, centered `Prev. Week` footers, metric-specific favorable colors, ACOS target-gap copy, comma-formatted whole metrics, centered budget values, and removal of the redundant previous sales/TACOS summary.

Structured goals use the existing optional `metric`, `unit`, and history `dataState` fields in the version-1 browser value. No backend, environment, storage-key, or database migration is required. The parser maps legacy `spend`/`sales` values into the expanded taxonomy. After rollout, verify all nine goal choices against a live Scale Insights week, Organic Order's two measures, two-decimal currency/non-ACOS percentage Targets, whole-number ACOS Targets, read-only Actual fields, Partial/Final transitions after refresh, preservation of derived values in Goal History, and previous-result carry-forward into the following week.

## Prerequisites

- Node.js 20.9 or newer
- npm
- A Git repository containing the full project
- A private Vercel Blob store connected to the project
- A deployed Pipeline project with Postgres configured and `/api/library-state` available
- An active Pipeline ADMIN account for migration and rollout verification
- The `mcp.scaleinsights.com/glassco-scale-insights` Vercel Connect connector attached to the PPC project for Production, Preview, and Development
- Vercel AI Gateway available to the PPC project; deployments use project OIDC, while local standalone development requires `AI_GATEWAY_API_KEY`

## AI performance assistant

The assistant route calls `openai/gpt-5.6-sol` through Vercel AI Gateway and opens the existing Scale Insights MCP connector with the same verified Pipeline user subject. Do not expose `AI_GATEWAY_API_KEY`, Vercel OIDC, or MCP access tokens as `NEXT_PUBLIC_` values or place them in browser storage. The AI SDK resolves the automatically available project OIDC token at request time in Vercel deployments; application code must not reject a request by directly prechecking that build-time environment value. For local development outside `vercel dev`, copy `.env.example` to `.env.local` and set a scoped AI Gateway key; the Scale Insights connector still requires project OIDC and per-user hosted consent. If a pulled OIDC token expires, refresh it with `vercel env pull .env.local --yes` and restart the dev server.

After deployment, ask a product question from `/ppc/dashboard`, confirm a no-store `POST /ppc/api/dashboard/ai-chat`, and verify the answer identifies live Scale Insights facts separately from saved dashboard context. Test an ungranted user and complete the returned hosted Connect flow, then retry. Confirm discovered mutation/account-wide tools are unavailable, generated tool arguments cannot override the selected ASIN/US/visible dates, the function permits up to 120 seconds, and no credential, raw MCP result, or tool schema appears in client bundles, browser storage, URLs, or response bodies.

## Pre-deployment validation

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Do not deploy if any command fails.

## September 22 shared PPC dashboard state release

This release moves versioned PPC dashboard datasets from browser-only persistence to authenticated private Vercel Blob state. It requires `BLOB_READ_WRITE_TOKEN` (or the linked Blob store ID) in Production, Preview, and Development; no database migration or new connector is required. The `/ppc/api/dashboard/state` route uses the Pipeline bearer session, validates each known store, and guards writes with the previous Blob ETag. The first ADMIN visit with local datasets downloads a JSON backup before offering to import datasets absent online. Existing online datasets are never replaced by that migration. Concurrent-edit handling now loads, three-way merges, and retries ETag conflicts automatically, while visible clients poll every 15 seconds and refresh on focus. Verify two signed-in editors preserve separate report fields and actions without a conflict banner, each session receives confirmed remote changes automatically, a viewer remains read-only, and the private store contains validated JSON rather than raw CSV or credentials.

## Local production test

```bash
npm run build
npm run start
```

Open [http://localhost:3000/ppc/library](http://localhost:3000/ppc/library).

Also verify `/ppc/dashboard`, set a Target ACOS below the selected product's actual ACOS, and open at least one header analysis link. It must open `portal.scaleinsights.com` in a new tab with the selected ASIN and active-week dates in its filters, without credentials in the URL.

## Deploy with Vercel

1. Push the complete repository to GitHub.
2. Sign in to Vercel and choose **Add New Project**.
3. Import the GitHub repository.
4. Keep the detected framework as **Next.js**.
5. Use the repository root as the root directory.
6. Use `npm run build` as the build command.
7. Connect a private Vercel Blob store to production, preview, and development. Vercel injects the Blob credentials automatically. Confirm `BLOB_READ_WRITE_TOKEN` is present in all three environments.
8. Deploy and verify `/ppc/library`, `/ppc/dashboard`, `/ppc/api/dashboard/state`, `/ppc/api/library`, `/ppc/api/library/migration`, and at least one `/ppc/library/[slug]` page.

## Files that must be committed

- `src/`
- `content/`
- `public/`
- `package.json`
- `package-lock.json`
- Next.js, TypeScript, ESLint, PostCSS, and Vitest configuration files
- Product and engineering Markdown documentation

Do not commit generated or local-only folders such as:

- `node_modules/`
- `.next/`
- `coverage/`
- `.vercel/`
- local `.env*` files
- `.data/`

The existing `.gitignore` already excludes these paths.

## Post-deployment smoke test

1. Load `/library` in a private browser window.
2. Confirm the Category and Search controls render.
3. Open a document and use its topic navigation.
4. Bookmark and complete the document, then refresh.
5. As ADMIN, enter admin mode, create a temporary document, and save it.
6. Return to view mode and confirm the Plus control remains visible and can open new-document creation.
7. Delete a temporary document in admin mode; confirm no recovery list appears below the catalog, then use the toolbar recovery icon to open the dialog and recover it.
   Before recovering it, refresh the page and confirm the deleted card never appears while the shared catalog is loading.
8. Confirm catalog admin cards do not show an Edit / Rename action.
9. Open a document and confirm the sidebar shows an Eye in view mode. Enter edit mode and confirm it changes to a Pencil and reveals a separate `Save changes` button without issuing a save. Change the title, description, and category in the blue header, click `Save changes`, then refresh to confirm persistence and the return of the Eye control.
10. Open the new-document form and confirm it does not show Document Type, Tags, or Content Markdown.
11. Use the Category Plus control to create and select a temporary category.
12. Use the Category Pencil control to open the category manager; verify rename, reorder, and recoverable deletion controls.
13. Confirm deleted categories are absent from the main list, then use the recovery icon to open the recovery dialog and recover one.
14. In document recovery, confirm manual deletions show the user name/email/role, July 22 cleanup records show `System — Initial Library cleanup`, unmatched historical records show the unknown-source fallback, and backup-attributed records identify the initiating administrator when available.
15. Confirm **Recover system-deleted documents** shows the affected count and confirmation, restores only migration-attributed documents atomically, reports progress/success, and returns `409` without partial recovery after a deliberate stale-revision change.
16. Click a recovery-row trash icon, cancel the warning once, then confirm it; verify progress and success feedback, verify the document leaves recovery, and verify restoring an older backup does not recreate it.
16. Add a Key Insight, click Green, Blue, and Red, and confirm each color previews immediately; save on Red, refresh, and confirm Red persists. Confirm an older insight without `insightColor` remains Green.
17. Add a Roadmap, select Center number, and confirm its number, title, and subtext are centered and its image uses the full step width after saving.
18. Upload a Roadmap step image, confirm its shared upload completes, and verify each subtext format edits directly inside the composer and persists in a second browser session.
19. Upload Feature Card and Gallery images, switch every Gallery layout, and confirm minimum slots, responsive grids, shared previews, replacement, and removal.
   Confirm the preview request includes authenticated media access and displays the actual image rather than a broken image icon.
   Confirm square, portrait, and landscape Gallery sources are fully visible inside square tiles without cropping, then click each loaded tile to verify the full-image preview opens immediately without another media request.
20. Add Buttons for internal and HTTPS links; verify every width/alignment option, invalid-link feedback, secure new-tab attributes, and mobile full-width behavior.
21. Add a shared Google Drive video link and confirm a large 16:9 Drive preview player appears inside the blue document header’s right column. Confirm the play icon and playing video content are centered, the compact new-tab icon works, and no separate OPEN VIDEO text button appears.
22. Edit a long document and confirm the compact icon toolbar groups text styles, alignment, lists, and links with separators. Highlight text near the viewport bottom, add/edit/remove a link in the floating toolbar, save, refresh, and confirm alignment plus secure new-tab navigation persist.
   Use the neighboring Document link icon, search for a different published visible document, save, refresh, and confirm the linked text opens the selected `/ppc/library/:slug` route in a protected new tab. Confirm current, hidden, draft, deleted, archived, and recovery-only records are absent and catalog-load errors offer Retry without blocking other edits.
   For each formatting type (Bold, Italic, Underline, alignment, bullets, checklist, numbers, and link), confirm the same document remains active after save, its record version advances, and it reopens from the catalog.
   Simulate an incomplete or malformed formatting-save response and confirm edit mode stays open with unsaved changes. A genuine concurrent delete must be displayed only from an explicit `deleted` status.
22. Open a second authenticated account and confirm the temporary document appears within five seconds, then edit it and confirm the ADMIN tab updates within five seconds or immediately after focus.
23. Verify USER can create/edit active documents but cannot delete, recover, reorder, or manage categories; verify VIEWER cannot mutate and direct forbidden PATCH requests return `403`.
24. Check the browser console for hydration or runtime errors.
25. Confirm mobile layout at approximately 390px width.
26. Confirm the Product Pipeline, Team SOP Library, and PPC Dashboard cards appear separately in the reserved top bar, show white text for the active app, and each open its remembered route in a new browser tab—including the active tab—without changing or overlapping the source page.
27. Confirm `/ppc/dashboard` renders the authenticated three-panel Weekly PPC Performance workspace, loads the signed-in user’s Pipeline products, preserves a saved local report after refresh, and supports add/edit/delete of dashboard products plus persistent tag creation/filtering without changing Pipeline records. Select an ASIN; if prompted, complete the Vercel-hosted `Connect Scale Insights` consent and return to the dashboard. Verify all visible uncached Wednesday–Tuesday periods populate automatically without week-card clicks, the active week retrieves first, each period calculates the four derived metrics, and the active detail view displays freshness and locks imported inputs.
28. From a session-only Pipeline login, open each PPC card and confirm the one-time handoff is consumed without another login. Confirm persistent “Remember me,” expired-session return, external `returnTo` rejection, keyboard focus, hover, and narrow-screen horizontal scrolling.

## Authoritative persistence rollout

Production data cleanup is deliberately separate from code deployment. Use this order:

1. Deploy Pipeline first. Confirm `/api/library-state` authenticates through the current user table, returns revision/record versions, enforces ADMIN/USER/VIEWER permissions, records audit attribution, and can create/list a backup.
2. Deploy Library next. Confirm `/ppc/api/library` is a thin authenticated adapter, old local administration keys are ignored, server failures make the confirmed cache read-only, and repository Markdown is not merged after initialization.
3. With an ADMIN bearer session, POST `{ "action": "create-backup" }` to `/ppc/api/library/migration`. Record the returned checksum and Blob pathname. Optionally GET the same route to download the exact legacy JSON.
4. Inspect the backup and record its complete document/category counts and checksum.
5. Only when Pipeline returns revision `0` with an empty catalog, POST `{ "action": "initialize-catalog" }` to the migration route. The operation preserves the complete validated catalog and creates no new tombstones.
6. Confirm the response counts match the immutable backup. Verify all previously active documents appear for authorized readers and pre-existing tombstones remain only in ADMIN recovery.
7. Test a same-record stale edit and require `409` plus current shared state before enabling routine editing.

Never run initialization before the server and client protections are deployed. It is revision-zero-only and must not be used to overwrite an initialized catalog.

## Rollback

Before restoring catalog data, create a Pipeline backup. Restore through the ADMIN backup API with the current `expectedRevision`; the server creates an automatic before-restore backup and performs a non-destructive merge. Records absent from the backup, newer active documents, and active records represented as tombstones in an older backup remain active and unchanged. Use Vercel's deployment history to roll back code independently. Never restore catalog state from localStorage or repository Markdown.
# Unified deployment

For the authoritative persistence rollout, deploy Pipeline's database endpoint before Library, then perform the backup/initialization sequence above. For navigation-only releases, deploy PPC before enabling updated Pipeline navigation. The production build must serve the `/ppc` base path. Verify `/ppc/library`, `/ppc/dashboard`, `/ppc/_next/*`, `/ppc/api/pipeline-session`, `/ppc/api/library`, and the ADMIN-only migration route through the public PPC production alias before changing the Pipeline rewrite/cards. The PPC proxy must allow requests forwarded by `glasscopipeline.vercel.app` while redirecting direct visitors from the legacy PPC host.

Optional environment variables:

- `PIPELINE_AUTH_ORIGIN` — server-to-server Pipeline authentication origin.
- `NEXT_PUBLIC_PIPELINE_ORIGIN` — browser destination when leaving PPC or when authentication fails.

Scale Insights/Vercel Connect configuration:

- Attach connector `mcp.scaleinsights.com/glassco-scale-insights` to the PPC project for every deployed environment that may retrieve metrics.
- `SCALE_INSIGHTS_CONNECTOR` may override that non-secret UID, and `SCALE_INSIGHTS_MCP_URL` may override the default `https://mcp.scaleinsights.com/mcp` endpoint.
- Do not create static Scale Insights OAuth variables. Vercel injects project OIDC at runtime, and Vercel Connect stores and refreshes each server-verified Pipeline user's grant.

Both default to `https://glasscopipeline.vercel.app`. Roll back PPC and Pipeline independently by promoting their previous production deployments.

After deployment, call `/ppc/api/dashboard/performance` through an authenticated dashboard session and verify `401` without that session, a no-store `409` plus hosted consent URL before user authorization, `no-store` on success, exact requested scope, and no OIDC/token material in the response or client bundle. If Scale Insights is not configured, the dashboard intentionally retains manual metric entry and shows a configuration error.

## Budget history and multi-month timeline

This release keeps the existing version-1 browser report key and needs no server migration or environment change. Existing reports receive an empty budget history during validation. After deployment, verify a budget change persists after reload, Draft UI is absent, multiple months and Select Year work, overlap weeks are deduplicated, and current/future cutoffs still prevent requests for weeks with no completed days.

## Saved weekly performance and smaller tags

The performance cache, compact badges, upper-right week labels, and smaller whole-number metric cards need no environment or server data migration. Verify active-week-first automatic backfill of every visible uncached week, switching weeks without new requests, page reload, active-week-only Refresh, failed-refresh retention, and rounded presentation without precision loss in the cached DTO. Existing values that were never saved by the previous release are populated automatically when their weeks become visible. Cache persistence is local to this browser, not synchronized across devices.

The three-column Scale Insights navigation requires no environment or migration change. Verify the first two columns use the requested report ordering and the isolated trend column opens Daily, Weekly, and Monthly Advertising Trend views with the selected ASIN, selected Tuesday, seven columns, and 1-, 7-, and 30-day aggregation respectively. Confirm timeline cards use PPC Sales/PPC Order, Current percentages keep a tight suffix, and Budget History paginates the existing array at five rows per page.

## Compact product cards

Portfolio cards display the image, product name, and tag without ASIN/SKU rows. View-mode cards use a compact 66px minimum height; edit mode retains room for Edit, Delete, and Reorder controls. ASIN/SKU remain in the selected-product header, edit form, search index, and existing storage; this is presentation-only with no data migration. Verify both identifier links remain in the detail header after selecting a product.

## Product portfolio ordering

Product reordering requires no service or environment changes. Existing version-1 browser catalogs accept the optional productOrderIds field without migration. Verify a drag/drop in edit mode, refresh persistence, and a filtered reorder; ordering is local to the browser.

## Automatic listing images

The ASIN image lookup uses the existing Scale Insights connector and requires no new environment variables or migrations. Verify the Add product form with an authorized session: enter a valid ASIN, wait for the listing image preview, and confirm the saved card uses it. Unavailable images must leave manual upload usable.

## Current-week performance verification

After the September 7 date-cutoff fix, verify a current Wednesday–Tuesday reporting week requests only through yesterday in UTC and displays both the actual through-date and partial-week warning. Verify a completed week still returns its exact Tuesday end date. On Wednesday, the new week must show “no completed days yet” without an MCP request. No environment or data migration is required.

## Rich-text deployment notes

Rich-text support adds client/runtime packages and optional fields inside the existing shared Library JSON payload. It requires no environment variables, database migration, or conversion job. Searchable document links reuse the existing `link.href` mark and compact summary endpoint. Existing documents are upgraded lazily when edited and remain readable through synchronized legacy fields. Verify a saved formatted document through the canonical `/ppc/library/:slug` route before promotion.

## Live-state rollout

Deploy the Pipeline API first because it introduces active-only snapshots, opt-in Recovery data, and structured slug status. Verify authenticated catalog, document, deleted-link, and Recovery reads before deploying Library. Then deploy the Library UI and verify cached read-only mode, Back/Forward revalidation, deleted-link recovery, purge messaging, and precise disabled-control explanations through the canonical production route. No document migration, automatic restoration, or automatic deletion is part of this rollout.

For an approved protected-document repair, deploy only this repository. Open ADMIN Recovery after deployment, verify the permanent-deletion history, confirm the requested restore action, and then verify the original title and reader route are active. Protected repair is limited to the approved bQool and Check Spend records; do not initialize, merge, or restore the remaining purged catalog.

## Reorder, Recovery, bookmark, and empty-catalog rollout

Deploy the Pipeline Library API first because the reordered IDs require the scalar-safe PostgreSQL expansion before the UI can reliably persist them. Verify a revision-guarded `documents.reorder` request succeeds and that Pipeline runtime logs contain no PostgreSQL `22023` errors. Then deploy this Library UI and verify Save order progress/close/toast behavior, the reconciled bookmark badge, immediate Recovery loading and retry, and confirmed deletion/recovery of the final active document. This rollout requires no schema or data migration and must not modify Pipeline UI code.

## Weekly comparison rollout

The Weekly Performance comparison is a presentation-only Library deployment. It requires no environment variable, API, storage-schema, or data migration. Verify the compact vertical card stack, neutral prior values in the footer, non-overflowing symbols, direction color and badges only when current data is available, and shortened Daily/Weekly/Monthly Performance links at desktop and mobile widths.
## Untargeted opportunity rollout

Deploy the feature with both `/ppc/api/dashboard/untargeted-opportunities` and its dashboard card. After promotion, sign in through Pipeline, select a product and week, then click the single workspace **Refresh Data** action. Confirm the weekly performance and opportunity endpoints each run once, the opportunity period matches the card, and every displayed row has at least one Order. Reconcile Impressions, Clicks, Spend, Sales, Orders, and ACOS with Scale Insights PPC Search Term Performance, and confirm harvest-mode Search Term Keyword Analysis supplies each CampaignId. When Product ASIN candidates exist, confirm one additional Product Target Performance request uses the same advertised ASIN and dates, and verify every existing `TargetType=product` ASIN is absent from the opportunity table. For regression coverage, `B095WV5YZ4` must not appear as untargeted for advertised ASIN `B0DYSBW3X5` in September 2–8, 2026. Change Type, minimum Sales, maximum ACOS, and every metric sort direction and confirm no additional request occurs. Verify the filtered Spend, Sales, and Orders totals plus Spend ÷ Sales weighted ACOS. Copy several terms and confirm exact clipboard text. Open several row source icons and confirm Scale Insights Search terms receives the selected ASIN and dates, while the selected row value is copied for pasting into Instant Search. Switch away and back, then reload the page, and confirm the validated cached result reappears without another request. A later Refresh Data click must replace that active product/week result once.

If the connector does not advertise the two required search-term tools, the card must show its capability message. If Product Target Performance is missing or incomplete, text opportunities may still load but Product ASIN candidates must be omitted with a warning. If a live response shape is unsupported, use the displayed Reference ID to inspect sanitized runtime diagnostics before extending the adapter. Do not infer or publish “Not targeted” from an aggregate, absent, incomplete, or ambiguous coverage result.

## Account performance overview rollout

The ASIN Targeting rollout separates `get_keyword_performance` and `get_target_performance`, maps nested target types, and follows target pagination with a 60-second per-call timeout. After promotion, refresh the applied dashboard scope and reconcile product/category rows and all metric sort directions. Missing campaign attribution stays unavailable. No environment or storage migration is required.

No environment variable or storage migration is required; the new route reuses the existing Scale Insights connector and verified Pipeline identity. After deployment, open Dashboard, apply a custom range, and verify `/ppc/api/dashboard/performance-overview` returns no-store data capped at yesterday. Reconcile all four timeframe summaries and at least one row in each available detailed table against Scale Insights. Test both an all-ASIN scope and one filtered ASIN; if the connected tool advertises only scalar ASIN input, the UI must request one ASIN or explain the capability limit. Confirm no provider token or raw tool response reaches the client.

The ASIN ranking now requests product-level advertising and sales rows for the applied range plus sales for the immediately preceding equal-length range. After promotion, reconcile at least two ASIN rows, their shares, ACOS/TACOS, and momentum with Scale Insights. No persistence or environment migration is required.

The provider contract uses advertising `entity` plus nested `TotalAdSales` fields and sales `group_by=total`; do not substitute a synthetic `product` grouping. Verify Refresh All repeats the same no-store request and repopulates the ranking together with the rest of the dashboard.

The selected-range sales request now uses `group_by=day`; its normal ASIN totals continue to populate ranking while `Daily` feeds the quick-stats chart. After promotion, apply a range containing several completed days and reconcile Spend, PPC Sales, Total Sales, calculated ACOS, and calculated TACOS. Verify exactly two individually normalized series—red Spend and green PPC Sales—and their circular markers across desktop and mobile widths. Total Sales, ACOS, and TACOS remain aggregate cards and hover details. Hover the first, middle, and last dates to confirm each popup stays within the chart and reports all five actual metrics. Switching emphasis or hovering is client-only and must not create another Scale Insights request. No environment or storage migration is required.

Campaign Movers and Anchors now uses `get_campaign_performance` and follows all raw pages before local sorting. Campaign MCP calls allow 60 seconds, and the overview route allows 120 seconds to complete pagination. Reconcile campaign count and supported metrics against the same applied date range in Scale Insights. Verify every metric sorts both ways without a new request and that the campaign section states its account-wide scope. This endpoint does not provide ASIN mappings or raw per-campaign Clicks/Impressions. No storage or environment migration is required.

Whole-dollar goal target formatting requires no configuration or storage migration.

Summary topics require no environment changes or manual migration. Existing version-1 reports without summaryTopics keep legacy notes; topic arrays are saved only on edits through current browser autosave. Authenticated dashboard visual verification requires a signed-in Pipeline session.

Opportunity table layout changes require no environment or persistence migration.

Compact opportunity table alignment requires no configuration, environment, or data migration.

## Six-week weekly performance table release

This presentation and cache extension requires no environment variable, database migration, or API contract break. After deployment, verify the selected product's weekly panel shows six columns with the active week at the right edge, the requested row order, imported read-only values, and correct derived CPC/Organic Units. Confirm older cached records without optional impressions or unit fields still load and show unavailable cells. Rollback only removes the presentation extension; existing version-1 reports and caches remain compatible.

The Sales Trend unit recovery keeps the version-1 browser storage key and requires no environment or database migration. On first dashboard load after deployment, revision-3 and older visible weeks refresh through the existing authenticated endpoint. Verify Scale Insights PPC Units and Organic Units populate the matching weekly rows, including a period where Sales Trend returns nested unit totals, and confirm an empty Search Term report does not display a false zero. Refresh Data must replace the active week with revision-4 data.

The weekly table section-header update is presentation-only. Verify TOTAL, SALES, ORDERS, EFFICIENCY, and TRAFFIC each span the Metric label and six weekly columns, precede the correct metric rows, and render without an Analysis column at desktop and horizontally scrolled narrow widths.

## Weekly traffic and unit metric completion release

No environment, authentication, database, or storage-key migration is required. The first dashboard load after deployment refreshes visible snapshots that lack `metricsRevision: 3`, adding exact PPC-unit parsing to the existing ASIN-scoped Search Term Performance enrichment. Monitor provider usage during that one-time six-week refresh. Verify subsequent loads reuse revision-3 snapshots and do not repeat the enrichment calls until Refresh Data is requested. If Scale Insights omits units, the two unit rows must stay unavailable.

The Total Sales, Total Orders, and Total Units weekly rows require no migration or new provider request; they render values already present in each validated snapshot.

The three-card top-row layout and Burn Rate Progress removal require no environment, API, or shared-storage migration. Verify the layout at desktop and narrow widths; Goal History/Add Goal stack cleanly, interim goal status and action priority/assignee controls are absent, and delete controls remain. Confirm the Action Items description is absent and its accessible icon-only + sits directly beside the title. Create the next week to verify weekly-budget inheritance, unfinished-action carry-forward, and manual override isolation. Confirm new blank summaries start with tinted Good/Bad sections. Existing goals, reports, budget history, and action items remain compatible. The browser-only `glassco.ppcSharedReportOutbox.v1` recovery key requires no environment change: simulate a failed weekly-report save, refresh, and verify the edit uploads automatically and the key clears only after confirmation.

The immediate Action Item save correction requires no new environment or database migration. Verify an edit is queued before an immediate refresh, that two editor sessions can add independent actions and both are present after reload, and that the red conflict banner does not persist through ordinary ETag races. The card text is now smaller and lighter.

The refresh-recovery release adds only browser preferences and a per-tab outbox suffix; shared report keys and API payloads are unchanged. Before clearing any browser data, download pending changes and inspect the legacy `glassco.ppcSharedReportOutbox.v1` entry. After deployment, check a signed-in editor's add/refresh flow and the production dashboard-state logs: 409 lines now identify `stale_etag` versus `write_precondition` without report contents. Restore older missing items only from a validated browser outbox or private Blob history, merging by stable Action Item ID into the original product/week. Do not overwrite newer shared reports. Rollback leaves the version-1 shared reports readable; pending per-tab outboxes should be exported before reverting to a client that cannot read their suffixed keys.

The first live check found continuing `write_precondition` responses. The follow-up diagnostic compares private Blob `head()` metadata with `get()` response tags on rejected writes and logs only equality/missing flags. Check those flags before changing concurrency controls or retry behavior; never disable conditional writes merely to make a save succeed.

The diagnostic showed metadata and private content GET ETags differ in production. The corrected release obtains the metadata ETag with `head()` and keeps `ifMatch` enabled. After promotion, verify pending saves complete, refresh retains Action Items, and 409 counts stop recurring. If a genuine collision occurs, check that it is rare and resolved by merge/retry rather than dropping the outbox.

2026-09-29 release: Weekly goals no longer use seeded defaults; an empty goals array is intentional and must remain empty through shared storage and reload. The selected-product Scale Insights links include Day Parting.

2026-09-29 follow-up: The Day Parting link uses the portal-confirmed /Sales/DayParting route and weeks=4 query parameter. Verify it with a signed-in Scale Insights session after deployment.
# Goal deletion persistence — 2026-09-30

Weekly reports retain optional `deletedGoalIds` in the existing version-1 record. Deleting a goal records its ID; loading and shared conflict/recovery merges remove that ID from active goals. Deletion IDs merge cumulatively so a stale session cannot restore a deleted goal. New goals use fresh IDs. Verify deletion survives reload, concurrent edits, and recovery of an older pending save, while other goals and notes remain intact. No environment or database migration is required.
## API unit availability — 2026-09-30

The weekly performance boundary inspects authenticated MCP tool definitions and emits bounded field-name, scope-validation, pagination and unit-presence diagnostics without credentials or raw metric values. Missing PPC/Organic Units display Unavailable with an explanation. Sales unit parsing uses the period summary or exact ASIN rows, excluding unrelated/daily values. Metrics revision remains 4 until live unit retrieval is verified; no automatic repeated refresh is added for a provider omission. The prepared provider request is in docs/scale-insights-unit-contract-request.md and has not been sent. Unit retrieval is not considered fixed until exact live values reconcile against the portal for two products across six weeks.

Reporting-period cards show the week number instead of the product tag. Product tags and filtering remain available in the product panel; stored tags are unchanged.

Previous/current summary panels share documentation-header, topic-header and body minimum heights. Matching topic rows align to the taller content using ResizeObserver while side by side; stacked panels retain natural heights. Notes still expand automatically; no storage change.

Nine selected-week metric cards above the weekly table reuse the table's selected and preceding report snapshots. They show previous values and percent changes (ACOS/TACOS in percentage points), flag partial-period comparisons, preserve missing values, and handle zero baselines without division by zero. Spend movement is neutral. No new API or storage schema.

The weekly metrics table omits PPC Units and Organic Units rows per user request. Total Units remains visible. Retrieval and stored metric fields are unchanged.


### 2026-10-01 — Budget header and product identifiers
Budget pacing, editable weekly cap, and budget history now appear in the workspace header beside analysis links and Refresh Data. Product cards in the first panel show Amazon ASIN and Seller Central SKU links below the name, with ASIN copying. The former budget strip is removed; budget calculations and persistence contracts are unchanged.

Budget header simplification: removed the progress bar and elapsed-day display, keeping the editable cap, spend, usage, balance, burn rate, daily average, status, and history in a compact three-row layout. Persistence is unchanged.


### 2026-10-01 — Twelve-week untargeted opportunity history
The opportunities table defaults to All 12 weeks, ending at the selected reporting week, with a separate week dropdown. Weekly metrics are fetched automatically with at most two requests in flight, cached per ASIN/marketplace/week, and combined by term after normalizing case and whitespace. Distinct provider campaign rows are summed without duplicating mirrored representations. ACOS is recalculated; Last seen identifies a reporting week, and Weeks appeared counts weeks with activity. Current exact coverage excludes targeted search terms; broad/phrase targets remain eligible. Unknown targeting appears in an amber review group with disabled bulk selection. Product ASINs retain separate target checks.

The authenticated opportunities API accepts optional weeks=1|12 (omitted preserves legacy behavior); history=1 adds performanceRows and completeness. weeks=12 retrieves range coverage with bounded batches of 100 queries, checking at most 500 search terms; excess/missing/failed results remain unverified. Twelve-week history has its own shared store glassco.ppcOpportunityHistoryCache.v1, while weekly v1 cache keys remain compatible. Cached weeks without raw performance are refetched. Refresh Data refreshes all twelve weeks plus targeting; retry reuses completed weeks. Loaded-week counts, incomplete flags, targeting timestamps, and warnings remain visible. Only the dashboard-selected week's clicks are sent back to single-week metrics. No estimated data or automatic campaign creation is introduced.

Verification covers historical-only rows, zero-order spend, duplicate campaign rows, current targeting changes, scope isolation, incomplete pagination, retry, at-most-two concurrency, week selection reset, and persistence. Live Scale Insights data for B0DCTX18KK was checked across Jul 8–Sep 29, 2026: all 12 search-term pages were complete; 72 converting search queries yielded 49 without exact coverage and 23 with exact coverage. The historical-only term c came for stained glass reconciles to $21.99 sales, $0.66 spend and 1 order. Authenticated browser verification remains pending sign-in and must not be described as complete until observed.

## Campaign Contribution Analysis (October 1, 2026)
The dashboard adds a native-data-only Campaign Contribution Analysis section for the selected ASIN/marketplace/week and the equal-length previous week. The authenticated `/api/dashboard/campaign-contribution` route inspects the app connector's definitions. Account-wide campaign reports without ASIN attribution are rejected. The current exposed connector has no native ASIN campaign scope or advertised-product mapping; the section explicitly reports “Campaign-level ASIN attribution is not available from the current Scale Insights API connection.” No search-term or keyword rows are used to reconstruct campaign traffic or membership.
The extensible native adapter requires explicit returned ASIN/date/country scope, stable unique campaign IDs, native impressions/clicks/spend/sales/orders, and pagination metadata. The model calculates CPC, ACOS, percentage/point deltas, ASIN-net-spend contributions (including negative offsets), descriptive diagnoses, and native-total reconciliation with a 1% tolerance. Missing campaigns become zero only after complete pagination. The prepared UI includes summary cards, sortable metrics, quick filters, top spend/CPC drivers, configurable CPC click thresholds, low-data flags, coverage warnings, and retry. Results use a bounded five-minute in-memory cache; Refresh Data bypasses it. Existing CSV comparison remains separate. Live campaign attribution and authenticated browser verification remain provider/session-dependent and are not claimed complete.

October 2, 2026: Removed the unavailable Campaign Contribution Analysis section from the dashboard. The dashboard no longer requests its API on load or Refresh Data. The native adapter remains available for future provider support; existing reporting and storage contracts are unchanged.

October 2, 2026 — Opportunity quota handling: Live production diagnostics and the provider response confirmed an exhausted session quota (reset 09:54 UTC / 17:54 Manila). Provider errors and unknown empty formats now fail explicitly; quota errors return HTTP 429 with a safe reset message. The client stops its remaining history queue after a quota error, preserves the saved combined cache, displays saved totals with unverified targeting and disabled bulk selection, and offers retry. Confirmed zero-row reports remain valid. Authenticated end-to-end refresh is still pending sign-in and provider quota availability.

October 6, 2026: Restored Untargeted Sales Opportunities to the selected reporting week for search terms and Product ASINs. Removed the 12-week dropdown, combined totals, history columns and missing-week retry controls from the dashboard. Refresh Data requests one weekly report; weekly caches and provider quota protections remain intact. Historical API support is retained but no longer used by this table.

October 6, 2026: Added a SKU copy button beside the portfolio SKU link, using the same clipboard, feedback and accessible-label behavior as the ASIN button. No persistence changes.

October 6, 2026: Moved the product editing toggle out of the + menu to an adjacent pencil-only button. Accessible labels, tooltip and pressed-state feedback identify enable/exit editing. The + menu retains Add product and Add tag. No persistence changes.

October 6, 2026: Product tag badges now appear above the product title with 8px text, 9px icons, tighter padding and a 3px title gap for compact portfolio cards. Selected-card colors and tag filtering are preserved; no persistence changes.

October 6, 2026: Portfolio identifiers stay on a single line. Long SKU/ASIN links truncate visually with ellipsis while their copy icons remain fixed beside them. Links and clipboard buttons retain the complete identifier; no persistence changes.

October 6, 2026: Hardened goal deletions across unchanged-value merge shortcuts, stale local report writes and team synchronization. Permanent per-week goal deletion IDs are reapplied after merging, and shared storage rejects saves that would discard confirmed deletion records. The UI reads the protected queued report. Added regression coverage for stale writes, sync and server protection; existing v1 storage remains compatible.

October 6, 2026: Header budget metrics use content-sized columns with an 18px gap instead of three stretched equal-width columns. Remaining/Overspent, Burn Rate and Daily Avg now form a compact group. Calculations and persistence are unchanged.

October 6, 2026: Removed Burn Rate from the header budget card. Remaining/Overspent and Daily Avg remain compact; no stored data changes.

October 6, 2026: Redesigned weekly comparison cards as two snapshot sections for Sales & Spend and Order Volume & Efficiency. Centered metric values, arrow change badges, contribution captions and separated previous-week footers follow the supplied reference. All nine metrics, percentage-point efficiency comparisons, unavailable states and partial-week notices are retained.

October 7, 2026: Changed the highlighted reporting-week column in the weekly performance table from pale yellow to light green (#ecfdf5), covering its header and metric cells. No data or persistence changes.

October 7, 2026: Restored selected product identity at the left of the workspace header with its image above its name. Budget Pacing follows beside it with a compact width, then analysis links and Refresh Data. Missing images use the product icon. No data or persistence changes.

October 7, 2026: Replaced the workspace header's wrapping, space-between flex layout with explicit compact grid columns for product, budget, analysis links and Refresh Data. Removed automatic navigation margins and bounded the refresh area to keep it aligned; smaller screens use defined rows. No data or persistence changes.

October 7, 2026: Header product identity now shows an 80px image without the product-name caption. Analysis link columns use content-sized widths and 10px gaps instead of spreading across the available space. Product names remain in the portfolio; no persistence changes.

October 7, 2026: Removed the workspace budget heading and status badge. Budget amounts, remaining/overspent, daily average, and history remain; analysis links shift left into the freed header space. No persistence changes.

October 7, 2026: Right-aligned the compact Scale Insights analysis links beside Refresh Data in the workspace header. Budget figures stay beside the product image; no data or persistence changes.

October 7, 2026: Enlarged workspace current spend and budget cap to matching 24px amounts. Remaining/overspent and daily average are stacked to their right, with history below and a narrow-screen stack. No data or persistence changes.

October 7, 2026: Matched actual spend and budget cap typography at 24px with medium weight (20px on narrow screens), overriding the older cap-specific smaller style. No data or persistence changes.

October 7, 2026: Reduced both workspace spend and cap amounts to 18px while preserving matching medium-weight typography. No data or persistence changes.

October 7, 2026: Removed the Target ACOS badge/editor beside Weekly PPC Performance. Existing stored targets remain unchanged.

October 7, 2026: Snapshot cards display whole-number currency, percentages, comparison changes, and shares for current and previous weeks. Calculations and stored metrics retain full precision.

October 7, 2026: Weekly performance table displays whole-number currency and percentages. Stored data and calculations retain full precision.

October 14, 2026: Added authenticated ASIN SQP below untargeted opportunities, using the latest complete Amazon Sunday–Saturday week ending within the selected period. ASIN impressions/clicks/cart adds/purchases and purchases-per-click CVR; bounded pagination, scope validation, delayed/empty/incomplete states and shared Refresh Data. No marketplace totals substituted.

October 14, 2026: Shortened SQP copy to ASIN, reporting dates, and a concise unavailable/partial note. Retrieval and metric definitions are unchanged.

October 14, 2026: Combined ACOS and TACOS in one snapshot card, retaining separate values and week comparisons. Both metric groups now have four cards per desktop row, two on narrow screens. No data changes.

October 15, 2026: Added Audit beside Compare using the supplied two-panel reference, with 13 modules, real CSV/XLSX imports (ExcelJS 4.4), explicit date/currency confirmation, hierarchy-safe totals, child-ASIN business joins, configurable risk rules, filters, duplicate expansion, CSV export and validated local-only audit persistence. Reports are processed in-browser; no files are sent to Scale Insights. Missing source data remains unavailable. Rule score is the percentage of target/query rows below configured no-order-spend and ACOS rules, not a provider score. Existing dashboard storage is unchanged.

October 15, 2026: Audit header has exactly two upload options: PPC Report and Business Report. Selecting both opens period/currency confirmation; one shared import populates every Audit module. Removed duplicate upload entry points and New Audit action.


### Audit Performance Summary layout — 2026-10-16

Performance Summary redesign uses the existing application build and Git/Vercel deployment. No environment variables, hosted services, or database changes are required. Uploaded audit data stays on the device.


### Wasted Ad Spend and Opportunities — 2026-10-16

The Waste/Opportunities release uses the existing Next.js/Vercel pipeline with no new dependencies, services, environment variables, or server routes. Device review state uses a separate localStorage key; the uploaded audit v1 data is unchanged.


### Opportunities dashboard — 2026-10-16

The Opportunities UI release uses the existing Next.js Git/Vercel deployment. No dependencies, environment variables, APIs, or hosted resources are added. Uploaded report schema v1 is unchanged; new device-only opportunity review state is independent of waste-review state.


### Advertised ASIN dashboard — 2026-10-16

Advertised ASIN is delivered through the existing Next.js/Git/Vercel pipeline. No dependency, environment, API, database or storage-schema changes. Existing per-device report and waste-review records remain compatible.


### Campaign workbench — 2026-10-16

Campaign workbench uses the existing Next.js Git/Vercel workflow without dependencies, environment variables, APIs or hosted resources. Uploaded audit v1 remains compatible. Existing saved imports may require reupload to populate newly recognized optional budget/state metadata; missing values stay unavailable. Refresh recalculates current imported reports and reloads saved waste rules only.


### Campaign Type comparison — 2026-10-16

Campaign Type is included in the existing dashboard deployment; no new dependencies, environment variables, API endpoints, report upload controls, or persistence schema changes. Refresh recalculates uploaded report metrics and reloads same-audit waste rules. Browser-local reports populate the view; sample figures in the supplied layout are not deployed.


### Placement dashboard — 2026-10-16

Placement uses the existing Git/Vercel dashboard deployment and the same PPC Report and Business Report controls. No dependencies, APIs, hosted resources or environment variables were added. Reupload an older report to recognize explicit placement availability and bid-adjustment fields. Missing placement performance remains unavailable; a bulk file containing only placement settings cannot populate performance metrics.


### Keyword Target dashboard — 2026-10-20

Keyword Target uses the existing dashboard Git/Vercel pipeline without dependencies, environment variables, hosted resources or APIs. The same PPC Report and Business Report uploads populate all fourteen Audit modules. Older imports remain readable; reupload to populate newly recognized keyword/ad-group IDs and availability flags. Refresh recalculates the uploaded audit and reloads saved waste rules. Query/placement drilldowns require unique report-level keyword context.
