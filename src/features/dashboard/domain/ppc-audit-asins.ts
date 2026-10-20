import { auditCampaignLevel, auditRate, auditTargetLevel, auditTotals, type AuditAd, type AuditBusiness } from "./ppc-audit";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
export const ASIN_ACOS_TARGET = 20;
export const ASIN_TACOS_TARGET = 12;
export type AsinScope = { match?: string; placement?: string; campaign?: string; type?: string };
export type AsinPerformance = ReturnType<typeof advertisedAsinRows>[number];
export const asinCampaignKey = (r: AuditAd) => JSON.stringify([r.type, r.campaignId]);
export function groupAsinAds(rows: AuditAd[], key: (r: AuditAd) => string) { const map = new Map<string, AuditAd[]>(); for (const row of rows) { const id = key(row); const group = map.get(id); if (group) group.push(row); else map.set(id, [row]); } return [...map].map(([name, members]) => ({ name, members, ...auditTotals(members) })).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name)); }
export function advertisedEvidence(ads: AuditAd[], scope: AsinScope = {}) {
  return groupAsinAds(ads, asinCampaignKey).flatMap(group => {
    if (scope.placement) { const dimension = group.members.filter(r => r.placement === scope.placement && (!scope.match || r.match === scope.match)); const selected = auditCampaignLevel(dimension); return selected.length ? selected : dimension; }
    const primary = group.members.filter(r => !r.placement && !r.entity.includes("negative"));
    if (scope.match) return auditTargetLevel(primary.filter(r => r.match === scope.match));
    const products = primary.filter(r => r.entity === "productad");
    if (products.length) return products;
    const targets = auditTargetLevel(primary);
    if (targets.length) return targets;
    return auditCampaignLevel(primary);
  });
}
export function advertisedAsinRows(ads: AuditAd[], business: AuditBusiness[], scope: AsinScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const raw = ads.filter(r => !r.entity.includes("negative") && (!scope.campaign || asinCampaignKey(r) === scope.campaign) && (!scope.type || r.type === scope.type));
  const evidence = advertisedEvidence(raw, scope);
  const dimensions = raw.filter(r => (!scope.match || r.match === scope.match) && (!scope.placement || r.placement === scope.placement));
  const waste = wasteFindings(dimensions, rules);
  const rawByAsin = new Map(groupAsinAds(dimensions, r => r.asin || "Unmapped").map(g => [g.name, g.members]));
  const evidenceByAsin = new Map(groupAsinAds(evidence, r => r.asin || "Unmapped").map(g => [g.name, g.members]));
  const wasteByAsin = new Map<string, number>(); for (const f of waste) { const key = f.row.asin || "Unmapped"; wasteByAsin.set(key, (wasteByAsin.get(key) || 0) + f.row.spend); }
  const wasteByCampaignAsin = new Map<string, number>(); for (const f of waste) { const key = JSON.stringify([f.row.asin || "Unmapped", asinCampaignKey(f.row)]); wasteByCampaignAsin.set(key, (wasteByCampaignAsin.get(key) || 0) + f.row.spend); }
  const businessByAsin = new Map(business.map(r => [r.asin, r]));
  const ids = new Set(evidenceByAsin.keys());
  for (const [id, rows] of rawByAsin) if (rows.some(r => r.query || r.target || r.placement || r.entity === "productad")) ids.add(id);
  const partial = !!(scope.campaign || scope.type || scope.match || scope.placement);
  return [...ids].map(asin => {
    const rows = rawByAsin.get(asin) || [], selected = evidenceByAsin.get(asin) || [], totals = selected.length ? auditTotals(selected) : null, b = businessByAsin.get(asin);
    const organicSales = !partial && b && totals && b.sales >= totals.sales ? b.sales - totals.sales : null;
    const organicOrders = !partial && b && totals && b.orders >= totals.orders ? b.orders - totals.orders : null;
    const targets = auditTargetLevel(rows.filter(r => !r.placement));
    const campaigns = groupAsinAds(selected, asinCampaignKey).map(g => ({ ...g, label: `${g.members[0].campaign} · ${g.members[0].type}`, waste: wasteByCampaignAsin.get(JSON.stringify([asin, g.name])) || 0 }));
    const matches = groupAsinAds(targets, r => r.match || "Not supplied");
    const placementGroups = groupAsinAds(rows.filter(r => r.placement), r => r.placement).map(g => { const selected = auditCampaignLevel(g.members); return { name: g.name, ...auditTotals(selected.length ? selected : g.members) }; }).sort((a, b) => b.sales - a.sales);
    const acos = totals ? auditRate(totals.spend, totals.sales) : null, tacos = !partial && b && totals ? auditRate(totals.spend, b.sales) : null;
    const wasted = wasteByAsin.get(asin) || 0;
    const status = asin === "Unmapped" ? "ASIN Mapping Needed" : !totals ? "Performance Unavailable" : !b ? "Business Data Missing" : !partial && (b.sales < totals.sales || b.orders < totals.orders) ? "Check Report Scope" : acos !== null && acos > ASIN_ACOS_TARGET ? "High ACOS" : wasted > 0 ? "High Wasted Spend" : tacos !== null && tacos > ASIN_TACOS_TARGET ? "High TACOS" : "Healthy";
    return { asin, raw: rows, evidence: selected, totals, business: b, organicSales, organicOrders, waste: wasted, acos, tacos, ppcShare: !partial && b && totals ? auditRate(totals.sales, b.sales) : null, organicShare: organicSales !== null && b ? auditRate(organicSales, b.sales) : null, cpc: totals?.clicks ? totals.spend / totals.clicks : null, cvr: totals ? auditRate(totals.orders, totals.clicks) : null, campaigns, targets, matches, placements: placementGroups, bestCampaign: campaigns[0]?.label || "—", bestMatch: matches[0]?.name || "—", bestPlacement: placementGroups[0]?.name || "—", status, partial };
  });
}
