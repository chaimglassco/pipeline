import { MAX_STAGE_INDEX } from "./constants/stages.js";
import {
  advanceProductStage,
  calculateOverallPipelineProgress,
  getActiveProduct,
  getStageBlock,
  getState,
  getVisibleStages,
  subscribe,
} from "./store.js";

const stageSelection = {
  selectedStageId: null,
};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializeApp);
}

function initializeApp() {
  const shell = getShellElements();
  if (!shell) return;

  shell.appRoot.addEventListener("click", handleAppClick);
  subscribe(() => renderApp(shell));
  renderApp(shell);
}

function getShellElements() {
  const appRoot = document.getElementById("app-root");
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("app-sidebar");
  const workspace = document.getElementById("app-workspace");
  const contextPanel = document.getElementById("app-context-panel");

  if (!appRoot || !header || !sidebar || !workspace || !contextPanel) return null;
  return { appRoot, header, sidebar, workspace, contextPanel };
}

function renderApp(shell) {
  const appState = getState();
  const activeProduct = getActiveProduct(appState);

  renderHeader(shell.header);
  renderSidebar(shell.sidebar, activeProduct);
  renderWorkspace(shell.workspace, activeProduct, appState);
  renderContextPanel(shell.contextPanel);
}

function renderHeader(header) {
  replaceChildren(
    header,
    createElement("div", { className: "app-header__inner px-lg gap-md" }, [
      createElement("a", { className: "app-header__brand", href: "#app-workspace", ariaLabel: "LaunchFlow home" }, [
        createIcon("rocket_launch"),
        createElement("span", { className: "text-label-md" }, "LaunchFlow"),
      ]),
      createElement("label", { className: "app-header__search" }, [
        createElement("span", { className: "app-header__search-label text-label-sm" }, "Search visible stages"),
        createElement("input", {
          className: "app-header__search-input text-body-md",
          type: "search",
          placeholder: "Search active product",
          ariaLabel: "Search active product visible stages",
        }),
      ]),
      createHeaderButton("notifications", "Open notifications"),
      createHeaderButton("settings", "Open settings"),
      createHeaderButton("account_circle", "Open user menu"),
    ]),
  );
}

function renderSidebar(sidebar, activeProduct) {
  const visibleStages = activeProduct ? getVisibleStages(activeProduct) : [];
  const selectedStageId = getSelectedStageId(activeProduct, visibleStages);

  const children = [
    createElement("div", { className: "sidebar__header" }, [
      createElement("p", { className: "text-label-sm" }, "Active launch"),
      createElement("h2", { className: "sidebar__title text-label-md" }, activeProduct?.name ?? "No active product"),
    ]),
    createElement(
      "nav",
      { className: "sidebar__nav", ariaLabel: "Visible launch stages" },
      visibleStages.map((stage) =>
        createElement("button", {
          className: `sidebar__stage ${stage.stage_id === selectedStageId ? "sidebar__stage--active" : ""}`,
          type: "button",
          dataAction: "select-stage",
          dataStageId: stage.stage_id,
          ariaCurrent: stage.stage_id === selectedStageId ? "step" : null,
        }, [
          createElement("span", { className: "sidebar__stage-index text-label-sm" }, String(stage.stage_index)),
          createElement("span", { className: "sidebar__stage-label text-label-md" }, stage.label),
        ]),
      ),
    ),
  ];

  replaceChildren(sidebar, ...children);
}

function renderWorkspace(workspace, activeProduct, appState) {
  if (!activeProduct) {
    replaceChildren(
      workspace,
      createElement("section", { className: "workspace workspace--empty" }, [
        createElement("h1", { className: "text-headline-md" }, "No active product"),
        createElement("p", { className: "text-body-md text-on-surface-variant" }, "Create or select a product to begin tracking launch stages."),
      ]),
    );
    return;
  }

  const visibleStages = getVisibleStages(activeProduct);
  const progress = calculateOverallPipelineProgress(activeProduct);
  const selectedStageId = getSelectedStageId(activeProduct, visibleStages);

  replaceChildren(
    workspace,
    createElement("div", { className: "workspace" }, [
      createElement("section", { className: "workspace__hero bg-surface-container-lowest" }, [
        createElement("div", null, [
          createElement("p", { className: "text-label-sm text-on-surface-variant" }, "Active product"),
          createElement("h1", { className: "workspace__title text-headline-md" }, activeProduct.name),
        ]),
        createElement("p", { className: "workspace__stage-chip text-label-md" }, `Stage ${activeProduct.current_active_stage_index} of ${MAX_STAGE_INDEX}`),
      ]),
      renderKpiRow(appState, progress),
      renderPipelineProgress(activeProduct, progress),
      createElement("section", { className: "stage-list", ariaLabel: "Visible stage details" },
        visibleStages.map((stage) => renderStageCard(activeProduct, stage, selectedStageId)),
      ),
    ]),
  );
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

function renderStageCard(activeProduct, stage, selectedStageId) {
  const stageBlock = getStageBlock(activeProduct, stage.stage_id);
  const isCurrentStage = stage.stage_index === activeProduct.current_active_stage_index;
  const isSelected = stage.stage_id === selectedStageId;
  const customFieldCount = stageBlock?.custom_fields.length ?? 0;
  const taskCount = stageBlock?.checklist_tasks.length ?? 0;

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
      createIcon(isSelected ? "expand_less" : "expand_more"),
    ]),
  ];

  if (isSelected) {
    cardChildren.push(
      createElement("div", { className: "stage-card__body", id: `stage-panel-${stage.stage_id}` }, [
        createElement("p", { className: "text-body-md text-on-surface-variant" }, `${customFieldCount} custom fields · ${taskCount} checklist tasks`),
        createElement("div", { className: "stage-card__empty bg-surface-container-low" }, [
          createElement("p", { className: "text-label-md" }, "Stage details will appear here."),
          createElement("p", { className: "text-body-md text-on-surface-variant" }, "The next build steps will add dynamic custom fields and ad-hoc checklist controls for this visible stage."),
        ]),
        isCurrentStage && activeProduct.current_active_stage_index < MAX_STAGE_INDEX
          ? createElement("button", { className: "button-primary", type: "button", dataAction: "advance-stage", dataProductId: activeProduct.id }, "Advance to Next Stage")
          : null,
      ].filter(Boolean)),
    );
  }

  return createElement("article", { className: `stage-card bg-surface-container-lowest ${isCurrentStage ? "stage-card--current" : ""}` }, cardChildren);
}

function renderContextPanel(contextPanel) {
  replaceChildren(contextPanel);
}

function handleAppClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) return;

  const action = target.getAttribute("data-action");
  if (action === "select-stage") {
    stageSelection.selectedStageId = target.getAttribute("data-stage-id");
    renderFromCurrentState();
    return;
  }

  if (action === "advance-stage") {
    const productId = target.getAttribute("data-product-id");
    advanceProductStage(productId);
  }
}

function renderFromCurrentState() {
  const shell = getShellElements();
  if (!shell) return;
  renderApp(shell);
}

function getSelectedStageId(activeProduct, visibleStages) {
  if (!activeProduct || visibleStages.length === 0) return null;
  const currentSelectionIsVisible = visibleStages.some((stage) => stage.stage_id === stageSelection.selectedStageId);
  if (currentSelectionIsVisible) return stageSelection.selectedStageId;
  return visibleStages.at(-1)?.stage_id ?? null;
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
    ariaValueMax: (value) => setNullableAttribute(element, "aria-valuemax", value),
    ariaValueMin: (value) => setNullableAttribute(element, "aria-valuemin", value),
    ariaValueNow: (value) => setNullableAttribute(element, "aria-valuenow", value),
    className: (value) => {
      element.className = value;
    },
    dataAction: (value) => setNullableAttribute(element, "data-action", value),
    dataProductId: (value) => setNullableAttribute(element, "data-product-id", value),
    dataStageId: (value) => setNullableAttribute(element, "data-stage-id", value),
    href: (value) => setNullableAttribute(element, "href", value),
    id: (value) => setNullableAttribute(element, "id", value),
    placeholder: (value) => setNullableAttribute(element, "placeholder", value),
    role: (value) => setNullableAttribute(element, "role", value),
    style: (value) => applyStyle(element, value),
    type: (value) => setNullableAttribute(element, "type", value),
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

function applyStyle(element, style) {
  if (!style || typeof style !== "object") return;
  for (const [property, value] of Object.entries(style)) {
    element.style[property] = value;
  }
}
