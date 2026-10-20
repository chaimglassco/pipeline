# Project Progress

## September 30, 2026 — weekly metric table order

- Reordered the six-week performance table into Total, Sales, Orders, Efficiency, and Traffic sections.
- The row sequence is now Total Sales/Orders/Units; Spend/PPC Sales/Organic Sales; PPC Orders/Units and Organic Orders/Units; ACOS/TACOS; then Impressions/Clicks/CPC.

## September 30, 2026 — compact budget pacing bar

- Rebuilt Budget Pacing as one compact horizontal strip with editable spend and cap, utilization percentage, progress, elapsed week, remaining balance, burn-rate variance, daily spend average, and status.
- Preserved budget inheritance, change history, overspend handling, automatic saving, and responsive stacking for narrow workspaces.

## September 29, 2026 — per-topic summary formatting controls

- Moved bold, italic, underline, bulleted-list, and numbered-list controls into every Current Week Summary topic header.
- Kept Add Topic in the documentation header and preserved automatic composer growth, topic movement, deletion, and saved formatting.

## September 29, 2026 — auto-growing summary composers

- Made every editable Current Week Summary topic expand vertically to fit its notes on initial load and after each edit or formatting action.
- Removed the manual resize handle and internal textarea scrolling so long documentation remains fully visible inside its Good, Bad, or custom topic card.

## September 29, 2026 — matching previous-week summary cards

- Replaced the Previous Week Summary textarea with the same topic-card presentation used by Current Week Summary while keeping prior content read-only.
- Preserved green Good and red Bad tones from structured summaries and added a neutral General Summary card for legacy plain-text documentation.

## September 29, 2026 — compact weekly planning layout

- Reworked the Products workspace planning area to match the supplied reference: Budget Pacing is now a full-width summary strip with cap, spend progress, remaining balance, status, and collapsible history.
- Placed Strategic Goals and Action Items in an equal two-column row below the strip, with live count badges and visible Add Goal/Add Item actions. The layout collapses to a single column at narrow workspace widths.
- Preserved budget editing and inheritance, goal outcomes, action completion, history, auto-save, and the existing storage contract.

## September 22, 2026 — shared online PPC dashboard state

- Added authenticated `/ppc/api/dashboard/state` reads and optimistic-concurrency writes backed by private Vercel Blob.
- Moved dashboard catalog, weekly report drafts, performance caches, campaign comparisons, and untargeted-opportunity caches behind the shared adapter while preserving existing versioned parsers and UI contracts.
- Added an ADMIN-only first-visit migration prompt that downloads a local backup before sharing datasets absent from the team store; existing online datasets are never overwritten. Added shared-data refresh, pending-save retry, and pending-change backup controls.
- Verified typecheck, lint, focused dashboard tests, production build, and public `/ppc/dashboard`/`ppc/library` route responses against the Vercel deployment.

## September 22, 2026 — account comparison outcome filters

- Updated Compare from Spend-only movement options to the Good, Bad, and Neutral outcome filter cards used by the ASIN campaign comparison.
- Kept one active filter at a time and expanded the account table with Sales, Orders, and Current ACOS columns using the already validated CSV metrics.

## September 22, 2026 — Pipeline workspace recovery and chunked catalog transport

- Traced the blank PPC Products panel to Pipeline's oversized shared workspace response: `/api/workspace-state` now returns a `binary-v2` manifest with five JSON chunks instead of an inline `state` object.
- Updated `/ppc/api/dashboard/products` to reassemble and validate chunked workspace state before normalizing products, while preserving session-expiry and no-store behavior. Focused route tests cover inline and chunked responses.
- Recovered the prior-laptop catalog additively in Pipeline's authoritative workspace. The shared catalog now contains 23 products (the existing 19 plus four recovered records), including ASINs `B0D1PHP7HQ` (3/16 - Round H) and `B0DYSBW3X5` (3/16 Round U). No current product was deleted.

## September 21, 2026 — account-wide Campaign Compare tab

- Added a Compare tab beside Dashboard and Products using whole-account Scale Insights Campaign CSV exports.
- Added completed Day, Wednesday–Tuesday Weekly, and calendar Monthly period pairing with browser-local period snapshot reuse.
- Added CampaignId joining, zero-fill behavior, Spend movement filters, sortable Spend columns, ten-row initial display, Show all, and Scale Insights campaign trend links.
- Kept the existing ASIN-specific Campaign Week-over-Week comparison unchanged; Sales and Orders remain stored for a later comparison phase.

## September 15, 2026 — compact Dashboard disclosures and ASIN filter

- Converted all seven Dashboard data sections into independently expandable disclosures that are closed by default.
- Added a shared ASIN performance search beside the audit window. Matching is case-insensitive across ASIN, SKU, and product name, and the filtered product set drives all temporal cards, rankings, update metadata, coverage summaries, and detailed-table scope messages.
- Added clear-filter behavior, filtered/total product telemetry, responsive controls, and regression coverage for default collapsed state and recalculated metrics.

## September 15, 2026 — Account dashboard scaffold and Total Sales trend placement

- Added Dashboard and Products switch tabs above the PPC workspace. Products remains the initial view and preserves the existing product, reporting-period, and weekly documentation flow.
- Built a full-width monochrome Dashboard from the supplied HTML direction: five temporal cards, an ASIN velocity table, coverage summaries, and keyword, campaign, product-target, and search-term ledger scaffolds.
- The 7-, 14-, and 30-day cards plus ASIN ranking use available browser-local weekly reports. Today, Yesterday, and unconnected detail datasets show explicit unavailable states instead of sample values.
- Moved the Total Sales WoW indicator above the Total Sales value.

## September 14, 2026 — Product-target coverage correction

Corrected false-positive Product ASIN opportunities by separating keyword coverage from product-target coverage. Live reconciliation for advertised ASIN `B0DYSBW3X5`, US, September 2–8 showed `B095WV5YZ4` with `HasExactMatch: false` in exact keyword coverage while the same ASIN existed as an SP `TargetType=product`. The opportunity adapter now conditionally loads Product Target Performance when ASIN candidates exist and excludes ASINs already targeted under the selected advertised ASIN.

Product ASIN classification now fails closed: unavailable, unreadable, or incomplete target coverage omits ASIN candidates and returns a warning rather than publishing an unsupported `Not targeted` claim. Text search-term behavior and the existing two-call path remain unchanged; the third provider call occurs only when the converting harvest result contains Product ASIN candidates.

## September 14, 2026 — Centralized converting-search-term refresh

Replaced Search Query Performance with PPC Search Term Performance for Untargeted Sales Opportunities. The corrected provider returns reconciled PPC Impressions, Clicks, Spend, Sales, Orders, and ACOS from nested `entity`/`metrics` rows. Missing metric fields no longer become misleading zeroes, and only explicitly uncovered terms with at least one attributed order are returned.

Added local ascending/descending sorting to every opportunity metric, filtered Spend/Sales/Orders/weighted-ACOS totals above the table, and a per-row Scale Insights Search terms link scoped to the active ASIN and reporting dates. The link copies the selected value for pasting into the third-party Instant Search field. These controls reuse the cached report and do not consume additional MCP units.

Added a copy-search-term control and replaced the row source destination with the strongest real campaign mapping. The refresh now joins PPC Search Term Performance with harvest-mode Search Term Keyword Analysis, retaining two provider calls while adding optional CampaignId, AdGroupId, parent keyword, and match type fields. Multiple sources resolve by attributed Sales, Orders, then Spend.

The workspace Refresh Data action now refreshes this report with the selected product/week's weekly metrics. Removed the separate Load Opportunities and Fetch Again controls. Validated results persist in a capped version-1 browser cache and restore without another MCP request; the refresh token remains scoped to the active product/week.

Focused adapter, cache, and UI tests pass, and TypeScript validation passes. Full repository checks and browser verification are recorded in HANDOFF.md after completion.

## September 11, 2026 — Automatic save, data-derived status, and PPC conversion correction

Removed the manual Save action while retaining debounced browser-local persistence. Reporting-period Completed/Partial badges now derive from cached coverage dates, Action Items starts empty, goal controls moved into the data-state footer, current-summary formatting moved beside its label, and Sales WoW moved from the SKU block into Total Sales.

Corrected the conversion definition to PPC Orders divided by PPC Clicks. The provider request first reads the requested ASIN row or aggregate totals; when they omit clicks, Refresh Data reuses the complete Search Term Performance result for the same ASIN and week. The manual click field is removed, and current/previous conversion values display as whole percentages while the stored calculation retains two-decimal precision. Incomplete search-term results and Total Sessions remain excluded.

Added an accessible ASIN copy control, rounded displayed ACOS goal Targets to whole percentages, removed the active-goal counter, and moved Goal History plus Add Goal into the planning-card header.

Lint, typecheck, all 314 tests across 51 files (6 skipped), the production build, and `git diff --check` pass.

## September 11, 2026 — Independent budget alignment and custom goals

Top-aligned the two planning cards and removed the budget content's automatic top spacer, so any number of goals can grow only the Strategic Weekly Goals card. Added Custom Goal to the selector with manual text, target, status, and outcome controls. Custom intent survives reload through an optional version-1 goal marker without changing the storage key or requiring migration.

## September 11, 2026 — Compact goals, resizable prior summary, and Conversion Rate

Moved weekly-goal Actual below Target and placed the three outcome icons beside the status selector. Replaced the prior-summary display with a labeled, vertically resizable, read-only Performance Documentation field and removed archive/report-state/Draft/Status/ROAS metadata from the two summary cards. The later PPC correction reserves Conversion Rate for PPC Orders divided by PPC Clicks.

## September 11, 2026 — Workspace control refinements

Condensed the workspace header controls and removed the duplicate refresh control from Weekly PPC Performance. Made Previous Week Summary read-only, removed its empty-result warning, renamed the final card Action Items, and removed action due-date inputs without changing stored action compatibility. Weekly goals now present Target before Actual. Budget Utilization now shows Daily limit inside Weekly Limit and removes the duplicated secondary detail row. A later revision removed the remaining manual Save action.

## September 11, 2026 — Tag-driven product selection

The All Tags catalog now groups products as Lead Came, Complementary, Homasote Board, Shard Catcher, Kiln Paper, then all remaining tags and untagged products while retaining saved order inside each group. Every tag-filter change selects the first visible matching product so its reporting periods and workspace data appear immediately. The reporting-period Current badge is light blue, Partial is light red, and the workspace heading no longer repeats the selected product tag. No storage schema changed.

## September 10, 2026 — Campaign week-over-week comparison

Reduced the campaign diagnostic to a verifiable Spend-baseline stage. When campaign grouping is available, the server makes one Scale Insights request for the previous matched period and requires campaign name and Spend; campaign ID and sponsored type are optional. The table sorts those campaigns by Spend, shows ten first with Show all, and leaves Current Week Spend as an explicit pending dash. Loading, freshness, warning, consent, retry, provider failure, empty, stale-request, Refresh Data, protected trend links, and memory-only caching remain included. Current-period retrieval, deltas, Sales/Orders, and mover grouping are deferred until this first live source is confirmed.

The live-provider adapter recognizes nested campaign/entity records, formatted Spend strings, `const`-based grouping choices, embedded JSON, and MCP text-table rows while preserving strict scope, identifier, and nonnegative-Spend validation.

Deployed the production diagnostic gate at commit `c68cdc9` and correlated authenticated request `7274368f-fc45-4e62-ab36-cd7d799273f1`. The live `get_ads_performance` schema has ASIN/date/ad-type/paging/sorting/summary inputs but no campaign grouping, and the connector advertises no dedicated campaign-reporting tool. Campaign loading correctly stops before an aggregate call. The current connection cannot provide the real campaign Spend rows needed for Stage 1, so the dashboard presents a neutral capability notice without a Retry loop. Enabling the comparison requires a future Scale Insights campaign-reporting capability or another campaign-level source.

## September 10, 2026 — Reference-based first-panel rebuild

Rebuilt Products from the supplied HTML and image as a fixed 300px white panel with the reference title/count row, single plus action, bordered search and tag controls, 36px thumbnails, status dots, neutral tags, and a solid-black selected card. The plus action opens the existing Add product, Add tag, and product-edit controls, preserving local catalog validation, filters, selection, dialogs, deletion, and drag/keyboard reorder. The completed second- and third-panel rebuilds and all storage/API contracts remain intact. This work is local and has not been deployed.

## September 10, 2026 — Reference-based second-panel rebuild

Rebuilt Reporting Periods from the supplied HTML and image as a 340px white panel with the reference uppercase header, calendar placement, integrated month control, compact neutral cards, black Current/selection treatment, abbreviated visible date ranges, status chips, tag metadata, and four boxed statistics. Existing month selection, Wednesday–Tuesday boundaries, current-week cutoff, report switching, cached performance hydration, and local schemas remain intact. The completed third-panel rebuild is preserved. This work is local and has not been deployed.

## September 10, 2026 — Reference-based third-panel rebuild

Rebuilt the workspace from the supplied HTML with the corrected Total Orders tile and initial Conversion Rate placeholder. Added isolated reference typography/layout, compact editable goals, expandable budget history, summary footers, and action completion. Retained the original first two panels and all existing API/storage boundaries at that stage. Later refinements connected Conversion Rate and removed the export and visible action dates. Browser fixture checks cover desktop/mobile layout and note persistence; final validation results are recorded in HANDOFF.md.

Last updated: September 9, 2026

## Third-panel workspace redesign

Rebuilt the selected-product workspace to closely reproduce the supplied compact monochrome reference while preserving every existing interaction. Weekly PPC Performance now leads with the reference date-comparison header, Target ACOS badge, live-sync control, four sales cards, PPC/organic order donut, order-share cards, and ACOS/TACOS radial gauges. Strategic Weekly Goals and Budget Utilization now follow as paired cards with progress rows, allocation/spend tiles, burn-rate pacing, and the existing paginated history. Thin neutral borders, centered metric typography, restrained black accents, and responsive fallbacks replace the earlier oversized control-center treatment without changing stored data.

## Larger Weekly Performance metrics

Redesigned Weekly Performance into two structured rows matching the requested visual hierarchy: Sales Metrics spans four cards, while Order Volume and Efficiency & Targets share the second row. Follow-up refinements substantially reduced card height and typography, centered titles and values, kept titles on one line, restored the intended vertical content flow, rendered current zero values beside their symbols, and suppressed false 100% comparison badges while current-period data is unavailable. Each card retains a compact centered `Prev. Week` footer. ACOS retains its red target warning and states the target gap; TACOS includes a total-advertising-ratio hint. The change is responsive and does not alter stored metric precision or report schemas.

## Product performance AI assistant

Added a compact floating Performance AI chat to the selected-product dashboard. It combines the active week, available prior week, populated visible-period trends, budget/Target ACOS, goals, actions, and notes with live read-only Scale Insights MCP tools; it provides starter questions and accepts free-form prompts. Conversations are isolated by product/week and remain session-only. The authenticated, no-store `/ppc/api/dashboard/ai-chat` route uses Vercel AI Gateway with OpenAI GPT-5.6 Sol plus the existing per-user Vercel Connect grant. Runtime MCP tools must be non-destructive and ASIN-scoped, while server-side argument enforcement pins every call to the selected ASIN, US, and visible completed dates. Added bounded tool output, hosted authorization recovery in the widget, runtime OIDC resolution through AI Gateway, safe provider/MCP errors, untrusted-context instructions, and route/widget regression tests.

## Goal history and previous-week metric indicators

Added Achieved and Missed goal actions that remove resolved goals from the active list and persist them in a product-wide Goal History dialog. Added backward-compatible parser migration and validation for terminal legacy goals. Weekly Performance comparisons retain rounded comma-formatted metrics, centered budget inputs, rounded Actual spend, and no redundant prior sales/TACOS summary.

Expanded structured goals to Increase Spend, Decrease Spend, PPC Sales, Total Sales, PPC Order, Organic Order, Total Orders, ACOS, and TACOS. Organic Order can be measured as a count or percentage of total orders. Goal Actual fields are read-only live projections of cached/imported weekly performance and display Waiting, Partial, or Final completeness; resolved history captures the derived actual and completeness state. Currency/percentage Targets show two decimals, legacy Spend/Sales goals migrate safely, and preceding Previous Week Result documentation automatically carries into the following week's field.

## Target ACOS warnings and product-scoped Scale Insights navigation

Added an auto-saved, centered Target ACOS to every weekly report and a red ACOS-card warning when actual efficiency exceeds the configured target. Eleven compact header links now open their real Scale Insights reports with the selected ASIN and active week applied. Daily, Weekly, and Monthly Performance Trend are isolated in a third column and open seven-column Advertising Trend views using 1-, 7-, and 30-day aggregation. The temporary internal report pages were removed, the header's duplicate date/week label was removed, and timeline ACOS is rendered as a whole number.

Reordered the first two Scale Insights columns into the requested workflow, tightened Current percentage suffix spacing, changed timeline summaries to PPC Sales/PPC Order, and paginated Budget History at five rows per page without altering stored history.

## Budget history, cleaner report controls, and multi-month timeline

Added per-week budget-change rows, removed visible Draft badges and the secondary Save Draft action, and introduced an apply-based multi-month/year picker with boundary-week inclusion, future-week exclusion, deduplication, and coverage-aware labels. Added parser, date-range, selection, persistence, and UI regression coverage.

## Saved weekly performance and smaller tags

Fixed fetched metrics disappearing after reload: imports previously updated only React report state and were not included in the dirty-report save flow. Added validated ASIN/week snapshots, timeline hydration, active-week-first automatic backfill for every visible uncached week with two-worker concurrency, explicit-refresh-only updates for the active saved week, and failure retention. Added reload/navigation/backfill/refresh regression coverage, moved week numbers into the upper-right of timeline cards, compacted portfolio tag badges, and reduced weekly metric cards with whole-number presentation.

## Compact product cards

Portfolio cards display the image, product name, and tag without ASIN/SKU rows. View-mode cards use a compact 66px minimum height; edit mode retains room for Edit, Delete, and Reorder controls. ASIN/SKU remain in the selected-product header, edit form, search index, and existing storage; this is presentation-only with no data migration. Verify both identifier links remain in the detail header after selecting a product.

## Product portfolio ordering

Added edit-only drag handles below each product's Delete icon, keyboard reordering, drag/drop feedback, and browser-persisted product order. Filtered moves preserve non-visible slots; existing catalogs remain compatible.

## Automatic listing images

Added automatic ASIN image lookup to the product form using Scale Insights' actual Amazon thumbnail. Manual uploads remain available. No credentials enter frontend code and no catalog schema or existing product data is changed.

## Overall status

The Glassco Back Office Library is buildable with Pipeline-authenticated, Postgres-authoritative shared persistence, scoped versioned mutations, read-only outage caching, and cross-account synchronization.

## 2026-09-07 — Current-week Scale Insights date correction

- Reproduced the production scope error with live MCP calls: a September 2–8 request returned September 2–6 from both reports because Scale Insights excludes today and future days.
- Cap upstream requests at yesterday in UTC, retain strict marketplace/date matching, return the actual end date, and add a partial-week warning. A week with no completed days returns an actionable no-store `404` without querying MCP.
- Added date-controlled regression coverage for partial weeks, completed weeks, Wednesday, and future weeks. No estimates, new credentials, or storage schema changes.

## 2026-09-07 — Vercel Connect authorization

- Replaced static Scale Insights OAuth/access-token configuration with `@vercel/connect` and the attached `mcp.scaleinsights.com/glassco-scale-insights` connector.
- Bound every token request to the stable user ID returned by server-side Pipeline session verification, namespaced by the Pipeline issuer.
- Added a no-store hosted consent response and dashboard `Connect Scale Insights` action for users who have not granted access; returning to the dashboard triggers its existing automatic sync.
- Added URL allowlisting and regression coverage so OAuth credentials, Vercel OIDC material, Connect tokens, and raw MCP responses never enter browser storage or response payloads.

## 2026-09-04 — Scale Insights weekly performance

- Added an authenticated, no-store `/ppc/api/dashboard/performance` route backed by the official MCP client and server-only Scale Insights credentials.
- Added strict query and upstream response validation for exact ASIN, marketplace, and Wednesday–Tuesday reporting scope.
- Added concurrent `get_ads_performance` and `get_sales_data` retrieval for Spend, PPC Sales, PPC Orders, Total Sales, and Total Orders.
- Centralized Organic Sales, Organic Orders, ACOS, and TACOS calculations in the dashboard domain layer.
- Added automatic dashboard sync, freshness/error/warning feedback, explicit refresh, and imported-field locking with manual fallback when the connector is unavailable.
- Added focused domain, MCP adapter, API route, and UI coverage. Production credential configuration and authenticated live-data smoke testing remain deployment steps.

## 2026-07-28 — Library control reliability

- Replaced the reorder query's JSON-scalar expansion with delimiter-safe scalar encoding and ordered PostgreSQL expansion.
- Added reorder save progress, duplicate-submit protection, success close/toast behavior, and retryable inline errors that preserve the selected order.
- Reconciled the bookmark badge against unique active, visible, published documents without deleting stale browser-local bookmark IDs.
- Made Recovery open immediately and load normal Recovery and permanent-deletion history independently with progress and retry states.
- Allowed ADMIN to delete the final active document into a recoverable empty-Library state with Add document and Recovery actions.

## 2026-07-24 — Unexpected deletion prevention and attributed recovery

- Removed the two-document cleanup transformation; protected initialization now backs up and imports the complete catalog without creating tombstones.
- Added optional ADMIN deletion attribution for direct users, the July 22 cleanup migration, backup restores, and unknown historical sources.
- Added a confirmed, progress-aware bulk recovery control that sends one atomic revision-guarded mutation for migration-attributed documents only.
- Added a separately confirmed ADMIN permanent-delete action for recovery rows. It removes only tombstoned content, retains actor audit metadata, and blocks backup restoration of purged IDs.
- Updated the Pipeline restore contract to a non-destructive merge so backup-absent and newer active documents survive.
- Passed 151 automated tests across 29 files, ESLint, TypeScript, and the Next.js production build.

## Completed

### Application shell and catalog

- Glassco branding and Library-only navigation.
- Responsive desktop and mobile application shell.
- Glassco Back Office Library hero.
- Document search and configurable category filtering.
- Bookmark and recent-document entry points.
- Loading, empty, error, and not-found states.

### Reader experience

- Safe GFM Markdown rendering.
- Stable numbered topic navigation.
- Conditional full-title tooltips only for truncated topics.
- Bookmark, recent-view, and completion tracking.
- Responsive tables and document layouts.
- Hydration-safe browser reading state.

### Shared library administration

- Eye control in view mode, Pencil control in admin mode, and an always-visible Plus control for creating documents.
- Create and edit documents.
- Rename, hide/show, reorder, delete, and recover documents.
- Create, rename, hide/show, reorder, delete, and recover category options.
- Category recovery moved behind a compact recovery icon and dedicated deleted-category dialog.
- Document recovery moved out of the catalog footer and behind an admin-toolbar recovery icon with a dedicated deleted-document dialog.
- Creation-only document form with document type, tags, and legacy Markdown removed from the visible form while their saved defaults remain preserved.
- Category Plus and Pencil controls beside the document Category field for quick creation and full category management.
- Removed the catalog-card Edit / Rename action; existing document title, description, and category now edit directly in the blue document header during builder edit mode.
- Pipeline Postgres persistence with recoverable tombstones, global revision, per-record versions, audit attribution, and backup/restore support.
- Refresh-safe catalog hydration keeps all document cards behind a skeleton until authoritative state or the confirmed read-only cache resolves, eliminating deleted-document flashes.
- Repository Markdown is bootstrap-only after initialization; legacy browser administration state cannot merge into or upload to the shared catalog.
- Visible tabs poll every five seconds and refresh on focus. Server failure switches a validated confirmed cache to read-only mode instead of queuing local writes.
- ADMIN has full catalog/category lifecycle control, USER can create/update documents, and VIEWER is read-only; Pipeline enforces each permission against the current active user record.

### Structured document builder

- View and edit modes now expose their Eye/Pencil state explicitly, with a separate manual `Save changes` button in edit mode so the mode indicator cannot accidentally submit a document.
- Responsive element picker that flips to available viewport space.
- Topic numbering and sidebar synchronization.
- Repeatable dropdown entries with multiline preservation.
- Editable tables with add-row, add-column, row-height, and column-width controls.
- One unified Bullets element with Bullets, Checklist, and Numbers tabs; previously saved standalone list types remain compatible.
- Diagnostic Flow steps support independent multiline rich-text descriptions while preserving connector labels and legacy saved nodes.
- Replaced word-based rich-text controls with a compact icon-only toolbar grouped by text styles, Left/Center/Right alignment, lists, and links; the same controls follow highlighted text in a floating selection menu.
- Headline and Description alignment now lives inside the shared formatting toolbar while legacy element-level alignment remains dual-written for compatibility; Headline continues to omit list controls.
- Added safe link creation, editing, removal, Markdown/paste preservation, new-tab reader rendering, and rejection of unsafe URL schemes.
- Added a searchable Document link control beside the URL-link icon. One lazy authoritative catalog is shared across all editors, unsafe/unavailable targets are excluded, and selected documents persist as protected new-tab `/ppc/library/:slug` links.
- Hardened formatting persistence end to end: client and server canonicalize rich-text JSON, content-only updates preserve document identity/lifecycle, and the reader verifies the authoritative active document plus advanced version before closing edit mode.
- Incomplete, stale, or malformed formatting responses now preserve the open editor, unsaved changes, and reader cache. Only explicit lifecycle status can show a deleted, purged, or archived document state.
- Highlighted text opens a matching viewport-aware selection toolbar, and all fixed/floating toolbar controls retain compact typography inside large-text elements.
- Editable Tables provide exact row and column deletion with one-row/one-column minimum safeguards and synchronized column widths.
- Centered statements, callouts, lists, color-configurable Key Insights, feature cards, text blocks, roadmaps, and diagnostic flows. Key Insights retain the existing Green default and provide persistent Green/Blue/Red tabs in edit mode.
- Roadmap step-number position controls for Left, Center, and Right layouts; Center stacks the step copy and displays images at full available width.
- Roadmap steps upload images to shared Blob storage and edit Plain/Bullets/Checklist/Numbered text directly inside the composer while remaining compatible with previously saved image URLs.
- Feature Cards and Galleries use the shared upload flow; Gallery layout selection immediately creates the minimum responsive upload slots. Saved and editor Gallery tiles are square, show the complete uncropped source image, and open full-image previews from the already-loaded tile source without a second request.
- Private shared images now display through authenticated object-URL previews instead of broken direct `<img>` requests to bearer-protected media routes.
- Standalone Button elements support validated links, four widths, three alignments, secure new-tab navigation, and mobile full-width rendering.
- Video tutorials now render as a large responsive player inside the blue document header’s right column; Google Drive’s fixed toolbar is cropped outside the visible frame so its play control and playing content stay centered, while a compact new-tab icon preserves external viewing. Direct files use native playback, generic HTTPS links retain a safe fallback, and the redundant OPEN VIDEO text button is removed.
- Video Add/Pencil controls restricted to document edit mode.

### Quality

- ESLint passes.
- Strict TypeScript check passes.
- Fifty-five Vitest files pass with 327 passing tests and 6 intentionally skipped tests.
- Production build passes and generates 15 routes/pages.
- Core desktop flows were visually verified in the local browser.
- Bookmark hydration mismatch was reproduced and fixed.

## Not implemented

- Secure cookie-based page authentication and account recovery.
- Organizations, workspaces, invitations, or row-level multi-tenant isolation.
- Direct Amazon Ads API integration beyond the Scale Insights reporting connector.
- Analytics, reporting automation, and PPC analyzers.
- Automated committed browser E2E suite.

## Recommended next milestone

1. Deploy and verify Pipeline's authoritative `/api/library-state` endpoint.
2. Deploy the Library adapter, scoped mutation client, polling/focus sync, and read-only cache behavior.
3. Create the protected immutable legacy Blob backup, then initialize the revision-zero Postgres catalog with the complete validated legacy catalog.
4. Complete authenticated multi-account browser verification for ADMIN, USER, VIEWER, conflict, deletion, recovery, and outage behavior.
5. Add committed Playwright coverage and secure cookie-based page authentication.
# September 15, 2026 — CSV campaign week-over-week comparison

- Confirmed the Scale Insights Campaign CSV contract from two supplied exports: Type, Campaign, Orders, Sales, Spent, CampaignId and supporting performance columns. All 218 sample rows had unique nonblank campaign IDs; 96 IDs matched across files without identity conflicts.
- Added browser-side CSV validation, CampaignId joining, zero-fill for missing weekly rows, filename-period mismatch detection, and capped validated local persistence scoped to country/ASIN/week.
- Added seven collapsible Good, Bad, and Neutral classifications with the agreed 15% high-ACOS threshold and special-rule precedence, including the later current-week Spend but No Sales rule.
- The first sample is not a valid seven-day baseline: its filename and totals indicate July 26–September 1, while the selected previous slot is August 26–September 1. The importer rejects the mismatch rather than presenting a misleading WoW result.

# Unified Glassco integration

- Production deployment `dpl_6xM9bVCRqW8dLUqGL8GXtymQRR1V` was released first on 2026-07-22 and aliased to `glasscoppc.vercel.app`; the canonical Pipeline gateway serves `/ppc/dashboard` with HTTP 200 and rejects unsigned session checks with HTTP 401.
- Added `/ppc` base-path support for pages, assets, and APIs, including the authenticated `/ppc/dashboard` route.
- Replaced the combined switcher with three independent, responsive Product Pipeline, Team SOP Library, and PPC Dashboard new-tab cards with per-application active states and remembered routes.
- Added a 30-second one-use cross-tab handoff for session-only logins, preserved “Remember me,” and added validated post-login return destinations.
- Added Pipeline session verification and role-aware Team SOP Library administration.
- Protected shared-library reads and scoped writes through Pipeline: ADMIN has full access, USER may create/update documents, and VIEWER is read-only.
- Added legacy `glasscoppc.vercel.app` canonical redirect handling.

# Weekly PPC Performance workspace

- Replaced the dashboard placeholder with a responsive three-panel product, reporting-period, and weekly documentation UI based on the approved Stitch reference.
- Added an authenticated compact product-catalog proxy backed by Pipeline workspace state.
- Added editable weekly goals, weekly/daily budget limits, performance metrics, previous-week outcomes, summary notes, and next-week action items.
- Added product and tag management to the first panel: accessible add/edit/delete dialogs, optional browser-local images, reusable tag creation/filtering, protected ASIN and SKU links, and tag pills replacing active-status badges. Pipeline products are customized through a non-destructive local overlay.
- Added versioned, validated browser-local draft/report persistence with explicit unsaved and saved feedback.
- Added route, state-contract, API normalization, shell-layout, and idempotent UI coverage. Shared multi-browser PPC report persistence remains a future milestone.

# WYSIWYG Library composers

- Added Tiptap 3.28.0 rich-text editors and static React rendering for all supported element body fields.
- Added selection-aware inline styles, bullets, numbers, editable checklists, accessible toolbar state, keyboard shortcuts, and responsive controls.
- Preserved standalone list elements with inline-only row formatting.
- Added validated JSON persistence, synchronized legacy fallbacks, lazy legacy Markdown conversion, and malformed-JSON recovery.
- Expanded automated coverage for shared-state validation/cache behavior, scoped permissions and conflicts, safe complete-catalog import, attributed recovery, catalog hydration, and the existing navigation/editor coverage.
- Completed authenticated same-origin browser verification with the production build: ADMIN edit, selection-aware toolbar state, editable checked checklist state, save, disabled/static reader rendering, full refresh persistence, edit-mode rehydration, cleanup, and zero browser warnings or errors.
- Restored visible disc/decimal markers in both editor and reader modes, aligned task-list checkbox/text rows, and normalized Tiptap ordered-list JSON so numbered formatting survives save and reader rendering.

## Live-state stabilization

- Normal Library reads now exclude tombstones and avoid deletion-audit work.
- ADMIN Recovery performs a fresh recovery-specific read with attribution.
- Catalog and reader caches record snapshot metadata, reconcile on browser history restoration, and invalidate stale document entries.
- Deleted and permanently purged slug routes now render explicit states; recoverable deleted routes provide an ADMIN recovery action.
- Added automated coverage for Recovery request scoping, stale cache invalidation, `pageshow` revalidation, and deleted-link recovery.
- Kept ADMIN Recovery available at zero tombstones and added a separate permanent-deletion history view.
- Added an explicit, confirmed bQool-only repair from the newest trusted pre-purge snapshot while preserving all other permanent deletions.
- Replaced the final-document safeguard with intentional empty-catalog support; the final document can be tombstoned and recovered like any other document.
- Clarified Reorder availability and the authoritative empty-Library state.
- Hid the permanent-deletion history card when it has no records, while preserving protected bQool restoration when eligible history exists.
- Extended the explicit protected restore allowlist to “Check Spend with No Sales,” using its newest trusted Pipeline backup while preserving its original identity and leaving all other purged records untouched.
- Added read-only discovery across checksum-addressed legacy Library archives when an approved record is absent from the current snapshot and Pipeline backups.

## Authoritative catalog reconciliation

- Added strict all-or-nothing document/category parsing so one malformed row cannot silently shorten a catalog.
- Added required live-response lifecycle manifests and same-snapshot completeness counts.
- Preserved the last confirmed reader/catalog copy in read-only mode when a live response is malformed, incomplete, or omits an active document.
- Limited cache removal to explicit deleted/archived lifecycle metadata and verified active record-version changes.
- Kept verified formatting saves in the reader and per-document cache while rejecting incomplete mutation confirmations.
- Added regression coverage for partial HTTP 200 responses, lifecycle reconciliation, formatting saves, refresh omission, and legacy cache fallback.
- Pipeline and Library automated gates pass locally; production deployment and authenticated multi-account verification remain pending.

## Weekly comparison layout

- Replaced the corner-sized previous-week annotation with equal-size Current and Previous columns in every Weekly Performance metric card.
- Added a center divider and moved red/green direction styling to the current value and arrow only.
- Tightened the shared comparison typography to prevent percentage overflow and shortened the three Scale Insights performance-link labels.
## September 11, 2026 — Untargeted sales opportunities (superseded September 14)

- Added the initial on-demand report below Campaign Week-over-Week Comparison using Scale Insights search-query and exact-coverage tools; the September 14 correction replaces the search-query source with PPC Search Term Performance.
- Added strict provider normalization for structured and Markdown responses, safe capability/shape errors, sanitized correlation diagnostics, and no-store API delivery.
- Added local criteria filters, top-ten expansion, final/partial metadata, product-ASIN links, shared-refresh integration, and memory-only caching.
- Kept an explicit Fetch Again action visible after successful loads so empty criteria results can be re-fetched without changing product or week.
- Corrected blank criteria to include zero-sales and zero-order terms, added Impressions to the table, and matched the live Scale Insights exact-coverage `query_list` contract discovered from the authenticated production request.
- Added domain, adapter, API, and component regression coverage. Full repository gates and authenticated production data reconciliation are recorded during release verification.
# September 15, 2026 — full-width campaign outcome rows

- Campaign comparison situation dropdowns now use one full-width row each across Good, Bad, and Neutral groups, keeping labels, campaign counts, and explanations readable before expansion.
- Narrowed the Bad situation to “Spend but No Sales This Week,” requiring positive current-week Spend and zero current-week Sales. Removed the redundant Lost Current-Week Sales dropdown; campaigns with no current Spend and declining Sales remain in Spend Down/Sales Down.
- Added independent sorting to every dropdown's Previous Spend, Current Spend, Spend Change, Previous Sales, Current Sales, Sales Change, Orders, and Current ACOS headers. First click sorts highest-to-lowest and the next click reverses it.
- Untargeted-opportunity copy buttons now show their success checkmark for two seconds, then automatically restore the square copy icon. Repeated copies restart the timer and unmounting clears it.
- Removed the green per-row keyword campaign-creation action. Copy and source actions remain available on each opportunity row.
- Kept per-row and select-all-visible checkboxes for keyword opportunities. Create Bulk Campaigns opens one Scale Insights Customize page with the advertised ASIN and all selected terms encoded as separate keyword lines; Product ASINs remain excluded.
- Rounded Budget Burn Rate Progress Spend and weekly limit to whole dollars, matching the Spend card.
- Added a safe PPC Clicks fallback from a complete ASIN-and-week Search Term Performance result, allowing PPC Conversion Rate to populate when Scale Insights advertising totals omit clicks without adding another provider request.
- Campaign comparison now carries a validated current-week import into the next week's previous slot for the same marketplace and ASIN. The operator uploads only the new current-week CSV when that exact prior period is available.

## September 15, 2026 — live account performance overview

- Connected ASIN Targeting to the exact product-target endpoint, separated keyword calls, mapped nested target types and metrics, and followed all target pages. Preserved repeated target rows, excluded auto/audience rows, and added two-way sorting for all seven ASIN target metrics.

- Made the temporal ledger permanently visible, moved TACOS below ACOS, and removed Overview Source Coverage.
- Added an applied custom date range with a 90-day cap and completed-day cutoff.
- Added authenticated Scale Insights summaries and normalized Keyword, Campaign, Product Target, and Search Term tables for the selected range.
- Centered and color-separated Spend Share and Sales Share columns.
- Added adapter, API, and component regression coverage while preserving local weekly-report fallback behavior.
- Connected ASIN Velocity & Performance Ranking to product-level Scale Insights advertising and sales data for the applied range. Added provider-derived ACOS, TACOS, account shares, and Sales momentum against the prior equal-length period, while joining local names and SKUs by ASIN.
- Corrected the live ASIN adapter to match Scale Insights' actual `entity`/`TotalAdSales` advertising fields and `group_by=total` sales contract. Added Refresh All to repeat the complete dashboard request for the active filter and dates.
- Connected Campaign Movers and Anchors to the dedicated `get_campaign_performance` endpoint and its complete raw pagination. Replaced unavailable campaign ASIN/traffic columns with provider status, CPC, CTR, CVR, and Daily Budget, and added two-way sorting for every campaign metric. The campaign source is labeled account-wide because it exposes no ASIN mapping.

Removed decimal places from weekly monetary goal targets and their history display.

Added segmented Current Week Summary topics with icon-only add, inline rename, remove, and up/down reorder controls. Preserved legacy notes, existing formatting/list continuation, and autosave; added persistence and interaction regression coverage.

Moved opportunity totals above metric labels, added Impressions/Clicks totals, removed the MCP-usage notice, and moved bulk campaign creation into the match summary row.

Centered opportunity metric totals, labels, and values, and reduced header/row spacing and table width.

## September 21, 2026 — daily performance quick stats

- Added a compact smooth daily chart below the temporal cards for Spend, PPC Sales, Total Sales, ACOS, and TACOS.
- Reused the selected-range Scale Insights sales request with daily grouping, so the chart follows the applied date range and ASIN filter without an additional provider call.
- Added accessible metric selectors, explicit loading/empty states, responsive chart styling, and adapter/component regression coverage.
- Extended the plot to the panel edges and added a date-level hover box containing Spend, PPC Sales, Total Sales, ACOS, and TACOS for every completed day.
- Plotted all five metrics simultaneously with distinct fixed colors, individual peak normalization, selectable emphasis, and tiny circular markers that stay round at responsive widths.
- Simplified the chart to two series: red Spend and green PPC Sales. Total Sales, ACOS, and TACOS remain available in the aggregate cards and daily hover details.

## 2026-09-22 — Six-week Scale Insights weekly table

Replaced the selected-product weekly metric card groups with a six-week Scale Insights-style table. The active week is the rightmost selected column, the five preceding Wednesday–Tuesday periods are shown beside it, and the requested paid, organic, and efficiency rows are rendered in a fixed order. Added optional impressions and unit fields to the provider adapter/cache, with derived CPC and Organic Units, read-only imported cells, compact trend bars, and regression coverage for the six-column layout.

## 2026-09-23 — Weekly traffic and unit metric completion

Added complete Search Term Performance retrieval to weekly performance so the six-week table can display actual Impressions, Clicks, derived CPC, and exact PPC Units when Scale Insights supplies an aggregate or complete row-level unit field. Added revision-3 snapshot marking and automatic refresh of older visible-week caches. Total Units continue to come from Sales Data, Organic Units derive only when exact PPC Units are present, and no order-to-unit estimate is used.

## 2026-09-30 — Sales Trend unit recovery

Expanded weekly Sales retrieval to detailed output and normalized nested PPC Units, Organic Units, and Total Units fields. The adapter now reconciles a missing third total from the other two exact unit values, preserves missing data instead of turning an empty Search Term report into zero units, and marks results as revision 4 so existing six-week browser snapshots refresh automatically.

## 2026-09-30 — Weekly metric section headers

Added full-width TOTAL, SALES, ORDERS, EFFICIENCY, and TRAFFIC headers to the six-week performance table so each metric group is immediately identifiable without changing the metric order or weekly values.

Removed the Analysis trend column so the table now contains the Metric label and six weekly value columns only.

Added Total Sales, Total Orders, and Total Units rows between the organic metrics and ACOS in the six-week performance table.

Reworked the workspace summary row into three responsive cards by moving Action Items beside Strategic Weekly Goals and Budget Utilization. Removed the Burn Rate Progress gauge while retaining budget totals, status, editing, and history.

Simplified weekly planning controls: removed action priority and assignee placeholders, retained a clear trash action, removed the On Track/At Risk goal dropdown, and stacked Goal History with Add Goal. New reports inherit the preceding weekly budget until manually overridden. Blank weekly summaries now begin with light-green Good and light-red Bad sections.

Compacted the Action Items header by removing its descriptive paragraph and replacing the labeled add button with an accessible icon-only + immediately beside the title.

Replaced the shared dashboard's manual ETag-conflict stop with automatic validated three-way reconciliation and retry. Concurrent changes to separate records, report fields, scalar-ID lists, and independently added action/topic/goal rows are retained; exact same-field collisions use the latest local intent. Visible dashboard sessions now check for confirmed team updates every 15 seconds and on focus, remounting only when no local save for that dataset is pending.

Added crash-safe recovery for weekly report edits. Pending Action Items and other report changes now enter a browser-local outbox before the debounced online save, survive refresh and temporary save failures, merge with the latest shared report, retry automatically, and clear only after server confirmation. New reporting weeks also carry unfinished Action Items forward while leaving completed items in the prior week.

Closed the remaining 500 ms gap before reports entered the recovery queue: report edits now queue immediately. Repeated remote ETag conflicts keep retrying without leaving a stale conflict banner. Added a two-editor Action Item merge and immediate-refresh regression test, and made Action Item rows smaller and lighter.

## 2026-09-24 — Action Item refresh and save investigation

Traced the disappearing list to both view selection resetting after refresh and unconfirmed cloud writes. Added validated browser-local selection restoration, per-tab recovery outboxes with legacy recovery, visible recovery failures, bounded conflict retry feedback, read-only Action Item controls for viewers, and server conflict-condition logging without report content. An online write with an identical value is acknowledged.

The first production release exposed continuing `write_precondition` rejections from Vercel Blob. Added a metadata-only diagnostic comparing the Blob API's authoritative ETag with the private content GET ETag; it logs equality flags without report contents or ETag values. This narrows the remaining server-side correction.

The diagnostic confirmed that private content GET and Blob metadata returned different ETags for the same report. Updated shared reads to return the metadata ETag for conditional writes and added a regression test for this exact mismatch.

After the corrected deployment, a pending report save returned HTTP 200 and the repeated 409 loop stopped. In the signed-in production dashboard, the user's three previously missing default Action Items were visible under Round U – 3/16 – 2 Pack for Sep 23–29 and remained after a full refresh; the user confirmed they were the missing rows. Older or differently titled items still require the original browser outbox or private history for identification.

## 2026-09-29 — Weekly goal persistence and Day Parting

New weekly reports start without prefilled goals. Saved empty goal lists remain empty when loaded and when the next week is created, so a deleted goal does not reappear. Added goals use unique IDs and enter the existing immediate shared-save/recovery queue. The selected product links to Scale Insights Day Parting below Monthly Performance.

## 2026-09-29 — Day Parting link correction

Corrected the Scale Insights Day Parting destination to /Sales/DayParting with a four-week filter, matching the URL generated by the signed-in Scale Insights portal for a selected ASIN. The previous /Sales/DaypartingTrend path returned 404.

## 2026-09-29 — Continuous weekly budget carry-forward

New weekly reports now inherit the most recently saved earlier weekly budget for the same product, including when one or more intervening weeks have no saved report. A manual weekly-limit change remains scoped to that week and becomes the amount inherited by later weeks until another manual change is saved.

Existing reports that were automatically saved with a zero weekly budget before this fix now display the latest earlier budget as well. A zero remains unchanged when Budget History records that the user deliberately changed the limit to zero.
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

Validation: lint, TypeScript, and production build passed. The full suite passed 68 files; two dashboard timing failures passed on focused rerun, and the final five-file rerun passed all 43 dashboard/campaign tests. Live historical search-term totals were reconciled; authenticated browser verification and live native campaign attribution remain pending.

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

Implemented the supplied Performance Summary dashboard layout with calculated report data instead of sample figures. Replaced the health score and priority tiles with grouped metric panels and the expanded ASIN summary.

Validation: 449 tests passed in the full run; the three timeout failures passed in a separate 25-test rerun. Final Audit interaction checks passed (5 tests). Desktop and mobile synthetic-data browser checks found no console warnings/errors. Authenticated production Audit was accessible; real-report verification requires the user's two report files.
The empty-state dashboard is also available before report import, with placeholders rather than sample data.


### Wasted Ad Spend and Opportunities — 2026-10-16

Implemented Wasted Ad Spend from the supplied UI and added Opportunities immediately below it. Uses actual uploaded report rows and placeholders before upload, rather than reference sample data. Review statuses and rule thresholds are local device notes; they do not change Amazon campaigns.

Validation: full suite completed with 458 passing tests and 6 skips; the one corrected locator failure and two timeout failures passed in a separate 10-test run. Lint passed. Desktop/mobile synthetic-report browser checks verified rule recalculation and status persistence with no console warnings or errors.


### Opportunities dashboard — 2026-10-16

Replaced the basic Opportunities list with the supplied analytical UI, using actual report evidence, hierarchy-safe metrics, exact-coverage safeguards, adjustable rules and persistent review workflow. Existing two-report upload and other Audit modules are preserved.

Validation: serial full suite passed (80 files; 469 tests passed, 6 skipped) with unchanged assertions and a 20-second timeout after host-contention timeouts in the first run. Lint, TypeScript and production build passed. Synthetic-data browser verification confirmed hierarchy-safe totals, separate placement metrics, rule recalculation, saved workflow status after reload, CSV raw precision, responsive layout and no console warnings/errors.


### Advertised ASIN dashboard — 2026-10-16

Replaced the generic Advertised ASIN list with the supplied portfolio-and-drilldown layout, backed by imported report metrics. No sample figures, inferred product allocations, automatic campaign actions, or remote refresh claims.

Validation: full suite completed with 477 passing tests and 6 skips; the placement/negative-target test observed source loaded before its mid-run adjustment and passed with all 6 domain tests in a fresh rerun. The final UI/domain checks passed (9 tests). Lint and TypeScript passed. Desktop/mobile browser checks reconciled product totals and expanded campaign/mix evidence, verified incompatible match-scope dashes, and found no console errors.


### Campaign workbench — 2026-10-16

Replaced the generic Campaigns list with the supplied campaign workbench, real uploaded metrics, hierarchy-safe totals, product-level filtering, metadata-aware state/strategy summaries and expandable evidence. Added optional explicit daily-budget and campaign-state import metadata without changing audit schema version.

Validation: 84 test files passed (487 tests passed, 6 skipped), including campaign grouping/import compatibility and interactive controls. Lint, TypeScript, and production build passed. Desktop/mobile browser checks verified expanded evidence, state filtering and ASIN search with no console errors. Filled campaign data was checked with local synthetic reports; production verification uses the authenticated dashboard.


### Campaign Type comparison — 2026-10-16

Replaced the generic Campaign Type table with the requested comparison dashboard and shared campaign evidence drilldowns. Recognizes short and full Amazon type names, preserves absent/zero distinctions, and opens the exact selected campaign in the Campaigns workbench.

Validation: 85 test files passed in the full 86-file run (493 tests passed, 6 skipped); one unchanged document-editor test exceeded its explicit 10-second timeout and passed on an isolated rerun with unchanged assertions. All Campaign Type tests passed, including scope reconciliation, missing values, canonical names, type selection, sorting/pagination, and two-report import to full-campaign navigation. Lint, TypeScript and production build passed. Desktop/mobile browser checks verified type contribution metrics, ASIN search, expanded evidence and campaign navigation with no console errors. Filled data was checked locally with synthetic reports; production verification uses the authenticated dashboard.


### Placement dashboard — 2026-10-16

Replaced the generic Placement table with the supplied dashboard backed by placement report evidence. Added optional placement performance-availability and bid-adjustment metadata so blank bulk settings do not become zero performance. Preserved two uploads, fourteen navigation modules, legacy audit compatibility and existing campaign navigation.

Validation: full regression run passed all 88 test files (504 passed, 6 skipped). The final zero-click waste-rule guard passed the 11 focused Placement tests. Final lint, TypeScript and production build passed. Desktop/mobile browser checks verified metrics, ASIN expansion, full-campaign navigation and unavailable ASIN/match intersections with no console errors. Filled data was tested locally with synthetic placement records; production verification uses the authenticated dashboard.


### Keyword Target dashboard — 2026-10-20

Replaced the generic Keyword Target list with the supplied report-backed dashboard. Added optional keyword/ad-group IDs and explicit target metric/bid availability to distinguish blank metadata from reported zero. Added contextual join checks, query fallback labeling, weighted portfolio diagnostics and keyword-level drilldowns without campaign placement allocation.

Validation: all 90 test files passed (517 tests passed, 6 skipped). Final lint, TypeScript and production build passed. Tests cover import compatibility, identity isolation, missing/ambiguous joins, weighted rates, exact coverage, zero values, filters, sorting/pagination and two-report import-to-keyword navigation. The local browser parsed synthetic CSV reports through the real file reader and parser, verified keyword/query/placement totals and placement filtering, and passed desktop/mobile checks with no console errors. Production UI verification uses the authenticated dashboard; populated report data was verified locally.
