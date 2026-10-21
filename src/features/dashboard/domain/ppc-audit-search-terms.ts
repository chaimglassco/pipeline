import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { asinCampaignKey } from "./ppc-audit-asins";
import { keywordAnalysis, isKeywordTarget } from "./ppc-audit-keywords";
import { productTargetAnalysis, productTargetType } from "./ppc-audit-product-targets";
import { placementName } from "./ppc-audit-placements";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export const searchTermMatchName = (s: string) => ({ exact: "Exact", phrase: "Phrase", broad: "Broad", auto: "Auto" })[norm(s)] || s || "Not supplied";
export function searchTermSource(r: AuditAd) {
  return /^(close-match|loose-match|substitutes|complements)$/i.test(r.target.trim()) ? "Auto" : productTargetType(r) ? "Product Target" : isKeywordTarget(r) ? "Keyword" : "Not supplied";
}
const measured = (r: AuditAd) => (r.targetMetricsAvailable ?? [r.spend, r.sales, r.orders, r.clicks, r.impressions].some(n => n > 0)) && r.placementMetricsAvailable !== false;
function stats(rows: AuditAd[]) {
  const totals = auditTotals(rows), available = rows.length > 0;
  return { totals, available, acos: available ? auditRate(totals.spend, totals.sales) : null, cvr: available ? auditRate(totals.orders, totals.clicks) : null, cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null };
}
const identity = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.asin || r.sku || "Unmapped", r.keywordId || "", r.targetId || "", norm(r.target), norm(r.match), norm(r.query)]);
export type SearchTermScope = { asin?: string; campaign?: string; adGroup?: string; sourceType?: string; match?: string; placement?: string; status?: string; search?: string; minSpend?: number };
export function searchTermAnalysis(ads: AuditAd[], scope: SearchTermScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const groups = new Map<string, { id: string; row: AuditAd; records: AuditAd[]; placementRows: AuditAd[] }>();
  for (const row of ads.filter(r => r.query.trim() && !/negative/i.test(r.entity))) {
    const id = identity(row); let g = groups.get(id);
    if (!g) { g = { id, row, records: [], placementRows: [] }; groups.set(id, g); }
    (row.placement ? g.placementRows : g.records).push(row);
  }
  // Parent evidence is used only for contribution context, never added to query totals.
  const parents = [...keywordAnalysis(ads, {}, rules).rows, ...productTargetAnalysis(ads, {}, rules).rows];
  const parentIndex = new Map<string, typeof parents>();
  const parentKey = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.asin || r.sku || "Unmapped", r.keywordId || r.targetId || norm(r.target)]);
  for (const p of parents) { const key = parentKey(p.row), bucket = parentIndex.get(key); if (bucket) bucket.push(p); else parentIndex.set(key, [p]); }
  const exact = new Set(ads.filter(r => !r.query && !r.placement && isKeywordTarget(r) && r.asin && norm(r.match) === "exact" && !/paused|archived|disabled/i.test(r.state)).map(r => JSON.stringify([r.asin, norm(r.target)])));
  const context = (r: AuditAd) => identity({ ...r, asin: "", sku: "" });
  const specific = new Set([...groups.values()].filter(g => g.row.asin && g.records.some(measured)).map(g => context(g.row)));
  const summarized = [...groups.values()].filter(g => g.row.asin || g.row.sku || !specific.has(context(g.row))).flatMap(g => {
    const r = g.row, sourceType = searchTermSource(r), match = sourceType === "Auto" ? "Auto" : searchTermMatchName(r.match);
    if (scope.asin && (r.asin || "Unmapped") !== scope.asin || scope.campaign && asinCampaignKey(r) !== scope.campaign || scope.adGroup && (r.adGroupId || r.adGroup || "Not supplied") !== scope.adGroup || scope.sourceType && sourceType !== scope.sourceType || scope.match && match !== scope.match) return [];
    if (scope.search && ![r.query, r.target, r.campaign, r.adGroup, r.asin, r.sku].some(v => norm(v).includes(norm(scope.search!)))) return [];
    const placements = [...new Set(g.placementRows.map(r => placementName(r.placement)))].map(name => {
      const rows = g.placementRows.filter(r => placementName(r.placement) === name);
      return { name, ...stats(rows.length === 1 && measured(rows[0]) ? rows : []) };
    });
    const selected = scope.placement ? g.placementRows.filter(r => placementName(r.placement) === scope.placement) : g.records;
    if (scope.placement && !selected.length) return [];
    const evidence = selected.length === 1 && measured(selected[0]) ? selected : [];
    const summary = stats(evidence);
    if (scope.minSpend && (!summary.available || summary.totals.spend < scope.minSpend)) return [];
    const candidates = (parentIndex.get(parentKey(r)) || []).filter(p => (!r.target || norm(p.row.target) === norm(r.target)) && (!r.match || !p.row.match || productTargetType(r) || norm(p.row.match) === norm(r.match)));
    const parent = candidates.length === 1 && candidates[0].source !== "Search-term evidence" ? candidates[0] : null;
    const findings = evidence.length ? wasteFindings(evidence, rules) : [];
    const waste = findings.length ? summary.totals.spend : 0;
    return [{ ...g, ...summary, evidence, placements, parent, sourceType, match, waste, findings, bid: parent?.bid ?? null, source: "Search-term report" }];
  });
  const beforeStatus = stats(summarized.flatMap(r => r.evidence));
  const classified = summarized.map(r => {
    const t = r.totals, noOrders = r.available && t.orders === 0 && t.spend > 0 && t.spend >= rules.minSpend && t.clicks >= rules.minClicks;
    const harvest = r.available && r.row.asin && !/^[a-z0-9]{10}$/i.test(r.row.query.trim()) && r.sourceType !== "Not supplied" && r.match !== "Exact" && t.orders >= 2 && r.acos !== null && r.acos <= 20 && !exact.has(JSON.stringify([r.row.asin, norm(r.row.query)]));
    const strong = r.available && t.orders >= 5 && r.acos !== null && r.acos <= 20 && r.cvr !== null && r.cvr >= 12;
    const signals = [strong ? "Strong" : "", harvest ? "Exact Harvest" : "", noOrders ? "Negative Candidate" : "", r.acos !== null && r.acos > 35 ? "High ACOS" : "", noOrders ? "No Orders" : "", r.cvr !== null && r.cvr < 8 && t.clicks >= rules.minClicks ? "Low CVR" : "", r.waste > 0 ? "High Wasted Spend" : ""].filter(Boolean);
    const status = !r.available ? "Performance Unavailable" : noOrders ? "Negative Candidate" : harvest ? "Exact Harvest" : signals.find(s => ["High ACOS", "High Wasted Spend", "Low CVR"].includes(s)) || (strong ? "Strong" : "Healthy");
    return { ...r, signals, status, review: noOrders ? "Review relevance and negative exact coverage" : harvest ? "Review current exact coverage, margins and inventory before harvesting" : "Review reported efficiency and conversion evidence" };
  });
  const rows = scope.status ? classified.filter(r => r.status === scope.status || r.signals.includes(scope.status!)) : classified;
  const summarize = (items: typeof rows) => ({ ...stats(items.flatMap(r => r.evidence)), count: items.length, waste: items.reduce((sum, r) => sum + r.waste, 0) });
  return { rows, portfolio: summarize(rows), averageCpc: beforeStatus.cpc,
    matches: [...new Set(["Exact", "Phrase", "Broad", "Auto", ...rows.map(r => r.match)])].map(name => ({ name, ...summarize(rows.filter(r => r.match === name)) })),
    signals: ["Strong", "Exact Harvest", "Negative Candidate", "High ACOS", "No Orders", "Low CVR", "High Wasted Spend"].map(name => ({ name, count: rows.filter(r => r.signals.includes(name)).length })),
  };
}
export type SearchTermPerformance = ReturnType<typeof searchTermAnalysis>["rows"][number];
