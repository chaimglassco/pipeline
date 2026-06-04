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
  expandedWorkspaceStageIds: new Set(["product-research"]),
  collapsedChecklistIds: new Set(),
  hiddenCompletedChecklistIds: new Set(),
  fieldModal: null,
  checklistNoteModal: null,
  addProductModalOpen: false,
  editingProductId: null,
  addStageModalOpen: false,
  stageEditorOpen: false,
  draggedStageId: null,
  draggedChecklistTask: null,
  copiedSkuProductId: null,
  skuCopyTimeoutId: null,
  searchQuery: "",
};

const WORKSPACE_DETAILS_STORAGE_KEY = "launchflow.workspaceDetails.v1";
const STAGE_SETTINGS_STORAGE_KEY = "launchflow.stageSettings.v1";
const USER_PRODUCTS_STORAGE_KEY = "launchflow.userProducts.v1";
const PRODUCT_SETTINGS_STORAGE_KEY = "launchflow.productSettings.v1";
const WORKSPACE_CUSTOM_FIELD_TYPES = Object.freeze([
  { value: "SHORT_TEXT", label: "Short Text" },
  { value: "LONG_TEXT", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "CURRENCY", label: "Currency" },
  { value: "DATE", label: "Calendar Date" },
  { value: "LINK", label: "Link" },
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

let stageSettings = loadStageSettings();
let userProducts = loadUserProducts();
let productSettings = loadProductSettings();

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
  shell.appRoot.addEventListener("change", handleAppChange);
  shell.appRoot.addEventListener("input", handleAppInput);
  shell.appRoot.addEventListener("submit", handleAppSubmit);
  shell.appRoot.addEventListener("dragstart", handleAppDragStart);
  shell.appRoot.addEventListener("dragover", handleAppDragOver);
  shell.appRoot.addEventListener("drop", handleAppDrop);
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
  renderHeader(shell.header);
  renderSidebar(shell.sidebar);
  renderProductPanel(shell.productPanel);
  renderWorkspace(shell.workspace);
  renderContextPanel(shell.contextPanel);
}
function renderHeader(header) {
  replaceChildren(header);
}
function renderSidebar(sidebar) {
  replaceChildren(
    sidebar,
    createElement("div", { className: "sidebar-brand" }, [
      createElement("h1", { className: "sidebar-brand__title" }, "LaunchPad Pro"),
      createElement("p", { className: "sidebar-brand__subtitle" }, "Amazon Seller Tools"),
    ]),
    createElement("nav", { className: "sidebar-menu", ariaLabel: "Primary navigation" }, [
      createElement("button", { className: "sidebar-tab sidebar-tab--dashboard", type: "button" }, [
        createIcon("dashboard"),
        createElement("span", null, "Dashboard"),
      ]),
    ]),
    createElement("div", { className: "sidebar-section-heading" }, [
      createElement("span", { className: "sidebar-section-label" }, "Pipeline Stages"),
      createElement("span", { className: "sidebar-section-actions" }, [
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "toggle-stage-editor", ariaLabel: "Edit pipeline stages" }, [createIcon("edit")]),
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "recover-stages", ariaLabel: "Recover deleted pipeline stages" }, [createIcon("restore")]),
      ]),
    ]),
    uiState.stageEditorOpen ? renderStageEditorPanel() : null,
    createElement("nav", { className: "sidebar-tabs", ariaLabel: "Pipeline stages" },
      getSidebarStageTabs().map((stageTab) =>
        createElement("button", {
          className: `sidebar-tab ${stageTab.id === uiState.selectedStageId ? "sidebar-tab--active" : ""}`,
          type: "button",
          dataAction: "select-stage",
          dataStageId: stageTab.id,
          ariaCurrent: stageTab.id === uiState.selectedStageId ? "page" : null,
        }, [
          createIcon(stageTab.icon),
          createElement("span", null, stageTab.label),
        ]),
      ),
    ),
    renderAddStageButton(),
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

function renderProductPanel(productPanel) {
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
      createElement("span", { className: "product-card__actions" }, [
        createElement("button", { className: "product-card__action", type: "button", dataAction: "edit-product", dataProductId: product.id, ariaLabel: `Edit ${product.name}` }, [createIcon("edit")]),
        createElement("button", { className: "product-card__action product-card__action--danger", type: "button", dataAction: "delete-product", dataProductId: product.id, ariaLabel: `Delete ${product.name}` }, [createIcon("delete")]),
      ]),
      checklistReadiness >= 100 && getNextProductStageId(product)
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
      renderChecklistNoteModal(),
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
      createElement("div", { className: "workspace-product-card__image-actions" }, [
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
      ].filter(Boolean)),
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
    renderProductMetricCard("Profit", formatCurrency(profit)),
    renderProductMetricCard("Profit Margin", `${margin}%`),
    renderProductMetricCard("COGS", formatCurrency(cogs)),
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
  const isCollapsed = uiState.collapsedChecklistIds.has(checklistKey);
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
  return createElement("article", {
    className: `workspace-checklist__item ${task.isCompleted ? "workspace-checklist__item--complete" : ""}`,
    dataAction: "checklist-drop",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataChecklistDropId: task.taskId,
  }, [
    createElement("button", {
      className: "workspace-checklist__drag-handle",
      type: "button",
      draggable: true,
      dataAction: "drag-checklist",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Drag ${task.name} to reorder`,
    }, [createIcon("drag_indicator")]),
    createElement("label", { className: "workspace-checklist__task-label" }, [
      createElement("input", {
        type: "checkbox",
        checked: task.isCompleted,
        dataAction: "toggle-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
      }),
      createElement("span", null, task.name),
    ]),
    createElement("span", { className: "workspace-checklist__meta" }, task.isCompleted ? `Completed ${formatCompletionDate(task.completedAt)}` : "In progress"),
    createElement("button", {
      className: `workspace-checklist__note-button ${task.note ? "workspace-checklist__note-button--active" : ""}`,
      type: "button",
      dataAction: "open-checklist-note",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Edit notes for ${task.name}`,
    }, [createIcon("sticky_note_2")]),
    createElement("span", { className: "workspace-checklist__actions" }, [
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
    ]),
  ]);
}

function renderWorkspaceChecklistForm(product, stage) {
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

function renderWorkspaceCustomFields(product, stage, stageDetails) {
  const fields = stageDetails.customFields;
  const compactFields = fields.filter((field) => field.type !== "LONG_TEXT");
  const longTextFields = fields.filter((field) => field.type === "LONG_TEXT");

  return createElement("section", { className: "workspace-fields", ariaLabel: `${stage.label} custom fields` }, [
    createElement("div", { className: "workspace-fields__header" }, [
      createElement("h3", null, "Custom Details"),
      createElement("span", null, `${fields.length} field${fields.length === 1 ? "" : "s"}`),
    ]),
    fields.length === 0
      ? createElement("p", { className: "workspace-fields__empty" }, "No preset fields here. Add only the details you want to track for this product and stage.")
      : createElement("div", { className: `workspace-fields__layout ${longTextFields.length === 0 ? "workspace-fields__layout--compact-only" : ""}` }, [
        createElement("div", { className: "workspace-fields__grid workspace-fields__grid--compact" },
          compactFields.map((field) => renderWorkspaceCustomField(product, stage, field)),
        ),
        longTextFields.length > 0
          ? createElement("div", { className: "workspace-fields__long-text" },
            longTextFields.map((field) => renderWorkspaceCustomField(product, stage, field)),
          )
          : null,
      ].filter(Boolean)),
  ]);
}

function renderWorkspaceAddFieldForm(product, stage) {
  return createElement("button", {
    className: "button-primary workspace-add-field-button",
    type: "button",
    dataAction: "open-field-modal",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [createIcon("add")]);
}

function renderWorkspaceCustomField(product, stage, field) {
  const fieldClass = `workspace-field ${field.type === "LONG_TEXT" ? "workspace-field--wide" : ""}`;

  return createElement("article", { className: fieldClass }, [
    createElement("div", { className: "workspace-field__header" }, [
      createElement("span", { className: "workspace-field__label" }, field.label),
      createElement("span", { className: "workspace-field__actions" }, [
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
      ]),
    ]),
    renderWorkspaceFieldControl(product, stage, field),
  ]);
}

function renderWorkspaceFieldControl(product, stage, field) {
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
  };

  if (field.type === "LONG_TEXT") {
    return createElement("textarea", {
      className: "form-input workspace-field__textarea",
      ...baseOptions,
      rows: 4,
      placeholder: "Write longer notes...",
      value: field.value ?? "",
    });
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
    return createElement("input", { className: "form-input", type: "url", placeholder: "https://example.com", value: field.value ?? "", ...baseOptions });
  }

  return createElement("input", { className: "form-input", type: "text", placeholder: "Add a short value...", value: field.value ?? "", ...baseOptions });
}

function renderWorkspaceFieldModal() {
  if (!uiState.fieldModal) return null;

  const { productId, stageId, fieldId, mode } = uiState.fieldModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = mode === "edit" ? stageDetails.customFields.find((item) => item.fieldId === fieldId) : null;
  const modalTitle = field ? "Edit Custom Field" : "Create Custom Field";
  const submitLabel = field ? "Save Field" : "Create Field";
  const selectedType = field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value;

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
        createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Materials", value: field?.label ?? "", required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Type"),
        createElement("select", { className: "form-input", name: "fieldType", required: true },
          WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType.value, selected: selectedType === fieldType.value }, fieldType.label)),
        ),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-field-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, submitLabel),
      ]),
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
  const checklistTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-checklist"]') : null;
  if (checklistTarget && event.dataTransfer) {
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
  if (!target || !event.dataTransfer) return;

  const stageId = target.getAttribute("data-stage-id");
  if (!stageId) return;

  uiState.draggedStageId = stageId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", stageId);
}

function handleAppDragOver(event) {
  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target || !uiState.draggedStageId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleAppDrop(event) {
  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    event.preventDefault();
    const dropChecklistId = checklistTarget.getAttribute("data-checklist-drop-id");
    reorderWorkspaceChecklistTask(uiState.draggedChecklistTask, dropChecklistId);
    uiState.draggedChecklistTask = null;
    renderFromCurrentState();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target) return;

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

function handleAppClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) return;

  const action = target.getAttribute("data-action");
  if (action === "toggle-stage-editor") {
    uiState.stageEditorOpen = !uiState.stageEditorOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stages") {
    recoverAllStages();
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stage") {
    recoverStage(target.getAttribute("data-stage-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "delete-stage") {
    deleteStage(target.getAttribute("data-stage-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "open-add-stage-modal") {
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
    uiState.addProductModalOpen = true;
    uiState.editingProductId = null;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-product") {
    uiState.addProductModalOpen = true;
    uiState.editingProductId = target.getAttribute("data-product-id");
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product") {
    deleteUserProduct(target.getAttribute("data-product-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "move-product-next-stage") {
    const movedProduct = moveProductToNextStage(target.getAttribute("data-product-id"));
    if (movedProduct) launchConfettiEffect();
    renderFromCurrentState();
    return;
  }

  if (action === "close-add-product-modal") {
    closeProductModal();
    renderFromCurrentState();
    return;
  }

  if (action === "select-stage") {
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
    uiState.expandedWorkspaceStageIds = new Set([getInitialExpandedWorkspaceStageId(product)]);
    uiState.fieldModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-field-modal") {
    openWorkspaceFieldModal(target, "create");
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-field") {
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
    deleteWorkspaceFieldFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product-image") {
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
    return;
  }

  if (action === "open-checklist-note") {
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
    editWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-workspace-checklist") {
    deleteWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "advance-stage") {
    const productId = target.getAttribute("data-product-id");
    advanceProductStage(productId);
  }
}

function handleAppInput(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.getAttribute("data-action") === "rename-stage") {
    renameStage(target.getAttribute("data-stage-id"), "value" in target ? target.value : "");
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-field") {
    updateWorkspaceFieldFromInput(target);
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
  if (action === "update-field") {
    updateFieldFromInput(target);
    return;
  }

  if (action === "update-workspace-field") {
    updateWorkspaceFieldFromInput(target);
    return;
  }

  if (action === "upload-product-image") {
    updateProductImageFromInput(target);
    return;
  }

  if (action === "toggle-workspace-checklist") {
    toggleWorkspaceChecklistTask(target);
    return;
  }

  if (action === "toggle-task") {
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
  if (action === "add-custom-field") {
    event.preventDefault();
    submitCustomFieldForm(form);
    return;
  }

  if (action === "workspace-save-custom-field") {
    event.preventDefault();
    submitWorkspaceCustomFieldForm(form);
    return;
  }

  if (action === "add-workspace-checklist") {
    event.preventDefault();
    submitWorkspaceChecklistForm(form);
    return;
  }

  if (action === "save-checklist-note") {
    event.preventDefault();
    submitChecklistNoteForm(form);
    return;
  }

  if (action === "create-product") {
    event.preventDefault();
    submitAddProductForm(form);
    return;
  }

  if (action === "create-stage") {
    event.preventDefault();
    submitAddStageForm(form);
    return;
  }

  if (action === "add-task") {
    event.preventDefault();
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
  const formData = new FormData(form);
  const stageName = String(formData.get("stageName") ?? "").trim();
  if (!stageName) return;

  const stage = createCustomStage(stageName);
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.customStages.push(stage);
  nextSettings.order.push(stage.id);
  setStageSettings(nextSettings);

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
  uiState.expandedWorkspaceStageIds = new Set([getInitialExpandedWorkspaceStageId(product)]);
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
  const product = getEditableProduct(productId);
  const nextStageId = product ? getNextProductStageId(product) : null;
  if (!product || !nextStageId) return null;

  const movedProduct = { ...product, stageId: nextStageId };
  persistProductStageChange(movedProduct);
  uiState.selectedStageId = nextStageId;
  uiState.selectedProductId = product.id;
  uiState.expandedWorkspaceStageIds = new Set([getInitialExpandedWorkspaceStageId(movedProduct)]);
  return movedProduct;
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
  if (!getEditableProduct(productId)) return;
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
    uiState.expandedWorkspaceStageIds = new Set([getInitialExpandedWorkspaceStageId(nextProduct)]);
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

function getInitialExpandedWorkspaceStageId(product) {
  if (uiState.selectedStageId === "optimization") return OPTIMIZATION_WORKSPACE_STAGE.stage_id;
  if (LAUNCHFLOW_STAGES.some((stage) => stage.stage_id === uiState.selectedStageId) || getCustomWorkspaceStage(uiState.selectedStageId)) return uiState.selectedStageId;
  return product?.stageId ?? OPTIMIZATION_WORKSPACE_STAGE.stage_id;
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
  const nextCollapsedChecklistIds = new Set(uiState.collapsedChecklistIds);
  if (nextCollapsedChecklistIds.has(checklistKey)) {
    nextCollapsedChecklistIds.delete(checklistKey);
  } else {
    nextCollapsedChecklistIds.add(checklistKey);
  }
  uiState.collapsedChecklistIds = nextCollapsedChecklistIds;
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

function updateProductImageFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
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
  details.products[productId] ??= { imageDataUrl: "", stages: {} };
  details.products[productId].imageDataUrl ??= "";
  details.products[productId].stages ??= {};
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

  uiState.fieldModal = {
    mode,
    productId,
    stageId,
    fieldId: mode === "edit" ? target.getAttribute("data-field-id") : null,
  };
}

function deleteWorkspaceFieldFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  stageDetails.customFields = stageDetails.customFields.filter((field) => field.fieldId !== fieldId);
  setWorkspaceDetails(nextDetails);

  if (uiState.fieldModal?.fieldId === fieldId) {
    uiState.fieldModal = null;
  }
}

function submitWorkspaceChecklistForm(form) {
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

function submitWorkspaceCustomFieldForm(form) {
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const fieldId = form.getAttribute("data-field-id");
  const formData = new FormData(form);
  const label = String(formData.get("fieldLabel") ?? "").trim();
  const type = String(formData.get("fieldType") ?? "");

  if (!productId || !stageId || !label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  const existingField = stageDetails.customFields.find((field) => field.fieldId === fieldId);

  if (existingField) {
    existingField.label = label;
    if (existingField.type !== type) {
      existingField.type = type;
      existingField.value = createWorkspaceFieldInitialValue(type);
    }
  } else {
    stageDetails.customFields.push({
      fieldId: createWorkspaceFieldId(),
      label,
      type,
      value: createWorkspaceFieldInitialValue(type),
    });
  }

  setWorkspaceDetails(nextDetails);
  uiState.fieldModal = null;
  renderFromCurrentState();
}

function updateWorkspaceFieldFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  const field = stageDetails.customFields.find((customField) => customField.fieldId === fieldId);
  if (!field) return;

  const fieldPart = input.getAttribute("data-field-part");
  const value = getWorkspaceInputValue(input);
  if (fieldPart) {
    const currentValue = field.value && typeof field.value === "object" ? field.value : {};
    field.value = { ...currentValue, [fieldPart]: value };
  } else {
    field.value = value;
  }

  setWorkspaceDetails(nextDetails);
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
  return productDetails.stages[stageId];
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
    window.localStorage.setItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
  }
}

function normalizeWorkspaceDetails(details) {
  const normalizedDetails = createEmptyWorkspaceDetails();
  const products = details?.products && typeof details.products === "object" ? details.products : {};

  for (const [productId, productDetails] of Object.entries(products)) {
    const stages = productDetails?.stages && typeof productDetails.stages === "object" ? productDetails.stages : {};
    normalizedDetails.products[productId] = {
      imageDataUrl: typeof productDetails?.imageDataUrl === "string" ? productDetails.imageDataUrl : "",
      stages: {},
    };

    for (const [stageId, stageDetails] of Object.entries(stages)) {
      normalizedDetails.products[productId].stages[stageId] = {
        customFields: Array.isArray(stageDetails?.customFields)
          ? stageDetails.customFields.map(normalizeWorkspaceField).filter(Boolean)
          : [],
        checklistTasks: Array.isArray(stageDetails?.checklistTasks)
          ? stageDetails.checklistTasks.map(normalizeWorkspaceChecklistTask).filter(Boolean)
          : [],
      };
    }
  }

  return normalizedDetails;
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

function createEmptyWorkspaceDetails() {
  return { products: {} };
}

function structuredCloneWorkspaceDetails(details) {
  return JSON.parse(JSON.stringify(details ?? createEmptyWorkspaceDetails()));
}

function createWorkspaceFieldInitialValue(type) {
  return type === "CURRENCY" ? { amount: "", currency: "USD" } : "";
}

function createWorkspaceFieldId() {
  return `workspace_field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkspaceChecklistId() {
  return `workspace_checklist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getWorkspaceFieldTypeLabel(type) {
  return WORKSPACE_CUSTOM_FIELD_TYPES.find((fieldType) => fieldType.value === type)?.label ?? type;
}

function launchConfettiEffect() {
  if (typeof document === "undefined") return;

  const confettiLayer = createElement("div", { className: "confetti-layer", ariaHidden: "true" },
    Array.from({ length: 36 }, (_, index) => createElement("span", {
      className: "confetti-piece",
      style: {
        left: `${Math.random() * 100}%`,
        background: getConfettiColor(index),
        animationDelay: `${Math.random() * 0.25}s`,
        transform: `rotate(${Math.random() * 180}deg)`,
      },
    })),
  );

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
    ariaValueMax: (value) => setNullableAttribute(element, "aria-valuemax", value),
    ariaValueMin: (value) => setNullableAttribute(element, "aria-valuemin", value),
    ariaValueNow: (value) => setNullableAttribute(element, "aria-valuenow", value),
    accept: (value) => setNullableAttribute(element, "accept", value),
    alt: (value) => setNullableAttribute(element, "alt", value),
    checked: (value) => {
      element.checked = Boolean(value);
    },
    className: (value) => {
      element.className = value;
    },
    dataAction: (value) => setNullableAttribute(element, "data-action", value),
    dataChecklistId: (value) => setNullableAttribute(element, "data-checklist-id", value),
    dataChecklistDropId: (value) => setNullableAttribute(element, "data-checklist-drop-id", value),
    dataFieldId: (value) => setNullableAttribute(element, "data-field-id", value),
    dataFieldPart: (value) => setNullableAttribute(element, "data-field-part", value),
    dataProductId: (value) => setNullableAttribute(element, "data-product-id", value),
    dataStageId: (value) => setNullableAttribute(element, "data-stage-id", value),
    dataStageDirection: (value) => setNullableAttribute(element, "data-stage-direction", value),
    dataStageDropId: (value) => setNullableAttribute(element, "data-stage-drop-id", value),
    dataTaskId: (value) => setNullableAttribute(element, "data-task-id", value),
    disabled: (value) => {
      element.disabled = Boolean(value);
    },
    draggable: (value) => {
      element.draggable = Boolean(value);
    },
    href: (value) => setNullableAttribute(element, "href", value),
    htmlFor: (value) => setNullableAttribute(element, "for", value),
    id: (value) => setNullableAttribute(element, "id", value),
    name: (value) => setNullableAttribute(element, "name", value),
    placeholder: (value) => setNullableAttribute(element, "placeholder", value),
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
    element.style[property] = value;
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
