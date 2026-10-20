import { analyzeCampaignContribution, CAMPAIGN_ATTRIBUTION_UNAVAILABLE, type CampaignContributionAnalysis, type NativeCampaign, type NativeCampaignMetrics, type NativeCampaignPeriod } from "../domain/campaign-contribution";
import { unwrapScaleInsightsPayload, type ScaleInsightsToolCaller } from "./scale-insights-performance";
import { getScaleInsightsCampaignToolCapabilities, type ScaleInsightsCampaignComparisonParams } from "./scale-insights-campaign-comparison";

type Definition = { name: string; inputSchema?: Record<string, unknown> };
const record = (value: unknown): Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const KEYS = { impressions: ["Impressions", "impressions", "total_impressions"], clicks: ["Clicks", "clicks", "total_clicks"], spend: ["Spend", "spend", "Cost", "cost", "total_spend"], sales: ["Sales", "sales", "total_sales"], orders: ["Orders", "orders", "total_orders"] };
function metrics(value: unknown): NativeCampaignMetrics {
  const source = record(value);
  return Object.fromEntries(Object.entries(KEYS).map(([key, aliases]) => {
    const raw = aliases.map(alias => source[alias]).find(value => value !== undefined);
    const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.replace(/[$,]/g, "")) : NaN;
    if (!Number.isFinite(number) || number < 0 || ((key === "clicks" || key === "impressions" || key === "orders") && !Number.isInteger(number))) throw new Error("Native campaign traffic or ASIN advertising totals are missing.");
    return [key, number];
  })) as NativeCampaignMetrics;
}

/** Only native ASIN-scoped campaign reports qualify. Keyword/search-term identities cannot establish advertised-product membership. */
export function nativeCampaignCapability(definitions: Definition[]) {
  for (const tool of definitions) {
    const properties = record(tool.inputSchema?.properties);
    if (record(properties.asin_list).type !== "array" || !properties.country || !properties.start_date || !properties.end_date || !properties.page || !properties.count) continue;
    if (tool.name === "get_campaign_performance") return { name: tool.name, grouping: null };
    const grouping = getScaleInsightsCampaignToolCapabilities(tool.inputSchema).grouping;
    if (tool.name === "get_ads_performance" && grouping) return { name: tool.name, grouping };
  }
  return null;
}

export async function loadCampaignContribution(params: ScaleInsightsCampaignComparisonParams, definitions: Definition[], callTool: ScaleInsightsToolCaller, diagnostic: (event: string, details: Record<string, unknown>) => void): Promise<CampaignContributionAnalysis> {
  const base = { asin: params.asin, country: params.country, productName: "", currency: "USD", currentStartDate: params.currentStartDate, currentEndDate: params.currentEndDate, previousStartDate: params.previousStartDate, previousEndDate: params.previousEndDate, checkedAt: new Date().toISOString() };
  const capability = nativeCampaignCapability(definitions);
  diagnostic("campaign_contribution_contract", { nativeAsinCampaignReporting: Boolean(capability), missingCapability: capability ? null : "advertised-product ASIN to campaign mapping / native ASIN-scoped campaign report", tools: definitions.filter(tool => /campaign|advertis|ads_performance/i.test(tool.name)).slice(0, 25).map(tool => ({ name: tool.name, fields: Object.keys(record(tool.inputSchema?.properties)).slice(0, 30) })) });
  const unavailable = (warning: string): CampaignContributionAnalysis => ({ ...base, state: "unavailable", warning, summary: null, campaigns: [], reconciliation: [] });
  if (!capability) return unavailable(CAMPAIGN_ATTRIBUTION_UNAVAILABLE);
  async function period(startDate: string, endDate: string): Promise<NativeCampaignPeriod> {
    const campaigns: NativeCampaign[] = [], seen = new Set<string>();
    let complete = false;
    for (let page = 1; page <= 20; page++) {
      const args: Record<string, unknown> = { asin_list: [params.asin], country: params.country, start_date: startDate, end_date: endDate, mode: "raw", count: 100, page };
      if (capability!.grouping) args[capability!.grouping.key] = capability!.grouping.value;
      const payload = unwrapScaleInsightsPayload(await callTool(capability!.name, args));
      const scope = record(payload.agg), meta = record(payload.oppMeta);
      // Explicit returned scope is required; an accepted input alone is not proof of attribution.
      const asins = payload.AsinList ?? scope.AsinList;
      if (scope.Country !== params.country || scope.StartDate !== startDate || scope.EndDate !== endDate || !Array.isArray(asins) || asins.length !== 1 || asins[0] !== params.asin || payload.AsinTruncated === true) throw new Error("Native campaign ASIN/date/marketplace scope could not be verified.");
      if (!Array.isArray(payload.opps)) throw new Error("Native campaign rows are missing.");
      for (const value of payload.opps) {
        const item = record(value), raw = record(item.metrics), campaignId = String(raw.CampaignId ?? "");
        if (item.entityType !== "Campaign" || !campaignId || seen.has(campaignId)) throw new Error("Native campaign IDs are missing or repeated across pages.");
        seen.add(campaignId);
        campaigns.push({ campaignId, campaignName: String(raw.CampaignName ?? item.entity ?? campaignId), adType: typeof raw.AdType === "string" ? raw.AdType : undefined, status: typeof raw.State === "string" ? raw.State : undefined, ...metrics(raw) });
      }
      if (meta.has_next_page === false && meta.total_count === campaigns.length) { complete = true; break; }
      if (meta.has_next_page !== true) break;
    }
    const ads = unwrapScaleInsightsPayload(await callTool("get_ads_performance", { asin_list: [params.asin], country: params.country, start_date: startDate, end_date: endDate, mode: "raw", summary_only: false, count: 100, page: 1 }));
    const scope = record(ads.agg), meta = record(ads.oppMeta);
    if (scope.Country !== params.country || scope.StartDate !== startDate || scope.EndDate !== endDate || meta.total_count !== 1 || meta.has_next_page !== false) throw new Error("Native ASIN advertising totals could not be verified.");
    const first = Array.isArray(ads.opps) && ads.opps.length === 1 ? record(ads.opps[0]) : {};
    const firstMetrics = record(first.metrics);
    if ((firstMetrics.Asin ?? firstMetrics.ASIN ?? first.Asin ?? first.entity) !== params.asin) throw new Error("Native advertising totals returned a different ASIN.");
    base.currency = typeof scope.Currency === "string" ? scope.Currency : base.currency;
    return { startDate, endDate, complete, campaigns, asinTotals: metrics(meta.totals) };
  }
  try {
    const [previous, current] = await Promise.all([period(params.previousStartDate, params.previousEndDate), period(params.currentStartDate, params.currentEndDate)]);
    return analyzeCampaignContribution({ ...base, previous, current });
  } catch {
    diagnostic("campaign_contribution_native_fields_unavailable", { requiredFields: ["CampaignId", "Impressions", "Clicks", "Spend", "Sales", "Orders"], requiresCompletePagination: true });
    return unavailable(`${CAMPAIGN_ATTRIBUTION_UNAVAILABLE} Native scope, traffic fields, or pagination could not be verified.`);
  }
}
