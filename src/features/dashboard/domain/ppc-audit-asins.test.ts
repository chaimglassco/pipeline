import { expect, it } from "vitest";
import { type AuditAd } from "./ppc-audit";
import { advertisedAsinRows, advertisedEvidence } from "./ppc-audit-asins";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "productad", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Group", asin: "B012345678", sku: "ROUND", target: "", query: "", match: "", placement: "", strategy: "", state: "enabled", bid: 1, spend: 20, sales: 100, orders: 4, clicks: 20, impressions: 1000, ...changes });
const business = [{ asin: "B012345678", sales: 500, orders: 20, units: 22, sessions: 100 }];
it("uses product performance without adding repeated campaign, keyword, and query metrics", () => {
  const product = ad(), campaign = ad({ entity: "campaign", asin: "" }), keyword = ad({ entity: "keyword", target: "glass", match: "Exact" }), query = ad({ entity: "searchterm", query: "glass", match: "Exact" });
  expect(advertisedEvidence([campaign, product, keyword, query])).toEqual([product]);
  const [r] = advertisedAsinRows([campaign, product, keyword, query], business);
  expect(r).toMatchObject({ asin: product.asin, totals: { spend: 20, sales: 100 }, organicSales: 400, organicOrders: 16, acos: 20, tacos: 4, bestCampaign: "Main · SP", bestMatch: "Exact", status: "Healthy" });
  expect(r.targets).toEqual([query]);
});
it("retains distinct ASINs in a shared campaign and does not allocate an ambiguous query", () => {
  const rows = advertisedAsinRows([ad(), ad({ asin: "B012345679", spend: 30 }), ad({ entity: "searchterm", asin: "", query: "unknown product", spend: 15 })], business);
  expect(rows.reduce((n, r) => n + (r.totals?.spend || 0), 0)).toBe(50);
  expect(rows.find(r => r.asin === "Unmapped")).toMatchObject({ totals: null, status: "ASIN Mapping Needed" });
  expect(rows.find(r => r.asin === "B012345679")?.organicSales).toBeNull();
});
it("uses target-level metrics for match filters and suppresses mixed-scope organic values and TACOS", () => {
  const rows = [ad(), ad({ entity: "keyword", target: "glass", match: "Exact", spend: 10, sales: 50 })];
  const [r] = advertisedAsinRows(rows, business, { match: "Exact" });
  expect(r.totals?.spend).toBe(10);
  expect(r.organicSales).toBeNull(); expect(r.tacos).toBeNull(); expect(r.ppcShare).toBeNull();
});
it("keeps placement metrics separate and only uses the requested placement as performance when filtered", () => {
  const placement = ad({ entity: "placement", placement: "Top of Search", spend: 5, sales: 40 });
  expect(advertisedAsinRows([ad(), placement], business)[0]).toMatchObject({ totals: { spend: 20 }, bestPlacement: "Top of Search" });
  expect(advertisedAsinRows([ad(), placement], business, { placement: "Top of Search" })[0].totals?.spend).toBe(5);
});
it("preserves genuine zeros and leaves inconsistent or missing business values unavailable", () => {
  const [zero] = advertisedAsinRows([ad({ spend: 0, sales: 0, orders: 0, clicks: 0 })], business);
  expect(zero.totals?.spend).toBe(0); expect(zero.acos).toBeNull(); expect(zero.cpc).toBeNull(); expect(zero.organicSales).toBe(500);
  const [bad] = advertisedAsinRows([ad({ sales: 600 })], business);
  expect(bad.organicSales).toBeNull(); expect(bad.status).toBe("Check Report Scope");
});
it("retains placement-only evidence without inventing full product totals and excludes negative rules", () => {
  const [row] = advertisedAsinRows([ad({ entity: "placement", placement: "Top of Search" }), ad({ entity: "negativekeyword", target: "irrelevant" })], business);
  expect(row.totals).toBeNull(); expect(row.placements).toHaveLength(1); expect(row.targets).toHaveLength(0);
  expect(row.status).toBe("Performance Unavailable");
});
