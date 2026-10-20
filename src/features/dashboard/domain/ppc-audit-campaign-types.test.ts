import { expect, it } from "vitest";
import type { AuditAd } from "./ppc-audit";
import { campaignPerformance } from "./ppc-audit-campaigns";
import { campaignTypeAnalysis, campaignTypeFindings } from "./ppc-audit-campaign-types";

const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "campaign", type: "SP", campaign: "Same name", campaignId: "1", adGroup: "", asin: "", sku: "", target: "", query: "", match: "", placement: "", strategy: "", state: "enabled", bid: 0, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 2000, ...changes });

it("reconciles type totals and weighted rates without repeated entity or placement totals", () => {
  const rows = [ad(), ad({ entity: "productad", asin: "B012345678" }), ad({ entity: "placement", placement: "Top of Search" }), ad({ campaignId: "2", type: "Sponsored Brands", spend: 60, sales: 100, orders: 2, clicks: 60, impressions: 3000 })];
  const { portfolio, groups } = campaignTypeAnalysis(campaignPerformance(rows));
  expect(portfolio.totals).toEqual({ spend: 100, sales: 300, orders: 10, clicks: 100, impressions: 5000 });
  expect(portfolio.cvr).toBe(10); expect(portfolio.cpc).toBe(1); expect(portfolio.ctr).toBe(2);
  expect(groups.find(g => g.type === "SP")).toMatchObject({ spendShare: 40, orderShare: 80 });
  expect(groups.find(g => g.type === "SB")).toMatchObject({ name: "Sponsored Brands", totals: { spend: 60 }, spendShare: 60 });
  expect(groups.find(g => g.type === "SD")?.available).toBe(false);
  expect(groups.reduce((sum, g) => sum + (g.salesShare || 0), 0)).toBeCloseTo(100);
});

it("keeps missing performance distinct from zero and does not allocate parent spend to an ASIN", () => {
  const rows = [ad(), ad({ entity: "productad", asin: "B012345678", spend: 15, sales: 80 }), ad({ entity: "productad", asin: "B012345679", spend: 25, sales: 120 })];
  const scoped = campaignTypeAnalysis(campaignPerformance(rows, { asins: ["B012345678"] }));
  expect(scoped.portfolio.totals.spend).toBe(15);
  const zero = campaignTypeAnalysis(campaignPerformance([ad({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 })]));
  expect(zero.portfolio.available).toBe(true); expect(zero.portfolio.acos).toBeNull();
  expect(zero.groups[0].spendShare).toBeNull(); expect(zero.groups[0].efficiencyIndex).toBeNull();
  expect(campaignTypeAnalysis([]).portfolio.available).toBe(false);
  const missing = campaignTypeAnalysis(campaignPerformance([ad(), ad({ entity: "placement", asin: "B012345678", placement: "Top of Search" })], { asins: ["B012345678"] }));
  expect(missing.portfolio.available).toBe(false); expect(missing.portfolio.missing).toBe(1);
});

it("derives findings from measured types and configured waste instead of sample claims", () => {
  const { portfolio, groups } = campaignTypeAnalysis(campaignPerformance([ad(), ad({ type: "SB", campaignId: "2", spend: 60, sales: 100, orders: 2, clicks: 60 })]));
  const findings = campaignTypeFindings(groups, portfolio);
  expect(findings.find(f => f.kind === "share")?.type).toBe("SP");
  expect(findings.find(f => f.kind === "acos")?.type).toBe("SB");
  expect(findings.find(f => f.kind === "cvr")?.type).toBe("SB");
  expect(findings.find(f => f.kind === "waste")?.type).toBe("SB");
  expect(campaignTypeFindings(campaignTypeAnalysis([]).groups, campaignTypeAnalysis([]).portfolio)).toEqual([]);
});
