import { auditCampaignLevel, auditTargetLevel, auditTotals, type AuditAd } from "./ppc-audit";

export type OpportunityRules = { acos: number; cvr: number; minOrders: number; harvestAcos: number; excludeExact: boolean; placementOrders: number };
export const DEFAULT_OPPORTUNITY_RULES: OpportunityRules = { acos: 20, cvr: 12, minOrders: 2, harvestAcos: 20, excludeExact: true, placementOrders: 5 };
export type OpportunityStatus = "New" | "Reviewed" | "Action Planned" | "Action Taken";
export type Opportunity = { id: string; row: AuditAd; source: string; reason: string; strength: string; action: string };
export function validOpportunityRules(value: unknown): value is OpportunityRules {
  if (!value || typeof value !== "object") return false;
  const v = value as OpportunityRules;
  return [v.acos, v.cvr, v.minOrders, v.harvestAcos, v.placementOrders].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000000) && v.acos > 0 && v.harvestAcos > 0 && v.cvr <= 100 && Number.isInteger(v.minOrders) && v.minOrders >= 1 && Number.isInteger(v.placementOrders) && v.placementOrders >= 1 && typeof v.excludeExact === "boolean";
}
const normalized = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
export function opportunitySource(row: AuditAd) { return row.query ? "Search Term" : row.placement ? "Placement" : row.entity.includes("producttarget") ? "Product Target" : row.entity.includes("keyword") ? "Keyword Target" : row.target ? "Target (unspecified)" : "Campaign / ASIN"; }
export function opportunityIdentity(row: AuditAd) { return JSON.stringify([row.type, row.entity, row.campaignId, row.adGroup, row.asin, row.sku, row.target, row.query, row.match, row.placement]); }
export function opportunityEvidence(ads: AuditAd[]) {
  const groups = new Map<string, AuditAd[]>();
  for (const row of ads.filter(r => !r.entity.includes("negative"))) { const key = JSON.stringify([row.type, row.campaignId]); const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); }
  return [...groups.values()].flatMap(group => { const primary = group.filter(r => !r.placement); const targets = auditTargetLevel(primary); const campaign = auditCampaignLevel(primary); return targets.length ? targets : campaign.length ? campaign : group.filter(r => r.placement); });
}
export function opportunityFindings(ads: AuditAd[], rules: OpportunityRules): Opportunity[] {
  // Coverage is checked against the whole upload before any UI filter is applied.
  const exact = new Set(ads.filter(r => r.asin && r.target && !r.query && normalized(r.match) === "exact" && !r.entity.includes("negative")).map(r => JSON.stringify([r.asin, normalized(r.target)])));
  return opportunityEvidence(ads).flatMap(row => {
    if (row.sales <= 0 || row.orders < rules.minOrders) return [];
    const acos = row.spend / row.sales * 100, cvr = row.clicks ? row.orders / row.clicks * 100 : null;
    const covered = row.query && row.asin && exact.has(JSON.stringify([row.asin, normalized(row.query)]));
    let reason = "", action = "";
    if (row.query && acos <= rules.harvestAcos && (!rules.excludeExact || !covered)) { reason = "Search Term Harvesting"; action = row.asin ? "Confirm live exact coverage before harvesting" : "Map the advertised ASIN and confirm exact coverage"; }
    else if (!row.query && row.placement && row.orders >= rules.placementOrders && acos <= rules.acos) { reason = "Placement Scaling"; action = "Review placement performance and bid adjustments"; }
    else if (!row.query && row.target && acos <= rules.acos && cvr !== null && cvr >= rules.cvr) { reason = row.entity.includes("producttarget") ? "Product Targeting Harvest" : "Bid Increase Candidates"; action = "Review bids, relevance, and available inventory"; }
    else if (!row.query && !row.target && !row.placement && acos <= rules.acos) { reason = "Efficient Campaign"; action = "Review campaign growth potential; budget utilization is unavailable"; }
    if (!reason) return [];
    return [{ id: opportunityIdentity(row), row, source: opportunitySource(row), reason, strength: row.orders >= Math.max(5, rules.minOrders) && cvr !== null && cvr >= rules.cvr ? "Strong" : "Emerging", action }];
  }).sort((a, b) => b.row.sales - a.row.sales || b.row.orders - a.row.orders || a.id.localeCompare(b.id));
}
export function placementPerformance(ads: AuditAd[]) {
  // Placement rows are a separate dimension, never added to the opportunity totals.
  const groups = new Map<string, AuditAd[]>();
  for (const row of ads.filter(r => r.placement)) { const group = groups.get(row.placement); if (group) group.push(row); else groups.set(row.placement, [row]); }
  return [...groups].map(([name, members]) => ({ name, ...auditTotals(auditCampaignLevel(members).length ? auditCampaignLevel(members) : members) })).sort((a, b) => b.sales - a.sales);
}
export function readOpportunityReview(text: string | null, auditId: string): { rules: OpportunityRules; statuses: Record<string, OpportunityStatus> } | null {
  try {
    if (!text || text.length > 5000000) return null;
    const value = JSON.parse(text);
    if (value.version !== 1 || value.auditId !== auditId || !validOpportunityRules(value.rules) || !value.statuses || typeof value.statuses !== "object" || Array.isArray(value.statuses)) return null;
    const entries = Object.entries(value.statuses);
    if (entries.length > 100000 || !entries.every(([k, v]) => k.length <= 10000 && ["New", "Reviewed", "Action Planned", "Action Taken"].includes(String(v)))) return null;
    return { rules: value.rules, statuses: Object.fromEntries(entries) as Record<string, OpportunityStatus> };
  } catch { return null; }
}
