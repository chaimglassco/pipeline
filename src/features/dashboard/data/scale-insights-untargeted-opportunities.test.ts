import type { Tool } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import { buildOpportunityToolArgs, loadUntargetedSalesOpportunities, parseExactTargetCoverage, ScaleInsightsOpportunityProviderError } from "./scale-insights-untargeted-opportunities";
import exactLive from "./fixtures/exact-coverage-live.json";
import searchLive from "./fixtures/search-terms-live-2026-09-23.json";

const params = { asin: "B012345678", country: "US", startDate: "2026-09-02", endDate: "2026-09-08", dataState: "Final" as const };
const definitions = [
  { name: "get_search_term_performance", inputSchema: { type: "object", properties: { asin_list: {}, country: {}, start_date: {}, end_date: {}, mode: {}, count: {}, page: {}, waste_only: {}, sort_by: {}, sort_direction: {} } } },
  { name: "get_search_term_keyword_analysis", inputSchema: { type: "object", properties: { asin_list: {}, country: {}, start_date: {}, end_date: {}, mode: {}, result_mode: {}, count: {}, page: {}, sort_by: {}, sort_direction: {} } } },
  { name: "get_target_performance", inputSchema: { type: "object", properties: { asin_list: {}, country: {}, start_date: {}, end_date: {}, mode: {}, count: {}, page: {}, waste_only: {}, sort_by: {}, sort_direction: {} } } },
] as Tool[];

describe("Scale Insights untargeted sales opportunity adapter", () => {
  it("reports the actual quota response instead of caching an empty history", async () => {
    const callTool = vi.fn().mockResolvedValue({ isError: true, content: [
      { type: "text", text: "MCP usage limit reached." },
      { type: "text", text: JSON.stringify({ mcpUsageWarning: { windows: [{ window: "session", remaining: 0, resetsAtUtc: "2026-10-02T09:54:21.3208064Z" }] } }) },
    ] });
    await expect(loadUntargetedSalesOpportunities({ ...params, includeHistory: true }, definitions, callTool)).rejects.toMatchObject({ providerCode: "opportunity_rate_limited", message: expect.stringContaining("5:54 PM Manila time") });
    expect(callTool).toHaveBeenCalledTimes(1);
  });
  it("rejects provider errors and unknown empty formats but accepts a confirmed zero", async () => {
    await expect(loadUntargetedSalesOpportunities(params, definitions, vi.fn().mockResolvedValue({ isError: true, content: [{ type: "text", text: "Provider error" }] }))).rejects.toMatchObject({ providerCode: "opportunity_provider_error" });
    await expect(loadUntargetedSalesOpportunities(params, definitions, vi.fn().mockResolvedValue({ structuredContent: {} }))).rejects.toMatchObject({ providerCode: "opportunity_rows_unreadable" });
    await expect(loadUntargetedSalesOpportunities({ ...params, includeHistory: true }, definitions, vi.fn().mockResolvedValue({ structuredContent: { opps: [], oppMeta: { total_count: 0, has_next_page: false } } }))).resolves.toMatchObject({ performanceRows: [], complete: true, ppcClicks: 0 });
  });
  it("parses live explicit exact coverage and rejects wrong scope or truncated coverage", () => {
    const liveParams = { ...params, asin: "B0DCTX18KK", startDate: "2026-07-08", endDate: "2026-09-29" };
    const result = { content: [{ type: "text", text: JSON.stringify(exactLive) }] };
    expect([...parseExactTargetCoverage(result, liveParams, ["5/32 lead came"]).values()]).toEqual(["untargeted"]);
    expect(parseExactTargetCoverage(result, { ...liveParams, country: "CA" }, ["5/32 lead came"]).size).toBe(0);
    expect(parseExactTargetCoverage({ structuredContent: { ...exactLive, QueryTruncated: true } }, liveParams, ["5/32 lead came"]).size).toBe(0);
    expect([...parseExactTargetCoverage({ structuredContent: { ...exactLive, Results: [{ Query: "5/32 lead came", HasExactMatch: true }] } }, liveParams, ["5/32 lead came"]).values()]).toEqual(["targeted"]);
  });
  it("sums distinct live campaign rows without duplicating mirrored content, including zero-order spend", async () => {
    const liveParams = { ...params, asin: "B0DCTX18KK", startDate: "2026-09-23", endDate: "2026-09-29", includeHistory: true };
    const callTool = vi.fn(async (name: string) => name === "get_search_term_performance" ? { structuredContent: searchLive, content: [{ type: "text", text: JSON.stringify(searchLive) }] } : { structuredContent: { opps: [], oppMeta: { total_count: 0, has_next_page: false } } });
    const result = await loadUntargetedSalesOpportunities(liveParams, definitions, callTool);
    expect(result.performanceRows?.find(row => row.term === "5/64 round u lead came")).toMatchObject({ sales: 52.97, orders: 3, clicks: 3, impressions: 13 });
    expect(result.performanceRows?.find(row => row.term === "5/64 round u lead came")?.spend).toBeCloseTo(1.89, 2);
    expect(result.ppcClicks).toBe(searchLive.oppMeta.totals.total_clicks);
    expect(result.performanceRows?.reduce((total, row) => total + row.spend, 0)).toBeCloseTo(searchLive.oppMeta.totals.total_spend, 2);
    expect(result.performanceRows?.reduce((total, row) => total + row.sales, 0)).toBeCloseTo(searchLive.oppMeta.totals.total_sales, 2);
    expect(result.complete).toBe(true);
  });
  it("builds only arguments advertised by each tool", () => {
    expect(buildOpportunityToolArgs(definitions[0], params)).toEqual({
      asin_list: ["B012345678"], country: "US", start_date: "2026-09-02", end_date: "2026-09-08", mode: "raw", waste_only: false, sort_by: "sales", sort_direction: "desc", count: 500, page: 1,
    });
    expect(buildOpportunityToolArgs(definitions[1], params)).toEqual({
      asin_list: ["B012345678"], country: "US", start_date: "2026-09-02", end_date: "2026-09-08", mode: "harvest", result_mode: "raw", sort_by: "sales", sort_direction: "desc", count: 500, page: 1,
    });
    expect(buildOpportunityToolArgs(definitions[2], params)).toEqual({
      asin_list: ["B012345678"], country: "US", start_date: "2026-09-02", end_date: "2026-09-08", mode: "raw", waste_only: false, sort_by: "sales", sort_direction: "desc", count: 500, page: 1,
    });
  });

  it("joins converting PPC terms to their strongest uncovered campaign source and classifies product ASINs", async () => {
    const callTool = vi.fn(async (name: string) => name === "get_search_term_performance" ? {
      structuredContent: {
        agg: { Currency: "USD" },
        opps: [
          { entity: "glass cutter (B012345678)", metrics: { Impressions: "1,200", Sales: "$100.00", Orders: "2", Spend: "$20", Clicks: "10" } },
          { SearchTerm: "B095WV5YZ4", Impressions: 800, Sales: 80, Orders: 1, Spend: 8, Clicks: 4, ACOS: "10%" },
          { SearchTerm: "B0UNCOVR12", Impressions: 400, Sales: 40, Orders: 1, Spend: 4, Clicks: 2, ACOS: "10%" },
          { SearchTerm: "already targeted", Impressions: 500, Sales: 50, Orders: 1, Spend: 5, Clicks: 2 },
          { SearchTerm: "no sale", Impressions: 300, Sales: 0, Orders: 0, Spend: 1, Clicks: 1 },
          { identity: { search_query: "nested metrics" }, metrics: { Impression: 200, Sales: 0, Orders: 0, Spend: 0, Clicks: 0 } },
        ],
        oppMeta: { total_count: 5, data_as_of: "2026-09-09" },
      },
    } : name === "get_search_term_keyword_analysis" ? {
      structuredContent: {
        opps: [
          { entity: "glass cutter (B012345678)", metrics: { CampaignId: "campaign-low", AdGroupId: "ad-group-low", ParentKeyword: "glass", ParentMatchType: "broad", Sales: "$25", Orders: "1", Spend: "$4" } },
          { entity: "glass cutter (B012345678)", metrics: { CampaignId: "campaign-high", AdGroupId: "ad-group-high", ParentKeyword: "glass cutter", ParentMatchType: "phrase", Sales: "$75", Orders: "1", Spend: "$16" } },
          { entity: "B095WV5YZ4 (B012345678)", metrics: { CampaignId: "campaign-asin", AdGroupId: "ad-group-asin", ParentKeyword: "competitor", ParentMatchType: "exact", Sales: "$80", Orders: "1", Spend: "$8" } },
          { entity: "B0UNCOVR12 (B012345678)", metrics: { CampaignId: "campaign-new-asin", AdGroupId: "ad-group-new-asin", ParentKeyword: "competitor two", ParentMatchType: "exact", Sales: "$40", Orders: "1", Spend: "$4" } },
        ],
        oppMeta: { total_count: 4, data_as_of: "2026-09-09" },
      },
    } : {
      structuredContent: {
        opps: [
          { entity: "B095WV5YZ4 (product)", metrics: { TargetType: "product", Spend: "$8" } },
          { entity: "B0UNCOVR12 (other)", metrics: { TargetType: "other", Spend: "$0" } },
        ],
        oppMeta: { total_count: 2, returned_count: 2, has_next_page: false, data_as_of: "2026-09-09" },
      },
    });

    const report = await loadUntargetedSalesOpportunities(params, definitions, callTool);
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool).toHaveBeenNthCalledWith(2, "get_search_term_keyword_analysis", expect.objectContaining({
      asin_list: ["B012345678"], mode: "harvest", result_mode: "raw",
    }));
    expect(callTool).toHaveBeenNthCalledWith(3, "get_target_performance", expect.objectContaining({
      asin_list: ["B012345678"], mode: "raw", waste_only: false,
    }));
    expect(report).toMatchObject({
      asin: "B012345678", country: "US", currency: "USD", dataState: "Final", ppcClicks: 19,
      period: { startDate: "2026-09-02", endDate: "2026-09-08" },
      freshness: { searchDataAsOf: "2026-09-09", coverageDataAsOf: "2026-09-09" },
      opportunities: [
        { term: "glass cutter", type: "Search term", sourceCampaignId: "campaign-high", sourceAdGroupId: "ad-group-high", sourceKeyword: "glass cutter", sourceMatchType: "phrase", sales: 100, orders: 2, spend: 20, impressions: 1200, clicks: 10, acos: 20 },
        { term: "B0UNCOVR12", type: "Product ASIN", sourceCampaignId: "campaign-new-asin", sourceAdGroupId: "ad-group-new-asin", sourceKeyword: "competitor two", sourceMatchType: "exact", sales: 40, orders: 1, spend: 4, impressions: 400, clicks: 2, acos: 10 },
      ],
    });
  });

  it("fails closed for product ASINs when product-target coverage is unavailable", async () => {
    const withoutTargetTool = definitions.filter(tool => tool.name !== "get_target_performance");
    const callTool = vi.fn(async (name: string) => name === "get_search_term_performance" ? {
      structuredContent: { opps: [{ SearchTerm: "B095WV5YZ4", Impressions: 18, Sales: 21.99, Orders: 1, Spend: 3.33, Clicks: 3 }], oppMeta: { total_count: 1 } },
    } : {
      structuredContent: { opps: [{ entity: "B095WV5YZ4 (B012345678)", metrics: { CampaignId: "campaign-asin", Sales: 21.99, Orders: 1, Spend: 3.33 } }], oppMeta: { total_count: 1 } },
    });

    await expect(loadUntargetedSalesOpportunities(params, withoutTargetTool, callTool)).resolves.toMatchObject({
      opportunities: [],
      warnings: [expect.stringContaining("Product ASIN opportunities were omitted")],
    });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("reads Markdown performance tables and excludes terms without campaign attribution", async () => {
    const callTool = vi.fn(async (name: string) => ({ content: [{ type: "text", text: name === "get_search_term_performance"
      ? "| Search Term | Impressions | PPC Sales | PPC Orders | PPC Cost | Clicks |\n| --- | --- | --- | --- | --- | --- |\n| lead knife | 100 | $25 | 1 | $5 | 3 |"
      : "| Search Term | CampaignId |\n| --- | --- |\n| another term | 123 |" }] }));
    await expect(loadUntargetedSalesOpportunities(params, definitions, callTool)).resolves.toMatchObject({ opportunities: [] });
  });

  it("fails safely for missing capabilities and unreadable positive result sets", async () => {
    await expect(loadUntargetedSalesOpportunities(params, [], vi.fn())).rejects.toMatchObject({ providerCode: "opportunity_capability_missing" });
    const callTool = vi.fn(async (name: string) => ({ structuredContent: { rows: [{ private_value: name }], oppMeta: { total_count: 1 } } }));
    await expect(loadUntargetedSalesOpportunities(params, definitions, callTool)).rejects.toBeInstanceOf(ScaleInsightsOpportunityProviderError);
  });

  it("does not spend a campaign-attribution call when the search report has no rows", async () => {
    const callTool = vi.fn(async () => ({ structuredContent: { rows: [], oppMeta: { total_count: 0 } } }));
    await expect(loadUntargetedSalesOpportunities(params, definitions, callTool)).resolves.toMatchObject({ opportunities: [], ppcClicks: 0 });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("omits the click total when Scale Insights indicates that search-term coverage is incomplete", async () => {
    const callTool = vi.fn(async (name: string) => name === "get_search_term_performance"
      ? { structuredContent: { opps: [{ SearchTerm: "partial term", Impressions: 10, Sales: 0, Orders: 0, Spend: 1, Clicks: 2 }], oppMeta: { total_count: 600 } } }
      : { structuredContent: { opps: [], oppMeta: { total_count: 0 } } });

    const report = await loadUntargetedSalesOpportunities(params, definitions, callTool);
    expect(report.ppcClicks).toBeUndefined();
  });
});
