import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_MOVER_CATEGORIES,
  CAMPAIGN_OUTCOME_CATEGORIES,
  classifyCampaignOutcome,
  createCampaignComparisonRow,
  getCampaignAcos,
  getCampaignMovers,
  getCampaignMoverTotal,
  getCampaignOutcomes,
  getScaleInsightsCampaignTrendHref,
  parseCampaignSpendBaseline,
  parseCampaignWeeklyComparison,
} from "./campaign-weekly-comparison";

function campaign(name: string, previousSales: number, currentSales: number) {
  return createCampaignComparisonRow({
    campaignId: name,
    sponsoredType: 0,
    campaignName: name,
    previousActive: previousSales > 0,
    currentActive: currentSales > 0,
    previous: { sales: previousSales, spend: previousSales / 2, orders: previousSales / 10 },
    current: { sales: currentSales, spend: currentSales / 2, orders: currentSales / 10 },
  });
}

describe("campaign weekly comparison domain", () => {
  it("classifies the agreed Good, Bad, and Neutral campaign outcomes", () => {
    const row = (name: string, previousSpend: number, currentSpend: number, previousSales: number, currentSales: number) => createCampaignComparisonRow({
      campaignId: name,
      sponsoredType: 0,
      campaignName: name,
      previousActive: previousSpend > 0,
      currentActive: currentSpend > 0,
      previous: { spend: previousSpend, sales: previousSales, orders: 0 },
      current: { spend: currentSpend, sales: currentSales, orders: 0 },
    });
    const campaigns = [
      row("up-up", 10, 20, 50, 80),
      row("down-up", 20, 10, 50, 80),
      row("up-down", 10, 20, 80, 50),
      row("down-down", 20, 10, 80, 50),
      row("flat", 10, 10, 50, 50),
    ];

    expect(campaigns.map(campaign => classifyCampaignOutcome(campaign))).toEqual([
      "good-spend-up-sales-up",
      "good-spend-down-sales-up",
      "bad-spend-up-sales-down",
      "bad-spend-down-sales-down",
      "neutral-unchanged-or-mixed",
    ]);
    expect(getCampaignOutcomes(campaigns, CAMPAIGN_OUTCOME_CATEGORIES[0]).map(campaign => campaign.campaignName)).toEqual(["up-up"]);
  });

  it("gives the special Bad rules precedence and uses 15% as the inclusive ACOS threshold", () => {
    const row = (name: string, previousSpend: number, currentSpend: number, previousSales: number, currentSales: number) => createCampaignComparisonRow({
      campaignId: name,
      sponsoredType: 0,
      campaignName: name,
      previousActive: previousSpend > 0,
      currentActive: currentSpend > 0,
      previous: { spend: previousSpend, sales: previousSales, orders: 1 },
      current: { spend: currentSpend, sales: currentSales, orders: 0 },
    });
    const currentWeekNoSales = row("current-no-sales", 20, 30, 100, 0);
    const previousSpendWithoutSales = row("previous-waste", 20, 10, 0, 100);
    const currentSpendWithoutSales = row("current-waste", 20, 10, 100, 0);
    const bothWeeksSpendWithoutSales = row("both-waste", 20, 30, 0, 0);
    const lostSalesWithoutCurrentSpend = row("lost-no-current-spend", 20, 0, 100, 0);
    const newAtThreshold = row("new-high-acos", 0, 15, 0, 100);
    const newEfficient = row("new-efficient", 0, 14.99, 0, 100);

    expect(classifyCampaignOutcome(currentWeekNoSales)).toBe("bad-spend-without-sales");
    expect(classifyCampaignOutcome(previousSpendWithoutSales)).toBe("good-spend-down-sales-up");
    expect(classifyCampaignOutcome(currentSpendWithoutSales)).toBe("bad-spend-without-sales");
    expect(classifyCampaignOutcome(bothWeeksSpendWithoutSales)).toBe("bad-spend-without-sales");
    expect(classifyCampaignOutcome(lostSalesWithoutCurrentSpend)).toBe("bad-spend-down-sales-down");
    expect(classifyCampaignOutcome(newAtThreshold)).toBe("bad-new-spend-inefficient");
    expect(classifyCampaignOutcome(newEfficient)).toBe("good-spend-up-sales-up");
    expect(getCampaignAcos(newAtThreshold.current)).toBe(15);
  });

  it("classifies and ranks movers by the selected metric", () => {
    const campaigns = [campaign("small", 100, 90), campaign("largest", 100, 20), campaign("increase", 20, 60), campaign("flat", 20, 20)];
    const decline = CAMPAIGN_MOVER_CATEGORIES[0];
    const increase = CAMPAIGN_MOVER_CATEGORIES[1];
    expect(getCampaignMovers(campaigns, decline).map(row => row.campaignName)).toEqual(["largest", "small"]);
    expect(getCampaignMoverTotal(campaigns, decline)).toBe(-90);
    expect(getCampaignMovers(campaigns, increase).map(row => row.campaignName)).toEqual(["increase"]);
  });

  it("uses a null percentage for new activity and builds the exact campaign trend link", () => {
    const row = campaign("198367895759801", 0, 50);
    expect(row.delta.sales).toEqual({ absolute: 50, percentage: null });
    expect(getScaleInsightsCampaignTrendHref(row, "2026-09-02", "2026-09-08")).toBe(
      "https://portal.scaleinsights.com/PopupWindow/PPCTrendForCampaign?from=2026-09-02&to=2026-09-08&campaignId=198367895759801&sponsoredType=0",
    );
  });

  it("validates the browser-facing comparison contract and recalculates deltas", () => {
    const parsed = parseCampaignWeeklyComparison({
      asin: "b012345678",
      country: "us",
      currency: "usd",
      dataState: "Partial",
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-08-28" },
      currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-04" },
      freshness: { previousDataAsOf: "2026-08-29", currentDataAsOf: "2026-09-05" },
      campaigns: [{
        campaignId: "campaign-1", sponsoredType: 1, campaignName: "Brand campaign", previousActive: true, currentActive: true,
        previous: { sales: 100, spend: 25, orders: 4 }, current: { sales: 75, spend: 20, orders: 3 },
        delta: { sales: { absolute: 999, percentage: 999 } },
      }],
      warnings: ["Partial data"],
    });
    expect(parsed).toMatchObject({ asin: "B012345678", country: "US", currency: "USD", dataState: "Partial" });
    expect(parsed?.campaigns[0].delta.sales).toEqual({ absolute: -25, percentage: -25 });
    expect(parseCampaignWeeklyComparison({})).toBeNull();
  });

  it("validates the staged previous-week Spend baseline", () => {
    expect(parseCampaignSpendBaseline({
      asin: "b012345678", country: "us", currency: "usd", dataState: "Final",
      previousPeriod: { startDate: "2026-08-26", endDate: "2026-09-01" },
      currentPeriod: { startDate: "2026-09-02", endDate: "2026-09-08" },
      freshness: { previousDataAsOf: "2026-09-02" }, warnings: [],
      campaigns: [{ campaignId: "campaign-1", sponsoredType: 0, campaignName: "Campaign 1", previousSpend: 42.75 }],
    })).toMatchObject({ asin: "B012345678", campaigns: [{ previousSpend: 42.75 }] });
    expect(parseCampaignSpendBaseline({})).toBeNull();
  });
});
