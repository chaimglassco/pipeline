import { auditCampaignLevel, auditTargetLevel, auditTotals, type AuditAd } from "./ppc-audit";

export type WasteRules = { minClicks: number; minSpend: number; acos: number; cvr: number; cpc: number };
export const DEFAULT_WASTE_RULES: WasteRules = { minClicks: 10, minSpend: 15, acos: 40, cvr: 5, cpc: 2.5 };
export type WasteStatus = "Open" | "Reviewed" | "Action Taken";
export type WasteFinding = { id: string; row: AuditAd; source: string; reason: string; reasons: string[]; severity: "Critical" | "High" | "Medium"; action: string };
export function validWasteRules(value: unknown): value is WasteRules {
  if (!value || typeof value !== "object") return false;
  const v = value as WasteRules;
  return [v.minClicks, v.minSpend, v.acos, v.cvr, v.cpc].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000000) && Number.isInteger(v.minClicks) && v.acos > 0 && v.cpc > 0 && v.cvr <= 100;
}
export function wasteFindings(ads: AuditAd[], rules: WasteRules): WasteFinding[] {
  const groups = new Map<string, AuditAd[]>();
  for (const row of ads) { const key = JSON.stringify([row.type, row.campaignId]); const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); }
  const rows = [...groups.values()].flatMap(group => { const targets = auditTargetLevel(group); return targets.length ? targets : auditCampaignLevel(group); });
  return rows.flatMap(row => {
    if (row.spend <= 0 || row.spend < rules.minSpend || row.clicks < rules.minClicks) return [];
    const reasons = [row.orders === 0 ? "Spend With No Orders" : "", row.sales > 0 && row.spend / row.sales * 100 > rules.acos ? "High ACOS" : "", row.clicks > 0 && row.orders / row.clicks * 100 < rules.cvr ? "Low CVR" : "", row.clicks > 0 && row.spend / row.clicks > rules.cpc ? "High CPC" : ""].filter(Boolean);
    if (!reasons.length) return [];
    const reason = reasons[0];
    const source = row.query ? "Search Terms" : /producttarget/.test(row.entity) ? "Product Targets" : row.target && row.entity.includes("keyword") ? "Keyword Targets" : row.target ? "Targets (unspecified)" : "Campaign / ASIN";
    return [{ id: JSON.stringify([row.type, row.entity, row.campaignId, row.adGroup, row.asin, row.sku, row.target, row.query, row.match, row.placement]), row, source, reason, reasons, severity: reason === "Spend With No Orders" ? "Critical" as const : reason === "High ACOS" ? "High" as const : "Medium" as const, action: reason === "Spend With No Orders" ? "Review relevance and negative exact coverage" : reason === "High ACOS" ? "Review bids and relevance" : reason === "Low CVR" ? "Review listing and targeting relevance" : "Review bids and cost per click" }];
  }).sort((a, b) => b.row.spend - a.row.spend || a.id.localeCompare(b.id));
}

export function readWasteReview(text: string | null, auditId: string): { rules: WasteRules; statuses: Record<string, WasteStatus> } | null {
  try {
    if (!text || text.length > 5000000) return null;
    const value = JSON.parse(text);
    if (value.version !== 1 || value.auditId !== auditId || !validWasteRules(value.rules) || !value.statuses || typeof value.statuses !== "object" || Array.isArray(value.statuses)) return null;
    const entries = Object.entries(value.statuses);
    if (entries.length > 100000 || !entries.every(([k, v]) => k.length <= 10000 && ["Open", "Reviewed", "Action Taken"].includes(String(v)))) return null;
    return { rules: value.rules, statuses: Object.fromEntries(entries) as Record<string, WasteStatus> };
  } catch { return null; }
}

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function auditOpportunities(ads: AuditAd[]) {
  const exact = new Set(ads.filter(r => r.asin && r.target && !r.query && r.match.toLowerCase() === "exact" && !r.entity.includes("negative")).map(r => JSON.stringify([r.asin, normalized(r.target)])));
  const groups = new Map<string, AuditAd[]>();
  for (const row of ads.filter(r => r.query)) { const key = JSON.stringify([row.asin || `unmapped:${row.sku}:${row.campaignId}:${row.adGroup}`, normalized(row.query)]); const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); }
  return [...groups.values()].map(members => ({ name: normalized(members[0].query), asin: members[0].asin, ...auditTotals(members), members })).filter(r => r.orders > 0 && (!r.asin || !exact.has(JSON.stringify([r.asin, r.name])))).sort((a, b) => b.sales - a.sales);
}
