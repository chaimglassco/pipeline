import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { asinCampaignKey } from "./ppc-audit-asins";
import { campaignPerformance } from "./ppc-audit-campaigns";
import { canonicalCampaignType } from "./ppc-audit-campaign-types";
import { DEFAULT_WASTE_RULES, type WasteRules } from "./ppc-audit-waste";

export const PLACEMENTS = ["Top of Search", "Rest of Search", "Product Pages"];
export function placementName(value: string) {
  const name = value.toLowerCase().replace(/[^a-z]/g, "");
  if (name.includes("topofsearch") || name === "placementtop") return PLACEMENTS[0];
  if (name.includes("restofsearch")) return PLACEMENTS[1];
  if (name.includes("productpage")) return PLACEMENTS[2];
  return value.trim();
}
export type PlacementScope = { asin?: string; campaign?: string; type?: string; placement?: string; match?: string; search?: string };
const groupBy = <T,>(rows: T[], key: (r: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const group = groups.get(id); if (group) group.push(row); else groups.set(id, [row]); }
  return [...groups].map(([key, members]) => ({ key, members }));
};
const hasPerformance = (r: AuditAd) => r.placementMetricsAvailable ?? [r.spend, r.sales, r.orders, r.clicks, r.impressions].some(v => v > 0);

// Each placement is an independent dimension. Never fill it from campaign totals.
export function placementEvidence(rows: AuditAd[]): AuditAd[] {
  const measured = rows.filter(hasPerformance);
  const aggregate = measured.filter(r => !r.asin && !r.adGroup && !r.target && !r.query);
  if (aggregate.length) {
    for (const entity of ["campaign", "placement", "biddingadjustment"]) {
      const candidates = aggregate.filter(r => r.entity === entity);
      if (candidates.length) return candidates.length === 1 ? candidates : [];
    }
    return aggregate.length === 1 ? aggregate : [];
  }
  const asinRollups = measured.filter(r => r.asin && !r.adGroup && !r.target && !r.query);
  if (asinRollups.length) {
    for (const entity of ["campaign", "placement", "biddingadjustment"]) {
      const candidates = asinRollups.filter(r => r.entity === entity);
      if (candidates.length) return groupBy(candidates, r => r.asin).every(g => g.members.length === 1) ? candidates : [];
    }
  }
  // Keep a single hierarchy level even when lower-level reports use different ad groups.
  for (const entity of ["adgroup", "productad"]) {
    const candidates = measured.filter(r => r.entity === entity);
    if (candidates.length) return candidates;
  }
  const queries = measured.filter(r => r.query);
  if (queries.length) return queries;
  const targets = measured.filter(r => r.target);
  return targets.length ? targets : measured;
}
export function placementFlaggedSpend(rows: AuditAd[], rules: WasteRules) {
  return rows.filter(r => r.spend > 0 && r.spend >= rules.minSpend && r.clicks >= rules.minClicks &&
    (r.orders === 0 || r.sales > 0 && r.spend / r.sales * 100 > rules.acos || r.clicks > 0 && (r.orders / r.clicks * 100 < rules.cvr || r.spend / r.clicks > rules.cpc)))
    .reduce((sum, r) => sum + r.spend, 0);
}
export function placementSummary(rows: AuditAd[], rules: WasteRules = DEFAULT_WASTE_RULES) {
  const evidence = groupBy(rows, r => JSON.stringify([asinCampaignKey(r), placementName(r.placement)])).flatMap(g => placementEvidence(g.members));
  const available = evidence.length > 0;
  const totals = auditTotals(evidence);
  const waste = placementFlaggedSpend(evidence, rules);
  const acos = available ? auditRate(totals.spend, totals.sales) : null;
  const cvr = available ? auditRate(totals.orders, totals.clicks) : null;
  const status = !available ? "Performance Unavailable" : totals.spend === 0 && totals.sales === 0 ? "No Spend" :
    acos !== null && acos > 20 ? "High ACOS" : waste > 0 ? "High Wasted Spend" :
    cvr !== null && cvr < rules.cvr ? "Low CVR" : totals.orders >= 5 && acos !== null && acos <= 20 ? "Strong" : "Healthy";
  return { evidence, available, totals, waste, acos, cvr, status,
    ctr: available ? auditRate(totals.clicks, totals.impressions) : null,
    cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null,
    wasteRate: available ? auditRate(waste, totals.spend) : null,
  };
}
export function placementAnalysis(ads: AuditAd[], scope: PlacementScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const campaigns = new Map(campaignPerformance(ads).map(c => [c.id, c]));
  const all = ads.filter(r => r.placement && !r.entity.includes("negative"));
  const raw = all.filter(r => (!scope.asin || (r.asin || "Unmapped") === scope.asin) &&
    (!scope.campaign || asinCampaignKey(r) === scope.campaign) && (!scope.type || canonicalCampaignType(r.type) === scope.type) &&
    (!scope.placement || placementName(r.placement) === scope.placement) && (!scope.match || r.match === scope.match) &&
    (!scope.search || [r.campaign, r.adGroup, r.asin, r.sku, r.target, r.query].some(v => v.toLowerCase().includes(scope.search!.toLowerCase().trim()))));
  const portfolio = placementSummary(raw, rules);
  const names = [...new Set([...PLACEMENTS, ...all.map(r => placementName(r.placement))])];
  const groups = names.map(name => {
    const summary = placementSummary(raw.filter(r => placementName(r.placement) === name), rules);
    const spendShare = summary.available ? auditRate(summary.totals.spend, portfolio.totals.spend) : null;
    const salesShare = summary.available ? auditRate(summary.totals.sales, portfolio.totals.sales) : null;
    const orderShare = summary.available ? auditRate(summary.totals.orders, portfolio.totals.orders) : null;
    return { name, ...summary, spendShare, salesShare, orderShare, delta: spendShare !== null && salesShare !== null ? salesShare - spendShare : null };
  });
  const byAsin = groupBy(raw.filter(r => r.asin), r => r.asin).map(g => ({ asin: g.key, ...placementSummary(g.members, rules), placements: groupBy(g.members, r => placementName(r.placement)).map(p => ({ name: p.key, ...placementSummary(p.members, rules) })) }));
  const byCampaign = groupBy(raw, r => JSON.stringify([asinCampaignKey(r), placementName(r.placement)])).map(g => {
    const r = g.members[0];
    const adjustments = [...new Set(g.members.map(r => r.placementBidAdjustment).filter((v): v is number => v !== undefined))];
    return { id: g.key, campaignKey: asinCampaignKey(r), name: r.campaign, type: r.type, placement: placementName(r.placement), campaignState: campaigns.get(asinCampaignKey(r))?.state || "Not supplied", adjustment: adjustments.length === 1 ? adjustments[0] : null, ...placementSummary(g.members, rules) };
  });
  const matches = groupBy(raw.filter(r => r.match), r => JSON.stringify([r.match, placementName(r.placement)])).map(g => ({ match: g.members[0].match, placement: placementName(g.members[0].placement), ...placementSummary(g.members, rules) }));
  // Ledger uses exactly the selected performance grain; subordinate totals remain separate.
  const ledger = portfolio.evidence.map(r => ({ id: JSON.stringify([asinCampaignKey(r), r.placement, r.entity, r.adGroup, r.asin, r.target, r.query, r.match]), row: r, campaignKey: asinCampaignKey(r), ...placementSummary([r], rules) }));
  const best = groups.filter(g => g.available && g.totals.orders > 0 && g.acos !== null).sort((a, b) => a.acos! - b.acos! || b.totals.sales - a.totals.sales)[0];
  const highestWaste = groups.filter(g => g.waste > 0).sort((a, b) => b.waste - a.waste)[0];
  const unavailableGroups = byCampaign.filter(c => !c.available).length;
  return { raw, portfolio, groups, byAsin, byCampaign, matches, ledger, best, highestWaste, unavailableGroups, hasPlacementRows: all.length > 0 };
}
export type PlacementAnalysis = ReturnType<typeof placementAnalysis>;
