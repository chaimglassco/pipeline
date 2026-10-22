import { expect, it } from "vitest";
import type { AuditAd } from "./ppc-audit";
import { EMPTY_BRAND_CONFIG, brandTermAnalysis, brandTermList, classifyBrandQuery, readBrandConfig, type BrandConfig } from "./ppc-audit-brand-terms";
const config: BrandConfig = { version: 1, primary: "Glassco", terms: ["Glassco Tools"], exclusions: ["glassco cleaner"], updatedAt: "2026-10-22T00:00:00Z" };
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "searchterm", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "glassco lead knife", match: "Phrase", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 300, orders: 8, clicks: 40, impressions: 1000, ...v });
it("classifies actual query text using normalized contains rules and exclusion priority", () => {
  expect(classifyBrandQuery("GLASSCO   tools knife", config)).toMatchObject({ classification: "Brand", matched: "Glassco" });
  expect(classifyBrandQuery("glassco cleaner kit", config)).toMatchObject({ classification: "Non-Brand", excluded: "glassco cleaner", matched: "" });
  expect(classifyBrandQuery("lead knife", config).classification).toBe("Non-Brand");
  expect(classifyBrandQuery("glassco", EMPTY_BRAND_CONFIG).classification).toBe("Unclassified");
  expect(brandTermList("Glassco, glassco\nGlassco Tools\n")).toEqual(["glassco", "Glassco Tools"]);
});
it("validates versioned configuration without accepting malformed storage", () => {
  expect(readBrandConfig(JSON.stringify(config))).toEqual(config);
  for (const bad of [null, "{", JSON.stringify({ ...config, version: 2 }), JSON.stringify({ ...config, terms: [null] }), JSON.stringify({ ...config, primary: "x".repeat(201) }), JSON.stringify({ ...config, updatedAt: "not-a-date" }), JSON.stringify({ ...config, exclusions: Array(101).fill("x") })]) expect(readBrandConfig(bad)).toBeNull();
});
it("sums only measured queries and keeps source, campaign and placement totals separate", () => {
  const ads = [ad(), ad({ query: "lead cutter", spend: 60, sales: 100, orders: 2, clicks: 20 }), ad({ query: "", entity: "keyword", spend: 500, sales: 5000 }), ad({ query: "", target: "", entity: "campaign", spend: 900 }), ad({ placement: "Top of Search", spend: 10, sales: 100, orders: 2 })];
  const d = brandTermAnalysis(ads, config); expect(d.portfolio.totals).toMatchObject({ spend: 100, sales: 400, orders: 10 }); expect(d.portfolio.acos).toBe(25);
  expect(d.groups[0].totals.spend).toBe(40); expect(d.groups[1].totals.spend).toBe(60); expect(d.groups[0].salesShare).toBe(75); expect(d.asins[0].dependency).toBe("High Brand Pull");
  expect(d.placements[0].totals.spend).toBe(10); expect(d.placements[0].brand.totals.sales).toBe(100);
});
it("does not guess ownership or dependency before configuration or with missing metrics", () => {
  const d = brandTermAnalysis([ad()], EMPTY_BRAND_CONFIG); expect(d.unclassified).toBe(1); expect(d.groups.every(g => !g.available)).toBe(true); expect(d.asins[0].brandShare).toBeNull();
  const partial = brandTermAnalysis([ad(), ad({ query: "other", targetMetricsAvailable: false })], config); expect(partial.asins[0].brandShare).toBeNull(); expect(partial.portfolio.missing).toBe(1);
});
it("uses consistent classification, type, ASIN, query and placement scopes", () => {
  const ads = [ad(), ad({ query: "generic", type: "Sponsored Brands", asin: "B012345679", spend: 60 }), ad({ placement: "Top of Search", spend: 10 })];
  expect(brandTermAnalysis(ads, config, { classification: "Non-Brand" }).portfolio.totals.spend).toBe(60);
  expect(brandTermAnalysis(ads, config, { type: "SB" }).rows).toHaveLength(1);
  expect(brandTermAnalysis(ads, config, { asin: "B012345678", search: "GLASSCO", minSpend: 30 }).portfolio.totals.spend).toBe(40);
  expect(brandTermAnalysis(ads, config, { placement: "Top of Search" }).portfolio.totals.spend).toBe(10);
});
it("counts overlapping waste flags once and preserves exact-coverage signals", () => {
  const bad = ad({ query: "generic", spend: 50, sales: 0, orders: 0, clicks: 20 });
  const d = brandTermAnalysis([bad], config); expect(d.portfolio.waste).toBe(50); expect(d.groups[1].waste).toBe(50);
  expect(brandTermAnalysis([bad], config, {}, { minClicks: 100, minSpend: 15, acos: 40, cvr: 5, cpc: 2.5 }).portfolio.waste).toBe(0);
  expect(brandTermAnalysis([ad({ query: "generic" })], config).rows[0].signals).toContain("Exact Harvest");
});
