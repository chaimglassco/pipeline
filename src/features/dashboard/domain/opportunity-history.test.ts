import { describe, expect, it } from "vitest";
import { combineOpportunityWeeks, opportunityWeekStarts, parseOpportunityHistoryCache } from "./opportunity-history";
import { parseUntargetedOpportunityCache, untargetedOpportunityCacheKey, type TargetingState, type UntargetedSalesOpportunities, type UntargetedSalesOpportunity } from "./untargeted-sales-opportunities";
import liveCohort from "./fixtures/opportunity-history-live-cohort.json";

const anchor = "2026-09-23";
const row = (term: string, patch: Partial<UntargetedSalesOpportunity> = {}): UntargetedSalesOpportunity => ({ term, type: "Search term", impressions: 10, clicks: 2, spend: 5, sales: 20, orders: 1, acos: 25, ...patch });
const week = (startDate: string, rows: UntargetedSalesOpportunity[]): UntargetedSalesOpportunities => ({ asin: "B0DCTX18KK", country: "US", currency: "USD", dataState: "Final", period: { startDate, endDate: startDate }, freshness: { searchDataAsOf: startDate, coverageDataAsOf: startDate }, complete: true, opportunities: rows.filter(row => row.orders > 0), performanceRows: rows, warnings: [] });
const coverage = (rows: UntargetedSalesOpportunity[]) => ({ ...week(opportunityWeekStarts(anchor)[11], rows), period: { startDate: opportunityWeekStarts(anchor)[11], endDate: "2026-09-29" }, freshness: { searchDataAsOf: "2026-09-29", coverageDataAsOf: "2026-10-01T00:00:00Z" }, targetingCoverage: rows.map(row => ({ term: row.term, type: row.type, state: "untargeted" as TargetingState })) });

describe("twelve-week opportunities", () => {
  it("reconciles the twelve-week live cohort, including an older-only converting term", () => {
    const result = combineOpportunityWeeks("B0DCTX18KK", "US", anchor, liveCohort.reports as UntargetedSalesOpportunities[], liveCohort.coverage as UntargetedSalesOpportunities);
    expect(result.complete).toBe(true);
    expect(result.opportunities.find(row => row.term === "c came for stained glass")).toMatchObject({ sales: 21.99, spend: .66, orders: 1, weeksAppeared: 1, targetingState: "untargeted" });
    expect(result.opportunities.find(row => row.term === "c came for stained glass")?.lastSeen).not.toBe(anchor);
    const repeated = result.opportunities.find(row => row.term === "5/64 round u lead came")!;
    expect(repeated.sales).toBeCloseTo(52.97, 2);
    expect(repeated.spend).toBeCloseTo(4.37, 2);
    expect(repeated.weeksAppeared).toBe(4);
    expect(repeated.acos).toBeCloseTo(4.37 / 52.97 * 100, 6);
  });
  it("retains historical-only terms and combines case/whitespace variants, including a zero-order week", () => {
    const reports = [week(anchor, [row(" Lead  Came ", { orders: 0, sales: 0, spend: 2 })]), week("2026-09-16", [row("lead came"), row("older only")])];
    const result = combineOpportunityWeeks("B0DCTX18KK", "US", anchor, reports, coverage([row("lead came"), row("older only")]));
    expect(result.opportunities.find(row => row.term === "Lead Came")).toMatchObject({ orders: 1, sales: 20, spend: 7, acos: 35, weeksAppeared: 2, lastSeen: anchor, targetingState: "untargeted" });
    expect(result.opportunities.find(row => row.term === "older only")).toMatchObject({ lastSeen: "2026-09-16", weeksAppeared: 1 });
    expect(result.history?.loadedWeeks).toHaveLength(2);
    expect(result.history?.failedWeeks).toHaveLength(10);
    expect(result.complete).toBe(false);
    expect(result.ppcClicks).toBeUndefined();
  });
  it("excludes newly exact-targeted terms and keeps unknown coverage unverified", () => {
    const checked = coverage([row("targeted"), row("broad only")]);
    checked.targetingCoverage[0].state = "targeted";
    const result = combineOpportunityWeeks("B0DCTX18KK", "US", anchor, [week(anchor, [row("targeted"), row("broad only"), row("unknown")])], checked);
    expect(result.opportunities.map(row => row.term)).toEqual(["broad only", "unknown"]);
    expect(result.opportunities[0].targetingState).toBe("untargeted");
    expect(result.opportunities[1].targetingState).toBe("unverified");
  });
  it("isolates ASINs, marketplaces, and dates, and validates the separate persisted history", () => {
    const result = combineOpportunityWeeks("B0DCTX18KK", "US", anchor, [week(anchor, [row("correct")]), { ...week(anchor, [row("wrong")]), country: "CA" }, week("2025-01-01", [row("too old")])], { ...coverage([row("correct")]), asin: "B012345678" });
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].targetingState).toBe("unverified");
    const key = untargetedOpportunityCacheKey("US", "B0DCTX18KK", anchor);
    const raw = JSON.stringify({ version: 1, entries: { [key]: result } });
    expect(parseOpportunityHistoryCache(raw)[key]).toEqual(result);
    expect(parseUntargetedOpportunityCache(raw)).toEqual({});
    expect(parseOpportunityHistoryCache(JSON.stringify({ version: 1, entries: { wrong: result } }))).toEqual({});
  });
  it("does not double-count a cached week and marks all twelve complete only with full coverage", () => {
    const reports = opportunityWeekStarts(anchor).map(date => week(date, [row("lead came", { spend: 0 })]));
    const result = combineOpportunityWeeks("B0DCTX18KK", "US", anchor, [...reports, reports[0]], coverage([row("lead came")]));
    expect(result.opportunities[0]).toMatchObject({ orders: 12, spend: 0, acos: 0, weeksAppeared: 12 });
    expect(result.complete).toBe(true);
  });
});
