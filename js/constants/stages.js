export const LAUNCHFLOW_STAGES = Object.freeze([
  { stage_id: "product-research", stage_index: 1, label: "Product Research", phase: "pipeline" },
  { stage_id: "product-development", stage_index: 2, label: "Product Development", phase: "pipeline" },
  { stage_id: "supplier-sourcing", stage_index: 3, label: "Supplier Sourcing", phase: "pipeline" },
  { stage_id: "under-final-order", stage_index: 4, label: "Under Final Order", phase: "pipeline" },
  { stage_id: "shipping", stage_index: 5, label: "Shipping", phase: "pipeline" },
  { stage_id: "keyword-research", stage_index: 6, label: "Keyword Research", phase: "pipeline" },
  { stage_id: "listing-creation", stage_index: 7, label: "Listing Creation", phase: "pipeline" },
  { stage_id: "image-planning", stage_index: 8, label: "Image Planning", phase: "pipeline" },
  { stage_id: "campaign-prep", stage_index: 9, label: "Campaign Prep", phase: "pipeline" },
  { stage_id: "amazon-inbound", stage_index: 10, label: "Amazon Inbound", phase: "pipeline" },
  { stage_id: "enrolled-to-vines", stage_index: 11, label: "Enrolled to Vines", phase: "pipeline" },
  { stage_id: "launch", stage_index: 12, label: "Launch", phase: "pipeline" },
  { stage_id: "stable", stage_index: 13, label: "Stable", phase: "optimization" },
  { stage_id: "scaling", stage_index: 14, label: "Scaling", phase: "optimization" },
]);

export const MIN_STAGE_INDEX = 1;
export const MAX_STAGE_INDEX = LAUNCHFLOW_STAGES.length;

const STAGE_IDS = new Set(LAUNCHFLOW_STAGES.map((stage) => stage.stage_id));

export function isLaunchFlowStageId(stageId) {
  return STAGE_IDS.has(stageId);
}

export function getStageById(stageId) {
  return LAUNCHFLOW_STAGES.find((stage) => stage.stage_id === stageId) ?? null;
}

export function getStageByIndex(stageIndex) {
  return LAUNCHFLOW_STAGES.find((stage) => stage.stage_index === stageIndex) ?? null;
}
