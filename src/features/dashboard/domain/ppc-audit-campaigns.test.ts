import { expect, it } from "vitest";
import { type AuditAd, parseAuditAds, parseSavedAudit } from "./ppc-audit";
import { campaignPerformance } from "./ppc-audit-campaigns";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "campaign", type: "SP", campaign: "Main", campaignId: "1", adGroup: "", asin: "", sku: "", target: "", query: "", match: "", placement: "", strategy: "Dynamic down", state: "enabled", bid: 1, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...changes });
it("keeps campaign parents without adding repeated children or placement dimensions", () => {
  const rows = [ad({ dailyBudget: 50 }), ad({ entity: "productad", asin: "B012345678", adGroup: "Main" }), ad({ entity: "keyword", asin: "B012345678", adGroup: "Main", target: "glass", match: "Exact" }), ad({ entity: "placement", asin: "B012345678", placement: "Top of Search", spend: 10, sales: 100 })];
  const [r] = campaignPerformance(rows);
  expect(r).toMatchObject({ totals: { spend: 40, sales: 200 }, dailyBudget: 50, state: "Enabled", strategy: "Dynamic down", bestPlacement: "Top of Search", scaling: true });
  expect(r.placements[0].sales).toBe(100); expect(r.adGroups[0].sales).toBe(200);
});
it("isolates selected ASIN metrics within a shared campaign", () => {
  const rows = [ad(), ad({ entity: "productad", asin: "B012345678", spend: 15, sales: 80 }), ad({ entity: "productad", asin: "B012345679", spend: 25, sales: 120 })];
  expect(campaignPerformance(rows, { asins: ["B012345678"] })[0].totals?.spend).toBe(15);
  expect(campaignPerformance(rows, { asins: ["B012345679"] })[0].totals?.sales).toBe(120);
  const unmapped = ad({ entity: "keyword", campaignId: "2", target: "unknown product" });
  expect(campaignPerformance([...rows, unmapped], { asins: ["Unmapped"] }).map(r => r.raw[0].campaignId)).toEqual(["2"]);
});
it("does not merge equal campaign names with different IDs or advertising types", () => {
  expect(campaignPerformance([ad(), ad({ campaignId: "2" }), ad({ type: "SB" })])).toHaveLength(3);
});
it("never infers campaign state from an enabled target and never picks a conflicting budget", () => {
  const [unknown] = campaignPerformance([ad({ entity: "keyword", target: "glass", state: "enabled" })]);
  expect(unknown.state).toBe("Not supplied"); expect(unknown.dailyBudget).toBeNull();
  const [conflict] = campaignPerformance([ad({ dailyBudget: 50 }), ad({ entity: "productad", dailyBudget: 60 })]);
  expect(conflict.dailyBudget).toBeNull(); expect(conflict.budgetConflict).toBe(true);
});
it("uses configured waste rules once per source row, handles zeros, and respects campaign state filters", () => {
  const rows = [ad({ state: "paused" }), ad({ entity: "keyword", target: "glass", spend: 30, orders: 0, sales: 0, clicks: 20 })];
  expect(campaignPerformance(rows)[0]).toMatchObject({ waste: 30, scaling: false, state: "Paused" });
  expect(campaignPerformance(rows, { state: "Enabled" })).toHaveLength(0);
  const [zero] = campaignPerformance([ad({ spend: 0, sales: 0, orders: 0, clicks: 0 })]);
  expect(zero.acos).toBeNull(); expect(zero.cpc).toBeNull(); expect(zero.totals?.spend).toBe(0);
});
it("imports only explicit daily budgets and validates optional metadata without breaking old saved audits", () => {
  const sheets = [{ name: "SP", rows: [["Entity", "Campaign Name", "Campaign Daily Budget", "State", "Spend", "Sales", "Orders", "Clicks", "Impressions"], ["Campaign", "Main", "0", "paused", "10", "100", "3", "10", "1000"]] }];
  const rows = parseAuditAds(sheets);
  expect(rows[0]).toMatchObject({ dailyBudget: 0, campaignState: "paused" });
  const saved = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-16", files: ["ppc.csv", "business.csv"], ads: rows, business: [] };
  expect(parseSavedAudit(JSON.stringify(saved))).not.toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], dailyBudget: -1 }] }))).toBeNull();
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [{ ...rows[0], campaignState: 42 }] }))).toBeNull();
  const old = { ...rows[0] }; delete old.dailyBudget; delete old.campaignState;
  expect(parseSavedAudit(JSON.stringify({ ...saved, ads: [old] }))).not.toBeNull();
  sheets[0].rows[0][2] = "Lifetime Budget";
  expect(parseAuditAds(sheets)[0].dailyBudget).toBeUndefined();
});
