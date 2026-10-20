import { describe, expect, it } from "vitest";
import {
  campaignCsvCacheKey,
  createCampaignComparisonFromCsv,
  createCampaignComparisonFromPreviousComparison,
  inferCsvPeriodFromFileName,
  parseCampaignCsvImportCache,
  parseScaleInsightsCampaignCsv,
  PPC_CAMPAIGN_CSV_CACHE_KEY,
  withCampaignCsvImport,
} from "./campaign-comparison-csv";

const header = "Type,Campaign,Orders,Sales,Spent,CampaignId\r\n";

describe("Scale Insights campaign CSV", () => {
  it("parses Scale Insights columns and aggregates duplicate campaign rows", () => {
    const campaigns = parseScaleInsightsCampaignCsv(`${header}SP Manual,"Campaign, One",2,100.50,15.25,123\r\nSP Manual,"Campaign, One",1,20,2,123`);
    expect(campaigns.get("123")).toEqual({
      campaignId: "123",
      campaignName: "Campaign, One",
      sponsoredType: 0,
      metrics: { spend: 17.25, sales: 120.5, orders: 3 },
    });
  });

  it("joins both weeks by CampaignId and treats an absent weekly row as zero", () => {
    const comparison = createCampaignComparisonFromCsv({
      asin: "b012345678",
      country: "us",
      previousText: `${header}SP Manual,Previous only,2,100,20,111\r\nSP Auto,Shared,1,50,10,222`,
      currentText: `${header}SP Auto,Shared,3,90,12,222\r\nSD Audience,Current only,0,0,5,333`,
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-09-01" },
      currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
    });
    expect(comparison).toMatchObject({ asin: "B012345678", country: "US", currency: "USD" });
    expect(comparison.campaigns.find(row => row.campaignId === "111")?.current).toEqual({ spend: 0, sales: 0, orders: 0 });
    expect(comparison.campaigns.find(row => row.campaignId === "333")?.previous).toEqual({ spend: 0, sales: 0, orders: 0 });
  });

  it("rejects missing fields and cross-week identity conflicts", () => {
    expect(() => parseScaleInsightsCampaignCsv("Campaign,Spent\nTest,1")).toThrow("missing required columns");
    expect(() => createCampaignComparisonFromCsv({
      asin: "B012345678", country: "US",
      previousText: `${header}SP Manual,First name,1,10,2,111`,
      currentText: `${header}SP Manual,Second name,1,10,2,111`,
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-09-01" },
      currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
    })).toThrow("different names or types");
  });

  it("infers recognizable file periods and validates stored cache entries", () => {
    expect(inferCsvPeriodFromFileName("Sept. 2 - 8.csv", 2026)).toEqual({ startDate: "2026-09-02", endDate: "2026-09-08" });
    expect(inferCsvPeriodFromFileName("July 26 - Sept. 1.csv", 2026)).toEqual({ startDate: "2026-07-26", endDate: "2026-09-01" });
    expect(inferCsvPeriodFromFileName("campaign-export.csv", 2026)).toBeNull();

    const comparison = createCampaignComparisonFromCsv({
      asin: "B012345678", country: "US", previousText: `${header}SP Manual,First,1,10,2,111`, currentText: `${header}SP Manual,First,1,20,3,111`,
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-09-01" }, currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
    });
    const entry = { comparison, previousFileName: "Aug 26 - Sept 1.csv", currentFileName: "Sept 2 - 8.csv", importedAt: "2026-09-15T00:00:00.000Z" };
    const cache = withCampaignCsvImport({}, entry);
    expect(campaignCsvCacheKey("us", "b012345678", "2026-09-02")).toBe("US:B012345678:2026-09-02");
    expect(parseCampaignCsvImportCache(JSON.stringify({ version: 1, entries: cache }))).toEqual(cache);
    expect(parseCampaignCsvImportCache(JSON.stringify({ key: PPC_CAMPAIGN_CSV_CACHE_KEY }))).toEqual({});
  });

  it("reuses the prior comparison's current week as the next previous week", () => {
    const prior = createCampaignComparisonFromCsv({
      asin: "B012345678", country: "US",
      previousText: `${header}SP Manual,Campaign,1,10,2,111`,
      currentText: `${header}SP Manual,Campaign,2,20,3,111`,
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-09-01" },
      currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
    });
    const next = createCampaignComparisonFromPreviousComparison({
      asin: "B012345678", country: "US", previousComparison: prior,
      currentText: `${header}SP Manual,Campaign,3,30,4,111`,
      previousPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
      currentPeriod: { startDate: "2026-09-09", endDate: "2026-09-15" },
    });
    expect(next.campaigns[0]).toMatchObject({ previous: { spend: 3, sales: 20, orders: 2 }, current: { spend: 4, sales: 30, orders: 3 } });
  });
});
