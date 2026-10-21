import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { asinCampaignKey } from "./ppc-audit-asins";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
import { placementName } from "./ppc-audit-placements";

const norm = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const expression = (text: string) => norm(text).replace(/\s*([=:])\s*/g, "$1");
export function productTargetType(r: AuditAd): "ASIN Target" | "Category Target" | null {
  if (!r.target || /negative|keyword/i.test(r.entity) || !/producttarget|^target$|searchterm|placement|biddingadjustment/i.test(r.entity)) return null;
  if (/^(?:asin(?:-expanded)?|asinSameAs)\s*[=:]\s*["']?[a-z0-9]{10}(?:["']|$|\s)/i.test(r.target.trim()) || /producttarget/i.test(r.entity) && /^[a-z0-9]{10}$/i.test(r.target.trim())) return "ASIN Target";
  return /^(?:category|categorySameAs)\s*[=:]\s*["']?\d+(?:["']|$|\s)/i.test(r.target.trim()) ? "Category Target" : null;
}
export const productTargetMatchName = (text: string) => text || "Not supplied";
const measured = (r: AuditAd) => (r.targetMetricsAvailable ?? [r.spend, r.sales, r.orders, r.clicks, r.impressions].some(n => n > 0)) && r.placementMetricsAvailable !== false;
export const isProductTarget = (r: AuditAd) => productTargetType(r) !== null;
const identity = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.targetId || expression(r.target), norm(r.match), r.asin || r.sku || "Unmapped"]);
type ProductTargetGroup = { id: string; row: AuditAd; records: AuditAd[]; queries: AuditAd[]; placements: AuditAd[] };
function matchesProductTarget(group: ProductTargetGroup, row: AuditAd) {
  const target = group.row;
  if (row.type !== target.type || row.campaignId !== target.campaignId || row.entity.includes("negative")) return false;
  if (row.asin && target.asin && row.asin !== target.asin) return false;
  if (row.match && target.match && norm(row.match) !== norm(target.match)) return false;
  if (row.adGroupId && target.adGroupId && row.adGroupId !== target.adGroupId) return false;
  if (row.adGroup && target.adGroup && norm(row.adGroup) !== norm(target.adGroup)) return false;
  if (row.target && target.target && expression(row.target) !== expression(target.target)) return false;
  if (row.targetId || target.targetId) return !!row.targetId && !!target.targetId && row.targetId === target.targetId;
  return !!row.target && expression(row.target) === expression(target.target) &&
    !!(row.adGroupId && target.adGroupId || row.adGroup && target.adGroup) && !!row.match && !!target.match;
}
function evidence(records: AuditAd[], queries: AuditAd[]) {
  const parents = records.filter(measured);
  const preferred = parents.filter(r => /producttarget/i.test(r.entity));
  const chosen = preferred.length ? preferred : parents;
  // Two parent records with the same identity are ambiguous, never additive.
  return chosen.length ? chosen.length === 1 ? chosen : [] : queries.filter(measured);
}
function stats(rows: AuditAd[]) {
  const totals = auditTotals(rows), available = rows.length > 0;
  return { totals, available, acos: available ? auditRate(totals.spend, totals.sales) : null,
    cvr: available ? auditRate(totals.orders, totals.clicks) : null,
    cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null };
}
export type ProductTargetScope = { asin?: string; campaign?: string; match?: string; placement?: string; search?: string; minSpend?: number; status?: string };
export function productTargetAnalysis(ads: AuditAd[], scope: ProductTargetScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  ads = ads.map(row => ({ ...row, match: productTargetType(row) || "" }));
  const groups = new Map<string, ProductTargetGroup>();
  const byProductTargetId = new Map<string, ProductTargetGroup[]>(), byTarget = new Map<string, ProductTargetGroup[]>();
  const idKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId, row.targetId]);
  const targetKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId, expression(row.target)]);
  function register(group: ProductTargetGroup) {
    groups.set(group.id, group);
    if (group.row.targetId) { const key = idKey(group.row); const bucket = byProductTargetId.get(key); if (bucket) bucket.push(group); else byProductTargetId.set(key, [group]); }
    const key = targetKey(group.row); const bucket = byTarget.get(key); if (bucket) bucket.push(group); else byTarget.set(key, [group]);
  }
  const candidatesFor = (row: AuditAd) => (row.targetId && byProductTargetId.has(idKey(row)) ? byProductTargetId.get(idKey(row))! : byTarget.get(targetKey(row)) || []).filter(g => matchesProductTarget(g, row));
  for (const row of ads.filter(r => !r.query && !r.placement && isProductTarget(r))) {
    const id = identity(row), existing = groups.get(id);
    if (existing) existing.records.push(row); else register({ id, row, records: [row], queries: [], placements: [] });
  }
  for (const row of ads.filter(r => r.placement && isProductTarget(r))) {
    const id = identity(row);
    if (!groups.has(id)) register({ id, row, records: [], queries: [], placements: [] });
  }
  let unlinkedQueries = 0;
  for (const row of ads.filter(r => r.query && !r.placement && !r.entity.includes("negative") && (isProductTarget(r) || r.targetId))) {
    const candidates = candidatesFor(row);
    if (candidates.length === 1) candidates[0].queries.push(row);
    else if (candidates.length > 1) unlinkedQueries++;
    else if ((byTarget.get(targetKey(row)) || []).some(g => norm(g.row.match) === norm(row.match) && (g.row.adGroupId && row.adGroupId ? g.row.adGroupId === row.adGroupId : norm(g.row.adGroup) === norm(row.adGroup)))) unlinkedQueries++;
    else if (isProductTarget(row) && (row.targetId || row.adGroupId || row.adGroup) && row.match) {
      const id = identity(row); const existing = groups.get(id);
      if (existing) existing.queries.push(row); else register({ id, row, records: [], queries: [row], placements: [] });
    } else unlinkedQueries++;
  }
  // A placement needs an explicit target or productTarget ID and a unique contextual match.
  for (const row of ads.filter(r => r.placement && !r.entity.includes("negative") && (r.targetId || r.target))) {
    const candidates = candidatesFor(row);
    if (candidates.length === 1) candidates[0].placements.push(row);
  }
  const contextKey = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.targetId || expression(r.target), r.match]);
  const productContexts = new Set([...groups.values()].filter(g => g.row.asin && [...g.records, ...g.queries].some(measured)).map(g => contextKey(g.row)));
  const aggregateCopies = new Set([...groups.values()].filter(g => !g.row.asin && !g.row.sku && productContexts.has(contextKey(g.row))).map(g => g.id));
  const candidates = [...groups.values()].filter(g => !aggregateCopies.has(g.id)).flatMap(group => {
    const row = group.row;
    if (scope.asin && (row.asin || "Unmapped") !== scope.asin || scope.campaign && asinCampaignKey(row) !== scope.campaign || scope.match && norm(productTargetMatchName(row.match)) !== norm(scope.match)) return [];
    if (scope.search && ![row.target, row.campaign, row.adGroup, row.asin, row.sku].some(v => norm(v).includes(norm(scope.search!)))) return [];
    const placementRows = scope.placement ? group.placements.filter(r => placementName(r.placement) === scope.placement) : [];
    if (scope.placement && !placementRows.length) return [];
    const queryRows = scope.placement ? placementRows.filter(r => r.query) : group.queries;
    const parentRows = scope.placement ? placementRows.filter(r => !r.query) : group.records.filter(r => !r.placement);
    const selected = evidence(parentRows, queryRows), summary = stats(selected);
    if (scope.minSpend && (!summary.available || summary.totals.spend < scope.minSpend)) return [];
    const queryEvidence = queryRows.filter(measured);
    const queryMismatch = parentRows.filter(measured).length > 0 && auditTotals(queryEvidence).spend > summary.totals.spend + 0.01;
    const findings = wasteFindings(queryEvidence.length && !queryMismatch ? queryEvidence : selected, rules);
    const flaggedQueries = new Set(findings.map(finding => finding.row));
    const waste = findings.reduce((sum, finding) => sum + finding.row.spend, 0);
    const bidRows = group.records.filter(r => !r.query && !r.placement && (r.bidAvailable ?? r.bid > 0));
    const bids = [...new Set(bidRows.map(r => r.bid))];
    const placementNames = [...new Set(group.placements.map(r => placementName(r.placement)))];
    const placements = placementNames.map(name => {
      const rows = group.placements.filter(r => placementName(r.placement) === name);
      const selected = evidence(rows.filter(r => !r.query), rows.filter(r => r.query));
      return { name, ...stats(selected), waste: wasteFindings(selected, rules).reduce((sum, finding) => sum + finding.row.spend, 0) };
    });
    const searchTerms = queryEvidence.map(q => {
      const summary = stats([q]);
      return { row: q, ...summary, waste: flaggedQueries.has(q) ? q.spend : 0 };
    }).sort((a, b) => b.row.sales - a.row.sales);
    return [{ ...group, ...summary, evidence: selected, queryEvidence, queryMismatch, findings, waste, bid: bids.length === 1 ? bids[0] : null, placements, searchTerms, source: parentRows.filter(measured).length ? "Product target report" : "Search-term evidence" }];
  });
  const scopedTotals = auditTotals(candidates.flatMap(r => r.evidence));
  const averageCpc = scopedTotals.clicks > 0 ? scopedTotals.spend / scopedTotals.clicks : null;
  const classified = candidates.map(r => {
    const { totals: t, acos, cvr, cpc } = r;
    const strong = r.available && t.orders >= 5 && acos !== null && acos <= 20 && cvr !== null && cvr >= 10;
    const opportunity = r.available && !strong && t.orders >= 2 && acos !== null && acos <= 20 && cvr !== null && cvr >= 12;
    const noOrders = r.available && t.spend > 0 && t.spend >= rules.minSpend && t.clicks >= rules.minClicks && t.orders === 0;
    const highCpc = cpc !== null && averageCpc !== null && t.clicks >= rules.minClicks && cpc > averageCpc * 1.5;
    const signals = [strong ? "Strong" : "", opportunity ? "Opportunity" : "", acos !== null && acos > 20 ? "High ACOS" : "", noOrders ? "No Orders" : "", cvr !== null && cvr < 8 && t.clicks >= rules.minClicks ? "Low CVR" : "", highCpc ? "High CPC" : "", r.waste > 0 ? "High Wasted Spend" : ""].filter(Boolean);
    const status = !r.available ? "Performance Unavailable" : noOrders ? "No Orders" : signals.find(s => ["High ACOS", "High Wasted Spend", "Low CVR", "High CPC"].includes(s)) || (strong ? "Strong" : opportunity ? "Opportunity" : "Healthy");
    const review = noOrders ? "Review target relevance and exclusions" : r.waste > 0 || signals.includes("High ACOS") ? "Review bids, relevance, and conversion evidence" : strong || opportunity ? "Review efficiency, margins, inventory, and current coverage" : "Monitor reported product target performance";
    return { ...r, signals, status, review };
  });
  const rows = scope.status ? classified.filter(r => r.status === scope.status || r.signals.includes(scope.status!)) : classified;
  const summarize = (items: typeof rows) => ({ ...stats(items.flatMap(r => r.evidence)), count: items.length, waste: items.reduce((sum, r) => sum + r.waste, 0) });
  const portfolio = summarize(rows);
  const matches = [...new Set(["ASIN Target", "Category Target"])].map(name => ({ name, ...summarize(rows.filter(r => productTargetMatchName(r.row.match) === name)) }));
  return { rows, portfolio, matches, averageCpc, unlinkedQueries, aggregateCopies: aggregateCopies.size,
    signals: ["Strong", "Opportunity", "High ACOS", "No Orders", "Low CVR", "High CPC", "High Wasted Spend"].map(name => ({ name, count: rows.filter(r => r.signals.includes(name)).length })),
  };
}
export type ProductTargetAnalysis = ReturnType<typeof productTargetAnalysis>;
export type ProductTargetPerformance = ProductTargetAnalysis["rows"][number];
