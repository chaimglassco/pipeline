import { describe, expect, it, vi } from "vitest";
import { ScaleInsightsDataError } from "./scale-insights-performance";
import {
  getReadOnlyScaleInsightsToolNames,
  getScaleInsightsCampaignToolCapabilities,
  loadScaleInsightsCampaignComparison,
  loadScaleInsightsCampaignSpendBaseline,
  ScaleInsightsCampaignProviderError,
  summarizeCampaignProviderResponse,
  summarizeCampaignToolSchema,
} from "./scale-insights-campaign-comparison";

const params = {
  asin: "B012345678",
  country: "US",
  previousStartDate: "2026-08-26",
  previousEndDate: "2026-09-01",
  currentStartDate: "2026-09-02",
  currentEndDate: "2026-09-08",
  dataState: "Final" as const,
};
const campaignCapabilities = { grouping: { key: "group_by", value: "campaign" } };

function payload(startDate: string, endDate: string, rows: Record<string, unknown>[], totalCount = rows.length) {
  return {
    structuredContent: {
      agg: { Country: "US", StartDate: startDate, EndDate: endDate, Currency: "USD" },
      rows,
      oppMeta: { total_count: totalCount, data_as_of: endDate },
    },
  };
}

function row(id: string, name: string, sales: number, spend: number, orders: number, sponsoredType = 0) {
  return { CampaignId: id, Campaign: name, SponsoredType: sponsoredType, Sales: sales, Spend: spend, Orders: orders };
}

describe("Scale Insights campaign comparison adapter", () => {
  it("detects campaign grouping and pagination fields from the live tool schema", () => {
    expect(getScaleInsightsCampaignToolCapabilities({ properties: {
      group_by: { enum: ["product", "campaign"] }, limit: { type: "integer" }, offset: { type: "integer" },
    } })).toEqual({ grouping: { key: "group_by", value: "campaign" }, limitKey: "limit", offsetKey: "offset", pageKey: undefined, cursorKey: undefined });
    expect(getScaleInsightsCampaignToolCapabilities({ properties: {
      report_scope: { anyOf: [{ const: "products" }, { const: "campaigns" }, { const: "keywords" }] }, pageSize: { type: "integer" }, cursor: { type: "string" },
    } })).toEqual({ grouping: { key: "report_scope", value: "campaigns" }, limitKey: "pageSize", offsetKey: undefined, pageKey: undefined, cursorKey: "cursor" });
  });

  it("summarizes tool and response shapes without logging provider values", () => {
    const schema = summarizeCampaignToolSchema({ properties: {
      group_by: { enum: ["product", "campaign"] }, limit: { type: "integer" }, secret_input: { enum: ["must-not-log"] },
    } });
    const response = summarizeCampaignProviderResponse({
      structuredContent: {
        agg: { Country: "US" },
        rows: [{ CampaignId: "secret-campaign-id", Campaign: "Secret campaign name", Spend: 86.54 }],
        campaignMap: { "Secret dynamic campaign": { Spend: 86.54 } },
      },
      content: [{ type: "text", text: "| Campaign | Spend |\n| --- | --- |\n| Secret campaign name | $86.54 |" }],
    });
    const serialized = JSON.stringify({ schema, response });
    expect(schema).toEqual({
      propertyNames: ["group_by", "limit", "secret_input"],
      choices: { group_by: ["product", "campaign"] },
    });
    expect(response.markdownHeaders).toEqual([["Campaign", "Spend"]]);
    expect(serialized).not.toContain("secret-campaign-id");
    expect(serialized).not.toContain("Secret campaign name");
    expect(serialized).not.toContain("Secret dynamic campaign");
    expect(serialized).not.toContain("86.54");
    expect(getReadOnlyScaleInsightsToolNames([
      { name: "get_ads_performance", description: "Retrieve performance reports" },
      { name: "update_campaign", description: "Update a campaign" },
    ])).toEqual(["get_ads_performance"]);
  });

  it("fails before calling aggregate advertising data when no campaign capability is advertised", async () => {
    const callTool = vi.fn();
    const reportDiagnostic = vi.fn();
    await expect(loadScaleInsightsCampaignSpendBaseline(params, callTool, {}, reportDiagnostic))
      .rejects.toMatchObject({ campaignCode: "campaign_capability_missing" });
    expect(callTool).not.toHaveBeenCalled();
    expect(reportDiagnostic).toHaveBeenCalledWith("campaign_capability_missing", { capabilities: {} });
  });

  it("loads both periods, follows pagination, merges by id and ad type, and prefers the current name", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const startDate = String(args.start_date);
      const endDate = String(args.end_date);
      const offset = Number(args.offset || 0);
      if (startDate === params.previousStartDate) {
        return offset === 0
          ? payload(startDate, endDate, [row("campaign-1", "Old campaign name", 287.73, 86.54, 4)], 2)
          : payload(startDate, endDate, [row("campaign-2", "Previous only", 100, 20, 2)], 2);
      }
      return payload(startDate, endDate, [
        row("campaign-1", "Current campaign name", 53.96, 6.1, 1),
        row("campaign-3", "New campaign", 50, 15, 2, 1),
      ], 2);
    });

    const comparison = await loadScaleInsightsCampaignComparison(params, callTool, {
      grouping: { key: "group_by", value: "campaign" }, limitKey: "limit", offsetKey: "offset",
    });

    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool).toHaveBeenCalledWith("get_ads_performance", expect.objectContaining({
      asin_list: [params.asin], country: "US", mode: "raw", summary_only: false, group_by: "campaign", limit: 500,
    }));
    expect(comparison.campaigns).toHaveLength(3);
    expect(comparison.campaigns.find(campaign => campaign.campaignId === "campaign-1")).toMatchObject({
      campaignName: "Current campaign name", previousActive: true, currentActive: true,
      previous: { sales: 287.73, spend: 86.54, orders: 4 }, current: { sales: 53.96, spend: 6.1, orders: 1 },
      delta: { sales: { absolute: -233.77 } },
    });
    expect(comparison.campaigns.find(campaign => campaign.campaignId === "campaign-2")).toMatchObject({ currentActive: false, current: { sales: 0, spend: 0, orders: 0 } });
    expect(comparison.campaigns.find(campaign => campaign.campaignId === "campaign-3")).toMatchObject({ previousActive: false, previous: { sales: 0, spend: 0, orders: 0 } });
  });

  it("rejects provider data for the wrong reporting scope", async () => {
    const callTool = vi.fn(async () => payload("2020-01-01", "2020-01-07", [row("campaign-1", "Wrong scope", 1, 1, 1)]));
    await expect(loadScaleInsightsCampaignComparison(params, callTool, campaignCapabilities)).rejects.toBeInstanceOf(ScaleInsightsDataError);
  });

  it("returns an empty valid comparison when neither period has campaign activity", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => payload(String(args.start_date), String(args.end_date), [], 0));
    await expect(loadScaleInsightsCampaignComparison(params, callTool, campaignCapabilities)).resolves.toMatchObject({ campaigns: [], warnings: [] });
  });

  it("reads nested entity rows with formatted MCP values", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => payload(String(args.start_date), String(args.end_date), [{
      type: "campaign",
      campaign: { id: "campaign-nested", name: "Nested campaign", sponsored_ads_type: "Sponsored Products" },
      metrics: { "PPC Sales": "$1,287.73", "PPC Cost": "$86.54", "PPC Orders": "4" },
    }]));
    const comparison = await loadScaleInsightsCampaignComparison(params, callTool, campaignCapabilities);
    expect(comparison.campaigns).toEqual([expect.objectContaining({
      campaignId: "campaign-nested", campaignName: "Nested campaign", sponsoredType: 0,
      previous: { sales: 1287.73, spend: 86.54, orders: 4 }, current: { sales: 1287.73, spend: 86.54, orders: 4 },
    })]);
  });

  it("reads campaign rows from MCP text content when structuredContent contains only totals", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      structuredContent: {
        agg: { Country: "US", StartDate: String(args.start_date), EndDate: String(args.end_date), Currency: "USD" },
        oppMeta: { total_count: 1, data_as_of: String(args.end_date) },
      },
      content: [{ type: "text", text: [
        "| Campaign ID | Campaign Name | Sponsored Type | PPC Sales | PPC Cost | PPC Orders |",
        "| --- | --- | --- | --- | --- | --- |",
        "| campaign-text | Text campaign | SP | $287.73 | $86.54 | 4 |",
      ].join("\n") }],
    }));
    const reportDiagnostic = vi.fn();
    const comparison = await loadScaleInsightsCampaignComparison(params, callTool, campaignCapabilities, reportDiagnostic);
    expect(comparison.campaigns).toEqual([expect.objectContaining({
      campaignId: "campaign-text", campaignName: "Text campaign",
      previous: { sales: 287.73, spend: 86.54, orders: 4 }, current: { sales: 287.73, spend: 86.54, orders: 4 },
    })]);
    expect(reportDiagnostic).not.toHaveBeenCalled();
  });

  it("loads only the previous period and requires only campaign Spend for the staged baseline", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => payload(String(args.start_date), String(args.end_date), [{
      campaign: { name: "Spend-only campaign" },
      metrics: { spend: 42.75 },
    }]));
    const baseline = await loadScaleInsightsCampaignSpendBaseline(params, callTool, campaignCapabilities);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith("get_ads_performance", expect.objectContaining({
      start_date: params.previousStartDate, end_date: params.previousEndDate, summary_only: false,
    }));
    expect(baseline).toMatchObject({
      previousPeriod: { startDate: params.previousStartDate, endDate: params.previousEndDate },
      currentPeriod: { startDate: params.currentStartDate, endDate: params.currentEndDate },
      campaigns: [{ campaignId: null, sponsoredType: null, campaignName: "Spend-only campaign", previousSpend: 42.75 }],
    });
  });

  it("reports a sanitized shape when campaign rows cannot be read", async () => {
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      structuredContent: {
        agg: { Country: "US", StartDate: String(args.start_date), EndDate: String(args.end_date), Currency: "USD" },
        oppMeta: { total_count: 1 },
        rows: [{ unknown_name: "Sensitive campaign", unknown_cost: 42.75 }],
      },
    }));
    const reportDiagnostic = vi.fn();
    await expect(loadScaleInsightsCampaignSpendBaseline(params, callTool, campaignCapabilities, reportDiagnostic))
      .rejects.toBeInstanceOf(ScaleInsightsCampaignProviderError);
    expect(reportDiagnostic).toHaveBeenCalledWith("campaign_rows_unreadable", expect.objectContaining({
      period: { startDate: params.previousStartDate, endDate: params.previousEndDate },
      resultCount: 1,
      responseShape: expect.objectContaining({ objectPaths: expect.any(Array) }),
    }));
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain("Sensitive campaign");
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain("42.75");
  });
});
