import { expect, it } from "vitest";
import { type AuditAd } from "./ppc-audit";
import { auditMatchType, matchTypeAnalysis } from "./ppc-audit-match-types";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "", match: "Exact", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });
it("classifies only manual matches and explicit automatic targeting", () => {
  expect(auditMatchType(ad())).toBe("Exact"); expect(auditMatchType(ad({ match: "phrase" }))).toBe("Phrase");
  expect(auditMatchType(ad({ match: "", entity: "producttargeting", target: "close-match" }))).toBe("Auto");
  for (const row of [ad({ entity: "negativekeyword" }), ad({ target: 'asin="B012345679"' }), ad({ target: 'category="123"' }), ad({ match: "OTHER" })]) expect(auditMatchType(row)).toBeNull();
});
it("does not add target totals, query detail, placements or campaign totals together", () => {
  const ads = [ad(), ad({ query: "lead cutter", entity: "searchterm", spend: 10, sales: 50, orders: 2 }), ad({ placement: "Top of Search", spend: 15, sales: 80 }), ad({ entity: "campaign", target: "", spend: 900 }), ad({ entity: "producttargeting", keywordId: undefined, targetId: "a1", target: "close-match", match: "", spend: 60, sales: 300 })];
  const d = matchTypeAnalysis(ads); expect(d.portfolio.totals).toMatchObject({ spend: 100, sales: 500 }); expect(d.portfolio.queries).toHaveLength(1); expect(d.portfolio.acos).toBe(20);
  expect(d.groups.find(g => g.name === "Auto")?.totals.spend).toBe(60); expect(d.placements[0].totals.spend).toBe(15);
  expect(d.campaigns.reduce((sum, c) => sum + c.totals.spend, 0)).toBe(100);
});
it("falls back to non-overlapping query evidence, preserving contextual identities", () => {
  const q = ad({ query: "lead cutter", entity: "searchterm", match: "Broad" });
  const d = matchTypeAnalysis([q, { ...q, query: "glass tool", spend: 20 }, { ...q, asin: "B012345679", spend: 10 }]);
  expect(d.portfolio.totals.spend).toBe(70); expect(d.portfolio.targets).toHaveLength(2); expect(d.asins).toHaveLength(2);
  expect(d.portfolio.targets[0].source).toBe("Search-term evidence");
});
it("preserves missing, zero and duplicate evidence distinctions", () => {
  expect(matchTypeAnalysis([ad({ targetMetricsAvailable: false })]).portfolio.available).toBe(false);
  expect(matchTypeAnalysis([ad(), ad()]).portfolio.available).toBe(false);
  expect(matchTypeAnalysis([ad({ spend: 0, sales: 0, clicks: 0, orders: 0, impressions: 0 })]).portfolio.available).toBe(true);
  expect(matchTypeAnalysis([ad({ placement: "Product Pages" })]).portfolio.available).toBe(false);
  expect(matchTypeAnalysis([ad({ placement: "Product Pages" })], { placement: "Product Pages" }).portfolio.totals.spend).toBe(40);
});
it("requires explicit match-level placement data and refuses conflicting detail", () => {
  const d = matchTypeAnalysis([ad(), ad({ query: "wrong", target: "conflict", spend: 900 }), ad({ query: "real", spend: 10 }), ad({ entity: "placement", placement: "Product Pages", target: "", keywordId: undefined })]);
  expect(d.portfolio.totals.spend).toBe(40); expect(d.unlinked).toBe(1); expect(d.placements).toHaveLength(0);
  expect(matchTypeAnalysis([ad()], { placement: "Top of Search" }).portfolio.available).toBe(false);
});
it("scopes ASINs, campaigns, matches, status and target search consistently", () => {
  const ads = [ad(), ad({ match: "Broad", keywordId: "k2", asin: "B012345679", spend: 60, sales: 80 }), ad({ campaignId: "2", keywordId: "k3", match: "Phrase" })];
  expect(matchTypeAnalysis(ads, { match: "Broad" }).portfolio.totals.spend).toBe(60);
  expect(matchTypeAnalysis(ads, { asin: "B012345678" }).portfolio.totals.spend).toBe(80);
  expect(matchTypeAnalysis(ads, { campaign: JSON.stringify(["SP", "2"]) }).portfolio.totals.spend).toBe(40);
  expect(matchTypeAnalysis(ads, { status: "Needs Review" }).groups.map(g => g.name)).toEqual(["Broad"]);
  expect(matchTypeAnalysis(ads, { search: "B012345679" }).portfolio.totals.spend).toBe(60);
});
it("suppresses aggregate copies and counts waste once despite overlapping query flags", () => {
  const bad = ad({ query: "irrelevant query", entity: "searchterm", sales: 0, orders: 0, spend: 20, match: "Broad" });
  const d = matchTypeAnalysis([ad({ match: "Broad", spend: 50 }), bad, ad({ match: "Broad", asin: "", sku: "", spend: 50 })]);
  expect(d.portfolio.totals.spend).toBe(50); expect(d.portfolio.waste).toBe(20); expect(d.portfolio.issues).toBe(1);
  expect(matchTypeAnalysis([bad], {}, { minClicks: 100, minSpend: 15, acos: 40, cvr: 5, cpc: 2.5 }).portfolio.waste).toBe(0);
});
it("uses query-level harvest coverage and unique issue counts", () => {
  const q = ad({ query: "lead cutter", entity: "searchterm", match: "Phrase", orders: 3, spend: 10, sales: 100 });
  expect(matchTypeAnalysis([q]).groups.find(g => g.name === "Phrase")?.signals.find(s => s.name === "Exact Harvest")?.count).toBe(1);
  expect(matchTypeAnalysis([q, ad({ target: "lead cutter", keywordId: "k2" })]).portfolio.signals.find(s => s.name === "Exact Harvest")?.count).toBe(0);
});
