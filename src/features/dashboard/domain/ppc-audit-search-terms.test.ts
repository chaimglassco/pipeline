import { expect, it } from "vitest";
import { parseAuditAds, type AuditAd } from "./ppc-audit";
import { searchTermAnalysis } from "./ppc-audit-search-terms";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "searchterm", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "lead came cutter", match: "Phrase", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 300, orders: 8, clicks: 40, impressions: 1000, ...v });
it("uses query metrics without adding source, campaign or placement totals", () => {
  const data = searchTermAnalysis([ad(), ad({ query: "", entity: "keyword", spend: 100, sales: 800 }), ad({ query: "", target: "", entity: "campaign", spend: 900 }), ad({ placement: "Top of Search", spend: 10, sales: 100, orders: 2 })]);
  expect(data.rows).toHaveLength(1); expect(data.portfolio.totals.spend).toBe(40);
  expect(data.rows[0].parent?.totals.spend).toBe(100); expect(data.rows[0].bid).toBe(1.25);
  expect(data.rows[0].placements[0].totals.spend).toBe(10);
  expect(searchTermAnalysis([ad(), ad({ placement: "Top of Search", spend: 10 })], { placement: "Top of Search" }).portfolio.totals.spend).toBe(10);
});
it("keeps ASIN, target, campaign, ad group and match identities separate", () => {
  const data = searchTermAnalysis([ad(), ad({ asin: "B012345679" }), ad({ campaignId: "2" }), ad({ adGroupId: "g2" }), ad({ keywordId: "k2", target: "other" }), ad({ match: "Broad" })]);
  expect(data.rows).toHaveLength(6); expect(data.portfolio.totals.spend).toBe(240);
  expect(searchTermAnalysis(data.rows.map(r => r.row), { adGroup: "g2" }).rows).toHaveLength(1);
});
it("requires a unique agreeing source link and never uses query fallback as source totals", () => {
  const parent = ad({ query: "", entity: "keyword", spend: 100 });
  expect(searchTermAnalysis([ad(), parent, { ...parent }]).rows[0].parent?.available).toBe(false);
  expect(searchTermAnalysis([ad(), { ...parent, target: "conflict" }]).rows[0].parent).toBeNull();
  expect(searchTermAnalysis([ad()]).rows[0].parent).toBeNull();
  expect(searchTermAnalysis([ad(), { ...parent, asin: "B012345679" }]).rows[0].parent).toBeNull();
});
it("does not substitute campaign or target placements for missing query placements", () => {
  const data = searchTermAnalysis([ad(), ad({ query: "", placement: "Product Pages" })]);
  expect(data.rows[0].placements).toHaveLength(0);
  expect(searchTermAnalysis([ad({ placement: "Product Pages" })]).rows[0].available).toBe(false);
});
it("distinguishes blanks and explicit zero and refuses overlapping duplicate evidence", () => {
  expect(searchTermAnalysis([ad(), ad()]).rows[0].available).toBe(false);
  expect(searchTermAnalysis([ad({ targetMetricsAvailable: false })]).rows[0].available).toBe(false);
  const zero = ad({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
  expect(searchTermAnalysis([zero]).rows[0]).toMatchObject({ available: true, acos: null, cpc: null });
  expect(searchTermAnalysis([ad({ asin: "", sku: "" }), ad()]).rows).toHaveLength(1);
});
it("identifies sources, weighted ratios and contextual scopes", () => {
  const ads = [ad(), ad({ query: "second", spend: 60, sales: 100, orders: 2, clicks: 20, target: "close-match", keywordId: undefined, match: "" }), ad({ query: "third", target: 'asin="B012345679"', keywordId: undefined, match: "" })];
  const d = searchTermAnalysis(ads); expect(d.portfolio.acos).toBe(20); expect(d.matches.find(m => m.name === "Auto")?.count).toBe(1);
  expect(searchTermAnalysis(ads, { sourceType: "Product Target" }).rows).toHaveLength(1);
  expect(searchTermAnalysis(ads, { search: "SECOND", minSpend: 50 }).rows).toHaveLength(1);
});
it("checks exact coverage per ASIN, excludes negatives and respects current exact source", () => {
  const exact = ad({ query: "", entity: "keyword", match: "Exact", target: "lead came cutter" });
  expect(searchTermAnalysis([ad()]).rows[0].signals).toContain("Exact Harvest");
  expect(searchTermAnalysis([ad(), exact]).rows[0].signals).not.toContain("Exact Harvest");
  expect(searchTermAnalysis([ad(), { ...exact, asin: "B012345679" }]).rows[0].signals).toContain("Exact Harvest");
  expect(searchTermAnalysis([ad({ match: "Exact" })]).rows[0].signals).not.toContain("Exact Harvest");
  expect(searchTermAnalysis([ad({ asin: "" })]).rows[0].signals).not.toContain("Exact Harvest");
  expect(searchTermAnalysis([ad({ entity: "negativekeyword" })]).rows).toHaveLength(0);
});
it("counts flagged spend once and uses saved evidence thresholds", () => {
  const row = ad({ sales: 0, orders: 0, spend: 100, clicks: 20 });
  const d = searchTermAnalysis([row]); expect(d.rows[0].status).toBe("Negative Candidate"); expect(d.portfolio.waste).toBe(100);
  expect(d.rows[0].signals).toContain("No Orders");
  expect(searchTermAnalysis([row], {}, { minClicks: 100, minSpend: 15, acos: 40, cvr: 5, cpc: 2.5 }).portfolio.waste).toBe(0);
});
it("reads real search-term CSV columns into measured query data", () => {
  const rows = parseAuditAds([{ name: "SP", rows: [["Campaign Name", "Customer Search Term", "Keyword Text", "Match Type", "Advertised ASIN", "Spend", "7 Day Total Sales", "7 Day Total Orders", "Clicks", "Impressions"], ["Main", "lead cutter", "lead knife", "Broad", "B012345678", "42.50", "310", "7", "45", "1000"]] }]);
  expect(searchTermAnalysis(rows).portfolio.totals).toMatchObject({ spend: 42.5, sales: 310, orders: 7 });
});
