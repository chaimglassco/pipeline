export const CAMPAIGN_ATTRIBUTION_UNAVAILABLE = "Campaign-level ASIN attribution is not available from the current Scale Insights API connection.";
export const CONTRIBUTION_METRICS = ["impressions", "clicks", "spend", "cpc", "sales", "orders", "acos"] as const;
export type ContributionMetric = typeof CONTRIBUTION_METRICS[number];
export type NativeCampaignMetrics = { impressions: number; clicks: number; spend: number; sales: number; orders: number };
export type ContributionMetrics = NativeCampaignMetrics & { cpc: number | null; acos: number | null };
export type ContributionDelta = { absolute: number | null; percentage: number | null; isNew: boolean };
export type NativeCampaign = NativeCampaignMetrics & { campaignId: string; campaignName: string; adType?: string; status?: string };
export type NativeCampaignPeriod = { startDate: string; endDate: string; complete: boolean; campaigns: NativeCampaign[]; asinTotals: NativeCampaignMetrics };
export type ContributionRow = { campaignId: string; campaignName: string; adType?: string; status?: string; previousMetrics: ContributionMetrics | null; currentMetrics: ContributionMetrics | null; delta: Record<ContributionMetric, ContributionDelta>; spendContributionPct: number | null; diagnosis: string[]; lowData: boolean };
export type CampaignContributionAnalysis = {
  asin: string; country: string; productName: string; currency: string; currentStartDate: string; currentEndDate: string; previousStartDate: string; previousEndDate: string;
  state: "available" | "unavailable"; warning: string | null; checkedAt: string;
  summary: { previous: ContributionMetrics; current: ContributionMetrics; delta: Record<ContributionMetric, ContributionDelta> } | null;
  campaigns: ContributionRow[];
  reconciliation: { period: "previous" | "current"; metric: "impressions" | "clicks" | "spend"; asinTotal: number; campaignTotal: number; coveragePct: number | null; matches: boolean }[];
};
export function contributionMetrics(value: NativeCampaignMetrics): ContributionMetrics {
  return { impressions: value.impressions, clicks: value.clicks, spend: value.spend, sales: value.sales, orders: value.orders, cpc: value.clicks > 0 ? value.spend / value.clicks : null, acos: value.sales > 0 ? value.spend / value.sales * 100 : null };
}
export function contributionDelta(previous: number | null, current: number | null): ContributionDelta {
  if (previous == null || current == null) return { absolute: null, percentage: null, isNew: false };
  return { absolute: current - previous, percentage: previous > 0 ? (current - previous) / previous * 100 : current === 0 ? 0 : null, isNew: previous === 0 && current > 0 };
}
const ZERO: NativeCampaignMetrics = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
function deltas(previous: ContributionMetrics | null, current: ContributionMetrics | null) {
  return Object.fromEntries(CONTRIBUTION_METRICS.map(key => [key, contributionDelta(previous?.[key] ?? null, current?.[key] ?? null)])) as Record<ContributionMetric, ContributionDelta>;
}
export const CONTRIBUTION_DIAGNOSES: Record<string, string> = {
  "Paying more for less traffic": "Spend increased while clicks or impressions declined. This describes movement, not its cause.",
  "CPC pressure": "CPC increased by at least 10% with at least three clicks in each period.",
  "Spend up with more traffic": "Spend and clicks increased while CPC stayed flat or declined.",
  "Efficient traffic growth": "Spend, clicks, and sales increased while ACOS stayed flat or declined; profitability is not inferred.",
  "Visibility loss": "Impressions declined by at least 20% from a positive previous value.",
  "New campaign": "The campaign was absent from a complete previous-period report and has current activity.",
  "Stopped / no traffic": "A complete current report confirms no current impressions or clicks after previous traffic.",
  "Low data": "One or both periods have fewer than three clicks, or a period is incomplete. CPC movement may be unstable.",
};
export function analyzeCampaignContribution(input: { asin: string; country: string; productName: string; currency: string; previous: NativeCampaignPeriod; current: NativeCampaignPeriod; checkedAt?: string }): CampaignContributionAnalysis {
  for (const period of [input.previous, input.current]) {
    const ids = new Set<string>();
    for (const row of period.campaigns) {
      if (!row.campaignId || ids.has(row.campaignId)) throw new TypeError("Native campaign rows require unique campaign IDs.");
      ids.add(row.campaignId);
      if (Object.keys(ZERO).some(key => !Number.isFinite(row[key as keyof NativeCampaignMetrics]) || row[key as keyof NativeCampaignMetrics] < 0)) throw new TypeError("Native campaign metrics must be finite and nonnegative.");
    }
    if (Object.keys(ZERO).some(key => !Number.isFinite(period.asinTotals[key as keyof NativeCampaignMetrics]) || period.asinTotals[key as keyof NativeCampaignMetrics] < 0)) throw new TypeError("ASIN advertising totals must be finite and nonnegative.");
  }
  const previous = contributionMetrics(input.previous.asinTotals), current = contributionMetrics(input.current.asinTotals);
  const spendIncrease = current.spend - previous.spend;
  const old = new Map(input.previous.campaigns.map(row => [row.campaignId, row]));
  const next = new Map(input.current.campaigns.map(row => [row.campaignId, row]));
  const campaigns = [...new Set([...old.keys(), ...next.keys()])].map(campaignId => {
    const before = old.get(campaignId), after = next.get(campaignId), identity = after ?? before!;
    const previousMetrics = before ? contributionMetrics(before) : input.previous.complete ? contributionMetrics(ZERO) : null;
    const currentMetrics = after ? contributionMetrics(after) : input.current.complete ? contributionMetrics(ZERO) : null;
    const delta = deltas(previousMetrics, currentMetrics);
    const lowData = !input.previous.complete || !input.current.complete || !previousMetrics || !currentMetrics || previousMetrics.clicks < 3 || currentMetrics.clicks < 3;
    const diagnosis: string[] = [];
    if (!before && input.previous.complete && after && (after.clicks > 0 || after.impressions > 0 || after.spend > 0)) diagnosis.push("New campaign");
    if (previousMetrics && currentMetrics && input.current.complete && (previousMetrics.clicks > 0 || previousMetrics.impressions > 0) && currentMetrics.clicks === 0 && currentMetrics.impressions === 0) diagnosis.push("Stopped / no traffic");
    if ((delta.spend.absolute ?? 0) > 0 && ((delta.clicks.absolute ?? 0) < 0 || (delta.impressions.absolute ?? 0) < 0)) diagnosis.push("Paying more for less traffic");
    if (!lowData && (delta.cpc.percentage ?? 0) >= 10) diagnosis.push("CPC pressure");
    if ((delta.spend.absolute ?? 0) > 0 && (delta.clicks.absolute ?? 0) > 0 && delta.cpc.absolute != null && delta.cpc.absolute <= 0) diagnosis.push("Spend up with more traffic");
    if ((delta.spend.absolute ?? 0) > 0 && (delta.clicks.absolute ?? 0) > 0 && (delta.sales.absolute ?? 0) > 0 && delta.acos.absolute != null && delta.acos.absolute <= 0) diagnosis.push("Efficient traffic growth");
    if (delta.impressions.percentage != null && delta.impressions.percentage <= -20) diagnosis.push("Visibility loss");
    if (lowData) diagnosis.push("Low data");
    return { campaignId, campaignName: identity.campaignName, adType: identity.adType, status: identity.status, previousMetrics, currentMetrics, delta, spendContributionPct: spendIncrease > 0 && delta.spend.absolute != null ? delta.spend.absolute / spendIncrease * 100 : null, diagnosis, lowData };
  }).sort((a, b) => (b.delta.spend.absolute ?? -Infinity) - (a.delta.spend.absolute ?? -Infinity) || a.campaignId.localeCompare(b.campaignId));
  const reconciliation = (["previous", "current"] as const).flatMap(period => (["impressions", "clicks", "spend"] as const).map(metric => {
    const source = input[period], asinTotal = source.asinTotals[metric], campaignTotal = source.campaigns.reduce((sum, row) => sum + row[metric], 0);
    return { period, metric, asinTotal, campaignTotal, coveragePct: asinTotal > 0 ? campaignTotal / asinTotal * 100 : null, matches: source.complete && Math.abs(campaignTotal - asinTotal) <= Math.max(metric === "spend" ? 0.01 : 0, asinTotal * 0.01) };
  }));
  return { asin: input.asin, country: input.country, productName: input.productName, currency: input.currency, currentStartDate: input.current.startDate, currentEndDate: input.current.endDate, previousStartDate: input.previous.startDate, previousEndDate: input.previous.endDate, state: "available", warning: reconciliation.some(row => !row.matches) ? "Native campaign totals do not reconcile with ASIN advertising totals within 1%, or campaign pagination is incomplete. Shared campaigns may include other products. Missing traffic has not been filled." : null, checkedAt: input.checkedAt ?? new Date().toISOString(), summary: { previous, current, delta: deltas(previous, current) }, campaigns, reconciliation };
}
