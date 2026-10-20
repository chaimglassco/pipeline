import { expect, it, vi } from "vitest";
import { loadCampaignContribution, nativeCampaignCapability } from "./scale-insights-campaign-contribution";
import { CAMPAIGN_ATTRIBUTION_UNAVAILABLE } from "../domain/campaign-contribution";
const params = { asin: "B0DCTX18KK", country: "US", previousStartDate: "2026-09-16", previousEndDate: "2026-09-22", currentStartDate: "2026-09-23", currentEndDate: "2026-09-29", dataState: "Final" as const };
it("rejects the actual account-wide campaign contract without calling it", async () => {
  const definitions = [{ name: "get_campaign_performance", inputSchema: { properties: { country: {}, start_date: {}, end_date: {}, page: {}, count: {} } } }, { name: "get_ads_performance", inputSchema: { properties: { asin_list: { type: "array" }, country: {}, start_date: {}, end_date: {}, page: {}, count: {} } } }];
  const callTool = vi.fn(), diagnostic = vi.fn();
  expect(nativeCampaignCapability(definitions)).toBeNull();
  const result = await loadCampaignContribution(params, definitions, callTool, diagnostic);
  expect(result.warning).toBe(CAMPAIGN_ATTRIBUTION_UNAVAILABLE);
  expect(result.campaigns).toEqual([]);
  expect(callTool).not.toHaveBeenCalled();
  expect(diagnostic).toHaveBeenCalledWith("campaign_contribution_contract", expect.objectContaining({ nativeAsinCampaignReporting: false }));
});
it("fails closed when a future native tool omits returned ASIN scope", async () => {
  const definitions = [{ name: "get_campaign_performance", inputSchema: { properties: { asin_list: { type: "array" }, country: {}, start_date: {}, end_date: {}, page: {}, count: {} } } }];
  const callTool = vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ agg: { Country: "US", StartDate: "2026-09-23", EndDate: "2026-09-29" }, oppMeta: { has_next_page: false, total_count: 0 }, opps: [] }) }] });
  const result = await loadCampaignContribution(params, definitions, callTool, vi.fn());
  expect(result.state).toBe("unavailable");
  expect(result.warning).toContain("scope");
  expect(callTool.mock.calls.every(([name]) => !/search_term|keyword/.test(name))).toBe(true);
});
it("normalizes native scoped rows and reconciles ASIN totals without keyword reconstruction", async () => {
  const definitions = [{ name: "get_campaign_performance", inputSchema: { properties: { asin_list: { type: "array" }, country: {}, start_date: {}, end_date: {}, page: {}, count: {} } } }];
  const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify({ AsinList: [params.asin], agg: { Country: args.country, StartDate: args.start_date, EndDate: args.end_date, Currency: "USD" }, oppMeta: { total_count: 1, has_next_page: false, totals: { total_impressions: 100, total_clicks: 10, total_spend: 10, total_sales: 100, total_orders: 2 } }, opps: [{ entityType: name === "get_campaign_performance" ? "Campaign" : "Asin", entity: name === "get_campaign_performance" ? "Native Campaign" : params.asin, metrics: { CampaignId: "123", CampaignName: "Native Campaign", Asin: params.asin, Impressions: "100", Clicks: "10", Spend: "$10.00", Sales: "$100.00", Orders: "2" } }] }) }] }));
  const result = await loadCampaignContribution(params, definitions, callTool, vi.fn());
  expect(result.state).toBe("available");
  expect(result.warning).toBeNull();
  expect(result.campaigns[0].currentMetrics?.cpc).toBe(1);
  expect(result.reconciliation.every(row => row.matches)).toBe(true);
  expect(callTool.mock.calls.map(([name]) => name).sort()).toEqual(["get_ads_performance", "get_ads_performance", "get_campaign_performance", "get_campaign_performance"]);
});
