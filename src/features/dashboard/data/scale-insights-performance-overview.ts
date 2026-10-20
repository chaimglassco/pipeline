import type { Tool } from "@modelcontextprotocol/client";
import { unwrapScaleInsightsPayload, type ScaleInsightsToolCaller } from "./scale-insights-performance";
import { getScaleInsightsCampaignToolCapabilities } from "./scale-insights-campaign-comparison";
import type {
  PerformanceOverviewData,
  PerformanceOverviewAsinRow,
  PerformanceOverviewDailyPoint,
  PerformanceOverviewMetrics,
  PerformanceOverviewRow,
  PerformanceOverviewSection,
} from "../domain/performance-overview";

export type PerformanceOverviewParams = {
  asins: string[];
  country: string;
  requestedStartDate: string;
  requestedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  yesterday: string;
  sevenDayStart: string;
  fourteenDayStart: string;
  previousStartDate: string;
  previousEndDate: string;
};

const NAME_KEYS = ["search_term", "searchTerm", "SearchTerm", "customer_search_term", "searchQuery", "keyword", "Keyword", "keyword_text", "target", "Target", "target_asin", "TargetASIN", "entity", "Entity", "campaign_name", "campaignName", "CampaignName", "campaign", "Campaign", "name", "Name"];
const CAMPAIGN_KEYS = ["campaign_name", "campaignName", "CampaignName", "campaign", "Campaign"];
const ASIN_KEYS = ["advertised_asin", "advertisedAsin", "AdvertisedASIN", "product_asin", "productAsin", "ProductASIN", "asin", "ASIN", "entity", "Entity"];
const MATCH_KEYS = ["match_type", "matchType", "MatchType", "keyword_match_type", "KeywordMatchType"];
const TARGET_TYPE_KEYS = ["target_type", "targetType", "TargetType", "targeting_type", "TargetingType"];
const AD_TYPE_KEYS = ["ad_type", "adType", "AdType"];
const STATE_KEYS = ["state", "State", "status", "Status"];
const ID_KEYS = ["campaign_id", "campaignId", "CampaignId", "keyword_id", "keywordId", "KeywordId", "target_id", "targetId", "TargetId", "search_term_id", "searchTermId", "id", "Id"];
const IMPRESSION_KEYS = ["impressions", "Impressions", "total_impressions", "totalImpressions", "PPCImpressions"];
const CLICK_KEYS = ["clicks", "Clicks", "total_clicks", "totalClicks", "PPCClicks"];
const SPEND_KEYS = ["spend", "Spend", "total_spend", "totalSpend", "PPCSpend", "PPCCost", "cost", "Cost"];
const SALES_KEYS = ["sales", "Sales", "total_sales", "totalSales", "PPCSales", "total_ad_sales", "totalAdSales", "TotalAdSales", "attributed_sales", "attributedSales"];
const ORDER_KEYS = ["orders", "Orders", "total_orders", "totalOrders", "PPCOrders", "attributed_orders", "attributedOrders"];
const ACOS_KEYS = ["acos", "ACOS"];
const ROAS_KEYS = ["roas", "ROAS"];
const CPC_KEYS = ["cpc", "CPC"];
const CTR_KEYS = ["ctr", "CTR"];
const CVR_KEYS = ["cvr", "CVR", "conversion_rate", "conversionRate", "ConversionRate"];
const DAILY_BUDGET_KEYS = ["daily_budget", "dailyBudget", "DailyBudget", "budget", "Budget"];
const TOTAL_SALES_KEYS = ["total_revenue", "totalRevenue", "TotalRevenue", "total_sales", "totalSales", "TotalSales", "sales", "Sales"];
const TOTAL_ORDER_KEYS = ["total_orders", "totalOrders", "TotalOrders", "orders", "Orders"];
const PAGE_SIZE = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function directValue(record: Record<string, unknown>, keys: string[]) {
  const accepted = new Set(keys.map(normalizedKey));
  return Object.entries(record).find(([key, value]) => accepted.has(normalizedKey(key)) && value != null && !isRecord(value) && !Array.isArray(value))?.[1];
}

function nestedValue(record: Record<string, unknown>, keys: string[], depth = 0): unknown {
  const direct = directValue(record, keys);
  if (direct !== undefined || depth >= 2) return direct;
  for (const value of Object.values(record)) {
    if (!isRecord(value)) continue;
    const nested = nestedValue(value, keys, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,£€¥%x]/gi, "");
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resultPayloads(result: unknown): unknown[] {
  if (Array.isArray(result)) return result.flatMap(resultPayloads);
  const payloads: unknown[] = [];
  try { payloads.push(unwrapScaleInsightsPayload(result)); } catch { /* Content rows can still be readable. */ }
  if (isRecord(result) && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
      try { payloads.push(JSON.parse(block.text)); } catch {
        const lines = block.text.split(/\r?\n/).map(line => line.trim()).filter(line => line.includes("|"));
        for (let index = 0; index < lines.length - 2; index += 1) {
          const headers = lines[index].replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
          const separators = lines[index + 1].replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
          if (headers.length < 2 || separators.length !== headers.length || !separators.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
          payloads.push(lines.slice(index + 2).flatMap(line => {
            const cells = line.replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
            return cells.length === headers.length ? [Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]))] : [];
          }));
          break;
        }
      }
    }
  }
  return payloads;
}

function rowFromRecord(record: Record<string, unknown>, kind: "campaign" | "target" | "search"): PerformanceOverviewRow | null {
  const campaign = textValue(directValue(record, kind === "campaign" ? [...CAMPAIGN_KEYS, "entity", "Entity"] : CAMPAIGN_KEYS));
  const targetType = textValue(nestedValue(record, TARGET_TYPE_KEYS)) || (kind === "campaign" ? textValue(nestedValue(record, AD_TYPE_KEYS)) : "");
  const state = kind === "campaign" ? textValue(nestedValue(record, STATE_KEYS)) : "";
  const matchType = textValue(nestedValue(record, MATCH_KEYS)) || state;
  const rawName = kind === "campaign" ? campaign : textValue(directValue(record, NAME_KEYS));
  const name = kind === "target" && /^(product|category)$/i.test(targetType) ? rawName.replace(/\s+\((?:product|category)\)$/i, "") : rawName;
  if (!name) return null;
  const values = {
    impressions: numberValue(nestedValue(record, IMPRESSION_KEYS)),
    clicks: numberValue(nestedValue(record, CLICK_KEYS)),
    spend: numberValue(nestedValue(record, SPEND_KEYS)),
    sales: numberValue(nestedValue(record, SALES_KEYS)),
    orders: numberValue(nestedValue(record, ORDER_KEYS)),
  };
  if (Object.values(values).every(value => value == null)) return null;
  const impressions = values.impressions ?? 0;
  const clicks = values.clicks ?? 0;
  const spend = values.spend ?? 0;
  const sales = values.sales ?? 0;
  const orders = values.orders ?? 0;
  const providerId = textValue(directValue(record, ID_KEYS));
  const asinCandidate = textValue(directValue(record, kind === "target" ? ASIN_KEYS.filter(key => !/^entity$/i.test(key)) : ASIN_KEYS)).toUpperCase();
  const asin = /^[A-Z0-9]{10}$/.test(asinCandidate) ? asinCandidate : "";
  const reportedAcos = numberValue(nestedValue(record, ACOS_KEYS));
  const reportedRoas = numberValue(nestedValue(record, ROAS_KEYS));
  const reportedCpc = numberValue(nestedValue(record, CPC_KEYS));
  const reportedCtr = numberValue(nestedValue(record, CTR_KEYS));
  const reportedCvr = numberValue(nestedValue(record, CVR_KEYS));
  const dailyBudget = numberValue(nestedValue(record, DAILY_BUDGET_KEYS));
  return {
    id: providerId || `${kind}:${normalizedKey(name)}:${normalizedKey(campaign)}:${normalizedKey(matchType)}`,
    name,
    campaign: kind === "campaign" ? name : campaign,
    asin,
    matchType,
    targetType,
    impressions,
    clicks,
    spend,
    sales,
    orders,
    acos: reportedAcos ?? (sales > 0 ? (spend / sales) * 100 : null),
    roas: reportedRoas ?? (spend > 0 ? sales / spend : null),
    conversionRate: reportedCvr ?? (clicks > 0 ? (orders / clicks) * 100 : null),
    state: state || undefined,
    cpc: reportedCpc,
    ctr: reportedCtr,
    dailyBudget,
  };
}

function collectRows(value: unknown, kind: "campaign" | "target" | "search", depth = 0): PerformanceOverviewRow[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectRows(item, kind, depth + 1));
  if (!isRecord(value)) return [];
  const row = rowFromRecord(value, kind);
  if (row) return [row];
  return Object.values(value).flatMap(item => collectRows(item, kind, depth + 1));
}

function uniqueRows(result: unknown, kind: "campaign" | "target" | "search") {
  if (kind === "target") {
    // Compact targets lack IDs and can repeat across campaigns. Preserve each source
    // row, choosing one payload representation so text/structured mirrors do not duplicate it.
    const pages = Array.isArray(result) ? result : [result];
    return pages.flatMap((page, pageIndex) => {
      const candidates = resultPayloads(page).map(payload => collectRows(isRecord(payload) ? payload.opps ?? payload.rows ?? payload : payload, kind));
      const sourceRows = candidates.toSorted((first, second) => second.length - first.length)[0] ?? [];
      return sourceRows.map((row, rowIndex) => ({ ...row, id: `${row.id}:page${pageIndex}:row${rowIndex}` }));
    }).toSorted((first, second) => second.sales - first.sales || second.spend - first.spend || first.name.localeCompare(second.name));
  }
  const rows = new Map<string, PerformanceOverviewRow>();
  for (const payload of resultPayloads(result)) {
    for (const row of collectRows(payload, kind)) {
      const key = `${row.id}:${normalizedKey(row.name)}:${normalizedKey(row.campaign)}:${normalizedKey(row.matchType)}`;
      const existing = rows.get(key);
      if (!existing || row.sales > existing.sales || (row.sales === existing.sales && row.spend > existing.spend)) rows.set(key, row);
    }
  }
  return [...rows.values()].toSorted((first, second) => second.sales - first.sales || second.spend - first.spend || first.name.localeCompare(second.name));
}

function toolProperties(tool: Tool) {
  return isRecord(tool.inputSchema) && isRecord(tool.inputSchema.properties) ? tool.inputSchema.properties : {};
}

function schemaEnumStrings(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const variants = [...(Array.isArray(value.oneOf) ? value.oneOf : []), ...(Array.isArray(value.anyOf) ? value.anyOf : [])];
  return [
    ...(Array.isArray(value.enum) ? value.enum.filter((candidate): candidate is string => typeof candidate === "string") : []),
    ...(typeof value.const === "string" ? [value.const] : []),
    ...variants.flatMap(variant => isRecord(variant) ? schemaEnumStrings(variant) : []),
  ];
}

function groupingArgument(tool: Tool, grouping: string) {
  if (grouping === "campaign" && tool.name === "get_ads_performance") return getScaleInsightsCampaignToolCapabilities(tool.inputSchema).grouping;
  const properties = toolProperties(tool);
  const keys = ["group_by", "groupBy", "dimension", "entity_type", "entityType", "level", "breakdown", "grouping", "view", "aggregate_by", "aggregateBy", "granularity"];
  const desired = grouping === "product"
    ? ["product", "products", "asin", "asins", "advertised_asin", "advertisedasin"]
    : grouping === "day"
      ? ["day", "daily", "date"]
      : ["total", "summary", "account"];
  const key = keys.find(candidate => Object.prototype.hasOwnProperty.call(properties, candidate))
    ?? Object.entries(properties).find(([, property]) => schemaEnumStrings(property).some(candidate => desired.includes(normalizedKey(candidate))))?.[0];
  if (!key) return undefined;
  const choices = schemaEnumStrings(properties[key]);
  const value = choices.find(candidate => desired.includes(normalizedKey(candidate))) ?? (choices.length ? "" : grouping);
  return value ? { key, value } : undefined;
}

function buildArgs(tool: Tool, asins: string[], country: string, startDate: string, endDate: string, grouping?: string, requestedPageSize = PAGE_SIZE, allowAccountScope = false) {
  const properties = toolProperties(tool);
  const args: Record<string, unknown> = {};
  const set = (keys: string[], value: unknown) => {
    const key = keys.find(candidate => Object.prototype.hasOwnProperty.call(properties, candidate));
    if (key) args[key] = value;
  };
  const asinListKey = ["asin_list", "asinList", "asins"].find(key => Object.prototype.hasOwnProperty.call(properties, key));
  const asinKey = Object.prototype.hasOwnProperty.call(properties, "asin") ? "asin" : "";
  if (asinListKey) args[asinListKey] = asins;
  else if (asinKey && asins.length === 1) args[asinKey] = asins[0];
  else if (!allowAccountScope) return null;
  set(["country", "country_code", "countryCode", "marketplace"], country);
  set(["start_date", "startDate", "from_date", "fromDate"], startDate);
  set(["end_date", "endDate", "to_date", "toDate"], endDate);
  set(["mode", "result_mode", "resultMode"], "raw");
  set(["summary_only", "summaryOnly"], false);
  set(["waste_only", "wasteOnly"], false);
  set(["sort_by", "sortBy"], "sales");
  set(["sort_direction", "sortDirection"], "desc");
  set(["count", "limit", "page_size", "pageSize"], tool.name === "get_sales_data" ? Math.min(requestedPageSize, 100) : requestedPageSize);
  set(["page", "page_number", "pageNumber"], 1);
  if (grouping) {
    const group = groupingArgument(tool, grouping);
    if (group) args[group.key] = group.value;
  }
  return args;
}

async function callPaginated(tool: Tool, args: Record<string, unknown>, callTool: ScaleInsightsToolCaller) {
  const first = await callTool(tool.name, args);
  const pageCount = Math.max(1, Math.floor(numberValue(directValue(metadata(first), ["total_pages", "totalPages", "TotalPages"])) ?? 1));
  if (pageCount === 1) return first;
  const pageKey = ["page", "page_number", "pageNumber"].find(key => Object.prototype.hasOwnProperty.call(toolProperties(tool), key));
  if (!pageKey) return first;
  const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => callTool(tool.name, { ...args, [pageKey]: index + 2 })));
  return [first, ...remaining];
}

type AsinMetrics = Omit<PerformanceOverviewAsinRow, "previousTotalSales">;

function metricsFromAsinRecord(record: Record<string, unknown>, kind: "ads" | "sales"): AsinMetrics | null {
  const asin = textValue(directValue(record, ASIN_KEYS)).toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const number = (keys: string[]) => numberValue(nestedValue(record, keys)) ?? 0;
  if (kind === "ads") return { asin, spend: number(SPEND_KEYS), ppcSales: number(SALES_KEYS), ppcOrders: number(ORDER_KEYS), clicks: number(CLICK_KEYS), totalSales: 0, totalOrders: 0 };
  return { asin, spend: 0, ppcSales: 0, ppcOrders: 0, clicks: 0, totalSales: number(TOTAL_SALES_KEYS), totalOrders: number(TOTAL_ORDER_KEYS) };
}

function collectAsinMetrics(value: unknown, kind: "ads" | "sales", depth = 0): AsinMetrics[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectAsinMetrics(item, kind, depth + 1));
  if (!isRecord(value)) return [];
  const row = metricsFromAsinRecord(value, kind);
  return row ? [row] : Object.values(value).flatMap(item => collectAsinMetrics(item, kind, depth + 1));
}

function aggregateAsinMetrics(result: unknown, kind: "ads" | "sales") {
  const candidates = resultPayloads(result).map(payload => {
    const rows = collectAsinMetrics(payload, kind);
    const grouped = new Map<string, AsinMetrics>();
    for (const row of rows) {
      const current = grouped.get(row.asin) ?? { asin: row.asin, spend: 0, ppcSales: 0, ppcOrders: 0, clicks: 0, totalSales: 0, totalOrders: 0 };
      grouped.set(row.asin, {
        asin: row.asin,
        spend: current.spend + row.spend,
        ppcSales: current.ppcSales + row.ppcSales,
        ppcOrders: current.ppcOrders + row.ppcOrders,
        clicks: current.clicks + row.clicks,
        totalSales: current.totalSales + row.totalSales,
        totalOrders: current.totalOrders + row.totalOrders,
      });
    }
    return grouped;
  });
  return candidates.toSorted((first, second) => second.size - first.size)[0] ?? new Map<string, AsinMetrics>();
}

function mergeAsinRanking(currentAds: unknown, currentSales: unknown, previousSales: unknown): PerformanceOverviewAsinRow[] {
  const ads = aggregateAsinMetrics(currentAds, "ads");
  const sales = aggregateAsinMetrics(currentSales, "sales");
  const previous = aggregateAsinMetrics(previousSales, "sales");
  const asins = new Set([...ads.keys(), ...sales.keys()]);
  return [...asins].map(asin => {
    const ad = ads.get(asin);
    const sale = sales.get(asin);
    return {
      asin,
      spend: ad?.spend ?? 0,
      ppcSales: ad?.ppcSales ?? 0,
      ppcOrders: ad?.ppcOrders ?? 0,
      clicks: ad?.clicks ?? 0,
      totalSales: sale?.totalSales ?? 0,
      totalOrders: sale?.totalOrders ?? 0,
      previousTotalSales: previous.has(asin) ? previous.get(asin)!.totalSales : null,
    };
  }).filter(row => row.spend > 0 || row.ppcSales > 0 || row.totalSales > 0 || row.totalOrders > 0)
    .toSorted((first, second) => second.totalSales - first.totalSales || second.spend - first.spend || first.asin.localeCompare(second.asin));
}

function metadata(result: unknown) {
  const payload = resultPayloads(result).find(isRecord) ?? {};
  return [payload.oppMeta, payload.meta, payload.Meta, payload.metadata].find(isRecord) ?? {};
}

function freshness(result: unknown) {
  return textValue(directValue(metadata(result), ["data_as_of", "dataAsOf", "DataAsOf"]));
}

function currency(result: unknown) {
  const payload = resultPayloads(result).find(isRecord) ?? {};
  const scope = isRecord(payload.agg) ? payload.agg : payload;
  return textValue(directValue(scope, ["currency", "Currency"])) || "USD";
}

function extractSummary(adsResult: unknown, salesResult: unknown): PerformanceOverviewMetrics {
  const adsPayload = resultPayloads(adsResult).find(isRecord) ?? {};
  const adsMeta = [adsPayload.oppMeta, adsPayload.meta, adsPayload.Meta, adsPayload.metadata].find(isRecord);
  const adsTotals = adsMeta && [adsMeta.totals, adsMeta.Totals].find(isRecord);
  const adsScope = adsTotals || (isRecord(adsPayload.agg) ? adsPayload.agg : adsPayload);
  const salesPayload = resultPayloads(salesResult).find(isRecord) ?? {};
  const salesScope = isRecord(salesPayload.Summary) ? salesPayload.Summary : salesPayload;
  const number = (record: Record<string, unknown>, keys: string[]) => numberValue(nestedValue(record, keys)) ?? 0;
  return {
    totalSales: number(salesScope, TOTAL_SALES_KEYS),
    ppcSales: number(adsScope, SALES_KEYS),
    spend: number(adsScope, SPEND_KEYS),
    totalOrders: number(salesScope, TOTAL_ORDER_KEYS),
    ppcOrders: number(adsScope, ORDER_KEYS),
    clicks: number(adsScope, CLICK_KEYS),
  };
}

function extractDailyPerformance(salesResult: unknown): PerformanceOverviewDailyPoint[] {
  const candidates = resultPayloads(salesResult).map(payload => {
    if (!isRecord(payload) || !Array.isArray(payload.Daily)) return [];
    return payload.Daily.flatMap(item => {
      if (!isRecord(item)) return [];
      const date = textValue(directValue(item, ["date", "Date"]));
      const spend = numberValue(directValue(item, ["ppc_cost", "ppcCost", "PPCCost", "spend", "Spend"]));
      const ppcSales = numberValue(directValue(item, ["ppc_sales", "ppcSales", "PPCSales"]));
      const totalSales = numberValue(directValue(item, ["sales", "Sales", "total_sales", "totalSales", "TotalSales"]));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || spend == null || ppcSales == null || totalSales == null) return [];
      return [{
        date,
        spend,
        ppcSales,
        totalSales,
        acos: ppcSales > 0 ? (spend / ppcSales) * 100 : null,
        tacos: totalSales > 0 ? (spend / totalSales) * 100 : null,
      }];
    });
  });
  return (candidates.toSorted((first, second) => second.length - first.length)[0] ?? []).toSorted((first, second) => first.date.localeCompare(second.date));
}

function section(rows: PerformanceOverviewRow[], available: boolean, unavailableMessage: string): PerformanceOverviewSection {
  return available
    ? { status: "ready", message: rows.length ? `${rows.length} rows from Scale Insights.` : "Scale Insights returned no rows for this scope.", rows }
    : { status: "unavailable", message: unavailableMessage, rows: [] };
}

export async function loadScaleInsightsPerformanceOverview(
  params: PerformanceOverviewParams,
  definitions: Tool[],
  callTool: ScaleInsightsToolCaller,
): Promise<PerformanceOverviewData> {
  const adsTool = definitions.find(tool => tool.name === "get_ads_performance");
  const campaignTool = definitions.find(tool => tool.name === "get_campaign_performance");
  const salesTool = definitions.find(tool => tool.name === "get_sales_data");
  const keywordTool = definitions.find(tool => tool.name === "get_keyword_performance");
  const targetTool = definitions.find(tool => tool.name === "get_target_performance");
  const searchTool = definitions.find(tool => tool.name === "get_search_term_performance");
  const ranges = {
    yesterday: { start: params.yesterday, end: params.yesterday },
    sevenDays: { start: params.sevenDayStart, end: params.yesterday },
    fourteenDays: { start: params.fourteenDayStart, end: params.yesterday },
    selectedRange: { start: params.actualStartDate, end: params.actualEndDate },
  };

  const selectedAdsArgs = adsTool && buildArgs(adsTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end);
  const campaignArgs = campaignTool && buildArgs(campaignTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end, undefined, PAGE_SIZE, true);
  const selectedAsinAdsArgs = adsTool && buildArgs(adsTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end, "product", 100);
  const selectedAsinSalesArgs = salesTool && buildArgs(salesTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end, "day", 100);
  const previousAsinSalesArgs = salesTool && buildArgs(salesTool, params.asins, params.country, params.previousStartDate, params.previousEndDate, "total", 100);
  const targetArgs = targetTool && buildArgs(targetTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end);
  const keywordArgs = keywordTool && buildArgs(keywordTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end);
  const searchArgs = searchTool && buildArgs(searchTool, params.asins, params.country, ranges.selectedRange.start, ranges.selectedRange.end);
  const periodEntries = await Promise.all(Object.entries(ranges).map(async ([key, range]) => {
    const adsArgs = key === "selectedRange" ? selectedAdsArgs : adsTool && buildArgs(adsTool, params.asins, params.country, range.start, range.end, "total");
    const salesArgs = salesTool && buildArgs(salesTool, params.asins, params.country, range.start, range.end, "total");
    if (!adsTool || !salesTool || !adsArgs || !salesArgs) return [key, null, null, null] as const;
    const [adsResult, salesResult] = await Promise.all([callTool(adsTool.name, adsArgs), callTool(salesTool.name, salesArgs)]);
    return [key, extractSummary(adsResult, salesResult), adsResult, salesResult] as const;
  }));
  const selectedAdsResult = periodEntries.find(([key]) => key === "selectedRange")?.[2];
  const [campaignResult, keywordResult, targetResult, searchResult, selectedAsinAdsResult, selectedAsinSalesResult, previousAsinSalesResult] = await Promise.all([
    campaignTool && campaignArgs ? callPaginated(campaignTool, campaignArgs, callTool) : Promise.resolve(null),
    keywordTool && keywordArgs ? callTool(keywordTool.name, keywordArgs) : Promise.resolve(null),
    targetTool && targetArgs ? callPaginated(targetTool, targetArgs, callTool) : Promise.resolve(null),
    searchTool && searchArgs ? callTool(searchTool.name, searchArgs) : Promise.resolve(null),
    adsTool && selectedAsinAdsArgs ? callTool(adsTool.name, selectedAsinAdsArgs) : Promise.resolve(null),
    salesTool && selectedAsinSalesArgs ? callTool(salesTool.name, selectedAsinSalesArgs) : Promise.resolve(null),
    salesTool && previousAsinSalesArgs ? callTool(salesTool.name, previousAsinSalesArgs) : Promise.resolve(null),
  ]);

  const campaignRows = campaignResult ? uniqueRows(campaignResult, "campaign") : [];
  const targetRows = targetResult ? uniqueRows(targetResult, "target") : [];
  const keywordRows = keywordResult ? uniqueRows(keywordResult, "target") : [];
  const productTargetRows = targetRows.filter(row => /^(product|category)$/i.test(row.targetType) || /^[A-Z0-9]{10}$/i.test(row.name))
    .map(row => ({ ...row, asin: row.asin || (params.asins.length === 1 ? params.asins[0] : "") }));
  const searchRows = searchResult ? uniqueRows(searchResult, "search") : [];
  const asinRows = selectedAsinAdsResult && selectedAsinSalesResult
    ? mergeAsinRanking(selectedAsinAdsResult, selectedAsinSalesResult, previousAsinSalesResult)
    : [];
  const scalarScopeMessage = params.asins.length > 1 ? "This Scale Insights tool accepts one ASIN at a time. Filter the dashboard to one ASIN." : "The connected Scale Insights integration does not expose this report.";
  const periods = Object.fromEntries(periodEntries.map(([key, metrics]) => [key, metrics])) as PerformanceOverviewData["periods"];
  const results = [selectedAdsResult, campaignResult, keywordResult, targetResult, searchResult].filter(Boolean);
  return {
    asins: params.asins,
    country: params.country,
    currency: results.map(currency).find(Boolean) || "USD",
    requestedPeriod: { startDate: params.requestedStartDate, endDate: params.requestedEndDate },
    actualPeriod: { startDate: params.actualStartDate, endDate: params.actualEndDate },
    freshness: results.map(freshness).filter(Boolean).toSorted().at(-1) || "",
    periods,
    dailyPerformance: selectedAsinSalesResult ? extractDailyPerformance(selectedAsinSalesResult) : [],
    asinRanking: sectionAsinRanking(asinRows, Boolean(adsTool && salesTool && selectedAsinAdsArgs && selectedAsinSalesArgs), scalarScopeMessage),
    sections: {
      keywords: section(keywordRows, Boolean(keywordTool && keywordArgs), scalarScopeMessage),
      campaigns: section(campaignRows, Boolean(campaignTool && campaignArgs), "The connected Scale Insights integration does not expose campaign performance."),
      productTargets: section(productTargetRows, Boolean(targetTool && targetArgs), scalarScopeMessage),
      searchTerms: section(searchRows, Boolean(searchTool && searchArgs), scalarScopeMessage),
    },
    warnings: params.requestedEndDate !== params.actualEndDate ? [`Scale Insights excludes today and future dates. Actual data ends ${params.actualEndDate}.`] : [],
  };
}

function sectionAsinRanking(rows: PerformanceOverviewAsinRow[], available: boolean, unavailableMessage: string) {
  return available
    ? { status: "ready" as const, message: rows.length ? `${rows.length} ASIN rows from Scale Insights.` : "Scale Insights returned no ASIN-level rows for this scope.", rows }
    : { status: "unavailable" as const, message: unavailableMessage, rows: [] };
}
