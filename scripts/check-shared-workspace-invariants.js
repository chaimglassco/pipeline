const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(repoRoot, "css", "styles.css"), "utf8");
const workspaceApiSource = fs.readFileSync(path.join(repoRoot, "api", "workspace-state.js"), "utf8");
const authApiSource = fs.readFileSync(path.join(repoRoot, "api", "_auth.js"), "utf8");
const storageUploadApiSource = fs.readFileSync(path.join(repoRoot, "api", "storage-upload.js"), "utf8");

const requiredAppSnippets = [
  {
    label: "workspace field add button is admin-owned",
    snippet: "function renderWorkspaceAddFieldForm(product, stage) {\n  if (!canManageWorkspaceFieldTemplates()) return null;",
  },
  {
    label: "workspace field create modal is admin-owned",
    snippet: 'if (action === "open-field-modal") {\n    if (!canManageWorkspaceFieldTemplates()) return;',
  },
  {
    label: "workspace field edit modal is admin-owned",
    snippet: 'if (action === "edit-workspace-field") {\n    if (!canManageWorkspaceFieldTemplates()) return;',
  },
  {
    label: "workspace field delete is admin-owned",
    snippet: 'if (action === "delete-workspace-field") {\n    if (!canManageWorkspaceFieldTemplates()) return;',
  },
  {
    label: "custom field create submit is admin-owned",
    snippet: 'if (action === "add-custom-field") {\n    event.preventDefault();\n    if (!canManageWorkspaceFieldTemplates()) return;',
  },
  {
    label: "custom field save submit is admin-owned",
    snippet: 'if (action === "workspace-save-custom-field") {\n    event.preventDefault();\n    if (!canManageWorkspaceFieldTemplates()) return;',
  },
  {
    label: "admin stage reorder saves immediately",
    snippet: 'if (didReorderStage) saveSharedWorkspaceNow("stage-reorder").catch(reportSharedWorkspaceSaveError);',
  },
  {
    label: "admin stage delete saves immediately",
    snippet: 'if (didDeleteStage) saveSharedWorkspaceNow("stage-delete").catch(reportSharedWorkspaceSaveError);',
  },
  {
    label: "admin stage create saves immediately",
    snippet: 'await saveSharedWorkspaceNow("stage-create");',
  },
  {
    label: "product create/edit confirms immediate shared save",
    snippet: 'await saveSharedWorkspaceNow("product-save", { requireProductIds: [savedProduct.id] });',
  },
  {
    label: "product save confirmation checks raw server product ids",
    snippet: 'const rawProducts = Array.isArray(state?.userProducts) ? state.userProducts : [];',
  },
  {
    label: "product delete saves immediately",
    snippet: 'await saveSharedWorkspaceNow("product-delete", {',
  },
  {
    label: "product delete requires explicit modal confirmation",
    snippet: 'dataAction: "confirm-product-delete",',
  },
  {
    label: "product delete confirmation names the selected product",
    snippet: "productName: product.name,",
  },
  {
    label: "product image save confirms immediate shared save",
    snippet: 'await saveSharedWorkspaceNow("product-image-save", { requireProductIds: [productId] });',
  },
  {
    label: "COGS is opened from a dedicated clickable metric card",
    snippet: 'dataAction: "open-cogs-calculator",',
  },
  {
    label: "COGS worksheet saves through the shared workspace",
    snippet: 'await saveSharedWorkspaceNow("product-cogs-save", {',
  },
  {
    label: "COGS save keeps exactly one current worksheet",
    snippet: "const nextBatches = [savedBatch];",
  },
  {
    label: "COGS template deletion requires an explicit confirmation action",
    snippet: 'dataAction: "confirm-delete-cogs-template-item"',
  },
  {
    label: "COGS category deletion shows the affected row count",
    snippet: 'cost row${removedRowCount === 1 ? "" : "s"} will be removed from future blank forms.',
  },
  {
    label: "COGS editor renders the shared configurable category groups",
    snippet: "getCogsDraftGroups(draft).map((group) => renderCogsCostGroup(group, draft, errors, modal, isSaving))",
  },
  {
    label: "COGS template editing uses the inline editor",
    snippet: "modal.templateEditMode ? renderInlineCogsTemplateEditor(modal, isSaving) : null",
  },
  {
    label: "COGS eye control toggles inline template editing",
    snippet: 'dataAction: "toggle-cogs-template-mode"',
  },
  {
    label: "COGS categories use accessible independent accordions",
    snippet: 'dataAction: "toggle-cogs-category"',
  },
  {
    label: "COGS category accordions start collapsed",
    snippet: "expandedCategoryIds: [],",
  },
  {
    label: "COGS inline template edit has explicit Cancel",
    snippet: 'dataAction: "cancel-cogs-template-edit"',
  },
  {
    label: "COGS inline template edit exposes an administrator add-category control",
    snippet: 'dataAction: "add-cogs-template-category"',
  },
  {
    label: "COGS inline template categories expose add-row controls",
    snippet: 'dataAction: "add-cogs-template-row"',
  },
  {
    label: "COGS template rows use the rename-ready New Row default",
    snippet: 'label: "New Row",',
  },
  {
    label: "COGS add-row redraw restores the modal row position",
    snippet: "restoreAddedCogsTemplateRowPosition({ categoryId, rowId, anchorOffset });",
  },
  {
    label: "COGS inline template rows retain batch-specific Amount entry",
    snippet: 'className: "cogs-template-manager__amount-field cogs-template-row__amount"',
  },
  {
    label: "COGS inline template rows show their calculated per-unit value",
    snippet: "dataCogsTemplateUnitOutput:",
  },
  {
    label: "COGS template management is admin-only",
    snippet: "function canManageCogsTemplate()",
  },
  {
    label: "COGS template saves reject automatic conflict overwrites",
    snippet: 'retryOnConflict: false,',
  },
  {
    label: "COGS template edits are staged from a cloned shared template",
    snippet: "modal.templateDraft = cloneCogsTemplateSettings(cogsTemplateSettings);",
  },
  {
    label: "COGS template Cancel discards its staged draft",
    snippet: "modal.templateDraft = null;",
  },
  {
    label: "COGS template Save publishes the staged settings",
    snippet: 'await saveSharedWorkspaceNow("cogs-template-save", {',
  },
  {
    label: "open COGS drafts reconcile after a template save",
    snippet: "modal.draft = reconcileCogsBatchDraftWithTemplate(modal.draft, nextSettings, {",
  },
  {
    label: "COGS template is included in shared workspace snapshots",
    snippet: "cogsTemplateSettings,",
  },
  {
    label: "COGS template is persisted in local storage",
    snippet: "safeSetStorageItem(COGS_TEMPLATE_SETTINGS_STORAGE_KEY, JSON.stringify(cogsTemplateSettings));",
  },
  {
    label: "recovery bundles restore the shared COGS template",
    snippet: "cogsTemplateSettings = normalizeCogsTemplateSettings(bundle.cogsTemplateSettings);",
  },
  {
    label: "COGS rows expose note icon controls",
    snippet: 'dataAction: "open-cogs-cost-note"',
  },
  {
    label: "COGS row notes open in a focused popup editor",
    snippet: "function renderCogsCostNoteEditor(draft, index, isSaving)",
  },
  {
    label: "COGS preset rows can be cleared without being deleted",
    snippet: 'dataAction: "clear-cogs-cost-row"',
  },
  {
    label: "next-stage action stays visible while a background save is active",
    snippet: "if (!canManageProducts() || !getNextProductStageId(product)) return null;",
  },
  {
    label: "shipping includes a built-in timeline for every product",
    snippet: 'fieldId: "built_in_shipping_timeline",\n      label: "Shipping Timeline",\n      type: "SHIPPING_TIMELINE",',
  },
  {
    label: "shipping timeline saves its date and expected duration as field parts",
    snippet: 'dataFieldPart: "shippingDate",',
  },
  {
    label: "shipping timeline saves expected duration as field parts",
    snippet: 'dataFieldPart: "expectedDays",',
  },
  {
    label: "shipping movement does not copy under-final-order records",
    snippet: "// Shipping is a separate operational record. Moving a product must not copy",
  },
  {
    label: "active Pipeline tab is a real new-tab link",
    snippet: 'createElement("a", {\n      className: "glassco-app-tabs__tab glassco-app-tabs__tab--active",\n      href: currentPipelineRoute,\n      target: "_blank",\n      rel: "noopener noreferrer",',
  },
  {
    label: "Team SOP Library tab is a remembered-route new-tab link",
    snippet: 'createElement("a", {\n      className: "glassco-app-tabs__tab",\n      href: routes.ppc,\n      target: "_blank",\n      rel: "noopener noreferrer",\n      dataAction: "open-sop-library",',
  },
  {
    label: "PPC Dashboard tab is a remembered-route new-tab link",
    snippet: 'href: routes.ppcDashboard,\n      target: "_blank",\n      rel: "noopener noreferrer",\n      dataAction: "open-ppc-dashboard",',
  },
  {
    label: "session-only authentication creates a versioned expiring handoff",
    snippet: 'JSON.stringify({ version: 1, targetApp, expiresAt, session: authSession })',
  },
  {
    label: "successful login returns to a validated requested application",
    snippet: 'setAuthSession({ email: payload.user.email, name: payload.user.name, role: payload.user.role, token: payload.token }, remember);\n    if (redirectToGlasscoReturnRoute()) return { handled: true };',
  },
  {
    label: "login return accepts only Team SOP Library and PPC Dashboard routes",
    snippet: "return isValidSopLibraryRoute(route) || isValidPpcDashboardRoute(route) ? route : null;",
  },
  {
    label: "handoff is consumed into destination session storage",
    snippet: 'safeSetStorageItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session), "session");',
  },
  {
    label: "product list conflict merge is product-scoped",
    snippet: "function mergeUserProductsForDirtySync(remoteProducts, localProducts)",
  },
  {
    label: "product settings conflict merge is product-scoped",
    snippet: "function mergeProductSettingsForDirtySync(remoteSettings, localSettings)",
  },
  {
    label: "workspace details conflict merge tracks product IDs",
    snippet: "function getChangedProductIdsFromWorkspaceDetails(previousDetails, nextDetails)",
  },
  {
    label: "workspace details conflict merge only applies dirty product records",
    snippet: "const mergedProducts = { ...remoteWorkspaceDetails.products };",
  },
  {
    label: "activity log conflict merge preserves entries from both sessions",
    snippet: "function mergeActivityLogForDirtySync(remoteActivityLog, localActivityLog)",
  },
  {
    label: "remote hydration repairs selection from canonical snapshot",
    snippet: "function repairWorkspaceSelectionForSnapshot(snapshot, forceStageReset = false)",
  },
  {
    label: "remote hydration selection uses snapshot products while hydrating",
    snippet: "function getVisibleProductsFromWorkspaceSnapshot(snapshot)",
  },
  {
    label: "admin publish is explicitly marked as an overwrite",
    snippet: 'reason: "admin-publish", state: await prepareSharedWorkspaceSnapshotForSync({ strictImageMigration: true })',
  },
  {
    label: "product stage moves use the compact move endpoint",
    snippet: 'operation: "product.move",',
  },
  {
    label: "compact product move confirmations validate the target stage",
    snippet: "mutationResult?.stageId !== product.stageId",
  },
];

const requiredApiSnippets = [
  {
    label: "workspace schema setup is memoized",
    snippet: "let workspaceStateSchemaReadyPromise;",
  },
  {
    label: "workspace schema setup resets after failure",
    snippet: "workspaceStateSchemaReadyPromise = null;",
  },
  {
    label: "workspace GET parses state_json",
    snippet: "state: parseWorkspaceStateJson(row?.state_json),",
  },
  {
    label: "workspace save parses current state_json",
    snippet: "const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);",
  },
  {
    label: "workspace save response parses returned state_json",
    snippet: "state: parseWorkspaceStateJson(row.state_json),",
  },
  {
    label: "workspace backup parses current state_json",
    snippet: "const currentState = parseWorkspaceStateJson(currentRows[0]?.state_json);",
  },
  {
    label: "workspace backup GET parses backup state_json",
    snippet: "state: parseWorkspaceStateJson(row.state_json), storageAssets:",
  },
  {
    label: "workspace restore parses backup state_json",
    snippet: "const backupState = parseWorkspaceStateJson(rows[0]?.state_json);",
  },
  {
    label: "non-admin saves preserve admin stage settings",
    snippet: "state.stageSettings = currentState.stageSettings;",
  },
  {
    label: "non-admin saves only merge allowed table template adjustments",
    snippet: "nextWorkspaceDetails.stageFieldTemplates = mergeTableTemplateAdjustments(",
  },
  {
    label: "non-admin table template merge keeps current admin template base",
    snippet: "const mergedTemplatesByStage = cloneJsonObject(currentTemplatesByStage);",
  },
  {
    label: "non-admin saves preserve keyword structure",
    snippet: "preserveAdminKeywordResearchStructure(state, currentState?.keywordResearchSettings);",
  },
  {
    label: "non-admin saves preserve the admin COGS template",
    snippet: "preserveAdminCogsTemplate(state, currentState?.cogsTemplateSettings);",
  },
  {
    label: "COGS template writes require the administrator role",
    snippet: 'reason.startsWith("cogs-template-save") && !isAdmin',
  },
  {
    label: "non-admin product stages are sanitized against admin-visible tabs",
    snippet: "sanitizeProductStagesForStageSettings(state, currentState?.stageSettings);",
  },
  {
    label: "non-admin workspace stage details are sanitized against admin-visible tabs",
    snippet: "sanitizeWorkspaceDetailsStagesForStageSettings(state, currentState?.stageSettings);",
  },
  {
    label: "purged recovery history is pruned from canonical workspace state",
    snippet: "prunePurgedProductHistoryEntries(state);",
  },
  {
    label: "workspace schema setup is limited to backup routes",
    snippet: "const isBackupRequest = req.method === \"POST\" || (req.method === \"GET\" && (req.query?.backups === \"1\" || req.query?.backupId));",
  },
  {
    label: "ordinary workspace saves and compact product moves avoid auto-backup work",
    snippet: 'if (String(body?.operation || "").trim() === "product.move") return moveWorkspaceProduct(res, user, body);',
  },
  {
    label: "compact product moves use an optimistic canonical write",
    snippet: "function applyWorkspaceProductMove(currentState, body, user)",
  },
  {
    label: "compact product moves serialize against concurrent workspace writes",
    snippet: "FOR UPDATE",
  },
  {
    label: "ordinary workspace writes cannot overwrite a concurrent product move",
    snippet: "Shared workspace changed while this save was being committed. Reloaded the latest shared version.",
  },
  {
    label: "ordinary workspace saves require a shared version",
    snippet: "Shared workspace version is required before saving. Reloaded the latest shared version.",
  },
  {
    label: "ordinary workspace saves require scoped mutation metadata",
    snippet: "This browser needs the latest workspace sync update before it can save.",
  },
  {
    label: "scoped saves merge changed products into current server state",
    snippet: "function mergeScopedWorkspaceSave(currentState, nextState, { dirtyKeys, dirtyProductIds, dirtyTemplateStageIds = [], dirtyProductStageIds = {}, dirtyProductFieldIds = {}, dirtyProductMetadataIds = [] })",
  },
  {
    label: "scoped saves preserve untouched product stages",
    snippet: "function mergeScopedWorkspaceProductDetails(currentDetails, incomingDetails, dirtyStageIds, dirtyFieldIdsByStage, shouldMergeMetadata)",
  },
  {
    label: "scoped saves preserve untouched fields in a changed stage",
    snippet: "function mergeScopedWorkspaceStageDetails(currentDetails, incomingDetails, dirtyFieldIds)",
  },
  {
    label: "admin publish is the only unversioned overwrite bypass",
    snippet: 'const isAdminPublishOverwrite = isAdmin && reason === "admin-publish";',
  },
];

const requiredAuthApiSnippets = [
  {
    label: "auth schema setup is memoized",
    snippet: "let schemaReadyPromise;",
  },
  {
    label: "auth schema setup resets after failure",
    snippet: "schemaReadyPromise = null;",
  },
  {
    label: "postgres pooler disables prepared statements",
    snippet: "prepare: false,",
  },
];

const requiredStorageUploadApiSnippets = [
  {
    label: "storage schema setup is memoized",
    snippet: "let databaseStorageSchemaReadyPromise;",
  },
  {
    label: "storage schema setup resets after failure",
    snippet: "databaseStorageSchemaReadyPromise = null;",
  },
];

const requiredStyleSnippets = [
  {
    label: "product list panel uses the light-blue design token",
    snippet: "background: var(--color-product-panel-background);",
  },
  {
    label: "product list panel has a floating right-side shadow",
    snippet: "box-shadow: 0.75rem 0 1.75rem rgb(15 23 42 / 8%);",
  },
  {
    label: "application tabs use independent card spacing",
    snippet: "gap: 0.75rem;",
  },
  {
    label: "COGS categories use a highlighted blue bar",
    snippet: ".cogs-cost-group__toggle {",
  },
  {
    label: "COGS inline template footer remains accessible while scrolling",
    snippet: ".cogs-template-manager__footer {\n  position: sticky;",
  },
];

function assertIncludes(source, checks, sourceName) {
  const missingChecks = checks.filter((check) => !source.includes(check.snippet));
  if (missingChecks.length === 0) return;

  console.error(`Shared workspace invariant check failed in ${sourceName}:`);
  for (const check of missingChecks) {
    console.error(`- ${check.label}`);
  }
  process.exitCode = 1;
}

assertIncludes(appSource, requiredAppSnippets, "js/app.js");
assertIncludes(workspaceApiSource, requiredApiSnippets, "api/workspace-state.js");
assertIncludes(authApiSource, requiredAuthApiSnippets, "api/_auth.js");
assertIncludes(storageUploadApiSource, requiredStorageUploadApiSnippets, "api/storage-upload.js");
assertIncludes(stylesSource, requiredStyleSnippets, "css/styles.css");

const forbiddenCogsEditorSnippets = [
  'dataAction: "add-cogs-cost-row"',
  'dataAction: "remove-cogs-cost-row"',
  'dataAction: "open-cogs-template-manager"',
  "renderCogsTemplateManagerModal",
  "Manage Template",
  'renderCogsCostColumnHeader("Rate to USD")',
  'renderCogsCompactInput("Rate to USD"',
  'renderCogsCostInput("Rate to USD"',
  'renderCogsCostInput("Provider"',
  'dataAction: "toggle-cogs-cost-details"',
  'dataAction: "move-cogs-template-row"',
  "Move to category",
];
const returnedCogsEditorSnippets = forbiddenCogsEditorSnippets.filter((snippet) => appSource.includes(snippet));
if (returnedCogsEditorSnippets.length > 0) {
  console.error("Shared workspace invariant check failed: legacy dynamic COGS controls returned:");
  for (const snippet of returnedCogsEditorSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log("Shared workspace invariants passed.");
}
