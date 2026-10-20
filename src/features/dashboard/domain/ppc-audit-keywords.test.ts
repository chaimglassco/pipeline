import { expect, it } from "vitest";
import { parseAuditAds, parseSavedAudit, type AuditAd } from "./ppc-audit";
import { keywordAnalysis } from "./ppc-audit-keywords";
import { DEFAULT_WASTE_RULES } from "./ppc-audit-waste";

const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead came", query: "", match: "Exact", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });

it("keeps parent keyword totals separate from queries, placement and campaign dimensions", () => {
  const data = keywordAnalysis([ad(), ad({ entity: "searchterm", query: "lead supplies", spend: 20, sales: 180, orders: 7 }), ad({ entity: "searchterm", query: "generic glass", spend: 20, sales: 0, orders: 0 }), ad({ placement: "Top of Search", spend: 10, sales: 100 }), ad({ entity: "campaign", target: "", spend: 100 }), ad({ entity: "producttargeting", target: 'asin="B012345679"' }), ad({ entity: "negativekeyword" })]);
  expect(data.rows).toHaveLength(1); expect(data.portfolio.totals.spend).toBe(40); expect(data.portfolio.totals.sales).toBe(200);
  expect(data.rows[0].searchTerms).toHaveLength(2); expect(data.rows[0].placements[0].totals.spend).toBe(10);
  expect(data.rows[0].waste).toBe(20); expect(data.rows[0].bid).toBe(1.25);
  expect(data.matches.filter(m => m.count).map(m => m.name)).toEqual(["Exact"]);
});
it("does not merge equal text across keyword IDs, campaigns, match types, groups, types or ASINs", () => {
  const rows = [ad(), ad({ keywordId: "k2" }), ad({ campaignId: "2" }), ad({ adGroupId: "g2", adGroup: "Other" }), ad({ match: "Phrase" }), ad({ type: "SB" }), ad({ asin: "B012345679" })];
  expect(keywordAnalysis(rows).rows).toHaveLength(7);
  const data = keywordAnalysis([...rows, ad({ entity: "searchterm", query: "unique ID query", spend: 10, keywordId: "k2" }), ad({ entity: "searchterm", query: "ambiguous ID query", keywordId: undefined, asin: "" })]);
  expect(data.rows.find(r => r.row.keywordId === "k2")?.searchTerms[0].row.query).toBe("unique ID query");
  expect(data.rows.flatMap(r => r.searchTerms).some(q => q.row.query === "ambiguous ID query")).toBe(false);
  expect(data.unlinkedQueries).toBe(1);
});
it("uses explicit query evidence as a labeled fallback without joining unannotated search terms", () => {
  const data = keywordAnalysis([ad({ entity: "searchterm", query: "lead supplies", spend: 10 }), ad({ entity: "searchterm", query: "unannotated", keywordId: undefined, target: "", adGroup: "", adGroupId: undefined })]);
  expect(data.rows).toHaveLength(1); expect(data.rows[0].source).toBe("Search-term evidence"); expect(data.portfolio.totals.spend).toBe(10);
  expect(data.rows[0].bid).toBeNull(); expect(data.unlinkedQueries).toBe(1);
});
it("does not borrow campaign placements and respects reported ASIN and match scopes", () => {
  const rows = [ad(), ad({ entity: "placement", target: "", keywordId: undefined, placement: "Top of Search" }), ad({ entity: "searchterm", query: "wrong product", asin: "B012345679" })];
  expect(keywordAnalysis(rows).rows[0].placements).toHaveLength(0);
  expect(keywordAnalysis(rows, { placement: "Top of Search" }).rows).toHaveLength(0);
  expect(keywordAnalysis(rows, { asin: "B012345679" }).rows).toHaveLength(0);
  expect(keywordAnalysis(rows, { match: "Phrase" }).rows).toHaveLength(0);
});
it("distinguishes blank metrics from real zero and handles zero-click custom rules", () => {
  const blank = ad({ targetMetricsAvailable: false, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, bidAvailable: false, bid: 0 });
  expect(keywordAnalysis([blank]).rows[0]).toMatchObject({ available: false, bid: null, status: "Performance Unavailable" });
  const zero = keywordAnalysis([{ ...blank, targetMetricsAvailable: true, bidAvailable: true }]).rows[0];
  expect(zero.available).toBe(true); expect(zero.bid).toBe(0); expect(zero.acos).toBeNull();
  expect(keywordAnalysis([ad({ match: "" })], { match: "Not supplied" }).rows).toHaveLength(1);
  const noClicks = keywordAnalysis([ad({ spend: 20, sales: 100, orders: 1, clicks: 0 })], {}, { ...DEFAULT_WASTE_RULES, minClicks: 0 });
  expect(noClicks.rows[0].signals).not.toContain("High CPC"); expect(noClicks.portfolio.waste).toBe(0);
});
it("checks exact coverage from the full upload before ASIN and campaign filters", () => {
  const rows = [ad({ match: "Broad" }), ad({ entity: "searchterm", match: "Broad", query: "glass supplies", spend: 10, sales: 200, orders: 3 }), ad({ campaignId: "2", target: "glass supplies" })];
  const data = keywordAnalysis(rows, { campaign: JSON.stringify(["SP", "1"]) });
  expect(data.rows[0].searchTerms[0].harvest).toBe(false);
});
it("uses weighted CPC before status filtering and normalizes match summary names", () => {
  const rows = [ad({ match: "EXACT" }), ad({ keywordId: "k2", target: "other", spend: 60, sales: 300, clicks: 20 })];
  const data = keywordAnalysis(rows, { status: "High CPC" });
  expect(data.averageCpc).toBeCloseTo(100 / 60);
  expect(data.rows).toHaveLength(1); expect(data.rows[0].row.keywordId).toBe("k2");
  expect(keywordAnalysis(rows).matches.filter(m => m.count)).toHaveLength(1);
});
it("imports optional IDs and availability, validates saved data, and retains legacy audits", () => {
  const rows = parseAuditAds([{ name: "SP", rows: [["Entity", "Campaign Name", "Ad Group Name", "Ad Group ID", "Keyword ID", "Keyword Text", "Match Type", "Bid", "Spend", "Sales", "Orders", "Clicks", "Impressions"], ["Keyword", "Main", "Core", "g1", "k1", "glass", "Exact", "0", "0", "0", "0", "0", "0"]] }]);
  expect(rows[0]).toMatchObject({ keywordId: "k1", adGroupId: "g1", targetMetricsAvailable: true, bidAvailable: true });
  const saved = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-20", files: ["ppc.csv", "business.csv"], ads: rows, business: [] };
  expect(parseSavedAudit(JSON.stringify(saved))).not.toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], keywordId: 42 }] }))).toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], bidAvailable: "yes" }] }))).toBeNull();
  const old = { ...rows[0] }; delete old.keywordId; delete old.adGroupId; delete old.targetMetricsAvailable; delete old.bidAvailable;
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [old] }))).not.toBeNull();
});
