import { LAUNCHFLOW_STAGES, MAX_STAGE_INDEX } from "./constants/stages.js";
import {
  CUSTOM_FIELD_TYPES,
  addChecklistTask,
  addCustomField,
  advanceProductStage,
  calculateOverallPipelineProgress,
  calculateStageProgress,
  getActiveProduct,
  getStageBlock,
  getState,
  getVisibleStages,
  subscribe,
  toggleChecklistTask,
  updateCustomFieldValue,
} from "./store.js";

const uiState = {
  selectedStageId: "product-research",
  selectedProductId: null,
  activeView: "pipeline",
  expandedWorkspaceStageIds: new Set(["product-research"]),
  collapsedChecklistIds: new Set(),
  expandedChecklistIds: new Set(),
  hiddenCompletedChecklistIds: new Set(),
  paymentModal: null,
  fieldModal: null,
  checklistNoteModal: null,
  activeChatProductId: null,
  chatAssetsOpen: false,
  chatSearchOpen: false,
  chatSearchQuery: "",
  chatEmojiOpen: false,
  chatAttachmentPreview: null,
  pendingChatAttachments: [],
  chatUploadingFiles: false,
  chatSending: false,
  addProductModalOpen: false,
  editingProductId: null,
  addStageModalOpen: false,
  stageEditorOpen: false,
  draggedStageId: null,
  draggedProductId: null,
  draggedChecklistTask: null,
  draggedTableSection: null,
  settingsInviteModalOpen: false,
  editingTeamUserId: null,
  settingsUserNotice: "",
  settingsUserSearchQuery: "",
  settingsCategory: "profile",
  authError: "",
  loginDraft: { email: "", password: "", remember: false },
  showLoginPassword: false,
  copiedSkuProductId: null,
  skuCopyTimeoutId: null,
  searchQuery: "",
};

const WORKSPACE_DETAILS_STORAGE_KEY = "launchflow.workspaceDetails.v1";
const STAGE_SETTINGS_STORAGE_KEY = "launchflow.stageSettings.v1";
const USER_PRODUCTS_STORAGE_KEY = "launchflow.userProducts.v1";
const PRODUCT_SETTINGS_STORAGE_KEY = "launchflow.productSettings.v1";
const TEAM_USERS_STORAGE_KEY = "launchflow.teamUsers.v1";
const MANUAL_ACCESS_STORAGE_KEY = "launchflow.manualAccess.v1";
const AUTH_SESSION_STORAGE_KEY = "launchflow.authSession.v1";
const ADMIN_OWNER_CREDENTIALS = Object.freeze({
  email: "chaim@glasscosupplies.com",
  password: "Cg.123456",
  name: "Chaim Glass",
  role: "ADMIN",
});
const WORKSPACE_CUSTOM_FIELD_TYPES = Object.freeze([
  { value: "SHORT_TEXT", label: "Short Text" },
  { value: "LONG_BAR", label: "Long Bar" },
  { value: "HALF_LONG_TEXT", label: "Half Long Text Bar" },
  { value: "LONG_TEXT", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "CURRENCY", label: "Currency" },
  { value: "DATE", label: "Calendar Date" },
  { value: "LINK", label: "Link" },
  { value: "SHIPMENT_TRACKER", label: "Track Shipment" },
  { value: "CUSTOM_DROPDOWN", label: "Custom Dropdown" },
  { value: "CUSTOM_TABLE", label: "Custom Table" },
  { value: "FILE_UPLOAD", label: "File Upload" },
  { value: "PAYMENT_STATUS", label: "Payment Status" },
  { value: "CHECKLIST_NOTES", label: "Checklist + Notes" },
]);
const WORKSPACE_CUSTOM_FIELD_TYPE_VALUES = WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => fieldType.value);
const OPTIMIZATION_WORKSPACE_STAGE = Object.freeze({
  stage_id: "optimization",
  stage_index: 13,
  label: "Optimization",
  phase: "optimization",
});
let workspaceDetails = loadWorkspaceDetails();

const SIDEBAR_STAGE_TABS = [
  ...LAUNCHFLOW_STAGES.slice(0, 12).map((stage) => ({
    id: stage.stage_id,
    label: stage.stage_id === "campaign-prep" ? "Campaign Preparation" : stage.label,
    panelLabel: stage.stage_id === "product-research" ? "Research Pipeline" : `${stage.label} Pipeline`,
    icon: getStageIcon(stage.stage_id),
  })),
  { id: "optimization", label: "Optimization", panelLabel: "Optimization Pipeline", icon: "trending_up" },
  ...LAUNCHFLOW_STAGES.slice(12).map((stage) => ({
    id: stage.stage_id,
    label: stage.label,
    panelLabel: `${stage.label} Pipeline`,
    icon: getStageIcon(stage.stage_id),
  })),
];

const USER_ROLES = Object.freeze(["ADMIN", "USER", "VIEWER"]);
const DEFAULT_TEAM_USERS = Object.freeze([
  {
    id: "team-chaim-glass",
    name: "Chaim Glass",
    email: "chaim@glasscosupplies.com",
    role: "ADMIN",
    status: "Active",
    password: "Cg.123456",
    jobTitle: "Workspace Owner",
    avatarDataUrl: "",
    inviteSentAt: null,
    lastLoginAt: null,
  },
]);

let stageSettings = loadStageSettings();
let userProducts = loadUserProducts();
let productSettings = loadProductSettings();
let teamUsers = loadTeamUsers();
let authSession = loadAuthSession();
let productDragGhost = null;
let productDropStageId = null;

const DUMMY_PRODUCTS = [
  {
    id: "dummy-stainless-steel-bottle",
    name: "Stainless Steel Bottle",
    sku: "SSB-77",
    stageId: "product-research",
    readinessPercent: 0,
  },
  {
    id: "dummy-silicone-lunch-box",
    name: "Silicone Lunch Box",
    sku: "SLB-24",
    stageId: "product-development",
    readinessPercent: 8,
  },
  {
    id: "dummy-bamboo-desk-lamp",
    name: "Bamboo Desk Lamp",
    sku: "BDL-18",
    stageId: "supplier-sourcing",
    readinessPercent: 14,
  },
  {
    id: "dummy-travel-cable-kit",
    name: "Travel Cable Kit",
    sku: "TCK-41",
    stageId: "under-final-order",
    readinessPercent: 21,
  },
  {
    id: "dummy-compression-packing-cubes",
    name: "Compression Packing Cubes",
    sku: "CPC-09",
    stageId: "shipping",
    readinessPercent: 29,
  },
  {
    id: "dummy-ceramic-matcha-set",
    name: "Ceramic Matcha Set",
    sku: "CMS-52",
    stageId: "keyword-research",
    readinessPercent: 36,
  },
  {
    id: "dummy-magnetic-spice-rack",
    name: "Magnetic Spice Rack",
    sku: "MSR-16",
    stageId: "listing-creation",
    readinessPercent: 43,
  },
  {
    id: "dummy-foldable-yoga-mat",
    name: "Foldable Yoga Mat",
    sku: "FYM-33",
    stageId: "image-planning",
    readinessPercent: 50,
  },
  {
    id: "dummy-pet-grooming-glove",
    name: "Pet Grooming Glove",
    sku: "PGG-71",
    stageId: "campaign-prep",
    readinessPercent: 57,
  },
  {
    id: "dummy-glass-food-containers",
    name: "Glass Food Containers",
    sku: "GFC-28",
    stageId: "amazon-inbound",
    readinessPercent: 64,
  },
  {
    id: "dummy-led-reading-light",
    name: "LED Reading Light",
    sku: "LRL-87",
    stageId: "enrolled-to-vines",
    readinessPercent: 71,
  },
  {
    id: "dummy-collapsible-water-bowl",
    name: "Collapsible Water Bowl",
    sku: "CWB-62",
    stageId: "launch",
    readinessPercent: 79,
  },
  {
    id: "dummy-microfiber-towel-set",
    name: "Microfiber Towel Set",
    sku: "MTS-44",
    stageId: "stable",
    readinessPercent: 88,
  },
  {
    id: "dummy-adjustable-phone-stand",
    name: "Adjustable Phone Stand",
    sku: "APS-05",
    stageId: "scaling",
    readinessPercent: 96,
  },
];

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializeApp);
}

function initializeApp() {
  const shell = getShellElements();
  if (!shell) return;

  shell.appRoot.addEventListener("click", handleAppClick);
  shell.appRoot.addEventListener("dblclick", handleAppDoubleClick);
  shell.appRoot.addEventListener("change", handleAppChange);
  shell.appRoot.addEventListener("input", handleAppInput);
  shell.appRoot.addEventListener("submit", handleAppSubmit);
  shell.appRoot.addEventListener("keydown", handleAppKeyDown);
  shell.appRoot.addEventListener("dragstart", handleAppDragStart);
  shell.appRoot.addEventListener("dragover", handleAppDragOver);
  shell.appRoot.addEventListener("drag", handleAppDragMove);
  shell.appRoot.addEventListener("drop", handleAppDrop);
  shell.appRoot.addEventListener("dragend", handleAppDragEnd);
  ensureSelectedProductForStage();
  subscribe(() => renderApp(shell));
  renderApp(shell);
}

function getShellElements() {
  const appRoot = document.getElementById("app-root");
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("app-sidebar");
  const productPanel = document.getElementById("app-product-panel");
  const workspace = document.getElementById("app-workspace");
  const contextPanel = document.getElementById("app-context-panel");

  if (!appRoot || !header || !sidebar || !productPanel || !workspace || !contextPanel) return null;
  return { appRoot, header, sidebar, productPanel, workspace, contextPanel };
}

function renderApp(shell) {
  if (!isAuthenticated()) {
    renderLoginPage(shell);
    return;
  }

  clearLoginPage(shell);
  if (uiState.activeView === "pipeline") ensureSelectedProductForStage();
  renderHeader(shell.header);
  renderSidebar(shell.sidebar);
  renderProductPanel(shell.productPanel);
  renderWorkspace(shell.workspace);
  renderContextPanel(shell.contextPanel);
}
function renderHeader(header) {
  replaceChildren(header, renderTopActions());
}

function renderTopActions() {
  const currentUser = getCurrentTeamUser();
  const role = currentUser?.role ?? getCurrentUserRole();
  return createElement("div", { className: "app-top-actions", ariaLabel: "Account actions" }, [
    createElement("span", { className: "app-top-actions__user" }, [
      createElement("strong", null, currentUser?.name ?? authSession?.name ?? ADMIN_OWNER_CREDENTIALS.name),
      createElement("span", null, role),
    ]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "open-settings", ariaLabel: "Open settings" }, [createIcon("settings")]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "open-profile", ariaLabel: "Open profile" }, [createIcon("account_circle")]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "logout", ariaLabel: "Log out" }, [createIcon("logout")]),
  ]);
}
function renderLoginPage(shell) {
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    element.hidden = true;
  });

  const existingLogin = shell.appRoot.querySelector(".login-page");
  if (existingLogin) existingLogin.remove();

  shell.appRoot.appendChild(createElement("section", { className: "login-page", ariaLabel: "LaunchFlow sign in" }, [
    createElement("div", { className: "login-card" }, [
      createElement("aside", { className: "login-card__brand" }, [
        createElement("div", { className: "login-card__logo-row" }, [
          createIcon("deployed_code"),
          createElement("strong", null, "SupplySync Pro"),
        ]),
        createElement("h1", null, "Master Your Supply Chain Pipeline"),
        createElement("p", null, "Gain absolute clarity over complex product launches with a high-velocity tracking workspace designed for professional Amazon sellers."),
        createElement("div", { className: "login-card__preview", ariaHidden: "true" }, [
          createElement("div", { className: "login-preview__sidebar" }, ["Dashboard", "Sourcing", "Shipping", "Listing", "Scaling"].map((label) => createElement("span", null, label))),
          createElement("div", { className: "login-preview__content" }, [
            createElement("strong", null, "Product Launch Dashboard Overview"),
            createElement("div", { className: "login-preview__metrics" }, ["142", "45", "78", "14.5%"].map((value) => createElement("span", null, value))),
            createElement("div", { className: "login-preview__bars" }, [1, 2, 3, 4].map((index) => createElement("span", { style: { width: `${46 + index * 11}%` } }, ""))),
          ]),
        ]),
      ]),
      createElement("form", { className: "login-card__form", dataAction: "login", ariaLabel: "Sign in form" }, [
        createElement("div", null, [
          createElement("h2", null, "Welcome Back"),
          createElement("p", null, "Sign in to manage your product launch pipeline"),
        ]),
        uiState.authError ? createElement("p", { className: "login-card__error", role: "alert" }, uiState.authError) : null,
        createElement("label", { className: "login-field" }, [
          createElement("span", null, "Email Address"),
          createElement("span", { className: "login-field__control" }, [
            createIcon("mail"),
            createElement("input", { type: "email", name: "email", placeholder: "name@company.com", autocomplete: "email", value: uiState.loginDraft.email, dataAction: "update-login-email", required: true }),
          ]),
        ]),
        createElement("label", { className: "login-field" }, [
          createElement("span", { className: "login-field__label-row" }, [
            createElement("span", null, "Password"),
            createElement("button", { type: "button", dataAction: "forgot-password", className: "login-link" }, "Forgot password?"),
          ]),
          createElement("span", { className: "login-field__control" }, [
            createIcon("lock"),
            createElement("input", { type: uiState.showLoginPassword ? "text" : "password", name: "password", placeholder: "••••••••", autocomplete: "current-password", value: uiState.loginDraft.password, dataAction: "update-login-password", required: true }),
            createElement("button", { className: "login-field__toggle", type: "button", dataAction: "toggle-login-password", ariaLabel: uiState.showLoginPassword ? "Hide password" : "Show password" }, [createIcon(uiState.showLoginPassword ? "visibility_off" : "visibility")]),
          ]),
        ]),
        createElement("label", { className: "login-remember" }, [
          createElement("input", { type: "checkbox", name: "remember", checked: uiState.loginDraft.remember, dataAction: "update-login-remember" }),
          createElement("span", null, "Remember this device"),
        ]),
        createElement("button", { className: "login-submit", type: "submit" }, [createElement("span", null, "Sign In"), createIcon("arrow_forward")]),
        createElement("p", { className: "login-card__security" }, [createIcon("lock"), createElement("span", null, "Centralized access for Admin, User, and Viewer roles.")]),
      ].filter(Boolean)),
    ].filter(Boolean)),
    createElement("footer", { className: "login-footer" }, [
      createElement("strong", null, "SupplySync Pro"),
      createElement("span", null, "© 2026 SupplySync Pro Logistics. All rights reserved."),
      createElement("span", null, "Privacy Policy · Terms of Service · Security Architecture"),
    ]),
  ]));
}

function clearLoginPage(shell) {
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    element.hidden = false;
  });
  shell.appRoot.querySelector(".login-page")?.remove();
}

function renderSidebar(sidebar) {
  replaceChildren(
    sidebar,
    createElement("div", { className: "sidebar-brand" }, [
      createElement("h1", { className: "sidebar-brand__title" }, "LaunchPad Pro"),
      createElement("p", { className: "sidebar-brand__subtitle" }, "Amazon Seller Tools"),
    ]),
    createElement("nav", { className: "sidebar-menu", ariaLabel: "Primary navigation" }, [
      createElement("button", { className: "sidebar-tab sidebar-tab--dashboard", type: "button", dataAction: "open-pipeline" }, [
        createIcon("dashboard"),
        createElement("span", null, "Dashboard"),
      ]),
    ]),
    createElement("div", { className: "sidebar-section-heading" }, [
      createElement("span", { className: "sidebar-section-label" }, "Pipeline Stages"),
      canEditPipelineTabs() ? createElement("span", { className: "sidebar-section-actions" }, [
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "toggle-stage-editor", ariaLabel: "Edit pipeline stages" }, [createIcon("edit")]),
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "recover-stages", ariaLabel: "Recover deleted pipeline stages" }, [createIcon("restore")]),
      ]) : null,
    ]),
    uiState.stageEditorOpen && canEditPipelineTabs() ? renderStageEditorPanel() : null,
    createElement("nav", { className: "sidebar-tabs", ariaLabel: "Pipeline stages" },
      getSidebarStageTabs().map((stageTab) =>
        createElement("button", {
          className: `sidebar-tab ${uiState.activeView === "pipeline" && stageTab.id === uiState.selectedStageId ? "sidebar-tab--active" : ""}`,
          type: "button",
          dataAction: "select-stage",
          dataStageId: stageTab.id,
          dataProductDropStageId: stageTab.id,
          ariaCurrent: uiState.activeView === "pipeline" && stageTab.id === uiState.selectedStageId ? "page" : null,
        }, [
          createIcon(stageTab.icon),
          createElement("span", null, stageTab.label),
        ]),
      ),
    ),
    canEditPipelineTabs() ? renderAddStageButton() : null,
    renderAddStageModal(),
  );
}

function renderStageEditorPanel() {
  const visibleTabs = getSidebarStageTabs();
  const hiddenTabs = getHiddenSidebarStageTabs();

  return createElement("section", { className: "stage-editor", ariaLabel: "Edit pipeline stage tabs" }, [
    createElement("p", { className: "stage-editor__note" }, "Rename or reorder tabs here. Delete is locked while a stage still has product/data references."),
    ...visibleTabs.map((stageTab) => renderStageEditorRow(stageTab)),
    hiddenTabs.length > 0
      ? createElement("div", { className: "stage-editor__recover-list" }, [
        createElement("strong", null, "Deleted stages"),
        ...hiddenTabs.map((stageTab) => createElement("button", { className: "stage-editor__recover", type: "button", dataAction: "recover-stage", dataStageId: stageTab.id }, [
          createIcon("restore"),
          createElement("span", null, stageTab.label),
        ])),
      ])
      : null,
  ].filter(Boolean));
}

function renderStageEditorRow(stageTab) {
  const deleteWarning = getStageDeleteWarning(stageTab.id);

  return createElement("div", { className: "stage-editor__row", dataStageDropId: stageTab.id }, [
    createElement("button", {
      className: "stage-editor__drag-handle",
      type: "button",
      draggable: true,
      dataAction: "drag-stage",
      dataStageId: stageTab.id,
      ariaLabel: `Drag ${stageTab.label} to reorder`,
      title: `Drag ${stageTab.label} to reorder`,
    }, [createIcon("drag_indicator")]),
    createElement("input", {
      className: "stage-editor__input",
      type: "text",
      value: stageTab.label,
      dataAction: "rename-stage",
      dataStageId: stageTab.id,
      ariaLabel: `Rename ${stageTab.label}`,
    }),
    createElement("button", { className: "stage-editor__icon stage-editor__icon--danger", type: "button", dataAction: "delete-stage", dataStageId: stageTab.id, disabled: Boolean(deleteWarning), title: deleteWarning || `Delete ${stageTab.label}`, ariaLabel: `Delete ${stageTab.label}` }, [createIcon("delete")]),
    deleteWarning ? createElement("p", { className: "stage-editor__warning" }, deleteWarning) : null,
  ].filter(Boolean));
}

function renderAddStageButton() {
  return createElement("button", { className: "sidebar-add-stage", type: "button", dataAction: "open-add-stage-modal", ariaLabel: "Add new pipeline stage" }, [
    createIcon("add"),
    createElement("span", null, "Add New Stage"),
  ]);
}

function renderAddStageModal() {
  if (!uiState.addStageModalOpen) return null;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "create-stage", role: "dialog", ariaModal: "true", ariaLabel: "Add new pipeline stage" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Add New Stage"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-add-stage-modal", ariaLabel: "Close add stage form" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Stage Name"),
        createElement("input", { className: "form-input", name: "stageName", type: "text", placeholder: "Example: Quality Review", required: true }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-add-stage-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Create Stage"),
      ]),
    ]),
  ]);
}

function renderSettingsCategoryPanel(productPanel) {
  const categories = getVisibleSettingsCategories();
  replaceChildren(productPanel, createElement("aside", { className: "settings-category-panel", ariaLabel: "Settings categories" }, [
    createElement("h2", { className: "product-panel__title" }, "Settings"),
    createElement("p", { className: "settings-category-panel__note" }, "Manage profile, access, and workspace preferences."),
    categories.map((category) => createElement("button", {
      className: `settings-category ${category.id === uiState.settingsCategory ? "settings-category--active" : ""}`,
      type: "button",
      dataAction: "select-settings-category",
      dataSettingsCategory: category.id,
      ariaCurrent: category.id === uiState.settingsCategory ? "page" : null,
    }, [createIcon(category.icon), createElement("span", null, category.label)])),
  ]));
}

function renderSettingsWorkspace(workspace) {
  if (!canViewSettingsCategory(uiState.settingsCategory)) uiState.settingsCategory = getDefaultSettingsCategory();

  if (uiState.settingsCategory === "users") {
    renderUserManagementWorkspace(workspace);
    return;
  }

  if (uiState.settingsCategory === "profile") {
    replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: "Profile settings" }, [
      createElement("div", { className: "settings-workspace__header" }, [
        createElement("div", null, [
          createElement("p", { className: "workspace-detail__eyebrow" }, "Settings / Profile"),
          createElement("h2", null, "Profile"),
          createElement("p", null, "Review the signed-in workspace owner and access level."),
        ]),
      ]),
      renderSettingsProfileCard(),
    ]));
    return;
  }

  replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: `${getSettingsCategoryLabel(uiState.settingsCategory)} settings` }, [
    createElement("div", { className: "settings-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Settings"),
        createElement("h2", null, getSettingsCategoryLabel(uiState.settingsCategory)),
        createElement("p", null, "This settings area is ready for the next configuration controls."),
      ]),
    ]),
    createElement("section", { className: "settings-placeholder-card" }, [
      createIcon("settings"),
      createElement("strong", null, `${getSettingsCategoryLabel(uiState.settingsCategory)} settings coming next`),
      createElement("p", null, "We started the structure now so permissions and login can connect cleanly later."),
    ]),
  ]));
}

function renderUserManagementWorkspace(workspace) {
  const filteredUsers = getFilteredTeamUsers();
  const activeUsers = teamUsers.filter((user) => user.status === "Active").length;
  const manualUsers = teamUsers.length;

  replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: "User management settings" }, [
    createElement("div", { className: "settings-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Settings / User Management"),
        createElement("h2", null, "User Management"),
        createElement("p", null, "Manually grant access by creating an email, password, and ADMIN, USER, or VIEWER access level. No invitation email is required."),
      ]),
      canManageUsers() ? createElement("button", { className: "button-primary settings-invite-button", type: "button", dataAction: "open-invite-user" }, [createIcon("person_add"), createElement("span", null, "Grant Access")]) : null,
    ].filter(Boolean)),
    uiState.settingsUserNotice ? createElement("p", { className: "settings-user-notice", role: "status" }, uiState.settingsUserNotice) : null,
    createElement("div", { className: "settings-stat-grid settings-stat-grid--simple" }, [
      renderSettingsStat("Active Users", String(activeUsers)),
      renderSettingsStat("Manual Accounts", String(manualUsers)),
    ]),
    renderTeamUsersTable(filteredUsers),
    renderInviteUserModal(),
  ].filter(Boolean)));
}

function renderSettingsStat(label, value, suffix = "") {
  return createElement("article", { className: "settings-stat-card" }, [
    createElement("span", null, label),
    createElement("strong", null, [value, suffix ? createElement("small", null, ` ${suffix}`) : null]),
  ]);
}

function renderTeamUsersTable(users) {
  return createElement("section", { className: "settings-users-card" }, [
    createElement("div", { className: "settings-users-card__toolbar" }, [
      createElement("strong", null, "Team Members"),
      createElement("label", { className: "settings-user-search" }, [
        createIcon("search"),
        createElement("input", { type: "search", value: uiState.settingsUserSearchQuery, dataAction: "update-team-search", placeholder: "Search team members...", ariaLabel: "Search team members" }),
      ]),
      createElement("span", null, `Showing ${users.length} of ${teamUsers.length} team members`),
    ]),
    createElement("div", { className: "settings-users-table" }, [
      createElement("div", { className: "settings-users-table__head" }, ["Name", "Email", "Role/Access Level", "Status", "Actions"].map((label) => createElement("span", null, label))),
      ...users.map((user) => createElement("div", { className: "settings-users-table__row" }, [
        createElement("span", { className: "settings-user-name" }, [createElement("span", { className: "settings-user-avatar" }, getTeamUserInitials(user.name)), createElement("strong", null, user.name)]),
        createElement("span", null, user.email),
        createElement("span", { className: "settings-role-pill" }, user.role),
        createElement("span", { className: `settings-status settings-status--${user.status === "Active" ? "active" : "pending"}` }, [createElement("span", null, ""), user.status]),
        createElement("span", { className: "settings-user-actions" }, canManageUsers() ? [
          createElement("button", { type: "button", dataAction: "edit-team-user", dataUserId: user.id, ariaLabel: `Edit ${user.name}` }, [createIcon("edit")]),
          user.email === ADMIN_OWNER_CREDENTIALS.email ? null : createElement("button", { type: "button", dataAction: "delete-team-user", dataUserId: user.id, ariaLabel: `Remove ${user.name}` }, [createIcon("delete")]),
        ].filter(Boolean) : [createElement("span", null, "View only")]),
      ])),
    ]),
  ]);
}

function renderSettingsProfileCard() {
  const currentUser = getCurrentTeamUser();
  const avatarContent = currentUser?.avatarDataUrl
    ? createElement("img", { src: currentUser.avatarDataUrl, alt: `${currentUser.name} avatar` })
    : getTeamUserInitials(currentUser?.name ?? "User");

  return createElement("section", { className: "settings-profile-card" }, [
    createElement("div", { className: "settings-profile-card__avatar-block" }, [
      createElement("span", { className: "settings-profile-card__avatar" }, avatarContent),
      createElement("label", { className: "settings-profile-card__upload" }, [
        createIcon("photo_camera"),
        createElement("span", null, "Upload Avatar"),
        createElement("input", { type: "file", accept: "image/*", dataAction: "upload-profile-avatar", ariaLabel: "Upload profile avatar" }),
      ]),
    ]),
    createElement("div", { className: "settings-profile-card__content" }, [
      createElement("p", { className: "workspace-detail__eyebrow" }, "Your Profile"),
      createElement("h3", null, currentUser?.name ?? "Workspace User"),
      createElement("p", null, currentUser?.email ?? authSession?.email ?? "admin@example.com"),
      createElement("span", { className: "settings-role-pill" }, currentUser?.role ?? getCurrentUserRole()),
    ]),
    createElement("div", { className: "settings-profile-card__fields" }, [
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Display Name"), createElement("input", { className: "form-input", type: "text", value: currentUser?.name ?? "Workspace User", disabled: true })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Job Title"), createElement("input", { className: "form-input", type: "text", value: currentUser?.jobTitle ?? "Team Member", disabled: true })]),
    ]),
  ]);
}

function renderInviteUserModal() {
  if (!uiState.settingsInviteModalOpen) return null;

  const editingUser = uiState.editingTeamUserId ? teamUsers.find((user) => user.id === uiState.editingTeamUserId) : null;
  const isEditing = Boolean(editingUser);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "invite-user",
      dataUserId: editingUser?.id ?? null,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: isEditing ? "Edit manual access" : "Grant manual access",
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, isEditing ? "Edit Manual Access" : "Grant Manual Access"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-invite-user", ariaLabel: "Close manual access dialog" }, [createIcon("close")]),
      ]),
      createElement("p", { className: "settings-invite-help" }, "Create the email, password, and access level here. The user can log in immediately with those credentials—no invite email or acceptance link is required."),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Full Name"), createElement("input", { className: "form-input", name: "userName", type: "text", placeholder: "Example: Sarah Lopez", value: editingUser?.name ?? "", required: true })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Email"), createElement("input", { className: "form-input", name: "userEmail", type: "email", placeholder: "name@example.com", value: editingUser?.email ?? "", required: true, disabled: editingUser?.email === ADMIN_OWNER_CREDENTIALS.email })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Role / Access Level"), createElement("select", { className: "form-input", name: "userRole", disabled: editingUser?.email === ADMIN_OWNER_CREDENTIALS.email }, USER_ROLES.map((role) => createElement("option", { value: role, selected: role === (editingUser?.role ?? "USER") }, role)))]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, isEditing ? "New Password (optional)" : "Password"), createElement("input", { className: "form-input", name: "userPassword", type: "password", placeholder: isEditing ? "Leave blank to keep current password" : "Create a password", required: !isEditing })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Job Title"), createElement("input", { className: "form-input", name: "userJobTitle", type: "text", placeholder: "Example: Research Lead", value: editingUser?.jobTitle ?? "" })]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-invite-user" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, isEditing ? "Save Access" : "Grant Access"),
      ]),
    ]),
  ]);
}

function renderProductPanel(productPanel) {
  if (uiState.activeView === "settings") {
    renderSettingsCategoryPanel(productPanel);
    return;
  }

  const selectedTab = getSelectedStageTab();
  const selectedProducts = getProductsForSelectedTab(selectedTab.id);

  replaceChildren(
    productPanel,
    createElement("div", { className: "product-panel" }, [
      createElement("h2", { className: "product-panel__title" }, selectedTab.panelLabel),
      renderPipelineSummaryCards(selectedTab, selectedProducts),
      createElement("label", { className: "product-search" }, [
        createIcon("search"),
        createElement("span", { className: "app-header__search-label" }, "Search products"),
        createElement("input", {
          className: "product-search__input",
          type: "search",
          placeholder: "Search products...",
          ariaLabel: "Search products",
        }),
      ]),
      createElement("div", { className: "product-panel__meta" }, [
        createElement("span", null, `${selectedProducts.length} Products`),
        createIcon("filter_list"),
      ]),
      selectedProducts.length > 0
        ? createElement(
          "div",
          { className: "product-list" },
          selectedProducts.map((product) => renderProductCard(product, product.id === uiState.selectedProductId)),
        )
        : renderEmptyProductList(selectedTab),
      renderAddProductButton(selectedTab),
      renderAddProductModal(selectedTab),
    ]),
  );
}

function renderPipelineSummaryCards(selectedTab, selectedProducts) {
  const totalProductCount = getAllProducts().length;
  const selectedProductShare = formatProductShare(selectedProducts.length, totalProductCount);

  return createElement("section", { className: "pipeline-summary", ariaLabel: "Pipeline product totals" }, [
    createElement("article", { className: "pipeline-summary-card pipeline-summary-card--active" }, [
      createElement("span", { className: "pipeline-summary-card__label" }, selectedTab.label),
      createElement("span", { className: "pipeline-summary-card__value-row" }, [
        createElement("strong", { className: "pipeline-summary-card__value" }, String(selectedProducts.length)),
        createElement("span", { className: "pipeline-summary-card__percent" }, selectedProductShare),
      ]),
      createElement("span", { className: "pipeline-summary-card__hint" }, "in this stage"),
    ]),
    createElement("article", { className: "pipeline-summary-card" }, [
      createElement("span", { className: "pipeline-summary-card__label" }, "Total Products"),
      createElement("strong", { className: "pipeline-summary-card__value" }, String(totalProductCount)),
      createElement("span", { className: "pipeline-summary-card__hint" }, "across all stages"),
    ]),
  ]);
}

function formatProductShare(selectedCount, totalCount) {
  if (totalCount <= 0) return "0%";
  return `${Math.round((selectedCount / totalCount) * 100)}%`;
}

function renderProductCard(product, isSelected = false) {
  const checklistReadiness = calculateProductChecklistReadiness(product);

  return createElement("article", {
    className: `product-card ${isSelected ? "product-card--selected" : ""}`,
    ariaCurrent: isSelected ? "true" : null,
    draggable: canMoveProducts(),
    dataAction: canMoveProducts() ? "drag-product" : null,
    dataProductId: product.id,
  }, [
    createElement("button", {
      className: "product-card__select",
      type: "button",
      dataAction: "select-product",
      dataProductId: product.id,
      ariaLabel: `Open ${product.name}`,
    }, [
      renderProductThumbnail(product, "product-card__icon"),
      createElement("span", { className: "product-card__body" }, [
        createElement("strong", null, product.name),
        createElement("span", { className: "product-card__meta-row" }, [
          createElement("span", null, "ASIN:"),
          renderProductCardAsin(product),
        ]),
      ]),
    ]),
    createElement("span", { className: "product-card__divider" }),
    createElement("span", { className: "product-card__footer" }, [
      canManageProducts() ? createElement("span", { className: "product-card__actions" }, [
        createElement("button", { className: "product-card__action", type: "button", dataAction: "edit-product", dataProductId: product.id, ariaLabel: `Edit ${product.name}` }, [createIcon("edit")]),
        createElement("button", { className: "product-card__action product-card__action--danger", type: "button", dataAction: "delete-product", dataProductId: product.id, ariaLabel: `Delete ${product.name}` }, [createIcon("delete")]),
      ]) : null,
      canMoveProducts() && checklistReadiness >= 100 && getNextProductStageId(product)
        ? createElement("button", { className: "product-card__next-stage", type: "button", dataAction: "move-product-next-stage", dataProductId: product.id, ariaLabel: `Move ${product.name} to the next stage` }, "Move to the Next Stage")
        : createElement("span", { className: "product-card__status" }, `${checklistReadiness}% Ready`),
    ]),
  ].filter(Boolean));
}

function renderProductCardAsin(product) {
  if (!product.asin) return createElement("span", null, "N/A");
  return createElement("a", { className: "product-card__asin-link", href: getAmazonListingUrl(product.asin), target: "_blank", rel: "noreferrer" }, product.asin);
}

function calculateProductChecklistReadiness(product) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const tasks = Object.values(productDetails.stages ?? {}).flatMap((stageDetails) => stageDetails.checklistTasks ?? []);
  if (tasks.length === 0) return 0;

  const completedTasks = tasks.filter((task) => task.isCompleted).length;
  return Math.round((completedTasks / tasks.length) * 100);
}

function renderEmptyProductList(selectedTab) {
  return createElement("article", { className: "product-empty" }, [
    createElement("strong", null, "No products in this stage yet"),
    createElement("span", null, `${selectedTab.label} currently has 0 products.`),
  ]);
}

function renderAddProductButton(selectedTab) {
  if (!canManageProducts()) return null;
  return createElement("button", {
    className: "add-product-button",
    type: "button",
    dataAction: "open-add-product-modal",
    ariaLabel: `Add product to ${selectedTab.label}`,
  }, [
    createIcon("add"),
    createElement("span", null, `Add Product to ${selectedTab.label}`),
  ]);
}

function renderAddProductModal(selectedTab) {
  if (!uiState.addProductModalOpen) return null;

  const editingProduct = getEditableProduct(uiState.editingProductId);
  const modalTitle = editingProduct ? `Edit ${editingProduct.name}` : `Add Product to ${selectedTab.label}`;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog add-product-modal",
      dataAction: "create-product",
      dataStageId: editingProduct?.stageId ?? selectedTab.id,
      dataProductId: editingProduct?.id ?? null,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-add-product-modal", ariaLabel: "Close add product form" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Image"),
        createElement("input", { className: "form-input", name: "productImage", type: "file", accept: "image/*" }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Name"),
        createElement("input", { className: "form-input", name: "productName", type: "text", placeholder: "Example: Stainless Steel Bottle", value: editingProduct?.name ?? "", required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "SKU"),
        createElement("input", { className: "form-input", name: "productSku", type: "text", placeholder: "N/A if blank", value: editingProduct?.sku ?? "" }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "ASIN"),
        createElement("input", { className: "form-input", name: "productAsin", type: "text", placeholder: "N/A if blank", value: editingProduct?.asin ?? "" }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-add-product-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, editingProduct ? "Save Product" : "Create Product"),
      ]),
    ]),
  ]);
}

function getProductsForSelectedTab(selectedStageId) {
  const products = getAllProducts();
  if (selectedStageId === "optimization") {
    return products.filter((product) => product.stageId === "optimization" || ["stable", "scaling"].includes(product.stageId));
  }

  return products.filter((product) => product.stageId === selectedStageId);
}

function getAllProducts() {
  const deletedProductIds = new Set(productSettings.deletedProductIds);
  const editedDummyProducts = DUMMY_PRODUCTS
    .filter((product) => !deletedProductIds.has(product.id))
    .map((product) => ({ ...product, ...(productSettings.edits[product.id] ?? {}) }));
  return [...editedDummyProducts, ...userProducts];
}

function getSelectedStageTab() {
  return SIDEBAR_STAGE_TABS.find((stageTab) => stageTab.id === uiState.selectedStageId) ?? SIDEBAR_STAGE_TABS[0];
}

function renderWorkspace(workspace) {
  if (uiState.activeView === "settings") {
    renderSettingsWorkspace(workspace);
    return;
  }

  const selectedProduct = getSelectedProduct();

  if (!selectedProduct) {
    replaceChildren(workspace, renderWorkspaceEmptyState());
    return;
  }

  const visibleStages = getWorkspaceStagesForDemoProduct(selectedProduct);
  const currentStage = visibleStages.at(-1);

  replaceChildren(
    workspace,
    createElement("section", { className: "workspace-detail", ariaLabel: `${selectedProduct.name} stage details` }, [
      createElement("div", { className: "workspace-detail__header" }, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Product workspace"),
      ]),
      renderWorkspaceProductOverview(selectedProduct),
      createElement("div", { className: "workspace-stage-list" },
        visibleStages.map((stage) => renderWorkspaceStageDropdown(selectedProduct, stage)),
      ),
      createElement("p", { className: "workspace-detail__note" }, "Future stages stay hidden until this product reaches them, so each product only shows the stage details it is ready to work on."),
      renderWorkspaceFieldModal(),
      renderPaymentStatusModal(),
      renderChecklistNoteModal(),
      renderProductChatModal(),
    ].filter(Boolean)),
  );
}

function renderWorkspaceProductOverview(product) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const imageDataUrl = productDetails.imageDataUrl;
  const fileInputId = `product-image-upload-${product.id}`;

  return createElement("section", { className: "workspace-product-card", ariaLabel: `${product.name} overview` }, [
    createElement("button", { className: "workspace-product-card__export-icon", type: "button", dataAction: "export-product-data", dataProductId: product.id, ariaLabel: `Export ${product.name} data` }, [createIcon("ios_share")]),
    createElement("div", { className: "workspace-product-card__media" }, [
      renderProductThumbnail(product, "workspace-product-card__image"),
      canManageProducts()
        ? createElement("div", { className: "workspace-product-card__image-actions" }, [
          createElement("input", {
            className: "workspace-product-card__file",
            id: fileInputId,
            type: "file",
            accept: "image/*",
            dataAction: "upload-product-image",
            dataProductId: product.id,
          }),
          createElement("label", { className: "workspace-product-card__upload", htmlFor: fileInputId }, imageDataUrl ? "Replace Image" : "Upload Image"),
          imageDataUrl
            ? createElement("button", { className: "workspace-product-card__delete", type: "button", dataAction: "delete-product-image", dataProductId: product.id }, "Delete")
            : null,
        ].filter(Boolean))
        : null,
    ]),
    createElement("div", { className: "workspace-product-card__content" }, [
      createElement("div", { className: "workspace-product-card__summary" }, [
        createElement("div", { className: "workspace-product-card__identity" }, [
          createElement("h3", null, product.name),
          renderWorkspaceSkuRow(product),
          createElement("p", null, ["ASIN: ", renderAsinValue(product)]),
        ]),
        renderProductMetricCards(product),
      ]),
    ]),
    createElement("div", { className: "workspace-product-card__actions" }, [
      createElement("button", { className: "button-primary", type: "button", dataAction: "open-product-chat", dataProductId: product.id }, [
        createIcon("chat"),
        createElement("span", null, "Chat"),
      ]),
    ]),
  ]);
}

function renderWorkspaceSkuRow(product) {
  return createElement("p", { className: "workspace-product-card__sku-row" }, [
    createElement("span", null, "SKU: "),
    createElement("span", { className: "workspace-product-card__sku-value", title: product.sku || "N/A" }, product.sku || "N/A"),
    createElement("button", { className: "workspace-product-card__copy-sku", type: "button", dataAction: "copy-product-sku", dataProductId: product.id, ariaLabel: `Copy SKU for ${product.name}` }, [createIcon(uiState.copiedSkuProductId === product.id ? "check" : "content_copy")]),
    uiState.copiedSkuProductId === product.id ? createElement("span", { className: "workspace-product-card__copy-confirmation" }, "Copied") : null,
  ].filter(Boolean));
}

function renderProductMetricCards(product) {
  const targetPrice = getProductTargetPrice(product);
  const cogs = getProductCogs(product);
  const profit = getProductProfit(product);
  const margin = getProductMargin(product);

  return createElement("div", { className: "workspace-product-card__metrics" }, [
    renderProductMetricCard("Target Selling Price", formatCurrency(targetPrice)),
    renderProductMetricCard("COGS", formatCurrency(cogs)),
    renderProductMetricCard("Profit Margin %", `${margin}%`),
    renderProductMetricCard("Profit $", formatCurrency(profit)),
  ]);
}

function renderProductMetricCard(label, value) {
  return createElement("article", { className: "workspace-product-card__metric" }, [
    createElement("span", null, label),
    createElement("strong", null, value),
  ]);
}

function renderProductThumbnail(product, className) {
  const imageDataUrl = getWorkspaceProductDetails(product.id).imageDataUrl;

  if (imageDataUrl) {
    return createElement("span", { className: `${className} product-image-preview` }, [
      createElement("img", { src: imageDataUrl, alt: product.name }),
    ]);
  }

  return createElement("span", { className }, [createIcon("inventory_2")]);
}

function renderWorkspaceEmptyState() {
  return createElement("section", { className: "blank-workspace", ariaLabel: "Selected product details" }, [
    createElement("div", { className: "workspace-empty" }, [
      createElement("h2", null, "Select a product"),
      createElement("p", null, "Choose a product from the pipeline list to customize its visible stage details."),
    ]),
  ]);
}

function renderWorkspaceStageDropdown(product, stage) {
  const stageDetails = getWorkspaceStageDetails(product.id, stage.stage_id);
  const isExpanded = uiState.expandedWorkspaceStageIds.has(stage.stage_id);
  const isActiveStage = stage.stage_id === product.stageId || stage.stage_id === uiState.selectedStageId;
  const stageClassName = [
    "workspace-stage",
    isExpanded ? "workspace-stage--expanded" : "",
    isActiveStage ? "workspace-stage--active" : "",
  ].filter(Boolean).join(" ");

  return createElement("article", { className: stageClassName }, [
    createElement("button", {
      className: "workspace-stage__toggle",
      type: "button",
      dataAction: "toggle-workspace-stage",
      dataStageId: stage.stage_id,
      ariaExpanded: isExpanded ? "true" : "false",
      ariaControls: `workspace-stage-panel-${product.id}-${stage.stage_id}`,
    }, [
      createElement("span", { className: "workspace-stage__index" }, String(getWorkspaceStageDisplayIndex(stage))),
      createElement("span", { className: "workspace-stage__heading" }, [
        createElement("strong", null, stage.label),
        createElement("span", null, getWorkspaceStageStatus(product, stage)),
      ]),
      createIcon(isExpanded ? "expand_less" : "expand_more"),
    ]),
    isExpanded
      ? createElement("div", { className: "workspace-stage__body", id: `workspace-stage-panel-${product.id}-${stage.stage_id}` }, [
        renderWorkspaceCustomFields(product, stage, stageDetails),
        renderWorkspaceAddFieldForm(product, stage),
        renderWorkspaceChecklist(product, stage, stageDetails),
      ])
      : null,
  ]);
}

function renderWorkspaceChecklist(product, stage, stageDetails) {
  const tasks = stageDetails.checklistTasks;
  const completedCount = tasks.filter((task) => task.isCompleted).length;
  const checklistKey = getChecklistCollapseKey(product.id, stage.stage_id);
  const isCollapsed = !uiState.expandedChecklistIds.has(checklistKey);
  const shouldHideCompleted = uiState.hiddenCompletedChecklistIds.has(checklistKey);
  const visibleTasks = shouldHideCompleted ? tasks.filter((task) => !task.isCompleted) : tasks;

  return createElement("section", {
    className: `workspace-checklist ${isCollapsed ? "workspace-checklist--collapsed" : ""}`,
    ariaLabel: `${stage.label} checklist`,
  }, [
    createElement("div", { className: "workspace-checklist__header" }, [
      createElement("button", {
        className: "workspace-checklist__collapse",
        type: "button",
        dataAction: "toggle-workspace-checklist-panel",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        ariaExpanded: isCollapsed ? "false" : "true",
      }, [
        createElement("h3", null, `Pipeline Checklist: ${stage.label}`),
        createElement("span", { className: "workspace-checklist__summary" }, [
          createElement("span", null, `${completedCount}/${tasks.length} complete`),
          createIcon(isCollapsed ? "expand_more" : "expand_less"),
        ]),
      ]),
      createElement("button", {
        className: `workspace-checklist__hide-toggle ${shouldHideCompleted ? "workspace-checklist__hide-toggle--active" : ""}`,
        type: "button",
        dataAction: "toggle-workspace-checklist-completed",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        ariaPressed: shouldHideCompleted ? "true" : "false",
      }, shouldHideCompleted ? "Show done" : "Hide done"),
    ]),
    isCollapsed
      ? null
      : createElement("div", { className: "workspace-checklist__content" }, [
        renderWorkspaceChecklistItems(product, stage, tasks, visibleTasks, shouldHideCompleted),
        renderWorkspaceChecklistForm(product, stage),
      ]),
  ]);
}

function renderWorkspaceChecklistItems(product, stage, tasks, visibleTasks, shouldHideCompleted) {
  if (tasks.length === 0) {
    return createElement("p", { className: "workspace-checklist__empty" }, "No checklist items yet. Add the exact tasks you want to track for this product and stage.");
  }

  if (visibleTasks.length === 0 && shouldHideCompleted) {
    return createElement("p", { className: "workspace-checklist__empty" }, "Completed tasks are hidden. Use Show done to review them again.");
  }

  return createElement("div", { className: "workspace-checklist__items" }, visibleTasks.map((task) => renderWorkspaceChecklistTask(product, stage, task)));
}

function renderWorkspaceChecklistTask(product, stage, task) {
  const canManageTask = canManageChecklistTasks();
  return createElement("article", {
    className: `workspace-checklist__item ${task.isCompleted ? "workspace-checklist__item--complete" : ""}`,
    dataAction: "checklist-drop",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataChecklistDropId: task.taskId,
  }, [
    canManageTask ? createElement("button", {
      className: "workspace-checklist__drag-handle",
      type: "button",
      draggable: true,
      dataAction: "drag-checklist",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Drag ${task.name} to reorder`,
    }, [createIcon("drag_indicator")]) : null,
    createElement("label", { className: "workspace-checklist__task-label" }, [
      createElement("input", {
        type: "checkbox",
        checked: task.isCompleted,
        dataAction: "toggle-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        disabled: !canManageTask,
      }),
      createElement("span", null, task.name),
    ]),
    createElement("span", { className: "workspace-checklist__meta" }, task.isCompleted ? `Completed ${formatCompletionDate(task.completedAt)}` : "In progress"),
    canManageTask ? createElement("button", {
      className: `workspace-checklist__note-button ${task.note ? "workspace-checklist__note-button--active" : ""}`,
      type: "button",
      dataAction: "open-checklist-note",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Edit notes for ${task.name}`,
    }, [createIcon("sticky_note_2")]) : null,
    canManageTask ? createElement("span", { className: "workspace-checklist__actions" }, [
      createElement("button", {
        className: "workspace-checklist__icon-button",
        type: "button",
        dataAction: "edit-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        ariaLabel: `Edit ${task.name}`,
      }, [createIcon("edit")]),
      createElement("button", {
        className: "workspace-checklist__icon-button workspace-checklist__icon-button--danger",
        type: "button",
        dataAction: "delete-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        ariaLabel: `Delete ${task.name}`,
      }, [createIcon("delete")]),
    ]) : null,
  ].filter(Boolean));
}

function renderWorkspaceChecklistForm(product, stage) {
  if (!canManageChecklistTasks()) return null;
  return createElement("form", { className: "workspace-checklist__form", dataAction: "add-workspace-checklist", dataProductId: product.id, dataStageId: stage.stage_id }, [
    createElement("input", { className: "form-input", name: "taskName", type: "text", placeholder: "Add a checklist task...", required: true }),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Task"),
  ]);
}

function renderChecklistNoteModal() {
  if (!uiState.checklistNoteModal) return null;

  const { productId, stageId, checklistId } = uiState.checklistNoteModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const task = stageDetails.checklistTasks.find((item) => item.taskId === checklistId);
  if (!task) return null;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "save-checklist-note",
      dataProductId: productId,
      dataStageId: stageId,
      dataChecklistId: checklistId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: `Checklist notes for ${task.name}`,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Checklist Notes"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-checklist-note", ariaLabel: "Close checklist notes" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, task.name),
        createElement("textarea", { className: "form-input workspace-field__textarea", name: "taskNote", rows: 5, placeholder: "Add notes for this checklist item...", value: task.note ?? "" }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-checklist-note" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Notes"),
      ]),
    ]),
  ]);
}

function renderProductChatModal() {
  const productId = uiState.activeChatProductId;
  const product = getProductById(productId);
  if (!product) return null;

  const chatMessages = getWorkspaceProductDetails(product.id).chatMessages ?? [];
  const filteredChatMessages = getFilteredChatMessages(chatMessages, uiState.chatSearchQuery);
  const assets = getFilteredChatAssets(getProductChatAssets(chatMessages), uiState.chatSearchQuery);
  const fileInputId = `chat-file-input-${product.id}`;

  return createElement("div", { className: "product-chat-modal", role: "presentation" }, [
    createElement("section", { className: "product-chat", role: "dialog", ariaModal: "true", ariaLabel: `${product.name} chat` }, [
      createElement("header", { className: "product-chat__header" }, [
        createElement("div", { className: "product-chat__product" }, [
          renderProductThumbnail(product, "product-chat__avatar"),
          createElement("div", null, [
            createElement("h2", null, product.name),
            createElement("p", { className: "product-chat__meta" }, ["SKU: ", product.sku || "N/A"]),
            createElement("p", { className: "product-chat__meta" }, ["ASIN: ", renderAsinValue(product)]),
          ]),
        ]),
        createElement("div", { className: "product-chat__tools" }, [
          createElement("button", { className: "product-chat__tool", type: "button", ariaLabel: "Call placeholder" }, [createIcon("call")]),
          createElement("button", { className: "product-chat__tool", type: "button", ariaLabel: "Video placeholder" }, [createIcon("videocam")]),
          createElement("button", { className: `product-chat__tool ${uiState.chatAssetsOpen ? "product-chat__tool--active" : ""}`, type: "button", dataAction: "toggle-chat-assets", ariaLabel: "Review chat files and links" }, [createIcon("folder")]),
          createElement("button", { className: `product-chat__tool ${uiState.chatSearchOpen ? "product-chat__tool--active" : ""}`, type: "button", dataAction: "toggle-chat-search", ariaLabel: "Search this product chat" }, [createIcon("search")]),
          createElement("button", { className: "product-chat__tool", type: "button", dataAction: "close-product-chat", ariaLabel: "Close chat" }, [createIcon("close")]),
        ]),
      ]),
      uiState.chatSearchOpen ? renderProductChatSearch(filteredChatMessages.length, chatMessages.length, assets.length) : null,
      createElement("div", { className: "product-chat__body" }, [
        createElement("main", { className: "product-chat__messages", ariaLabel: `${product.name} chat history` }, [
          createElement("span", { className: "product-chat__date" }, formatChatDate(filteredChatMessages[0]?.createdAt ?? chatMessages[0]?.createdAt ?? new Date().toISOString())),
          chatMessages.length === 0
            ? createElement("p", { className: "product-chat__empty" }, "No chat history yet. Send a note, link, image, video, or file for this product.")
            : filteredChatMessages.length === 0
              ? createElement("p", { className: "product-chat__empty" }, "No chat messages or files match that search.")
              : filteredChatMessages.map((message) => renderProductChatMessage(message)),
        ]),
      ]),
      renderProductChatComposer(product, fileInputId),
      renderChatAttachmentPreview(chatMessages),
    ]),
    uiState.chatAssetsOpen ? renderProductChatAssetsPanel(assets) : null,
  ]);
}

function renderProductChatSearch(matchCount, totalCount, assetCount) {
  return createElement("div", { className: "product-chat-search" }, [
    createIcon("search"),
    createElement("input", { className: "product-chat-search__input", type: "search", value: uiState.chatSearchQuery, placeholder: "Search messages, PDFs, images, videos, or links...", dataAction: "update-chat-search", ariaLabel: "Search this product chat" }),
    createElement("span", { className: "product-chat-search__meta" }, uiState.chatSearchQuery ? `${matchCount}/${totalCount} chats · ${assetCount} files/links` : "Search all chat history and files"),
    uiState.chatSearchQuery ? createElement("button", { className: "product-chat-search__clear", type: "button", dataAction: "clear-chat-search", ariaLabel: "Clear chat search" }, [createIcon("close")]) : null,
  ].filter(Boolean));
}

function renderProductChatMessage(message) {
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const messageClass = `product-chat-message product-chat-message--${message.sender === "user" ? "user" : "partner"}`;

  return createElement("article", { className: messageClass }, [
    message.sender === "partner" ? createElement("span", { className: "product-chat-message__avatar" }, "S") : null,
    createElement("div", { className: "product-chat-message__content" }, [
      message.text ? createElement("div", { className: "product-chat-message__bubble" }, renderChatText(message.text)) : null,
      hasAttachments ? createElement("div", { className: "product-chat-message__attachments" }, message.attachments.map(renderChatAttachment)) : null,
      createElement("time", { className: "product-chat-message__time", dateTime: message.createdAt }, formatChatTime(message.createdAt)),
    ].filter(Boolean)),
  ].filter(Boolean));
}

function isSafeExternalUrl(url) {
  try {
    const parsedUrl = new URL(normalizeChatUrl(url));
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function normalizeChatUrl(url) {
  const cleanUrl = String(url ?? "").replace(/[),.;!?]+$/, "");
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
}

function renderChatText(text) {
  return String(text).split("\n").map((line) => renderChatTextLine(line));
}

function renderChatTextLine(line) {
  const cleanLine = String(line);
  const isBullet = cleanLine.trimStart().startsWith("•");
  const lineContent = isBullet ? cleanLine.trimStart().slice(1).trimStart() : cleanLine;
  return createElement("div", { className: `product-chat-message__line ${isBullet ? "product-chat-message__line--bullet" : ""}` }, renderChatInlineText(lineContent || " "));
}

function renderChatInlineText(text) {
  const nodes = [];
  const pattern = /((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)|\*\*([^*]+)\*\*|_([^_]+)_/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(createElement("span", null, text.slice(lastIndex, match.index)));
    if (match[1]) {
      const safeHref = normalizeChatUrl(match[1]);
      nodes.push(isSafeExternalUrl(match[1])
        ? createElement("a", { href: safeHref, target: "_blank", rel: "noopener noreferrer" }, match[1])
        : createElement("span", null, match[1]));
    } else if (match[2]) {
      nodes.push(createElement("strong", null, match[2]));
    } else if (match[3]) {
      nodes.push(createElement("em", null, match[3]));
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(createElement("span", null, text.slice(lastIndex)));
  return nodes.length > 0 ? nodes : [createElement("span", null, text)];
}

function renderChatAttachment(attachment) {
  if (attachment.type?.startsWith("image/")) {
    return createElement("figure", { className: "product-chat-attachment product-chat-attachment--media" }, [
      createElement("button", { className: "product-chat-attachment__preview", type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId, ariaLabel: `Enlarge ${attachment.name}` }, [
        createElement("img", { src: attachment.dataUrl, alt: attachment.name }),
      ]),
      createElement("figcaption", null, attachment.name),
    ]);
  }

  if (attachment.type?.startsWith("video/")) {
    return createElement("figure", { className: "product-chat-attachment product-chat-attachment--media" }, [
      createElement("button", { className: "product-chat-attachment__preview", type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId, ariaLabel: `Enlarge ${attachment.name}` }, [
        createElement("video", { src: attachment.dataUrl, preload: "metadata" }),
      ]),
      createElement("figcaption", null, attachment.name),
    ]);
  }

  return createElement("a", { className: "product-chat-attachment product-chat-attachment--file", href: attachment.dataUrl, download: attachment.name }, [
    createIcon("description"),
    createElement("span", null, [
      createElement("strong", null, attachment.name),
      createElement("small", null, `${formatFileSize(attachment.size)} · ${attachment.type || "File"}`),
    ]),
    createIcon("download"),
  ]);
}

function renderProductChatAssetsPanel(assets) {
  const groupedAssets = groupProductChatAssets(assets);
  return createElement("aside", { className: "product-chat-assets", ariaLabel: "Chat files and links" }, [
    createElement("div", { className: "product-chat-assets__header" }, [
      createElement("h3", null, "Files & Links"),
      createElement("button", { className: "product-chat-assets__close", type: "button", dataAction: "close-chat-assets", ariaLabel: "Close files and links" }, [createIcon("close")]),
    ]),
    uiState.chatSearchQuery ? createElement("p", { className: "product-chat-assets__filter-note" }, `Filtered by “${uiState.chatSearchQuery}”`) : null,
    [
      renderProductChatAssetGroup("Images", groupedAssets.images, "image"),
      renderProductChatAssetGroup("Videos", groupedAssets.videos, "movie"),
      renderProductChatAssetGroup("Files", groupedAssets.files, "description"),
      renderProductChatAssetGroup("Links", groupedAssets.links, "link"),
    ],
  ]);
}

function renderProductChatAssetGroup(label, assets, icon) {
  return createElement("details", { className: "product-chat-assets__group", open: assets.length > 0 }, [
    createElement("summary", null, [createIcon(icon), createElement("span", null, `${label} (${assets.length})`)]),
    assets.length === 0
      ? createElement("p", null, "Nothing sent yet.")
      : createElement("div", { className: "product-chat-assets__list" }, assets.map(renderProductChatAssetItem)),
  ]);
}

function renderProductChatAssetItem(asset) {
  return asset.kind === "link"
    ? createElement("a", { className: "product-chat-assets__item", href: asset.url, target: "_blank", rel: "noopener noreferrer" }, [createIcon("link"), createElement("span", null, asset.url)])
    : createElement("a", { className: "product-chat-assets__item", href: asset.dataUrl, download: asset.name }, [createIcon(asset.type.startsWith("image/") ? "image" : asset.type.startsWith("video/") ? "movie" : "description"), createElement("span", null, asset.name)]);
}

function renderChatAttachmentPreview(messages) {
  if (!uiState.chatAttachmentPreview) return null;
  const attachment = messages.flatMap((message) => message.attachments ?? []).find((item) => item.attachmentId === uiState.chatAttachmentPreview);
  if (!attachment) return null;

  return createElement("div", { className: "product-chat-preview", role: "presentation" }, [
    createElement("div", { className: "product-chat-preview__dialog", role: "dialog", ariaModal: "true", ariaLabel: attachment.name }, [
      createElement("button", { className: "product-chat-preview__close", type: "button", dataAction: "close-chat-attachment-preview", ariaLabel: "Close preview" }, [createIcon("close")]),
      attachment.type.startsWith("video/")
        ? createElement("video", { src: attachment.dataUrl, controls: true, preload: "metadata" })
        : createElement("img", { src: attachment.dataUrl, alt: attachment.name }),
    ]),
  ]);
}

function renderPendingChatAttachments() {
  if (!uiState.chatUploadingFiles && uiState.pendingChatAttachments.length === 0) return null;

  const pendingItems = uiState.pendingChatAttachments.map((attachment) =>
    createElement("span", { className: "product-chat-pending__item" }, [
      createIcon(attachment.type.startsWith("image/") ? "image" : attachment.type.startsWith("video/") ? "movie" : "description"),
      createElement("span", null, attachment.name),
      createElement("button", { className: "product-chat-pending__remove", type: "button", dataAction: "remove-pending-chat-file", dataAttachmentId: attachment.attachmentId, ariaLabel: `Remove ${attachment.name}` }, [createIcon("close")]),
    ]),
  );

  return createElement("div", { className: "product-chat-pending", ariaLabel: "Files ready to send" }, [
    uiState.chatUploadingFiles
      ? createElement("span", { className: "product-chat-pending__item product-chat-pending__item--loading" }, [createIcon("hourglass_top"), createElement("span", null, "Preparing file...")])
      : null,
    pendingItems,
  ]);
}

function renderProductChatComposer(product, fileInputId) {
  if (!canSendChatMessages()) {
    return createElement("div", { className: "product-chat-composer product-chat-composer--readonly" }, [
      createIcon("visibility"),
      createElement("span", null, "Viewer access can review chat history but cannot send messages or files."),
    ]);
  }

  return createElement("form", { className: "product-chat-composer", dataAction: "send-product-chat", dataProductId: product.id }, [
    createElement("div", { className: "product-chat-composer__toolbar" }, [
      renderChatFormatButton("format_bold", "bold", "Bold"),
      renderChatFormatButton("format_italic", "italic", "Italic"),
      renderChatFormatButton("format_list_bulleted", "list", "Bulleted list"),
      createElement("input", { className: "product-chat-composer__file-input", id: fileInputId, type: "file", multiple: true, dataAction: "add-chat-files", dataProductId: product.id }),
      createElement("label", { className: "product-chat-composer__tool", htmlFor: fileInputId, ariaLabel: "Attach files" }, [createIcon("attach_file")]),
    ]),
    createElement("textarea", { className: "product-chat-composer__input", name: "chatMessage", rows: 1, placeholder: "Type your message here...", dataAction: "chat-message-input", dataProductId: product.id }),
    renderPendingChatAttachments(),
    createElement("div", { className: "product-chat-composer__footer" }, [
      createElement("span", { className: "product-chat-composer__hint" }, "Press Enter to send, Shift + Enter for new line"),
      createElement("span", { className: "product-chat-composer__emoji-picker" }, [
        createElement("button", { className: "product-chat-composer__emoji", type: "button", dataAction: "toggle-chat-emoji-menu", ariaLabel: "Show emojis" }, "🙂"),
        uiState.chatEmojiOpen ? createElement("span", { className: "product-chat-composer__emoji-menu" }, ["🙂", "👍", "🔥", "✅", "🚀"].map((emoji) =>
          createElement("button", { className: "product-chat-composer__emoji", type: "button", dataAction: "insert-chat-emoji", dataEmoji: emoji, ariaLabel: `Insert ${emoji}` }, emoji),
        )) : null,
      ].filter(Boolean)),
      createElement("button", { className: "button-primary product-chat-composer__send", type: "submit", disabled: uiState.chatUploadingFiles }, [createElement("span", null, "Send"), createIcon("send")]),
    ]),
  ]);
}

function renderChatFormatButton(icon, format, label) {
  return createElement("button", { className: "product-chat-composer__tool", type: "button", dataAction: "format-chat-text", dataChatFormat: format, ariaLabel: label }, [createIcon(icon)]);
}

function renderWorkspaceCustomFields(product, stage, stageDetails) {
  const fields = stageDetails.customFields;
  const fullWidthFieldTypes = ["LONG_BAR", "CUSTOM_TABLE", "FILE_UPLOAD", "PAYMENT_STATUS", "CHECKLIST_NOTES", "SHIPMENT_TRACKER"];
  const fullWidthFields = fields.filter((field) => fullWidthFieldTypes.includes(field.type));
  const compactFields = fields.filter((field) => ![...fullWidthFieldTypes, "LONG_TEXT"].includes(field.type));
  const longTextFields = fields.filter((field) => field.type === "LONG_TEXT");

  return createElement("section", { className: "workspace-fields", ariaLabel: `${stage.label} custom fields` }, [
    createElement("div", { className: "workspace-fields__header" }, [
      createElement("h3", null, "Custom Details"),
      createElement("span", null, `${fields.length} field${fields.length === 1 ? "" : "s"}`),
    ]),
    fields.length === 0
      ? createElement("p", { className: "workspace-fields__empty" }, "No preset fields here. Add only the details you want to track for this product and stage.")
      : createElement("div", { className: "workspace-fields__groups" }, [
        fullWidthFields.length > 0
          ? createElement("div", { className: "workspace-fields__full-width" },
            fullWidthFields.map((field) => renderWorkspaceCustomField(product, stage, field)),
          )
          : null,
        compactFields.length > 0 || longTextFields.length > 0
          ? createElement("div", { className: `workspace-fields__layout ${longTextFields.length === 0 ? "workspace-fields__layout--compact-only" : ""}` }, [
            compactFields.length > 0
              ? createElement("div", { className: "workspace-fields__grid workspace-fields__grid--compact" },
                compactFields.map((field) => renderWorkspaceCustomField(product, stage, field)),
              )
              : null,
            longTextFields.length > 0
              ? createElement("div", { className: "workspace-fields__long-text" },
                longTextFields.map((field) => renderWorkspaceCustomField(product, stage, field)),
              )
              : null,
          ].filter(Boolean))
          : null,
      ].filter(Boolean)),
  ]);
}

function renderWorkspaceAddFieldForm(product, stage) {
  if (!canEditWorkspaceData()) return null;
  return createElement("button", {
    className: "button-primary workspace-add-field-button",
    type: "button",
    dataAction: "open-field-modal",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [createIcon("add")]);
}

function renderWorkspaceCustomField(product, stage, field) {
  const fieldModifiers = {
    LONG_BAR: "workspace-field--full-bar",
    HALF_LONG_TEXT: "workspace-field--half-long",
    LONG_TEXT: "workspace-field--wide",
    CUSTOM_TABLE: "workspace-field--full-table",
    FILE_UPLOAD: "workspace-field--file-upload",
    PAYMENT_STATUS: "workspace-field--payment-status",
    CHECKLIST_NOTES: "workspace-field--checklist-notes",
    SHIPMENT_TRACKER: "workspace-field--shipment-tracker",
  };
  const fieldClass = `workspace-field ${fieldModifiers[field.type] ?? ""}`.trim();

  return createElement("article", { className: fieldClass }, [
    createElement("div", { className: "workspace-field__header" }, [
      createElement("span", { className: "workspace-field__label" }, field.label),
      canEditWorkspaceData() ? createElement("span", { className: "workspace-field__actions" }, [
        createElement("button", {
          className: "workspace-field__action",
          type: "button",
          dataAction: "edit-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Edit ${field.label}`,
        }, [createIcon("edit")]),
        createElement("button", {
          className: "workspace-field__action workspace-field__action--danger",
          type: "button",
          dataAction: "delete-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Delete ${field.label}`,
        }, [createIcon("delete")]),
      ]) : null,
    ].filter(Boolean)),
    renderWorkspaceFieldControl(product, stage, field),
  ]);
}

function renderWorkspaceFieldControl(product, stage, field) {
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled: !canEditWorkspaceData(),
  };

  if (["LONG_TEXT", "HALF_LONG_TEXT"].includes(field.type)) {
    return createElement("textarea", {
      className: `form-input workspace-field__textarea ${field.type === "HALF_LONG_TEXT" ? "workspace-field__textarea--half" : ""}`.trim(),
      ...baseOptions,
      rows: field.type === "HALF_LONG_TEXT" ? 3 : 4,
      placeholder: field.type === "HALF_LONG_TEXT" ? "Add half-width notes..." : "Write longer notes...",
      value: field.value ?? "",
    });
  }

  if (field.type === "LONG_BAR") {
    const tokens = getLongBarTokens(field.value);
    return createElement("div", { className: "workspace-field__tagbar" }, [
      tokens.map((token, tokenIndex) => createElement("span", { className: "workspace-field__tag" }, [
        createElement("span", null, token),
        canEditWorkspaceData() ? createElement("button", {
          className: "workspace-field__tag-remove",
          type: "button",
          dataAction: "remove-long-bar-token",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          dataTokenIndex: tokenIndex,
          ariaLabel: `Remove ${token}`,
        }, "×") : null,
      ].filter(Boolean))),
      createElement("input", {
        className: "workspace-field__tag-input",
        type: "text",
        placeholder: tokens.length > 0 ? "Add another and press Enter..." : "Type a word and press Enter...",
        dataAction: "add-long-bar-token",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled: !canEditWorkspaceData(),
      }),
    ]);
  }

  if (field.type === "NUMBER") {
    return createElement("input", { className: "form-input", type: "number", step: "any", value: field.value ?? "", ...baseOptions });
  }

  if (field.type === "CURRENCY") {
    const currencyValue = field.value && typeof field.value === "object" ? field.value : { amount: "", currency: "USD" };
    return createElement("div", { className: "workspace-field__currency" }, [
      createElement("input", { className: "form-input", type: "number", step: "0.01", value: currencyValue.amount ?? "", dataFieldPart: "amount", ...baseOptions }),
      createElement("select", { className: "form-input", value: currencyValue.currency ?? "USD", dataFieldPart: "currency", ...baseOptions }, [
        createElement("option", { value: "USD", selected: currencyValue.currency === "USD" }, "USD"),
        createElement("option", { value: "CAD", selected: currencyValue.currency === "CAD" }, "CAD"),
        createElement("option", { value: "GBP", selected: currencyValue.currency === "GBP" }, "GBP"),
        createElement("option", { value: "EUR", selected: currencyValue.currency === "EUR" }, "EUR"),
      ]),
    ]);
  }

  if (field.type === "DATE") {
    return createElement("input", { className: "form-input", type: "date", value: field.value ?? "", ...baseOptions });
  }

  if (field.type === "LINK") {
    return renderWorkspaceLinkField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "SHIPMENT_TRACKER") {
    return renderWorkspaceShipmentTrackerField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "CUSTOM_DROPDOWN") {
    const options = getCustomDropdownOptions(field);
    return createElement("select", { className: "form-input", value: field.value ?? "", ...baseOptions }, [
      createElement("option", { value: "", selected: !field.value }, options.length > 0 ? "Choose an option..." : "No choices added yet"),
      options.map((option) => createElement("option", { value: option, selected: field.value === option }, option)),
    ]);
  }

  if (field.type === "CUSTOM_TABLE") return renderWorkspaceTableField(product, stage, field, baseOptions.disabled);

  if (field.type === "FILE_UPLOAD") return renderWorkspaceFileUploadField(product, stage, field, baseOptions.disabled);

  if (field.type === "PAYMENT_STATUS") return renderWorkspacePaymentStatusField(product, stage, field, baseOptions.disabled);

  if (field.type === "CHECKLIST_NOTES") return renderWorkspaceChecklistNotesField(product, stage, field, baseOptions.disabled);

  return createElement("input", { className: "form-input", type: "text", placeholder: "Add a short value...", value: field.value ?? "", ...baseOptions });
}

function renderWorkspaceLinkField(product, stage, field, disabled) {
  const linkValue = normalizeWorkspaceLinkValue(field.value, field.label);
  const safeUrl = getSafeWorkspaceUrl(linkValue.url);
  const hasUrl = Boolean(safeUrl);
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled,
  };

  if (!hasUrl) {
    return createElement("input", {
      className: "form-input",
      type: "url",
      placeholder: "Paste a link here...",
      value: linkValue.url,
      dataFieldPart: "url",
      ...baseOptions,
    });
  }

  return createElement("div", { className: "workspace-link-field" }, [
    createElement("a", { className: "workspace-link-field__button", href: safeUrl, target: "_blank", rel: "noopener noreferrer" }, [
      createIcon("open_in_new"),
      createElement("span", null, linkValue.label || "Open Link"),
    ]),
    createElement("div", { className: "workspace-link-field__editor" }, [
      createElement("label", { className: "workspace-link-field__control" }, [
        createElement("span", null, "Button text"),
        createElement("input", {
          className: "form-input",
          type: "text",
          placeholder: "Button text...",
          value: linkValue.label,
          dataFieldPart: "label",
          ...baseOptions,
        }),
      ]),
      createElement("label", { className: "workspace-link-field__control" }, [
        createElement("span", null, "Link URL"),
        createElement("input", {
          className: "form-input",
          type: "url",
          placeholder: "https://example.com",
          value: linkValue.url,
          dataFieldPart: "url",
          ...baseOptions,
        }),
      ]),
      !disabled ? createElement("button", {
        className: "workspace-link-field__clear",
        type: "button",
        dataAction: "clear-workspace-link",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        ariaLabel: "Remove saved link",
        title: "Remove saved link",
      }, [createIcon("close")]) : null,
    ].filter(Boolean)),
  ]);
}

function renderWorkspaceShipmentTrackerField(product, stage, field, disabled) {
  const trackingNumber = normalizeTrackingNumber(field.value);
  const milestones = getShipmentMilestones(trackingNumber);
  return createElement("div", { className: `workspace-shipment-tracker ${trackingNumber ? "workspace-shipment-tracker--active" : ""}`.trim() }, [
    createElement("div", { className: "workspace-shipment-tracker__entry" }, [
      createElement("input", {
        className: "form-input",
        type: "text",
        placeholder: "Paste tracking number once to monitor shipment...",
        value: trackingNumber,
        dataAction: "update-workspace-field",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
      createElement("button", {
        className: "workspace-shipment-tracker__button",
        type: "button",
        dataAction: "track-shipment",
        disabled: !trackingNumber,
      }, [createIcon("local_shipping"), createElement("span", null, "TRACK SHIPMENT")]),
      trackingNumber && !disabled ? createElement("button", {
        className: "workspace-shipment-tracker__clear",
        type: "button",
        dataAction: "clear-shipment-tracking",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        ariaLabel: "Remove saved tracking number",
        title: "Remove tracking number",
      }, [createIcon("close")]) : null,
    ].filter(Boolean)),
    trackingNumber
      ? renderShipmentTrackingOverview(trackingNumber, milestones)
      : createElement("small", { className: "workspace-shipment-tracker__help" }, "Paste a tracking number once, then this field keeps it saved and shows a visual progress tracker whenever you return."),
  ]);
}

function renderShipmentTrackingOverview(trackingNumber, milestones) {
  const carrierLabel = getShipmentCarrierLabel(trackingNumber);
  const status = getShipmentStatusSummary(trackingNumber, milestones);
  const trackingEvents = getShipmentTrackingEvents(trackingNumber, milestones);
  const statusTabs = [
    ["All", "1", "widgets"],
    ["Info received", "0", "local_shipping"],
    ["In transit", "1", "flight_takeoff"],
    ["Pick up", "0", "flag"],
    ["Out for Delivery", "0", "receipt_long"],
    ["Delivered", "0", "check"],
    ["Alert", "0", "warning"],
  ];
  const progressStops = ["Created", "Collected", "In transit", "Out for delivery", "Delivered"];

  return createElement("div", { className: "workspace-shipment-tracker__monitor workspace-shipment-tracker__monitor--17track", ariaLabel: `Shipment progress for ${trackingNumber}` }, [
    createElement("div", { className: "workspace-shipment-tracker__tabs", ariaLabel: "Shipment status filters" },
      statusTabs.map(([label, count, icon], index) => createElement("span", { className: `workspace-shipment-tracker__tab ${index === 0 ? "is-active" : ""}`.trim() }, [
        createIcon(icon),
        createElement("span", null, `${label}(${count})`),
      ])),
    ),
    createElement("section", { className: "workspace-shipment-tracker__17-card" }, [
      createElement("div", { className: "workspace-shipment-tracker__17-summary" }, [
        createElement("span", { className: "workspace-shipment-tracker__carrier-icon" }, [createIcon("flight_takeoff")]),
        createElement("span", { className: "workspace-shipment-tracker__tracking-id" }, [
          createElement("b", null, trackingNumber),
          createElement("small", null, `${status.label} · ${status.age}`),
        ]),
        createElement("span", { className: "workspace-shipment-tracker__carrier" }, [
          createElement("b", null, carrierLabel),
          createElement("small", null, "Carrier auto-detected"),
        ]),
        createElement("span", { className: "workspace-shipment-tracker__destination" }, [
          createElement("b", null, "United States"),
          createElement("small", null, status.location),
        ]),
        createElement("button", { className: "workspace-shipment-tracker__live-link", type: "button", dataAction: "track-shipment" }, [
          createIcon("open_in_new"),
          createElement("span", null, "Open live lookup"),
        ]),
      ]),
      createElement("div", { className: "workspace-shipment-tracker__headline" }, [
        createElement("strong", null, status.headline),
        createElement("span", { className: "workspace-shipment-tracker__by-carrier" }, `By ${carrierLabel}`),
      ]),
      createElement("div", { className: "workspace-shipment-tracker__progress", ariaLabel: `${status.progress}% shipment progress` }, [
        createElement("span", { className: "workspace-shipment-tracker__progress-line" }, [
          createElement("span", { className: "workspace-shipment-tracker__progress-fill", style: { width: `${status.progress}%` } }),
        ]),
        progressStops.map((label, index) => createElement("span", { className: `workspace-shipment-tracker__progress-stop ${index <= status.stopIndex ? "is-active" : ""}`.trim() }, [
          createElement("span", null),
          createElement("small", null, label),
        ])),
      ]),
      createElement("p", { className: "workspace-shipment-tracker__notice" }, "This mirrors the 17TRACK-style workflow inside LaunchPad Pro. Live carrier data still opens through the free external lookup because direct carrier/17TRACK APIs require service access."),
      createElement("div", { className: "workspace-shipment-tracker__details" }, [
        createElement("div", { className: "workspace-shipment-tracker__details-heading" }, [
          createElement("h4", null, "Tracking Information"),
          createElement("span", null, `Sync preview · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`),
        ]),
        createElement("ol", null, trackingEvents.map((event) => createElement("li", { className: event.current ? "is-current" : "" }, [
          createElement("span", { className: "workspace-shipment-tracker__event-dot" }, [createIcon(event.current ? "flight_takeoff" : "radio_button_unchecked")]),
          createElement("time", null, event.date),
          createElement("strong", null, event.location),
          createElement("p", null, event.description),
        ]))),
      ]),
    ]),
  ]);
}

function renderWorkspaceTableField(product, stage, field, disabled) {
  const columns = getCustomTableColumns(field);
  const rows = getCustomTableRows(field);
  const effectiveColumns = columns.length > 0 ? columns : ["Details"];
  const effectiveRows = rows.length > 0 ? rows : [""];
  const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);

  return createElement("div", { className: "workspace-table-field" }, [
    createElement("strong", null, field.label),
    columns.length > 0 || rows.length > 0
      ? createElement("div", { className: "workspace-table-field__scroll" }, [
        createElement("table", null, [
          createElement("thead", null, createElement("tr", null, [
            createElement("th", { className: "workspace-table-field__corner" }, ""),
            effectiveColumns.map((column, columnIndex) => createElement("th", {
              className: "workspace-table-field__heading workspace-table-field__heading--column",
              draggable: canEditWorkspaceData() && columns.length > 0,
              dataAction: columns.length > 0 ? "drag-workspace-table-column" : null,
              dataProductId: product.id,
              dataStageId: stage.stage_id,
              dataFieldId: field.fieldId,
              dataTableAxis: "column",
              dataTableIndex: columnIndex,
              dataTableDropAxis: "column",
              dataTableDropIndex: columnIndex,
              title: canEditWorkspaceData() && columns.length > 0 ? "Drag to reorder. Double-click to rename." : column,
            }, column)),
          ])),
          createElement("tbody", null, effectiveRows.map((rowLabel, rowIndex) => createElement("tr", null, [
            createElement("th", {
              className: "workspace-table-field__heading workspace-table-field__heading--row",
              draggable: canEditWorkspaceData() && rows.length > 0,
              dataAction: rows.length > 0 ? "drag-workspace-table-row" : null,
              dataProductId: product.id,
              dataStageId: stage.stage_id,
              dataFieldId: field.fieldId,
              dataTableAxis: "row",
              dataTableIndex: rowIndex,
              dataTableDropAxis: "row",
              dataTableDropIndex: rowIndex,
              title: canEditWorkspaceData() && rows.length > 0 ? "Drag to reorder. Double-click to rename." : rowLabel,
            }, rowLabel || "Details"),
            effectiveColumns.map((columnLabel, columnIndex) => createElement("td", null, renderWorkspaceTableCellInput({
              product,
              stage,
              field,
              rowLabel: rowLabel || "Details",
              columnLabel,
              rowIndex,
              columnIndex,
              value: tableValue?.[rowIndex]?.[columnIndex] ?? "",
              disabled,
            }))),
          ]))),
        ]),
      ])
      : createElement("p", { className: "workspace-fields__empty" }, "Edit this field and add at least one row or one column."),
  ]);
}

function renderWorkspaceTableCellInput({ product, stage, field, rowLabel, columnLabel, rowIndex, columnIndex, value, disabled }) {
  const cellValue = String(value ?? "");
  const isLink = isWorkspaceTableCellLink(cellValue);

  return createElement("div", { className: "workspace-table-field__cell-control" }, [
    createElement("input", {
      className: "workspace-table-field__input",
      type: "text",
      value: cellValue,
      dataAction: "update-workspace-table-cell",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataRowIndex: rowIndex,
      dataColumnIndex: columnIndex,
      ariaLabel: `${field.label} ${rowLabel} ${columnLabel}`,
      disabled,
    }),
    isLink ? createElement("a", {
      className: "workspace-table-field__link",
      href: normalizeChatUrl(cellValue),
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: `Open ${cellValue}`,
      title: `Open ${cellValue}`,
    }, [createIcon("open_in_new")]) : null,
  ].filter(Boolean));
}

function isWorkspaceTableCellLink(value) {
  const cleanValue = String(value ?? "").trim();
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(cleanValue) && isSafeExternalUrl(cleanValue);
}

function renderWorkspaceFileUploadField(product, stage, field, disabled) {
  const files = normalizeWorkspaceFileList(field.value);
  const inputId = `workspace-file-upload-${product.id}-${stage.stage_id}-${field.fieldId}`;

  return createElement("div", { className: "workspace-file-field" }, [
    files.length > 0
      ? createElement("div", { className: "workspace-file-field__list" }, files.map((file) => renderWorkspaceFileUploadItem(product, stage, field, file, disabled)))
      : createElement("p", { className: "workspace-file-field__empty" }, "No invoice or supporting files uploaded yet."),
    createElement("div", { className: "workspace-file-field__footer" }, [
      createElement("input", {
        className: "workspace-file-field__input",
        id: inputId,
        type: "file",
        multiple: true,
        accept: ".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dataAction: "upload-workspace-file-field",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
      createElement("label", { className: `workspace-file-field__upload ${disabled ? "workspace-file-field__upload--disabled" : ""}`.trim(), htmlFor: inputId }, [
        createIcon("upload_file"),
        createElement("span", null, files.length > 0 ? "Add more files" : "Upload invoice files"),
      ]),
      createElement("small", null, "PDF, CSV, Excel, image, and other invoice files are supported."),
    ]),
  ]);
}

function renderWorkspaceFileUploadItem(product, stage, field, file, disabled) {
  const isImage = file.type?.startsWith("image/");
  return createElement("article", { className: "workspace-file-field__item" }, [
    createElement("div", { className: "workspace-file-field__icon" }, isImage && file.dataUrl
      ? createElement("img", { src: file.dataUrl, alt: file.name })
      : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, `${formatFileSize(file.size)} · ${file.type || "File"}`),
    ]),
    createElement("a", { className: "workspace-file-field__action", href: file.dataUrl, download: file.name, ariaLabel: `Download ${file.name}` }, [createIcon("download")]),
    !disabled ? createElement("button", {
      className: "workspace-file-field__action workspace-file-field__action--danger",
      type: "button",
      dataAction: "remove-workspace-file-field",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataAttachmentId: file.attachmentId,
      ariaLabel: `Remove ${file.name}`,
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function getWorkspaceFileIcon(file) {
  const type = String(file?.type ?? "");
  const name = String(file?.name ?? "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "picture_as_pdf";
  if (type.includes("spreadsheet") || type.includes("excel") || /\.(csv|xls|xlsx)$/.test(name)) return "table_chart";
  if (type.startsWith("image/")) return "image";
  return "description";
}

function renderWorkspacePaymentStatusField(product, stage, field, disabled) {
  const value = normalizePaymentStatusValue(field.value);
  const paymentTotals = calculatePaymentTotals(value);
  const totalCost = paymentTotals.totalCost;
  const isFullPaid = paymentTotals.isFullPaid;
  const paidAmount = paymentTotals.paidAmount;
  const balanceAmount = paymentTotals.balanceAmount;
  const paidPercent = paymentTotals.paidPercent;
  const balancePercent = paymentTotals.balancePercent;
  const inputId = `payment-file-upload-${product.id}-${stage.stage_id}-${field.fieldId}`;

  return createElement("div", { className: "workspace-payment-field" }, [
    createElement("div", { className: "workspace-payment-field__summary" }, [
      createElement("div", { className: "workspace-payment-card workspace-payment-card--paid" }, [
        createElement("span", null, isFullPaid ? "FULL PAYMENT" : `PARTIAL PAID (${paidPercent}%)`),
        createElement("strong", null, formatCurrency(paidAmount)),
        createElement("small", null, isFullPaid ? "Marked as paid" : "Amount already paid"),
      ]),
      createElement("div", { className: "workspace-payment-card workspace-payment-card--balance" }, [
        createElement("span", null, `BALANCE (${balancePercent}%)`),
        createElement("strong", null, formatCurrency(balanceAmount)),
        createElement("small", null, totalCost > 0 ? `${paidPercent}% paid` : "Add total cost"),
      ]),
      createElement("button", {
        className: "workspace-payment-field__manage",
        type: "button",
        dataAction: "open-payment-modal",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
      }, "Record Payment"),
      renderPaymentHistory(product, stage, field, value, disabled),
    ]),
    createElement("div", { className: "workspace-payment-field__documents" }, [
      createElement("div", { className: "workspace-payment-field__documents-header" }, [
        createElement("strong", null, "Documents"),
        createElement("label", { className: `workspace-payment-field__upload ${disabled ? "workspace-payment-field__upload--disabled" : ""}`.trim(), htmlFor: inputId, ariaLabel: "Upload payment document" }, [createIcon("upload_file")]),
        createElement("input", {
          className: "workspace-file-field__input",
          id: inputId,
          type: "file",
          multiple: true,
          accept: ".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dataAction: "upload-payment-field-file",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          disabled,
        }),
      ]),
      value.files.length > 0
        ? createElement("div", { className: "workspace-payment-field__file-list" }, value.files.map((file) => renderWorkspacePaymentFileItem(product, stage, field, file, disabled)))
        : createElement("p", { className: "workspace-file-field__empty" }, "Upload invoice, receipt, or payment proof files."),
    ]),
  ].filter(Boolean));
}

function renderPaymentHistory(product, stage, field, value, disabled) {
  const history = getPaymentHistoryNewestFirst(normalizePaymentHistory(value.history));
  return createElement("div", { className: "workspace-payment-history" }, [
    createElement("strong", null, "Transactions"),
    history.length > 0
      ? history.map((entry) => renderPaymentTransaction(product, stage, field, entry, disabled))
      : createElement("small", null, "No recorded payments yet."),
  ]);
}

function getPaymentHistoryNewestFirst(history) {
  return [...history].sort((firstEntry, secondEntry) => getPaymentHistorySortTime(secondEntry) - getPaymentHistorySortTime(firstEntry));
}

function getPaymentHistorySortTime(entry) {
  const timestamp = new Date(entry.createdAt || (entry.date ? `${entry.date}T23:59:59` : 0)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function renderPaymentTransaction(product, stage, field, entry, disabled) {
  const paymentType = entry.mode === "full" ? "Full" : "Partial";
  const paymentDate = formatPaymentDateWords(entry.date);
  return createElement("article", { className: "workspace-payment-history__item" }, [
    createElement("div", { className: "workspace-payment-history__details" }, [
      createElement("span", null, entry.paymentTitle || "Payment Record"),
      createElement("strong", null, formatCurrency(entry.amount)),
      createElement("small", null, `${paymentType} payment${entry.mode === "partial" ? ` · ${entry.percent}%` : ""} · Paid ${paymentDate}`),
    ]),
    !disabled ? createElement("div", { className: "workspace-payment-history__actions" }, [
      createElement("button", {
        className: "workspace-file-field__action",
        type: "button",
        dataAction: "open-payment-modal",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataPaymentId: entry.paymentId,
        ariaLabel: "Edit recorded payment",
      }, [createIcon("edit")]),
      createElement("button", {
        className: "workspace-file-field__action workspace-file-field__action--danger",
        type: "button",
        dataAction: "delete-payment-transaction",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataPaymentId: entry.paymentId,
        ariaLabel: "Delete recorded payment",
      }, [createIcon("delete")]),
    ]) : null,
  ].filter(Boolean));
}

function renderWorkspacePaymentFileItem(product, stage, field, file, disabled) {
  return createElement("article", { className: "workspace-payment-field__file" }, [
    createElement("div", { className: "workspace-file-field__icon" }, file.type?.startsWith("image/") && file.dataUrl ? createElement("img", { src: file.dataUrl, alt: file.name }) : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, `${file.type || "File"} · ${formatFileSize(file.size)}`),
    ]),
    createElement("a", { className: "workspace-file-field__action", href: file.dataUrl, download: file.name, ariaLabel: `Download ${file.name}` }, [createIcon("download")]),
    !disabled ? createElement("button", {
      className: "workspace-file-field__action workspace-file-field__action--danger",
      type: "button",
      dataAction: "remove-payment-field-file",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataAttachmentId: file.attachmentId,
      ariaLabel: `Remove ${file.name}`,
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function getPaymentFieldKey(productId, stageId, fieldId) {
  return `${productId}:${stageId}:${fieldId}`;
}

function renderWorkspaceChecklistNotesField(product, stage, field, disabled) {
  const items = getChecklistNotesItems(field);
  const value = normalizeChecklistNotesValue(field.value, items);

  return createElement("div", { className: "workspace-checklist-notes-field" }, [
    createElement("div", { className: "workspace-checklist-notes-field__list" }, [
      createElement("strong", null, field.label),
      items.length > 0
        ? items.map((item, itemIndex) => createElement("label", { className: "workspace-checklist-notes-field__item" }, [
          createElement("input", {
            type: "checkbox",
            checked: Boolean(value.checked[item]),
            dataAction: "update-workspace-checklist-note-item",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            dataOptionIndex: itemIndex,
            disabled,
          }),
          createElement("span", null, item),
        ]))
        : createElement("p", { className: "workspace-fields__empty" }, "Edit this field and add checklist items."),
    ]),
    createElement("label", { className: "workspace-checklist-notes-field__notes" }, [
      createElement("span", null, "Notes"),
      createElement("textarea", {
        className: "form-input workspace-field__textarea",
        rows: 5,
        placeholder: "Add notes...",
        value: value.notes,
        dataAction: "update-workspace-checklist-note-text",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
    ]),
  ]);
}

function renderPaymentStatusModal() {
  if (!uiState.paymentModal) return null;

  const { productId, stageId, fieldId } = uiState.paymentModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = stageDetails.customFields.find((item) => item.fieldId === fieldId && item.type === "PAYMENT_STATUS");
  if (!field) return null;

  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  const modalTotals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
  const totalCost = modalTotals.totalCost;
  const { paidPercent, balance, balancePercent } = getPaymentModalPreview(value);
  const modalTitle = uiState.paymentModal.editingPaymentId ? `Edit ${field.label} Transaction` : `Record ${field.label}`;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog workspace-modal__dialog--payment",
      dataAction: "save-payment-status",
      dataProductId: productId,
      dataStageId: stageId,
      dataFieldId: fieldId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-payment-modal", ariaLabel: "Close payment form" }, [createIcon("close")]),
      ]),
      createElement("div", { className: "workspace-payment-modal__grid" }, [
        createElement("label", { className: "form-field workspace-payment-modal__title" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Title"),
          createElement("input", { className: "form-input", name: "paymentTitle", type: "text", value: value.paymentTitle, placeholder: "Example: Deposit payment", dataAction: "update-payment-modal-field", dataFieldPart: "paymentTitle" }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Total Cost"),
          createElement("input", { className: "form-input", name: "totalCost", type: "number", step: "0.01", value: value.totalCost, dataAction: "update-payment-modal-field", dataFieldPart: "totalCost" }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm workspace-payment-modal__amount-label" }, `Payment Amount (${paidPercent}%)`),
          createElement("input", {
            className: "form-input",
            name: "partialAmount",
            type: "number",
            step: "0.01",
            value: value.paymentMode === "full" && value.partialAmount === "" ? totalCost : value.partialAmount,
            dataAction: "update-payment-modal-field",
            dataFieldPart: "partialAmount",
          }),
        ]),
        createElement("label", { className: "workspace-payment-field__toggle" }, [
          createElement("input", { name: "isFullPaid", type: "checkbox", checked: value.paymentMode === "full", dataAction: "update-payment-modal-field", dataFieldPart: "isFullPaid" }),
          createElement("span", null, "Tag as fully paid"),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Date"),
          createElement("input", { className: "form-input", name: "paymentDate", type: "date", value: value.paymentDate, dataAction: "update-payment-modal-field", dataFieldPart: "paymentDate" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__upload" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice PDF File"),
          createElement("input", {
            className: "form-input",
            name: "invoiceFile",
            type: "file",
            accept: ".pdf,application/pdf",
            dataAction: "upload-payment-field-file",
            dataProductId: productId,
            dataStageId: stageId,
            dataFieldId: fieldId,
          }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice Number"),
          createElement("input", { className: "form-input", name: "invoiceNumber", type: "text", value: value.invoiceNumber, placeholder: "Add invoice number...", dataAction: "update-payment-modal-field", dataFieldPart: "invoiceNumber" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__description" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Description"),
          createElement("textarea", { className: "form-input", name: "paymentDescription", rows: 3, placeholder: "Add internal payment notes...", value: value.paymentDescription, dataAction: "update-payment-modal-field", dataFieldPart: "paymentDescription" }),
        ]),
        createElement("div", { className: "workspace-payment-field__calculated" }, [
          createElement("span", null, "Auto Balance"),
          createElement("strong", { className: "workspace-payment-modal__balance-amount" }, formatCurrency(balance)),
          createElement("small", { className: "workspace-payment-modal__balance-percent" }, `${balancePercent}% remaining`),
        ]),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-payment-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, uiState.paymentModal.editingPaymentId ? "Save Transaction" : "Record Payment"),
      ]),
    ]),
  ]);
}

function renderWorkspaceFieldModal() {
  if (!uiState.fieldModal) return null;

  const { productId, stageId, fieldId, mode } = uiState.fieldModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = mode === "edit" ? stageDetails.customFields.find((item) => item.fieldId === fieldId) : null;
  const modalTitle = field ? "Edit Custom Field" : "Create Custom Field";
  const submitLabel = field ? "Save Field" : "Create Field";
  const selectedType = uiState.fieldModal.selectedType ?? field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value;
  const draftLabel = uiState.fieldModal.fieldLabel ?? field?.label ?? "";
  const dropdownOptions = getFieldModalDropdownOptions(field);
  const dropdownDraft = uiState.fieldModal.dropdownOptionDraft ?? "";
  const tableColumns = getFieldModalTableColumns(field);
  const tableRows = getFieldModalTableRows(field);
  const checklistItems = getFieldModalChecklistItems(field);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "workspace-save-custom-field",
      dataProductId: productId,
      dataStageId: stageId,
      dataFieldId: fieldId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-field-modal", ariaLabel: "Close custom field dialog" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Name"),
        createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Materials", value: draftLabel, dataAction: "update-field-modal-label", required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Type"),
        createElement("select", { className: "form-input", name: "fieldType", dataAction: "update-field-modal-type", required: true },
          WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType.value, selected: selectedType === fieldType.value }, fieldType.label)),
        ),
      ]),
      selectedType === "CUSTOM_DROPDOWN" ? renderFieldModalDropdownChoices(dropdownOptions, dropdownDraft) : null,
      selectedType === "CUSTOM_TABLE" ? renderFieldModalListEditor("Columns", "Add the table column headers.", tableColumns, uiState.fieldModal.tableColumnDraft ?? "", "update-field-modal-table-column-draft", "add-field-modal-table-column", "remove-field-modal-table-column") : null,
      selectedType === "CUSTOM_TABLE" ? renderFieldModalListEditor("Rows", "Add the table row labels.", tableRows, uiState.fieldModal.tableRowDraft ?? "", "update-field-modal-table-row-draft", "add-field-modal-table-row", "remove-field-modal-table-row") : null,
      selectedType === "CHECKLIST_NOTES" ? renderFieldModalListEditor("Checklist Items", "Add checklist labels for the left side of the field.", checklistItems, uiState.fieldModal.checklistItemDraft ?? "", "update-field-modal-checklist-item-draft", "add-field-modal-checklist-item", "remove-field-modal-checklist-item") : null,
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-field-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, submitLabel),
      ]),
    ]),
  ]);
}

function renderFieldModalDropdownChoices(options, draftValue) {
  return createElement("section", { className: "field-modal-options", ariaLabel: "Custom dropdown choices" }, [
    createElement("div", { className: "field-modal-options__header" }, [
      createElement("strong", null, "Dropdown Choices"),
      createElement("span", null, "Add the choices users can select from this dropdown."),
    ]),
    options.length > 0
      ? createElement("div", { className: "field-modal-options__chips" }, options.map((option, optionIndex) => createElement("span", { className: "field-modal-options__chip" }, [
        createElement("span", null, option),
        createElement("button", { type: "button", dataAction: "remove-field-modal-option", dataDropdownOptionIndex: optionIndex, ariaLabel: `Remove ${option}` }, "×"),
      ])))
      : createElement("p", { className: "field-modal-options__empty" }, "No choices yet. Type a choice and click +."),
    createElement("div", { className: "field-modal-options__add" }, [
      createElement("input", { className: "form-input", type: "text", value: draftValue, dataAction: "update-field-modal-option-draft", placeholder: "Example: WhatsApp" }),
      createElement("button", { className: "field-modal-options__add-button", type: "button", dataAction: "add-field-modal-option", ariaLabel: "Add dropdown choice" }, [createIcon("add")]),
    ]),
  ]);
}

function renderFieldModalListEditor(title, helpText, options, draftValue, draftAction, addAction, removeAction) {
  return createElement("section", { className: "field-modal-options", ariaLabel: title }, [
    createElement("div", { className: "field-modal-options__header" }, [
      createElement("strong", null, title),
      createElement("span", null, helpText),
    ]),
    options.length > 0
      ? createElement("div", { className: "field-modal-options__chips" }, options.map((option, optionIndex) => createElement("span", { className: "field-modal-options__chip" }, [
        createElement("span", null, option),
        createElement("button", { type: "button", dataAction: removeAction, dataOptionIndex: optionIndex, ariaLabel: `Remove ${option}` }, "×"),
      ])))
      : createElement("p", { className: "field-modal-options__empty" }, "No entries yet. Type one and click +."),
    createElement("div", { className: "field-modal-options__add" }, [
      createElement("input", { className: "form-input", type: "text", value: draftValue, dataAction: draftAction, placeholder: "Type a label..." }),
      createElement("button", { className: "field-modal-options__add-button", type: "button", dataAction: addAction, ariaLabel: `Add ${title}` }, [createIcon("add")]),
    ]),
  ]);
}

function renderKpiRow(appState, progress) {
  const products = Array.isArray(appState.products) ? appState.products : [];
  const sourcingCount = products.filter((product) => [3, 4].includes(product.current_active_stage_index)).length;
  const activePpcCount = products.filter((product) => product.metrics?.activePpc).length;

  return createElement("section", { className: "kpi-row", ariaLabel: "Launch summary" }, [
    renderKpiCard("Total Launches", String(products.length)),
    renderKpiCard("Sourcing", String(sourcingCount)),
    renderKpiCard("Active PPC", String(activePpcCount)),
    renderKpiCard("Avg Conversion Rate", "—"),
    renderKpiCard("Visible Tasks", `${progress.completed_visible_tasks}/${progress.total_visible_tasks}`),
  ]);
}

function renderKpiCard(label, value) {
  return createElement("article", { className: "kpi-card bg-surface-container-lowest" }, [
    createElement("p", { className: "kpi-card__label text-label-sm text-on-surface-variant" }, label),
    createElement("p", { className: "kpi-card__value text-headline-md" }, value),
  ]);
}

function renderPipelineProgress(activeProduct, progress) {
  const stagePercent = Math.round(progress.stage_index_ratio * 100);
  const currentStage = getVisibleStages(activeProduct).at(-1);

  return createElement("section", { className: "pipeline-progress bg-surface-container-lowest" }, [
    createElement("div", { className: "pipeline-progress__header" }, [
      createElement("div", null, [
        createElement("p", { className: "text-label-sm text-on-surface-variant" }, "Overall pipeline progress"),
        createElement("h2", { className: "text-label-md" }, currentStage?.label ?? "No active stage"),
      ]),
      createElement("p", { className: "text-label-md" }, `${stagePercent}%`),
    ]),
    createElement("div", { className: "pipeline-progress__track", role: "progressbar", ariaValueNow: stagePercent, ariaValueMin: 0, ariaValueMax: 100, ariaLabel: "Overall pipeline progress" }, [
      createElement("span", { className: "pipeline-progress__bar", style: { width: `${stagePercent}%` } }),
    ]),
  ]);
}

function renderSearchSummary(visibleStages) {
  if (!uiState.searchQuery) return null;

  return createElement("section", { className: "search-summary bg-surface-container-lowest", ariaLabel: "Visible search results" }, [
    createElement("p", { className: "text-label-md" }, `${visibleStages.length} visible stage results for “${uiState.searchQuery}”`),
    createElement("p", { className: "text-body-md text-on-surface-variant" }, "Search is scoped to the active product and currently visible stages only."),
  ]);
}

function renderSearchEmptyState() {
  return createElement("article", { className: "search-empty bg-surface-container-lowest" }, [
    createElement("h2", { className: "text-label-md" }, "No visible stage matches"),
    createElement("p", { className: "text-body-md text-on-surface-variant" }, "Try another search term. Hidden future stages are never included in search results."),
  ]);
}

function renderStageCard(activeProduct, stage, selectedStageId) {
  const stageBlock = getStageBlock(activeProduct, stage.stage_id);
  const isCurrentStage = stage.stage_index === activeProduct.current_active_stage_index;
  const isSelected = stage.stage_id === selectedStageId;
  const stageProgress = calculateStageProgress(activeProduct, stage.stage_id);
  const progressSummary = stageProgress.total_tasks === 0
    ? "No tasks yet"
    : `${stageProgress.completed_tasks}/${stageProgress.total_tasks} tasks complete`;

  const cardChildren = [
    createElement("button", {
      className: "stage-card__header",
      type: "button",
      dataAction: "select-stage",
      dataStageId: stage.stage_id,
      ariaExpanded: isSelected ? "true" : "false",
      ariaControls: `stage-panel-${stage.stage_id}`,
    }, [
      createElement("span", { className: "stage-card__index text-label-md" }, String(stage.stage_index)),
      createElement("span", { className: "stage-card__heading" }, [
        createElement("span", { className: "text-label-md" }, stage.label),
        createElement("span", { className: "text-label-sm text-on-surface-variant" }, isCurrentStage ? "Current active stage" : "Visible previous stage"),
      ]),
      createElement("span", { className: "stage-card__progress text-label-sm" }, progressSummary),
      createIcon(isSelected ? "expand_less" : "expand_more"),
    ]),
  ];

  if (isSelected && stageBlock) {
    cardChildren.push(
      createElement("div", { className: "stage-card__body", id: `stage-panel-${stage.stage_id}` }, [
        renderCustomFieldsSection(stage.stage_id, stageBlock),
        renderAddCustomFieldForm(stage.stage_id),
        renderChecklistSection(stage.stage_id, stageBlock),
        isCurrentStage && activeProduct.current_active_stage_index < MAX_STAGE_INDEX
          ? createElement("button", { className: "button-primary", type: "button", dataAction: "advance-stage", dataProductId: activeProduct.id }, "Advance to Next Stage")
          : null,
      ].filter(Boolean)),
    );
  }

  return createElement("article", { className: `stage-card bg-surface-container-lowest ${isCurrentStage ? "stage-card--current" : ""}` }, cardChildren);
}

function renderCustomFieldsSection(stageId, stageBlock) {
  const fields = stageBlock.custom_fields;
  return createElement("section", { className: "custom-fields", ariaLabel: "Custom fields" }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "Custom Fields"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, `${fields.length} fields`),
    ]),
    fields.length === 0
      ? createElement("p", { className: "empty-note text-body-md text-on-surface-variant" }, "No custom fields yet. Add one below to track stage-specific launch details.")
      : createElement("div", { className: "custom-fields__list" }, fields.map((field) => renderCustomField(stageId, field))),
  ]);
}

function renderAddCustomFieldForm(stageId) {
  return createElement("form", { className: "field-config bg-surface-container-low", dataAction: "add-custom-field", dataStageId: stageId }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "+ Add Custom Field"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, "Create metadata for this visible stage only."),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Field Name"),
      createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Supplier Quote", required: true }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Field Type"),
      createElement("select", { className: "form-input", name: "fieldType", required: true },
        CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType }, fieldType)),
      ),
    ]),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Custom Field"),
  ]);
}

function renderCustomField(stageId, field) {
  return createElement("article", { className: "custom-field", dataStageId: stageId, dataFieldId: field.field_id }, [
    createElement("div", { className: "custom-field__header" }, [
      createElement("h4", { className: "text-label-md" }, field.label),
      createElement("span", { className: "custom-field__type text-label-sm" }, field.type),
    ]),
    renderCustomFieldControl(stageId, field),
  ]);
}

function renderCustomFieldControl(stageId, field) {
  switch (field.type) {
    case "NUMBER":
      return renderInputField(stageId, field, { type: "number", value: field.value ?? "", step: "any" });
    case "LINK":
      return renderLinkField(stageId, field);
    case "CURRENCY":
      return renderCurrencyField(stageId, field);
    case "WEIGHT":
      return renderWeightField(stageId, field);
    case "SIZING":
      return renderSizingField(stageId, field);
    case "DATE":
      return renderInputField(stageId, field, { type: "date", value: field.value ?? "" });
    case "TEXT":
    default:
      return renderInputField(stageId, field, { type: "text", value: field.value ?? "" });
  }
}

function renderInputField(stageId, field, inputOptions) {
  return createElement("label", { className: "form-field" }, [
    createElement("span", { className: "text-label-sm" }, `${field.label} value`),
    createElement("input", {
      className: "form-input",
      type: inputOptions.type,
      value: inputOptions.value,
      step: inputOptions.step,
      dataAction: "update-field",
      dataStageId: stageId,
      dataFieldId: field.field_id,
    }),
  ]);
}

function renderLinkField(stageId, field) {
  const safeUrl = getSafeHttpUrl(field.value);
  return createElement("div", { className: "field-stack" }, [
    renderInputField(stageId, field, { type: "url", value: field.value ?? "" }),
    safeUrl
      ? createElement("a", { className: "field-link text-label-sm", href: safeUrl, target: "_blank", rel: "noopener noreferrer" }, "Open saved link")
      : createElement("p", { className: "empty-note text-label-sm text-on-surface-variant" }, "Enter a valid http or https URL to enable the saved link."),
  ]);
}

function renderCurrencyField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "compound-field" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Amount"),
      createElement("input", {
        className: "form-input",
        type: "number",
        step: "any",
        value: value.amount ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "amount",
      }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Currency"),
      createElement("input", {
        className: "form-input",
        type: "text",
        value: value.currency ?? "USD",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "currency",
      }),
    ]),
    createElement("p", { className: "field-preview text-label-sm text-on-surface-variant" }, formatCurrencyValue(value)),
  ]);
}

function renderWeightField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "compound-field" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Weight"),
      createElement("input", {
        className: "form-input",
        type: "number",
        step: "any",
        value: value.amount ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "amount",
      }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Unit"),
      createElement("select", {
        className: "form-input",
        value: value.unit ?? "lb",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "unit",
      }, ["g", "kg", "oz", "lb"].map((unit) => createElement("option", { value: unit, selected: unit === (value.unit ?? "lb") }, unit))),
    ]),
  ]);
}

function renderSizingField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "sizing-field" }, [
    renderSizingNumberInput(stageId, field, "length", value.length),
    renderSizingNumberInput(stageId, field, "width", value.width),
    renderSizingNumberInput(stageId, field, "height", value.height),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Unit"),
      createElement("select", {
        className: "form-input",
        value: value.unit ?? "in",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "unit",
      }, ["in", "cm"].map((unit) => createElement("option", { value: unit, selected: unit === (value.unit ?? "in") }, unit))),
    ]),
    createElement("label", { className: "form-field sizing-field__notes" }, [
      createElement("span", { className: "text-label-sm" }, "Sizing Notes"),
      createElement("input", {
        className: "form-input",
        type: "text",
        value: value.raw ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "raw",
      }),
    ]),
  ]);
}

function renderSizingNumberInput(stageId, field, part, value) {
  return createElement("label", { className: "form-field" }, [
    createElement("span", { className: "text-label-sm" }, capitalize(part)),
    createElement("input", {
      className: "form-input",
      type: "number",
      step: "any",
      value: value ?? "",
      dataAction: "update-field",
      dataStageId: stageId,
      dataFieldId: field.field_id,
      dataFieldPart: part,
    }),
  ]);
}

function renderChecklistSection(stageId, stageBlock) {
  const tasks = stageBlock.checklist_tasks;
  return createElement("section", { className: "stage-checklist", ariaLabel: "Stage checklist" }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "Stage Checklist"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, `${tasks.length} tasks`),
    ]),
    tasks.length === 0
      ? createElement("p", { className: "empty-note text-body-md text-on-surface-variant" }, "No checklist tasks yet. Add the next action item for this stage below.")
      : createElement("div", { className: "checklist-list" }, tasks.map((task) => renderChecklistTask(stageId, task))),
    renderAddTaskForm(stageId),
  ]);
}

function renderChecklistTask(stageId, task) {
  const inputId = `task-${task.task_id}`;
  return createElement("div", { className: `checklist-item ${task.is_completed ? "checklist-item--complete" : ""}` }, [
    createElement("input", {
      id: inputId,
      className: "checklist-item__checkbox",
      type: "checkbox",
      checked: task.is_completed,
      dataAction: "toggle-task",
      dataStageId: stageId,
      dataTaskId: task.task_id,
    }),
    createElement("label", { className: "checklist-item__label text-body-md", htmlFor: inputId }, task.task_name),
  ]);
}

function renderAddTaskForm(stageId) {
  return createElement("form", { className: "task-form", dataAction: "add-task", dataStageId: stageId }, [
    createElement("label", { className: "form-field task-form__input" }, [
      createElement("span", { className: "text-label-sm" }, "Task Name"),
      createElement("input", { className: "form-input", name: "taskName", type: "text", placeholder: "Example: Request supplier quote", required: true }),
    ]),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Task"),
  ]);
}

function renderContextPanel(contextPanel) {
  replaceChildren(contextPanel);
}

function handleAppDragStart(event) {
  const tableTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-table-column"], [data-action="drag-workspace-table-row"]') : null;
  if (tableTarget && event.dataTransfer) {
    if (!canEditWorkspaceData()) return;
    const productId = tableTarget.getAttribute("data-product-id");
    const stageId = tableTarget.getAttribute("data-stage-id");
    const fieldId = tableTarget.getAttribute("data-field-id");
    const axis = tableTarget.getAttribute("data-table-axis");
    const index = Number(tableTarget.getAttribute("data-table-index"));
    if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

    uiState.draggedTableSection = { productId, stageId, fieldId, axis, index };
    tableTarget.classList.add("workspace-table-field__heading--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(uiState.draggedTableSection));
    return;
  }

  const productTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-product"]') : null;
  if (productTarget && event.dataTransfer) {
    if (!canMoveProducts()) return;
    const productId = productTarget.getAttribute("data-product-id");
    if (!productId) return;

    uiState.draggedProductId = productId;
    productTarget.classList.add("product-card--drag-source");
    createProductDragGhost(productTarget, event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", productId);
    event.dataTransfer.setDragImage(createTransparentDragImage(), 0, 0);
    return;
  }

  const checklistTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-checklist"]') : null;
  if (checklistTarget && event.dataTransfer) {
    if (!canManageChecklistTasks()) return;
    const productId = checklistTarget.getAttribute("data-product-id");
    const stageId = checklistTarget.getAttribute("data-stage-id");
    const checklistId = checklistTarget.getAttribute("data-checklist-id");
    if (!productId || !stageId || !checklistId) return;

    uiState.draggedChecklistTask = { productId, stageId, checklistId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", checklistId);
    return;
  }

  const target = event.target instanceof Element ? event.target.closest('[data-action="drag-stage"]') : null;
  if (!target || !event.dataTransfer || !canEditPipelineTabs()) return;

  const stageId = target.getAttribute("data-stage-id");
  if (!stageId) return;

  uiState.draggedStageId = stageId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", stageId);
}

function handleAppDragOver(event) {
  updateProductDragGhost(event);
  const productStageTarget = event.target instanceof Element ? event.target.closest("[data-product-drop-stage-id]") : null;
  if (productStageTarget && uiState.draggedProductId) {
    if (!canMoveProducts()) return;
    event.preventDefault();
    setProductDropTarget(productStageTarget.getAttribute("data-product-drop-stage-id"));
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }
  if (uiState.draggedProductId) setProductDropTarget(null);

  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    if (!canManageChecklistTasks()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const tableTarget = event.target instanceof Element ? event.target.closest("[data-table-drop-axis]") : null;
  if (tableTarget && uiState.draggedTableSection) {
    document.querySelectorAll(".workspace-table-field__heading--drop-target").forEach((element) => {
      if (element !== tableTarget) element.classList.remove("workspace-table-field__heading--drop-target");
    });
    if (!canEditWorkspaceData()) return;
    const dropAxis = tableTarget.getAttribute("data-table-drop-axis");
    if (dropAxis !== uiState.draggedTableSection.axis) return;
    event.preventDefault();
    tableTarget.classList.add("workspace-table-field__heading--drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target || !uiState.draggedStageId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleAppDrop(event) {
  const productStageTarget = event.target instanceof Element ? event.target.closest("[data-product-drop-stage-id]") : null;
  if (productStageTarget && uiState.draggedProductId) {
    if (!canMoveProducts()) return;
    event.preventDefault();
    const productId = event.dataTransfer?.getData("text/plain") || uiState.draggedProductId;
    const targetStageId = productStageTarget.getAttribute("data-product-drop-stage-id");
    clearProductDragUi();
    uiState.draggedProductId = null;
    moveProductToStage(productId, targetStageId);
    renderFromCurrentState();
    return;
  }

  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    if (!canManageChecklistTasks()) return;
    event.preventDefault();
    const dropChecklistId = checklistTarget.getAttribute("data-checklist-drop-id");
    reorderWorkspaceChecklistTask(uiState.draggedChecklistTask, dropChecklistId);
    uiState.draggedChecklistTask = null;
    renderFromCurrentState();
    return;
  }

  const tableTarget = event.target instanceof Element ? event.target.closest("[data-table-drop-axis]") : null;
  if (tableTarget && uiState.draggedTableSection) {
    document.querySelectorAll(".workspace-table-field__heading--drop-target").forEach((element) => {
      if (element !== tableTarget) element.classList.remove("workspace-table-field__heading--drop-target");
    });
    if (!canEditWorkspaceData()) return;
    event.preventDefault();
    const dropAxis = tableTarget.getAttribute("data-table-drop-axis");
    const dropIndex = Number(tableTarget.getAttribute("data-table-drop-index"));
    if (dropAxis === uiState.draggedTableSection.axis && Number.isInteger(dropIndex)) {
      reorderWorkspaceTableSection(uiState.draggedTableSection, dropIndex);
    }
    uiState.draggedTableSection = null;
    renderFromCurrentState();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target || !canEditPipelineTabs()) return;

  event.preventDefault();
  const draggedStageId = event.dataTransfer?.getData("text/plain") || uiState.draggedStageId;
  const dropStageId = target.getAttribute("data-stage-drop-id");
  uiState.draggedStageId = null;
  reorderStage(draggedStageId, dropStageId);
  renderFromCurrentState();
}

function reorderStage(draggedStageId, dropStageId) {
  if (!draggedStageId || !dropStageId || draggedStageId === dropStageId) return;
  const nextSettings = cloneStageSettings(stageSettings);
  const draggedIndex = nextSettings.order.indexOf(draggedStageId);
  const dropIndex = nextSettings.order.indexOf(dropStageId);
  if (draggedIndex < 0 || dropIndex < 0) return;

  nextSettings.order.splice(draggedIndex, 1);
  nextSettings.order.splice(dropIndex, 0, draggedStageId);
  setStageSettings(nextSettings);
}

function handleAppDragMove(event) {
  updateProductDragGhost(event);
}

function handleAppDragEnd() {
  clearProductDragUi();
  document.querySelectorAll(".workspace-table-field__heading--dragging, .workspace-table-field__heading--drop-target").forEach((element) => {
    element.classList.remove("workspace-table-field__heading--dragging", "workspace-table-field__heading--drop-target");
  });
  uiState.draggedProductId = null;
  uiState.draggedStageId = null;
  uiState.draggedChecklistTask = null;
  uiState.draggedTableSection = null;
}

function createProductDragGhost(card, event) {
  clearProductDragUi();
  productDragGhost = card.cloneNode(true);
  productDragGhost.classList.add("product-drag-ghost");
  productDragGhost.setAttribute("aria-hidden", "true");
  document.body.appendChild(productDragGhost);
  updateProductDragGhost(event);
}

function updateProductDragGhost(event) {
  if (!productDragGhost || !uiState.draggedProductId) return;
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!x && !y) return;
  productDragGhost.style.left = `${x}px`;
  productDragGhost.style.top = `${y}px`;
}

function clearProductDragUi() {
  productDragGhost?.remove();
  productDragGhost = null;
  setProductDropTarget(null);
  document.querySelectorAll(".product-card--drag-source").forEach((element) => element.classList.remove("product-card--drag-source"));
}

function setProductDropTarget(stageId) {
  if (productDropStageId === stageId) return;
  productDropStageId = stageId;
  document.querySelectorAll("[data-product-drop-stage-id]").forEach((element) => {
    element.classList.toggle("sidebar-tab--product-drop-target", Boolean(stageId) && element.getAttribute("data-product-drop-stage-id") === stageId);
  });
}

function createTransparentDragImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

function handleAppDoubleClick(event) {
  const target = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-table-column"], [data-action="drag-workspace-table-row"]') : null;
  if (!target || !canEditWorkspaceData()) return;

  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  const axis = target.getAttribute("data-table-axis");
  const index = Number(target.getAttribute("data-table-index"));
  const currentLabel = String(target.textContent ?? "").trim();
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

  const nextLabel = typeof window !== "undefined" ? window.prompt(`Rename table ${axis}`, currentLabel) : null;
  if (nextLabel === null) return;
  renameWorkspaceTableSection({ productId, stageId, fieldId, axis, index }, nextLabel);
  renderFromCurrentState();
}

function handleAppClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) {
    if (uiState.activeChatProductId && event.target instanceof Element && event.target.classList.contains("product-chat-modal")) {
      closeProductChat();
      renderFromCurrentState();
    }
    return;
  }

  const action = target.getAttribute("data-action");
  if (action === "toggle-login-password") {
    uiState.showLoginPassword = !uiState.showLoginPassword;
    renderFromCurrentState();
    return;
  }

  if (action === "logout") {
    clearAuthSession();
    renderFromCurrentState();
    return;
  }

  if (action === "forgot-password") {
    uiState.authError = "Please contact the workspace owner to reset access for this prototype.";
    renderFromCurrentState();
    return;
  }

  if (action === "open-pipeline") {
    uiState.activeView = "pipeline";
    ensureSelectedProductForStage(true);
    renderFromCurrentState();
    return;
  }

  if (action === "open-settings") {
    uiState.activeView = "settings";
    uiState.settingsCategory = canManageUsers() ? "users" : getDefaultSettingsCategory();
    renderFromCurrentState();
    return;
  }

  if (action === "open-profile") {
    uiState.activeView = "settings";
    uiState.settingsCategory = "profile";
    renderFromCurrentState();
    return;
  }

  if (action === "select-settings-category") {
    const category = target.getAttribute("data-settings-category");
    if (canViewSettingsCategory(category)) uiState.settingsCategory = category;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-stage-editor") {
    if (!canEditPipelineTabs()) return;
    uiState.stageEditorOpen = !uiState.stageEditorOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stages") {
    if (!canEditPipelineTabs()) return;
    recoverAllStages();
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stage") {
    if (!canEditPipelineTabs()) return;
    recoverStage(target.getAttribute("data-stage-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "delete-stage") {
    if (!canEditPipelineTabs()) return;
    deleteStage(target.getAttribute("data-stage-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "open-add-stage-modal") {
    if (!canEditPipelineTabs()) return;
    uiState.addStageModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-add-stage-modal") {
    uiState.addStageModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "open-add-product-modal") {
    if (!canManageProducts()) return;
    uiState.addProductModalOpen = true;
    uiState.editingProductId = null;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-product") {
    if (!canManageProducts()) return;
    uiState.addProductModalOpen = true;
    uiState.editingProductId = target.getAttribute("data-product-id");
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product") {
    if (!canManageProducts()) return;
    deleteUserProduct(target.getAttribute("data-product-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "move-product-next-stage") {
    if (!canMoveProducts()) return;
    const movedProduct = moveProductToNextStage(target.getAttribute("data-product-id"));
    if (movedProduct) launchConfettiEffect(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-invite-user") {
    if (!canManageUsers()) return;
    uiState.settingsInviteModalOpen = true;
    uiState.editingTeamUserId = null;
    uiState.settingsUserNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "close-invite-user") {
    uiState.settingsInviteModalOpen = false;
    uiState.editingTeamUserId = null;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-team-user") {
    if (!canManageUsers()) return;
    uiState.editingTeamUserId = target.getAttribute("data-user-id");
    uiState.settingsInviteModalOpen = true;
    uiState.settingsUserNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "delete-team-user") {
    if (!canManageUsers()) return;
    deleteTeamUser(target.getAttribute("data-user-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "close-add-product-modal") {
    closeProductModal();
    renderFromCurrentState();
    return;
  }

  if (action === "select-stage") {
    uiState.activeView = "pipeline";
    uiState.selectedStageId = target.getAttribute("data-stage-id");
    ensureSelectedProductForStage(true);
    renderFromCurrentState();
    return;
  }

  if (action === "select-product") {
    const productId = target.getAttribute("data-product-id");
    const product = getProductById(productId);
    if (!product) return;
    uiState.selectedProductId = product.id;
    uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
    uiState.fieldModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-field-modal") {
    if (!canEditWorkspaceData()) return;
    openWorkspaceFieldModal(target, "create");
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-field") {
    if (!canEditWorkspaceData()) return;
    openWorkspaceFieldModal(target, "edit");
    renderFromCurrentState();
    return;
  }

  if (action === "close-field-modal") {
    uiState.fieldModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "delete-workspace-field") {
    if (!canEditWorkspaceData()) return;
    deleteWorkspaceFieldFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-field-modal-option") {
    if (!canEditWorkspaceData()) return;
    addFieldModalDropdownOption();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-field-modal-option") {
    if (!canEditWorkspaceData()) return;
    removeFieldModalDropdownOption(target);
    renderFromCurrentState();
    return;
  }

  const fieldModalListActions = {
    "add-field-modal-table-column": () => addFieldModalListItem("tableColumns", "tableColumnDraft"),
    "add-field-modal-table-row": () => addFieldModalListItem("tableRows", "tableRowDraft"),
    "add-field-modal-checklist-item": () => addFieldModalListItem("checklistItems", "checklistItemDraft"),
    "remove-field-modal-table-column": () => removeFieldModalListItem("tableColumns", target),
    "remove-field-modal-table-row": () => removeFieldModalListItem("tableRows", target),
    "remove-field-modal-checklist-item": () => removeFieldModalListItem("checklistItems", target),
  };
  if (fieldModalListActions[action]) {
    if (!canEditWorkspaceData()) return;
    fieldModalListActions[action]();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-long-bar-token") {
    if (!canEditWorkspaceData()) return;
    removeLongBarTokenFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "track-shipment") {
    trackShipmentFromButton(target);
    return;
  }

  if (action === "clear-workspace-link") {
    if (!canEditWorkspaceData()) return;
    clearWorkspaceLinkFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "clear-shipment-tracking") {
    if (!canEditWorkspaceData()) return;
    clearShipmentTrackingFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-payment-modal") {
    if (!canEditWorkspaceData()) return;
    openPaymentStatusModal(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-payment-transaction") {
    if (!canEditWorkspaceData()) return;
    if (deletePaymentTransactionFromButton(target)) renderFromCurrentState();
    return;
  }

  if (action === "close-payment-modal") {
    uiState.paymentModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "remove-workspace-file-field") {
    if (!canEditWorkspaceData()) return;
    removeWorkspaceFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    removePaymentFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product-image") {
    if (!canManageProducts()) return;
    deleteProductImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "export-product-data") {
    exportProductDataFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "close-product-chat") {
    closeProductChat();
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-chat-assets") {
    uiState.chatAssetsOpen = !uiState.chatAssetsOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-assets") {
    uiState.chatAssetsOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-chat-search") {
    uiState.chatSearchOpen = !uiState.chatSearchOpen;
    if (!uiState.chatSearchOpen) uiState.chatSearchQuery = "";
    renderFromCurrentState();
    restoreChatSearchFocus();
    return;
  }

  if (action === "clear-chat-search") {
    uiState.chatSearchQuery = "";
    renderFromCurrentState();
    restoreChatSearchFocus();
    return;
  }

  if (action === "toggle-chat-emoji-menu") {
    uiState.chatEmojiOpen = !uiState.chatEmojiOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "open-chat-attachment-preview") {
    uiState.chatAttachmentPreview = target.getAttribute("data-attachment-id");
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-attachment-preview") {
    uiState.chatAttachmentPreview = null;
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "remove-pending-chat-file") {
    removePendingChatAttachment(target);
    renderFromCurrentState();
    return;
  }

  if (action === "format-chat-text") {
    formatChatComposer(target);
    return;
  }

  if (action === "insert-chat-emoji") {
    insertChatEmoji(target);
    return;
  }

  if (action === "open-checklist-note") {
    if (!canManageChecklistTasks()) return;
    openChecklistNoteModal(target);
    renderFromCurrentState();
    return;
  }

  if (action === "close-checklist-note") {
    uiState.checklistNoteModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-stage") {
    const stageId = target.getAttribute("data-stage-id");
    if (!stageId) return;
    toggleWorkspaceStage(stageId);
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-checklist-panel") {
    toggleWorkspaceChecklistPanel(target);
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-checklist-completed") {
    toggleWorkspaceChecklistCompletedVisibility(target);
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    editWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    deleteWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "advance-stage") {
    if (!canMoveProducts()) return;
    const productId = target.getAttribute("data-product-id");
    advanceProductStage(productId);
    launchConfettiEffect(target);
  }
}

function handleAppInput(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-email") {
    uiState.loginDraft.email = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-password") {
    uiState.loginDraft.password = target.value;
    return;
  }

  if (target.getAttribute("data-action") === "rename-stage") {
    if (!canEditPipelineTabs()) return;
    renameStage(target.getAttribute("data-stage-id"), "value" in target ? target.value : "");
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    updateWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-payment-modal-field") {
    if (!canEditWorkspaceData()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-text"].includes(target.getAttribute("data-action"))) {
    if (!canEditWorkspaceData()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-label") {
    if (uiState.fieldModal) uiState.fieldModal.fieldLabel = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-option-draft") {
    if (uiState.fieldModal) uiState.fieldModal.dropdownOptionDraft = target.value;
    return;
  }

  const fieldModalDraftKeys = {
    "update-field-modal-table-column-draft": "tableColumnDraft",
    "update-field-modal-table-row-draft": "tableRowDraft",
    "update-field-modal-checklist-item-draft": "checklistItemDraft",
  };
  const draftKey = fieldModalDraftKeys[target.getAttribute("data-action")];
  if (target instanceof HTMLInputElement && draftKey) {
    if (uiState.fieldModal) uiState.fieldModal[draftKey] = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-team-search") {
    uiState.settingsUserSearchQuery = target.value;
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-chat-search") {
    const selectionStart = target.selectionStart ?? target.value.length;
    uiState.chatSearchQuery = target.value;
    renderFromCurrentState();
    restoreChatSearchFocus(selectionStart);
    return;
  }

  if (!(target instanceof HTMLInputElement) || target.getAttribute("data-action") !== "update-search") return;

  const selectionStart = target.selectionStart ?? target.value.length;
  uiState.searchQuery = target.value;
  renderFromCurrentState();
  restoreSearchFocus(selectionStart);
}

function handleAppChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const action = target.getAttribute("data-action");
  if (target instanceof HTMLInputElement && action === "update-login-remember") {
    uiState.loginDraft.remember = target.checked;
    return;
  }

  if (action === "update-field") {
    updateFieldFromInput(target);
    return;
  }

  if (action === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    updateWorkspaceFieldFromInput(target);
    if (target.getAttribute("data-field-part") === "url") renderFromCurrentState();
    return;
  }

  if (action === "upload-workspace-file-field") {
    if (!canEditWorkspaceData()) return;
    uploadWorkspaceFileFieldFromInput(target);
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

  if (action === "update-payment-modal-field") {
    if (!canEditWorkspaceData()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (action === "update-field-modal-type") {
    updateFieldModalType(target);
    renderFromCurrentState();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-item", "update-workspace-checklist-note-text"].includes(action)) {
    if (!canEditWorkspaceData()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    return;
  }

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target);
    return;
  }

  if (action === "toggle-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    toggleWorkspaceChecklistTask(target);
    return;
  }

  if (action === "add-chat-files") {
    if (!canSendChatMessages()) return;
    addChatFilesFromInput(target);
    return;
  }

  if (action === "toggle-task") {
    if (!canManageChecklistTasks()) return;
    const activeProduct = getActiveProduct();
    const stageId = target.getAttribute("data-stage-id");
    const taskId = target.getAttribute("data-task-id");
    if (!activeProduct || !stageId || !taskId) return;
    toggleChecklistTask(activeProduct.id, stageId, taskId);
  }
}

function handleAppSubmit(event) {
  const form = event.target instanceof Element ? event.target.closest("form[data-action]") : null;
  if (!form) return;

  const action = form.getAttribute("data-action");
  if (action === "login") {
    event.preventDefault();
    submitLoginForm(form);
    return;
  }

  if (action === "add-custom-field") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    submitCustomFieldForm(form);
    return;
  }

  if (action === "workspace-save-custom-field") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    submitWorkspaceCustomFieldForm(form);
    return;
  }

  if (action === "add-workspace-checklist") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitWorkspaceChecklistForm(form);
    return;
  }

  if (action === "save-payment-status") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    savePaymentStatusForm(form);
    return;
  }

  if (action === "save-checklist-note") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitChecklistNoteForm(form);
    return;
  }

  if (action === "send-product-chat") {
    event.preventDefault();
    if (!canSendChatMessages()) return;
    submitProductChatMessage(form);
    return;
  }

  if (action === "invite-user") {
    event.preventDefault();
    if (!canManageUsers()) return;
    submitInviteUserForm(form);
    return;
  }

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form);
    return;
  }

  if (action === "create-stage") {
    event.preventDefault();
    if (!canEditPipelineTabs()) return;
    submitAddStageForm(form);
    return;
  }

  if (action === "add-task") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitTaskForm(form);
  }
}

function submitCustomFieldForm(form) {
  const activeProduct = getActiveProduct();
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const label = String(formData.get("fieldLabel") ?? "").trim();
  const type = String(formData.get("fieldType") ?? "");

  if (!activeProduct || !stageId || !label || !CUSTOM_FIELD_TYPES.includes(type)) return;
  addCustomField(activeProduct.id, stageId, { label, type });
}

function submitTaskForm(form) {
  const activeProduct = getActiveProduct();
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const taskName = String(formData.get("taskName") ?? "").trim();

  if (!activeProduct || !stageId || !taskName) return;
  addChecklistTask(activeProduct.id, stageId, taskName);
}

function submitAddStageForm(form) {
  if (!canEditPipelineTabs()) return;
  const formData = new FormData(form);
  const stageName = String(formData.get("stageName") ?? "").trim();
  if (!stageName) return;

  const stage = createCustomStage(stageName);
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.customStages.push(stage);
  nextSettings.order.push(stage.id);
  setStageSettings(nextSettings);

  uiState.activeView = "pipeline";
  uiState.selectedStageId = stage.id;
  uiState.addStageModalOpen = false;
  ensureSelectedProductForStage(true);
  renderFromCurrentState();
}

function createCustomStage(label) {
  const stageIdBase = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "custom-stage";
  let stageId = `custom-${stageIdBase}`;
  const existingStageIds = new Set(getBaseStageTabs().map((stageTab) => stageTab.id));
  while (existingStageIds.has(stageId)) {
    stageId = `custom-${stageIdBase}-${Math.random().toString(36).slice(2, 5)}`;
  }

  return {
    id: stageId,
    label,
    panelLabel: `${label} Pipeline`,
    icon: "add_box",
  };
}

function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

  const productId = form.getAttribute("data-product-id");

  if (!stageId || !productName) return;

  if (imageFile && imageFile.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      saveProductFromModal({
        productId,
        stageId,
        name: productName,
        sku,
        asin,
        imageDataUrl: typeof reader.result === "string" ? reader.result : "",
      });
    });
    reader.readAsDataURL(imageFile);
    return;
  }

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageDataUrl: "" });
}

function saveProductFromModal(productInput) {
  if (productInput.productId) {
    updateProduct(productInput);
    return;
  }

  createUserProduct(productInput);
}

function createUserProduct({ stageId, name, sku, asin, imageDataUrl }) {
  const product = {
    id: createUserProductId(),
    name,
    sku,
    asin,
    stageId,
    readinessPercent: 0,
  };

  setUserProducts([...userProducts, product]);
  saveProductImageIfPresent(product.id, imageDataUrl);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageDataUrl }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

  const product = { ...existingProduct, stageId, name, sku, asin };
  if (isUserProduct(product.id)) {
    setUserProducts(userProducts.map((item) => (item.id === product.id ? product : item)));
  } else {
    setProductSettings({
      ...productSettings,
      edits: {
        ...productSettings.edits,
        [product.id]: { name: product.name, sku: product.sku, asin: product.asin, stageId: product.stageId },
      },
    });
  }
  saveProductImageIfPresent(product.id, imageDataUrl);
  selectProductAfterSave(product);
}

function saveProductImageIfPresent(productId, imageDataUrl) {
  if (!imageDataUrl) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = imageDataUrl;
  setWorkspaceDetails(nextDetails);
}

function selectProductAfterSave(product) {
  uiState.selectedStageId = product.stageId;
  uiState.selectedProductId = product.id;
  uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  closeProductModal();
  uiState.fieldModal = null;
  uiState.checklistNoteModal = null;
  renderFromCurrentState();
}

function closeProductModal() {
  uiState.addProductModalOpen = false;
  uiState.editingProductId = null;
}

function getEditableProduct(productId) {
  return getAllProducts().find((product) => product.id === productId) ?? null;
}

function isUserProduct(productId) {
  return userProducts.some((product) => product.id === productId);
}

function moveProductToNextStage(productId) {
  if (!canMoveProducts()) return null;
  const product = getEditableProduct(productId);
  const nextStageId = product ? getNextProductStageId(product) : null;
  if (!product || !nextStageId) return null;

  return moveProductToStage(product.id, nextStageId);
}

function moveProductToStage(productId, stageId) {
  if (!canMoveProducts()) return null;
  const product = getEditableProduct(productId);
  if (!product || !isDroppableProductStage(stageId) || product.stageId === stageId) return null;

  const movedProduct = { ...product, stageId };
  persistProductStageChange(movedProduct);
  return movedProduct;
}

function isDroppableProductStage(stageId) {
  return getSidebarStageTabs().some((stageTab) => stageTab.id === stageId);
}

function persistProductStageChange(product) {
  if (isUserProduct(product.id)) {
    setUserProducts(userProducts.map((item) => (item.id === product.id ? product : item)));
    return;
  }

  setProductSettings({
    ...productSettings,
    edits: {
      ...productSettings.edits,
      [product.id]: { name: product.name, sku: product.sku, asin: product.asin, stageId: product.stageId },
    },
  });
}

function getNextProductStageId(product) {
  const stageOrder = getSidebarStageTabs().map((stageTab) => stageTab.id);
  const currentIndex = stageOrder.indexOf(product?.stageId);
  if (currentIndex < 0 || currentIndex >= stageOrder.length - 1) return null;
  return stageOrder[currentIndex + 1];
}

function deleteUserProduct(productId) {
  if (!canManageProducts() || !getEditableProduct(productId)) return;
  if (isUserProduct(productId)) {
    setUserProducts(userProducts.filter((product) => product.id !== productId));
  } else {
    setProductSettings({
      ...productSettings,
      deletedProductIds: [...new Set([...productSettings.deletedProductIds, productId])],
    });
  }

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  delete nextDetails.products?.[productId];
  setWorkspaceDetails(nextDetails);

  if (uiState.selectedProductId === productId) {
    uiState.selectedProductId = null;
    ensureSelectedProductForStage(true);
  }
}

function updateFieldFromInput(input) {
  const activeProduct = getActiveProduct();
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!activeProduct || !stageId || !fieldId) return;

  const stageBlock = getStageBlock(activeProduct, stageId);
  const field = stageBlock?.custom_fields.find((customField) => customField.field_id === fieldId);
  if (!field) return;

  const part = input.getAttribute("data-field-part");
  const inputValue = getInputValue(input);

  if (!part) {
    updateCustomFieldValue(activeProduct.id, stageId, fieldId, inputValue);
    return;
  }

  const currentValue = field.value && typeof field.value === "object" ? field.value : {};
  updateCustomFieldValue(activeProduct.id, stageId, fieldId, {
    ...currentValue,
    [part]: inputValue,
  });
}

function getInputValue(input) {
  if (input instanceof HTMLInputElement && input.type === "number") {
    return input.value === "" ? null : Number(input.value);
  }
  return "value" in input ? input.value : "";
}

function getSidebarStageTabs() {
  const tabMap = new Map(getBaseStageTabs().map((stageTab) => [stageTab.id, stageTab]));
  return stageSettings.order
    .map((stageId) => tabMap.get(stageId))
    .filter(Boolean)
    .filter((stageTab) => !stageSettings.hiddenStageIds.includes(stageTab.id))
    .map((stageTab) => ({
      ...stageTab,
      label: stageSettings.labels[stageTab.id] || stageTab.label,
    }));
}

function getHiddenSidebarStageTabs() {
  const tabMap = new Map(getBaseStageTabs().map((stageTab) => [stageTab.id, stageTab]));
  return stageSettings.hiddenStageIds
    .map((stageId) => tabMap.get(stageId))
    .filter(Boolean)
    .map((stageTab) => ({
      ...stageTab,
      label: stageSettings.labels[stageTab.id] || stageTab.label,
    }));
}

function renameStage(stageId, label) {
  if (!stageId) return;
  const cleanLabel = String(label ?? "").trim();
  const nextSettings = cloneStageSettings(stageSettings);
  if (cleanLabel) {
    nextSettings.labels[stageId] = cleanLabel;
  } else {
    delete nextSettings.labels[stageId];
  }
  setStageSettings(nextSettings);
}

function moveStage(stageId, direction) {
  if (!stageId || !["up", "down"].includes(direction)) return;
  const nextSettings = cloneStageSettings(stageSettings);
  const currentIndex = nextSettings.order.indexOf(stageId);
  if (currentIndex < 0) return;
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= nextSettings.order.length) return;
  [nextSettings.order[currentIndex], nextSettings.order[nextIndex]] = [nextSettings.order[nextIndex], nextSettings.order[currentIndex]];
  setStageSettings(nextSettings);
}

function deleteStage(stageId) {
  if (!stageId || getStageDeleteWarning(stageId)) return;
  const nextSettings = cloneStageSettings(stageSettings);
  if (!nextSettings.hiddenStageIds.includes(stageId)) {
    nextSettings.hiddenStageIds.push(stageId);
  }
  setStageSettings(nextSettings);
  if (uiState.selectedStageId === stageId) {
    uiState.selectedStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
    ensureSelectedProductForStage(true);
  }
}

function recoverStage(stageId) {
  if (!stageId) return;
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.hiddenStageIds = nextSettings.hiddenStageIds.filter((hiddenStageId) => hiddenStageId !== stageId);
  setStageSettings(nextSettings);
}

function recoverAllStages() {
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.hiddenStageIds = [];
  setStageSettings(nextSettings);
}

function getStageDeleteWarning(stageId) {
  const productCount = getProductsForSelectedTab(stageId).length;
  const fieldCount = countWorkspaceFieldsForStage(stageId);
  if (productCount > 0 || fieldCount > 0) {
    return `Protected: clear ${productCount} product${productCount === 1 ? "" : "s"} and ${fieldCount} field${fieldCount === 1 ? "" : "s"} before deleting.`;
  }
  return "";
}

function countWorkspaceFieldsForStage(stageId) {
  return Object.values(workspaceDetails.products ?? {}).reduce((totalFields, productDetails) => {
    const fields = productDetails?.stages?.[stageId]?.customFields;
    return totalFields + (Array.isArray(fields) ? fields.length : 0);
  }, 0);
}

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = window.localStorage.getItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  try {
    return normalizeStageSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultStageSettings();
  }
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
}

function createDefaultStageSettings() {
  return {
    order: SIDEBAR_STAGE_TABS.map((stageTab) => stageTab.id),
    labels: {},
    hiddenStageIds: [],
    customStages: [],
  };
}

function cloneStageSettings(settings) {
  return {
    order: [...settings.order],
    labels: { ...settings.labels },
    hiddenStageIds: [...settings.hiddenStageIds],
    customStages: [...settings.customStages],
  };
}

function normalizeStageSettings(settings) {
  const customStages = Array.isArray(settings?.customStages)
    ? settings.customStages.map(normalizeCustomStage).filter(Boolean)
    : [];
  const knownStageIds = [...SIDEBAR_STAGE_TABS.map((stageTab) => stageTab.id), ...customStages.map((stageTab) => stageTab.id)];
  const incomingOrder = Array.isArray(settings?.order) ? settings.order : [];
  const normalizedOrder = [
    ...incomingOrder.filter((stageId) => knownStageIds.includes(stageId)),
    ...knownStageIds.filter((stageId) => !incomingOrder.includes(stageId)),
  ];
  const incomingLabels = settings?.labels && typeof settings.labels === "object" ? settings.labels : {};
  const labels = Object.fromEntries(
    Object.entries(incomingLabels)
      .filter(([stageId]) => knownStageIds.includes(stageId))
      .map(([stageId, label]) => [stageId, String(label ?? "").trim()])
      .filter(([, label]) => label),
  );

  return {
    order: normalizedOrder,
    labels,
    hiddenStageIds: Array.isArray(settings?.hiddenStageIds)
      ? settings.hiddenStageIds.filter((stageId) => knownStageIds.includes(stageId))
      : [],
    customStages,
  };
}

function normalizeCustomStage(stage) {
  const id = String(stage?.id ?? "").trim();
  const label = String(stage?.label ?? "").trim();
  if (!id || !label) return null;
  return {
    id,
    label,
    panelLabel: String(stage?.panelLabel ?? "").trim() || `${label} Pipeline`,
    icon: String(stage?.icon ?? "").trim() || "add_box",
  };
}

function getBaseStageTabs(settings = stageSettings) {
  return [...SIDEBAR_STAGE_TABS, ...(settings?.customStages ?? [])];
}

function ensureSelectedProductForStage(forceStageReset = false) {
  const selectedProducts = getProductsForSelectedTab(uiState.selectedStageId);
  const selectedProductIsVisible = selectedProducts.some((product) => product.id === uiState.selectedProductId);
  const nextProduct = selectedProductIsVisible ? getProductById(uiState.selectedProductId) : selectedProducts[0];
  const selectedProductChanged = nextProduct?.id !== uiState.selectedProductId;

  uiState.selectedProductId = nextProduct?.id ?? null;
  if (nextProduct && (selectedProductChanged || forceStageReset)) {
    uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  }
}

function getSelectedProduct() {
  ensureSelectedProductForStage();
  return getProductById(uiState.selectedProductId);
}

function getProductById(productId) {
  return getAllProducts().find((product) => product.id === productId) ?? null;
}

function getWorkspaceStagesForDemoProduct(product) {
  const visibleStages = getVisibleStagesForDemoProduct(product);
  const preOptimizationStages = visibleStages.filter((stage) => stage.stage_index <= 12);
  const customProductStage = getCustomWorkspaceStage(product?.stageId);

  if (customProductStage) {
    return [...visibleStages, customProductStage];
  }

  if (uiState.selectedStageId === "optimization") {
    return [...preOptimizationStages, OPTIMIZATION_WORKSPACE_STAGE];
  }

  if (isPostOptimizationWorkflowSelected()) {
    const postOptimizationStages = visibleStages.filter((stage) => stage.stage_index >= 13);
    return [
      ...preOptimizationStages,
      OPTIMIZATION_WORKSPACE_STAGE,
      ...postOptimizationStages,
    ];
  }

  return visibleStages;
}

function isPostOptimizationWorkflowSelected() {
  return ["stable", "scaling"].includes(uiState.selectedStageId);
}

function getWorkspaceStageDisplayIndex(stage) {
  if (stage.stage_id === "optimization") return 13;
  if (stage.stage_index >= 13) return stage.stage_index + 1;
  return stage.stage_index;
}

function getVisibleStagesForDemoProduct(product) {
  const activeStageIndex = getDemoProductStageIndex(product);
  return LAUNCHFLOW_STAGES.filter((stage) => stage.stage_index <= activeStageIndex);
}

function getDefaultExpandedWorkspaceStageIds() {
  return new Set();
}

function getWorkspaceStageStatus(product, stage) {
  if (stage.stage_id === "optimization") {
    return uiState.selectedStageId === "optimization" ? "Current optimization workspace" : "Visible optimization step";
  }
  if (getCustomWorkspaceStage(stage.stage_id)) {
    return "Current custom stage";
  }
  return stage.stage_id === product.stageId ? "Current product stage" : "Visible previous stage";
}

function getDemoProductStageIndex(product) {
  if (product?.stageId === "optimization") return 12;
  return LAUNCHFLOW_STAGES.find((stage) => stage.stage_id === product?.stageId)?.stage_index ?? 1;
}

function getCustomWorkspaceStage(stageId) {
  const stageTab = getBaseStageTabs().find((tab) => tab.id === stageId && !SIDEBAR_STAGE_TABS.some((baseTab) => baseTab.id === tab.id));
  if (!stageTab) return null;
  return {
    stage_id: stageTab.id,
    stage_index: MAX_STAGE_INDEX + 1,
    label: stageTab.label,
    phase: "custom",
  };
}

function renderAsinValue(product) {
  if (!product.asin) return "N/A";

  return createElement("a", {
    className: "workspace-product-card__asin-link",
    href: getAmazonListingUrl(product.asin),
    target: "_blank",
    rel: "noreferrer",
  }, product.asin);
}

function getAmazonListingUrl(asin) {
  return `https://www.amazon.com/dp/${encodeURIComponent(String(asin).trim())}`;
}

function getChecklistCollapseKey(productId, stageId) {
  return `${productId}:${stageId}`;
}

function toggleWorkspaceChecklistPanel(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const checklistKey = getChecklistCollapseKey(productId, stageId);
  const nextExpandedChecklistIds = new Set(uiState.expandedChecklistIds);
  if (nextExpandedChecklistIds.has(checklistKey)) {
    nextExpandedChecklistIds.delete(checklistKey);
  } else {
    nextExpandedChecklistIds.add(checklistKey);
  }
  uiState.expandedChecklistIds = nextExpandedChecklistIds;
}

function toggleWorkspaceStage(stageId) {
  const nextExpandedStageIds = new Set(uiState.expandedWorkspaceStageIds);
  if (nextExpandedStageIds.has(stageId)) {
    nextExpandedStageIds.delete(stageId);
  } else {
    nextExpandedStageIds.add(stageId);
  }
  uiState.expandedWorkspaceStageIds = nextExpandedStageIds;
}

function openProductChat(target) {
  const productId = target.getAttribute("data-product-id");
  if (!getProductById(productId)) return;
  uiState.activeChatProductId = productId;
  uiState.chatAssetsOpen = false;
  uiState.chatEmojiOpen = false;
  uiState.chatSearchOpen = false;
  uiState.chatSearchQuery = "";
  uiState.chatAttachmentPreview = null;
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
}

function closeProductChat() {
  uiState.activeChatProductId = null;
  uiState.chatAssetsOpen = false;
  uiState.chatEmojiOpen = false;
  uiState.chatSearchOpen = false;
  uiState.chatSearchQuery = "";
  uiState.chatAttachmentPreview = null;
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
}

function handleAppKeyDown(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || event.key !== "Enter") return;

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-option-draft") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    if (uiState.fieldModal) uiState.fieldModal.dropdownOptionDraft = target.value;
    addFieldModalDropdownOption();
    renderFromCurrentState();
    return;
  }

  const fieldModalEnterActions = {
    "update-field-modal-table-column-draft": () => addFieldModalListItem("tableColumns", "tableColumnDraft"),
    "update-field-modal-table-row-draft": () => addFieldModalListItem("tableRows", "tableRowDraft"),
    "update-field-modal-checklist-item-draft": () => addFieldModalListItem("checklistItems", "checklistItemDraft"),
  };
  const enterAction = fieldModalEnterActions[target.getAttribute("data-action")];
  if (target instanceof HTMLInputElement && enterAction) {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    enterAction();
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "add-long-bar-token") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    addLongBarTokenFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (!(target instanceof HTMLTextAreaElement) || target.getAttribute("data-action") !== "chat-message-input") return;

  if (event.shiftKey) {
    if (isCurrentChatLineBulleted(target)) {
      event.preventDefault();
      replaceTextAreaSelection(target, "\n• ");
    }
    return;
  }

  event.preventDefault();
  target.closest("form")?.requestSubmit();
}

function isCurrentChatLineBulleted(textarea) {
  const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
  return textarea.value.slice(lineStart, textarea.selectionStart).trimStart().startsWith("•");
}

function formatChatComposer(target) {
  const format = target.getAttribute("data-chat-format");
  const composer = document.querySelector('.product-chat-composer__input[data-action="chat-message-input"]');
  if (!(composer instanceof HTMLTextAreaElement)) return;

  const selectedText = composer.value.slice(composer.selectionStart, composer.selectionEnd) || "";
  const formattedText = format === "bold"
    ? toStyledChatText(selectedText || "text", "bold")
    : format === "italic"
      ? toStyledChatText(selectedText || "text", "italic")
      : `${composer.selectionStart === 0 ? "" : "\n"}• ${selectedText}`;
  replaceTextAreaSelection(composer, formattedText);
}

function toStyledChatText(text, style) {
  return Array.from(text).map((character) => styleChatCharacter(character, style)).join("");
}

function styleChatCharacter(character, style) {
  const code = character.codePointAt(0);
  const existingStyle = getChatCharacterStyle(code);
  const targetStyle = getCombinedChatStyle(existingStyle, style);
  const baseCode = getBaseChatCharacterCode(code, existingStyle);

  if (baseCode >= 65 && baseCode <= 90) return String.fromCodePoint(getStyledChatCodePoint(baseCode, targetStyle, "upper"));
  if (baseCode >= 97 && baseCode <= 122) return String.fromCodePoint(getStyledChatCodePoint(baseCode, targetStyle, "lower"));
  if (baseCode >= 48 && baseCode <= 57 && targetStyle === "bold") return String.fromCodePoint(0x1d7ce + (baseCode - 48));
  return character;
}

function getChatCharacterStyle(code) {
  if ((code >= 0x1d400 && code <= 0x1d419) || (code >= 0x1d41a && code <= 0x1d433) || (code >= 0x1d7ce && code <= 0x1d7d7)) return "bold";
  if ((code >= 0x1d434 && code <= 0x1d44d) || (code >= 0x1d44e && code <= 0x1d467)) return "italic";
  if ((code >= 0x1d468 && code <= 0x1d481) || (code >= 0x1d482 && code <= 0x1d49b)) return "bolditalic";
  return "plain";
}

function getCombinedChatStyle(existingStyle, nextStyle) {
  if (existingStyle === "bolditalic") return "bolditalic";
  if ((existingStyle === "bold" && nextStyle === "italic") || (existingStyle === "italic" && nextStyle === "bold")) return "bolditalic";
  return nextStyle;
}

function getBaseChatCharacterCode(code, existingStyle) {
  if (existingStyle === "bold") {
    if (code >= 0x1d400 && code <= 0x1d419) return 65 + code - 0x1d400;
    if (code >= 0x1d41a && code <= 0x1d433) return 97 + code - 0x1d41a;
    if (code >= 0x1d7ce && code <= 0x1d7d7) return 48 + code - 0x1d7ce;
  }
  if (existingStyle === "italic") {
    if (code >= 0x1d434 && code <= 0x1d44d) return 65 + code - 0x1d434;
    if (code >= 0x1d44e && code <= 0x1d467) return 97 + code - 0x1d44e;
  }
  if (existingStyle === "bolditalic") {
    if (code >= 0x1d468 && code <= 0x1d481) return 65 + code - 0x1d468;
    if (code >= 0x1d482 && code <= 0x1d49b) return 97 + code - 0x1d482;
  }
  return code;
}

function getStyledChatCodePoint(baseCode, style, casing) {
  const offset = baseCode - (casing === "upper" ? 65 : 97);
  if (style === "bold") return (casing === "upper" ? 0x1d400 : 0x1d41a) + offset;
  if (style === "italic") return (casing === "upper" ? 0x1d434 : 0x1d44e) + offset;
  if (style === "bolditalic") return (casing === "upper" ? 0x1d468 : 0x1d482) + offset;
  return baseCode;
}

function insertChatEmoji(target) {
  const emoji = target.getAttribute("data-emoji");
  const composer = document.querySelector('.product-chat-composer__input[data-action="chat-message-input"]');
  if (!(composer instanceof HTMLTextAreaElement) || !emoji) return;
  insertIntoTextArea(composer, emoji);
  uiState.chatEmojiOpen = false;
  renderFromCurrentState();
}

function insertIntoTextArea(textarea, text) {
  replaceTextAreaSelection(textarea, `${text}`);
}

function replaceTextAreaSelection(textarea, text) {
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, selectionStart)}${text}${textarea.value.slice(selectionEnd)}`;
  const nextCursor = selectionStart + text.length;
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
}

function submitProductChatMessage(form) {
  if (!canSendChatMessages()) return;
  const productId = form.getAttribute("data-product-id");
  const formData = new FormData(form);
  const messageText = String(formData.get("chatMessage") ?? "").trim();
  const attachments = [...uiState.pendingChatAttachments];
  if (!productId || uiState.chatUploadingFiles || (!messageText && attachments.length === 0)) return;

  uiState.pendingChatAttachments = [];
  form.reset();

  appendProductChatMessage(productId, {
    messageId: createChatMessageId(),
    sender: "user",
    text: messageText,
    createdAt: new Date().toISOString(),
    attachments,
  });

  renderFromCurrentState();
  scrollActiveChatToLatest();
}

function addChatFilesFromInput(input) {
  if (!canSendChatMessages() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const files = Array.from(input.files ?? []);
  if (!productId || files.length === 0) return;

  uiState.chatUploadingFiles = true;
  renderFromCurrentState();
  scrollActiveChatToLatest();

  Promise.all(files.map(readChatAttachmentFile)).then((attachments) => {
    uiState.pendingChatAttachments = [...uiState.pendingChatAttachments, ...attachments];
    uiState.chatUploadingFiles = false;
    input.value = "";
    renderFromCurrentState();
    scrollActiveChatToLatest();
  });
}

function removePendingChatAttachment(target) {
  const attachmentId = target.getAttribute("data-attachment-id");
  uiState.pendingChatAttachments = uiState.pendingChatAttachments.filter((attachment) => attachment.attachmentId !== attachmentId);
}

function readChatAttachmentFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        attachmentId: createChatAttachmentId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: typeof reader.result === "string" ? reader.result : "",
      });
    });
    reader.readAsDataURL(file);
  });
}

function appendProductChatMessage(productId, message) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.chatMessages.push(message);
  setWorkspaceDetails(nextDetails);
}

function scrollActiveChatToLatest() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const messages = document.querySelector(".product-chat__messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

function getProductChatAssets(messages) {
  return messages.flatMap((message) => {
    const links = extractLinksFromText(message.text).map((url) => ({ kind: "link", url, createdAt: message.createdAt }));
    const attachments = (message.attachments ?? []).map((attachment) => ({ kind: "attachment", createdAt: message.createdAt, ...attachment }));
    return [...links, ...attachments];
  });
}

function getFilteredChatMessages(messages, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return messages;
  return messages.filter((message) => chatMessageMatchesSearch(message, normalizedQuery));
}

function chatMessageMatchesSearch(message, normalizedQuery) {
  const searchableParts = [
    message.text,
    ...(message.attachments ?? []).flatMap((attachment) => [attachment.name, attachment.type]),
    ...extractLinksFromText(message.text),
  ];
  return searchableParts.some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function getFilteredChatAssets(assets, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return assets;
  return assets.filter((asset) => chatAssetMatchesSearch(asset, normalizedQuery));
}

function chatAssetMatchesSearch(asset, normalizedQuery) {
  return [asset.url, asset.name, asset.type, asset.kind].some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function groupProductChatAssets(assets) {
  return assets.reduce((groups, asset) => {
    if (asset.kind === "link") {
      groups.links.push(asset);
    } else if (asset.type?.startsWith("image/")) {
      groups.images.push(asset);
    } else if (asset.type?.startsWith("video/")) {
      groups.videos.push(asset);
    } else {
      groups.files.push(asset);
    }
    return groups;
  }, { images: [], videos: [], files: [], links: [] });
}

function extractLinksFromText(text) {
  const matches = String(text ?? "").match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/gi) ?? [];
  return matches.map(normalizeChatUrl);
}

function formatChatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Today";
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function formatChatTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Now";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatFileSize(size) {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize) || numericSize <= 0) return "0 KB";
  if (numericSize < 1024 * 1024) return `${Math.ceil(numericSize / 1024)} KB`;
  return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
}

function createChatMessageId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createChatAttachmentId() {
  return `chat_file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") return;
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
    productDetails.imageDataUrl = reader.result;
    setWorkspaceDetails(nextDetails);
    renderFromCurrentState();
  });
  reader.readAsDataURL(file);
}

function deleteProductImageFromButton(target) {
  if (!canManageProducts()) return;
  const productId = target.getAttribute("data-product-id");
  if (!productId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  setWorkspaceDetails(nextDetails);
}

function copyProductSkuFromButton(target) {
  const product = getProductById(target.getAttribute("data-product-id"));
  const sku = product?.sku || "N/A";
  if (!product) return;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(sku).catch(() => {});
  }

  showSkuCopiedIndicator(product.id);
}

function showSkuCopiedIndicator(productId) {
  uiState.copiedSkuProductId = productId;
  if (uiState.skuCopyTimeoutId) {
    window.clearTimeout(uiState.skuCopyTimeoutId);
  }
  renderFromCurrentState();
  uiState.skuCopyTimeoutId = window.setTimeout(() => {
    uiState.copiedSkuProductId = null;
    uiState.skuCopyTimeoutId = null;
    renderFromCurrentState();
  }, 1400);
}

function exportProductDataFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const product = getProductById(productId);
  if (!product) return;

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    product,
    visibleStages: getWorkspaceStagesForDemoProduct(product),
    workspaceDetails: getWorkspaceProductDetails(product.id),
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `${product.sku || product.id}-launchflow-export.json`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
}

function getWorkspaceProductDetails(productId) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  workspaceDetails = nextDetails;
  return productDetails;
}

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", stages: {}, chatMessages: [] };
  details.products[productId].imageDataUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

function getProductTargetPrice(product) {
  return 24.99 + getDemoProductStageIndex(product);
}

function getProductCogs(product) {
  return Number((getProductTargetPrice(product) * 0.42).toFixed(2));
}

function getProductProfit(product) {
  return Number((getProductTargetPrice(product) - getProductCogs(product)).toFixed(2));
}

function getProductMargin(product) {
  return Math.round((getProductProfit(product) / getProductTargetPrice(product)) * 100);
}

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function getProductBsrTarget(product) {
  return product.stageId === "product-research" ? "< 5,000" : "< 10,000";
}

function openWorkspaceFieldModal(target, mode) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const fieldId = mode === "edit" ? target.getAttribute("data-field-id") : null;
  const field = fieldId ? getWorkspaceStageDetails(productId, stageId).customFields.find((item) => item.fieldId === fieldId) : null;

  uiState.fieldModal = {
    mode,
    productId,
    stageId,
    fieldId,
    fieldLabel: field?.label ?? "",
    selectedType: field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value,
    dropdownOptions: getCustomDropdownOptions(field),
    dropdownOptionDraft: "",
    tableColumns: getCustomTableColumns(field),
    tableRows: getCustomTableRows(field),
    tableColumnDraft: "",
    tableRowDraft: "",
    checklistItems: getChecklistNotesItems(field),
    checklistItemDraft: "",
  };
}

function deleteWorkspaceFieldFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  removeStageFieldTemplate(nextDetails, stageId, fieldId);
  removeWorkspaceFieldFromProducts(nextDetails, stageId, fieldId);
  setWorkspaceDetails(nextDetails);

  if (uiState.fieldModal?.fieldId === fieldId) {
    uiState.fieldModal = null;
  }
}

function submitWorkspaceChecklistForm(form) {
  if (!canManageChecklistTasks()) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const taskName = String(formData.get("taskName") ?? "").trim();
  if (!productId || !stageId || !taskName) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  stageDetails.checklistTasks.push({
    taskId: createWorkspaceChecklistId(),
    name: taskName,
    isCompleted: false,
    completedAt: null,
    note: "",
  });
  setWorkspaceDetails(nextDetails);
  form.reset();
  renderFromCurrentState();
}

function toggleWorkspaceChecklistTask(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const checklistId = input.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.isCompleted = Boolean(input.checked);
  task.completedAt = task.isCompleted ? new Date().toISOString() : null;
  setWorkspaceDetails(nextDetails);
  renderFromCurrentState();
}

function toggleWorkspaceChecklistCompletedVisibility(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const checklistKey = getChecklistCollapseKey(productId, stageId);
  const nextHiddenCompletedChecklistIds = new Set(uiState.hiddenCompletedChecklistIds);
  if (nextHiddenCompletedChecklistIds.has(checklistKey)) {
    nextHiddenCompletedChecklistIds.delete(checklistKey);
  } else {
    nextHiddenCompletedChecklistIds.add(checklistKey);
  }
  uiState.hiddenCompletedChecklistIds = nextHiddenCompletedChecklistIds;
}

function editWorkspaceChecklistTaskFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const currentTask = getWorkspaceChecklistTask(workspaceDetails, productId, stageId, checklistId);
  if (!currentTask) return;

  const nextName = window.prompt("Edit checklist task", currentTask.name);
  if (nextName === null) return;
  const trimmedName = nextName.trim();
  if (!trimmedName) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;
  task.name = trimmedName;
  setWorkspaceDetails(nextDetails);
}

function deleteWorkspaceChecklistTaskFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const currentTask = getWorkspaceChecklistTask(workspaceDetails, productId, stageId, checklistId);
  if (!currentTask || !window.confirm(`Delete checklist task "${currentTask.name}"?`)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  stageDetails.checklistTasks = stageDetails.checklistTasks.filter((task) => task.taskId !== checklistId);
  setWorkspaceDetails(nextDetails);
}

function reorderWorkspaceChecklistTask(draggedTask, dropChecklistId) {
  if (!draggedTask || !dropChecklistId || draggedTask.checklistId === dropChecklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, draggedTask.productId, draggedTask.stageId);
  const draggedIndex = stageDetails.checklistTasks.findIndex((task) => task.taskId === draggedTask.checklistId);
  const dropIndex = stageDetails.checklistTasks.findIndex((task) => task.taskId === dropChecklistId);
  if (draggedIndex < 0 || dropIndex < 0) return;

  const [draggedItem] = stageDetails.checklistTasks.splice(draggedIndex, 1);
  stageDetails.checklistTasks.splice(dropIndex, 0, draggedItem);
  setWorkspaceDetails(nextDetails);
}

function openChecklistNoteModal(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;
  uiState.checklistNoteModal = { productId, stageId, checklistId };
}

function submitChecklistNoteForm(form) {
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const checklistId = form.getAttribute("data-checklist-id");
  const formData = new FormData(form);
  const note = String(formData.get("taskNote") ?? "").trim();
  if (!productId || !stageId || !checklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.note = note;
  setWorkspaceDetails(nextDetails);
  uiState.checklistNoteModal = null;
  renderFromCurrentState();
}

function getWorkspaceChecklistTask(details, productId, stageId, checklistId) {
  const stageDetails = ensureWorkspaceStageDetails(details, productId, stageId);
  return stageDetails.checklistTasks.find((task) => task.taskId === checklistId) ?? null;
}

function formatCompletionDate(completedAt) {
  if (!completedAt) return "just now";

  const completedDate = new Date(completedAt);
  if (Number.isNaN(completedDate.getTime())) return "just now";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfCompletedDate = new Date(completedDate);
  startOfCompletedDate.setHours(0, 0, 0, 0);

  const daysSinceCompletion = Math.max(0, Math.round((startOfToday - startOfCompletedDate) / 86_400_000));
  if (daysSinceCompletion === 0) return "today";
  if (daysSinceCompletion === 1) return "yesterday";
  if (daysSinceCompletion < 7) return `${daysSinceCompletion} days ago`;

  return completedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function updateFieldModalType(select) {
  if (!uiState.fieldModal) return;
  uiState.fieldModal.selectedType = String(select.value ?? "");
  if (uiState.fieldModal.selectedType !== "CUSTOM_DROPDOWN") uiState.fieldModal.dropdownOptionDraft = "";
  if (uiState.fieldModal.selectedType !== "CUSTOM_TABLE") {
    uiState.fieldModal.tableColumnDraft = "";
    uiState.fieldModal.tableRowDraft = "";
  }
  if (uiState.fieldModal.selectedType !== "CHECKLIST_NOTES") uiState.fieldModal.checklistItemDraft = "";
}

function addFieldModalDropdownOption() {
  if (!uiState.fieldModal) return;
  const option = String(uiState.fieldModal.dropdownOptionDraft ?? "").trim();
  if (!option) return;
  const options = getFieldModalDropdownOptions();
  if (!options.includes(option)) options.push(option);
  uiState.fieldModal.dropdownOptions = options;
  uiState.fieldModal.dropdownOptionDraft = "";
}

function removeFieldModalDropdownOption(button) {
  if (!uiState.fieldModal) return;
  const optionIndex = Number(button.getAttribute("data-dropdown-option-index"));
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return;
  uiState.fieldModal.dropdownOptions = getFieldModalDropdownOptions().filter((_, index) => index !== optionIndex);
}

function getFieldModalDropdownOptions(field = null) {
  if (uiState.fieldModal?.dropdownOptions) return normalizeDropdownOptions(uiState.fieldModal.dropdownOptions);
  return getCustomDropdownOptions(field);
}

function addFieldModalListItem(listKey, draftKey) {
  if (!uiState.fieldModal) return;
  const item = String(uiState.fieldModal[draftKey] ?? "").trim();
  if (!item) return;
  const items = normalizeFieldList(uiState.fieldModal[listKey]);
  if (!items.includes(item)) items.push(item);
  uiState.fieldModal[listKey] = items;
  uiState.fieldModal[draftKey] = "";
}

function removeFieldModalListItem(listKey, button) {
  if (!uiState.fieldModal) return;
  const optionIndex = Number(button.getAttribute("data-option-index"));
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return;
  uiState.fieldModal[listKey] = normalizeFieldList(uiState.fieldModal[listKey]).filter((_, index) => index !== optionIndex);
}

function getFieldModalTableColumns(field = null) {
  if (uiState.fieldModal?.tableColumns) return normalizeFieldList(uiState.fieldModal.tableColumns);
  return getCustomTableColumns(field);
}

function getFieldModalTableRows(field = null) {
  if (uiState.fieldModal?.tableRows) return normalizeFieldList(uiState.fieldModal.tableRows);
  return getCustomTableRows(field);
}

function getFieldModalChecklistItems(field = null) {
  if (uiState.fieldModal?.checklistItems) return normalizeFieldList(uiState.fieldModal.checklistItems);
  return getChecklistNotesItems(field);
}

function submitWorkspaceCustomFieldForm(form) {
  if (!canEditWorkspaceData()) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const fieldId = form.getAttribute("data-field-id");
  const formData = new FormData(form);
  const label = String(formData.get("fieldLabel") ?? uiState.fieldModal?.fieldLabel ?? "").trim();
  const type = String(formData.get("fieldType") ?? uiState.fieldModal?.selectedType ?? "");
  const dropdownOptions = type === "CUSTOM_DROPDOWN" ? getFieldModalDropdownOptions() : [];
  const tableColumns = type === "CUSTOM_TABLE" ? getFieldModalTableColumns() : [];
  const tableRows = type === "CUSTOM_TABLE" ? getFieldModalTableRows() : [];
  const checklistItems = type === "CHECKLIST_NOTES" ? getFieldModalChecklistItems() : [];

  if (!productId || !stageId || !label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const template = {
    fieldId: fieldId || createWorkspaceFieldId(),
    label,
    type,
    value: createWorkspaceFieldInitialValue(type),
    options: type === "CUSTOM_DROPDOWN" ? dropdownOptions : [],
    tableColumns: type === "CUSTOM_TABLE" ? tableColumns : [],
    tableRows: type === "CUSTOM_TABLE" ? tableRows : [],
    checklistItems: type === "CHECKLIST_NOTES" ? checklistItems : [],
  };

  upsertStageFieldTemplate(nextDetails, stageId, template);
  syncWorkspaceFieldDefinitionToProducts(nextDetails, stageId, template);

  setWorkspaceDetails(nextDetails);
  uiState.fieldModal = null;
  renderFromCurrentState();
}

function addLongBarTokenFromInput(input) {
  const token = String(input.value ?? "").trim();
  if (!token) return;
  updateLongBarTokens(input, (tokens) => tokens.includes(token) ? tokens : [...tokens, token]);
  input.value = "";
}

function removeLongBarTokenFromButton(button) {
  const tokenIndex = Number(button.getAttribute("data-token-index"));
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0) return;
  updateLongBarTokens(button, (tokens) => tokens.filter((_, index) => index !== tokenIndex));
}

function updateLongBarTokens(source, updater) {
  const productId = source.getAttribute("data-product-id");
  const stageId = source.getAttribute("data-stage-id");
  const fieldId = source.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (field?.type !== "LONG_BAR") return;
  if (!field) return;

  field.value = updater(getLongBarTokens(field.value));
  setWorkspaceDetails(nextDetails);
}

function uploadWorkspaceFileFieldFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []);
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map(readWorkspaceFieldFile)).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "FILE_UPLOAD") return;

    field.value = [...normalizeWorkspaceFileList(field.value), ...uploadedFiles];
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  });
}

function removeWorkspaceFileFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const attachmentId = button.getAttribute("data-attachment-id");
  if (!productId || !stageId || !fieldId || !attachmentId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "FILE_UPLOAD") return;

  field.value = normalizeWorkspaceFileList(field.value).filter((file) => file.attachmentId !== attachmentId);
  setWorkspaceDetails(nextDetails);
}

function openPaymentStatusModal(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  const paymentId = target.getAttribute("data-payment-id");
  if (!productId || !stageId || !fieldId) return;

  const field = getWorkspaceStageDetails(productId, stageId).customFields.find((item) => item.fieldId === fieldId && item.type === "PAYMENT_STATUS");
  if (!field) return;

  const value = normalizePaymentStatusValue(field.value);
  const editingPayment = paymentId ? value.history.find((entry) => entry.paymentId === paymentId) : null;
  uiState.paymentModal = {
    productId,
    stageId,
    fieldId,
    editingPaymentId: editingPayment?.paymentId ?? null,
    value: {
      ...value,
      paymentTitle: editingPayment?.paymentTitle ?? "",
      paymentMode: editingPayment?.mode ?? "partial",
      partialAmount: editingPayment?.amount ?? "",
      paymentDate: editingPayment?.date || value.paymentDate || getTodayDateInputValue(),
      invoiceNumber: editingPayment?.invoiceNumber ?? "",
      paymentDescription: editingPayment?.paymentDescription ?? "",
    },
  };
}

function updatePaymentModalDraft(input) {
  if (!uiState.paymentModal) return;
  const fieldPart = input.getAttribute("data-field-part");
  if (!fieldPart) return;

  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  if (fieldPart === "paymentTitle") {
    value.paymentTitle = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "isFullPaid") {
    value.paymentMode = input instanceof HTMLInputElement && input.checked ? "full" : "partial";
    if (value.paymentMode === "full") {
      const totals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
      value.partialAmount = totals.totalCost;
      const amountInput = document.querySelector('[name="partialAmount"][data-action="update-payment-modal-field"]');
      if (amountInput instanceof HTMLInputElement) amountInput.value = value.partialAmount;
    }
  } else if (["totalCost", "partialAmount"].includes(fieldPart)) {
    value[fieldPart] = getNonNegativeAmount(input instanceof HTMLInputElement ? input.value : "");
    if (fieldPart === "totalCost" && value.paymentMode === "full") {
      const totals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
      value.partialAmount = totals.totalCost;
      const amountInput = document.querySelector('[name="partialAmount"][data-action="update-payment-modal-field"]');
      if (amountInput instanceof HTMLInputElement) amountInput.value = value.partialAmount;
    }
  } else if (fieldPart === "paymentDate") {
    value.paymentDate = input instanceof HTMLInputElement ? input.value : "";
  } else if (fieldPart === "invoiceNumber") {
    value.invoiceNumber = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "paymentDescription") {
    value.paymentDescription = input instanceof HTMLTextAreaElement ? input.value : "";
  }
  uiState.paymentModal.value = value;
}

function getPaymentModalPreview(value) {
  const normalizedValue = normalizePaymentStatusValue(value);
  const totalCost = Number(normalizedValue.totalCost || 0);
  const currentPaymentAmount = normalizedValue.paymentMode === "full" && normalizedValue.partialAmount === ""
    ? totalCost
    : Number(normalizedValue.partialAmount || 0);
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((currentPaymentAmount / totalCost) * 100)) : 0;
  const balance = Math.max(totalCost - currentPaymentAmount, 0);
  const balancePercent = totalCost > 0 ? Math.max(0, Math.round((balance / totalCost) * 100)) : 0;
  return { paidPercent, balance, balancePercent };
}

function updatePaymentModalBalancePreview() {
  if (!uiState.paymentModal) return;
  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  const { paidPercent, balance, balancePercent } = getPaymentModalPreview(value);
  const amountLabel = document.querySelector(".workspace-payment-modal__amount-label");
  const balanceAmount = document.querySelector(".workspace-payment-modal__balance-amount");
  const balancePercentText = document.querySelector(".workspace-payment-modal__balance-percent");

  if (amountLabel) amountLabel.textContent = `Payment Amount (${paidPercent}%)`;
  if (balanceAmount) balanceAmount.textContent = formatCurrency(balance);
  if (balancePercentText) balancePercentText.textContent = `${balancePercent}% remaining`;
}

function savePaymentStatusForm(form) {
  if (!uiState.paymentModal) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const fieldId = form.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return;

  const previousValue = normalizePaymentStatusValue(field.value);
  const nextValue = normalizePaymentStatusValue(uiState.paymentModal.value);
  const totalCost = Number(nextValue.totalCost || 0);
  const enteredAmount = Number(nextValue.partialAmount || 0);
  const paidAmount = nextValue.paymentMode === "full" && enteredAmount <= 0 ? totalCost : enteredAmount;
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((paidAmount / totalCost) * 100)) : 0;
  const paymentDate = nextValue.paymentDate || getTodayDateInputValue();
  const editingPaymentId = uiState.paymentModal.editingPaymentId;
  const nextHistory = [...previousValue.history];
  const transaction = normalizePaymentHistoryEntry({
    paymentId: editingPaymentId || createPaymentHistoryId(),
    paymentTitle: nextValue.paymentTitle,
    amount: paidAmount,
    percent: paidPercent,
    date: paymentDate,
    mode: nextValue.paymentMode,
    invoiceNumber: nextValue.invoiceNumber,
    paymentDescription: nextValue.paymentDescription,
    createdAt: editingPaymentId ? nextHistory.find((entry) => entry.paymentId === editingPaymentId)?.createdAt : new Date().toISOString(),
  });

  if (transaction) {
    if (editingPaymentId) {
      const transactionIndex = nextHistory.findIndex((entry) => entry.paymentId === editingPaymentId);
      if (transactionIndex >= 0) nextHistory[transactionIndex] = transaction;
    } else if (!paymentHistoryHasEntry(nextHistory, transaction)) {
      nextHistory.push(transaction);
    }
  }

  const updatedTotals = calculatePaymentTotals({ ...nextValue, history: nextHistory });
  field.value = normalizePaymentStatusValue({
    ...nextValue,
    paymentMode: updatedTotals.isFullPaid ? "full" : "partial",
    partialAmount: updatedTotals.paidAmount,
    files: previousValue.files,
    history: nextHistory,
  });
  setWorkspaceDetails(nextDetails);
  uiState.paymentModal = null;
  renderFromCurrentState();
}

function paymentHistoryHasEntry(history, transaction) {
  return history.some((entry) => Number(entry.amount) === Number(transaction.amount)
    && entry.date === transaction.date
    && entry.mode === transaction.mode
    && String(entry.paymentTitle ?? "").trim() === String(transaction.paymentTitle ?? "").trim()
    && String(entry.invoiceNumber ?? "").trim() === String(transaction.invoiceNumber ?? "").trim());
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}


function calculatePaymentTotals(value, excludedPaymentId = null) {
  const normalizedValue = normalizePaymentStatusValue(value);
  const totalCost = Number(normalizedValue.totalCost || 0);
  const paymentHistory = normalizedValue.history.filter((entry) => entry.paymentId !== excludedPaymentId);
  const historyPaidAmount = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const legacyPaidAmount = normalizedValue.paymentMode === "full" ? totalCost : Number(normalizedValue.partialAmount || 0);
  const paidBeforeCurrent = historyPaidAmount;
  const rawPaidAmount = normalizedValue.history.length > 0 ? historyPaidAmount : legacyPaidAmount;
  const paidAmount = totalCost > 0 ? Math.min(rawPaidAmount, totalCost) : rawPaidAmount;
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((paidAmount / totalCost) * 100)) : 0;
  const balanceAmount = Math.max(totalCost - paidAmount, 0);
  const balancePercent = Math.max(100 - paidPercent, 0);
  return { totalCost, paidBeforeCurrent, paidAmount, paidPercent, balanceAmount, balancePercent, isFullPaid: totalCost > 0 && balanceAmount <= 0 };
}

function formatPaymentDateWords(dateValue) {
  if (!dateValue) return "No date";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}


function deletePaymentTransactionFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const paymentId = button.getAttribute("data-payment-id");
  if (!productId || !stageId || !fieldId || !paymentId) return false;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return false;

  const value = normalizePaymentStatusValue(field.value);
  const transaction = value.history.find((entry) => entry.paymentId === paymentId);
  if (!transaction || !confirmPaymentTransactionDelete(transaction)) return false;

  const nextHistory = value.history.filter((entry) => entry.paymentId !== paymentId);
  const updatedTotals = calculatePaymentTotals({ ...value, history: nextHistory });
  field.value = normalizePaymentStatusValue({
    ...value,
    paymentMode: updatedTotals.isFullPaid ? "full" : "partial",
    partialAmount: updatedTotals.paidAmount,
    files: value.files,
    history: nextHistory,
  });
  setWorkspaceDetails(nextDetails);
  return true;
}

function confirmPaymentTransactionDelete(transaction) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;

  const title = transaction.paymentTitle || "this payment transaction";
  const amount = formatCurrency(transaction.amount);
  return window.confirm(`Delete ${title} (${amount})? This action cannot be undone.`);
}

function uploadPaymentFileFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []);
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map(readWorkspaceFieldFile)).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "PAYMENT_STATUS") return;

    const value = normalizePaymentStatusValue(field.value);
    value.files = [...value.files, ...uploadedFiles];
    field.value = normalizePaymentStatusValue(value);
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  });
}

function removePaymentFileFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const attachmentId = button.getAttribute("data-attachment-id");
  if (!productId || !stageId || !fieldId || !attachmentId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return;

  const value = normalizePaymentStatusValue(field.value);
  value.files = value.files.filter((file) => file.attachmentId !== attachmentId);
  field.value = value;
  setWorkspaceDetails(nextDetails);
}

function readWorkspaceFieldFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        attachmentId: createWorkspaceFileId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: typeof reader.result === "string" ? reader.result : "",
        uploadedAt: new Date().toISOString(),
      });
    });
    reader.readAsDataURL(file);
  });
}

function reorderWorkspaceTableSection(draggedSection, dropIndex) {
  if (!draggedSection || !["column", "row"].includes(draggedSection.axis) || draggedSection.index === dropIndex) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, draggedSection.productId, draggedSection.stageId, draggedSection.fieldId);
  if (!currentField || currentField.type !== "CUSTOM_TABLE") return;

  const template = getWorkspaceTableTemplate(nextDetails, draggedSection.stageId, currentField);
  const columns = getCustomTableColumns(template);
  const rows = getCustomTableRows(template);
  const sectionLength = draggedSection.axis === "column" ? columns.length : rows.length;
  if (!isValidReorderIndex(draggedSection.index, dropIndex, sectionLength)) return;

  if (draggedSection.axis === "column") {
    template.tableColumns = reorderListItem(columns, draggedSection.index, dropIndex);
  } else {
    template.tableRows = reorderListItem(rows, draggedSection.index, dropIndex);
  }

  syncWorkspaceTableDefinitionToProducts(nextDetails, draggedSection.stageId, template, (field, previousRows, previousColumns) => {
    const tableValue = resizeCustomTableValue(field.value, previousRows.length, previousColumns.length);
    field.value = draggedSection.axis === "column"
      ? tableValue.map((row) => reorderListItem(row, draggedSection.index, dropIndex))
      : reorderListItem(tableValue, draggedSection.index, dropIndex);
  });

  setWorkspaceDetails(nextDetails);
}

function renameWorkspaceTableSection(section, nextLabel) {
  const label = String(nextLabel ?? "").trim();
  if (!label || !section || !["column", "row"].includes(section.axis)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, section.productId, section.stageId, section.fieldId);
  if (!currentField || currentField.type !== "CUSTOM_TABLE") return;

  const template = getWorkspaceTableTemplate(nextDetails, section.stageId, currentField);
  const listKey = section.axis === "column" ? "tableColumns" : "tableRows";
  const labels = normalizeFieldList(template[listKey]);
  if (!Number.isInteger(section.index) || section.index < 0 || section.index >= labels.length) return;

  labels[section.index] = label;
  template[listKey] = labels;
  syncWorkspaceTableDefinitionToProducts(nextDetails, section.stageId, template);
  setWorkspaceDetails(nextDetails);
}

function getWorkspaceTableTemplate(details, stageId, field) {
  const templates = getStageFieldTemplates(details, stageId);
  let template = templates.find((item) => item.fieldId === field.fieldId && item.type === "CUSTOM_TABLE");
  if (!template) {
    template = normalizeWorkspaceFieldDefinition(field);
    if (template) templates.push(template);
  }
  return template;
}

function syncWorkspaceTableDefinitionToProducts(details, stageId, template, valueUpdater = null) {
  const normalizedTemplate = normalizeWorkspaceFieldDefinition(template);
  if (!normalizedTemplate) return;
  upsertStageFieldTemplate(details, stageId, normalizedTemplate);

  for (const productDetails of Object.values(details.products ?? {})) {
    const stageDetails = productDetails?.stages?.[stageId];
    if (!stageDetails) continue;
    const field = stageDetails.customFields?.find((item) => item.fieldId === normalizedTemplate.fieldId && item.type === "CUSTOM_TABLE");
    if (!field) continue;

    const previousRows = getCustomTableRows(field);
    const previousColumns = getCustomTableColumns(field);
    field.tableColumns = [...normalizedTemplate.tableColumns];
    field.tableRows = [...normalizedTemplate.tableRows];
    if (valueUpdater) {
      valueUpdater(field, previousRows, previousColumns);
    } else {
      field.value = resizeCustomTableValue(field.value, getEffectiveTableRowCount(normalizedTemplate), getEffectiveTableColumnCount(normalizedTemplate));
    }
  }
}

function isValidReorderIndex(fromIndex, toIndex, length) {
  return Number.isInteger(fromIndex) && Number.isInteger(toIndex) && fromIndex >= 0 && toIndex >= 0 && fromIndex < length && toIndex < length;
}

function reorderListItem(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function updateStructuredWorkspaceFieldFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;

  if (input.getAttribute("data-action") === "update-workspace-table-cell") {
    const rowIndex = Number(input.getAttribute("data-row-index"));
    const columnIndex = Number(input.getAttribute("data-column-index"));
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    const rows = getCustomTableRows(field);
    const columns = getCustomTableColumns(field);
    const effectiveRows = rows.length > 0 ? rows : [""];
    const effectiveColumns = columns.length > 0 ? columns : ["Details"];
    const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);
    tableValue[rowIndex][columnIndex] = getWorkspaceInputValue(input);
    field.value = tableValue;
  }

  if (input.getAttribute("data-action") === "update-workspace-checklist-note-item") {
    const itemIndex = Number(input.getAttribute("data-option-index"));
    const item = getChecklistNotesItems(field)[itemIndex];
    if (!item || !(input instanceof HTMLInputElement)) return;
    const value = normalizeChecklistNotesValue(field.value, getChecklistNotesItems(field));
    value.checked[item] = input.checked;
    field.value = value;
  }

  if (input.getAttribute("data-action") === "update-workspace-checklist-note-text") {
    const value = normalizeChecklistNotesValue(field.value, getChecklistNotesItems(field));
    value.notes = getWorkspaceInputValue(input);
    field.value = value;
  }

  setWorkspaceDetails(nextDetails);
}

function updateWorkspaceFieldFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;

  const fieldPart = input.getAttribute("data-field-part");
  const value = getWorkspaceInputValue(input);
  if (fieldPart) {
    const currentValue = getWorkspaceFieldPartValue(field);
    field.value = { ...currentValue, [fieldPart]: value };
  } else {
    field.value = value;
  }

  setWorkspaceDetails(nextDetails);
}

function getWorkspaceFieldPartValue(field) {
  if (field?.type === "LINK") return normalizeWorkspaceLinkValue(field.value, field.label);
  return field?.value && typeof field.value === "object" && !Array.isArray(field.value) ? field.value : {};
}

function getWorkspaceInputValue(input) {
  if (input instanceof HTMLInputElement && input.type === "number") {
    return input.value === "" ? "" : Number(input.value);
  }
  return "value" in input ? input.value : "";
}

function getWorkspaceStageDetails(productId, stageId) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  workspaceDetails = nextDetails;
  return stageDetails;
}

function ensureWorkspaceStageDetails(details, productId, stageId) {
  const productDetails = ensureWorkspaceProductDetails(details, productId);
  productDetails.stages[stageId] ??= { customFields: [], checklistTasks: [] };
  productDetails.stages[stageId].customFields ??= [];
  productDetails.stages[stageId].checklistTasks ??= [];
  syncStageTemplatesIntoStageDetails(details, stageId, productDetails.stages[stageId]);
  return productDetails.stages[stageId];
}

function ensureWorkspaceProductField(details, productId, stageId, fieldId) {
  const stageDetails = ensureWorkspaceStageDetails(details, productId, stageId);
  return stageDetails.customFields.find((field) => field.fieldId === fieldId) ?? null;
}

function getStageFieldTemplates(details, stageId) {
  details.stageFieldTemplates ??= {};
  details.stageFieldTemplates[stageId] ??= [];
  return details.stageFieldTemplates[stageId];
}

function cloneWorkspaceFieldDefinition(field) {
  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label: String(field?.label ?? "").trim(),
    type: String(field?.type ?? ""),
    options: field?.type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: field?.type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: field?.type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableRows) : [],
    checklistItems: field?.type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
  };
}

function normalizeWorkspaceFieldDefinition(field) {
  const normalizedField = normalizeWorkspaceField(field);
  if (!normalizedField) return null;
  return {
    ...cloneWorkspaceFieldDefinition(normalizedField),
    value: createWorkspaceFieldInitialValue(normalizedField.type),
  };
}

function createWorkspaceFieldFromTemplate(template, existingField = null) {
  const definition = cloneWorkspaceFieldDefinition(template);
  return {
    ...definition,
    value: getSyncedWorkspaceFieldValue(definition, existingField),
  };
}

function getSyncedWorkspaceFieldValue(definition, existingField = null) {
  if (!existingField || existingField.type !== definition.type) return createWorkspaceFieldInitialValue(definition.type);

  if (definition.type === "CUSTOM_DROPDOWN") {
    const selectedValue = normalizeWorkspaceFieldValue(definition.type, existingField.value);
    return definition.options.includes(selectedValue) ? selectedValue : "";
  }

  if (definition.type === "CUSTOM_TABLE") {
    return resizeCustomTableValue(existingField.value, getEffectiveTableRowCount(definition), getEffectiveTableColumnCount(definition));
  }

  if (definition.type === "CHECKLIST_NOTES") {
    return normalizeChecklistNotesValue(existingField.value, definition.checklistItems);
  }

  return normalizeWorkspaceFieldValue(definition.type, existingField.value);
}

function syncStageTemplatesIntoStageDetails(details, stageId, stageDetails) {
  const templates = getStageFieldTemplates(details, stageId)
    .map(normalizeWorkspaceFieldDefinition)
    .filter(Boolean);

  details.stageFieldTemplates[stageId] = templates;

  for (const template of templates) {
    const existingIndex = stageDetails.customFields.findIndex((field) => field.fieldId === template.fieldId);
    if (existingIndex >= 0) {
      stageDetails.customFields[existingIndex] = createWorkspaceFieldFromTemplate(template, stageDetails.customFields[existingIndex]);
    } else {
      stageDetails.customFields.push(createWorkspaceFieldFromTemplate(template));
    }
  }
}

function upsertStageFieldTemplate(details, stageId, field) {
  const template = normalizeWorkspaceFieldDefinition(field);
  if (!template) return null;

  const templates = getStageFieldTemplates(details, stageId);
  const existingIndex = templates.findIndex((item) => item.fieldId === template.fieldId);
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }

  return template;
}

function syncWorkspaceFieldDefinitionToProducts(details, stageId, field) {
  const template = normalizeWorkspaceFieldDefinition(field);
  if (!template) return;

  for (const productDetails of Object.values(details.products ?? {})) {
    productDetails.stages ??= {};
    productDetails.stages[stageId] ??= { customFields: [], checklistTasks: [] };
    productDetails.stages[stageId].customFields ??= [];
    productDetails.stages[stageId].checklistTasks ??= [];
    const existingIndex = productDetails.stages[stageId].customFields.findIndex((item) => item.fieldId === template.fieldId);
    if (existingIndex >= 0) {
      productDetails.stages[stageId].customFields[existingIndex] = createWorkspaceFieldFromTemplate(template, productDetails.stages[stageId].customFields[existingIndex]);
    } else {
      productDetails.stages[stageId].customFields.push(createWorkspaceFieldFromTemplate(template));
    }
  }
}

function removeStageFieldTemplate(details, stageId, fieldId) {
  details.stageFieldTemplates ??= {};
  details.stageFieldTemplates[stageId] = getStageFieldTemplates(details, stageId).filter((field) => field.fieldId !== fieldId);
}

function removeWorkspaceFieldFromProducts(details, stageId, fieldId) {
  for (const productDetails of Object.values(details.products ?? {})) {
    const stageDetails = productDetails?.stages?.[stageId];
    if (!stageDetails) continue;
    stageDetails.customFields = Array.isArray(stageDetails.customFields)
      ? stageDetails.customFields.filter((field) => field.fieldId !== fieldId)
      : [];
  }
}

function submitLoginForm(form) {
  syncTeamUsersFromStorage();
  const formData = new FormData(form);
  const email = String(formData.get("email") || uiState.loginDraft.email || "").trim().toLowerCase();
  const password = normalizePasswordInput(formData.get("password") || uiState.loginDraft.password || "");
  const remember = Boolean(formData.get("remember") || uiState.loginDraft.remember);
  const invitedUser = findTeamUserByEmail(email);
  const storedPassword = normalizePasswordInput(invitedUser?.password ?? "");
  const isAdminOwnerLogin = email === ADMIN_OWNER_CREDENTIALS.email && password === normalizePasswordInput(ADMIN_OWNER_CREDENTIALS.password);
  const isManualUserLogin = Boolean(storedPassword) && password === storedPassword;

  if (!isAdminOwnerLogin && !isManualUserLogin) {
    uiState.authError = invitedUser && !storedPassword
      ? "This user does not have a saved password yet. Sign in as admin, edit the user, and save a manual password."
      : "Invalid email or password. Ask an admin to create or reset your manual access.";
    renderFromCurrentState();
    return;
  }

  const loginUser = invitedUser ?? DEFAULT_TEAM_USERS[0];
  setAuthSession({ email, name: loginUser.name, role: loginUser.role }, remember);
  markTeamUserLoggedIn(email);
  uiState.loginDraft = { email: "", password: "", remember: false };
  uiState.authError = "";
  uiState.showLoginPassword = false;
  renderFromCurrentState();
}

function isAuthenticated() {
  return Boolean(authSession?.email && findTeamUserByEmail(authSession.email));
}

function loadAuthSession() {
  if (typeof window === "undefined") return null;
  const rawSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const parsedSession = JSON.parse(rawSession);
    const sessionUser = findTeamUserByEmail(parsedSession?.email);
    return sessionUser ? { ...parsedSession, name: sessionUser.name, role: normalizeUserRole(sessionUser.role) } : null;
  } catch {
    return null;
  }
}

function setAuthSession(session, remember = false) {
  authSession = { ...session, role: normalizeUserRole(session?.role), signedInAt: new Date().toISOString() };
  if (typeof window === "undefined") return;
  const storage = remember ? window.localStorage : window.sessionStorage;
  const secondaryStorage = remember ? window.sessionStorage : window.localStorage;
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(authSession));
  secondaryStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function normalizeUserRole(role) {
  const normalizedRole = String(role ?? "").trim().toUpperCase();
  if (USER_ROLES.includes(normalizedRole)) return normalizedRole;
  if (normalizedRole.includes("ADMIN")) return "ADMIN";
  if (normalizedRole.includes("VIEW")) return "VIEWER";
  if (["RESEARCH LEAD", "LOGISTICS MANAGER", "SOURCING SPECIALIST"].includes(normalizedRole)) return "USER";
  return "USER";
}

function getCurrentUserRole() {
  return normalizeUserRole(authSession?.role ?? ADMIN_OWNER_CREDENTIALS.role);
}

function canManageUsers() {
  return getCurrentUserRole() === "ADMIN";
}

function canEditPipelineTabs() {
  return getCurrentUserRole() === "ADMIN";
}

function canManageProducts() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canMoveProducts() {
  return canManageProducts();
}

function canManageChecklistTasks() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canEditWorkspaceData() {
  return getCurrentUserRole() === "ADMIN";
}

function canSendChatMessages() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function getVisibleSettingsCategories() {
  const categories = [
    { id: "profile", label: "Profile", icon: "account_circle" },
    { id: "users", label: "Users", icon: "group" },
    { id: "general", label: "General", icon: "tune" },
    { id: "security", label: "Security", icon: "security" },
    { id: "notifications", label: "Notifications", icon: "notifications" },
  ];
  return canManageUsers() ? categories : categories.filter((category) => category.id !== "users");
}

function getDefaultSettingsCategory() {
  return "profile";
}

function canViewSettingsCategory(categoryId) {
  return getVisibleSettingsCategories().some((category) => category.id === categoryId);
}

function getSettingsCategoryLabel(categoryId) {
  return getVisibleSettingsCategories().find((category) => category.id === categoryId)?.label ?? "Profile";
}

function clearAuthSession() {
  authSession = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function getFilteredTeamUsers() {
  const query = normalizeSearchText(uiState.settingsUserSearchQuery);
  if (!query) return teamUsers;

  return teamUsers.filter((user) => normalizeSearchText([user.name, user.email, user.role, user.status].join(" ")).includes(query));
}

function submitInviteUserForm(form) {
  if (!canManageUsers()) return;
  const formData = new FormData(form);
  const userId = form.getAttribute("data-user-id");
  const name = String(formData.get("userName") ?? "").trim();
  const submittedEmail = String(formData.get("userEmail") ?? "").trim().toLowerCase();
  const existingUser = userId ? teamUsers.find((user) => user.id === userId) : findTeamUserByEmail(submittedEmail);
  const email = (submittedEmail || existingUser?.email || "").trim().toLowerCase();
  const role = existingUser?.email === ADMIN_OWNER_CREDENTIALS.email ? "ADMIN" : normalizeUserRole(formData.get("userRole") ?? existingUser?.role ?? "USER");
  const password = normalizePasswordInput(formData.get("userPassword") ?? "");
  const jobTitle = String(formData.get("userJobTitle") ?? "").trim();
  if (!name || !email || (!existingUser && !password)) return;
  if (existingUser && !password && !existingUser.password) {
    uiState.settingsUserNotice = `Add and save a password before ${name} can log in.`;
    renderFromCurrentState();
    return;
  }

  if (existingUser) {
    const updatedEmail = existingUser.email === ADMIN_OWNER_CREDENTIALS.email ? ADMIN_OWNER_CREDENTIALS.email : email;
    setTeamUsers(teamUsers.map((user) => user.id === existingUser.id ? {
      ...user,
      name,
      email: updatedEmail,
      role,
      password: password || user.password,
      jobTitle: jobTitle || user.jobTitle,
    } : user));
    if (authSession?.email === existingUser.email) {
      const rememberSession = typeof window !== "undefined" && Boolean(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY));
      setAuthSession({ ...authSession, email: updatedEmail, name, role }, rememberSession);
    }
    uiState.settingsUserNotice = password
      ? `Access updated for ${name}. They can now log in with ${updatedEmail} and the new password.`
      : `${name} was updated. Existing password was kept.`;
  } else {
    setTeamUsers([...teamUsers, {
      id: `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      email,
      role,
      password,
      jobTitle: jobTitle || "Team Member",
      status: "Active",
      avatarDataUrl: "",
      inviteSentAt: new Date().toISOString(),
      lastLoginAt: null,
    }]);
    uiState.settingsUserNotice = `Access granted for ${name}. They can now log in with ${email} and the password you created.`;
  }

  uiState.settingsInviteModalOpen = false;
  uiState.editingTeamUserId = null;
  renderFromCurrentState();
}

function getCurrentTeamUser() {
  return findTeamUserByEmail(authSession?.email) ?? findTeamUserByEmail(ADMIN_OWNER_CREDENTIALS.email) ?? teamUsers[0];
}

function syncTeamUsersFromStorage() {
  if (typeof window === "undefined") return teamUsers;
  const storedUsers = parseStoredTeamUsers(window.localStorage.getItem(TEAM_USERS_STORAGE_KEY));
  const storedManualAccess = parseStoredTeamUsers(window.localStorage.getItem(MANUAL_ACCESS_STORAGE_KEY));
  if (!storedUsers && !storedManualAccess) return teamUsers;

  teamUsers = normalizeTeamUsers([...teamUsers, ...(storedUsers ?? []), ...(storedManualAccess ?? [])]);
  window.localStorage.setItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(teamUsers));
  persistManualAccessCredentials(teamUsers);
  return teamUsers;
}

function parseStoredTeamUsers(rawUsers) {
  if (!rawUsers) return null;

  try {
    const parsedUsers = JSON.parse(rawUsers);
    if (Array.isArray(parsedUsers)) return parsedUsers;
    if (Array.isArray(parsedUsers?.users)) return parsedUsers.users;
    if (Array.isArray(parsedUsers?.teamUsers)) return parsedUsers.teamUsers;
    if (Array.isArray(parsedUsers?.accounts)) return parsedUsers.accounts;
    if (parsedUsers && typeof parsedUsers === "object") return Object.values(parsedUsers);
    return null;
  } catch {
    return null;
  }
}

function normalizePasswordInput(value) {
  return String(value ?? "").trim();
}

function findTeamUserByEmail(email) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  return teamUsers.find((user) => user.email === normalizedEmail) ?? null;
}

function markTeamUserLoggedIn(email) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  setTeamUsers(teamUsers.map((user) => user.email === normalizedEmail ? { ...user, status: "Active", lastLoginAt: new Date().toISOString() } : user));
}

function deleteTeamUser(userId) {
  const user = teamUsers.find((item) => item.id === userId);
  if (!user || user.email === ADMIN_OWNER_CREDENTIALS.email) return;
  setTeamUsers(teamUsers.filter((item) => item.id !== userId));
  uiState.settingsUserNotice = `${user.name} was removed.`;
}

function uploadProfileAvatar(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  const currentUser = getCurrentTeamUser();
  if (!file || !file.type.startsWith("image/") || !currentUser) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") return;
    setTeamUsers(teamUsers.map((user) => user.id === currentUser.id ? { ...user, avatarDataUrl: reader.result } : user));
    renderFromCurrentState();
  });
  reader.readAsDataURL(file);
}

function getTeamUserInitials(name) {
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "U";
}

function loadTeamUsers() {
  if (typeof window === "undefined") return [...DEFAULT_TEAM_USERS];
  const storedUsers = parseStoredTeamUsers(window.localStorage.getItem(TEAM_USERS_STORAGE_KEY));
  const storedManualAccess = parseStoredTeamUsers(window.localStorage.getItem(MANUAL_ACCESS_STORAGE_KEY));
  const normalizedUsers = normalizeTeamUsers([...(storedUsers ?? DEFAULT_TEAM_USERS), ...(storedManualAccess ?? [])]);
  window.localStorage.setItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(normalizedUsers));
  persistManualAccessCredentials(normalizedUsers);
  return normalizedUsers;
}

function setTeamUsers(nextUsers) {
  teamUsers = normalizeTeamUsers(nextUsers);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(teamUsers));
    persistManualAccessCredentials(teamUsers);
  }
}

function persistManualAccessCredentials(users) {
  if (typeof window === "undefined") return;
  const manualAccessUsers = normalizeTeamUsers(users)
    .filter((user) => user.email && user.password)
    .map(({ email, name, role, password, jobTitle, avatarDataUrl, lastLoginAt }) => ({
      email,
      name,
      role,
      password,
      jobTitle,
      avatarDataUrl,
      status: "Active",
      lastLoginAt,
    }));
  window.localStorage.setItem(MANUAL_ACCESS_STORAGE_KEY, JSON.stringify(manualAccessUsers));
}

function normalizeTeamUsers(users) {
  if (!Array.isArray(users)) return normalizeTeamUsers(DEFAULT_TEAM_USERS);
  const dummyUserIds = new Set(["team-sarah-lopez", "team-james-miller", "team-emily-wong"]);
  const usersByEmail = new Map();

  users
    .filter((user) => !dummyUserIds.has(String(user?.id ?? "")))
    .map(normalizeTeamUserRecord)
    .filter((user) => Boolean(user.email))
    .forEach((user) => {
      const existingUser = usersByEmail.get(user.email);
      usersByEmail.set(user.email, existingUser ? {
        ...existingUser,
        ...user,
        password: user.password || existingUser.password,
        jobTitle: user.jobTitle || existingUser.jobTitle,
        avatarDataUrl: user.avatarDataUrl || existingUser.avatarDataUrl,
        status: existingUser.status === "Active" || user.status === "Active" || user.password || existingUser.password ? "Active" : "Password Required",
        inviteSentAt: user.inviteSentAt ?? existingUser.inviteSentAt,
        lastLoginAt: user.lastLoginAt ?? existingUser.lastLoginAt,
      } : user);
    });

  if (!usersByEmail.has(ADMIN_OWNER_CREDENTIALS.email)) {
    const owner = normalizeTeamUserRecord(DEFAULT_TEAM_USERS[0]);
    usersByEmail.set(owner.email, owner);
  }

  return Array.from(usersByEmail.values());
}

function normalizeTeamUserRecord(user, index = 0) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  const isOwner = email === ADMIN_OWNER_CREDENTIALS.email;
  const password = normalizePasswordInput(user?.password ?? user?.manualPassword ?? user?.accessPassword ?? user?.temporaryPassword ?? user?.userPassword ?? (isOwner ? ADMIN_OWNER_CREDENTIALS.password : ""));
  return {
    id: String(user?.id ?? `team-user-${index}`),
    name: String(user?.name ?? (isOwner ? ADMIN_OWNER_CREDENTIALS.name : "Unnamed User")),
    email,
    role: isOwner ? "ADMIN" : normalizeUserRole(user?.role ?? "VIEWER"),
    status: isOwner || user?.status === "Active" || password ? "Active" : "Password Required",
    password,
    jobTitle: String(user?.jobTitle ?? (isOwner ? "Workspace Owner" : "Team Member")),
    avatarDataUrl: typeof user?.avatarDataUrl === "string" ? user.avatarDataUrl : "",
    inviteSentAt: user?.inviteSentAt ?? null,
    lastLoginAt: user?.lastLoginAt ?? null,
  };
}

function loadProductSettings() {
  if (typeof window === "undefined") return createDefaultProductSettings();
  const rawSettings = window.localStorage.getItem(PRODUCT_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultProductSettings();

  try {
    return normalizeProductSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultProductSettings();
  }
}

function setProductSettings(nextSettings) {
  productSettings = normalizeProductSettings(nextSettings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  }
}

function createDefaultProductSettings() {
  return { edits: {}, deletedProductIds: [] };
}

function normalizeProductSettings(settings) {
  const edits = settings?.edits && typeof settings.edits === "object" ? settings.edits : {};
  return {
    edits: Object.fromEntries(Object.entries(edits).map(([productId, edit]) => [productId, normalizeProductEdit(edit)])),
    deletedProductIds: Array.isArray(settings?.deletedProductIds) ? settings.deletedProductIds.map((productId) => String(productId)) : [],
  };
}

function normalizeProductEdit(edit) {
  return {
    name: String(edit?.name ?? "").trim(),
    sku: normalizeOptionalProductValue(edit?.sku),
    asin: normalizeOptionalProductValue(edit?.asin),
    stageId: normalizeProductStageId(edit?.stageId),
  };
}

function loadUserProducts() {
  if (typeof window === "undefined") return [];
  const rawProducts = window.localStorage.getItem(USER_PRODUCTS_STORAGE_KEY);
  if (!rawProducts) return [];

  try {
    return normalizeUserProducts(JSON.parse(rawProducts));
  } catch {
    return [];
  }
}

function setUserProducts(nextProducts) {
  userProducts = normalizeUserProducts(nextProducts);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  }
}

function normalizeUserProducts(products) {
  if (!Array.isArray(products)) return [];

  return products
    .map(normalizeUserProduct)
    .filter(Boolean);
}

function normalizeUserProduct(product) {
  const id = String(product?.id ?? "").trim() || createUserProductId();
  const name = String(product?.name ?? "").trim();
  const stageId = normalizeProductStageId(product?.stageId);
  if (!name || !stageId) return null;

  return {
    id,
    name,
    sku: normalizeOptionalProductValue(product?.sku),
    asin: normalizeOptionalProductValue(product?.asin),
    stageId,
    readinessPercent: clampReadinessPercent(product?.readinessPercent),
  };
}

function normalizeProductStageId(stageId) {
  const cleanStageId = String(stageId ?? "").trim();
  if (cleanStageId === "optimization") return cleanStageId;
  return getBaseStageTabs().some((stageTab) => stageTab.id === cleanStageId) ? cleanStageId : "product-research";
}

function normalizeOptionalProductValue(value) {
  const cleanValue = String(value ?? "").trim();
  return cleanValue === "" || cleanValue.toUpperCase() === "N/A" ? "" : cleanValue;
}

function clampReadinessPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function createUserProductId() {
  return `user_product_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadWorkspaceDetails() {
  if (typeof window === "undefined") return createEmptyWorkspaceDetails();
  const rawDetails = window.localStorage.getItem(WORKSPACE_DETAILS_STORAGE_KEY);
  if (!rawDetails) return createEmptyWorkspaceDetails();

  try {
    return normalizeWorkspaceDetails(JSON.parse(rawDetails));
  } catch {
    return createEmptyWorkspaceDetails();
  }
}

function setWorkspaceDetails(nextDetails) {
  workspaceDetails = normalizeWorkspaceDetails(nextDetails);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
    } catch (error) {
      console.warn("LaunchFlow could not persist workspace details locally.", error);
    }
  }
}

function normalizeWorkspaceDetails(details) {
  const normalizedDetails = createEmptyWorkspaceDetails();
  const stageFieldTemplates = details?.stageFieldTemplates && typeof details.stageFieldTemplates === "object" ? details.stageFieldTemplates : {};

  for (const [stageId, fields] of Object.entries(stageFieldTemplates)) {
    normalizedDetails.stageFieldTemplates[stageId] = Array.isArray(fields)
      ? fields.map(normalizeWorkspaceFieldDefinition).filter(Boolean)
      : [];
  }

  const products = details?.products && typeof details.products === "object" ? details.products : {};

  for (const [productId, productDetails] of Object.entries(products)) {
    const stages = productDetails?.stages && typeof productDetails.stages === "object" ? productDetails.stages : {};
    normalizedDetails.products[productId] = {
      imageDataUrl: typeof productDetails?.imageDataUrl === "string" ? productDetails.imageDataUrl : "",
      stages: {},
      chatMessages: Array.isArray(productDetails?.chatMessages)
        ? productDetails.chatMessages.map(normalizeProductChatMessage).filter(Boolean)
        : [],
    };

    for (const [stageId, stageDetails] of Object.entries(stages)) {
      const customFields = Array.isArray(stageDetails?.customFields)
        ? stageDetails.customFields.map(normalizeWorkspaceField).filter(Boolean)
        : [];

      for (const field of customFields) {
        if (!getStageFieldTemplates(normalizedDetails, stageId).some((template) => template.fieldId === field.fieldId)) {
          getStageFieldTemplates(normalizedDetails, stageId).push(normalizeWorkspaceFieldDefinition(field));
        }
      }

      normalizedDetails.products[productId].stages[stageId] = {
        customFields,
        checklistTasks: Array.isArray(stageDetails?.checklistTasks)
          ? stageDetails.checklistTasks.map(normalizeWorkspaceChecklistTask).filter(Boolean)
          : [],
      };
    }
  }

  for (const productId of Object.keys(normalizedDetails.products)) {
    for (const stageId of Object.keys(normalizedDetails.stageFieldTemplates)) {
      ensureWorkspaceStageDetails(normalizedDetails, productId, stageId);
    }
  }

  return normalizedDetails;
}

function normalizeProductChatMessage(message) {
  const text = String(message?.text ?? "").trim();
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(normalizeProductChatAttachment).filter(Boolean)
    : [];
  if (!text && attachments.length === 0) return null;

  return {
    messageId: String(message?.messageId ?? "") || createChatMessageId(),
    sender: message?.sender === "partner" ? "partner" : "user",
    text,
    createdAt: typeof message?.createdAt === "string" ? message.createdAt : new Date().toISOString(),
    attachments,
  };
}

function normalizeProductChatAttachment(attachment) {
  const name = String(attachment?.name ?? "").trim();
  const dataUrl = String(attachment?.dataUrl ?? "");
  if (!name || !dataUrl) return null;

  return {
    attachmentId: String(attachment?.attachmentId ?? "") || createChatAttachmentId(),
    name,
    type: String(attachment?.type ?? "application/octet-stream"),
    size: Number(attachment?.size ?? 0),
    dataUrl,
  };
}

function normalizeWorkspaceField(field) {
  const label = String(field?.label ?? "").trim();
  const type = String(field?.type ?? "");
  if (!label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return null;

  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label,
    type,
    value: normalizeWorkspaceFieldValue(type, field?.value),
    options: type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableRows) : [],
    checklistItems: type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
  };
}

function createEmptyPaymentStatusValue() {
  return {
    paymentTitle: "",
    totalCost: "",
    paymentMode: "partial",
    partialAmount: "",
    paymentDate: "",
    invoiceNumber: "",
    paymentDescription: "",
    history: [],
    files: [],
  };
}

function normalizePaymentStatusValue(value) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const totalCost = getNonNegativeAmount(rawValue.totalCost);
  const partialAmount = getNonNegativeAmount(rawValue.partialAmount);
  return {
    paymentTitle: typeof rawValue.paymentTitle === "string" ? rawValue.paymentTitle.trim() : "",
    totalCost,
    paymentMode: rawValue.paymentMode === "full" || rawValue.isFullPaid === true ? "full" : "partial",
    partialAmount,
    paymentDate: typeof rawValue.paymentDate === "string" ? rawValue.paymentDate : "",
    invoiceNumber: typeof rawValue.invoiceNumber === "string" ? rawValue.invoiceNumber.trim() : "",
    paymentDescription: typeof rawValue.paymentDescription === "string" ? rawValue.paymentDescription : "",
    history: normalizePaymentHistory(rawValue.history),
    files: normalizeWorkspaceFileList(rawValue.files),
  };
}

function normalizePaymentHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  return entries.map(normalizePaymentHistoryEntry).filter(Boolean);
}

function normalizePaymentHistoryEntry(entry) {
  const amount = getNonNegativeAmount(entry?.amount);
  if (amount === "") return null;
  return {
    paymentId: String(entry?.paymentId ?? "") || createPaymentHistoryId(),
    paymentTitle: typeof entry?.paymentTitle === "string" ? entry.paymentTitle.trim() : "",
    amount,
    percent: Math.min(100, Math.max(0, Math.round(Number(entry?.percent ?? 0)))),
    date: typeof entry?.date === "string" ? entry.date : "",
    mode: entry?.mode === "full" ? "full" : "partial",
    invoiceNumber: typeof entry?.invoiceNumber === "string" ? entry.invoiceNumber.trim() : "",
    paymentDescription: typeof entry?.paymentDescription === "string" ? entry.paymentDescription : "",
    createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
  };
}

function getNonNegativeAmount(value) {
  if (value === "" || value === null || value === undefined) return "";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";
  return Math.max(0, Number(numericValue.toFixed(2)));
}

function normalizeWorkspaceFileList(value) {
  const files = Array.isArray(value) ? value : [];
  return files.map(normalizeWorkspaceFile).filter(Boolean);
}

function normalizeWorkspaceFile(file) {
  const name = String(file?.name ?? "").trim();
  const dataUrl = String(file?.dataUrl ?? "");
  if (!name || !dataUrl) return null;

  return {
    attachmentId: String(file?.attachmentId ?? file?.fileId ?? "") || createWorkspaceFileId(),
    name,
    type: String(file?.type ?? "application/octet-stream"),
    size: Number(file?.size ?? 0),
    dataUrl,
    uploadedAt: typeof file?.uploadedAt === "string" ? file.uploadedAt : new Date().toISOString(),
  };
}

function normalizeWorkspaceChecklistTask(task) {
  const name = String(task?.name ?? "").trim();
  if (!name) return null;
  return {
    taskId: String(task?.taskId ?? "") || createWorkspaceChecklistId(),
    name,
    isCompleted: Boolean(task?.isCompleted),
    completedAt: task?.isCompleted && typeof task?.completedAt === "string" ? task.completedAt : null,
    note: String(task?.note ?? ""),
  };
}

function normalizeWorkspaceFieldValue(type, value) {
  if (type === "LONG_BAR") return getLongBarTokens(value);
  if (type === "CUSTOM_DROPDOWN") return String(value ?? "");
  if (type === "LINK") return normalizeWorkspaceLinkValue(value);
  if (type === "SHIPMENT_TRACKER") return normalizeTrackingNumber(value);
  if (type === "CUSTOM_TABLE") return Array.isArray(value) ? value : [];
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value);
  if (type === "PAYMENT_STATUS") return normalizePaymentStatusValue(value);
  if (type === "CHECKLIST_NOTES") return normalizeChecklistNotesValue(value);

  if (type === "CURRENCY") {
    return {
      amount: value?.amount ?? "",
      currency: value?.currency ?? "USD",
    };
  }

  if (type === "NUMBER") {
    return value === "" || value === null || value === undefined ? "" : Number(value);
  }

  return String(value ?? "");
}

function normalizeWorkspaceLinkValue(value, fallbackLabel = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = String(value.url ?? value.href ?? "").trim();
    const label = String(value.label ?? value.text ?? "").trim();
    return { url, label: label || getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
  }

  const url = String(value ?? "").trim();
  return { url, label: getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
}

function getDefaultWorkspaceLinkLabel(url, fallbackLabel = "") {
  const fallback = String(fallbackLabel ?? "").trim();
  if (fallback && fallback.toLowerCase() !== "link") return fallback;
  if (!url) return "";

  try {
    const parsedUrl = new URL(normalizeChatUrl(url));
    return parsedUrl.hostname.replace(/^www\./i, "") || "Open Link";
  } catch {
    return "Open Link";
  }
}

function getSafeWorkspaceUrl(url) {
  return isSafeExternalUrl(url) ? normalizeChatUrl(url) : null;
}

function clearWorkspaceLinkFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;
  field.value = createWorkspaceFieldInitialValue("LINK");
  setWorkspaceDetails(nextDetails);
}

function normalizeTrackingNumber(value) {
  return String(value ?? "").trim();
}

function getShipmentTrackingUrl(trackingNumber) {
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(trackingNumber)}`;
}

function getShipmentMilestones(trackingNumber) {
  if (!trackingNumber) return [];
  const checksum = Array.from(trackingNumber).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const currentIndex = Math.max(1, Math.min(3, checksum % 4));
  return [
    { label: "Info received", detail: "Label created and tracking number saved" },
    { label: "Package collected", detail: "Carrier has collected the shipment" },
    { label: "In transit", detail: "Shipment is moving through the carrier network" },
    { label: "Out for delivery", detail: "Final-mile delivery is pending" },
  ].map((milestone, index) => ({
    ...milestone,
    complete: index < currentIndex,
    current: index === currentIndex,
  }));
}

function getShipmentCarrierLabel(trackingNumber) {
  if (/^1Z/i.test(trackingNumber)) return "UPS";
  if (/^9\d{19,25}$/.test(trackingNumber)) return "USPS";
  if (/^\d{12}$|^\d{15}$/.test(trackingNumber)) return "FedEx";
  if (/^JD/i.test(trackingNumber)) return "DHL";
  return "Auto-detect";
}

function getShipmentStatusSummary(trackingNumber, milestones) {
  const currentIndex = Math.max(0, milestones.findIndex((milestone) => milestone.current));
  const currentMilestone = milestones[currentIndex] ?? milestones[0];
  const stopIndex = Math.min(currentIndex + 1, 3);
  const progress = [18, 45, 68, 86][currentIndex] ?? 45;
  return {
    label: currentMilestone?.label ?? "Tracking saved",
    age: currentIndex >= 2 ? "In transit" : "Awaiting next carrier scan",
    headline: `${currentMilestone?.label ?? "Package collected"} - Estimated delivery updates available in live lookup`,
    location: currentIndex >= 2 ? "Carrier facility scan available" : "Origin scan pending",
    progress,
    stopIndex,
  };
}

function getShipmentTrackingEvents(trackingNumber, milestones) {
  const carrierLabel = getShipmentCarrierLabel(trackingNumber);
  const today = new Date();
  const eventDate = (offsetDays) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offsetDays);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const currentIndex = Math.max(0, milestones.findIndex((milestone) => milestone.current));
  const events = [
    { date: eventDate(0), location: "Carrier network", description: `${carrierLabel} lookup ready for ${trackingNumber}. Open live lookup for real carrier scans.`, current: true },
    { date: eventDate(1), location: "Origin facility", description: "Package information received and shipment monitoring started." },
  ];
  if (currentIndex >= 2) {
    events.splice(1, 0, { date: eventDate(0), location: "Transit hub", description: "Shipment is currently marked as in transit in the LaunchPad preview." });
  }
  return events;
}

function clearShipmentTrackingFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;
  field.value = "";
  setWorkspaceDetails(nextDetails);
}

function trackShipmentFromButton(button) {
  const tracker = button.closest(".workspace-shipment-tracker");
  const input = tracker?.querySelector('[data-action="update-workspace-field"]');
  const trackingNumber = normalizeTrackingNumber(input instanceof HTMLInputElement ? input.value : "");
  if (!trackingNumber) {
    if (input instanceof HTMLInputElement) input.focus();
    return;
  }

  const trackingUrl = getShipmentTrackingUrl(trackingNumber);
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(trackingUrl, "_blank", "noopener,noreferrer");
  }
}

function getLongBarTokens(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).map((item) => String(item ?? "").trim()).filter(Boolean);
  return String(value ?? "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function getCustomDropdownOptions(field) {
  return normalizeDropdownOptions(field?.options);
}

function normalizeDropdownOptions(options) {
  return normalizeFieldList(options);
}

function normalizeFieldList(items) {
  const itemValues = Array.isArray(items) ? items : typeof items === "string" ? items.split(/[\n,]+/) : [];
  return Array.from(new Set(itemValues.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function getCustomTableColumns(field) {
  return normalizeFieldList(field?.tableColumns);
}

function getCustomTableRows(field) {
  return normalizeFieldList(field?.tableRows);
}

function getChecklistNotesItems(field) {
  return normalizeFieldList(field?.checklistItems);
}

function getEffectiveTableRowCount(field) {
  const rows = getCustomTableRows(field);
  const columns = getCustomTableColumns(field);
  return rows.length > 0 ? rows.length : columns.length > 0 ? 1 : 0;
}

function getEffectiveTableColumnCount(field) {
  const columns = getCustomTableColumns(field);
  const rows = getCustomTableRows(field);
  return columns.length > 0 ? columns.length : rows.length > 0 ? 1 : 0;
}

function getCustomTableValue(value) {
  return Array.isArray(value) ? value.map((row) => Array.isArray(row) ? row : []) : [];
}

function resizeCustomTableValue(value, rowCount, columnCount) {
  const currentValue = getCustomTableValue(value);
  return Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => String(currentValue?.[rowIndex]?.[columnIndex] ?? "")));
}

function normalizeChecklistNotesValue(value, items = []) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checked = rawValue.checked && typeof rawValue.checked === "object" ? rawValue.checked : {};
  const allowedItems = normalizeFieldList(items);
  return {
    checked: Object.fromEntries(Object.entries(checked).filter(([item]) => allowedItems.length === 0 || allowedItems.includes(item)).map(([item, isChecked]) => [item, Boolean(isChecked)])),
    notes: String(rawValue.notes ?? ""),
  };
}

function createEmptyWorkspaceDetails() {
  return { products: {}, stageFieldTemplates: {} };
}

function structuredCloneWorkspaceDetails(details) {
  return JSON.parse(JSON.stringify(details ?? createEmptyWorkspaceDetails()));
}

function createWorkspaceFieldInitialValue(type) {
  if (type === "CURRENCY") return { amount: "", currency: "USD" };
  if (type === "CUSTOM_TABLE") return [];
  if (type === "FILE_UPLOAD") return [];
  if (type === "PAYMENT_STATUS") return createEmptyPaymentStatusValue();
  if (type === "CHECKLIST_NOTES") return { checked: {}, notes: "" };
  return "";
}

function createWorkspaceFieldId() {
  return `workspace_field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkspaceChecklistId() {
  return `workspace_checklist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkspaceFileId() {
  return `workspace_file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createPaymentHistoryId() {
  return `payment_history_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getWorkspaceFieldTypeLabel(type) {
  return WORKSPACE_CUSTOM_FIELD_TYPES.find((fieldType) => fieldType.value === type)?.label ?? type;
}

function launchConfettiEffect(originElement = null) {
  if (typeof document === "undefined") return;

  const originRect = originElement instanceof Element ? originElement.getBoundingClientRect() : null;
  const originX = originRect ? originRect.left + originRect.width / 2 : window.innerWidth / 2;
  const originY = originRect ? originRect.top + originRect.height / 2 : window.innerHeight / 2;
  const confettiPieces = Array.from({ length: 36 }, (_, index) => createElement("span", {
    className: "confetti-piece",
    style: {
      left: `${originX}px`,
      top: `${originY}px`,
      background: getConfettiColor(index),
      animationDelay: `${Math.random() * 0.12}s`,
      '--confetti-x': `${(Math.random() - 0.5) * 240}px`,
      '--confetti-y': `${80 + Math.random() * 220}px`,
      '--confetti-rotation': `${360 + Math.random() * 720}deg`,
    },
  }));

  const confettiLayer = createElement("div", { className: "confetti-layer", ariaHidden: "true" }, [
    createElement("span", { className: "confetti-party-popper", style: { left: `${originX}px`, top: `${originY}px` } }, "🎉"),
    confettiPieces,
  ]);

  document.body.appendChild(confettiLayer);
  window.setTimeout(() => confettiLayer.remove(), 1800);
}

function getConfettiColor(index) {
  const colors = ["var(--color-primary)", "rgb(22 163 74)", "rgb(245 158 11)", "rgb(239 68 68)", "rgb(139 92 246)"];
  return colors[index % colors.length];
}

function renderFromCurrentState() {
  const shell = getShellElements();
  if (!shell) return;
  renderApp(shell);
}

function restoreChatSearchFocus(selectionStart = null) {
  const searchInput = document.querySelector('[data-action="update-chat-search"]');
  if (!(searchInput instanceof HTMLInputElement)) return;

  const nextSelectionStart = selectionStart ?? searchInput.value.length;
  searchInput.focus();
  searchInput.setSelectionRange(nextSelectionStart, nextSelectionStart);
}

function restoreSearchFocus(selectionStart) {
  const searchInput = document.querySelector('[data-action="update-search"]');
  if (!(searchInput instanceof HTMLInputElement)) return;

  searchInput.focus();
  searchInput.setSelectionRange(selectionStart, selectionStart);
}

function getSearchScopedStages(activeProduct, visibleStages, searchQuery) {
  const query = normalizeSearchText(searchQuery);
  if (!query) return visibleStages;

  return visibleStages.filter((stage) => stageMatchesSearch(activeProduct, stage, query));
}

function stageMatchesSearch(activeProduct, stage, query) {
  const stageBlock = getStageBlock(activeProduct, stage.stage_id);
  const searchableValues = [stage.label, String(stage.stage_index), stage.phase];

  if (stageBlock) {
    for (const field of stageBlock.custom_fields) {
      searchableValues.push(field.label, field.type, stringifyFieldValue(field.value));
    }

    for (const task of stageBlock.checklist_tasks) {
      searchableValues.push(task.task_name);
    }
  }

  return searchableValues.some((value) => normalizeSearchText(value).includes(query));
}

function stringifyFieldValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return Object.values(value).map((item) => String(item ?? "")).join(" ");
  return String(value);
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getSelectedStageId(activeProduct, visibleStages) {
  if (!activeProduct || visibleStages.length === 0) return null;
  const currentSelectionIsVisible = visibleStages.some((stage) => stage.stage_id === uiState.selectedStageId);
  if (currentSelectionIsVisible) return uiState.selectedStageId;
  return visibleStages.at(-1)?.stage_id ?? null;
}

function getStageIcon(stageId) {
  const icons = {
    "product-research": "search",
    "product-development": "architecture",
    "supplier-sourcing": "factory",
    "under-final-order": "receipt_long",
    shipping: "local_shipping",
    "keyword-research": "table_rows",
    "listing-creation": "format_list_bulleted",
    "image-planning": "image",
    "campaign-prep": "campaign",
    "amazon-inbound": "warehouse",
    "enrolled-to-vines": "star",
    launch: "rocket_launch",
    stable: "check_circle",
    scaling: "monitoring",
  };

  return icons[stageId] ?? "radio_button_unchecked";
}

function createHeaderButton(iconName, ariaLabel) {
  return createElement("button", { className: "icon-button", type: "button", ariaLabel }, [createIcon(iconName)]);
}

function createIcon(iconName) {
  return createElement("span", { className: "material-symbols-outlined", ariaHidden: "true" }, iconName);
}

function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  const childList = Array.isArray(children) ? children : [children];

  applyElementOptions(element, options);
  for (const child of childList) {
    appendChild(element, child);
  }

  return element;
}

function applyElementOptions(element, options) {
  if (!options) return;

  const optionHandlers = {
    ariaControls: (value) => setNullableAttribute(element, "aria-controls", value),
    ariaCurrent: (value) => setNullableAttribute(element, "aria-current", value),
    ariaExpanded: (value) => setNullableAttribute(element, "aria-expanded", value),
    ariaHidden: (value) => setNullableAttribute(element, "aria-hidden", value),
    ariaLabel: (value) => setNullableAttribute(element, "aria-label", value),
    ariaModal: (value) => setNullableAttribute(element, "aria-modal", value),
    ariaPressed: (value) => setNullableAttribute(element, "aria-pressed", value),
    ariaValueMax: (value) => setNullableAttribute(element, "aria-valuemax", value),
    ariaValueMin: (value) => setNullableAttribute(element, "aria-valuemin", value),
    ariaValueNow: (value) => setNullableAttribute(element, "aria-valuenow", value),
    accept: (value) => setNullableAttribute(element, "accept", value),
    alt: (value) => setNullableAttribute(element, "alt", value),
    autocomplete: (value) => setNullableAttribute(element, "autocomplete", value),
    checked: (value) => {
      element.checked = Boolean(value);
    },
    className: (value) => {
      element.className = value;
    },
    dataAction: (value) => setNullableAttribute(element, "data-action", value),
    dataAttachmentId: (value) => setNullableAttribute(element, "data-attachment-id", value),
    dataChecklistId: (value) => setNullableAttribute(element, "data-checklist-id", value),
    dataChecklistDropId: (value) => setNullableAttribute(element, "data-checklist-drop-id", value),
    dataChatFormat: (value) => setNullableAttribute(element, "data-chat-format", value),
    dataDropdownOptionIndex: (value) => setNullableAttribute(element, "data-dropdown-option-index", value),
    dataEmoji: (value) => setNullableAttribute(element, "data-emoji", value),
    dateTime: (value) => setNullableAttribute(element, "datetime", value),
    dataFieldId: (value) => setNullableAttribute(element, "data-field-id", value),
    dataFieldPart: (value) => setNullableAttribute(element, "data-field-part", value),
    dataProductId: (value) => setNullableAttribute(element, "data-product-id", value),
    dataProductDropStageId: (value) => setNullableAttribute(element, "data-product-drop-stage-id", value),
    dataPaymentId: (value) => setNullableAttribute(element, "data-payment-id", value),
    dataRowIndex: (value) => setNullableAttribute(element, "data-row-index", value),
    dataColumnIndex: (value) => setNullableAttribute(element, "data-column-index", value),
    dataTableAxis: (value) => setNullableAttribute(element, "data-table-axis", value),
    dataTableIndex: (value) => setNullableAttribute(element, "data-table-index", value),
    dataTableDropAxis: (value) => setNullableAttribute(element, "data-table-drop-axis", value),
    dataTableDropIndex: (value) => setNullableAttribute(element, "data-table-drop-index", value),
    dataOptionIndex: (value) => setNullableAttribute(element, "data-option-index", value),
    dataSettingsCategory: (value) => setNullableAttribute(element, "data-settings-category", value),
    dataStageId: (value) => setNullableAttribute(element, "data-stage-id", value),
    dataStageDirection: (value) => setNullableAttribute(element, "data-stage-direction", value),
    dataStageDropId: (value) => setNullableAttribute(element, "data-stage-drop-id", value),
    dataTaskId: (value) => setNullableAttribute(element, "data-task-id", value),
    dataTokenIndex: (value) => setNullableAttribute(element, "data-token-index", value),
    dataUserId: (value) => setNullableAttribute(element, "data-user-id", value),
    disabled: (value) => {
      element.disabled = Boolean(value);
    },
    draggable: (value) => {
      element.draggable = Boolean(value);
    },
    href: (value) => setNullableAttribute(element, "href", value),
    download: (value) => setNullableAttribute(element, "download", value),
    htmlFor: (value) => setNullableAttribute(element, "for", value),
    id: (value) => setNullableAttribute(element, "id", value),
    name: (value) => setNullableAttribute(element, "name", value),
    placeholder: (value) => setNullableAttribute(element, "placeholder", value),
    preload: (value) => setNullableAttribute(element, "preload", value),
    rel: (value) => setNullableAttribute(element, "rel", value),
    required: (value) => setBooleanAttribute(element, "required", value),
    role: (value) => setNullableAttribute(element, "role", value),
    rows: (value) => setNullableAttribute(element, "rows", value),
    selected: (value) => {
      element.selected = Boolean(value);
    },
    src: (value) => setNullableAttribute(element, "src", value),
    step: (value) => setNullableAttribute(element, "step", value),
    style: (value) => applyStyle(element, value),
    target: (value) => setNullableAttribute(element, "target", value),
    title: (value) => setNullableAttribute(element, "title", value),
    controls: (value) => {
      element.controls = Boolean(value);
    },
    multiple: (value) => {
      element.multiple = Boolean(value);
    },
    open: (value) => {
      element.open = Boolean(value);
    },
    type: (value) => setNullableAttribute(element, "type", value),
    value: (value) => {
      element.value = value ?? "";
    },
  };

  for (const [key, value] of Object.entries(options)) {
    optionHandlers[key]?.(value);
  }
}

function appendChild(parent, child) {
  if (child === null || child === undefined) return;
  if (Array.isArray(child)) {
    child.forEach((nestedChild) => appendChild(parent, nestedChild));
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

function replaceChildren(parent, ...children) {
  parent.replaceChildren(...children.filter((child) => child !== null && child !== undefined));
}

function setNullableAttribute(element, name, value) {
  if (value === null || value === undefined || value === false) return;
  element.setAttribute(name, String(value));
}

function setBooleanAttribute(element, name, value) {
  if (!value) return;
  element.setAttribute(name, "");
}

function applyStyle(element, style) {
  if (!style || typeof style !== "object") return;
  for (const [property, value] of Object.entries(style)) {
    if (property.startsWith("--")) {
      element.style.setProperty(property, value);
    } else {
      element.style[property] = value;
    }
  }
}

function getSafeHttpUrl(value) {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatCurrencyValue(value) {
  const amount = value?.amount;
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "No amount entered";

  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
