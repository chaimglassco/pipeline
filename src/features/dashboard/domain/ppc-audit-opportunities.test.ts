import { describe, expect, it } from "vitest";
import { type AuditAd } from "./ppc-audit";
import { DEFAULT_OPPORTUNITY_RULES, opportunityEvidence, opportunityFindings, placementPerformance, readOpportunityReview, validOpportunityRules } from "./ppc-audit-opportunities";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Group", asin: "B012345678", sku: "ROUND", target: "glass", query: "", match: "Broad", placement: "", strategy: "", state: "enabled", bid: 1, spend: 10, sales: 100, orders: 5, clicks: 20, impressions: 1000, ...changes });
describe("report-driven opportunity diagnostics", () => {
  it("uses one performance level per campaign and keeps placements separate", () => {
    const keyword = ad(), query = ad({ entity: "searchterm", query: "glass supplies", target: "" }), placement = ad({ entity: "placement", target: "", placement: "Top of Search" });
    const ads = [ad({ entity: "campaign", target: "" }), keyword, query, placement];
    expect(opportunityEvidence(ads)).toEqual([query]);
    expect(opportunityFindings(ads, DEFAULT_OPPORTUNITY_RULES)).toHaveLength(1);
    expect(placementPerformance(ads)).toMatchObject([{ name: "Top of Search", sales: 100 }]);
  });
  it("checks normalized full-upload exact coverage for the same ASIN while broad and phrase remain eligible", () => {
    const query = ad({ query: " Glass   Supplies ", target: "", entity: "searchterm" });
    const target = ad({ campaignId: "2", target: "glass supplies", match: "Exact" });
    expect(opportunityFindings([query, target], DEFAULT_OPPORTUNITY_RULES).some(f => f.row.query)).toBe(false);
    expect(opportunityFindings([query, { ...target, asin: "B012345679" }], DEFAULT_OPPORTUNITY_RULES).some(f => f.row.query)).toBe(true);
    expect(opportunityFindings([query, { ...target, match: "Phrase" }], DEFAULT_OPPORTUNITY_RULES).some(f => f.row.query)).toBe(true);
    expect(opportunityFindings([query, target], { ...DEFAULT_OPPORTUNITY_RULES, excludeExact: false }).some(f => f.row.query)).toBe(true);
  });
  it("uses configured minimum orders and preserves genuine zero spend", () => {
    const query = ad({ query: "glass", target: "", entity: "searchterm", orders: 1 });
    expect(opportunityFindings([query], DEFAULT_OPPORTUNITY_RULES)).toHaveLength(0);
    expect(opportunityFindings([query], { ...DEFAULT_OPPORTUNITY_RULES, minOrders: 1 })).toHaveLength(1);
    expect(opportunityFindings([ad({ spend: 0 })], DEFAULT_OPPORTUNITY_RULES)[0].row.spend).toBe(0);
    expect(opportunityFindings([ad({ sales: 0 })], DEFAULT_OPPORTUNITY_RULES)).toHaveLength(0);
  });
  it("can identify campaign and placement evidence without fabricating budget utilization", () => {
    expect(opportunityFindings([ad({ entity: "campaign", target: "" })], DEFAULT_OPPORTUNITY_RULES)[0].reason).toBe("Efficient Campaign");
    expect(opportunityFindings([ad({ entity: "placement", target: "", placement: "Top of Search" })], DEFAULT_OPPORTUNITY_RULES)[0].reason).toBe("Placement Scaling");
    expect(opportunityFindings([ad({ clicks: 0 })], DEFAULT_OPPORTUNITY_RULES)).toHaveLength(0);
  });
  it("validates local state and isolates different imports", () => {
    const text = JSON.stringify({ version: 1, auditId: "a", rules: DEFAULT_OPPORTUNITY_RULES, statuses: { item: "Action Planned" } });
    expect(readOpportunityReview(text, "a")?.statuses.item).toBe("Action Planned");
    expect(readOpportunityReview(text, "b")).toBeNull();
    expect(readOpportunityReview(text.replace("Action Planned", "invalid"), "a")).toBeNull();
    expect(validOpportunityRules({ ...DEFAULT_OPPORTUNITY_RULES, minOrders: 0 })).toBe(false);
    expect(validOpportunityRules({ ...DEFAULT_OPPORTUNITY_RULES, cvr: 101 })).toBe(false);
  });
});
