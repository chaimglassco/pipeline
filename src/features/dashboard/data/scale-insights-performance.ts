import { calculateWeeklyPerformance, type WeeklyPerformanceCalculatedMetrics } from "../domain/ppc-dashboard-state";

export type ScaleInsightsToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type PerformanceDiagnosticReporter = (event: string, details: Record<string, unknown>) => void;

export type ScaleInsightsWeeklyPerformanceParams = {
  asin: string;
  country: string;
  startDate: string;
  endDate: string;
};

export type ScaleInsightsWeeklyPerformance = ScaleInsightsWeeklyPerformanceParams & {
  metricsRevision?: 2 | 3 | 4;
  currency: string;
  metrics: WeeklyPerformanceCalculatedMetrics;
  freshness: {
    adsDataAsOf: string;
    salesDataAsOf: string;
    salesDataThrough: string;
    searchDataAsOf?: string;
  };
  warnings: string[];
};

type SearchTermTraffic = {
  ppcClicks?: number;
  ppcImpressions?: number;
  ppcUnits?: number;
  dataAsOf: string;
  warning?: string;
};

export class ScaleInsightsDataError extends Error {
  constructor(public readonly code: "invalid_response" | "no_data", message: string) {
    super(message);
    this.name = "ScaleInsightsDataError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordAt(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[key])) throw new ScaleInsightsDataError("invalid_response", `Scale Insights omitted ${key}.`);
  return value[key];
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ScaleInsightsDataError("invalid_response", `Scale Insights returned an invalid ${field}.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = finiteNonNegative(value, field);
  if (!Number.isInteger(number)) throw new ScaleInsightsDataError("invalid_response", `Scale Insights returned a non-integer ${field}.`);
  return number;
}

const PPC_CLICK_KEYS = [
  "total_clicks", "TotalClicks", "totalClicks", "PPCClicks", "ppcClicks", "TotalPPCClicks", "totalPpcClicks",
  "clicks", "Clicks", "click_count", "clickCount", "PPC_Clicks",
];
const PPC_IMPRESSION_KEYS = ["total_impressions", "TotalImpressions", "totalImpressions", "PPCImpressions", "ppcImpressions", "impressions", "Impressions"];
const PPC_UNIT_KEYS = ["PPCUnits", "ppcUnits", "TotalPPCUnits", "totalPpcUnits", "ppc_units", "total_ppc_units", "units", "Units", "total_units", "TotalUnits", "totalUnits"];
const SALES_PPC_UNIT_KEYS = ["PPCUnits", "ppcUnits", "TotalPPCUnits", "totalPpcUnits", "ppc_units", "total_ppc_units"];
const ORGANIC_UNIT_KEYS = ["OrganicUnits", "organicUnits", "TotalOrganicUnits", "totalOrganicUnits", "organic_units", "total_organic_units"];
const TOTAL_UNIT_KEYS = ["total_units", "TotalUnits", "totalUnits", "Units", "units"];
const ASIN_KEYS = ["asin", "ASIN", "product_asin", "productAsin", "ProductASIN"];
const SEARCH_TERM_PAGE_SIZE = 500;
const SEARCH_TERM_MAX_PAGES = 5;

function normalizedKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function directPrimitive(record: Record<string, unknown>, keys: string[]) {
  const accepted = new Set(keys.map(normalizedKey));
  for (const [key, value] of Object.entries(record)) {
    if (accepted.has(normalizedKey(key)) && value != null && !isRecord(value) && !Array.isArray(value)) return value;
  }
  return undefined;
}

function numericInteger(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function uniqueNestedIntegerValue(value: unknown, keys: string[], depth = 0): number | undefined {
  if (depth > 5) return undefined;
  if (Array.isArray(value)) {
    const candidates = [...new Set(value.flatMap(item => {
      const candidate = uniqueNestedIntegerValue(item, keys, depth + 1);
      return candidate == null ? [] : [candidate];
    }))];
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  if (!isRecord(value)) return undefined;
  const direct = numericInteger(directPrimitive(value, keys));
  if (direct != null) return direct;
  const candidates = [...new Set(Object.values(value).flatMap(item => {
    const candidate = uniqueNestedIntegerValue(item, keys, depth + 1);
    return candidate == null ? [] : [candidate];
  }))];
  return candidates.length === 1 ? candidates[0] : undefined;
}

function searchTermTrafficRows(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.opps)) return [];
  return payload.opps.flatMap(candidate => {
    if (!isRecord(candidate) || !isRecord(candidate.metrics)) return [];
    const impressions = numericInteger(directPrimitive(candidate.metrics, PPC_IMPRESSION_KEYS));
    const clicks = numericInteger(directPrimitive(candidate.metrics, PPC_CLICK_KEYS));
    const ppcUnits = numericInteger(directPrimitive(candidate.metrics, PPC_UNIT_KEYS));
    return impressions == null || clicks == null ? [] : [{ impressions, clicks, ...(ppcUnits == null ? {} : { ppcUnits }) }];
  });
}

async function loadSearchTermTraffic(params: ScaleInsightsWeeklyPerformanceParams, callTool: ScaleInsightsToolCaller, diagnostic?: PerformanceDiagnosticReporter): Promise<SearchTermTraffic> {
  let ppcImpressions = 0;
  let parsedRows = 0;
  let expectedRows: number | undefined;
  let ppcClicks: number | undefined;
  let ppcUnits: number | undefined;
  let rowPpcUnits = 0;
  let unitRows = 0;
  let dataAsOf = "";

  for (let page = 1; page <= SEARCH_TERM_MAX_PAGES; page += 1) {
    const result = await callTool("get_search_term_performance", {
      asin_list: [params.asin],
      country: params.country,
      start_date: params.startDate,
      end_date: params.endDate,
      mode: "raw",
      waste_only: false,
      sort_by: "sales",
      sort_direction: "desc",
      count: SEARCH_TERM_PAGE_SIZE,
      page,
    });
    const payload = unwrapScaleInsightsPayload(result);
    const scope = isRecord(payload.agg) ? payload.agg : payload;
    assertScope(payload, params, scope);
    const meta = isRecord(payload.oppMeta) ? payload.oppMeta : {};
    const totals = isRecord(meta.totals) ? meta.totals : {};
    const sample = Array.isArray(payload.opps) && isRecord(payload.opps[0]) && isRecord(payload.opps[0].metrics) ? payload.opps[0].metrics : {};
    diagnostic?.("weekly_search_page_contract", {
      page, scopeValidated: true, hasNextPage: meta.has_next_page === true,
      totalCount: numericInteger(meta.total_count), returnedCount: numericInteger(meta.returned_count),
      totalFields: Object.keys(totals).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)).sort().slice(0, 60),
      metricFields: Object.keys(sample).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)).sort().slice(0, 60),
    });
    expectedRows ??= numericInteger(meta.total_count);
    ppcClicks ??= numericInteger(directPrimitive(totals, PPC_CLICK_KEYS));
    ppcUnits ??= numericInteger(directPrimitive(totals, PPC_UNIT_KEYS));
    dataAsOf ||= stringValue(meta.data_as_of);
    const rows = searchTermTrafficRows(payload);
    parsedRows += rows.length;
    ppcImpressions += rows.reduce((total, row) => total + row.impressions, 0);
    rowPpcUnits += rows.reduce((total, row) => total + (row.ppcUnits ?? 0), 0);
    unitRows += rows.filter(row => row.ppcUnits != null).length;
    if (meta.has_next_page === false) break;
    if (meta.has_next_page !== true && (expectedRows == null || page * SEARCH_TERM_PAGE_SIZE >= expectedRows)) break;
  }

  const complete = expectedRows === 0 || expectedRows != null && parsedRows >= expectedRows;
  const completeUnitRows = complete && expectedRows != null && expectedRows > 0 && unitRows >= expectedRows;
  diagnostic?.("weekly_search_coverage", { complete, completeUnitRows, parsedRows, expectedRows, unitRows });
  return {
    ...(ppcClicks == null ? {} : { ppcClicks }),
    ...(complete ? { ppcImpressions } : {}),
    ...(ppcUnits == null ? completeUnitRows ? { ppcUnits: rowPpcUnits } : {} : { ppcUnits }),
    dataAsOf,
    ...(complete ? {} : { warning: `Scale Insights search-term coverage exceeded ${SEARCH_TERM_MAX_PAGES * SEARCH_TERM_PAGE_SIZE} rows; Impressions remain unavailable.` }),
  };
}

function collectScopedIntegerValues(value: unknown, asin: string, keys: string[], depth = 0): number[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) return value.flatMap(item => collectScopedIntegerValues(item, asin, keys, depth + 1));
  if (!isRecord(value)) return [];
  const rowAsin = String(directPrimitive(value, ASIN_KEYS) ?? (value.entityType === "ASIN" ? value.entity : "") ?? "").trim().toUpperCase();
  if (rowAsin && rowAsin !== asin) return [];
  if (rowAsin === asin && isRecord(value.metrics)) return collectScopedIntegerValues({ ...value.metrics, ASIN: asin }, asin, keys, depth + 1);
  const metric = numericInteger(directPrimitive(value, keys));
  const current = rowAsin === asin && metric != null ? [metric] : [];
  return [...current, ...Object.values(value).flatMap(item => collectScopedIntegerValues(item, asin, keys, depth + 1))];
}

function collectTextIntegerValues(result: unknown, asin: string, keys: string[]) {
  if (!isRecord(result) || !Array.isArray(result.content)) return [];
  return result.content.flatMap(block => {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") return [];
    const text = block.text.trim();
    try {
      const parsed: unknown = JSON.parse(text);
      const counts = collectScopedIntegerValues(parsed, asin, keys);
      if (counts.length) return counts;
    } catch {
      // Continue with a provider-rendered Markdown table.
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.includes("|"));
    for (let index = 0; index < lines.length - 2; index += 1) {
      const headers = lines[index].replace(/^\||\|$/g, "").split("|").map(value => value.trim());
      const separator = lines[index + 1].replace(/^\||\|$/g, "").split("|").map(value => value.trim());
      if (separator.length !== headers.length || !separator.every(value => /^:?-{3,}:?$/.test(value))) continue;
      const asinIndex = headers.findIndex(header => ASIN_KEYS.map(normalizedKey).includes(normalizedKey(header)));
      const metricIndex = headers.findIndex(header => keys.map(normalizedKey).includes(normalizedKey(header)));
      if (asinIndex < 0 || metricIndex < 0) continue;
      return lines.slice(index + 2).flatMap(line => {
        const cells = line.replace(/^\||\|$/g, "").split("|").map(value => value.trim());
        if (cells.length !== headers.length || cells[asinIndex].toUpperCase() !== asin) return [];
        const count = numericInteger(cells[metricIndex]);
        return count == null ? [] : [count];
      });
    }
    return [];
  });
}

function exactMetricValue(result: unknown, payload: Record<string, unknown>, totals: Record<string, unknown>, aggregate: Record<string, unknown>, asin: string, keys: string[]) {
  const direct = [
    directPrimitive(totals, keys),
    directPrimitive(aggregate, keys),
  ].map(numericInteger).find(value => value != null);
  if (direct != null) return direct;
  const candidates = [...new Set([...collectScopedIntegerValues(payload, asin, keys), ...collectTextIntegerValues(result, asin, keys)])];
  return candidates.length === 1 ? candidates[0] : undefined;
}

const exactPpcClicks = (result: unknown, payload: Record<string, unknown>, totals: Record<string, unknown>, aggregate: Record<string, unknown>, asin: string) => exactMetricValue(result, payload, totals, aggregate, asin, PPC_CLICK_KEYS);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toolErrorMessage(result: Record<string, unknown>) {
  if (!Array.isArray(result.content)) return "Scale Insights rejected the request.";
  const message = result.content
    .filter(isRecord)
    .filter(block => block.type === "text")
    .map(block => stringValue(block.text))
    .find(Boolean);
  return message || "Scale Insights rejected the request.";
}

export function unwrapScaleInsightsPayload(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) throw new ScaleInsightsDataError("invalid_response", "Scale Insights returned an unreadable response.");
  if (result.isError === true) throw new ScaleInsightsDataError("invalid_response", toolErrorMessage(result));
  if (isRecord(result.structuredContent)) return result.structuredContent;
  if (!Array.isArray(result.content)) return result;

  for (const block of result.content) {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(block.text);
      if (isRecord(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  throw new ScaleInsightsDataError("invalid_response", "Scale Insights returned no structured performance data.");
}

function assertScope(payload: Record<string, unknown>, expected: ScaleInsightsWeeklyPerformanceParams, scope: Record<string, unknown>) {
  const country = stringValue(scope.Country ?? payload.Country).toUpperCase();
  const startDate = stringValue(scope.StartDate ?? payload.StartDate);
  const endDate = stringValue(scope.EndDate ?? payload.EndDate);
  if (country !== expected.country || startDate !== expected.startDate || endDate !== expected.endDate) {
    throw new ScaleInsightsDataError("invalid_response", "Scale Insights returned data for a different marketplace or date range.");
  }
}

function centsEqual(first: number, second: number) {
  return Math.round(first * 100) === Math.round(second * 100);
}

export async function loadScaleInsightsWeeklyPerformance(
  params: ScaleInsightsWeeklyPerformanceParams,
  callTool: ScaleInsightsToolCaller,
  diagnostic?: PerformanceDiagnosticReporter,
): Promise<ScaleInsightsWeeklyPerformance> {
  const commonArgs = {
    asin_list: [params.asin],
    country: params.country,
    start_date: params.startDate,
    end_date: params.endDate,
    mode: "raw",
  };
  const [adsResult, salesResult, searchTermTraffic] = await Promise.all([
    callTool("get_ads_performance", { ...commonArgs, summary_only: false, count: 1, page: 1 }),
    callTool("get_sales_data", { ...commonArgs, summary_only: false, group_by: "total", include_growth: false }),
    loadSearchTermTraffic(params, callTool, diagnostic).catch((): SearchTermTraffic => ({ dataAsOf: "", warning: "Scale Insights did not return complete Search Term Performance traffic; Clicks and Impressions may be unavailable." })),
  ]);

  const ads = unwrapScaleInsightsPayload(adsResult);
  const sales = unwrapScaleInsightsPayload(salesResult);
  const adsAggregate = recordAt(ads, "agg");
  const adsMeta = recordAt(ads, "oppMeta");
  const adsTotals = recordAt(adsMeta, "totals");
  const salesSummary = recordAt(sales, "Summary");
  const salesMeta = recordAt(sales, "Meta");

  assertScope(ads, params, adsAggregate);
  assertScope(sales, params, sales);
  if (finiteNonNegative(adsMeta.total_count, "advertising result count") < 1 || finiteNonNegative(salesMeta.total_count, "sales result count") < 1) {
    throw new ScaleInsightsDataError("no_data", "Scale Insights has no data for this ASIN and reporting period.");
  }

  const spend = finiteNonNegative(adsTotals.total_spend, "Spend");
  const ppcSales = finiteNonNegative(adsTotals.total_sales, "PPC Sales");
  const ppcOrders = nonNegativeInteger(adsTotals.total_orders, "PPC Orders");
  const totalSales = finiteNonNegative(salesSummary.TotalSales, "Total Sales");
  const totalOrders = nonNegativeInteger(salesSummary.TotalOrders, "Total Orders");
  const totalSessions = nonNegativeInteger(salesSummary.TotalSessions, "Total Sessions");
  const ppcClicks = exactPpcClicks(adsResult, ads, adsTotals, adsAggregate, params.asin)
    ?? searchTermTraffic.ppcClicks
    ?? numericInteger(directPrimitive(salesSummary, PPC_CLICK_KEYS));
  const ppcImpressions = exactMetricValue(adsResult, ads, adsTotals, adsAggregate, params.asin, PPC_IMPRESSION_KEYS)
    ?? searchTermTraffic.ppcImpressions;
  let ppcUnits = exactMetricValue(adsResult, ads, adsTotals, adsAggregate, params.asin, PPC_UNIT_KEYS)
    ?? searchTermTraffic.ppcUnits
    ?? exactMetricValue(salesResult, sales, salesSummary, {}, params.asin, SALES_PPC_UNIT_KEYS)
    ?? uniqueNestedIntegerValue(salesSummary, SALES_PPC_UNIT_KEYS);
  let totalUnits = exactMetricValue(salesResult, sales, salesSummary, {}, params.asin, TOTAL_UNIT_KEYS)
    ?? uniqueNestedIntegerValue(salesSummary, TOTAL_UNIT_KEYS);
  const reportedOrganicUnits = exactMetricValue(salesResult, sales, salesSummary, {}, params.asin, ORGANIC_UNIT_KEYS)
    ?? uniqueNestedIntegerValue(salesSummary, ORGANIC_UNIT_KEYS);
  if (totalUnits == null && ppcUnits != null && reportedOrganicUnits != null) totalUnits = ppcUnits + reportedOrganicUnits;
  if (ppcUnits == null && totalUnits != null && reportedOrganicUnits != null && reportedOrganicUnits <= totalUnits) {
    ppcUnits = totalUnits - reportedOrganicUnits;
  }
  const salesPpcCost = finiteNonNegative(salesSummary.TotalPPCCost, "sales-report PPC Cost");
  const salesPpcSales = finiteNonNegative(salesSummary.TotalPPCSales, "sales-report PPC Sales");
  const warnings: string[] = [];

  if (!centsEqual(spend, salesPpcCost) || !centsEqual(ppcSales, salesPpcSales)) {
    warnings.push("Scale Insights advertising and sales reports were synced at different times; paid totals do not yet match exactly.");
  }
  if (ppcSales > totalSales || ppcOrders > totalOrders) {
    warnings.push("Paid attribution exceeds the total-sales report for this period; organic values were clamped to zero.");
  }
  if (ppcClicks == null) {
    warnings.push("Scale Insights did not include PPC Clicks for this reporting period; PPC Conversion Rate is unavailable.");
  }
  if (ppcUnits == null || totalUnits == null) {
    warnings.push("Scale Insights API did not supply the PPC/Organic Units split for this period. Total Units may still be available; orders cannot substitute for units.");
  }
  const fieldNames = (value: unknown) => isRecord(value) ? Object.keys(value).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)).sort().slice(0, 60) : [];
  const firstMetrics = Array.isArray(ads.opps) && isRecord(ads.opps[0]) ? ads.opps[0].metrics : undefined;
  diagnostic?.("weekly_unit_contract", {
    scopeValidated: true, country: params.country, startDate: params.startDate, endDate: params.endDate,
    salesSummaryFields: fieldNames(salesSummary), salesTotalFields: fieldNames(salesMeta.totals),
    salesRowFields: fieldNames(Array.isArray(sales.ASINs) ? sales.ASINs[0] : undefined),
    adsTotalFields: fieldNames(adsTotals), adsMetricFields: fieldNames(firstMetrics),
    salesHasNextPage: salesMeta.has_next_page === true, adsHasNextPage: adsMeta.has_next_page === true,
    hasPpcUnits: ppcUnits != null, hasTotalUnits: totalUnits != null, hasReportedOrganicUnits: reportedOrganicUnits != null,
  });
  if (searchTermTraffic.warning) warnings.push(searchTermTraffic.warning);

  return {
    ...params,
    metricsRevision: 4,
    currency: stringValue(adsAggregate.Currency) || "USD",
    metrics: calculateWeeklyPerformance({ spend, ppcSales, ppcOrders, totalSales, totalOrders, totalSessions, ...(ppcClicks == null ? {} : { ppcClicks }), ...(ppcImpressions == null ? {} : { ppcImpressions }), ...(ppcUnits == null ? {} : { ppcUnits }), ...(totalUnits == null ? {} : { totalUnits }) }),
    freshness: {
      adsDataAsOf: stringValue(adsMeta.data_as_of),
      salesDataAsOf: stringValue(salesMeta.data_as_of),
      salesDataThrough: stringValue(salesMeta.data_through),
      ...(searchTermTraffic.dataAsOf ? { searchDataAsOf: searchTermTraffic.dataAsOf } : {}),
    },
    warnings,
  };
}
