# LaunchFlow Handoff for New Codex Chat

## Project location
- Repo path: `/workspace/pipeline`
- Static app entry: `index.html`
- Main controller: `js/app.js`
- State engine: `js/store.js`
- Stage constants: `js/constants/stages.js`
- Styles: `css/styles.css`

## How to run locally
Use a simple static server from the repo root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/index.html`.

## Current app summary
LaunchFlow / LaunchPad Pro is a browser-only static prototype for managing Amazon product launch pipeline stages. It uses `localStorage` for persistence and does not have a backend yet.

Main features already implemented:
- 14-stage pipeline sidebar and progressive product stage visibility.
- Product list, product card, product workspace, image upload, SKU/ASIN display.
- Role/login prototype with local manual access users.
- Admin/user/viewer permission gates.
- Custom fields shared by stage templates, not only per product.
- Custom field types including short text, long bar token field, half/long notes, dropdown, tables, file upload, payment status, checklist notes, shipment tracker, link button, and listing content builder.
- Drag/drop for products, stages, checklist tasks, table rows/columns, and custom field order.
- Product chat modal with attachments, file/link search, emojis, formatting, and per-product history.
- Payment recording with documents and transaction history.
- Shipment tracker mock UI inspired by 17TRACK, with external free lookup.
- Listing Creation content builder with title, bullets, product description, backend keywords, keyword usage tracker, and Approved/Declined status.
- Safe render recovery to avoid blank white screens when old/corrupt local data causes a render error.

## Important prototype credentials
Admin owner credentials are hardcoded for the local prototype:

- Email: `chaim@glasscosupplies.com`
- Password: `Cg.123456`

Manual users are stored in localStorage. There is no real email invite service yet.

## Local storage keys
The app persists data in browser localStorage using these important keys:

- `launchflow.workspaceDetails.v1`
- `launchflow.stageSettings.v1`
- `launchflow.userProducts.v1`
- `launchflow.productSettings.v1`
- `launchflow.teamUsers.v1`
- `launchflow.manualAccess.v1`
- `launchflow.authSession.v1`

If the app behaves strangely after a code change, old localStorage data may be the cause. Test with a cleared browser storage profile when needed.

## User preferences and UI direction
Keep these patterns consistent:
- User wants compact, screenshot-aligned UI.
- Prefer icon buttons over large buttons when space is tight.
- Product cards and stage sections should not feel cluttered.
- Previous stage data should remain visible as products move forward.
- Stage custom fields should be shared by stage/tab, not created per product only.
- When an action succeeds, provide a visible indicator where possible.
- Avoid blank-page failures; show a recoverable UI or safe fallback.

## Current recent work
Recent changes added:
1. More flexible keyword table resizing.
2. Reorderable custom fields inside each stage dropdown.
3. Safe render fallback for blank-page prevention.
4. Listing Creation content builder.
5. Listing keyword usage tracker with TL/BL/DS badges:
   - `TL` = Title, green.
   - `BL` = Bullets, blue.
   - `DS` = Product Description, orange.
   - Used keywords are struck through.
   - Backend Keywords field was added.

## Files most likely to edit next
- `js/app.js`: most UI/rendering/event logic lives here.
- `css/styles.css`: all component styling lives here.
- `js/store.js`: core pipeline state and product stage mutations.
- `js/constants/stages.js`: canonical stage list.

## Testing/check commands to run before committing
Run these from `/workspace/pipeline` after changes:

```bash
node --check js/app.js
node --check js/store.js
node --check js/constants/stages.js
node --input-type=module -e "import('./js/app.js').then(() => console.log('app import ok'))"
git diff --check
test -z "$(rg -n '(<){7}|(=){7}|(>){7}' .)"
python3 -m http.server 4173 --bind 127.0.0.1 >/tmp/launchflow-http.log 2>&1 & server=$!; sleep 1; curl -fsS http://127.0.0.1:4173/index.html >/tmp/launchflow-index.html; kill $server; wait $server 2>/dev/null || true; test -s /tmp/launchflow-index.html
```

## Coding notes for future Codex
- This is a no-build static app. Keep links relative and avoid adding build tooling unless requested.
- Do not wrap imports in try/catch.
- Preserve existing permission checks (`canEditWorkspaceData`, `canManageProducts`, `canMoveProducts`, etc.).
- Prefer local helper functions in `js/app.js` for UI behaviors.
- When adding new custom field types:
  1. Add to `WORKSPACE_CUSTOM_FIELD_TYPES`.
  2. Add renderer in `renderWorkspaceFieldControl`.
  3. Add normalizer/initial value support.
  4. Add CSS.
  5. Ensure old localStorage data does not crash rendering.
- For stage-level fields, update stage templates and sync into product stage details.
- If a feature stores files, it currently stores Data URLs in localStorage, so keep file sizes in mind.

## Final response expectations
When code is changed, final response should include:
- Summary bullets with file citations.
- Testing bullets with exact commands and emoji prefixes.
