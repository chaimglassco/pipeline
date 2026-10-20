# Glassco Back Office Library — Product Specification

## September 11 automatic status, empty actions, and PPC conversion

The workspace has no manual Save button because edits are automatically saved. Reporting Periods labels cached full weeks Completed and cached incomplete weeks Partial from their actual coverage dates. Action Items begins empty until Add Action Item is selected. Goal status and outcome controls sit at the lower right beside the Partial/Final label; summary formatting controls sit at the upper right of the documentation label; the Sales WoW line sits above the Total Sales value.

## Dashboard and Products views

The PPC route starts in the existing Products workspace and exposes Dashboard and Products as keyboard-accessible switch tabs above the three-panel layout. Dashboard opens a full-width monochrome performance overview based on the supplied reference. Its temporal ledger shows Today, Yesterday, 7 Days, 14 Days, and a selected range. Completed windows use Scale Insights with browser-local weekly reports as a temporary summary fallback; unsupported daily windows are explicitly unavailable. The ASIN ranking uses live product-level Scale Insights advertising and sales rows for the applied range, with Spend, Sales, Orders, ACOS, TACOS, account shares, and Sales momentum against the immediately preceding equal-length period. Keyword, campaign, product-target, and search-term ledgers use live data when the connector exposes the corresponding report. Every Dashboard data section is a closed-by-default disclosure. A shared search matches ASIN, SKU, or product name and scopes live requests, cards, rankings, and detail tables. View and filter choices are transient.

PPC Conversion Rate equals PPC Orders divided by PPC Clicks. Scale Insights supplies clicks automatically from its single-ASIN advertising row or aggregate totals; when those advertising totals omit clicks, the shared Refresh Data flow reuses the complete ASIN-and-week Search Term Performance result and totals its clicks without an extra provider call. The card contains no manual click field and displays the result as a whole percentage. If neither source provides a complete click count, the rate remains unavailable. Overall Orders/Sessions are never substituted.

The ASIN row includes a keyboard-accessible copy button with copied feedback. ACOS goal Targets display without decimals. Strategic Weekly Goals omits the active-count badge and places Goal History and Add Goal together at the upper right.

## September 11 custom-goal and budget-card behavior

Budget Utilization remains top-aligned beside Strategic Weekly Goals and does not move its controls when the goal list becomes taller. The goal selector offers Custom Goal. A custom selection displays a manual goal-text field, keeps Target editable, leaves Actual unavailable because no live metric is mapped, and retains achieved, missed, and delete controls.

## September 11 compact goals and conversion rate

Each active goal displays Target on the first line and Actual directly below it. Achieved, missed, and delete icon buttons share the footer without a separate interim-status selector. Previous Week Summary contains the label Performance Documentation and a vertically resizable read-only field. Both summary headers omit report-state badges, and the prior summary omits Completed, Status, archive, and ROAS metadata.

PPC Conversion Rate is displayed as a whole percentage. When the prior period also has PPC Clicks, the card shows its whole-number previous value and week-over-week direction.

## September 11 dashboard control revision

The workspace header presents **Refresh Data** and edits save automatically. Previous Week Summary is view-only and presents saved topics with the same cards as Current Week Summary, including green Good and red Bad tones; legacy plain text uses a neutral General Summary card. It shows an empty-state message when no result was entered. The final top-row card is titled **Action Items** and contains completion, title, and delete controls. Weekly goal progress places Actual below Target, with achieved/missed/delete buttons in the footer. Budget Utilization places the calculated daily limit inside the Weekly Limit tile and does not repeat daily limit or over/remaining balance outside the primary tiles.

Current Week Summary topic composers automatically grow to show their complete note content when text is entered, formatted, or restored. They do not use an internal scrollbar or manual resize handle.

Each Current Week Summary topic header contains its own bold, italic, underline, bulleted-list, and numbered-list controls between the title and the move/delete actions. The documentation-level header retains the Add Topic action.

## September 11 dashboard catalog behavior

The All Tags product view groups products in this order: Lead Came, Complementary, Homasote Board, Shard Catcher, Kiln Paper, then every other or untagged product. Existing saved order is preserved inside each group. Changing the tag filter selects the first product matching that tag and the active search, immediately updating Reporting Periods and the workspace. The current-period badge uses light blue, Partial uses light red, and the workspace product title no longer repeats the product tag.

## Campaign week-over-week comparison

Below the Previous and Current Week Summary cards, Campaign Week-over-Week Comparison accepts Scale Insights Campaign CSV exports for the immediately preceding Wednesday–Tuesday period and the selected Wednesday–Tuesday period. When the previous period was already imported as the current file of the preceding comparison, that validated file is carried forward automatically and only the new current-week CSV is required. Scale Insights CSVs provide CampaignId, Campaign, Type, Spend, Sales, and Orders but do not include the selected report dates or advertised ASIN. The upload controls therefore label the exact required periods and bind the validated comparison to the currently selected ASIN. Recognizable filename ranges that conflict with either required period are rejected. The operator must export files after filtering Scale Insights to that product.

Rows join by stable CampaignId. Missing weekly rows receive zero metrics, duplicate IDs within one file aggregate only when name and ad type agree, and cross-file identity conflicts fail the import. Each campaign link opens its two-week Scale Insights campaign trend. Validated imports persist locally under `glassco.ppcCampaignCsvComparison.v1`, keyed by marketplace, ASIN, and selected Wednesday; malformed storage entries are discarded independently. Replace CSVs updates only that key. This local MVP does not upload, synchronize, or secure the CSV data.

Seven collapsible rule tables are grouped under Good, Bad, and Neutral. Good contains Spend Up/Sales Up and Spend Down/Sales Up. Bad contains Spend Up/Sales Down, Spend Down/Sales Down, current-week Spend with zero current-week Sales, and New Spend with current ACOS at least 15%. Spend but No Sales This Week has first precedence, followed by inefficient New Spend before the four general direction rules. Campaigns with an unchanged Spend or Sales direction, or another unmatched movement, appear in Neutral. A separate Lost Current-Week Sales rule is omitted because it overlaps with the current-week no-Sales condition or Spend Down/Sales Down when current Spend is zero. Tables show previous/current Spend, Sales, Orders, their changes, and current ACOS; current ACOS is calculated as Spend divided by Sales and displayed as a whole percentage. Every numeric header toggles highest-to-lowest and lowest-to-highest sorting within its own dropdown; Orders sorts by the current-week value and unavailable ACOS remains last.

## Account campaign comparison

The top-level Compare tab uses the same CSV workflow for whole-account Scale Insights Campaign exports. It supports a completed Day versus the preceding day, a completed Wednesday–Tuesday week versus the preceding Wednesday–Tuesday week, and a completed calendar month versus the preceding month. The first comparison requires both labeled files; a validated period snapshot is reused when it exactly matches the next comparison's previous period. The existing ASIN-specific comparison remains inside Products. Dashboard datasets are shared through authenticated private Vercel Blob state, so the first ADMIN visit offers a backup-and-import step for existing browser-local datasets while viewers receive read-only shared data.

The Compare result joins campaigns by CampaignId, zero-fills a campaign missing from either export, and shows Campaign, campaign type, Previous/Current Spend, Spend change, Previous/Current Sales, Sales change, Orders, Current ACOS, and the Scale Insights trend link. Good, Bad, and Neutral filter cards use the same outcome rules as the ASIN-level comparison; selecting one card displays only that category at a time. Results default to All campaigns sorted by Spend change descending, show ten rows initially, and provide Show all. Account comparison snapshots persist in the shared dashboard store `glassco.ppcCampaignAccountSnapshots.v1` without raw CSV bytes; a local value is used only for the explicit first-time migration backup. Sales and Orders remain validated in snapshots and now power the outcome categories and expanded table, while future efficiency filters can build on the same data.

## Product performance AI assistant

The PPC dashboard provides a compact bottom-right Performance AI widget whenever a product is selected. It answers questions using the selected ASIN/product, active reporting week, available previous week, every populated reporting period in the current month selection, weekly budget and Target ACOS, active goals, action items, saved notes, and live read-only Scale Insights MCP tools. Suggested questions cover summary, ACOS movement, and next priorities; users can also type free-form performance questions. Every answer must distinguish Partial, Final, and saved/manual values, identify whether facts came from Scale Insights or saved dashboard context, and acknowledge unavailable data rather than inventing it.

Chat conversations are separated by product and active week and remain only in component memory for the current page session. They are not added to the browser report schema. The browser sends bounded context only after the user asks a question; an authenticated server route invokes the OpenAI model through Vercel AI Gateway and supplies only Scale Insights tools that are read-only and accept an ASIN scope. The route forcibly replaces generated ASIN, marketplace, and date arguments with the selected product and visible reporting range. Scale Insights OAuth, AI credentials, provider errors, and model internals are never returned to the client. A missing Scale Insights grant produces a hosted Connect link inside the widget.

## Product-panel hierarchy

The first panel follows the supplied HTML and image reference as a fixed 300px white product column. Its header places the uppercase Products title and neutral count together, with one square plus action on the right. Search and tag filtering use compact bordered white controls. Product cards use 36px thumbnails, a status dot, truncated product name, and optional neutral tag badge; the selected product is a solid black card with white copy. Add product, Add tag, and product-edit mode remain available from the plus action menu so the default header keeps the reference hierarchy. Existing local catalog validation, filtering, selection, editing, deletion, and reorder behavior remains unchanged.

## Reporting-period and workspace hierarchy

The second panel follows the supplied HTML reference as a 340px white reporting column. Its title and calendar action share one compact header row, the selected-month label sits between integrated previous/next controls, and period cards use abbreviated visible ranges with full Wednesday–Tuesday ranges retained as accessible names. The selected card uses a two-pixel black border; the current week carries a black Current badge, Week number, and In Review cue. Each card projects Spend, PPC Sales as Sales, PPC Orders as Orders, and ACoS in four bordered neutral cells. Non-current cards use the selected product tag when available. The existing multi-month picker, current/future cutoff, report selection, metric hydration, and local persistence remain unchanged.

## Third-panel workspace hierarchy

The third panel follows the supplied HTML reference: product header; Strategic Weekly Goals and Budget Utilization; Weekly PPC Performance; side-by-side Previous/Current Week Summary; Campaign Week-over-Week Comparison; and Action Items. Desktop metrics are two rows of five equal cards. Row one is Total Spend, PPC Sales, Organic Sales, Total Sales, and Conversion Rate. Row two is PPC Orders, Org. Orders, Total Orders, ACOS, and TACOS. Goals, budget history, current-week notes formatting, and action completion remain functional. Save retains local auto-save.

The six-week performance table orders rows by business hierarchy and labels each group with a full-width header: TOTAL for Total Sales, Total Orders, and Total Units; SALES for Spend, PPC Sales, and Organic Sales; ORDERS for PPC Orders, PPC Units, Organic Orders, and Organic Units; EFFICIENCY for ACOS and TACOS; and TRAFFIC for Impressions, Clicks, and CPC.

## Goal history and previous-week metric comparisons

Each active weekly goal has explicit Achieved and Missed actions beside Delete. Resolving a goal removes it from the active list and records its title, target, actual, outcome, completion time, and reporting week in the selected product's Goal History. The history button sits beside Add Goal and shows resolved goals across that product's saved weeks. Active status choices remain On Track or At Risk. Older terminal goals are migrated into history when restored.

Add Goal creates a structured selector with Increase Spend, Decrease Spend, PPC Sales, Total Sales, PPC Order, Organic Order, Total Orders, ACOS, and TACOS. Organic Order additionally supports Number or Percentage, where Percentage is organic orders divided by total orders. Actual is read-only and follows the matching selected-report metric; both Spend directions use actual spend. Currency and non-ACOS percentage Targets display two decimal places outside edit mode; ACOS and count Targets display as whole values. An available snapshot is labeled Partial until it covers the full Wednesday–Tuesday period and Final once complete; before data is available the field shows Waiting. Resolving a goal snapshots its current actual value and data state into Goal History.

Weekly Performance uses small grouped cards: four Sales Metrics cards across the first row, then three Order Volume cards and two Efficiency & Targets cards beneath them. Each card keeps its single-line centered title, current rounded value, helper copy, and centered `Prev. Week` footer in a stable vertical stack. A compact percentage-change badge appears only when current-period metrics are available. Favorable movement is green and unfavorable movement is red: lower is favorable for Spend, ACOS, and TACOS, while higher is favorable for sales and orders. Whole-number metric presentation uses thousands separators and unavailable current metrics render as an orderly zero instead of a detached symbol. The ACOS warning card also shows how far it is above Target ACOS; TACOS identifies itself as the total advertising ratio. Budget Weekly limit, Actual spend, and Burn Rate Progress spend/limit values render as centered whole dollars. The duplicate previous-week sales/TACOS summary remains removed from Previous Week Result.

When a user opens the following week, the read-only Previous Week Summary prefers result text already stored on the newer report, then the preceding report's result or notes. Existing text remains intact and is never overwritten.

## Target ACOS and ASIN analysis navigation

Each product/week report includes an editable Target ACOS beside Weekly Performance. When Target ACOS is greater than zero and actual ACOS exceeds it, the ACOS metric card changes to a red warning treatment; meeting the target or leaving it unset uses the normal card treatment.

The selected-product header provides links to Campaigns, Keyword Targeting, Product Targeting, Search Terms, Match Types, Placements, Ad Types, Main Keywords, and three Scale Insights trends. The links are arranged in three columns: Campaigns/Keyword Targeting/Product Targeting/Search Terms, Ad Types/Match Types/Placements/Main Keywords, and a visually separated trend column containing Daily, Weekly, and Monthly Performance. Each opens the matching Scale Insights page in a new tab with the validated ten-character ASIN and active Wednesday–Tuesday week. Trend links open Scale Insights' Advertising Trend with seven columns of 1, 7, or 30 days respectively, ending on the selected Tuesday. The compact product identity row keeps ASIN and SKU but omits the duplicate active-week date, and the Target ACOS value is centered in its field.

Reporting-period cards summarize Spend, PPC Sales, PPC Order, and ACOS for the selected ASIN. Budget History displays the five newest changes per page and exposes numbered pagination for older locally stored entries.

## Budget history, report controls, and multi-month timeline

Each product/week report shows a compact budget-history table with `Date of Change`, `From`, and `To` columns. One entry is recorded when a Weekly limit edit is committed by blur or Enter; intermediate keystrokes do not create rows. Reporting-period cards expose their existing report status in the reference status chip; the separate Save Draft button remains absent. The Current Week Summary omits its report-status badge, and the primary control is Save.

The reporting-period picker supports multiple selected months across years, plus a one-click full-year selection. The timeline displays the unique Wednesday–Tuesday weeks that intersect a selected month, includes weeks crossing a month boundary, omits future weeks, and labels the header with the months actually covered.

## Saved weekly performance and smaller tags

Fetched performance is saved in this browser per US ASIN and reporting week. Selecting or revisiting a product automatically retrieves every visible reporting week that does not already have a valid snapshot, prioritizing the active week. Returning to a saved week or reloading displays its saved metrics and coverage without another request. Only Refresh updates the active saved snapshot; pending/failed refreshes preserve the last values. Week numbers sit at the upper-right of their cards, and the large grouped weekly metric cards plus timeline ACOS values show rounded whole numbers while retaining exact source values in storage. Portfolio tag badges use compact 7px text and reduced padding.

## Compact product cards

Portfolio cards display the image, product name, and tag without ASIN/SKU rows. View-mode cards use a compact 66px minimum height; edit mode retains room for Edit, Delete, and Reorder controls. ASIN/SKU remain in the selected-product header, edit form, search index, and existing storage; this is presentation-only with no data migration. Verify both identifier links remain in the detail header after selecting a product.

## Product portfolio ordering

In product edit mode, each card has a drag handle below Delete. Users can reorder by dragging or with Up/Down keys. The order is saved in this browser; filtered reordering changes only visible slots.

## Automatic listing images

Adding a product with a valid ASIN automatically looks up its US Amazon listing thumbnail through Scale Insights. The form previews the image before saving, allows manual replacement, and leaves manual upload available when no image is returned.

## Product direction

Glassco Back Office Library is the knowledge and operating-procedure foundation for the Amazon PPC management suite. It provides a searchable shared document catalog, guided reading experience, role-aware administration, and structured document builder.

## Current implementation mode

The current milestone uses the existing Pipeline identity and one authoritative Postgres catalog shared across accounts and devices. ADMIN has full administration, USER can create/edit documents, and VIEWER is read-only.

## Implemented requirements

### Catalog and reading

- **LIB-001** — A published, visible document catalog is available at `/library`.
- **LIB-002** — Search covers title, description, tags, and document type case-insensitively.
- **LIB-003** — A configurable category filter combines with search and is represented in the URL.
- **LIB-004** — Repository bootstrap fixtures use validated IDs, slugs, categories, and types without being merged into an initialized shared catalog.
- **LIB-005** — Reader pages render safe Markdown without arbitrary raw HTML.
- **LIB-006** — Topic navigation uses stable IDs and numbered main headings.
- **LIB-007** — Topic tooltips appear only when sidebar text is truncated.
- **LIB-008** — Responsive layouts avoid page-level horizontal overflow.
- **LIB-009** — Loading, empty, no-result, error, and not-found states are present.

### Reading state

- **LIB-LOCAL-001** — Bookmarks persist in versioned browser storage.
- **LIB-LOCAL-002** — Recent documents are deduplicated and newest-first.
- **LIB-LOCAL-003** — Last meaningful topic state is stored locally.
- **LIB-LOCAL-004** — Complete/incomplete state is independent from view history.
- **LIB-LOCAL-005** — Missing, blocked, malformed, or old storage falls back safely.
- **LIB-LOCAL-006** — Server and browser markup hydrate without reading-state mismatch.

### Shared administration

- **LIB-ADMIN-001** — View mode displays Eye, admin mode displays Pencil, and the Plus control for creating a document remains visible in both modes.
- **LIB-ADMIN-002** — ADMIN and USER can create documents and edit active document content/metadata.
- **LIB-ADMIN-003** — Documents can be renamed, hidden, reordered, deleted, and recovered.
- **LIB-ADMIN-004** — Categories can be created, renamed, hidden, reordered, deleted, and recovered.
- **LIB-ADMIN-005** — ADMIN category renames atomically update assigned active documents.
- **LIB-ADMIN-006** — Normal reader access excludes hidden and deleted documents.
- **LIB-ADMIN-007** — Pipeline Postgres stores one globally revisioned catalog with per-document and per-category versions, audit attribution, and recoverable tombstones.
- **LIB-ADMIN-008** — The new-document form exposes only title, description, and category; document type, tags, and legacy Markdown use preserved defaults and are not edited there.
- **LIB-ADMIN-009** — Existing documents are not renamed from catalog cards; their title, description, and assigned category are edited directly in the document header while builder edit mode is active.
- **LIB-ADMIN-010** — Category controls beside the document Category field support quick creation and open the full rename, reorder, delete, and recovery manager.
- **LIB-ADMIN-011** — Deleted categories stay hidden from the category manager until the recovery icon opens a dedicated recovery dialog.
- **LIB-ADMIN-012** — Deleted documents stay out of the catalog layout until the admin toolbar recovery icon opens a dedicated recovery dialog.
- **LIB-ADMIN-013** — The catalog renders a loading skeleton until shared administration state or its cached fallback is ready, so deleted seed documents never flash in the active list during refresh.
- **LIB-ADMIN-014** — Visible tabs synchronize every five seconds and revalidate immediately on focus.
- **LIB-ADMIN-015** — A validated confirmed cache may be shown during an outage only in read-only mode; stale browser administration data is never merged or uploaded.
- **LIB-ADMIN-016** — Same-record stale edits receive a conflict and current server state rather than silently overwriting another account.
- **LIB-ADMIN-017** — ADMIN exclusively controls document/category delete, restore, reorder, category management, and shared backups; VIEWER cannot mutate catalog content.
- **LIB-ADMIN-018** — ADMIN recovery shows who or what deleted every document, with an unknown-source fallback when historical evidence is incomplete.
- **LIB-ADMIN-019** — ADMIN may explicitly confirm one atomic recovery of all documents attributed to the Initial Library cleanup; manually deleted documents are excluded.
- **LIB-ADMIN-020** — Legacy initialization imports the complete catalog without newly tombstoning documents, and backup restore cannot delete backup-absent or newer active records.
- **LIB-ADMIN-021** — ADMIN may permanently delete an already-deleted document only after a separate confirmation; the content is removed, the actor audit is retained, and backup restore cannot recreate it.
- **LIB-ADMIN-022** — Recovery remains available while connected even when no ordinary tombstones exist, so ADMIN can inspect permanent-deletion history and perform the explicitly approved bQool repair.
- **LIB-ADMIN-023** — Reorder is available only when at least two active documents exist, and the UI explains how to enable it when the catalog contains fewer.
- **LIB-ADMIN-024** — ADMIN may delete the final active document after confirmation; the resulting empty Library offers Add document and Recovery actions, and the tombstone remains recoverable.
- **LIB-ADMIN-025** — “Monitor Product Listing Prices Through BQool” and “Check Spend with No Sales” may be explicitly restored with their original IDs, slugs, and content from the newest trusted snapshots; no other purged document is restored automatically.
- **LIB-ADMIN-026** — Reorder shows immediate save progress, prevents duplicate submissions, closes after confirmed success, and preserves the selected order with a retryable error after failure.
- **LIB-ADMIN-027** — Recovery opens immediately and loads recoverable documents and permanent-deletion history independently with visible progress and retry actions.
- **LIB-READ-007** — The bookmark badge counts only unique bookmarked documents that are currently active, visible, and published while retaining stale bookmark IDs for future recovery.

### Structured builder

- **LIB-BUILDER-001** — Documents support separate view and edit modes. The reader control shows an Eye in view mode and a Pencil in edit mode; entering edit mode never saves, and an explicit `Save changes` action is the only main builder control that persists the draft and returns to view mode.
- **LIB-BUILDER-002** — The element menu remains inside the viewport and scrolls when necessary.
- **LIB-BUILDER-003** — Topics, statements, callouts, lists, checklists, insights, tables, dropdowns, feature cards, text blocks, roadmaps, galleries, buttons, and flows can be added. A single Key Insight element supports persistent Green, Blue, and Red presentation choices through segmented color tabs.
- **LIB-BUILDER-004** — Tables support rows, columns, row height, and saved column width.
- **LIB-BUILDER-005** — Dropdown blocks support multiple entries and preserved line breaks.
- **LIB-BUILDER-006** — Video links render in a large responsive player inside the blue document header’s right column. YouTube and shared Google Drive files use embedded players, Google Drive’s play control and playback content remain centered in the visible 16:9 frame with a compact new-tab icon, direct video files use native controls, and generic HTTPS links retain a secure clickable fallback.
- **LIB-BUILDER-007** — Video Add/Pencil controls are visible only in document edit mode.
- **LIB-BUILDER-008** — Builder edit mode replaces the blue header metadata with editable title, description, and category controls and saves those values with the structured elements.
- **LIB-BUILDER-009** — Roadmaps independently support overall Left/Center/Right placement and Left/Center/Right step-number positions; centered numbers stack step copy and a full-width image.
- **LIB-BUILDER-010** — Each Roadmap step supports a shared Blob-backed image upload up to 2 MB and an inline Plain, Bullets, Checklist, or Numbered composer while retaining legacy saved image URLs.
- **LIB-BUILDER-011** — Feature Cards and Gallery slots use shared authenticated image uploads; selecting a Gallery layout immediately creates its minimum visible slots without deleting extras. Gallery tiles are square, contain the complete uncropped image at its natural ratio, and open the existing full-image preview from the already-rendered tile source without a second media fetch.
- **LIB-BUILDER-011A** — Uploaded private images render as actual previews in editors, saved documents, Roadmaps, Galleries, Feature Cards, and image modals through authenticated media retrieval.
- **LIB-BUILDER-012** — Standalone Buttons support validated internal or HTTP(S) links, Full/Large/Medium/Small widths, Left/Center/Right alignment, and secure new-tab navigation.

## Current acceptance criteria

Authenticated users can open the Library, search/filter/read shared content, and retain personal reading state. ADMIN and USER changes synchronize across accounts within five seconds or on focus; ADMIN-only lifecycle actions remain protected. Deleted records do not reappear unless restored, conflicts do not silently overwrite work, and an outage cache remains read-only.

## Deferred requirements

- Secure same-origin cookie sessions and account recovery.
- Organizations, workspaces, and invitations beyond the current shared team catalog.
- Row-level multi-workspace isolation beyond current role authorization.
- Direct Amazon Ads API integration beyond the Scale Insights reporting connector.
- PPC analyzers, audits, reporting automation, collaboration, and analytics.
- Public sharing and billing.

These require a separately approved milestone and must preserve the current shared-state and stable-ID contracts.
# Unified Glassco application behavior

- Team SOP Library is presented at `/ppc/library/*`; PPC Dashboard is the authenticated `/ppc/dashboard` weekly performance documentation workspace.
- Three responsive application cards remain visible in the reserved top bar, with the active application shown in white text on blue.
- Clicking any application card, including the active card, opens its remembered route in a new browser tab and leaves the current page unchanged.
- Team SOP Library and PPC Dashboard remember routes independently and otherwise open `/ppc/library` and `/ppc/dashboard` respectively.
- A session-only Pipeline login is handed off once to the destination tab; missing or expired authentication returns to the requested safe PPC route after login.
- A verified Pipeline session is required before the PPC interface renders.
- Dashboard users select a real Pipeline product, choose a Wednesday–Tuesday reporting period, and document weekly goals, weekly/daily budget limits, current performance, prior-week results, summary notes, and next-week actions.
- Current-week performance includes actual values only through yesterday (UTC), with an explicit partial-week warning. Today and future days are excluded, and a week with no completed days shows an availability message. Completed weeks retain the exact Wednesday–Tuesday scope.
- When the selected product has an ASIN, the dashboard automatically requests exact-period Spend, PPC Sales, PPC Orders, Total Sales, and Total Orders for each visible uncached week through the authenticated server-side Scale Insights connector. The application calculates Organic Sales, Organic Orders, ACOS, and TACOS, displays freshness or mismatch warnings for the active week, and allows an explicit active-week retry. Vercel Connect scopes the OAuth grant to the stable, server-verified Pipeline user; a user without a grant receives a hosted one-time consent action. OAuth credentials and access tokens must never be sent to frontend code or browser storage.
- Pipeline products remain authoritative source records. The dashboard may layer shared names, ASINs, SKUs, images, and tags over them without changing Pipeline, and users may add/edit/delete dashboard-only products. The Products panel supports tag creation and filtering, renders tags instead of active-status badges, and opens saved ASIN/SKU destinations in protected new tabs. Report drafts, catalog customizations, performance caches, and campaign snapshots use validated shared dashboard stores with ETag-guarded writes. Conflicting colleague saves are reconciled automatically with record/field-aware three-way merging and retried; visible tabs poll for confirmed team updates and refresh on focus. Unconfirmed weekly-report edits are retained in a browser recovery outbox, restored after refresh, merged with the latest shared report, and retried until the server confirms them. Browser-local values are migration sources and downloadable backups.
- ADMIN can create/edit/reorder/hide/delete/recover documents, manage categories, and manage backups. USER can create and edit active documents. VIEWER is read-only apart from personal reading controls.

# Rich-text composer behavior

- Supported element body fields provide selection-aware Normal, Bold, Italic, Underlined, Bullets, Checklist, and Numbers controls with a live WYSIWYG editing surface.
- The formatting toolbar is icon-only and separated into Text styles, Left/Center/Right alignment, Lists, and Link groups. A matching viewport-aware selection toolbar appears beside highlighted text.
- Highlighted text can receive a validated HTTP(S), email, or Library-relative link through a compact URL editor; saved links open in a protected new tab and can be edited or removed from the same control.
- A neighboring Document link control lazily loads the authoritative catalog, searches reader-visible documents by title/category/description, and applies the selected `/ppc/library/:slug` destination without exposing hidden, draft, deleted, archived, incomplete, or self-link targets.
- Titles, labels, metadata, button text, tables, code blocks, and diagnostic-flow nodes remain plain-text controls.
- Standalone list-element rows retain their element-level markers and omit nested-list controls while keeping text styles, alignment, and links.
- Pasted content is constrained by the editor schema to supported paragraphs, marks, safe links, lists, and checklists; images, colors, fonts, headings, unsafe URLs, and arbitrary HTML are not persisted.
- Checklist boxes are editable in admin mode and disabled in reader mode.
- **LIB-BUILDER-012** — A formatting save is accepted only when Pipeline returns the same active document ID and slug, a newer record version, and parseable matching content. Verification failure keeps edit mode and unsaved formatting open.
- **LIB-BUILDER-013** — Content formatting cannot alter visibility, publication status, deletion, archive state, identity, or slug. Only explicit lifecycle actions may remove a document from the active catalog.

# Library live-state behavior

- During an outage, the last confirmed document list or document remains readable with its snapshot time and revision, while every shared mutation stays disabled.
- Returning from a document, restoring a browser-cached page, changing visibility, or focusing the app revalidates immediately.
- A stale deleted-document link explains when and how it was deleted and offers ADMIN recovery while its tombstone exists.
- A permanently purged link explains that recovery is unavailable.
- Reorder states whether it is blocked by connectivity or fewer than two active documents. Recovery remains enabled while connected and opens a fresh view of tombstones plus permanent-deletion history.

## Weekly metric comparison

- Every Weekly Performance metric emphasizes the current value and places the previous value in a separate footer row; the upper-right percentage-change badge is omitted until current-period data is available.
- The previous value remains neutral. The current value and direction arrow are green when it increased, red when it decreased, and neutral when unchanged or when no previous week is available.
- Compact metric typography must keep currency and percentage symbols inside their corresponding Current or Previous column.
- Scale Insights trend destinations are labeled Daily Performance, Weekly Performance, and Monthly Performance without a redundant “Trend” suffix.
## Untargeted sales opportunities

Directly below Campaign Week-over-Week Comparison, a card helps the PPC operator find converting PPC search terms without an exact-match keyword and converting product ASINs absent from product targeting for the selected advertised ASIN. The server includes only rows with at least one attributed order and a harvest-mode campaign mapping. Product ASIN candidates are checked against the complete ASIN/date-scoped Product Target Performance result; any existing product target is removed, and unverified ASIN candidates are omitted. When several campaign mappings exist, the server selects the one with the greatest attributed Sales, then Orders and Spend. The operator can filter the saved list by opportunity type, minimum PPC Sales, and maximum ACOS. Blank editable criteria mean no additional metric restriction. Impressions, Clicks, Spend, Sales, Orders, and ACOS headers sort highest-to-lowest or lowest-to-highest without another provider request. The summary displays filtered Spend, Sales, Orders, and weighted ACOS totals. Each row has a copy control whose copied checkmark returns to the copy icon after two seconds and a source icon for the ASIN-and-week-scoped Scale Insights Search terms report. Opening the source copies the selected value for Instant Search. Checkboxes support selecting multiple visible keyword rows, and Create Bulk Campaigns opens Scale Insights' Split Keywords to Campaigns Customize setup with the advertised ASIN and selected terms entered as separate lines. The prior per-row green creation icon is removed. Product ASIN rows do not show keyword-campaign selection actions. Preview and execution remain explicit Scale Insights actions. Results default to PPC Sales descending, show ten rows initially, and can expand with Show all.

Every displayed result shows Search Term, Impressions, Clicks, Spend, Sales, Orders, ACOS, and a **Not targeted** badge. Product ASIN values open their Amazon detail page. The selected week is `Final` when complete and `Partial` when capped at yesterday. Empty, authorization, unavailable-capability, malformed-response, loading, and partial-data states remain explicit. The single workspace **Refresh Data** action retrieves this report with the active weekly performance refresh. The latest validated result is restored from browser storage, and local filter changes make no MCP calls.

## Account performance overview

The Dashboard tab keeps the five-card temporal ledger visible at all times. Today remains explicitly unavailable because incomplete-day data is excluded; Yesterday, 7 Days, 14 Days, and the operator-selected range use completed Scale Insights data when available and show local weekly-report totals as a temporary fallback. Every card lists TACOS directly below ACOS. Directly below the cards, Daily Performance Quick Stats shows the completed daily series for the applied range. Spend renders as a red line and PPC Sales as a green line, each scaled to its own daily peak across nearly the full panel width. Their compact aggregate cards form the two-item chart legend and select which line is emphasized; Total Sales, ACOS, and TACOS remain read-only aggregate stats. Every data marker remains a tiny circular HTML overlay instead of stretching with the SVG. Hovering any daily point or date region opens a compact box with that day's actual values for all five metrics and highlights the selected chart metric.

The audit controls accept an inclusive custom date range of up to 90 days and apply it to Scale Insights totals, ASIN-level ranking, Keyword Targeting, Campaign, Product/ASIN Targeting, and Search Terms tables. Refresh All re-runs that complete applied scope without changing the dates or ASIN filter. The ASIN ranking joins provider ASINs to local product names/SKUs, sorts by Total Sales, calculates ACOS from Spend/PPC Sales and TACOS from Spend/Total Sales, and derives Spend/Sales shares across the returned scope. Its momentum compares Total Sales with the immediately preceding equal-length completed range. Those five tables remain collapsed by default. The obsolete Overview Source Coverage section is removed. ASIN filtering scopes both live requests and local product rows. Spend Share cells use a centered light-red treatment, while Sales Share cells use centered light green.

The five compact disclosure labels are ASIN Velocity & Performance Ranking, Keyword Targeting, Campaign Movers and Anchors, ASIN Targeting, and Search Terms.

ASIN Targeting uses the dedicated `get_target_performance` report for the filtered advertised ASINs and applied completed dates. It follows every provider page, shows product/category targets, and excludes automatic and audience rows. Every metric header sorts descending or ascending locally. Repeated target ASINs remain separate provider rows; unavailable campaign context is left unavailable. A single advertised ASIN may be taken from the verified request scope, never from the target ASIN itself. Keywords use their separate keyword-performance endpoint.

Campaign Movers and Anchors uses Scale Insights' dedicated campaign-performance report for the applied completed date range and follows every provider page. The campaign view covers the connected account because this endpoint supplies no campaign-to-ASIN mapping. It displays campaign name/ad type, status, Spend, Sales, Orders, ACOS, ROAS, CPC, CTR, CVR, and Daily Budget. Each numeric metric header toggles descending and ascending sorting locally, with missing values last. Unsupported campaign ASIN, raw Clicks, and Impressions are not fabricated.

Weekly monetary goal targets display whole dollars, matching Actual, while decimal values remain editable.

Current Week Summary uses editable topic cards. Blank reports start with Good and Bad sections, using light-green and light-red backgrounds respectively; legacy notes open intact in General Summary. An icon-only + in the formatting toolbar adds topics; titles can be renamed inline, topics removed, and arrow controls change their order. Formatting applies to the active topic and changes use existing autosave.

Untargeted opportunity totals appear above their metric column headings. Create Bulk Campaigns shares the match-count toolbar; the local-filter implementation notice is removed.

Untargeted opportunity metric headers, totals, and row values are centered. Reduced table padding and minimum width make the report more compact while the search-term column remains left aligned.

## Six-week Scale Insights performance view

The selected product's Weekly PPC Performance panel uses a Scale Insights-style six-week table. It always shows the selected Wednesday–Tuesday week as the sixth column on the right and the five immediately preceding weeks to its left. Imported values remain read-only and unavailable provider fields are shown as an em dash. The table contains only the Metric label and six weekly value columns.

## Weekly traffic metric completion

Weekly performance retrieval also reads complete ASIN-scoped Search Term Performance traffic and detailed Sales Trend data for the same dates. PPC Units can come from an advertising aggregate, complete search-term rows, or an explicit Sales Trend PPC/Organic/Total Units field. When Sales Trend supplies any two unit totals, the third is reconciled arithmetically. CPC remains derived from Spend divided by exact clicks. Existing cached snapshots without the current metric revision are refreshed automatically across the visible six-week window. Unit metrics remain unavailable when Scale Insights omits enough exact unit fields; orders are never substituted for units.

The weekly workspace opens with a full-width Budget Pacing strip above a two-column Strategic Goals and Action Items row. The budget strip keeps editable weekly limit and spend values, progress, remaining or overspent balance, pacing status, and collapsible history. Goal History and Add Goal share the card header, while the Action Items header shows its live task count and a labeled Add Item control. Active goals retain achieved, missed, and delete actions without a separate On Track/At Risk selector. Action rows show completion, title, and delete controls without priority or assignee placeholders. A new week's budget inherits the immediately preceding weekly limit and remains independently editable. The redundant standalone Burn Rate Progress block remains removed.

The compact Budget Pacing strip displays actual spend against the weekly cap, utilization percentage, elapsed days, remaining or overspent balance, burn-rate variance against elapsed time, daily spend average, and an Optimal, Watch, or Over Budget status. Budget History remains a collapsed disclosure under the bar.

When a new Wednesday reporting week is created, every unfinished Action Item from the immediately preceding report carries forward with a new stable ID. Completed items remain in the prior week. An Action Item edit is recoverable across refresh as soon as it enters the shared save queue, including while the network or shared-state service is temporarily unavailable.

Weekly report edits now enter that recovery queue during the edit event itself, so refreshing immediately after adding or typing an Action Item does not bypass it. The shared status shows when the edit is saving and when the cloud confirms it. Action rows use smaller, lighter text and tighter spacing.

The dashboard remembers the selected product, reporting week, and visible months in this browser, then restores that view after refresh. If the product no longer exists, it selects an available product. Action Items remain attached to their original product and week. The browser keeps each tab's unconfirmed report edit in a recovery outbox until the server confirms it. A repeated conflict or failed recovery write displays a clear unsaved state; view-only users cannot change Action Items.

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

Audit Performance Summary follows the supplied grouped dashboard: business revenue/orders, advertising investment, efficiency, traffic, no-order spend banner, and ASIN table. Searchable ASIN multi-selection, product search, table search, column visibility, sorting, pagination and CSV export are available. Header retains exactly PPC Report and Business Report.
The dashboard layout remains visible before upload; unavailable values display dashes and a short note directs users to the two report buttons.


### Wasted Ad Spend and Opportunities — 2026-10-16

Wasted Ad Spend follows the supplied reference: rule drawer, issue/review counters, source filters, total flagged-spend overview, ASIN/source/match breakdowns, priority findings, expandable ASIN summary, detailed evidence, column visibility, sorting, pagination, and CSV export. Opportunities is the third Audit module, immediately below Wasted Ad Spend (14 modules total), showing converting queries without a matching exact target in the upload. Current targeting must be verified separately. Exactly two report upload controls remain.


### Opportunities dashboard — 2026-10-16

Opportunities follows the supplied reference with diagnostic rule controls, scope totals, top ranked findings, ASIN/source/type breakdowns, match cards, placement performance, expandable ASIN summaries, forensic detail table, filters, sorting, column visibility, pagination and CSV export. Workflow marks New/Reviewed/Action Planned/Action Taken are device notes, not campaign actions. Budget utilization stays explicitly unavailable until reports supply daily budgets and active-day coverage. No hardcoded sample performance or automatic bid changes.


### Advertised ASIN dashboard — 2026-10-16

Advertised ASIN follows the supplied reference: portfolio totals, search and ASIN/campaign/type/match/placement/status filters, sortable 23-column product table, column visibility, pagination, CSV export, and inline details with sales/order mix, campaign performance, target/query evidence, match performance, placements and calculated takeaways. Refresh recalculates current imported data and reloads saved waste rules; it does not fetch provider reports. ACOS and TACOS review thresholds are 20% and 12%. Best-performing sort ranks lowest known ACOS. Report uploads remain exactly PPC Report and Business Report.


### Campaign workbench — 2026-10-16

Campaigns follows the supplied UI with filters, portfolio metrics, type/strategy comparisons, sortable campaign table, column controls, pagination, CSV export and inline campaign findings, ad groups, placements, match types and target/query signals. Explicit daily budget values are shown when supplied. Budget utilization and capped/budget-limited claims remain unavailable without daily budget history and active-day coverage. Calendar-day average spend is labeled as such. Growth signals are efficiency reviews, not promises of profitable scaling or automated actions. Exactly two upload options remain.


### Campaign Type comparison — 2026-10-16

Campaign Type provides the supplied comparison layout: portfolio metrics, three type cards, spend/sales contribution bars and order shares, an efficiency matrix, calculated findings, and expandable campaigns by selected type. ASIN/type/campaign/match/placement/state/search filters apply to the reporting scope. Type card selection changes the lower drilldown, not the comparison denominator. Metrics display whole numbers; CSV retains raw precision. Missing report performance stays unavailable. Findings are review prompts, not profit, funnel, or automated bid claims.


### Placement dashboard — 2026-10-16

Placement follows the supplied layout: filters, portfolio summary, placement cards, contribution bars, efficiency comparison, expandable ASIN breakdowns, contributing campaigns, reported match-placement matrix, findings and a sorted/paginated ledger. Column settings and raw-precision CSV export work. Metrics display whole numbers. Review actions open evidence, with no automatic bid, exclusion or campaign changes. ASIN and match intersections are unavailable unless explicitly supplied. Flagged spend is calculated once at the selected placement grain using saved waste rules and can differ from target-level waste.


### Keyword Target dashboard — 2026-10-20

Keyword Target follows the supplied layout: filters, portfolio metrics, Exact/Phrase/Broad diagnostics, overlapping audit signals, sorted/paginated keyword rows, column settings, CSV export and expandable keyword context, search terms, placements and review findings. Keyword, campaign, ad-group and ASIN identities remain separate. High CPC compares with 150% of scoped weighted average before status filtering; waste/low-CVR rules reuse validated same-audit saved settings. Review notes do not claim product margin, bid headroom or automatic bid changes. Exact-coverage reviews use the full uploaded target set and require confirmation against current targeting. Whole-number UI metrics preserve raw CSV precision.
