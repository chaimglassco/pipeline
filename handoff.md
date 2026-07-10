# LaunchFlow Handoff for New Codex Chat

## Current status as of July 10, 2026
- Local repo path on this machine: `C:\Users\HomePC\Documents\GitHub\pipeline`.
- GitHub remote: `https://github.com/chaimglassco/pipeline.git`.
- Vercel project/site: `pipeline` / `glasscopipeline.vercel.app`.
- Latest pushed commit at handoff time: `3320df2 Make campaign and vine metrics product-specific`.
- Working tree was clean immediately before this documentation update started.
- Before starting new feature work, run `git status --short --branch`.
- If push fails with `Permission to chaimglassco/pipeline.git denied to rubentiongson`, it is a GitHub credential/account issue, not an app code issue. The terminal must be authenticated as an account with write access to `chaimglassco/pipeline`.

## Project location
- Repo path: `C:\Users\HomePC\Documents\GitHub\pipeline`
- Static app entry: `index.html`
- Main browser controller: `js/app.js`
- State engine: `js/store.js`
- Stage constants: `js/constants/stages.js`
- Main stylesheet: `css/styles.css`
- Vercel/serverless API routes: `api/`
- Vercel config: `vercel.json`

## How to run locally
Use a simple static server from the repo root. On this Windows machine, run:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/index.html`.

For syntax/static checks, run the commands in the **Testing/check commands** section below.

## Current app summary
LaunchFlow / LaunchPad Pro is a vanilla JavaScript Amazon product launch pipeline app. The frontend is still a static app, but the repo now also includes Vercel serverless API routes for remote auth, shared workspace sync, and uploaded asset storage/serving.

Main features currently implemented:
- 14-stage pipeline sidebar and progressive product stage visibility.
- Dashboard view plus pipeline/product workspace views.
- Product list, product cards, product workspace, SKU/ASIN display, editable product details, product image upload, and stage movement.
- Product-list history/restore: history button on each product card, deleted product restore entry point, product change/move/delete restore actions, and cleaner per-field history diffs.
- Role/login flow with admin/user/viewer permission gates.
- Remote team/user APIs backed by Neon/Vercel Postgres when `DATABASE_URL` or equivalent env vars are configured.
- Shared remote workspace sync through `api/workspace-state.js` so Chaim/admin and Ruben/user can see the same product/workspace data.
- Workspace disaster recovery: manual and automatic workspace backups, admin-only Settings > Backups screen, restore points, JSON download, before-restore backup creation, and automatic backup pruning.
- File/image backup support: future uploads are mirrored into database-backed storage assets, backup JSON includes `storageAssets`, and restoring a workspace backup restores saved storage assets.
- Safe local persistence wrappers for localStorage/sessionStorage failures.
- Custom fields shared by stage templates, not only per product.
- Custom field types including short text, long bar token field, half/long notes, number, currency, date, link, custom dropdown, custom table, file upload, image gallery, record transaction/payment status, checklist notes, shipment tracker, listing content builder, and keyword usage tracker.
- Drag/drop for products, stages, checklist tasks, table rows/columns, and custom field order.
- Product chat modal with attachments, file/link search, emojis, formatting, and per-product history.
- Product chat reply feature: reply action, quoted reply preview in message bubbles, clickable reply preview, and popup showing the full referenced message.
- Supabase Storage / upload proxy flow for product images, chat attachments, profile avatars, payment documents, workspace file uploads, and image gallery assets.
- Server-side upload proxy (`api/storage-upload.js`) that uploads to Supabase Storage when configured or stores assets in the database fallback.
- Asset serving endpoint (`api/storage-asset.js`) for database-backed uploaded files.
- Image Gallery custom field with grid formats, square slots, upload/replace/remove/reorder controls, preview modal, and remote-storage-backed metadata.
- Payment/transaction recording with documents and transaction history; Under Final Order now has a built-in `Transaction Record` field and `Record Transaction` is available in the custom field type list.
- Shipment tracker mock UI inspired by 17TRACK, with external free lookup.
- Listing Creation content builder with title, bullets, product description, backend keywords, keyword usage tracker, and Approved/Declined status.
- Campaign Prep, Enrolled to Vines, and Launch dashboards; their stage-specific settings are included in remote sync.
- Campaign Preparation and Enrolled to Vines top metrics are now product-specific so new products do not inherit prefilled values from other products or old global settings.
- Export controls inside expanded workspace dropdowns for Docs, PDF, CSV, and Excel exports scoped to the selected product/stage dropdown.
- Safe render recovery and app-shell/module-load fallbacks to avoid blank-page failures after bad local data or problematic Vercel deploys.
- Uploaded profile avatars persist remotely and render in the header profile icon after logout/login.
- Product images are protected during shared workspace sync; stale local snapshots cannot erase an existing remote product image unless the action is explicitly `product-image-delete`.
- USER accounts can adjust workspace table sheets: add/remove rows and columns, edit headers, drag/reorder rows and columns, and resize table rows/columns. Broader field/template creation and tab structure remain admin-owned.

## Important credentials and roles
Default owner credentials are still available for local/dev access:

- Email: `chaim@glasscosupplies.com`
- Password: `Cg.123456`

Remote access uses the Vercel API routes and database when configured. Manual/local users may still exist in localStorage for older data, but the intended team workflow is remote login plus shared workspace sync.

## Environment variables / deployment setup
The app can run locally without backend env vars, but remote team sync and durable uploads require deployment configuration.

Useful environment variables:
- Database: `DATABASE_URL`, `POSTGRES_URL`, `STORAGE_URL`, `STORAGE_DATABASE_URL`, `NEON_DATABASE_URL`, or `NEON_URL`.
- Owner overrides: `LAUNCHFLOW_OWNER_EMAIL`, `LAUNCHFLOW_OWNER_PASSWORD`, `LAUNCHFLOW_OWNER_NAME`.
- Supabase upload proxy: `SUPABASE_URL` / `LAUNCHFLOW_SUPABASE_URL` and a server-side service key such as `SUPABASE_SERVICE_ROLE_KEY` / `LAUNCHFLOW_SUPABASE_SERVICE_ROLE_KEY`.
- Frontend runtime config lives in `window.LAUNCHFLOW_SUPABASE` in `index.html`; default upload proxy is `/api/storage-upload`.

Important deployment files:
- `vercel.json` adds cache headers for `/`, `/index.html`, `/js/*`, and `/css/*` to reduce stale Vercel loading-page issues.
- `index.html` loads `/js/app.js` through a dynamic module import and displays an error card if the module fails to load.
- `js/app.js` can rebuild missing app shell nodes if a stale/minimal HTML shell is served.

## Local storage keys
The app persists local fallback/cache data in browser storage. Important keys include:

- `launchflow.workspaceDetails.v1`
- `launchflow.stageSettings.v1`
- `launchflow.userProducts.v1`
- `launchflow.productSettings.v1`
- `launchflow.teamUsers.v1`
- `launchflow.manualAccess.v1`
- `launchflow.authSession.v1`
- `launchflow.campaignPrepSettings.v1`
- `launchflow.vineSettings.v1`
- `launchflow.launchMonitoring.v1`

If the app behaves strangely after a code change, old localStorage data may be the cause. Test with a cleared browser storage profile when needed.

## User preferences and UI direction
Keep these patterns consistent:
- User wants compact, screenshot-aligned UI.
- Prefer clean placement and minimal clutter over adding large panels/buttons.
- Product cards and stage sections should not feel cluttered.
- Previous stage data should remain visible as products move forward.
- Stage custom fields should be shared by stage/tab, not created per product only.
- Admin and regular user views should show the same shared workspace data unless permission gates intentionally hide edit-only controls.
- When an action succeeds, provide a visible indicator where possible.
- Avoid blank-page failures; show a recoverable UI or safe fallback.
- For remote/team features, do not silently fall back to browser-local-only data if the user expects other accounts to see it.

## Current recent work / context for next chat
Recent work focused on shared workspace reliability, profile/product images, USER permissions, Campaign/Vine per-product metrics, history/restore, backups, disaster recovery, storage, image galleries, sync, Vercel boot reliability, and field UX:
1. Replaced base64/data URL persistence with storage metadata and Supabase/proxy upload URLs.
2. Added `api/storage-upload.js`, `api/storage-asset.js`, and `api/workspace-state.js`.
3. Added Image Gallery custom fields with selectable formats, square slots, upload progress, preview, replace, remove, reorder, and extra slot support.
4. Added database-backed upload fallback so images/files can be visible across browsers when Supabase Storage is not configured.
5. Added shared workspace sync and expanded it to include campaign prep, Vine, and launch monitoring settings.
6. Fixed dropdowns closing from background sync by pausing remote applies during active interactions.
7. Moved exports into workspace dropdown headers and scoped exports to the selected product/stage dropdown.
8. Made custom table URL cells clickable and truncated long links so tables do not stretch.
9. Added `.ai` upload support and changed generic file upload button text to `Upload File Only`.
10. Made currency custom fields visually one combined field.
11. Restored Under Final Order `Transaction Record` as a built-in payment/transaction field and added `Record Transaction` to the custom field list.
12. Hardened Vercel boot/module loading with app shell rebuild, root-absolute asset loading, and cache headers.
13. Added custom field history and restore, including field-level history buttons, stage history, table-cell and multi-short-bar history granularity, admin-only restore, deleted custom field restore, and readable summaries.
14. Added full workspace backup/restore with backup table `launchflow_workspace_state_backups`, admin Settings > Backups UI, manual backup, restore, download JSON, and before-restore safeguards.
15. Added file/image disaster-recovery support through `launchflow_storage_assets`, `storageAssets` in downloaded backups, and restore of database-backed storage assets.
16. Added product-list history/restore: product card history button, deleted product history access, create/change/move/delete/restore records, and per-field-only diffs for cleaner history.
17. Added product chat reply support with quoted previews and full-message popup.
18. Fixed product stage movement sync race by preventing product-history writes from triggering a competing workspace sync and flushing moves immediately.
19. Removed the header settings shortcut so only profile and logout remain in the top-right account pill.
20. Profile avatar upload now persists to remote user records and appears in the header profile icon after logout/login.
21. Product images are now preserved during workspace sync and API saves unless the explicit save reason is `product-image-delete`.
22. USER accounts can adjust workspace table sheets without gaining broader admin-only field/template controls.
23. Launch metric add button is now a compact icon-only `+` button.
24. Campaign Preparation and Enrolled to Vines numeric cards are now product-specific. New products start with blank/zero metrics instead of inheriting global/demo values.

Latest relevant commits:
- `3320df2` Make campaign and vine metrics product-specific
- `fd575d8` Preserve product images during workspace sync
- `867741a` Allow users to adjust workspace tables
- `4641ac6` Use icon-only launch metric add button
- `c35aff9` Persist profile avatars across logins
- `a49b9d5` Show uploaded avatar in header profile button
- `57d1747` Remove header settings shortcut

## Files most likely to edit next
- `js/app.js`: most UI/rendering/event logic, storage upload logic, sync logic, custom fields, and modals live here.
- `css/styles.css`: all component styling lives here.
- `api/workspace-state.js`: shared workspace remote state endpoint.
- `api/storage-upload.js`: upload proxy and database fallback upload endpoint.
- `api/storage-asset.js`: database-backed uploaded asset serving endpoint.
- `api/_auth.js`, `api/users.js`, `api/auth/*.js`: remote auth/team-user support.
- `index.html`: runtime config and module-load fallback.
- `vercel.json`: deployment/cache behavior.
- `js/store.js`: older core pipeline state and product stage mutations.
- `js/constants/stages.js`: canonical stage list.

## Testing/check commands to run before committing
Run these from `C:\Users\HomePC\Documents\GitHub\pipeline` after changes. On Windows/PowerShell, prefer `npm.cmd` if `npm.ps1` is blocked by execution policy.

```powershell
node --check .\js\app.js
node --check .\js\store.js
node --check .\js\constants\stages.js
node --check .\api\storage-upload.js
node --check .\api\storage-asset.js
node --check .\api\workspace-state.js
node --check .\api\users.js
node --check .\api\auth\login.js
node --check .\api\auth\session.js
npm.cmd run build --if-present
git diff --check
```

Optional deeper checks:

```powershell
python -m json.tool vercel.json
rg -n '(<){7}|(=){7}|(>){7}' . -g '!node_modules'
```

Browser/manual checks when possible:
- Open deployed Vercel URL after a merge and confirm the app loads normally, not the Vercel/loading placeholder.
- Log in as Chaim/admin and Ruben/user and confirm the same products, workspace fields, Image Gallery images, and Enrolled to Vines data are visible.
- Upload a gallery image/file and verify it is visible in another browser/account.
- Open a native dropdown and confirm background sync does not close it unexpectedly.
- Add/edit a product as an admin-created user and confirm product name/SKU/ASIN save and remain after refresh/remote sync.
- Move a product to the next stage and confirm it does not bounce back.
- Open product card history and confirm only changed fields appear in the history item.
- Create a workspace backup, download it, and confirm downloaded JSON includes both `state` and `storageAssets`.

## Coding notes for future Codex
- This is still a vanilla app; do not add a framework/build tool unless explicitly requested.
- Do not wrap imports in try/catch.
- Preserve existing permission checks (`canEditWorkspaceData`, `canManageProducts`, `canMoveProducts`, etc.).
- Prefer local helper functions in `js/app.js` for UI behaviors.
- When adding new custom field types:
  1. Add to `WORKSPACE_CUSTOM_FIELD_TYPES`.
  2. Add renderer in `renderWorkspaceFieldControl`.
  3. Add normalizer/initial value support.
  4. Add export serialization if needed.
  5. Add CSS.
  6. Ensure old localStorage and remote workspace data do not crash rendering.
- For stage-level fields, update stage templates and sync into product stage details.
- For file/image features, store metadata plus `bucket`, `storagePath`, and `storageUrl`; do not persist `data:` URLs in rows.
- Remote team-visible changes should be included in `getRemoteWorkspaceSnapshot()` and applied in `applyRemoteWorkspaceState()`.
- If a setting is edited through a setter and should sync across users, call `queueRemoteWorkspaceSync()` after local persistence.
- Avoid local-only fallbacks for production team workflows unless clearly labeled as development-only.

## Final response expectations
When code is changed, final response should include:
- Summary bullets with file citations.
- Testing bullets with exact commands.
- Note whether changes are local only, committed, pushed, or deployed.
- For this user, keep the final concise and include the exact PowerShell command to commit/push when useful.
