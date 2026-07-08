const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");
const workspaceApiSource = fs.readFileSync(path.join(repoRoot, "api", "workspace-state.js"), "utf8");

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
    label: "product delete saves immediately",
    snippet: 'await saveSharedWorkspaceNow("product-delete");',
  },
  {
    label: "product image save confirms immediate shared save",
    snippet: 'await saveSharedWorkspaceNow("product-image-save", { requireProductIds: [productId] });',
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
    label: "remote hydration repairs selection from canonical snapshot",
    snippet: "function repairWorkspaceSelectionForSnapshot(snapshot, forceStageReset = false)",
  },
  {
    label: "remote hydration selection uses snapshot products while hydrating",
    snippet: "function getVisibleProductsFromWorkspaceSnapshot(snapshot)",
  },
];

const requiredApiSnippets = [
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
    label: "non-admin saves preserve admin field templates",
    snippet: "nextWorkspaceDetails.stageFieldTemplates = currentState.workspaceDetails.stageFieldTemplates ?? {};",
  },
  {
    label: "non-admin saves preserve keyword structure",
    snippet: "preserveAdminKeywordResearchStructure(state, currentState?.keywordResearchSettings);",
  },
  {
    label: "non-admin product stages are sanitized against admin-visible tabs",
    snippet: "sanitizeProductStagesForStageSettings(state, currentState?.stageSettings);",
  },
  {
    label: "non-admin workspace stage details are sanitized against admin-visible tabs",
    snippet: "sanitizeWorkspaceDetailsStagesForStageSettings(state, currentState?.stageSettings);",
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

if (!process.exitCode) {
  console.log("Shared workspace invariants passed.");
}
