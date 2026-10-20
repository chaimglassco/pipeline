import { describe, expect, it } from "vitest";
import { parseUntargetedOpportunityCache, parseUntargetedSalesOpportunities, untargetedOpportunityCacheKey, withUntargetedOpportunityCacheEntry } from "./untargeted-sales-opportunities";

const valid = {
  asin: "b012345678", country: "us", currency: "usd", dataState: "Partial",
  ppcClicks: 12,
  period: { startDate: "2026-09-02", endDate: "2026-09-08" },
  freshness: { searchDataAsOf: "2026-09-09", coverageDataAsOf: "2026-09-09" },
  opportunities: [{ term: "lead knife", type: "Search term", sourceCampaignId: "123", sourceAdGroupId: "456", sourceKeyword: "knife", sourceMatchType: "broad", sales: 25, orders: 1, spend: 5, impressions: 100, clicks: 3, acos: 20 }], warnings: [],
};

describe("untargeted opportunity response validation", () => {
  it("normalizes valid responses and accepts legacy rows without optional campaign attribution", () => {
    expect(parseUntargetedSalesOpportunities(valid)).toMatchObject({ asin: "B012345678", country: "US", currency: "USD", ppcClicks: 12, opportunities: [{ sourceCampaignId: "123" }] });
    const legacyRow = { term: "lead knife", type: "Search term", sales: 25, orders: 1, spend: 5, impressions: 100, clicks: 3, acos: 20 };
    expect(parseUntargetedSalesOpportunities({ ...valid, opportunities: [legacyRow] })).not.toBeNull();
  });
  it("rejects invalid metrics and product ASINs", () => {
    expect(parseUntargetedSalesOpportunities({ ...valid, ppcClicks: 1.5 })).toBeNull();
    expect(parseUntargetedSalesOpportunities({ ...valid, opportunities: [{ ...valid.opportunities[0], orders: 1.5 }] })).toBeNull();
    expect(parseUntargetedSalesOpportunities({ ...valid, opportunities: [{ ...valid.opportunities[0], type: "Product ASIN", term: "bad" }] })).toBeNull();
  });
  it("validates cached reports by their normalized product and week key", () => {
    const report = parseUntargetedSalesOpportunities(valid)!;
    const cache = withUntargetedOpportunityCacheEntry({}, report);
    const key = untargetedOpportunityCacheKey("US", "B012345678", "2026-09-02");
    expect(parseUntargetedOpportunityCache(JSON.stringify({ version: 1, entries: cache }))[key]).toEqual(report);
    expect(parseUntargetedOpportunityCache(JSON.stringify({ version: 1, entries: { wrong: report } }))).toEqual({});
  });
});
