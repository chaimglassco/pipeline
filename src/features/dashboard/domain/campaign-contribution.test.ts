import { describe, expect, it } from "vitest";
import { analyzeCampaignContribution, contributionDelta, contributionMetrics, type NativeCampaign, type NativeCampaignMetrics } from "./campaign-contribution";
const metric = (spend = 10, clicks = 10, impressions = 100, sales = 100, orders = 2): NativeCampaignMetrics => ({ spend, clicks, impressions, sales, orders });
const row = (id: string, metrics = metric()): NativeCampaign => ({ campaignId: id, campaignName: `Campaign ${id}`, ...metrics });
function report(previous: NativeCampaign[], current: NativeCampaign[], oldTotal = metric(), newTotal = metric(), complete = true) {
  return analyzeCampaignContribution({ asin: "B0DCTX18KK", country: "US", productName: "Round U", currency: "USD", previous: { startDate: "2026-09-16", endDate: "2026-09-22", complete, campaigns: previous, asinTotals: oldTotal }, current: { startDate: "2026-09-23", endDate: "2026-09-29", complete, campaigns: current, asinTotals: newTotal } });
}
describe("native campaign contributions", () => {
  it("joins stable IDs even after rename and calculates ratios", () => {
    const result = report([row("1")], [{ ...row("1", metric(20, 8)), campaignName: "Renamed" }]);
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].currentMetrics?.cpc).toBe(2.5);
    expect(result.campaigns[0].delta.acos.absolute).toBe(10);
  });
  it("includes new campaigns only using complete absence", () => {
    const result = report([], [row("1")]);
    expect(result.campaigns[0].delta.spend.isNew).toBe(true);
    expect(result.campaigns[0].diagnosis).toContain("New campaign");
  });
  it("includes disappearing campaigns with -100% and no traffic", () => {
    const result = report([row("1")], []);
    expect(result.campaigns[0].delta.clicks.percentage).toBe(-100);
    expect(result.campaigns[0].diagnosis).toContain("Stopped / no traffic");
  });
  it("does not zero a missing side when pagination is incomplete", () => {
    const result = report([], [row("1")], metric(), metric(), false);
    expect(result.campaigns[0].previousMetrics).toBeNull();
    expect(result.campaigns[0].delta.spend.absolute).toBeNull();
    expect(result.campaigns[0].diagnosis).not.toContain("New campaign");
  });
  it("handles zero CPC and zero sales without Infinity", () => {
    expect(contributionDelta(0, 1)).toEqual({ absolute: 1, percentage: null, isNew: true });
    expect(contributionMetrics(metric(0, 0, 0, 0, 0))).toMatchObject({ cpc: null, acos: null });
    expect(contributionDelta(0, 0).percentage).toBe(0);
  });
  it("flags one-click CPC comparisons as low data", () => {
    const result = report([row("1", metric(1, 1))], [row("1", metric(5, 1))]);
    expect(result.campaigns[0].lowData).toBe(true);
    expect(result.campaigns[0].diagnosis).not.toContain("CPC pressure");
  });
  it("identifies traffic growth with lower CPC and stable ACOS", () => {
    const result = report([row("1")], [row("1", metric(15, 20, 200, 200))]);
    expect(result.campaigns[0].diagnosis).toEqual(expect.arrayContaining(["Spend up with more traffic", "Efficient traffic growth"]));
  });
  it("identifies more spend, fewer clicks, and higher CPC", () => {
    const result = report([row("1")], [row("1", metric(20, 5, 50))]);
    expect(result.campaigns[0].diagnosis).toEqual(expect.arrayContaining(["Paying more for less traffic", "CPC pressure", "Visibility loss"]));
  });
  it("reconciles native totals and warns on coverage mismatch", () => {
    expect(report([row("1")], [row("1")]).warning).toBeNull();
    const result = report([row("1")], [row("1", metric(20))]);
    expect(result.reconciliation.find(row => row.period === "current" && row.metric === "spend")?.coveragePct).toBe(200);
    expect(result.warning).toContain("do not reconcile");
  });
  it("uses ASIN net spend increase, keeps negative offsets, and sorts drivers", () => {
    const result = report([row("1"), row("2"), row("3")], [row("1", metric(20)), row("2", metric(30)), row("3", metric(5))], metric(30), metric(55));
    expect(result.campaigns.map(row => row.campaignId)).toEqual(["2", "1", "3"]);
    expect(result.campaigns.map(row => row.spendContributionPct)).toEqual([80, 40, -20]);
    expect(report([row("1")], [row("1", metric(5))]).campaigns[0].spendContributionPct).toBeNull();
  });
  it("rejects repeated IDs and missing native traffic", () => {
    expect(() => report([row("1"), row("1")], [])).toThrow("unique");
    expect(() => report([row("1", { ...metric(), clicks: NaN })], [])).toThrow("finite");
  });
});
