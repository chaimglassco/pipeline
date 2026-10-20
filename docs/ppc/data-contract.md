# Data Contract

## September 11 PPC conversion and automatic-status revision

Weekly performance, `glassco.ppcPerformanceCache.v1`, and `glassco.ppcPerformanceNotes.v1` accept optional nonnegative integer `ppcClicks`. `conversionRate` is calculated as `ppcOrders / ppcClicks * 100` and retains two-decimal numeric precision; zero PPC Clicks produces zero. The UI renders the rate as a rounded whole percentage. The provider adapter reads exact clicks from one requested ASIN row, advertising totals, or the sales summary. If absent there, `glassco.ppcUntargetedOpportunitiesCache.v1` may include an optional nonnegative integer `ppcClicks` summed from a complete ASIN-and-week Search Term Performance result; the client uses it as the conversion denominator for the same scope. Missing or incomplete PPC Clicks leaves `conversionRate` unavailable. The UI has no manual click input. `totalSessions` remains optional for backward compatibility and no longer drives this metric. Existing version and storage keys remain unchanged.

Copy feedback, whole-number Target ACOS formatting, goal-header placement, and active-count removal are derived UI behavior and add no persisted fields.

Dashboard/Products view selection, Dashboard disclosure state, and the ASIN/SKU/product-name filter are transient. The Dashboard overview reads existing validated `WeeklyPpcReport` records and adds no storage key or field. Unsupported daily and detailed-ledger values are represented as unavailable UI state rather than persisted placeholder data.

The no-store performance-overview response includes `dailyPerformance` plus `asinRanking: { status, message, rows }`. Each daily point contains an ISO `date`, nonnegative `spend`, `ppcSales`, and `totalSales`, plus nullable nonnegative `acos` and `tacos`. Each ranking row contains a ten-character `asin`, nonnegative current-period `spend`, `ppcSales`, `ppcOrders`, `clicks`, `totalSales`, and `totalOrders`, plus nullable `previousTotalSales` from the immediately preceding equal-length range. This DTO is transient and does not change `glassco.ppcPerformanceNotes.v1` or any other browser-storage schema.

New reports use `actions: []`, and normalization preserves an explicitly empty list. The untouched historical seeded task is removed by its exact ID, title, priority, empty due date, and incomplete state; any edited or user-created action remains intact. The report `status` field remains readable for version-1 compatibility, but visible period status is derived from cached `startDate`/`endDate` coverage and is no longer changed by a manual Save action.

## September 11 custom-goal compatibility

`WeeklyGoal` accepts optional `custom: true`. Custom goals continue to use the existing `title`, `target`, `actual`, `status`, and history fields. The marker prevents title-based legacy metric inference and is omitted for predefined goals. Version remains `1`; reports without the marker parse exactly as before, and no storage key or migration changes.

## September 11 conversion and summary revision

Weekly performance responses retain optional `metrics.totalSessions` for compatibility. The superseding contract above defines the displayed conversion metric from PPC Orders and PPC Clicks; session data is never substituted.

The Previous Week Summary and Current Week Summary status badges plus the prior Status/ROAS footer are no longer rendered. Previous documentation remains stored in `previousWeekResult`/`notes` and is displayed through a read-only resizable textarea; no new summary field is introduced. Goal layout changes do not alter goal values or outcomes.

## September 11 workspace control revision

`glassco.ppcPerformanceNotes.v1` continues to accept `previousWeekResult` and `actions[].dueDate` for backward compatibility, but the revised dashboard renders the previous-week result as read-only and omits action date inputs. Target/Actual placement, outcome actions, automatic-save header controls, and the daily-limit placement do not change those fields. Daily limit remains derived from and stored with the weekly budget through the existing normalization path.

## September 11 product ordering

No stored catalog fields changed. `glassco.ppcDashboardCatalog.v1.productOrderIds` remains the manual order source; the All Tags panel applies a stable display-only tag priority over that order. Tag filtering and its automatic first-product selection remain transient React state and are not persisted.

## Campaign week-over-week comparison

Key: `glassco.ppcCampaignCsvComparison.v1`

The record is `{ version: 1, entries: Record<string, CampaignCsvImport> }`, keyed as `<COUNTRY>:<ASIN>:<CURRENT-WEDNESDAY>`. Each import contains a validated `CampaignWeeklyComparison`, `previousFileName`, `currentFileName`, and ISO `importedAt`. The comparison stores currency, Final state, adjacent previous/current periods, warning strings, and campaign rows containing CampaignId, mapped sponsored type, campaign name, activity flags, previous/current `{ spend, sales, orders }`, and derived deltas. When an entry's current period exactly matches the next entry's previous period for the same country and ASIN, its current metrics may be reused as the next comparison's previous metrics; the new entry copies that source `currentFileName` into `previousFileName`. Raw CSV text is not persisted. At most 50 entries are retained.

CSV parsing requires normalized headers Type, Campaign, Orders, Sales, Spent, and CampaignId. Values must be finite and nonnegative; Orders must be integers; Type must map to SP, SB, or SD. Duplicate campaign IDs aggregate only when name and sponsored type match. Both weeks join by CampaignId, missing rows receive zero metrics, and cross-week identity conflicts reject the import. The CSV does not contain report dates or advertised ASIN, so those are assigned from the selected dashboard ASIN and labeled weekly slots after the user chooses each file. Recognizable conflicting filename ranges are rejected. Stored records are untrusted and must pass the existing comparison parser and exact reconstructed-key check before use. No CSV bytes, credentials, or raw provider responses are stored.

`GET /ppc/api/dashboard/campaign-comparison` and its staged MCP response contracts remain in the repository for compatibility but are no longer called by the dashboard campaign component.

## Account campaign comparison

Key: `glassco.ppcCampaignAccountSnapshots.v1`

The record is `{ version: 1, entries: Record<string, AccountCampaignSnapshot> }`, keyed as `<COUNTRY>:<GRANULARITY>:<START-DATE>:<END-DATE>`. Each snapshot contains country, currency, granularity (`day`, `week`, or `month`), the assigned period, filename, ISO import time, and validated campaign rows with CampaignId, mapped sponsored type, campaign name, and `{ spend, sales, orders }`. Raw CSV text is never persisted; at most 100 snapshots are retained.

Account exports require normalized Type, Campaign, Orders, Sales, Spent, and CampaignId headers. Values are finite and nonnegative, Orders are integers, Type maps to SP/SB/SD, duplicate IDs aggregate only when identity agrees, and cross-period name/type conflicts reject the comparison. A missing campaign receives zero metrics for that period. Stored entries are untrusted and must pass the snapshot parser and exact reconstructed-key check before use. The Compare UI derives ACOS and the Good/Bad/Neutral outcome categories from the two snapshots; only the selected outcome filter is rendered, and the selected filter/sort are transient.

## September 10 workspace presentation

The workspace redesign consumes the existing version-1 report and performance cache. The second row uses the existing ACOS and TACOS calculated fields. The current-week summary underline control inserts literal <u> markers into the existing plain-text notes field, like the existing bold/list markers; notes are never rendered as arbitrary raw HTML.

## Product performance AI request

`POST /ppc/api/dashboard/ai-chat` accepts an authenticated transient request containing `question`, up to eight `{ role, text }` history items, and a selected-product context. Context includes bounded product identity, one active Wednesday, active-week planning fields, and up to sixty `{ weekStart, weekEnd, dataState, metrics }` summaries. ASIN is empty or exactly ten uppercase alphanumeric characters; dates must be real ISO dates; metrics are finite nonnegative numbers no greater than one billion; `dataState` is `Partial`, `Final`, or normalized to `Saved/manual`. The body is capped at 100 KB. Unknown fields are ignored and malformed scope returns `400`.

The success response is `{ answer: string }`; configuration and provider failures return bounded `{ error: string }` objects. When the verified Pipeline subject has no Scale Insights grant, the route returns `409` with `{ error, authorizationRequired: true, authorizationUrl }`; the URL is validated as Vercel-hosted before reaching the browser. All route responses are no-store. Neither request nor response is persisted by the application, and the widget keeps messages only in React memory keyed by product/week. The route does not change existing dashboard report, catalog, or performance-cache schemas. `AI_GATEWAY_API_KEY`, Vercel OIDC, Scale Insights access tokens, raw MCP/provider errors, tool schemas/results, and model metadata are server-only and excluded from this contract.

For a valid ten-character ASIN, the route discovers the connected Scale Insights MCP tools at request time. Only tool definitions with a top-level ASIN argument and explicit read-only/non-destructive annotation, or the fixed known reporting allowlist, are eligible; mutation-shaped names are rejected. Before every call, supported ASIN fields are replaced with the selected ASIN, marketplace fields with `US`, and date fields with the visible period range capped at yesterday. Tool output supplied to the model omits binary blocks and is capped at 50,000 characters per result.

The third-panel metrics-first order, compact monochrome cards, sales comparison bars, PPC/organic order donut, ACOS/TACOS radial gauges, Strategic Weekly Goals progress, and Budget Utilization burn-rate view are presentation-only. They add no fields to `glassco.ppcPerformanceNotes.v1`, the performance cache, or the dashboard catalog. Revenue, order share, goal progress, expected week pacing, budget usage, and overspend are derived from existing values during render.

The second-panel abbreviated ranges, Current/In Review cues, selected-card border, product-tag metadata, and Spend/Sales/Orders/ACoS labels are also presentation-only. Sales reads `ppcSales`, Orders reads `ppcOrders`, and ACoS reads the existing calculated `acos` value. The full week range remains the button accessible name. The panel does not add or rewrite fields in reports, performance snapshots, selected-month storage, or the catalog.

The first-panel title/count hierarchy, plus action menu, status dots, 36px thumbnails, neutral tag badges, and black selected-card treatment are presentation-only. The action menu is transient component state and continues to invoke the existing catalog mutations. No fields, limits, IDs, ordering rules, or validation in `glassco.ppcDashboardCatalog.v1` changed.

## Goal history and comparison presentation

The existing version-1 `glassco.ppcPerformanceNotes.v1` report accepts optional goal `metric` (`increaseSpend`, `decreaseSpend`, `ppcSales`, `totalSales`, `ppcOrders`, `organicOrders`, `totalOrders`, `acos`, or `tacos`) and `unit` (`currency`, `number`, or `percentage`). Unit is canonicalized by metric: Spend and Sales goals use currency, order goals use number, ACOS/TACOS use percentage, and Organic Order accepts number or percentage. Legacy stored `spend` maps to `increaseSpend` only when the title includes Increase and otherwise to `decreaseSpend`; legacy `sales` maps to `ppcSales`. Recognizable legacy titles infer a metric; unknown legacy goals remain valid without one. The active goal's stored `actual` remains compatibility data and is not used as an editable source. Target strings remain backward-compatible; currency and non-ACOS percentage formatting uses two decimals, while ACOS display formatting uses a rounded whole percentage. Formatting is derived UI and is not required in storage.

The report accepts optional `goalHistory: Array<{ id, title, target, actual, status, resolvedAt, metric?, unit?, dataState? }>` per product/week. `status` must be `Achieved` or `Missed`; `resolvedAt` must be a valid timestamp normalized to ISO; `dataState`, when present, must be `Partial` or `Final`. Malformed entries are discarded, duplicate IDs within a report are removed, and at most 100 newest entries are retained. Older reports restore with an empty history. Legacy terminal entries found in `goals` migrate into history and use valid `updatedAt`, or the normalized reporting-week start when no valid update timestamp exists. Active goals retain only `On Track` and `At Risk` states.

Active Actual values are derived from the selected validated performance snapshot. Sales maps to `totalSales`; Organic Order percentage is `organicOrders / totalOrders * 100` with a zero-denominator result of zero. Partial means the snapshot ends before `weekStart + 6 days`; Final means it covers that full date. These derived active values are not persisted until goal resolution snapshots the formatted actual and optional completeness state into history.

Product-wide Goal History is a derived view over these per-week entries and creates no separate storage key. Small grouped metric cards, centered single-line titles and content-sized values, current-data availability gating for percentage-change badges, metric-specific favorable colors, centered `Prev. Week` footer values, ACOS target-gap copy, whole-number rounding, thousands separators, centered budget values, and the removed prior sales/TACOS line are presentation-only; exact report and performance-cache numbers remain unchanged.

## Target ACOS and Scale Insights analysis URLs

The existing version-1 `glassco.ppcPerformanceNotes.v1` report accepts optional `targetAcos: number`. Missing, negative, non-finite, or malformed values normalize to `0`, meaning no warning threshold. A positive value is local product/week planning data and does not alter imported Scale Insights metrics.

Previous Week Summary renders existing `summaryTopics` without mutation. Legacy `notes` or `previousWeekResult` text may be split at Markdown `##` headings for presentation, but the source text and version-1 report contract remain unchanged.

Analysis URLs use the fixed `https://portal.scaleinsights.com` origin and allowlisted definitions for Campaigns, Keyword Targeting, Product Targeting, Search Terms, Match Types, Placements, Ad Types, Main Keywords, Daily Performance Trend, Weekly Performance Trend, and Monthly Performance Trend. `<ASIN>` must normalize to exactly ten uppercase alphanumeric characters, and supplied week dates must be ISO-shaped. Standard reports serialize only `asinList`, `from`, and `to`; all trend reports serialize `asinList`, fixed `cycles=7`, `to`, and fixed `daysPerCycle` values of `1`, `7`, or `30` respectively. Invalid input resolves to the Scale Insights Ads landing page; OAuth credentials and MCP tokens are never included.

## Budget history and reporting-period selection

The existing version-1 `glassco.ppcPerformanceNotes.v1` report accepts optional `budgetHistory: Array<{ id, changedAt, from, to }>` in newest-first order. Older reports restore with an empty array. Parsing rejects invalid dates, negative/non-finite values, and no-op changes, normalizes timestamps to ISO, limits IDs to 100 characters, and keeps at most 100 entries per product/week. Draft status values remain supported for backward compatibility even though Draft badges and the Save Draft action are no longer shown.

Selected reporting months are not persisted and do not change report or performance-cache keys. They only filter which existing weekly records are visible; overlap weeks remain represented by their stable Wednesday `weekStart`.

## Saved weekly performance and smaller tags

`glassco.ppcPerformanceCache.v1` stores `{ version: 1, entries: { ["US:<ASIN>:<Wednesday date>"]: performance } }` using the minimal performance DTO, never credentials or raw MCP payloads. Restoration validates exact ASIN, US marketplace, real bounded weekly dates, finite nonnegative source numbers and integer orders; it recalculates derived numbers and reconstructs keys. Snapshots include actual end date, freshness and warnings; genuine zero metrics remain valid cache entries. Existing report/catalog keys are unchanged. Visible weeks without valid entries are automatically backfilled, but saved entries have no automatic expiry or background refresh; Refresh replaces only the selected snapshot. Whole-number metric and timeline ACOS formatting plus upper-right week placement are presentation-only and do not change the stored DTO.

## Compact product cards

Portfolio cards display the image, product name, and tag without ASIN/SKU rows. View-mode cards use a compact 66px minimum height; edit mode retains room for Edit, Delete, and Reorder controls. ASIN/SKU remain in the selected-product header, edit form, search index, and existing storage; this is presentation-only with no data migration. Verify both identifier links remain in the detail header after selecting a product.

## Product portfolio ordering

The version-1 dashboard catalog accepts optional `productOrderIds: string[]` (validated unique IDs, capped at 2,000). Missing order uses the prior source order. Unknown or hidden IDs do not create records, and new products are prepended to the saved order. The ordering changes only local portfolio presentation, never product IDs or weekly-report keys.

## Automatic listing images

The authenticated `GET /ppc/api/dashboard/product-image?asin=...` response is `{ asin, imageDataUrl }` with `Cache-Control: no-store`. It accepts one ten-character ASIN, uses the US marketplace, and returns only a validated, bounded raster image. Automatic images use the existing `imageDataUrl` catalog field; no storage migration is needed.

## Scope

This document defines the repository bootstrap content, authoritative Pipeline Postgres state, scoped mutation protocol, private-media/legacy-migration storage, and browser-only reading-state contracts used by the Glassco Back Office Library.

The global application tabs continue to use `glassco.appRoutes.v1` as their new-browser-tab destinations; this navigation change does not alter the stored route schema.

## Library document

`LibraryDocument` is the primary content contract.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Stable unique identifier. Never derive mutable state from title. |
| `slug` | `string` | Unique reader URL segment. |
| `title` | `string` | Display title. |
| `description` | `string` | Catalog and header summary. |
| `category` | `string` | Category name; starter Markdown must use the seeded taxonomy. |
| `type` | `Guide \| SOP \| Checklist \| Template \| Playbook` | Fixed document type taxonomy. |
| `tags` | `string[]` | Search metadata. |
| `updatedAt` | `string` | ISO-compatible date/time string. |
| `status` | `published \| draft` | Reader repository exposes published records only. |
| `hidden` | `boolean` | Hidden records are excluded from normal reader access. |
| `readingMinutes` | `number` | Derived from content text. Minimum `1`. |
| `body` | `string` | Markdown source for repository/legacy documents. |
| `topics` | `Topic[]` | Derived navigation metadata. |
| `contentElements` | `LibraryContentElement[]?` | Structured builder representation. |
| `videoUrl` | `string?` | Normalized HTTP(S) tutorial link. Provider-specific embed/thumbnail URLs, centered Google Drive viewport treatment, and responsive header placement are derived at render time and are not persisted. |

The catalog document editor is creation-only and exposes `title`, `description`, and `category`. New documents receive the existing defaults for `type`, `tags`, and legacy `body`, then are authored further in the structured builder.

For existing documents, builder edit mode accepts a metadata draft containing only `title`, `description`, and `category`. Entering edit mode and displaying the Pencil indicator are local UI transitions and do not mutate shared state. The explicit `Save changes` action merges the draft with the existing document and current `contentElements`; stable `id` and `slug` values plus `type`, `tags`, and legacy `body` remain unchanged. Metadata and element changes are persisted in the same shared document update.

## Topic

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Stable DOM/navigation target. |
| `title` | `string` | Sidebar label. |
| `level` | `number` | Main numbered topics use level `2`. |

## Structured content element

Every `LibraryContentElement` contains a stable `id`, a `type`, and shared fields. Unused shared fields remain present to keep serialization and editing predictable.

Supported `type` values:

```text
topic
statement
quote
bullets
checklist
numbered
insight
table
accordion
feature
code
timeline
flowchart
gallery
button
```

Important structured fields:

| Field | Type | Used by |
| --- | --- | --- |
| `eyebrow`, `label`, `title`, `text` | `string` | Topics and text-based blocks |
| `insightColor` | `"green" \| "blue" \| "red"` | Optional Key Insight presentation; defaults to `green` when absent |
| `body` | `string[]` | Topic paragraphs |
| `callout` | `string?` | Optional topic callout |
| `items` | `string[]` | Bullets, checklist, numbered text |
| `columns` | `string[]` | Table headings |
| `rows` | `string[][]` | Table cell data |
| `columnWidths` | `number[]?` | Saved table widths in pixels |
| `buttonText`, `imageUrl` | `string` | Feature card |
| `buttonUrl` | `string?` | Standalone Button internal or HTTP(S) destination |
| `buttonWidth` | `"full" \| "large" \| "medium" \| "small"` | Optional Button width; defaults to `medium` |
| `buttonAlignment` | `"left" \| "center" \| "right"` | Optional Button alignment; defaults to `center` |
| `steps` | `{title,text,imageUrl?,textStyle?}[]` | Roadmap steps with optional uploaded/legacy images and `plain`, `bullets`, `checklist`, or `numbered` subtext |
| `alignment` | `"left" \| "center" \| "right"` | Optional Roadmap placement; defaults to `left` |
| `numberPosition` | `"left" \| "center" \| "right"` | Optional Roadmap step-number position; defaults to `left` |
| `nodes` | `{title,text}[]` | Diagnostic flow |
| `dropdowns` | `{title,text}[]?` | Repeatable dropdown entries |
| `galleryColumns` | `1 \| 2 \| 3 \| 4` | Image Gallery column layout |
| `images` | `{url,alt}[]?` | Repeatable Image Gallery entries. Source dimensions remain unchanged; square-tile containment is presentation-only. |

Optional `insightColor`, `columnWidths`, `dropdowns`, Roadmap layout fields, step image/format fields, Gallery fields, and Button fields preserve compatibility with older content. Newly uploaded Roadmap, Feature Card, and Gallery images are stored in the shared private Blob store and referenced through the authenticated library-image route; existing data URLs and HTTP(S) values remain valid. Roadmap formatted rows remain newline-delimited in `steps[].text`.

Private library-image route values remain persisted as relative URLs. Client image surfaces retrieve those URLs with the Pipeline bearer token and render the returned bytes through temporary object URLs; Gallery modals may reuse the currently rendered temporary source to avoid a duplicate request. Temporary URLs are presentation-only and are never persisted.

## Repository Markdown front matter

Files under `content/library/*.md` require:

```yaml
id: stable-unique-id
slug: stable-url-slug
title: Human-readable title
description: Concise summary
category: One seeded category value
type: Guide | SOP | Checklist | Template | Playbook
tags:
  - example
updatedAt: YYYY-MM-DD
status: published | draft
hidden: false
```

Repository validation rejects duplicate IDs/slugs and invalid starter taxonomy values.

## Shared library storage

Pipeline Postgres is the only authoritative catalog store. Pipeline exposes `/api/library-state`; the Library's `/ppc/api/library` route forwards authenticated GET, PATCH, and POST requests to it and never maintains a second writable snapshot.

```ts
{
  state: {
    version: 1;
    documents: Array<LibraryDocument & { deletedAt?: string }>;
    categories: Array<{ id: string; name: string; hidden: boolean; deletedAt?: string }>;
  };
  revision: number;
    recordVersions: {
      documents: Record<string, number>;
      categories: Record<string, number>;
    };
    updatedAt: string | null;
    updatedBy: string | null;
    recordManifest: {
      documents: Array<{
        id: string;
        slug: string;
        recordVersion: number;
        lifecycleState: "active" | "deleted" | "archived";
        hidden: boolean;
        status: "published" | "draft";
      }>;
    };
    catalogCompleteness: {
      complete: true;
      scope: "catalog" | "document" | "recovery" | "archive" | "state";
      expectedDocumentCount: number;
      returnedDocumentCount: number;
      expectedCategoryCount: number;
      returnedCategoryCount: number;
      activeDocumentCount: number;
      manifestDocumentCount: number;
      checksum: string;
    };
    deletionAudit?: {
      documents: Record<string, {
        source: "user" | "system_migration" | "system_backup_restore" | "unknown";
        deletedAt: string;
        reason: string;
        actor: { name: string; email: string; role: "ADMIN" | "USER" | "VIEWER" } | null;
        initiatedBy: { name: string; email: string; role: "ADMIN" | "USER" | "VIEWER" } | null;
      }>;
    };
    restoredCount?: number;
  }
```

Pipeline tables separate catalog metadata, documents, categories, backups, and audit records. Stable document/category IDs remain primary keys; `deletedAt` is a recoverable tombstone and is cleared only by an explicit restore.

### Scoped mutation protocol

`PATCH /ppc/api/library` accepts one flat operation per request:

- `catalog.initialize` with `state` and `expectedRevision: 0`
- `document.create` with `document`
- `document.update` with `documentId`, `expectedVersion`, `document`, and optional `updateScope: "content"`
- `document.delete` / `document.restore` with `documentId` and `expectedVersion`
- `document.purge` with `documentId` and `expectedVersion` (ADMIN only; target must already be deleted)
- `documents.restoreSystemDeleted` with unique `documentIds` and `expectedRevision` (ADMIN only)
- `documents.reorder` with all active `documentIds` and `expectedRevision`
- equivalent category create/update/delete/restore/reorder operations

Updates and lifecycle operations compare the target record version. Permanent deletion succeeds only for a tombstoned document and moves it into Pipeline's protected archive; physical table deletion is blocked. Reorders, initialization, and bulk system recovery compare the global revision. Bulk recovery succeeds only when every requested record is currently tombstoned and its latest deletion event is `system_migration`; otherwise it restores none. A mismatch or unavailable target returns HTTP `409`, `conflict: true`, and the current full shared response. Successful mutations increment the global revision, update record versions as applicable, and record actor/revision audit metadata.

`updateScope: "content"` is used for editor and formatting saves. Pipeline removes lifecycle timestamps, preserves the stored ID, slug, visibility, and publication status, validates/canonicalizes supported rich-text nodes and marks, and returns:

```ts
mutationResult: {
  operation: "document.update";
  documentId: string;
  document: ManagedLibraryDocument;
  recordVersion: number;
  lifecycleState: "active";
}
```

The returned document and lifecycle metadata come from the same successful database write as the version increment. Library must not apply or evict caches for a content save until this result matches the submitted ID/slug, remains active, advances the expected version, and contains parseable matching content.

The Library-side adapter forwards authenticated `document.delete` mutations even when the target is the final active document. An empty active catalog is valid, and the resulting tombstone remains available through normal Recovery. `/ppc/api/library/recovery/purged` is an ADMIN-only repair surface: GET returns metadata-only permanent-deletion history, while POST accepts one protected document ID and recreates only the exact approved bQool or Check Spend record from a trusted snapshot through the existing `document.create` contract. It never bulk-imports or silently restores purged records.

Pipeline reloads the caller from `launchflow_users` for every request. ADMIN may initialize, create/update/delete/restore/reorder documents, manage categories, and manage backups. USER may create documents and update active documents only. VIEWER is read-only.

## Browser-storage contracts

### Reading state

Key: `ppc-ops-reading-state`

Schema version: `1`

```ts
{
  version: 1;
  bookmarks: string[];
  recent: Array<{ id: string; viewedAt: number }>;
  lastTopic: Record<string, string>;
  completion: Record<string, boolean>;
}
```

### Confirmed shared-state cache

Key: `glassco-library-confirmed-cache-v2`

The value is the last schema-valid full shared response. A successful authoritative server fetch replaces it. Live fetches and mutations require a complete lifecycle manifest and matching response counts; malformed or incomplete HTTP 200 responses never replace this cache. If the server is unavailable or validation fails, the cache may be rendered only with mutations disabled. It is never treated as pending work and is never uploaded to Pipeline.

Legacy keys `glassco-library-admin-state` and `glassco-library-category-state` are ignored for shared hydration/migration. Their contents cannot merge with repository seeds or authoritative state.

### Scale Insights weekly performance response

For unfinished reporting weeks, the derived Tuesday end date is capped at yesterday (UTC) before the upstream request. The returned `endDate` is the effective requested date, not the nominal Tuesday; `warnings` explicitly labels partial-week coverage. Both source reports must match this effective scope exactly. Weeks with no completed days return a no-store `404` with an availability message, never estimated or zero-filled metrics. The existing report storage schema is unchanged.

Authenticated GET route: `/ppc/api/dashboard/performance?asin=<ASIN>&country=<marketplace>&weekStart=<YYYY-MM-DD>`

The route accepts a ten-character alphanumeric ASIN, an allowlisted marketplace, and a valid Wednesday week start. It derives the inclusive Tuesday end date and returns `Cache-Control: no-store`. The response contains the normalized scope, currency, six upstream source metrics (`spend`, `ppcSales`, `ppcOrders`, `totalSales`, `totalOrders`, `totalSessions`), five calculated metrics (`organicSales`, `organicOrders`, `acos`, `tacos`, `conversionRate`), freshness timestamps, and non-secret consistency warnings. Before consent, the authenticated route returns `409` with `{ error, authorizationRequired: true, authorizationUrl }`; `authorizationUrl` must be HTTPS on `vercel.com` or a `*.vercel.com` host and is the only authorization artifact exposed to the browser.

Advertising source metrics come from `get_ads_performance` totals. Total-sales, order, and session metrics come from `get_sales_data` summary values. The server rejects malformed, negative, non-integer order/session, empty, or differently scoped data rather than estimating. Organic metrics are clamped at zero; ACOS, TACOS, and Conversion Rate are zero when their denominator is zero and otherwise rounded to two decimal places. Vercel Connect keys the upstream OAuth grant to `{ type: "user", id: <verified Pipeline user ID>, issuer: <Pipeline origin> }`; Vercel OIDC authenticates the project. OIDC credentials, OAuth grants, Connect-issued access tokens, and raw MCP payloads are excluded from every response and storage contract.

### Weekly PPC performance drafts

Key: `glassco.ppcPerformanceNotes.v1`

Schema version: `1`

The record maps a stable `<productId>:<Wednesday ISO date>` key to one weekly report containing status, weekly/daily budgets, performance numbers, goals, prior-week result notes, weekly notes, action items, and `updatedAt`. Parsing is fail-closed per report; malformed records are discarded. Product names, ASINs, and SKUs are not duplicated into this store because `/ppc/api/dashboard/products` loads them from authoritative Pipeline workspace state. Validated Scale Insights metric values may be copied into the selected report, but credentials, tokens, and raw MCP payloads are never stored.

This record is a validated shared dashboard document stored in private Vercel Blob through `/ppc/api/dashboard/state`; it is not part of the Library document API. The browser-local value is retained as a one-time migration source and downloadable backup only. The server rejects malformed or oversized payloads and guards writes with the previously returned ETag. A failed write never discards the confirmed value; an ETag conflict loads the latest confirmed value, merges local changes against the prior confirmed base, and retries automatically.

### PPC dashboard catalog overlay

Key: `glassco.ppcDashboardCatalog.v1`

Schema version: `1`

The record contains `tags`, `customProducts`, `productOverrides`, and optional `hiddenPipelineProductIds`. Tags have stable IDs and case-insensitively unique names. Dashboard-only products retain their stable ID, name, optional ASIN/SKU, optional tag ID, and optional validated image data URL. Overrides key the same display fields by an authoritative Pipeline product ID. `hiddenPipelineProductIds` is a deduplicated list of stable Pipeline IDs removed only from this browser's PPC Weekly Goals portfolio. Images are restricted to supported image data URLs and the UI limits selected files to 900 KB.

Parsing is fail-closed: malformed records reset to an empty overlay; malformed and duplicate entries are discarded; missing tag references become untagged; unrecognized image values are removed. The overlay is shared through `/ppc/api/dashboard/state`, never mutates or deletes authoritative Pipeline products, and remains separate from the Library document API. Removing any product from this portfolio does not delete its separately stored weekly reports; Pipeline-backed products remain intact in Product Pipeline.

### Shared PPC dashboard stores

The following browser version-1 keys are accepted by the dashboard state route and stored as validated JSON documents in private Vercel Blob: `glassco.ppcPerformanceCache.v1`, `glassco.ppcCampaignAccountSnapshots.v1`, `glassco.ppcCampaignCsvComparison.v1`, and `glassco.ppcUntargetedOpportunitiesCache.v1`. The server validates each key with its existing parser, caps every document at 3.5 MB, and stores no raw CSV, OAuth credential, Pipeline bearer, or MCP response. Each response includes an opaque ETag and `savedAt`; a PUT must send the ETag it read (or `null` for an empty store) plus a client operation ID. An ETag mismatch returns `409`; the client performs a validated three-way merge and retries up to five times. Different records and different object fields are preserved from both sessions, stable-ID object lists retain independent additions, and the latest local intent wins a same-scalar collision. Account and ASIN campaign snapshots retain validated Sales and Orders for later filters.

`glassco.ppcSharedReportOutbox.v1` is a browser-only crash-recovery record for an unconfirmed `glassco.ppcPerformanceNotes.v1` save. Its version-1 object contains `savedAt` and one `entry` with the validated pending `value` plus the validated confirmed `baseValue` or `null`. It is never sent as a separate shared dataset. On startup, the adapter three-way merges the pending value, its base, and the latest shared value; the key is removed only after the merged weekly-report document is confirmed online. Invalid recovery data is ignored but retained for manual recovery and cannot replace confirmed shared state.

The outbox is updated on every weekly-report edit before the network debounce, including Action Item creation and title changes. A transient sequence of more than five shared ETag conflicts keeps the pending value and retries; an invalid outbox is left untouched for manual recovery rather than erased. Newly created Action Items use UUID-based IDs.

### Untargeted sales opportunity response

`GET /ppc/api/dashboard/untargeted-opportunities?asin=<ASIN>&country=<marketplace>&weekStart=<Wednesday>` returns `{ opportunities }` with the normalized ASIN, marketplace, currency, selected/capped period, `Final` or `Partial` state, source freshness, warnings, and zero or more rows. Each row contains `term`, `type` (`Search term` or `Product ASIN`), integer `impressions`, integer `clicks`, finite non-negative `spend`, finite non-negative `sales`, integer `orders`, nullable finite non-negative `acos`, and optional `sourceCampaignId`, `sourceAdGroupId`, `sourceKeyword`, and `sourceMatchType`. The source fields remain optional so version-1 browser caches stay readable.

Table sorting, filtered totals, copy controls, and Scale Insights source destinations are derived client-side from this validated response. Total ACOS equals filtered total Spend divided by filtered total Sales; it is unavailable when filtered Sales is zero. Every row opens the Search Terms route with the response ASIN and period. The click copies the row term for pasting into the third-party Instant Search field; the term is not placed in the URL because Scale Insights does not consume it there.

The response is accepted only when every field validates. A Product ASIN term must be ten alphanumeric characters. Zero Impressions, Clicks, and Spend remain valid, but every emitted row has integer `orders >= 1`; missing provider metrics invalidate that provider row instead of becoming zero. ACOS is calculated from PPC Spend and Sales when the provider omits it. The server includes a row only when harvest analysis supplies the same normalized term and a nonempty CampaignId. Text search terms are therefore confirmed to lack an exact-match keyword. Product ASIN candidates receive an additional `get_target_performance` check scoped to the same advertised ASIN, marketplace, and period; an ASIN present as `TargetType=product` is excluded. If the target report is unavailable, unreadable, or incomplete, Product ASIN candidates are omitted with a warning. For duplicate mappings, greatest attributed Sales wins, then Orders and Spend. The API response remains no-store and never extends the weekly-report schema.

The client stores up to 50 validated responses under `glassco.ppcUntargetedOpportunitiesCache.v1` as `{ version: 1, entries }`. Each entry key is `<COUNTRY>:<ASIN>:<Wednesday>` and must exactly match its parsed report scope; malformed records are discarded independently. The single workspace Refresh Data action replaces the active key, while reads and local criteria changes use the saved entry without an MCP request. Errors may add `code` and `requestId`; authorization responses may add an allowlisted hosted consent URL.

## Validation and fallback rules

- Treat all browser-storage input as untrusted.
- Invalid or missing authoritative state does not fall back to writable seed state. A validated confirmed cache may be shown read-only; otherwise the error state remains visible.
- Storage write failures must not crash the UI.
- Deleted records use recoverable timestamps instead of destructive removal.
- Recovery dialogs are presentation-only views over records carrying `deletedAt`; moving recovery lists behind toolbar icons does not change the storage schema.
- Catalog hydration is presentation-only: seed documents remain behind a loading skeleton until the shared snapshot or validated local fallback resolves, and no persistence fields change.
- Renaming a category updates assigned active documents in the authoritative mutation.
- Quick category creation uses the existing category schema, generates a stable category ID, and selects the new name in the open document draft without changing the storage version.
- Reading state stores references and timestamps, never document bodies.
- Server state remains authoritative; browser catalog data is never applied after hydration.

## Legacy Blob migration and backups

Private Blob object `glassco/library-state-v1.json` is the legacy source only. The ADMIN-protected `/ppc/api/library/migration` route validates it, supports authenticated download, and creates an immutable checksum-addressed copy under `glassco/library-backups/`. `initialize-catalog` first ensures that backup, preserves the complete document/category catalog exactly—including pre-existing tombstones—and submits `catalog.initialize` to an empty revision-zero Pipeline catalog. The legacy `initialize-clean-catalog` action remains accepted as a compatibility alias but now performs the same safe complete import.

Pipeline backup operations use POST `/api/library-state` with `create-backup` or `restore-backup`; list/detail are ADMIN-only GET queries. Restore requires `expectedRevision`, automatically creates a before-restore backup, preserves records absent from the backup, preserves newer active documents, and never changes an active record into a tombstone. Private Blob continues to store authenticated uploaded images and the legacy migration artifact, not current catalog state.
# Unified session and route contracts

The PPC application reads the existing Pipeline session from local or session storage key `launchflow.authSession.v1`. Required fields are `token` and `email`; `name` and `role` are normalized after server verification. Roles normalize to `ADMIN`, `USER`, or `VIEWER`.

Remembered application routes use `glassco.appRoutes.v1`:

```json
{ "pipeline": "/", "ppc": "/ppc/library", "ppcDashboard": "/ppc/dashboard" }
```

The `ppcDashboard` property is optional on read so legacy `{ pipeline, ppc }` values remain valid. Pipeline accepts only safe non-`/ppc` paths, `ppc` accepts `/ppc/library` and descendants, and `ppcDashboard` accepts `/ppc/dashboard`.

For a session stored only in the source tab, `glassco.authHandoff.v1` temporarily stores `{ version: 1, targetApp, expiresAt, session }` in same-origin local storage. It expires after 30 seconds, can only be consumed by its `pipeline` or `ppc` target, is copied to the destination tab's `launchflow.authSession.v1` session storage, and is immediately removed. Malformed and expired values are deleted; a valid value still requires server verification. Persistent “Remember me” sessions do not use this record.

This integration does not change library document, category, topic, content-element, bookmark, history, or completion schemas.

## Optional rich-text fields

Content elements now accept `richText` on supported primary bodies, `calloutRichText` on topics, `itemRichText[]` aligned with standalone `items[]`, and `richText` on roadmap steps and dropdown entries.

Rich documents use a ProseMirror-style `{ "type": "doc", "content": [...] }` object. Allowed nodes are `doc`, `paragraph`, `text`, `hardBreak`, `bulletList`, `orderedList`, `listItem`, `taskList`, and `taskItem`. Allowed marks are `bold`, `italic`, `underline`, and `link`.

Persisted attributes are limited to `orderedList.start`, `taskItem.checked`, `paragraph.textAlign` (`left`, `center`, or `right`), and `link.href`. Link values accept validated HTTP(S), `mailto:`, or app-relative destinations; bare domains normalize to HTTPS and unsafe schemes are rejected. Reader links always render with `_blank` plus `noopener noreferrer`.

Searchable document links do not add a mark or document field. The editor resolves a selected active, published, visible catalog record to `/ppc/library/<encoded-slug>` and persists it through the same `link.href` contract. Picker options are presentation-only compact catalog data and are never copied into the edited document.

The corresponding legacy body/text fields remain required search and compatibility fallbacks and are updated with every edit. Legacy Headline and Description `textAlignment` remains accepted and is dual-written when alignment changes. Consumers prefer valid rich JSON and reconstruct it from fallback fields when JSON is absent or invalid.

## Library read-state metadata

Shared Library responses may include `snapshotAt`, `recoveryDocumentCount`, and `documentStatus`. `documentStatus.status` is `active`, `deleted`, `archived`, `purged`, or `not_found`; deleted responses may include record version and ADMIN-only deletion attribution.

`GET /ppc/api/library?summary=1` returns active catalog documents and the recoverable count without tombstone content. `recovery=1` explicitly includes recoverable tombstones and ADMIN deletion audit metadata. `slug=<slug>` returns the requested active document plus its structured status. `recordManifest` and `catalogCompleteness` are mandatory for live reads and mutation confirmations but optional when parsing an older confirmed cache. A missing record without an explicit deleted/archived/purged lifecycle is never interpreted as deletion.

## Weekly comparison projection

Current-versus-previous direction, display color, compact typography, and column labels are derived UI values and are not persisted. The selected report and immediately preceding weekly report continue to use the existing `WeeklyPpcReport` metric fields without contract changes. Removing “Trend” from performance-link labels does not change their Scale Insights routes, slugs, or query parameters.

Navigation column membership, Timeline PPC-only labels, percentage suffix spacing, and the five-row Budget History page are presentation rules only. Pagination does not truncate or rewrite the validated `budgetHistory` array, which retains its existing newest-first order and 100-entry cap.

`previousWeekResult` remains the existing string field. New weekly reports initialize it from the immediately preceding report when available; older blank reports may display that preceding value as a UI fallback. A non-empty value stored on the selected report always takes priority, and no new persistence field or version is introduced.

## Performance overview response

Product-target rows retain the existing DTO. Names normalize product/category suffixes and target type comes from the provider metrics. Missing provider IDs receive transient page/row identities so repeated target names remain distinct. `asin` denotes the advertised scope and never the target entity; absent attribution remains blank except when one verified request ASIN establishes the scope. No persistence key or version changes.

`GET /ppc/api/dashboard/performance-overview?asins=<comma-separated>&country=<code>&startDate=<ISO>&endDate=<ISO>` returns `{ overview }` with no-store headers. `overview` contains the normalized ASIN list, country, currency, requested and actual periods, freshness, warnings, four nullable summary periods (`yesterday`, `sevenDays`, `fourteenDays`, `selectedRange`), a chronological `dailyPerformance` array, and four report sections (`keywords`, `campaigns`, `productTargets`, `searchTerms`). Daily points contain date, Spend, PPC Sales, Total Sales, nullable ACOS, and nullable TACOS. Ratios are unavailable when their daily denominator is zero.

Each available period contains non-negative `totalSales`, `ppcSales`, `spend`, `totalOrders`, `ppcOrders`, and `clicks`. Each section has `ready` or `unavailable` status, an explanatory message, and normalized rows containing stable provider/fallback ID, name, campaign, advertised ASIN, match/target types, impressions, clicks, spend, sales, orders, and nullable ACOS, ROAS, and conversion rate. The browser validates every field and rejects the whole response when its scope or values are malformed. This DTO is read-only and is never persisted.

Overview rows also accept optional `state: string` and nullable nonnegative `cpc`, `ctr`, and `dailyBudget`. Older responses remain readable without these fields. Dedicated campaign rows use provider AdType/State and reported rates, leave absent ASIN/traffic values unavailable in the UI, and represent the connected account because the campaign endpoint exposes no ASIN mapping. Campaign metric sorting is transient client state and does not alter any browser-storage schema.

Goal target storage retains its original value; whole-dollar currency formatting is display-only.

WeeklyPpcReport has optional summaryTopics: Array<{ id: string; title: string; body: string }>. Topic IDs are unique, nonblank strings up to 100 characters; titles are strings up to 200 characters; bodies are strings; at most 100 topics are accepted. Invalid arrays fall back to legacy notes; [] explicitly means no topics. Valid arrays project into notes as ordered ## title/body sections for nonempty bodies. Storage key and version remain unchanged.

Opportunity UI header totals are derived from the complete filtered opportunity set; ACOS is aggregate Spend divided by aggregate Sales. No stored schema changes.

Opportunity table alignment and density do not change provider, API, or stored data contracts.

## Weekly table metric extensions

The existing version-1 weekly report and performance-cache records accept optional nonnegative integer `ppcImpressions`, `ppcUnits`, and `totalUnits`. The calculated view may include `cpc` and `organicUnits`; these are derived values and are recalculated when a snapshot is parsed. `cpc` is Spend divided by PPC Clicks when exact clicks are present, and `organicUnits` is Total Units minus PPC Units clamped at zero. Existing records without these optional fields remain valid and render unavailable cells.

## Weekly performance metric revision 3

Weekly performance responses may include `metricsRevision: 2 | 3 | 4` and optional `freshness.searchDataAsOf`. Revision 4 means detailed Sales Trend unit normalization plus Search Term Performance enrichment were attempted for the exact ASIN and dates. Browser snapshots with revision 3 or older remain valid but are refreshed automatically. Complete search-term coverage supplies nonnegative integer `ppcClicks` and `ppcImpressions`; `ppcUnits` is accepted from an explicit provider aggregate, a complete set of row-level unit fields, or exact Sales Trend PPC/Organic/Total unit totals. A missing third unit total may be derived from the other two exact values. `cpc` is recalculated from Spend and PPC Clicks. Exact PPC Units are never inferred from PPC Orders or sales share.

The six-week table presents existing `totalSales`, `totalOrders`, and optional `totalUnits` snapshot values as a total-metrics block before ACOS and TACOS. This presentation change does not alter the response or browser-storage schemas.

Presenting Budget Pacing as a full-width strip above the goals/action grid, adding count badges, and labeling the Add Item control do not change `WeeklyPpcReport`, its `actions` and `budgetHistory` fields, or any shared storage key/version. Hidden action `priority`/`dueDate` and active-goal `status` fields remain accepted for backward compatibility. New reports copy unfinished actions from the immediately preceding report and inherit `weeklyBudget` from the most recently saved earlier report for that product, even across weeks without a saved report. They derive `dailyBudget` and start with an empty `budgetHistory`; completed actions stay in their original week, and a manual weekly-budget edit becomes the value inherited by later weeks until it changes again. Reports without notes or `summaryTopics` project the two presentation defaults Good and Bad without changing the version-1 storage contract.

The compact budget bar derives utilization, elapsed-week percentage, burn-rate variance, remaining or overspent balance, and daily average during render from `spend`, `weeklyBudget`, the selected week, and the dashboard date. These values are not persisted.

For backward compatibility with reports created before continuous budget inheritance, a saved zero `weeklyBudget` with no latest Budget History entry confirming zero is treated as an unset automatic value and displays the latest earlier explicit budget. A Budget History entry whose newest `to` value is zero preserves a deliberate zero limit.

`glassco.ppcWorkspaceSelection.v1` is a browser-only version-1 preference containing `productId`, Wednesday `weekStart`, and one to 24 valid `YYYY-MM` visible months. Invalid or out-of-range selections are ignored. It is never uploaded. Report recovery continues to use `{ version: 1, savedAt, entry: { value, baseValue } }`; new writes use `glassco.ppcSharedReportOutbox.v1:<tab UUID>` so tabs do not replace each other's pending report, while the unsuffixed key is read for migration. The report schema and shared API response are unchanged. An empty in-progress Action Item title remains a valid string so typing through a blank field does not delete the row. A pending report clears from its outbox only after the exact value is confirmed online.

The shared response's `etag` is the canonical private Blob metadata ETag, obtained with `head()`. It is the token required for the next `put(ifMatch)`; the private content GET's representation ETag is not a compatible write token in the observed production store. This changes no response field or document version.

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

Performance Summary reads existing AuditData v1 without modifying persistence. Organic sales/orders are total business values minus attributed PPC values only in compatible unfiltered campaign/match scope and when nonnegative. Zero denominators and missing ASIN matches display dashes. No-order spend includes all positive target/query spend with zero orders, using one target/query level per campaign; CSV preserves numeric precision while UI rounds to whole numbers.


### Wasted Ad Spend and Opportunities — 2026-10-16

WasteRules defaults: minimum 10 clicks and 15 report-currency spend (both apply to all rules), ACOS above 40%, CVR below 5%, CPC above 2.5 report-currency units. No-order spend requires zero attributed orders. A row may carry several reasons but its full spend contributes once to flagged spend; this is a review estimate, not realized savings. Prefer query rows over parent targets per campaign; use campaign/ASIN level only when no query/target rows exist. Breakdown percentages use filtered flagged spend; the PPC denominator scopes ASIN/campaign/match only. Manual Open/Reviewed/Action Taken values and thresholds are stored under glassco.ppcWasteReview.v1 with version, auditId (importedAt), rules and statuses keyed by complete source-row identity. Validate bounded JSON, numbers, status values and audit identity before loading. Quota failures retain session state and show a notice. Opportunities normalizes query case/whitespace and sums repeated query metrics per ASIN; converting queries with an exact positive target for that same ASIN anywhere in the complete upload are excluded. Broad/phrase targets remain review candidates. Unmapped rows stay explicitly unmapped. No live coverage claim or automated campaign action is made.


### Opportunities dashboard — 2026-10-16

Opportunity rules default to ACOS ≤20%, CVR ≥12%, ≥2 orders, harvest ACOS ≤20%, exact exclusion on, and ≥5 placement orders. Canonical evidence prefers non-placement query rows, then targets, then one campaign entity level; placement-only campaigns can supply placement evidence. Eligible converting queries require the harvest ACOS limit and no matching normalized exact target for the same ASIN in the whole upload (unless exclusion is disabled). Efficient targets need low ACOS and high CVR; efficient campaign fallback and sufficiently converting placement fallback are review signals. Each canonical row contributes once; opportunity totals never add separate placement performance. Placement scaling reviews additionally compare reported placement CVR/ACOS with canonical account scope. Business sales/order values join by ASIN; TACOS is unavailable under campaign/type filters. Unmapped rows are explicit. Numeric displays round to whole values; CSV retains raw precision. glassco.ppcOpportunityReview.v1 stores version, auditId=importedAt, validated thresholds and bounded status map keyed by full source identity. Status values are New, Reviewed, Action Planned, Action Taken. Local quota errors retain current-session state. No live targeting or budget utilization is inferred from absent fields.


### Advertised ASIN dashboard — 2026-10-16

Advertised-ASIN portfolio metrics select one performance grain per campaign: non-placement product ads first, then target/query level, then an existing campaign/ad-group fallback. Match filters use matching target/query evidence; placement filters use only the requested placement dimension. Reported ASINs are retained; unmapped detail rows remain explicit with unavailable product metrics when no independent performance can be assigned. Business-only ASINs are not claimed as advertised. Product totals never sum parent and child copies. Organic sales/orders are nonnegative business-minus-PPC differences only in full ASIN scope; campaign/type/match/placement filters suppress organic mix, contribution shares and TACOS. Missing/inconsistent business data stays unavailable and gets a review status. Waste uses saved validated WasteRules for the same audit, otherwise defaults. Campaign, match, and placement drilldowns show their own measured dimensions and are not added to product totals. ACOS/TACOS status thresholds are 20%/12%; ratio denominators of zero yield dashes. Best campaign/match/placement rank measured PPC sales. Displays round whole numbers while CSV preserves precision and escapes formula prefixes. Refresh recalculates imported data and reloads local waste rules only.


### Campaign workbench — 2026-10-16

AuditAd optionally accepts dailyBudget (finite nonnegative report-currency number) and campaignState (string). Import dailyBudget only from explicit Campaign Daily Budget, Campaign Daily Budget (Informational only), or Daily Budget headers; never treat generic/lifetime budget as daily. Read campaignState from campaign entity State/Status or explicit campaign-state metadata on child rows. Omit absent metadata and validate optional types on cache reload; older v1 data is accepted. Campaign identity is [advertising type,campaign ID]. No-scope totals select one non-placement entity level; ASIN/match/placement filters select matching lower-level evidence without allocating campaign totals to a selected product. Administrative parent rows do not count as Unmapped product evidence. Campaign state/bidding-strategy and daily-budget conflicts remain explicit, never picked arbitrarily. Campaign type/strategy summaries aggregate each campaign once, with unavailable metric values as dashes. Waste uses validated same-audit waste rules; target/placement/ad-group dimensions are not added to campaign totals. ACOS review target is 20%; scaling reviews need ≥5 orders, ACOS ≤20%, CVR ≥12%, and non-paused/non-archived campaign state. No budget utilization is inferred. Calendar-day average is reported spend divided by confirmed inclusive date count, not active-day budget utilization. CSV retains precision and escapes formula prefixes; UI rounds metrics to whole values. No campaign modifications are executed.


### Campaign Type comparison — 2026-10-16

Campaign Type reads the existing version-1 AuditAd records and optional explicit daily budget/campaign state. SP/Sponsored Products, SB/Sponsored Brands and SD/Sponsored Display classify together without replacing their campaign identity keys. Metrics sum selected campaign evidence; rates use combined numerators/denominators, shares use available metrics in the filtered scope, and zero denominators return unavailable. Missing scoped performance is disclosed; configured flagged spend is not described as exclusively zero-sales spend. No added persisted fields or provider integration.


### Placement dashboard — 2026-10-16

Audit v1 adds optional placementMetricsAvailable (boolean) and placementBidAdjustment (finite nonnegative number). Placement availability requires explicit Spend, Sales, Orders, Clicks and Impressions values on the row, including genuine zeros; blank metadata-only rows are unavailable. Legacy nonzero placement records remain readable; legacy all-zero records without an availability flag remain unknown. Bid percentages come only from explicit placement percentage/adjustment columns. Canonical placement labels retain unknown slots. Ambiguous rollups are excluded, missing groups are disclosed, weighted rates use selected evidence, zero denominators return unavailable, and placement settings never imply performance or ASIN/match attribution.


### Keyword Target dashboard — 2026-10-20

Audit v1 adds optional keywordId/adGroupId strings and targetMetricsAvailable/bidAvailable booleans, validated when loading saved audits. Import duplicate identity includes explicit keyword/ad-group IDs. A reported target/query metric row needs explicit Spend, Sales, Orders, Clicks and Impressions values; zeros remain valid, blanks stay unavailable. Legacy nonzero metrics/bids remain usable, while legacy all-zero metadata without flags remains unknown. Keyword metrics select one parent record or labeled linked-query evidence, never both. IDs must agree when present; text fallback requires campaign/ad-group/match context and unique candidates. Explicit ASIN conflicts and ambiguous links are excluded. Keyword placements require an actual keyword link; campaign placement totals are not allocated. Exact-coverage review uses the full upload, and overlapping flags do not duplicate flagged spend.
