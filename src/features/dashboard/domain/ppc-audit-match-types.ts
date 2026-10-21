import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { asinCampaignKey } from "./ppc-audit-asins";
import { placementName } from "./ppc-audit-placements";
import { searchTermAnalysis } from "./ppc-audit-search-terms";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";

export const MATCH_TYPES = ["Exact", "Phrase", "Broad", "Auto"] as const;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export function auditMatchType(r: AuditAd): string | null {
  if (/negative/i.test(r.entity)) return null;
  if (/^(close-match|loose-match|substitutes|complements)$/i.test(r.target.trim())) return "Auto";
  if (/^(asin|category|brand)(?:SameAs|-expanded)?\s*[=:]/i.test(r.target) || /producttarget/i.test(r.entity)) return null;
  if (norm(r.match) === "auto" && (r.query || r.target)) return "Auto";
  return MATCH_TYPES.find(m => norm(m) === norm(r.match) && m !== "Auto") || null;
}
const measured = (r: AuditAd) => (r.targetMetricsAvailable ?? [r.spend, r.sales, r.orders, r.clicks, r.impressions].some(n => n > 0)) && r.placementMetricsAvailable !== false;
function evidence(parents: AuditAd[], queries: AuditAd[]) {
  const rows = parents.filter(measured);
  if (rows.length) return rows.length === 1 ? rows : [];
  const grouped = new Map<string, AuditAd[]>();
  for (const q of queries.filter(measured)) { const key = norm(q.query); const bucket = grouped.get(key); if (bucket) bucket.push(q); else grouped.set(key, [q]); }
  return [...grouped.values()].flatMap(rows => rows.length === 1 ? rows : []);
}
function stats(rows: AuditAd[], waste = 0) {
  const totals = auditTotals(rows), available = rows.length > 0;
  const acos = available ? auditRate(totals.spend, totals.sales) : null;
  const cvr = available ? auditRate(totals.orders, totals.clicks) : null;
  return { totals, available, waste, acos, cvr, ctr: available ? auditRate(totals.clicks, totals.impressions) : null,
    cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null,
    status: !available ? "Performance Unavailable" : waste > 0 || acos !== null && acos > 20 ? "Needs Review" : totals.orders >= 5 && acos !== null && acos <= 20 && cvr !== null && cvr >= 12 ? "Strong" : "Healthy" };
}
type Source = { id: string; row: AuditAd; match: string; parents: AuditAd[]; queries: AuditAd[]; placements: AuditAd[] };
const sourceId = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, r.adGroupId || norm(r.adGroup), r.asin || r.sku || "Unmapped", auditMatchType(r), r.keywordId || r.targetId || norm(r.target) || `query:${norm(r.query)}`]);
const bucketId = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, auditMatchType(r), norm(r.target)]);
function agrees(a: AuditAd, b: AuditAd) {
  if (a.type !== b.type || a.campaignId !== b.campaignId || auditMatchType(a) !== auditMatchType(b)) return false;
  if (a.asin && b.asin && a.asin !== b.asin || a.sku && b.sku && a.sku !== b.sku) return false;
  if (a.adGroupId && b.adGroupId && a.adGroupId !== b.adGroupId || a.adGroup && b.adGroup && norm(a.adGroup) !== norm(b.adGroup)) return false;
  if (a.target && b.target && norm(a.target) !== norm(b.target)) return false;
  const aid = a.keywordId || a.targetId, bid = b.keywordId || b.targetId;
  return aid && bid ? aid === bid : !!a.target && !!b.target && !!(a.adGroupId && b.adGroupId || a.adGroup && b.adGroup);
}
export type MatchTypeScope = { asin?: string; campaign?: string; match?: string; placement?: string; status?: string; search?: string };
export function matchTypeAnalysis(ads: AuditAd[], scope: MatchTypeScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const sources = new Map<string, Source>(), byTarget = new Map<string, Source[]>(), byId = new Map<string, Source[]>();
  const idKey = (r: AuditAd) => JSON.stringify([r.type, r.campaignId, auditMatchType(r), r.keywordId || r.targetId]);
  function register(row: AuditAd) {
    const source: Source = { id: sourceId(row), row, match: auditMatchType(row)!, parents: [], queries: [], placements: [] }; sources.set(source.id, source);
    for (const [index, key] of [[byTarget, bucketId(row)], [byId, idKey(row)]] as const) { const bucket = index.get(key); if (bucket) bucket.push(source); else index.set(key, [source]); }
    return source;
  }
  const supported = ads.filter(r => auditMatchType(r) && (r.target || r.query || r.keywordId || r.targetId) && !/^(campaign|adgroup|productad)$/i.test(r.entity));
  for (const r of supported.filter(r => !r.query && !r.placement)) (sources.get(sourceId(r)) || register(r)).parents.push(r);
  let unlinked = 0;
  for (const r of supported.filter(r => r.query || r.placement)) {
    let source = sources.get(sourceId(r));
    if (source && !agrees(source.row, r)) { unlinked++; continue; }
    if (!source) {
      const candidates = ((r.keywordId || r.targetId) && byId.has(idKey(r)) ? byId.get(idKey(r))! : byTarget.get(bucketId(r)) || []).filter(g => agrees(g.row, r));
      if (candidates.length === 1) source = candidates[0];
      else if (candidates.length > 1) { unlinked++; continue; }
      else source = register(r);
    }
    (r.placement ? source.placements : source.queries).push(r);
  }
  const context = (r: AuditAd) => sourceId({ ...r, asin: "", sku: "" });
  const specific = new Set([...sources.values()].filter(g => g.row.asin && [...g.parents, ...g.queries].some(measured)).map(g => context(g.row)));
  const owner = new Map<AuditAd, string>();
  const targets = [...sources.values()].filter(g => g.row.asin || g.row.sku || !specific.has(context(g.row))).flatMap(g => {
    const r = g.row;
    if (scope.asin && (r.asin || "Unmapped") !== scope.asin || scope.campaign && asinCampaignKey(r) !== scope.campaign || scope.match && g.match !== scope.match) return [];
    if (scope.search && ![r.target, r.asin, r.sku, r.campaign, r.adGroup].some(s => norm(s).includes(norm(scope.search!)))) return [];
    const selected = scope.placement ? g.placements.filter(r => placementName(r.placement) === scope.placement) : [];
    if (scope.placement && !selected.length) return [];
    const parents = scope.placement ? selected.filter(r => !r.query) : g.parents;
    const queries = scope.placement ? selected.filter(r => r.query) : g.queries;
    const rows = evidence(parents, queries), t = stats(rows);
    const queryEvidence = evidence([], queries);
    const queryMismatch = parents.some(measured) && auditTotals(queryEvidence).spend > t.totals.spend + 0.01;
    const findings = wasteFindings(queryEvidence.length && !queryMismatch ? queryEvidence : rows, rules);
    const waste = findings.reduce((sum, f) => sum + f.row.spend, 0);
    for (const q of [...g.queries, ...g.placements]) owner.set(q, g.id);
    const placements = [...new Set(g.placements.map(r => placementName(r.placement)))].filter(name => !scope.placement || name === scope.placement).map(name => {
      const items = g.placements.filter(r => placementName(r.placement) === name);
      const rows = evidence(items.filter(r => !r.query), items.filter(r => r.query));
      return { name, evidence: rows, ...stats(rows, wasteFindings(rows, rules).reduce((sum, f) => sum + f.row.spend, 0)) };
    });
    return [{ ...g, ...stats(rows, waste), evidence: rows, placements, queryMismatch, source: parents.some(measured) ? "Target report" : "Search-term evidence" }];
  });
  const queryData = searchTermAnalysis(ads, { placement: scope.placement }, rules).rows.filter(q => auditMatchType(q.row));
  const queriesByOwner = new Map<string, typeof queryData>();
  for (const q of queryData) {
    const ids = new Set([...q.records, ...q.placementRows].map(r => owner.get(r)).filter((id): id is string => !!id));
    if (ids.size !== 1) continue;
    const id = [...ids][0], bucket = queriesByOwner.get(id);
    if (bucket) bucket.push(q); else queriesByOwner.set(id, [q]);
  }
  const summarize = (rows: typeof targets) => {
    const terms = rows.flatMap(r => queriesByOwner.get(r.id) || []);
    const signals = ["Strong", "Exact Harvest", "High ACOS", "Negative Candidate"].map(name => ({ name, count: terms.filter(q => q.signals.includes(name)).length }));
    return { ...stats(rows.flatMap(r => r.evidence), rows.reduce((sum, r) => sum + r.waste, 0)), targets: rows, queries: terms, signals,
      issues: terms.filter(q => q.signals.some(s => ["High ACOS", "Negative Candidate", "Low CVR", "High Wasted Spend"].includes(s))).length };
  };
  const initial = MATCH_TYPES.map(name => ({ name, ...summarize(targets.filter(r => r.match === name)) }));
  const groups = initial.filter(g => (!scope.match || g.name === scope.match) && (!scope.status || (scope.status === "Wasted Spend" ? g.waste > 0 : g.status === scope.status)));
  const included = groups.flatMap(g => g.targets), portfolio = summarize(included);
  const withShares = groups.map(g => { const spendShare = g.available ? auditRate(g.totals.spend, portfolio.totals.spend) : null, salesShare = g.available ? auditRate(g.totals.sales, portfolio.totals.sales) : null;
    return { ...g, spendShare, salesShare, delta: spendShare !== null && salesShare !== null ? salesShare - spendShare : null };
  });
  return { groups: withShares, portfolio, unlinked,
    asins: [...new Set(included.map(r => r.row.asin || "Unmapped"))].sort().map(asin => { const rows = included.filter(r => (r.row.asin || "Unmapped") === asin); return { asin, ...summarize(rows), matches: groups.map(g => ({ name: g.name, ...summarize(rows.filter(r => r.match === g.name)) })) }; }),
    placements: Array.from(included.flatMap(r => r.placements.map(p => ({ ...p, match: r.match }))).reduce((map, p) => { const key = JSON.stringify([p.match, p.name]); const list = map.get(key); if (list) list.push(p); else map.set(key, [p]); return map; }, new Map<string, (typeof included[number]["placements"][number] & { match: string })[]>()).values()).map(items => ({ match: items[0].match, name: items[0].name, ...stats(items.flatMap(p => p.evidence), items.reduce((sum, p) => sum + p.waste, 0)) })),
    campaigns: [...new Set(included.map(r => asinCampaignKey(r.row)))].flatMap(id => groups.flatMap(g => { const rows = included.filter(r => asinCampaignKey(r.row) === id && r.match === g.name); return rows.length ? [{ id, name: rows[0].row.campaign, match: g.name, ...summarize(rows) }] : []; })),
  };
}
export type MatchTypeAnalysis = ReturnType<typeof matchTypeAnalysis>;
