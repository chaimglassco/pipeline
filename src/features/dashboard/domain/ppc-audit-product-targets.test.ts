import { expect, it } from "vitest";
import { parseAuditAds, parseSavedAudit, type AuditAd } from "./ppc-audit";
import { productTargetAnalysis, productTargetType } from "./ppc-audit-product-targets";

const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "producttargeting", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", targetId: "t1", asin: "B012345678", sku: "ROUND", target: 'asin="B012345679"', query: "", match: "", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });

it("recognizes explicit ASIN/category expressions and excludes keywords, negatives and automatic targets", () => {
  expect(productTargetType(ad())).toBe("ASIN Target");
  expect(productTargetType(ad({ target: 'category="123" priceLessThan="20"' }))).toBe("Category Target");
  expect(productTargetType(ad({ target: "B012345679" }))).toBe("ASIN Target");
  for (const row of [ad({ entity: "negativeproducttargeting" }), ad({ entity: "keyword" }), ad({ entity: "campaign" }), ad({ target: "close-match" }), ad({ target: 'asin="INVALID"' }), ad({ target: 'category="123abc"' })]) expect(productTargetType(row)).toBeNull();
});
it("keeps parent, query, placement and campaign totals separate and uses weighted ratios", () => {
  const data = productTargetAnalysis([ad(), ad({ targetId: "t2", target: 'category="123"', spend: 60, sales: 100, orders: 2 }), ad({ entity: "searchterm", query: "glass supplies", spend: 20, sales: 0, orders: 0 }), ad({ placement: "Top of Search", spend: 10, sales: 100, orders: 2 }), ad({ entity: "campaign", target: "", targetId: undefined, spend: 900 })]);
  expect(data.rows).toHaveLength(2); expect(data.portfolio.totals).toMatchObject({ spend: 100, sales: 300, orders: 10 });
  expect(data.portfolio.acos).toBeCloseTo(100 / 3); expect(data.portfolio.cvr).toBe(12.5);
  expect(data.rows.find(r => r.row.targetId === "t1")).toMatchObject({ waste: 20, bid: 1.25, source: "Product target report" });
  expect(data.matches.map(g => g.count)).toEqual([1, 1]);
  const scoped = productTargetAnalysis([ad(), ad({ placement: "Top of Search", spend: 10, sales: 100 })], { placement: "Top of Search" });
  expect(scoped.portfolio.totals.spend).toBe(10);
});
it("preserves contextual target identities and refuses ambiguous or conflicting joins", () => {
  const parents = [ad(), ad({ targetId: "t2" }), ad({ campaignId: "2" }), ad({ adGroupId: "g2", adGroup: "Other" }), ad({ asin: "B012345670" }), ad({ type: "SB" })];
  const data = productTargetAnalysis([...parents, ad({ entity: "searchterm", targetId: undefined, query: "ambiguous", asin: "" }), ad({ entity: "searchterm", query: "exact ID", targetId: "t2" }), ad({ entity: "placement", placement: "Top of Search", target: "", targetId: undefined }), ad({ placement: "Product Pages", target: 'asin="B012345671"' })]);
  expect(data.rows).toHaveLength(6); expect(data.rows.flatMap(r => r.queries).map(q => q.query)).toEqual(["exact ID"]);
  expect(data.rows.flatMap(r => r.placements)).toHaveLength(0); expect(data.unlinkedQueries).toBe(1);
  const category = productTargetAnalysis([ad({ target: 'category="123" brand="one"' }), ad({ targetId: "t2", target: 'category="123" brand="two"' })]);
  expect(category.rows).toHaveLength(2);
});
it("requires explicit target placements, supports placement-only evidence, and keeps blanks distinct from zero", () => {
  const only = productTargetAnalysis([ad({ placement: "Product Pages" })]);
  expect(only.rows[0].available).toBe(false); expect(only.rows[0].placements[0].available).toBe(true);
  const zero = ad({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, bid: 0 });
  expect(productTargetAnalysis([zero]).rows[0]).toMatchObject({ available: true, bid: 0, cpc: null, acos: null });
  expect(productTargetAnalysis([{ ...zero, targetMetricsAvailable: false, bidAvailable: false }]).rows[0]).toMatchObject({ available: false, bid: null });
  const duplicate = productTargetAnalysis([ad(), ad()]); expect(duplicate.rows[0].available).toBe(false);
});
it("uses query fallback only with explicit target context and rejects inconsistent waste evidence", () => {
  const fallback = productTargetAnalysis([ad({ entity: "searchterm", query: "supplies" })]);
  expect(fallback.rows[0].source).toBe("Search-term evidence"); expect(fallback.portfolio.totals.spend).toBe(40);
  const data = productTargetAnalysis([ad(), ad({ entity: "searchterm", query: "mismatch", spend: 200, sales: 0, orders: 0 })]);
  expect(data.rows[0].queryMismatch).toBe(true); expect(data.rows[0].waste).toBe(0);
});
it("keeps the high-CPC baseline stable before signal filtering", () => {
  const ads = [ad({ spend: 20, clicks: 40 }), ad({ targetId: "t2", spend: 80, clicks: 20 })];
  const filtered = productTargetAnalysis(ads, { status: "High CPC" });
  expect(filtered.averageCpc).toBeCloseTo(100 / 60); expect(filtered.rows).toHaveLength(1); expect(filtered.rows[0].row.targetId).toBe("t2");
});
it("does not add aggregate target copies to their reported ASIN breakdowns", () => {
  const data = productTargetAnalysis([ad({ asin: "", sku: "", spend: 100 }), ad({ spend: 60 }), ad({ asin: "B012345670", spend: 40 })]);
  expect(data.rows).toHaveLength(2); expect(data.portfolio.totals.spend).toBe(100); expect(data.aggregateCopies).toBe(1);
});
it("imports Targeting ID without confusing it with Keyword ID and validates optional saved IDs", () => {
  const ads = parseAuditAds([{ name: "SP", rows: [["Entity", "Campaign Name", "Ad Group Name", "Product Targeting Expression", "Targeting ID", "Spend", "Sales", "Orders", "Clicks", "Impressions"], ["Product Targeting", "Main", "Core", 'asin="B012345679"', "t42", "0", "0", "0", "0", "0"]] }]);
  expect(ads[0].targetId).toBe("t42"); expect(ads[0].keywordId).toBeUndefined();
  const saved = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-21", files: ["ppc.csv", "business.csv"], ads, business: [] };
  expect(parseSavedAudit(JSON.stringify(saved))).not.toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...ads[0], targetId: 42 }] }))).toBeNull();
  delete ads[0].targetId; expect(parseSavedAudit(JSON.stringify(saved))).not.toBeNull();
});
