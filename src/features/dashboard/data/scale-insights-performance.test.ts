import { describe, expect, it, vi } from "vitest";
import { loadScaleInsightsWeeklyPerformance, unwrapScaleInsightsPayload } from "./scale-insights-performance";

const params = { asin: "B0FG4H5C6W", country: "US", startDate: "2026-08-26", endDate: "2026-09-01" };

function adsPayload(overrides: Record<string, unknown> = {}) {
  return {
    agg: { Country: "US", StartDate: "2026-08-26", EndDate: "2026-09-01", Currency: "USD" },
    oppMeta: {
      total_count: 1,
      data_as_of: "synced 2026-09-03 21:34 UTC",
      totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23, total_clicks: 48, total_impressions: 1200, total_units: 31 },
      ...overrides,
    },
  };
}

function salesPayload(overrides: Record<string, unknown> = {}) {
  return {
    Country: "US",
    StartDate: "2026-08-26",
    EndDate: "2026-09-01",
    Meta: { total_count: 1, data_as_of: "synced 2026-09-04 00:26 UTC", data_through: "2026-09-01" },
    Summary: { TotalSales: 1317.35, TotalOrders: 59, TotalSessions: 122, TotalUnits: 59, TotalPPCCost: 81.75, TotalPPCSales: 481.75 },
    ...overrides,
  };
}

function searchPayload(overrides: Record<string, unknown> = {}) {
  return {
    agg: { Country: "US", StartDate: "2026-08-26", EndDate: "2026-09-01" },
    oppMeta: { total_count: 1, returned_count: 1, has_next_page: false, totals: { total_clicks: 48, total_units: 31 }, data_as_of: "search" },
    opps: [{ entityType: "SearchTerm", metrics: { Impressions: "1,200", Clicks: "48", Units: "31" } }],
    ...overrides,
  };
}

function providerPayload(name: string, ads: unknown = adsPayload(), sales: unknown = salesPayload(), search: unknown = searchPayload()): unknown {
  return name === "get_ads_performance" ? ads : name === "get_search_term_performance" ? search : sales;
}

describe("Scale Insights weekly performance", () => {
  it("preserves live-provider total units while explaining an omitted attribution split", async () => {
    // Field structure and totals observed in the live MCP response on 2026-09-30.
    const liveSales = salesPayload({ Summary: { TotalASINs: 1, TotalSales: 1317.35, TotalUnits: 65, TotalOrders: 59, TotalPPCCost: 81.75, TotalPPCSales: 481.75, TotalSessions: 285 },
      ASINs: [{ ASIN: params.asin, TotalUnits: 65 }], Daily: null });
    const liveAds = adsPayload({ totals: { row_count: 1, total_spend: 81.75, total_sales: 481.75, total_orders: 23 } });
    const liveSearch = searchPayload({ oppMeta: { total_count: 1, returned_count: 1, has_next_page: false, totals: { total_clicks: 48 } },
      opps: [{ entityType: "SearchTerm", entity: "private-query", metrics: { ASIN: params.asin, Orders: "9", Clicks: "48", Impressions: "1200" } }] });
    const diagnostic = vi.fn();
    const result = await loadScaleInsightsWeeklyPerformance(params, vi.fn(async name => providerPayload(name, liveAds, liveSales, liveSearch)), diagnostic);
    expect(result.metrics.totalUnits).toBe(65);
    expect(result.metrics.ppcUnits).toBeUndefined();
    expect(result.metrics.organicUnits).toBeUndefined();
    expect(result.warnings).toContainEqual(expect.stringContaining("API did not supply"));
    expect(diagnostic).toHaveBeenCalledWith("weekly_unit_contract", expect.objectContaining({ hasPpcUnits: false, hasTotalUnits: true }));
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private-query");
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(params.asin);
  });

  it("accepts explicit zero paid units from the scoped Sales summary", async () => {
    const result = await loadScaleInsightsWeeklyPerformance(params, vi.fn(async name => providerPayload(name,
      adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }),
      salesPayload({ Summary: { ...salesPayload().Summary, TotalPPCUnits: 0 } }),
      searchPayload({ oppMeta: { total_count: 0, has_next_page: false, totals: {} }, opps: [] }))));
    expect(result.metrics).toMatchObject({ ppcUnits: 0, organicUnits: 59, totalUnits: 59 });
  });

  it("ignores unit values in other ASIN rows and daily series", async () => {
    const sales = salesPayload({ ASINs: [{ ASIN: "B012345678", TotalPPCUnits: 99 }], Daily: [{ Units: 3, PPCUnits: 2 }] });
    const result = await loadScaleInsightsWeeklyPerformance(params, vi.fn(async name => providerPayload(name,
      adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }), sales,
      searchPayload({ oppMeta: { total_count: 0, has_next_page: false, totals: {} }, opps: [] }))));
    expect(result.metrics.ppcUnits).toBeUndefined();
    expect(result.metrics.totalUnits).toBe(59);
  });
  it("unwraps JSON text from an MCP tool response", () => {
    expect(unwrapScaleInsightsPayload({ content: [{ type: "text", text: JSON.stringify({ ok: true }) }] })).toEqual({ ok: true });
  });

  it("loads exact paid and total metrics concurrently and calculates the derived values", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name));

    await expect(loadScaleInsightsWeeklyPerformance(params, callTool)).resolves.toEqual({
      ...params,
      metricsRevision: 4,
      currency: "USD",
      metrics: {
        spend: 81.75,
        ppcSales: 481.75,
        ppcOrders: 23,
        ppcClicks: 48,
        ppcImpressions: 1200,
        ppcUnits: 31,
        totalUnits: 59,
        totalSales: 1317.35,
        totalOrders: 59,
        totalSessions: 122,
        organicSales: 835.6,
        organicOrders: 36,
        organicUnits: 28,
        cpc: 1.7,
        acos: 16.97,
        tacos: 6.21,
        conversionRate: 47.92,
      },
      freshness: {
        adsDataAsOf: "synced 2026-09-03 21:34 UTC",
        salesDataAsOf: "synced 2026-09-04 00:26 UTC",
        salesDataThrough: "2026-09-01",
        searchDataAsOf: "search",
      },
      warnings: [],
    });
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool).toHaveBeenCalledWith("get_ads_performance", expect.objectContaining({
      asin_list: [params.asin], country: "US", start_date: params.startDate, end_date: params.endDate, summary_only: false, count: 1, page: 1,
    }));
    expect(callTool).toHaveBeenCalledWith("get_sales_data", expect.objectContaining({ group_by: "total", include_growth: false, summary_only: false }));
    expect(callTool).toHaveBeenCalledWith("get_search_term_performance", expect.objectContaining({ count: 500, mode: "raw", waste_only: false }));
  });

  it("reads exact PPC Clicks automatically from the single-ASIN advertising row", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name,
      {
        ...adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }),
        rows: [{ ASIN: params.asin, Clicks: "48" }],
      }));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics.ppcClicks).toBe(48);
    expect(result.metrics.conversionRate).toBe(47.92);
    expect(result.warnings).not.toContain(expect.stringContaining("PPC Clicks"));
  });

  it("reads the exact single-ASIN click value from the provider text table", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name,
      {
        structuredContent: adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }),
        content: [{ type: "text", text: `| ASIN | Clicks |\n| --- | --- |\n| ${params.asin} | 48 |` }],
      }));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics.ppcClicks).toBe(48);
    expect(result.metrics.conversionRate).toBe(47.92);
  });

  it("uses complete search-term traffic when the advertising summary omits clicks and impressions", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(
      name,
      adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }),
      salesPayload(),
      searchPayload(),
    ));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics.ppcClicks).toBe(48);
    expect(result.metrics.ppcImpressions).toBe(1200);
    expect(result.metrics.cpc).toBe(1.7);
    expect(result.metrics.totalUnits).toBe(59);
    expect(result.metrics.ppcUnits).toBe(31);
    expect(result.metrics.organicUnits).toBe(28);
  });

  it("reads nested Sales Trend unit totals and derives a missing paid count", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(
      name,
      adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }),
      salesPayload({ Summary: { TotalSales: 1317.35, TotalOrders: 59, TotalSessions: 122, TotalPPCCost: 81.75, TotalPPCSales: 481.75, Units: { TotalUnits: 80, OrganicUnits: 51 } } }),
      searchPayload({ oppMeta: { total_count: 0, returned_count: 0, has_next_page: false, totals: { total_clicks: 48 }, data_as_of: "search" }, opps: [] }),
    ));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics).toMatchObject({ ppcUnits: 29, organicUnits: 51, totalUnits: 80 });
    expect(result.warnings).not.toContain(expect.stringContaining("unit counts"));
  });

  it("sums impressions only after every search-term page is loaded", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "get_ads_performance") return adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } });
      if (name === "get_sales_data") return salesPayload();
      return searchPayload({
        oppMeta: { total_count: 2, returned_count: 1, has_next_page: args.page === 1, totals: { total_clicks: 48 }, data_as_of: "search" },
        opps: [{ entityType: "SearchTerm", metrics: { Impressions: args.page === 1 ? "700" : "500", Clicks: "24", Units: args.page === 1 ? "18" : "13" } }],
      });
    });

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics.ppcImpressions).toBe(1200);
    expect(result.metrics.ppcClicks).toBe(48);
    expect(result.metrics.ppcUnits).toBe(31);
    expect(result.metrics.organicUnits).toBe(28);
    expect(callTool).toHaveBeenCalledWith("get_search_term_performance", expect.objectContaining({ page: 2 }));
  });

  it("warns when the independently synced paid totals disagree", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name, adsPayload(), salesPayload({ Summary: { TotalSales: 1317.35, TotalOrders: 59, TotalSessions: 122, TotalPPCCost: 82, TotalPPCSales: 482 } })));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.warnings).toContainEqual(expect.stringContaining("synced at different times"));
  });

  it("does not substitute overall sessions when exact PPC Clicks are absent", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name, adsPayload({ totals: { total_spend: 81.75, total_sales: 481.75, total_orders: 23 } }), salesPayload(), searchPayload({ oppMeta: { total_count: 0, returned_count: 0, has_next_page: false, totals: {}, data_as_of: "search" }, opps: [] })));

    const result = await loadScaleInsightsWeeklyPerformance(params, callTool);
    expect(result.metrics.totalSessions).toBe(122);
    expect(result.metrics.conversionRate).toBeUndefined();
    expect(result.warnings).toContain("Scale Insights did not include PPC Clicks for this reporting period; PPC Conversion Rate is unavailable.");
  });

  it("fails closed when Scale Insights returns a different scope", async () => {
    const callTool = vi.fn(async (name: string) => providerPayload(name, adsPayload(), salesPayload({ EndDate: "2026-09-02" })));

    await expect(loadScaleInsightsWeeklyPerformance(params, callTool)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
