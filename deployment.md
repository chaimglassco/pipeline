# LaunchFlow Deployment Guide

## 0. Operational Note for the AI Coding Agent

Read this file before creating, editing, pushing, or deploying LaunchFlow code. Treat it as the deployment safety map for the GitHub → Vercel release flow.

The user has zero coding experience. When guiding the user, do not show a long sequence of steps at once. Show only the immediate next step, confirm it is completed, then move to the next step.

This file must be updated whenever the deployment flow changes, the project adds a build tool, the repository structure changes, environment variables are introduced, or a Vercel issue is discovered.

---

## 1. Deployment Mission

LaunchFlow must deploy reliably through Vercel from a GitHub repository.

The deployment system must prioritize:

- Clean static file paths
- Minimal build complexity
- Safe default state initialization
- No hidden dependency on local-only files
- No hardcoded machine-specific paths
- No missing environment variables during build
- No unguarded browser/server boundary errors
- No broken imports caused by case-sensitive paths
- No preview deployment failures from incomplete commits
- Fast rollback through Git/Vercel deployment history

Deployment success means the application loads, renders the fixed multi-panel layout, preserves progressive stage disclosure, supports custom fields and checklists, and does not crash when opened from a Vercel preview or production URL.

---

## 2. Canonical Deployment Model

### Source of Truth

GitHub is the source of truth for LaunchFlow source code.

Expected source control model:

```txt
Local project folder
  → Git commit
  → GitHub repository
  → Vercel automatic deployment
  → Preview URL or Production URL
```

### Deployment Platform

Vercel is the hosting and deployment platform.

Vercel is responsible for:

- Importing the GitHub repository
- Creating deployment builds
- Serving the frontend application
- Creating preview deployments from non-production branches
- Creating production deployments from the production branch
- Providing deployment logs
- Supporting instant rollback through previous deployments

### Production Branch

Default production branch:

```txt
main
```

Rules:

- Treat `main` as the stable production branch.
- Do not push experimental code directly to `main` once the project becomes active.
- Use feature branches when the user is ready to learn Git branching.
- A merge into `main` should represent code that is safe for production.

---

## 3. Repository Layout Expected by Deployment

LaunchFlow begins as a clean vanilla frontend application with modular JavaScript and CSS.

Canonical root layout:

```txt
/
├── index.html
├── README.md
├── agent.md
├── product-spec.md
├── architecture.md
├── progress.md
├── qa-checklist.md
├── deployment.md
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── store.js
    └── components/
        ├── Header.js
        ├── Sidebar.js
        ├── Workspace.js
        ├── StageAccordion.js
        ├── CustomFieldForm.js
        ├── CustomFieldRenderer.js
        └── Checklist.js
```

Optional files that may be added later:

```txt
package.json
.gitignore
.env.example
vercel.json
tailwind.config.js
postcss.config.js
```

The project must not depend on optional files until they actually exist.

---

## 4. Deployment Track A: Static Vanilla App

This is the recommended first deployment mode for the initial beginner-friendly LaunchFlow build.

Use this when the app contains:

```txt
index.html
css/styles.css
js/app.js
js/store.js
js/components/*.js
```

and does not yet require a Node/Vite/Tailwind build step.

### Vercel Project Settings for Static Mode

Recommended settings:

```txt
Framework Preset: Other
Root Directory: ./
Build Command: empty / none
Output Directory: .
Install Command: default or empty
```

If a `public` directory exists, Vercel may serve from `public` when using the `Other` preset. If LaunchFlow serves files directly from the root, keep `index.html` in the root and verify the output directory serves the root project folder.

### Static Mode Requirements

`index.html` must use clean relative paths:

```html
<link rel="stylesheet" href="./css/styles.css" />
<script type="module" src="./js/app.js"></script>
```

Do not use local machine paths:

```html
<link rel="stylesheet" href="C:/Users/name/project/css/styles.css" />
```

Do not use editor-only paths:

```html
<script src="vscode-resource://...">
```

Do not depend on localhost URLs:

```html
<script src="http://localhost:3000/js/app.js"></script>
```

---

## 5. Deployment Track B: Build-Backed App

This mode may be introduced later if the project uses Vite, Tailwind CLI, PostCSS, TypeScript, tests, bundling, or asset optimization.

Use this only after the user confirms that package setup is complete.

Expected additional files:

```txt
package.json
tailwind.config.js
postcss.config.js
```

Recommended Vite-style scripts if the project migrates to Vite:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Vercel settings for Vite-style builds:

```txt
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Do not configure Vite/Tailwind deployment settings until the required files exist.

---

## 6. Path Safety Rules

All application asset paths must be deployment-safe.

### Required Path Style

Use relative paths for local project files:

```txt
./css/styles.css
./js/app.js
./js/store.js
./js/components/Sidebar.js
```

### JavaScript Import Rules

Use explicit relative imports:

```js
import { createInitialState } from "./store.js";
import { renderSidebar } from "./components/Sidebar.js";
```

From inside `/js/components/`:

```js
import { getVisibleStages } from "../store.js";
```

### Prohibited Path Patterns

Do not use:

```txt
@/components/Sidebar.js
~/components/Sidebar.js
/components/Sidebar.js
C:\Users\...
/Users/name/...
localhost paths
```

unless the project has an actual bundler and alias configuration that supports them.

### Case Sensitivity Rule

Vercel builds run in a case-sensitive environment.

These are different paths:

```txt
./components/sidebar.js
./components/Sidebar.js
```

Imports must match the file name exactly.

---

## 7. Vercel GitHub Flow

### Initial Connection

The expected first-time deployment flow is:

```txt
1. Create GitHub repository.
2. Push LaunchFlow files to GitHub.
3. Open Vercel dashboard.
4. Import the GitHub repository.
5. Configure project settings.
6. Deploy.
7. Open the generated Vercel URL.
8. Validate with qa-checklist.md.
```

For beginner operation, the AI coding agent must walk the user through one item at a time instead of presenting the whole flow as active instructions.

### Preview Deployment Behavior

Expected behavior:

- A push to a non-production branch should create a preview deployment.
- A pull request should have a preview URL.
- The preview URL must be tested before production merge.

### Production Deployment Behavior

Expected behavior:

- A push or merge to `main` should create a production deployment.
- Production must not receive code that fails the LaunchFlow QA checklist.
- Production deployment must be validated after each release.

---

## 8. Environment Variable Policy

LaunchFlow should begin with no required environment variables.

Current expected state:

```txt
Required environment variables: none
```

### If Environment Variables Are Added Later

Required files:

```txt
.env.example
.gitignore
```

`.env.example` may contain placeholder names:

```txt
# Example only. Do not commit real secrets.
# VITE_API_BASE_URL=
```

`.gitignore` must exclude real local environment files:

```txt
.env
.env.local
.env.production
.env.development
```

### Environment Safety Rules

- Do not commit real secrets.
- Do not hardcode API keys in JavaScript.
- Do not assume env vars exist during build.
- Always provide safe fallbacks or visible setup errors.
- Keep public frontend variables separate from server-only secrets.
- When using Vite later, client-exposed environment variables must use the required `VITE_` prefix.

### Safe Read Pattern

```js
const apiBaseUrl = import.meta?.env?.VITE_API_BASE_URL || "";

if (!apiBaseUrl) {
  console.warn("API base URL is not configured. Running in local-only mode.");
}
```

Do not use unsafe assertions:

```js
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
fetch(`${apiBaseUrl}/products`);
```

unless the variable is validated before use.

---

## 9. Default State Fail-Safe Policy

The app must always be able to boot with a safe default state.

If localStorage is empty, corrupted, blocked, or unavailable, LaunchFlow must initialize from a default product state instead of crashing.

### Required Safe Defaults

```js
const DEFAULT_STATE = {
  products: [],
  activeProductId: null
};
```

If the app needs a demo product for early development, it must be clearly marked as demo state and easy to remove later.

### Required State Guards

- Clamp `current_stage_index` or `current_active_stage_index` to `1..14`.
- Initialize missing `stage_blocks` as 14 stage block objects.
- Initialize missing `custom_fields` as `[]`.
- Initialize missing `checklist_tasks` as `[]`.
- Ignore malformed stored JSON and recover gracefully.

### Safe LocalStorage Pattern

```js
function safelyLoadState() {
  try {
    const raw = localStorage.getItem("launchflow_state");
    if (!raw) return DEFAULT_STATE;
    return normalizeAppState(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not load saved LaunchFlow state. Using defaults.", error);
    return DEFAULT_STATE;
  }
}
```

---

## 10. Build Safety Directives

### Required Before Every Push

Before code is pushed to GitHub, verify:

```txt
[ ] index.html exists at project root
[ ] css/styles.css exists if linked by index.html
[ ] js/app.js exists if linked by index.html
[ ] All script and stylesheet paths are relative
[ ] JavaScript imports match exact file names and casing
[ ] No local machine paths exist
[ ] No localhost URLs are required for the app to load
[ ] No raw secrets are committed
[ ] No incomplete merge conflict markers exist
[ ] App can start from default empty state
[ ] Hidden future stages are omitted from DOM
[ ] Custom fields are nested under stage blocks
[ ] Checklist tasks are nested under stage blocks
[ ] Checkbox toggles recalculate progress
```

### Merge Conflict Markers Must Never Be Committed

Search for and remove incomplete merge-conflict marker lines, including:

```txt
seven leading less-than signs
seven leading equals signs
seven leading greater-than signs
```

### Console Errors Are Deployment Blockers

A deployment is not acceptable if the browser console shows errors such as:

```txt
Failed to load module script
Uncaught SyntaxError
Uncaught ReferenceError
Uncaught TypeError
404 css/styles.css
404 js/app.js
```

---

## 11. Vercel Configuration File Policy

`vercel.json` is optional for the early static app.

Do not create `vercel.json` unless there is a clear reason.

Good reasons include:

- Clean URLs
- Redirects
- Rewrites
- Custom headers
- Explicit build settings
- SPA fallback routing

### Minimal Static `vercel.json` If Needed

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true
}
```

### SPA Fallback Only If Routing Requires It

If LaunchFlow later adds client-side routes, a rewrite may be needed:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Do not add this until client-side routing exists.

---

## 12. Deployment Validation Checklist

After every Vercel deployment, test the live URL.

### Smoke Test

```txt
[ ] Page opens without 404
[ ] Header renders
[ ] Sidebar renders
[ ] Main workspace renders
[ ] CSS loads correctly
[ ] JavaScript loads correctly
[ ] Browser console has no fatal errors
```

### Layout Test

```txt
[ ] Header is sticky/fixed at top
[ ] Sidebar is 260px wide
[ ] Sidebar sits below header
[ ] Workspace is offset by 260px
[ ] KPI row appears at top of workspace
[ ] Pipeline progress meter appears below KPI row
[ ] Stage accordion cards appear below progress meter
```

### Progressive Disclosure Test

```txt
[ ] Product at Stage 1 renders only Stage 1
[ ] Product at Stage 3 renders only Stages 1, 2, and 3
[ ] Product at Stage 14 renders all 14 stages
[ ] Future stages are absent from DOM, not just hidden by CSS
[ ] Sidebar follows the same visibility rule
[ ] Search does not reveal hidden future stages
```

### Dynamic Custom Fields Test

```txt
[ ] Visible stage has + Add Custom Field
[ ] Field Name is required
[ ] Field Type dropdown contains only TEXT, NUMBER, LINK, CURRENCY, WEIGHT, SIZING, DATE
[ ] Saving field appends it to the correct stage
[ ] No default metadata fields pre-render
[ ] Field remains after refresh if persistence is active
```

### Checklist Test

```txt
[ ] Visible stage has Add Task input
[ ] Empty tasks are rejected
[ ] New task appears under the correct stage
[ ] Checkbox toggles completion state
[ ] Completed task text receives strikethrough
[ ] Stage progress updates immediately
[ ] Progress remains correct after refresh if persistence is active
```

---

## 13. Beginner-Friendly Deployment Protocol

The AI coding agent must guide the user with this operating rule:

```txt
Only one active step at a time.
```

Correct guidance style:

```txt
Step 1: Create the project folder named LaunchFlow.
Tell me when that is done.
```

Incorrect guidance style:

```txt
Create a folder, install Node, make GitHub, install Vercel, configure Tailwind, push everything, then deploy.
```

The user should never be asked to perform multiple unrelated technical actions in one instruction.

---

## 14. Local Development Expectations

### Static Mode

For the earliest static app, the user can open `index.html` directly in a browser or use a simple local server.

Preferred simple local server if Node is available:

```bash
npx serve .
```

or later:

```bash
npm run dev
```

only after `package.json` and a dev script exist.

### Rule

Do not tell the user to run a command that depends on a file not yet created.

Examples:

Do not say:

```bash
npm run dev
```

unless `package.json` exists and contains a `dev` script.

Do not say:

```bash
npm run build
```

unless `package.json` exists and contains a `build` script.

---

## 15. Common Vercel Failure Modes

### Failure: Page Shows 404

Likely causes:

- `index.html` is not in the deployed output directory.
- Wrong Vercel output directory.
- Project root is configured incorrectly.
- Files were not committed to GitHub.

Fix direction:

- Confirm repository contains `index.html` at root.
- Confirm Vercel root directory is `./`.
- Confirm output directory matches deployment track.

### Failure: CSS Does Not Load

Likely causes:

- Wrong stylesheet path.
- `css/styles.css` not committed.
- Case mismatch in path.

Fix direction:

- Use `./css/styles.css`.
- Confirm file exists with exact casing.

### Failure: JavaScript Does Not Load

Likely causes:

- Wrong script path.
- Missing `type="module"` for module imports.
- Import path mismatch.
- Syntax error.

Fix direction:

- Use `<script type="module" src="./js/app.js"></script>`.
- Confirm imports are relative and exact.

### Failure: App Loads But Blank Workspace

Likely causes:

- Active product state is null and empty state is missing.
- Render function crashed.
- Store initialization failed.
- Missing stage data normalization.

Fix direction:

- Add safe empty state.
- Normalize active product before rendering.
- Wrap localStorage parsing in try/catch.

### Failure: All 14 Stages Show Immediately

Likely causes:

- Progressive disclosure logic was bypassed.
- Rendering loop maps over all stages instead of visible stages.
- CSS hiding was used instead of DOM omission.

Fix direction:

- Filter or break render loop when `stage_index > current_stage_index`.
- Confirm hidden stages do not exist in DOM inspector.

### Failure: Vercel Build Fails After Adding Tailwind/Vite

Likely causes:

- Missing dependency.
- Missing build script.
- Wrong output directory.
- Tailwind config syntax error.
- CSS input path mismatch.

Fix direction:

- Confirm `package.json` scripts.
- Confirm dependencies installed and committed through lockfile.
- Confirm Vercel build command and output directory.

---

## 16. Rollback Strategy

If production breaks:

1. Identify the last known-good deployment in Vercel.
2. Promote or restore that deployment if available.
3. Revert the bad Git commit if needed.
4. Push the revert to GitHub.
5. Validate the restored production URL.
6. Add the incident and fix notes to `progress.md`.

Rollback must prioritize restoring a working application before adding new fixes.

---

## 17. Release Gate Checklist

A LaunchFlow release is ready only when these pass:

```txt
[ ] README.md is current
[ ] agent.md still matches expected AI behavior
[ ] product-spec.md still matches implemented UX
[ ] architecture.md still matches actual file structure
[ ] progress.md is updated with completed work
[ ] qa-checklist.md has been used for validation
[ ] deployment.md reflects the current deployment track
[ ] App opens locally
[ ] App opens on Vercel preview URL
[ ] App has no fatal console errors
[ ] Progressive disclosure works
[ ] Custom fields work
[ ] Checklist tasks work
[ ] Progress calculations work
[ ] No secrets are committed
```

---

## 18. Documentation Update Rules

Update `deployment.md` when:

- The project changes from static mode to Vite/Tailwind build mode.
- Vercel settings change.
- A new environment variable is introduced.
- A new build command is introduced.
- The output directory changes.
- A deployment failure is found and fixed.
- GitHub branch strategy changes.
- Serverless functions or APIs are added.

Update `progress.md` after each successful deployment milestone.

---

## 19. Official Reference Links

These references are for the AI coding agent and project maintainer.

- Vercel Git deployments: https://vercel.com/docs/git
- Vercel for GitHub: https://vercel.com/docs/git/vercel-for-github
- Vercel build configuration: https://vercel.com/docs/builds/configure-a-build
- Vercel project configuration: https://vercel.com/docs/project-configuration
- Vercel environment variables: https://vercel.com/docs/environment-variables
- GitHub `.gitignore` basics: https://docs.github.com/en/get-started/git-basics/ignoring-files

---

## 20. Final Deployment Principle

LaunchFlow must always be deployable from a clean GitHub push.

If code only works on the local machine, it is not production-ready.

If Vercel cannot build or serve it, it is not complete.

If the UI reveals future stages too early, the deployment is functionally incorrect.

If the user cannot follow the next action clearly, the guidance is not beginner-safe.
