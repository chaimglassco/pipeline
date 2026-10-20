# Glassco Back Office Library — Architecture

## Automatic report state and PPC conversion

The report editor persists through the existing debounced browser-storage effect and exposes no manual completion mutation. Reporting-period badges derive from Scale Insights snapshot coverage: `endDate >= weekStart + 6 days` is Completed, shorter cached coverage is Partial, the current uncached week is Partial, and an uncached past week is Draft. New and normalized reports preserve an explicitly empty `actions` array instead of seeding an operational task.

PPC Conversion Rate derives from optional `ppcClicks` and PPC Orders. The performance adapter first checks the raw ASIN advertising row, advertising totals, and the sales summary. When those omit clicks, the Untargeted Sales Opportunities refresh publishes the complete ASIN-and-week Search Term Performance click total to the dashboard, which recalculates Conversion Rate without another MCP request. Incomplete or capped search-term results are not used. Total Sessions remains readable for backward compatibility but no longer drives the conversion card.

ASIN clipboard state is transient component state and never enters browser storage. Goal History and Add Goal are grouped at the right side of the Strategic Weekly Goals header, and no active-goal count is derived or persisted. Whole-number Target ACOS and PPC Conversion Rate values are presentation formatting; calculations and stored numeric values retain their existing precision.

Previous Week Summary projects the prior report's validated `summaryTopics` into read-only topic cards. When only legacy text is available, render-time parsing recognizes Markdown level-two topic headings and otherwise creates one neutral General Summary card. This adds no persisted fields or migration.

## Custom goals and independent planning-card height

The planning grid uses start alignment, and Budget Utilization no longer uses an automatic top margin. Each card therefore keeps its own content height when the goal list grows. Custom goal selection reuses `WeeklyGoal.title`, target, status, and outcome behavior; the optional `custom: true` marker prevents legacy metric-name inference from converting manual text into a predefined metric during version-1 report validation.

## Conversion and summary presentation

The performance adapter retains `TotalSessions` from the already-requested Scale Insights sales summary for compatibility. The authenticated route, version-1 performance cache, and version-1 weekly report optionally accept `ppcClicks` and calculated `conversionRate`; missing click denominators render an explicit unavailable state. Conversion comparisons use the same current/previous availability guard as the other metric cards.

Previous Week Summary renders the existing fallback result as a native read-only textarea with vertical resize enabled. It has no report-status chip or footer metadata, and Current Week Summary has no Draft/status chip. Goal rows group achieved, missed, and delete controls in the footer without an interim status selector, while the Target and read-only Actual form a two-row value stack beside the progress bar.

## Dashboard control presentation

Refresh Data remains in the workspace header, while the existing debounce writes every report edit automatically. The metrics header retains provider freshness, authorization, and warning state without duplicating Refresh. Previous Week Summary resolves existing `previousWeekResult`/prior notes into read-only text and suppresses its empty placeholder. Action rows keep the validated `dueDate` compatibility field in storage but no longer render a date editor. Goal Target precedes the read-only Actual projection. The Weekly Limit tile renders the existing derived daily budget, and the separate daily-limit/balance row is removed because the Spend tile already renders its balance.

## Dashboard catalog presentation

The merged Pipeline/local product array retains the existing validated `productOrderIds` contract, then receives a stable presentation sort by normalized tag name. The fixed priority is Lead Came, Complementary, Homasote Board, Shard Catcher, and Kiln Paper; equal-priority products retain their merged order. Tag changes select the first matching visible product through the filter event, so no derived-selection effect or storage migration is required.

## Campaign comparison boundary

`CampaignWeeklyComparison` is a Client Component that reads Scale Insights Campaign CSV files entirely in the browser. The parser handles quoted CSV fields, requires Type, Campaign, Orders, Sales, Spent, and CampaignId, rejects negative or malformed values, maps SP/SB/SD types to the existing Scale Insights trend contract, and aggregates duplicate IDs only when their identity agrees. The comparison unions both weeks by CampaignId and zero-fills a missing weekly row. Cross-week name/type conflicts abort the import. If the preceding comparison's validated current period exactly matches the newly selected previous period, the component reconstructs that prior-week map from its stored campaign rows and requires only the new current CSV.

The selected dashboard Wednesday defines the current seven-day slot and the previous slot immediately before it. Scale Insights exports do not carry the chosen report dates or advertised ASIN, so the component labels both slots, binds the result to the selected ASIN, warns about this source limitation, and rejects a recognizable filename range that conflicts with its slot. Correct ASIN scoping still depends on exporting after applying the product filter in Scale Insights.

Pure domain rules classify every joined campaign exactly once. Current-week Spend with zero current-week Sales runs first, followed by newly inefficient Spend where previous Spend was zero and current ACOS is at least 15%. The remaining strict Spend/Sales increases and decreases populate four Good/Bad categories; unchanged or unmatched movement goes to Neutral. Campaigns that lost Sales and stopped spending fall under Spend Down/Sales Down, so a separate Lost Current-Week Sales category is unnecessary. Current ACOS derives from current Spend divided by current Sales. Category rows sort by absolute Sales change, then Spend change and campaign name.

Each outcome dropdown owns transient client-side sort state. Previous/current Spend, signed Spend change, previous/current Sales, signed Sales change, current Orders, and current ACOS toggle descending/ascending independently; null ACOS values remain last. Sorting does not mutate or persist the imported comparison.

`AccountCampaignCompare` is a separate Client Component mounted by the top-level Compare tab. It uses the same validated Scale Insights CSV parser but creates account-wide period snapshots without an ASIN requirement. Day periods compare adjacent completed dates, weekly periods use Wednesday–Tuesday slots, and monthly periods use completed calendar months. The component reads and writes the shared dashboard adapter, labels both file slots because provider exports do not carry dates, validates recognizable filename ranges, and derives one Good, Bad, or Neutral outcome filter at a time from CampaignId-joined rows. Sales, Orders, and ACOS are calculated from the retained snapshot fields and displayed in the account comparison table.

Account comparison snapshots persist independently from `CampaignWeeklyComparison`, so changing the selected product or ASIN cannot expose or overwrite account-level data. The existing product-level comparison, provider route, and performance caches remain unchanged.

Validated imports persist as `{ version: 1, entries }` under `glassco.ppcCampaignCsvComparison.v1`. Entry keys are `<COUNTRY>:<ASIN>:<CURRENT-WEDNESDAY>` and values contain the validated comparison, both filenames, and import timestamp. Hydration reconstructs the key from validated scope and drops malformed entries. A carried-forward import records the earlier entry's current filename as its previous filename; no raw CSV is added to storage. The shared dashboard store is capped at 50 entries and does not change weekly reports, performance snapshots, Pipeline data, or the Scale Insights account. A browser-local value is retained only as an explicit migration source and downloadable backup; it does not silently overwrite an existing online dataset. The legacy authenticated campaign comparison route and provider adapter remain present but the dashboard no longer calls them.

## Product performance AI boundary

`ProductPerformanceChat` is a dashboard-only Client Component rendered for the selected product. It keeps separate in-memory message arrays keyed by product ID and active Wednesday, and sends at most eight prior messages plus sixty populated period summaries. The active report additionally contributes its bounded budget, Target ACOS, notes, carry-forward text, goals, and actions. Text output is rendered as plain text with preserved line breaks; no model-generated HTML is enabled and no chat state enters `glassco.ppcPerformanceNotes.v1` or another browser key.

Authenticated `POST /ppc/api/dashboard/ai-chat` is the sole model boundary. It validates and bounds every client-provided product, date, metric, goal, action, and message field, rejects requests over 100 KB, and returns only `{ answer }` with `Cache-Control: no-store`. The route uses AI SDK `generateText` with the current Gateway-supported `openai/gpt-5.6-sol` model, allows up to five model/tool steps and 1,000 output tokens, relies on AI Gateway to resolve automatically refreshed project OIDC in Vercel or `AI_GATEWAY_API_KEY` for local development, and converts authorization, configuration, authentication, rate-limit, budget, and provider failures into non-secret errors. The stable Pipeline user ID and MCP-specific feature tags are supplied to Gateway for scoped usage controls; user-specific responses explicitly bypass Gateway caching.

The same verified Pipeline identity opens a short-lived Scale Insights MCP session through Vercel Connect. Runtime tool discovery is filtered to valid read-only, non-destructive definitions that expose an ASIN argument; known reporting tools remain explicitly allowlisted, while mutation-shaped names and account-wide tools are never offered to the model. Every execution overwrites supported ASIN, marketplace, and date parameters with the selected ASIN, US, and the visible completed-date range. Tool text/structured results are bounded to 50,000 characters, binary content is discarded, the session closes after generation, and both dashboard context and MCP results are treated as untrusted data. The browser receives only the final answer or a validated hosted consent URL.

## Third-panel presentation layer

The workspace uses a dedicated ppc-performance-workspace.module.css module, isolated from the product/timeline stylesheet. Unused legacy workspace selectors were removed. The dashboard route layout self-hosts Geist and JetBrains Mono through next/font; the three reference panels consume those font variables through their isolated modules. The third-panel canvas uses a 1152px maximum width, 24px spacing, bordered white sections on #fafafa, and 190px metric tiles. Goal/budget DOM order precedes performance. Total Orders follows Organic Orders, ACOS/TACOS remain adjacent, and Conversion Rate follows Total Sales. Save records the existing browser-local report state without an export control or additional persistence.

## Product-panel presentation layer

The first dashboard panel uses `product-portfolio-panel.module.css` and a fixed 300px desktop grid track to reproduce the supplied white monochrome surface. The default header exposes one plus trigger; its transient React menu reveals the existing add-product, add-tag, and edit-mode commands without introducing new persisted state. Search, tag filtering, product selection, local image overrides, dialogs, deletion, and accessible keyboard reorder continue to operate through `ProductPortfolioPanel`. The visual status dot, selected-card color, thumbnail size, and tag badge are render-only projections of the validated catalog.

## Reporting-period presentation layer

The second dashboard panel uses `ppc-reporting-periods.module.css` so the supplied 340px monochrome design does not inherit the earlier blue timeline treatment. It consumes the dashboard layout’s existing Geist and JetBrains Mono variables. The component continues to derive its week list, selection, report status, cached metrics, month coverage, and tag from existing state; the abbreviated range and reference labels are display projections only. Full week ranges remain in button accessible names. No report, catalog, or cache schema changes were introduced.

## Goal resolution and previous-week comparisons

`WeeklyPpcReport.goalHistory` is a backward-compatible, validated array of at most 100 resolved goals per product/week. Achieved/Missed actions atomically remove an item from `goals`, prepend a terminal history entry with an ISO timestamp, and use the existing dirty-report auto-save. The product-level history dialog derives a newest-first view across saved reports without duplicating data. Parser migration moves legacy terminal goals out of the active list, using the report update time or reporting-week start as a deterministic resolution timestamp; malformed history entries are discarded.

Active goals may carry validated `metric` and `unit` planning metadata. Supported metrics distinguish Increase/Decrease Spend, PPC/Total Sales, PPC/Organic/Total Orders, ACOS, and TACOS. Their Actual value is a render-time projection of the matching selected Scale Insights snapshot field and is never user-editable. Target formatting is presentation-only: currency and other percentage goals retain two decimals outside edit mode, ACOS Targets and count goals render as whole values. Full-period completeness is derived by comparing the snapshot end date with the selected Wednesday plus six days. Goal resolution copies the derived display value and optional Partial/Final state into history, preserving what the user evaluated. Legacy `spend` maps to Decrease Spend unless its title explicitly says Increase, and legacy `sales` maps to PPC Sales; unrecognized titles remain intact until the user selects a structured goal.

The previous-week comparison layer overlays the matching validated performance snapshot on the prior local report, then passes those metrics to the existing metric renderer. Display formatting rounds and adds thousands separators without modifying cached precision. Budget burn-rate spend and limit values also use whole-dollar presentation. The renderer derives a percentage delta when the prior value is nonzero and classifies favorable direction by metric: lower Spend/ACOS/TACOS is favorable, while higher sales/orders is favorable. An availability guard suppresses the delta badge when the current report has neither imported nor entered performance, so an unavailable week is not misrepresented as a 100% decline. A newly created report copies the preceding report's `previousWeekResult`; the renderer also falls back to that preceding value for older blank reports, while any text already stored on the selected week wins. Compact grouped cards, comparison badges/footer rows, budget alignment, and removal of the redundant summary are presentation-only.

The PPC route owns transient Dashboard/Products tab state. Products retains the existing three-panel editor. Dashboard renders a full-width `PerformanceOverviewDashboard`; its authenticated no-store overview route opens the existing Scale Insights connection and normalizes timeframe totals, ASIN-level rows, campaigns, keyword/product targets, and search terms. ASIN ranking metrics merge `get_ads_performance` per-ASIN opportunities (`entity`, `TotalSpend`, `TotalAdSales`, `TotalOrders`) with `get_sales_data` `group_by=total` ASIN rows for the applied completed range. Momentum uses Total Sales from the immediately preceding equal-length range. A transient refresh counter repeats the entire request on demand. Browser-local weekly reports remain a summary fallback and are not used to substitute ASIN rows for an unrelated custom range. A transient ASIN/SKU/product-name filter scopes provider ASINs and local identity joins. Native `details` elements provide independent closed-by-default section state without storage.

## Target ACOS and ASIN-scoped Scale Insights links

`WeeklyPpcReport.targetAcos` is an optional-compatible finite nonnegative number normalized into the existing version-1 browser report schema. The warning state is derived during render from `targetAcos > 0 && acos > targetAcos`; Scale Insights remains the source of actual ACOS and Target ACOS is never sent upstream.

Analysis destinations are built from a fixed `https://portal.scaleinsights.com` origin and an allowlist of eleven report definitions. The URL builder normalizes a ten-character ASIN and accepts only ISO-shaped dates. Standard reports receive `asinList`, `from`, and `to`; Daily, Weekly, and Monthly Performance share the allowlisted Advertising Trend path and receive `asinList`, fixed `cycles=7`, `daysPerCycle=1`, `7`, or `30`, and the selected Tuesday as `to`. The header renders the allowlist as an acquisition/targeting group (Campaigns, Keyword Targeting, Product Targeting, Search Terms), an analysis group (Ad Types, Match Types, Placements, Main Keywords), and an isolated trend group. Invalid input falls back to the Scale Insights Ads landing page. Links open with `noopener noreferrer`. The frontend sends no OAuth material, connector token, or raw MCP response to Scale Insights through these URLs.

## Budget history and multi-month reporting

`WeeklyPpcReport` adds a backward-compatible `budgetHistory` array. Budget edit focus captures the original weekly limit; blur or Enter appends one validated change and lets the existing dirty-report auto-save persist it. Parsed rows require a valid timestamp, distinct finite nonnegative values, and are capped at 100 per report.

Multi-month selection is transient client UI state. Pure domain helpers validate and union selected `YYYY-MM` keys into deduplicated Wednesday week starts, cap the result at the current week, and calculate a human-readable label from every month touched by the resulting Wednesday–Tuesday ranges. Changing the selection immediately moves an out-of-range active week to the newest visible week.

## Saved weekly performance and smaller tags

A versioned local performance snapshot cache is independent of editable weekly reports, keyed by US marketplace, normalized ASIN, and Wednesday start. Hydration completes before automatic fetches. The selected ASIN's active week is queued first, then all other visible uncached weeks are backfilled with two workers so the connector is not flooded. Five source values are validated and derived metrics recalculated when restoring snapshots; no OAuth material is stored. Successful fetches persist immediately, week cards and detail metrics overlay the matching snapshot, and explicit Refresh bypasses the cache for the active week only. Product/week changes abort obsolete work; completed snapshots remain reusable, canceled requests cannot update state, and failed active refreshes preserve cached values and read-only imported inputs. The metrics input layer and timeline ACOS presentation round only rendered values, leaving cached and calculated numbers exact. Timeline card metadata places the week number in the upper-right without changing date semantics.

## Compact product cards

Portfolio cards display the image, product name, and tag without ASIN/SKU rows. View-mode cards use a compact 66px minimum height; edit mode retains room for Edit, Delete, and Reorder controls. ASIN/SKU remain in the selected-product header, edit form, search index, and existing storage; this is presentation-only with no data migration. Verify both identifier links remain in the detail header after selecting a product.

## Product portfolio ordering

Product order is persisted as optional `productOrderIds` in the version-1 dashboard catalog. Parsing validates and deduplicates IDs; the merge uses a stable sort and leaves unspecified/new products in their source order. The reorder helper fills only currently visible slots, so filtering does not move unrelated products. No Pipeline mutations occur.

## Automatic listing images

`/ppc/api/dashboard/product-image` authenticates the Pipeline user, reuses their server-side Vercel Connect grant, and calls `get_product_metadata` for exactly one US ASIN. Only an exact ASIN/country match is accepted. The server downloads the returned HTTPS `m.media-amazon.com/images/I/` thumbnail without redirects, with a timeout and 900 KB streaming limit, and returns a no-store image data URL. The debounced form cancels stale requests and protects manual image choices.

## Current-week reporting cutoff

The performance route caps the derived Tuesday end date at yesterday in UTC before calling either MCP report. Both reports must match that same effective scope; strict upstream scope validation remains unchanged. Responses expose the effective `endDate` and add a partial-week warning when it precedes Tuesday. Weeks starting after the cutoff return no-store `404` without requesting upstream data. This prevents Scale Insights' exclusion of today/future dates from producing a false scope mismatch.

## Current mode

The Library is an authenticated Next.js microfrontend. Pipeline owns the authoritative Postgres Library state and authorization boundary; this repository owns the `/ppc` user interface, authenticated API adapter, private image media route, and protected legacy migration route.

## Runtime stack

- Next.js 16.2.10 App Router
- React 19.2.4
- Strict TypeScript
- npm
- Tailwind CSS 4 toolchain and project CSS
- Vitest and Testing Library

## Module boundaries

- `src/app` owns route composition, metadata, shared layout, boundaries, and global CSS.
- `src/components` owns the application shell.
- `src/features/library/domain` owns contracts, headings, search, and builder defaults.
- `src/features/library/data` owns repository Markdown bootstrap validation and legacy Blob backup/migration access.
- `src/features/library/state` owns the shared-state client, response validation, scoped mutations, confirmed-cache fallback, and browser-only reading state.
- `src/features/library/ui` owns catalog, reader, administration, and builder interfaces.
- `content/library` is bootstrap/compatibility content, not an ongoing source merged into the authoritative catalog.

## Rendering model

Server Components can load bootstrap documents for deterministic rendering, but active documents/categories hydrate from Pipeline's shared response. Focused Client Components manage search parameters, browser-only reading state, role-aware administration, structured editing, five-second visible-tab polling, and focus revalidation.

The reading-state hook uses a server-safe hydration snapshot so server HTML and the first browser render remain deterministic even when bookmarks already exist locally.

## Content repository

The repository parser validates bootstrap Markdown, rejects duplicate IDs/slugs, derives reading time, and extracts stable topics. Once the Postgres catalog is initialized, bootstrap Markdown is not merged or republished; active/tombstoned state comes only from Pipeline.

Markdown does not allow arbitrary raw HTML. GFM tables are constrained for responsive horizontal scrolling.

## Structured document builder

Legacy Markdown documents are converted into editable topic elements on entry to edit mode. Once saved, structured elements become the shared document representation. Optional fields provide backward compatibility for newer repeatable dropdowns and table column widths.

The builder owns:

- Element creation and deletion
- Topic derivation and numbering
- View/edit rendering
- Viewport-aware element menu placement
- Repeatable dropdown editing
- Table row/column sizing
- Roadmap placement, step-number position, shared Blob-backed image uploads, inline list-style subtext composers, and full-width centered image rendering
- Reusable authenticated image-upload controls for Roadmaps, Feature Cards, and Gallery slots, backed by the private Blob media route
- Authenticated image rendering fetches private media with the stored Pipeline bearer token, creates a temporary object URL, and revokes it when the preview unmounts or changes
- Key Insight blocks use one optional `insightColor` presentation field with a legacy-safe Green default and Green/Blue/Red editor controls
- Rich-text editors share one compact icon toolbar and one Tiptap selection bubble. Paragraph alignment is stored in allowlisted paragraph attributes, links are stored as sanitized `href` marks, and static reader rendering always applies protected new-tab attributes.
- Responsive Gallery editor grids with minimum slot creation; square `object-fit: contain` presentation preserves each source ratio while the image modal reuses the rendered image `currentSrc` for immediate full-size inspection
- Video link validation and header presentation derivation: YouTube privacy-enhanced embeds, cropped-toolbar Google Drive `/preview` embeds with centered player content and a compact new-tab overlay, native direct-file playback, and secure link fallback render in the blue header’s responsive right column

## Document metadata editor

The catalog modal is now a creation-only boundary. It accepts title, description, and category while assigning the existing defaults for document type, tags, and legacy Markdown. Existing catalog cards no longer expose an Edit / Rename action.

Existing-document metadata editing lives in the structured builder. Entering edit mode replaces the blue header copy with controlled title, description, and category fields without issuing a mutation. The sidebar and mobile mode control changes from an Eye to a Pencil indicator, while a separate `Save changes` action sends the metadata values and current structured elements through one shared document update and returns to view mode. Stable document ID and slug are retained, while type, tags, and legacy Markdown are preserved.

The creation modal retains Category Plus and Pencil controls for quick creation and full category management. The library category manager remains the boundary for rename, reorder, visibility, recoverable deletion, and recovery. Deleted categories are not rendered in the main manager list; a recovery icon opens a focused dialog containing only recoverable categories. Reader edit mode consumes the validated active category list for reassignment.

The catalog toolbar keeps document creation available in both view and admin modes. Document recovery remains an admin action: deleted documents are excluded from the catalog layout, and an admin-only recovery icon opens a focused dialog containing the recoverable document list. Each row displays direct-user, system-migration, system-backup, or unknown attribution supplied by Pipeline. A confirmed bulk action sends one revision-guarded mutation containing only migration-attributed IDs; manual deletions are never included. Each recovery row also exposes an icon-only permanent-delete action behind a second confirmation. Pipeline removes only an existing tombstone, retains a metadata-only audit event, and excludes purged IDs from backup restoration.

The Library adapter forwards authenticated `document.delete` mutations without imposing a minimum active-document count. ADMIN may intentionally leave the catalog empty; the deleted record remains a normal recoverable tombstone and permanent deletion remains a separate Recovery action. Recovery opens its shell before network work starts, then loads ordinary tombstones and protected permanent-deletion history independently. The local `/ppc/api/library/recovery/purged` route is ADMIN-only and treats the current immutable legacy artifact, checksum-addressed legacy archives, and newest matching pre-purge Pipeline backup as read-only sources. It exposes explicit restore actions only for “Monitor Product Listing Prices Through BQool” and “Check Spend with No Sales”; each action recreates the original document identity and does not restore any other intentionally purged document.

No document cards render while shared administration state is hydrating. The document grid remains a skeleton until the authoritative response succeeds or the validated confirmed cache is selected as a read-only fallback, preventing stale or deleted records from appearing during refresh.

## Persistence and synchronization

- Pipeline `/api/library-state` stores documents, categories, tombstones, ordering, global revision, per-record versions, audit records, and backups in Postgres.
- Library `/ppc/api/library` forwards authenticated GET/PATCH/POST requests and does not keep writable catalog state.
- Document/category changes are scoped operations. Record updates, delete, and restore use `expectedVersion`; catalog ordering and initialization use `expectedRevision`. Conflicts return `409` plus the latest full response.
- ADMIN may perform every mutation and backup action. USER may create and update active documents. VIEWER is read-only. Pipeline checks the current active database user on every request.
- Successful server responses replace the confirmed browser cache. If the server cannot be reached, a validated cache may render read-only; mutations are disabled and local edits are never queued for upload.
- Live responses are accepted only when Pipeline supplies a same-snapshot document lifecycle manifest and completeness counts matching every returned document/category and record version. A malformed or partial HTTP 200 response is treated as an outage: the last confirmed catalog/document remains visible read-only and no cache is evicted.
- Deleted documents and categories retain `deletedAt` tombstones and remain inactive until explicit ADMIN recovery. An ADMIN-confirmed permanent deletion moves a tombstone into Pipeline's protected archive while retaining content and audit history outside normal Recovery. Pipeline backup restore merges records without tombstoning backup-absent or newer active documents.
- Only bookmarks, recent history, last topic, completion, session/route handoff, and the confirmed read-only catalog cache remain browser-local.
- Bookmark IDs remain browser-local even when their documents are hidden or deleted. The hero badge intersects the deduplicated stored IDs with the authoritative active, visible, published catalog IDs, so stale IDs do not inflate the visible count and can become active again after recovery.
- Document reorder expands one delimiter-safe scalar parameter in PostgreSQL, preserving submitted ordinality without applying JSON-array functions to a scalar. The dialog owns its pending order until the revision-guarded mutation succeeds.

## Styling

`src/app/globals.css` contains the base application design system. `src/app/library-admin.css` contains catalog/admin overrides and category-manager styling. The structured builder uses a colocated CSS module.

The shared application launcher renders three independent card links inside each shell's reserved top bar. Product Pipeline, Team SOP Library, and PPC Dashboard are real `target="_blank"` links; the current application remains visually active and `glassco.appRoutes.v1` supplies independently validated destinations. Its optional `ppcDashboard` field extends the legacy `{ pipeline, ppc }` record without invalidating it.

The dashboard page remains a Server Component boundary that renders one focused interactive Client Component. `/ppc/api/dashboard/products` verifies the Pipeline bearer session, fetches `/api/workspace-state?transport=binary-v2` server-to-server with `no-store`, reassembles the versioned chunk manifest when Pipeline omits inline state, and returns only compact added-product identity fields. The three-panel dashboard uses a colocated CSS Module so its dense responsive workspace does not leak styling into the Library reader or builder.

`/ppc/api/dashboard/performance` is the authenticated Scale Insights boundary. It validates the ASIN, marketplace, and Wednesday week start, derives the Tuesday end date, and uses a server-only MCP client to call `get_ads_performance` and `get_sales_data` concurrently. After Pipeline verifies the bearer session, its stable user ID plus the Pipeline origin form the Vercel Connect user subject. Vercel OIDC authenticates the project, and Vercel Connect supplies a short-lived MCP bearer while retaining and refreshing the OAuth grant outside the application. The adapter accepts only the requested scope and finite non-negative totals. Spend, PPC Sales, and PPC Orders come from advertising totals; Total Sales and Total Orders come from sales totals. A pure domain function calculates Organic Sales, Organic Orders, ACOS, and TACOS. Responses and upstream calls are uncached, credentials never enter a client bundle or browser storage, and upstream/configuration failures return bounded error messages without secret material.

The Products panel is isolated in a focused Client Component. It merges the compact Pipeline list with a validated shared `glassco.ppcDashboardCatalog.v1` overlay containing dashboard-only products, reusable tags, and per-Pipeline-product display overrides. The overlay never writes to Pipeline and product deletion is limited to dashboard-added products; weekly-report records are retained independently.

The dashboard performance effect requests only the selected product ASIN, fixed `US` marketplace, and Wednesday starts for the visible reporting weeks. The active week is prioritized and drives the visible loading, consent, freshness, and error state; background-week failures do not replace the active-week status. If Vercel Connect reports that this verified Pipeline subject has no grant for the active request, the API returns a no-store `409` containing only a Vercel-hosted consent URL; the dashboard renders a same-window `Connect Scale Insights` link. After hosted consent returns to `/ppc/dashboard`, the ordinary effect retries automatically. A successful validated response replaces and locks the six imported source metrics for that product/week, while the calculated values remain read-only. Manual source entry remains available when Scale Insights is unconfigured or temporarily unavailable. Imported values are copied into the existing versioned local report draft, but Vercel OIDC credentials, Connect tokens, OAuth grants, and raw MCP responses are not stored.

For session-only logins, the source tab writes the versioned `glassco.authHandoff.v1` record to same-origin local storage with a 30-second expiration and a Pipeline/PPC target. The matching destination consumes it once into its own session storage, removes the record, and verifies the bearer token through `/ppc/api/pipeline-session`. Persistent local-storage sessions bypass the handoff. Missing/401 sessions return to Pipeline with a validated `/ppc/library/*` or `/ppc/dashboard` `returnTo`; temporary verification failures show a retry gate.

## Storage boundaries

Pipeline Postgres is authoritative for Library catalog data. Private Vercel Blob is authoritative for uploaded images and the versioned shared PPC dashboard stores. `/ppc/api/dashboard/state` validates known stores and guards writes with the prior Blob ETag; before-write copies are retained under the dashboard history prefix. `SharedDashboardStorage` responds to a 409 by loading the newest confirmed document, applying a three-way merge against the browser's last confirmed base, and retrying with the new ETag and operation ID. Separate record/field edits and stable-ID list additions are preserved; the latest local edit wins only when both sessions changed the same scalar. The weekly-report dataset additionally writes each pending validated value and its confirmed merge base to a browser-local recovery outbox before debounce. Startup merges that outbox with the newest remote document, retries automatically, and clears it only after server confirmation. Visible workspaces check for remote ETag changes every 15 seconds and on window focus, then remount from confirmed shared values when no local save is pending. The old `glassco/library-state-v1.json` object and checksum-addressed copies under `glassco/library-backups/` are migration/rollback artifacts, never live writable state.

The protected `/ppc/api/library/migration` route is ADMIN-only. It can download the legacy snapshot, create an immutable checksum backup, and initialize an empty Pipeline catalog with the complete validated legacy catalog. It never creates new tombstones. Initialization is revision-zero-only and must run after the Pipeline protections deploy.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Current verified result: all gates pass, including 327 passing tests across 55 files and 6 intentional skips.
# Pipeline-domain integration

Next.js is compiled with `basePath: "/ppc"`. Pipeline proxies `/ppc/:path*` to the stable PPC deployment alias, producing one browser origin without combining repositories or persistence systems.

`GlasscoSessionProvider` reads the existing Pipeline bearer session and verifies it through the PPC `/api/pipeline-session` server route. The Library adapter passes that bearer token to Pipeline `/api/library-state`; Pipeline reloads the active user and role before authorizing each operation. The client gate and hidden controls improve navigation but are not treated as the authorization boundary.

`PIPELINE_AUTH_ORIGIN` may override the server verification origin, and `NEXT_PUBLIC_PIPELINE_ORIGIN` may override the browser return destination. Both default to `https://glasscopipeline.vercel.app`.

# Rich-text architecture

`domain/rich-text.ts` owns the persistence allowlist, legacy Markdown/plain-text conversion, text fallback generation, and malformed-document fallback. The domain contract intentionally does not depend on Tiptap types.

`ui/rich-text.tsx` is the client-only editor boundary. It configures Tiptap with `immediatelyRender: false`, excludes unsupported nodes and marks, and emits both JSON and searchable legacy text. Reader output uses `@tiptap/static-renderer` React mappings rather than raw HTML. The same CSS typography rules are applied to editable and static content.

`ManagedReader` lazily requests one authoritative compact catalog when a Document link picker is first opened. It removes the current record plus non-active, hidden, draft, deleted, archived, and integrity-blocked records, then shares the resulting lightweight options through the document builder to every rich-text editor. The picker reuses the existing `link.href` mark with a base-path-aware `/ppc/library/:slug` route, so no new persistence shape or per-editor network request is introduced.

Rich JSON fields are optional and additive. Shared/local state validation removes invalid optional rich content while retaining the surrounding document so the builder can reconstruct it from legacy strings.

Formatting writes use `document.update` with `updateScope: "content"`. The Pipeline contract canonicalizes supported nodes, marks, links, alignment, and lists, strips editor-only link attributes, and preserves identity plus lifecycle fields. Its mutation response includes the authoritative saved document, active lifecycle state, and advanced record version from the same database write. `ManagedReader` verifies all of those values before applying the response. Missing or malformed save data leaves the current document/editor intact; only an explicit structured `deleted`, `purged`, or `archived` status can replace the reader with a lifecycle screen.

## Live Library state reconciliation

- Normal catalog and reader requests receive active records from one Pipeline database snapshot; deleted documents and attribution are fetched only for ADMIN Recovery.
- Confirmed catalog and per-document caches remain separate, read-only outage fallbacks. Each cache records its snapshot time and revision and is never uploaded to Pipeline.
- Focus, visibility, `pageshow`, and browser history restoration trigger immediate authoritative refreshes. Only an explicit `deleted` or `archived` manifest lifecycle invalidates a missing document cache; a verified record-version change invalidates a still-active cache. Formatting-save responses are handled separately and never evict a cache unless they explicitly report a lifecycle transition.
- Slug reads expose `active`, `deleted`, `purged`, or `not_found` status so stale routes render an explanation instead of silently reconciling to an empty reader.

## Weekly metric comparison rendering

The dashboard derives each comparison from the selected report and the immediately preceding saved or cached weekly report. This is presentation-only: both values retain the existing report schema, while direction classes are applied only when the current period contains available performance and the prior value remains neutral. Each card uses a small centered vertical stack, a non-wrapping title, content-sized metric input, and a separate centered footer so currency and percentage symbols cannot collide with comparison content. Scale Insights trend routes retain their slugs and query parameters while their visible labels omit the redundant “Trend” suffix.

Timeline cards project PPC Sales and PPC Orders rather than total values. Budget-history pagination slices the existing newest-first `budgetHistory` array into five-row view pages; the active page is transient component state and is not persisted.

## Untargeted opportunity reporting

`/ppc/api/dashboard/untargeted-opportunities` is an authenticated, no-store reporting boundary for one selected ASIN and Wednesday reporting week. It caps an in-progress week at yesterday, opens one Scale Insights tool session, and calls `get_search_term_performance` plus `get_search_term_keyword_analysis` in harvest/raw mode. The performance report supplies reconciled Impressions, Clicks, Spend, Sales, Orders, and ACOS; harvest analysis proves a text query lacks an exact keyword and supplies CampaignId, AdGroupId, ParentKeyword, and ParentMatchType. When converting candidates contain product ASINs, the adapter conditionally calls ASIN/date-scoped `get_target_performance` and removes every ASIN already present with `TargetType=product`. It emits Product ASIN opportunities only after the complete target result set is available; missing, unreadable, or truncated product-target coverage omits those candidates rather than asserting they are untargeted. The adapter normalizes nested `entity`/`metrics`, structured JSON, and Markdown-table responses, rejects rows missing required PPC metrics, and emits only terms with at least one attributed order and campaign attribution. Duplicate term mappings resolve by greatest Sales, then Orders and Spend.

The dashboard-wide Refresh Data action issues the opportunity request for the active product/week alongside the weekly performance refresh. Validated responses are stored in the capped version-1 `glassco.ppcUntargetedOpportunitiesCache.v1` browser cache and restored by product/week without another MCP call. Campaign-attribution fields are optional for backward compatibility with existing cache entries. A refresh token is scoped to the active performance-cache key, so selecting another product does not trigger an implicit opportunity request. Copying, criteria changes, six metric sorts, and filtered aggregate totals remain local. Weighted total ACOS is derived from aggregate Spend and Sales. Row source URLs use the Scale Insights Search Terms route with the active ASIN and period. The source-link click also writes the selected row value to the browser clipboard for manual paste into Scale Insights Instant Search; Scale Insights applies that search only inside its client grid and ignores URL search parameters. No source URL is persisted. Provider errors expose bounded codes and a correlation ID; logs contain tool property names and counts without search terms, ASIN opportunities, metrics, tokens, or raw response bodies.

## Live account performance overview

Keyword and product-target discovery use separate exact tool names. ASIN Targeting reads nested `metrics.TargetType`, strips the provider's product/category suffix from target labels, and follows raw target pagination. It selects one payload representation per page to avoid mirrored JSON duplication while retaining separate rows with the same target label. Advertised ASIN is never inferred from a target entity; only a single verified request ASIN is used as a missing-scope fallback. Product/category metrics share the accessible local sorting controls with campaigns. Target MCP calls allow 60 seconds.

`/ppc/api/dashboard/performance-overview` is an authenticated, no-store read boundary. It validates one to 100 ASINs, marketplace, and an inclusive range no longer than 90 days, then caps the provider end date at yesterday. One Scale Insights tool session discovers the active schemas and requests advertising and total-sales summaries for Yesterday, 7 Days, 14 Days, and the selected period. The selected-period sales request uses the provider's daily grouping, retaining its ASIN totals while adding the aggregate `Daily` series used by the quick-stats chart; ACOS and TACOS are derived per day from PPCCost/PPCSales and PPCCost/Sales. The same session requests selected-period campaign, target, and search-term reports. The adapter only sends parameters advertised by each tool, supports array or single-ASIN contracts, and reports a single-ASIN requirement instead of widening the requested scope.

The client validates the response before rendering it. Campaign, keyword target, product target, and search-term rows share a normalized read-only metrics contract. Provider ACOS, ROAS, CPC, CTR, and CVR take priority when supplied; other row types may derive rates from returned totals. The date and ASIN controls are transient UI state; no report, credential, or custom range is added to browser storage. Local saved weekly reports remain a visible fallback for temporal totals; ASIN ranking uses the applied live range.

Campaign rows come from `get_campaign_performance`, not campaign grouping on the per-ASIN advertising endpoint. The adapter requests raw 500-row pages and follows `oppMeta.total_pages`, merging and deduplicating all campaign pages before rendering. The campaign source is explicitly account-wide because its schema has no ASIN argument or mapping. Optional validated state, CPC, CTR, and Daily Budget fields retain backward compatibility with older overview rows. Per-table campaign sort state remains in React memory; accessible metric-header buttons sort the complete loaded campaign set without another provider request.

Currency goal targets reuse the Actual value formatter for consistent whole-dollar display.

SummaryTopicComposer edits topic arrays within the active product/week report. Stable topic IDs preserve identity during reorder. summaryTopicsNotes derives the plain-text notes projection for previous summaries and chat. Active textarea selection is held in refs and reset when the product/week key changes.

Opportunity header totals aggregate all filtered matches, including rows beyond the current page, and derive ACOS from total Spend/Sales. The bulk selection action sits in the summary toolbar.

Opportunity table density and metric alignment are presentation-only CSS rules scoped to opportunityTable; search-term identity layout is unchanged.

## Six-week weekly performance table

`PpcPerformanceDashboard` derives a six-week window from the active Wednesday week (`active - 35 days` through `active`) and loads uncached periods through the existing Scale Insights performance route with the current two-request concurrency limit. `WeeklyPerformanceTable` renders the stable metric row order and highlights the rightmost selected week. The provider adapter preserves optional PPC impressions, PPC units, and total units; the domain calculation derives CPC from Spend / PPC Clicks and Organic Units from Total Units - PPC Units when both inputs are present. Missing optional fields remain unavailable rather than estimated.

The table groups paid, organic, total, and efficiency metrics. Total Sales, Total Orders, and Total Units use the same validated weekly snapshot fields and render immediately above ACOS and TACOS.

## Weekly traffic and unit enrichment and cache upgrade

The weekly adapter runs the ads detail, sales detail, and paginated ASIN-scoped Search Term Performance load together. Search-term pages use 500 rows with a five-page safety cap; impressions are summed only when coverage is complete, while the provider's full-population click total is retained. PPC Units use an advertising aggregate, a complete search-term row sum, or explicit Sales Trend PPC/Organic/Total Units fields. Nested Sales payloads are normalized, and any missing third unit total is derived only when the other two exact totals are present. Successful responses carry `metricsRevision: 4`. The client treats revision-3 and older snapshots as readable but stale and refreshes each visible week once, replacing it in the existing version-1 cache.

The workspace planning area is a responsive stack: a full-width Budget Pacing strip followed by a two-column goals/action grid that becomes one column in narrow containers. The Action Items card uses a compact title row with an accessible labeled add button; its former descriptive paragraph is not rendered. Active goal status remains stored for backward compatibility, while the workspace exposes terminal achieved/missed actions and deletion without the interim status selector. Action priority and due-date fields remain parseable for compatibility but are no longer rendered. New reports copy the prior report's weekly budget, derive its daily limit, and copy unfinished prior-week actions with fresh IDs; later edits affect only that new report. Burn-rate calculations and gauge markup are no longer rendered.

Budget-strip utilization, elapsed-week percentage, burn-rate variance, remaining balance, and daily spend average are render-time calculations from the active report, selected Wednesday-start week, and dashboard date. They add no stored fields.

The weekly workspace writes each changed report to `SharedDashboardStorage` synchronously during the edit event. Network upload remains queued, but the browser recovery copy is written before another event or refresh can occur. Action IDs use random UUIDs so two quick additions cannot share an identity. Repeated ETag conflicts remain pending and retry after a short delay, and the UI distinguishes a queued upload from a confirmed online save.

The active product/week/month selection is a validated browser preference, independent of the shared report. The report recovery outbox is scoped to a browser tab via session storage, while the previous unsuffixed key is read for migration. Pending edits merge with the latest confirmed document on a genuine ETag conflict and remain queued through bounded retries. The server records only the conflict condition (`stale_etag` or `write_precondition`) and dataset key, never report contents; an already-identical remote value counts as confirmation. Failure to write browser recovery storage is surfaced before the user leaves the page.

Private Blob content is read with `get(..., useCache: false)`, but its response ETag is not used for conditional writes. A `head()` metadata request supplies the canonical ETag returned to clients and passed back to `put(ifMatch)`; the content remains validated before use. This corrects a production mismatch between the content-response ETag and the Blob API's write precondition ETag.

## 2026-09-29 — Weekly goal persistence and Day Parting

New weekly reports start without prefilled goals. Saved empty goal lists remain empty when loaded and when the next week is created, so a deleted goal does not reappear. Added goals use unique IDs and enter the existing immediate shared-save/recovery queue. The selected product links to Scale Insights Day Parting below Monthly Performance.
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

Performance Summary is an isolated client component using the existing validated local audit. ASIN/product filters scope both sources; campaign and match filters scope PPC. Entity-level deduplication remains unchanged.


### Wasted Ad Spend and Opportunities — 2026-10-16

Wasted Ad Spend uses a dedicated client view and pure waste classification module. It chooses query/target rows per campaign and falls back to one campaign entity level only when no targets exist. Independent review storage is validated and bound to the imported audit timestamp. Opportunities checks full-upload exact coverage before applying view filters.


### Opportunities dashboard — 2026-10-16

Opportunities has a dedicated client dashboard and pure diagnostic module. Canonical evidence selects query, target, or campaign rows per campaign; placement performance is a separate dimension. Exact-target exclusion uses the complete uploaded report before UI filtering. Opportunity workflow state is validated and isolated by imported audit timestamp in a separate localStorage record.


### Advertised ASIN dashboard — 2026-10-16

Advertised ASIN uses a dedicated client view and pure ASIN reconciliation module. Product-ad performance is preferred per campaign; if absent, use query/target evidence or one fallback entity level. Parent campaign totals and placement dimensions are not added to product totals. Matching and placement filters explicitly select their evidence dimensions. Reads the existing validated waste-rule record without changing report persistence.


### Campaign workbench — 2026-10-16

Campaigns uses a dedicated client workbench and pure campaign aggregation keyed by advertising type plus campaign ID. Uses one non-placement performance level per campaign, with ASIN/match/placement scopes selecting appropriate lower-level evidence. Campaign state is read from campaign metadata, never inferred from target enablement. Optional daily-budget and campaign-state fields preserve compatibility with uploaded audit v1 records.


### Campaign Type comparison — 2026-10-16

Campaign Type now aggregates the campaign workbench evidence by canonical SP/SB/SD classification, keeping campaign identity and entity-level selection intact. A pure analysis module calculates weighted rates, contribution shares and review findings; the client view supplies filters, type selection, column visibility and paginated campaign evidence. Full analysis navigation opens the selected campaign in Campaigns.


### Placement dashboard — 2026-10-16

Placement now has a dedicated client dashboard and pure placement evidence boundary. Performance is selected per campaign identity and canonical placement, without adding repeated hierarchy levels or non-placement campaign totals. Explicit ASIN and match cross-sections are calculated independently. The shared Campaigns workbench opens from contributing campaign and ledger actions.


### Keyword Target dashboard — 2026-10-20

Keyword Target uses a dedicated client dashboard and a pure keyword analysis boundary. Identity includes advertising type, campaign, ad group, keyword ID/text, match and product scope. Indexed ID/text candidate lookups admit only unique contextual query/placement links. Parent keyword totals and linked query/placement dimensions are kept separate. Queries with enough explicit keyword context can supply labeled query-level fallback metrics.
