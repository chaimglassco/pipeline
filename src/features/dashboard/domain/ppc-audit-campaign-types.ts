import { auditRate, auditTotals } from "./ppc-audit";
import { ASIN_ACOS_TARGET } from "./ppc-audit-asins";
import type { CampaignPerformance } from "./ppc-audit-campaigns";

export const CAMPAIGN_TYPE_NAMES: Record<string, string> = {
  SP: "Sponsored Products", SB: "Sponsored Brands", SD: "Sponsored Display",
};
export function canonicalCampaignType(type: string) {
  const normalized = type.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "sp" || normalized.startsWith("sponsoredproducts")) return "SP";
  if (normalized === "sb" || normalized.startsWith("sponsoredbrands")) return "SB";
  if (normalized === "sd" || normalized.startsWith("sponsoreddisplay")) return "SD";
  return type || "Not supplied";
}
export const campaignTypeName = (type: string) => CAMPAIGN_TYPE_NAMES[canonicalCampaignType(type)] || type || "Not supplied";

export function campaignTypeSummary(campaigns: CampaignPerformance[]) {
  const available = campaigns.some(c => c.totals !== null);
  const totals = auditTotals(campaigns.flatMap(c => c.evidence));
  const waste = campaigns.reduce((sum, c) => sum + c.waste, 0);
  const acos = available ? auditRate(totals.spend, totals.sales) : null;
  return {
    campaigns, totals, available, missing: campaigns.filter(c => !c.totals).length, waste, acos,
    ctr: available ? auditRate(totals.clicks, totals.impressions) : null,
    cvr: available ? auditRate(totals.orders, totals.clicks) : null,
    cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null,
    wasteRate: available ? auditRate(waste, totals.spend) : null,
    status: !available ? "Performance Unavailable" : !totals.spend && !totals.sales ? "No Spend" :
      acos !== null && acos > ASIN_ACOS_TARGET || waste > 0 ? "Needs Attention" :
      totals.spend > 0 && !totals.orders ? "Review No-order Spend" : "Efficient",
  };
}

export function campaignTypeAnalysis(campaigns: CampaignPerformance[]) {
  const portfolio = campaignTypeSummary(campaigns);
  const types = [...new Set(["SP", "SB", "SD", ...campaigns.map(c => canonicalCampaignType(c.type))])];
  const groups = types.map(type => {
    const summary = campaignTypeSummary(campaigns.filter(c => canonicalCampaignType(c.type) === type));
    const spendShare = summary.available ? auditRate(summary.totals.spend, portfolio.totals.spend) : null;
    const salesShare = summary.available ? auditRate(summary.totals.sales, portfolio.totals.sales) : null;
    const orderShare = summary.available ? auditRate(summary.totals.orders, portfolio.totals.orders) : null;
    return { type, name: campaignTypeName(type), ...summary, spendShare, salesShare, orderShare,
      salesDelta: spendShare !== null && salesShare !== null ? salesShare - spendShare : null,
      orderDelta: spendShare !== null && orderShare !== null ? orderShare - spendShare : null,
      efficiencyIndex: spendShare !== null && spendShare > 0 && salesShare !== null ? salesShare / spendShare : null,
    };
  });
  return { portfolio, groups };
}
export type CampaignTypeGroup = ReturnType<typeof campaignTypeAnalysis>["groups"][number];

export function campaignTypeFindings(groups: CampaignTypeGroup[], portfolio: ReturnType<typeof campaignTypeSummary>) {
  const measured = groups.filter(g => g.available && g.totals.spend > 0);
  const findings: { title: string; detail: string; review: string; type: string; kind: "share" | "acos" | "cvr" | "waste" }[] = [];
  const leader = [...measured].filter(g => g.salesDelta !== null && g.salesDelta > 0).sort((a, b) => b.salesDelta! - a.salesDelta!)[0];
  if (leader && measured.length > 1) findings.push({ type: leader.type, kind: "share", title: `${leader.name} sales contribution`, detail: "Sales share exceeds spend share in the reported scope.", review: "Review the contributing campaigns, margins, inventory, and budget history before scaling." });
  const high = [...measured].filter(g => g.acos !== null && g.acos > ASIN_ACOS_TARGET).sort((a, b) => b.acos! - a.acos!)[0];
  if (high) findings.push({ type: high.type, kind: "acos", title: `${high.name} needs attention`, detail: "ACOS exceeds the 20% review threshold.", review: "Review campaign and target efficiency against product margins and advertising goals." });
  const lower = [...measured].filter(g => g.cvr !== null && portfolio.cvr !== null && g.cvr < portfolio.cvr).sort((a, b) => a.cvr! - b.cvr!)[0];
  if (lower && measured.length > 1) findings.push({ type: lower.type, kind: "cvr", title: `${lower.name} conversion review`, detail: "Conversion rate is below the reported portfolio average.", review: "Check query relevance, advertised products, and landing-page alignment." });
  const waste = [...measured].filter(g => g.waste > 0 && g.wasteRate !== null).sort((a, b) => b.wasteRate! - a.wasteRate!)[0];
  if (waste) findings.push({ type: waste.type, kind: "waste", title: `${waste.name} waste concentration`, detail: "This type has the highest flagged-spend rate in the reported scope.", review: "Inspect the flagged targets and queries using the configured waste rules." });
  return findings;
}
