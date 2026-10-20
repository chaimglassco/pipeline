import { describe, expect, it } from "vitest";
import { type AuditAd } from "./ppc-audit";
import { auditOpportunities, DEFAULT_WASTE_RULES, readWasteReview, validWasteRules, wasteFindings } from "./ppc-audit-waste";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Group", asin: "B012345678", sku: "ROUND", target: "glass", query: "", match: "Broad", placement: "", strategy: "", state: "enabled", bid: 1, spend: 30, sales: 0, orders: 0, clicks: 20, impressions: 1000, ...changes });
describe("uploaded audit waste rules", () => {
  it("counts an overlapping rule match once and uses queries instead of parent targets", () => {
    const keyword = ad({ spend: 100 });
    const query = ad({ entity: "searchterm", query: "glass supplies", target: "", spend: 60 });
    const rows = wasteFindings([ad({ entity: "campaign", target: "", spend: 100 }), keyword, query], DEFAULT_WASTE_RULES);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "Search Terms", severity: "Critical", reason: "Spend With No Orders", row: { spend: 60 } });
    expect(rows[0].reasons).toEqual(["Spend With No Orders", "Low CVR", "High CPC"]);
  });
  it("keeps separate campaign coverage and only falls back to campaign rows when no targets exist", () => {
    const rows = wasteFindings([ad(), ad({ entity: "campaign", target: "", campaignId: "2", spend: 50 })], DEFAULT_WASTE_RULES);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, r) => sum + r.row.spend, 0)).toBe(80);
  });
  it("applies minimum samples, strict ratio cutoffs, and real zero denominators", () => {
    expect(wasteFindings([ad({ spend: 14 }), ad({ clicks: 9 })], DEFAULT_WASTE_RULES)).toHaveLength(0);
    expect(wasteFindings([ad({ spend: 40, sales: 100, orders: 2, clicks: 20 })], DEFAULT_WASTE_RULES)).toHaveLength(0);
    expect(wasteFindings([ad({ spend: 41, sales: 100, orders: 2, clicks: 20 })], DEFAULT_WASTE_RULES)[0].reason).toBe("High ACOS");
    expect(wasteFindings([ad({ clicks: 0 })], { ...DEFAULT_WASTE_RULES, minClicks: 0 })[0].reasons).toEqual(["Spend With No Orders"]);
  });
  it("validates local review state and isolates new audits", () => {
    const text = JSON.stringify({ version: 1, auditId: "a", rules: DEFAULT_WASTE_RULES, statuses: { item: "Reviewed" } });
    expect(readWasteReview(text, "a")?.statuses.item).toBe("Reviewed");
    expect(readWasteReview(text, "b")).toBeNull();
    expect(readWasteReview(text.replace("Reviewed", "execute"), "a")).toBeNull();
    expect(validWasteRules({ ...DEFAULT_WASTE_RULES, cvr: 101 })).toBe(false);
    expect(validWasteRules({ ...DEFAULT_WASTE_RULES, minClicks: 0.5 })).toBe(false);
  });
  it("normalizes converting queries and checks exact coverage per ASIN across the complete upload", () => {
    const ads = [ad({ query: " Glass   Supplies ", sales: 50, orders: 2 }), ad({ query: "glass supplies", campaignId: "2", sales: 20, orders: 1 }), ad({ target: "glass supplies", match: "Phrase" }), ad({ target: "glass supplies", match: "Exact", asin: "B012345679" })];
    expect(auditOpportunities(ads)[0]).toMatchObject({ name: "glass supplies", sales: 70, orders: 3 });
    expect(auditOpportunities([...ads, ad({ target: "GLASS SUPPLIES", match: "Exact" })])).toHaveLength(0);
    expect(auditOpportunities([ad({ query: "glass", orders: 0 })])).toHaveLength(0);
  });
});
