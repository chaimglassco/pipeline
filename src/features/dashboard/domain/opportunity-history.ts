import { addDaysIso } from "./ppc-dashboard-state";
import { parseUntargetedSalesOpportunities, untargetedOpportunityCacheKey, type TargetingState, type UntargetedSalesOpportunities, type UntargetedSalesOpportunity } from "./untargeted-sales-opportunities";

export const opportunityTermKey = (type: string, term: string) => `${type}:${term.trim().replace(/\s+/g, " ").toLowerCase()}`;
export const opportunityWeekStarts = (anchor: string) => Array.from({ length: 12 }, (_, index) => addDaysIso(anchor, -7 * index));

export function combineOpportunityWeeks(asin: string, country: string, anchor: string, reports: UntargetedSalesOpportunities[], coverage?: UntargetedSalesOpportunities): UntargetedSalesOpportunities {
  const weekStarts = opportunityWeekStarts(anchor);
  if (coverage && (coverage.asin !== asin.toUpperCase() || coverage.country !== country.toUpperCase() || coverage.period.startDate !== weekStarts[11] || coverage.period.endDate > addDaysIso(anchor, 6))) coverage = undefined;
  const scoped = reports.filter(report => report.asin === asin.toUpperCase() && report.country === country.toUpperCase() && weekStarts.includes(report.period.startDate));
  const uniqueWeeks = new Map(scoped.map(report => [report.period.startDate, report]));
  const states = new Map((coverage?.targetingCoverage ?? []).map(row => [opportunityTermKey(row.type, row.term), row.state]));
  const candidates = new Set([...scoped.flatMap(report => report.opportunities), ...(coverage?.performanceRows ?? []).filter(row => row.orders >= 1), ...(coverage?.targetingCoverage ?? [])].map(row => opportunityTermKey(row.type, row.term)));
  const rows = new Map<string, UntargetedSalesOpportunity>();
  for (const report of [...uniqueWeeks.values()].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate))) {
    const seen = new Set<string>();
    for (const row of report.performanceRows ?? report.opportunities) {
      const key = opportunityTermKey(row.type, row.term);
      if (!candidates.has(key) || states.get(key) === "targeted" || seen.has(key)) continue;
      seen.add(key);
      const previous = rows.get(key);
      const appeared = row.impressions > 0 || row.clicks > 0 || row.orders > 0 || row.spend > 0 || row.sales > 0;
      const merged = {
        ...row, term: row.type === "Product ASIN" ? row.term.trim().toUpperCase() : row.term.trim().replace(/\s+/g, " "),
        impressions: (previous?.impressions ?? 0) + row.impressions, clicks: (previous?.clicks ?? 0) + row.clicks,
        sales: (previous?.sales ?? 0) + row.sales, orders: (previous?.orders ?? 0) + row.orders, spend: (previous?.spend ?? 0) + row.spend,
        lastSeen: appeared ? report.period.startDate : previous?.lastSeen,
        weeksAppeared: (previous?.weeksAppeared ?? 0) + (appeared ? 1 : 0),
        targetingState: (states.get(key) ?? "unverified") as TargetingState,
      };
      merged.acos = merged.sales > 0 ? merged.spend / merged.sales * 100 : null;
      rows.set(key, merged);
    }
  }
  const loadedWeeks = weekStarts.filter(date => uniqueWeeks.has(date));
  const failedWeeks = weekStarts.filter(date => !uniqueWeeks.has(date));
  const warnings = [...new Set(scoped.flatMap(report => report.warnings).concat(coverage?.warnings ?? []))];
  if (!coverage?.targetingCoverage) warnings.push("Current targeting could not be verified. Historical candidates are excluded from bulk campaign selection.");
  if (failedWeeks.length) warnings.push(`Incomplete history: ${loadedWeeks.length} of 12 weeks loaded. Totals include loaded weeks only.`);
  const opportunities = [...rows.values()].filter(row => row.orders >= 1).sort((a, b) => b.sales - a.sales || a.term.localeCompare(b.term));
  return {
    asin: asin.toUpperCase(), country: country.toUpperCase(), currency: scoped[0]?.currency ?? coverage?.currency ?? "USD",
    period: { startDate: weekStarts[11], endDate: uniqueWeeks.get(anchor)?.period.endDate ?? addDaysIso(anchor, 6) },
    dataState: uniqueWeeks.get(anchor)?.dataState ?? "Partial", opportunities, warnings,
    freshness: { searchDataAsOf: scoped.map(report => report.freshness.searchDataAsOf).sort()[0] ?? "", coverageDataAsOf: coverage?.freshness.coverageDataAsOf ?? "" },
    complete: loadedWeeks.length === 12 && scoped.every(report => report.complete === true) && coverage?.complete === true,
    history: { weekStarts, loadedWeeks, failedWeeks, checkedAt: coverage?.freshness.coverageDataAsOf ?? "" },
    ...(coverage?.targetingCoverage ? { targetingCoverage: coverage.targetingCoverage } : {}),
  };
}

export function parseOpportunityHistoryCache(raw: string | null): Record<string, UntargetedSalesOpportunities> {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.version !== 1 || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) return {};
    return Object.fromEntries(Object.entries(value.entries).flatMap(([key, candidate]) => {
      const report = parseUntargetedSalesOpportunities(candidate);
      const anchor = report?.history?.weekStarts[0];
      return report && anchor && key === untargetedOpportunityCacheKey(report.country, report.asin, anchor) && report.history?.weekStarts.join() === opportunityWeekStarts(anchor).join() ? [[key, report]] : [];
    }));
  } catch { return {}; }
}
