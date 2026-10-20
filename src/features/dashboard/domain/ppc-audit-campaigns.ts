import { auditCampaignLevel, auditRate, auditTargetLevel, auditTotals, type AuditAd } from "./ppc-audit";
import { advertisedEvidence, ASIN_ACOS_TARGET, asinCampaignKey, groupAsinAds } from "./ppc-audit-asins";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
export type CampaignScope = { asins?: string[]; campaigns?: string[]; type?: string; strategy?: string; match?: string; placement?: string; state?: string };
export type CampaignPerformance = ReturnType<typeof campaignPerformance>[number];
export function campaignPerformance(ads: AuditAd[], scope: CampaignScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  return groupAsinAds(ads.filter(r => !r.entity.includes("negative")), asinCampaignKey).flatMap(group => {
    const raw = group.members;
    if (scope.campaigns?.length && !scope.campaigns.includes(group.name)) return [];
    if (scope.type && raw[0].type !== scope.type) return [];
    const campaignRows = raw.filter(r => r.entity === "campaign");
    const states = [...new Set([...campaignRows.map(r => r.campaignState || r.state), ...raw.map(r => r.campaignState || "")].filter(Boolean).map(s => s.trim().toLowerCase()))];
    const state = states.length > 1 ? "Conflicting states" : states[0] && /^(enabled|active)$/.test(states[0]) ? "Enabled" : states[0] === "paused" ? "Paused" : states[0] === "archived" ? "Archived" : states[0] || "Not supplied";
    const strategies = [...new Set(raw.map(r => r.strategy).filter(Boolean))];
    const strategy = strategies.length > 1 ? "Multiple reported strategies" : strategies[0] || "Not supplied";
    if (scope.state && state !== scope.state || scope.strategy && strategy !== scope.strategy) return [];
    const allAsins = [...new Set(raw.map(r => r.asin).filter(Boolean))].sort();
    const matchesAsin = (r: AuditAd) => !scope.asins?.length || (r.asin ? scope.asins.includes(r.asin) : scope.asins.includes("Unmapped") && !!(r.query || r.target || r.entity === "productad"));
    if (scope.asins?.length && !raw.some(matchesAsin)) return [];
    const dimension = raw.filter(r => matchesAsin(r) && (!scope.match || r.match === scope.match) && (!scope.placement || r.placement === scope.placement));
    if ((scope.match || scope.placement) && !dimension.length) return [];
    const selected = scope.asins?.length || scope.match || scope.placement ? advertisedEvidence(raw, { match: scope.match, placement: scope.placement }).filter(r => !scope.asins?.length || scope.asins.includes(r.asin || "Unmapped")) : auditCampaignLevel(raw.filter(r => !r.placement));
    const totals = selected.length ? auditTotals(selected) : null;
    const findings = wasteFindings(dimension, rules), waste = findings.reduce((n, f) => n + f.row.spend, 0);
    const targets = auditTargetLevel(dimension.filter(r => !r.placement));
    const adGroups = groupAsinAds(dimension.filter(r => r.adGroup && !r.placement), r => r.adGroup).map(g => { const product = g.members.filter(r => r.entity === "adgroup"); const evidence = product.length ? product : advertisedEvidence(g.members, { match: scope.match }); return { name: g.name, ...auditTotals(evidence) }; }).sort((a, b) => b.spend - a.spend);
    const matches = groupAsinAds(targets, r => r.match || "Not supplied");
    const placements = groupAsinAds(dimension.filter(r => r.placement), r => r.placement).map(g => { const evidence = auditCampaignLevel(g.members); return { name: g.name, ...auditTotals(evidence.length ? evidence : g.members) }; }).sort((a, b) => b.sales - a.sales);
    const budgets = [...new Set(raw.map(r => r.dailyBudget).filter((n): n is number => n !== undefined))];
    const dailyBudget = budgets.length === 1 ? budgets[0] : null;
    const acos = totals ? auditRate(totals.spend, totals.sales) : null, cvr = totals ? auditRate(totals.orders, totals.clicks) : null;
    const scaling = !!totals && totals.orders >= 5 && acos !== null && acos <= ASIN_ACOS_TARGET && cvr !== null && cvr >= 12 && state !== "Paused" && state !== "Archived";
    const status = !totals ? "Performance Unavailable" : state === "Paused" || state === "Archived" ? state : acos !== null && acos > ASIN_ACOS_TARGET ? "High ACOS" : waste > 0 ? "High Wasted Spend" : scaling ? "Scaling Review" : "Healthy";
    return [{ id: group.name, name: raw[0].campaign, type: raw[0].type, state, strategy, dailyBudget, budgetConflict: budgets.length > 1, asins: scope.asins?.length ? allAsins.filter(a => scope.asins!.includes(a)) : allAsins, raw, evidence: selected, totals, findings, waste, targets, adGroups, matches, placements, acos, cvr, cpc: totals?.clicks ? totals.spend / totals.clicks : null, scaling, status, bestPlacement: placements[0]?.sales > 0 ? placements[0].name : "—" }];
  });
}
