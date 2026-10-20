import { expect, it } from "vitest";
import { parseAuditAds, parseSavedAudit, type AuditAd } from "./ppc-audit";
import { placementAnalysis } from "./ppc-audit-placements";
import { DEFAULT_WASTE_RULES } from "./ppc-audit-waste";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "placement", type: "SP", campaign: "Main", campaignId: "1", adGroup: "", asin: "", sku: "", target: "", query: "", match: "", placement: "Top of Search", strategy: "", state: "enabled", bid: 0, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 2000, ...v });

it("uses only placement evidence and chooses one entity grain per campaign and slot", () => {
  const data = placementAnalysis([ad({ entity: "campaign", placement: "", spend: 100 }), ad(), ad({ entity: "productad", asin: "B012345678" }), ad({ entity: "keyword", asin: "B012345678", target: "glass" }), ad({ placement: "Placement Rest Of Search", spend: 60, sales: 100, orders: 2, clicks: 60, impressions: 3000 })]);
  expect(data.portfolio.totals).toEqual({ spend: 100, sales: 300, orders: 10, clicks: 100, impressions: 5000 });
  expect(data.portfolio.cvr).toBe(10); expect(data.portfolio.ctr).toBe(2); expect(data.portfolio.cpc).toBe(1);
  expect(data.groups[0].spendShare).toBe(40); expect(data.groups[0].salesShare).toBeCloseTo(200 / 3);
  expect(data.byAsin[0].totals.spend).toBe(40);
  expect(data.groups.find(g => g.name === "Product Pages")?.available).toBe(false);
  expect(data.ledger).toHaveLength(2);
});
it("never invents ASIN or match cross-sections from campaign-only placement data", () => {
  const rows = [ad(), ad({ entity: "keyword", placement: "", target: "glass", match: "Exact", asin: "B012345678" })];
  expect(placementAnalysis(rows).byAsin).toEqual([]); expect(placementAnalysis(rows).matches).toEqual([]);
  expect(placementAnalysis(rows, { asin: "B012345678" }).portfolio.available).toBe(false);
  expect(placementAnalysis(rows, { match: "Exact" }).portfolio.available).toBe(false);
});
it("does not add ASIN rollups to ad-group and target detail with different group labels", () => {
  const rows = [ad({ entity: "campaign", asin: "B012345678" }), ad({ entity: "productad", asin: "B012345678", adGroup: "Core" }), ad({ entity: "keyword", asin: "B012345678", adGroup: "Core", target: "glass" })];
  const data = placementAnalysis(rows);
  expect(data.portfolio.totals.spend).toBe(40);
  expect(data.byAsin[0].totals.spend).toBe(40);
  expect(data.ledger).toHaveLength(1);
});
it("keeps campaign identities and placements separate and flags a performance row once", () => {
  const rows = [ad({ type: "SB", spend: 60, sales: 100, orders: 0, clicks: 20 }), ad({ campaignId: "2", spend: 10, sales: 50 }), ad({ placement: "Product Pages", spend: 20, sales: 100 })];
  const data = placementAnalysis(rows);
  expect(data.byCampaign).toHaveLength(3); expect(data.portfolio.waste).toBe(60);
  expect(placementAnalysis(rows, { type: "SB" }).portfolio.totals.spend).toBe(60);
});
it("does not treat undefined CPC or CVR as waste when custom rules allow zero clicks", () => {
  const data = placementAnalysis([ad({ spend: 20, sales: 100, orders: 1, clicks: 0 })], {}, { ...DEFAULT_WASTE_RULES, minClicks: 0 });
  expect(data.portfolio.waste).toBe(0);
  expect(data.portfolio.cpc).toBeNull(); expect(data.portfolio.cvr).toBeNull();
});
it("distinguishes blank placement metadata, genuine reported zeros, and ambiguous duplicate rollups", () => {
  const blank = ad({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, placementMetricsAvailable: false, placementBidAdjustment: 45 });
  expect(placementAnalysis([blank]).portfolio.available).toBe(false);
  expect(placementAnalysis([blank]).byCampaign[0].adjustment).toBe(45);
  const zero = placementAnalysis([{ ...blank, placementMetricsAvailable: true }]);
  expect(zero.portfolio.available).toBe(true); expect(zero.portfolio.acos).toBeNull(); expect(zero.groups[0].spendShare).toBeNull();
  expect(placementAnalysis([ad(), ad({ placement: "Top of Search (first page)" })]).portfolio.available).toBe(false);
});
it("imports explicit placement availability and bid adjustments while preserving v1 compatibility", () => {
  const rows = parseAuditAds([{ name: "SP", rows: [["Entity", "Campaign Name", "Placement", "Percentage", "Spend", "Sales", "Orders", "Clicks", "Impressions"], ["Bidding Adjustment", "Main", "Placement Top", "45%", "", "", "", "", ""], ["Bidding Adjustment", "Main", "Placement Product Page", "0", "0", "0", "0", "0", "0"]] }]);
  expect(rows[0]).toMatchObject({ placementMetricsAvailable: false, placementBidAdjustment: 45 });
  expect(rows[1]).toMatchObject({ placementMetricsAvailable: true, placementBidAdjustment: 0 });
  const saved = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-16", files: ["ppc.csv", "business.csv"], ads: rows, business: [] };
  expect(parseSavedAudit(JSON.stringify(saved))).not.toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], placementMetricsAvailable: "yes" }] }))).toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], placementBidAdjustment: -1 }] }))).toBeNull();
});
