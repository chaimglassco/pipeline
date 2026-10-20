import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { asinCampaignKey } from "./ppc-audit-asins";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
import { placementName } from "./ppc-audit-placements";

const norm = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const MATCH_NAMES: Record<string, string> = { exact: "Exact", phrase: "Phrase", broad: "Broad" };
export const keywordMatchName = (text: string) => MATCH_NAMES[norm(text)] || text || "Not supplied";
const measured = (r: AuditAd) => (r.targetMetricsAvailable ?? [r.spend, r.sales, r.orders, r.clicks, r.impressions].some(n => n > 0)) && r.placementMetricsAvailable !== false;
export function isKeywordTarget(r: AuditAd) {
  return !!r.target && !r.entity.includes("negative") && !r.entity.includes("producttarget") &&
    (r.entity === "keyword" || /^(exact|phrase|broad)$/i.test(r.match) && !/^(asin|category|brand)\s*[=:]/i.test(r.target));
}
const identity = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.keywordId || norm(r.target), norm(r.match), r.asin || r.sku || "Unmapped"]);
type KeywordGroup = { id: string; row: AuditAd; records: AuditAd[]; queries: AuditAd[]; placements: AuditAd[] };
function matchesKeyword(group: KeywordGroup, row: AuditAd) {
  const target = group.row;
  if (row.type !== target.type || row.campaignId !== target.campaignId || row.entity.includes("negative")) return false;
  if (row.asin && target.asin && row.asin !== target.asin) return false;
  if (row.match && target.match && norm(row.match) !== norm(target.match)) return false;
  if (row.adGroupId && target.adGroupId && row.adGroupId !== target.adGroupId) return false;
  if (row.adGroup && target.adGroup && norm(row.adGroup) !== norm(target.adGroup)) return false;
  if (row.keywordId || target.keywordId) return !!row.keywordId && !!target.keywordId && row.keywordId === target.keywordId;
  return !!row.target && norm(row.target) === norm(target.target) &&
    !!(row.adGroupId && target.adGroupId || row.adGroup && target.adGroup) && !!row.match && !!target.match;
}
function evidence(records: AuditAd[], queries: AuditAd[]) {
  const parents = records.filter(measured);
  const preferred = parents.filter(r => r.entity === "keyword");
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
export type KeywordScope = { asin?: string; campaign?: string; match?: string; placement?: string; search?: string; minSpend?: number; status?: string };
export function keywordAnalysis(ads: AuditAd[], scope: KeywordScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const groups = new Map<string, KeywordGroup>();
  const byKeywordId = new Map<string, KeywordGroup[]>(), byTarget = new Map<string, KeywordGroup[]>();
  const idKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId, row.keywordId]);
  const targetKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId, norm(row.target)]);
  function register(group: KeywordGroup) {
    groups.set(group.id, group);
    if (group.row.keywordId) { const key = idKey(group.row); const bucket = byKeywordId.get(key); if (bucket) bucket.push(group); else byKeywordId.set(key, [group]); }
    const key = targetKey(group.row); const bucket = byTarget.get(key); if (bucket) bucket.push(group); else byTarget.set(key, [group]);
  }
  const candidatesFor = (row: AuditAd) => (row.keywordId && byKeywordId.has(idKey(row)) ? byKeywordId.get(idKey(row))! : byTarget.get(targetKey(row)) || []).filter(g => matchesKeyword(g, row));
  for (const row of ads.filter(r => !r.query && isKeywordTarget(r))) {
    const id = identity(row), existing = groups.get(id);
    if (existing) existing.records.push(row); else register({ id, row, records: [row], queries: [], placements: [] });
  }
  let unlinkedQueries = 0;
  for (const row of ads.filter(r => r.query && !r.placement && !r.entity.includes("negative") && (!r.target || isKeywordTarget(r) || r.keywordId))) {
    const candidates = candidatesFor(row);
    if (candidates.length === 1) candidates[0].queries.push(row);
    else if (candidates.length > 1) unlinkedQueries++;
    else if ((byTarget.get(targetKey(row)) || []).some(g => norm(g.row.match) === norm(row.match) && (g.row.adGroupId && row.adGroupId ? g.row.adGroupId === row.adGroupId : norm(g.row.adGroup) === norm(row.adGroup)))) unlinkedQueries++;
    else if (isKeywordTarget(row) && (row.keywordId || row.adGroupId || row.adGroup) && row.match) {
      const id = identity(row); const existing = groups.get(id);
      if (existing) existing.queries.push(row); else register({ id, row, records: [], queries: [row], placements: [] });
    } else unlinkedQueries++;
  }
  // A placement needs an explicit target or keyword ID and a unique contextual match.
  for (const row of ads.filter(r => r.placement && !r.entity.includes("negative") && (r.keywordId || r.target))) {
    const candidates = candidatesFor(row);
    if (candidates.length === 1) candidates[0].placements.push(row);
  }
  const exact = new Set(ads.filter(r => !r.query && isKeywordTarget(r) && r.asin && norm(r.match) === "exact").map(r => JSON.stringify([r.asin, norm(r.target)])));
  const candidates = [...groups.values()].flatMap(group => {
    const row = group.row;
    if (scope.asin && (row.asin || "Unmapped") !== scope.asin || scope.campaign && asinCampaignKey(row) !== scope.campaign || scope.match && norm(keywordMatchName(row.match)) !== norm(scope.match)) return [];
    if (scope.search && ![row.target, row.campaign, row.adGroup, row.asin, row.sku].some(v => norm(v).includes(norm(scope.search!)))) return [];
    const placementRows = scope.placement ? group.placements.filter(r => placementName(r.placement) === scope.placement) : [];
    if (scope.placement && !placementRows.length) return [];
    const queryRows = scope.placement ? placementRows.filter(r => r.query) : group.queries;
    const parentRows = scope.placement ? placementRows.filter(r => !r.query) : group.records.filter(r => !r.placement);
    const selected = evidence(parentRows, queryRows), summary = stats(selected);
    if (scope.minSpend && (!summary.available || summary.totals.spend < scope.minSpend)) return [];
    const queryEvidence = queryRows.filter(measured);
    const findings = wasteFindings(queryEvidence.length ? queryEvidence : selected, rules);
    const flaggedQueries = new Set(findings.map(finding => finding.row));
    const waste = findings.reduce((sum, finding) => sum + finding.row.spend, 0);
    const bidRows = group.records.filter(r => !r.query && (r.bidAvailable ?? r.bid > 0));
    const bids = [...new Set(bidRows.map(r => r.bid))];
    const placementNames = [...new Set(group.placements.map(r => placementName(r.placement)))];
    const placements = placementNames.map(name => {
      const rows = group.placements.filter(r => placementName(r.placement) === name);
      return { name, ...stats(evidence(rows.filter(r => !r.query), rows.filter(r => r.query))) };
    });
    const searchTerms = queryEvidence.map(q => {
      const summary = stats([q]);
      return { row: q, ...summary, harvest: q.orders >= 2 && summary.acos !== null && summary.acos <= 20 && !(row.asin && exact.has(JSON.stringify([row.asin, norm(q.query)]))), waste: flaggedQueries.has(q) ? q.spend : 0 };
    }).sort((a, b) => b.row.sales - a.row.sales);
    return [{ ...group, ...summary, evidence: selected, queryEvidence, findings, waste, bid: bids.length === 1 ? bids[0] : null, placements, searchTerms, source: parentRows.filter(measured).length ? "Keyword report" : "Search-term evidence" }];
  });
  const scopedTotals = auditTotals(candidates.flatMap(r => r.evidence));
  const averageCpc = scopedTotals.clicks > 0 ? scopedTotals.spend / scopedTotals.clicks : null;
  const classified = candidates.map(r => {
    const { totals: t, acos, cvr, cpc } = r;
    const strong = r.available && t.orders >= 5 && acos !== null && acos <= 20 && cvr !== null && cvr >= 12;
    const opportunity = r.available && !strong && t.orders >= 2 && acos !== null && acos <= 20 && cvr !== null && cvr >= 12;
    const noOrders = r.available && t.spend > 0 && t.spend >= rules.minSpend && t.clicks >= rules.minClicks && t.orders === 0;
    const highCpc = cpc !== null && averageCpc !== null && t.clicks >= rules.minClicks && cpc > averageCpc * 1.5;
    const signals = [strong ? "Strong" : "", opportunity ? "Opportunity" : "", acos !== null && acos > 20 ? "High ACOS" : "", noOrders ? "No Orders" : "", cvr !== null && cvr < rules.cvr && t.clicks >= rules.minClicks ? "Low CVR" : "", highCpc ? "High CPC" : "", r.waste > 0 ? "High Wasted Spend" : ""].filter(Boolean);
    const status = !r.available ? "Performance Unavailable" : noOrders ? "No Orders" : signals.find(s => ["High ACOS", "High Wasted Spend", "Low CVR", "High CPC"].includes(s)) || (strong ? "Strong" : opportunity ? "Opportunity" : "Healthy");
    const review = noOrders ? "Review search-term relevance and exact exclusions" : r.waste > 0 || signals.includes("High ACOS") ? "Review bids, relevance, and conversion evidence" : strong || opportunity ? "Review efficiency, margins, inventory, and current coverage" : "Monitor reported keyword performance";
    return { ...r, signals, status, review };
  });
  const rows = scope.status ? classified.filter(r => r.status === scope.status || r.signals.includes(scope.status!)) : classified;
  const summarize = (items: typeof rows) => ({ ...stats(items.flatMap(r => r.evidence)), count: items.length, waste: items.reduce((sum, r) => sum + r.waste, 0) });
  const portfolio = summarize(rows);
  const matches = [...new Set(["Exact", "Phrase", "Broad", ...rows.map(r => keywordMatchName(r.row.match))])].map(name => ({ name, ...summarize(rows.filter(r => keywordMatchName(r.row.match) === name)) }));
  return { rows, portfolio, matches, averageCpc, unlinkedQueries,
    signals: ["Strong", "Opportunity", "High ACOS", "No Orders", "Low CVR", "High CPC", "High Wasted Spend"].map(name => ({ name, count: rows.filter(r => r.signals.includes(name)).length })),
  };
}
export type KeywordAnalysis = ReturnType<typeof keywordAnalysis>;
export type KeywordPerformance = KeywordAnalysis["rows"][number];
