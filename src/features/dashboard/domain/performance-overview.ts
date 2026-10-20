export type PerformanceOverviewSectionKey = "keywords" | "campaigns" | "productTargets" | "searchTerms";
export type PerformanceOverviewPeriodKey = "yesterday" | "sevenDays" | "fourteenDays" | "selectedRange";

export type PerformanceOverviewMetrics = {
  totalSales: number;
  ppcSales: number;
  spend: number;
  totalOrders: number;
  ppcOrders: number;
  clicks: number;
};

export type PerformanceOverviewRow = {
  id: string;
  name: string;
  campaign: string;
  asin: string;
  matchType: string;
  targetType: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number | null;
  roas: number | null;
  conversionRate: number | null;
  state?: string;
  cpc?: number | null;
  ctr?: number | null;
  dailyBudget?: number | null;
};

export type PerformanceOverviewSection = {
  status: "ready" | "unavailable";
  message: string;
  rows: PerformanceOverviewRow[];
};

export type PerformanceOverviewAsinRow = {
  asin: string;
  spend: number;
  ppcSales: number;
  ppcOrders: number;
  clicks: number;
  totalSales: number;
  totalOrders: number;
  previousTotalSales: number | null;
};

export type PerformanceOverviewAsinRanking = {
  status: "ready" | "unavailable";
  message: string;
  rows: PerformanceOverviewAsinRow[];
};

export type PerformanceOverviewDailyPoint = {
  date: string;
  spend: number;
  ppcSales: number;
  totalSales: number;
  acos: number | null;
  tacos: number | null;
};

export type PerformanceOverviewData = {
  asins: string[];
  country: string;
  currency: string;
  requestedPeriod: { startDate: string; endDate: string };
  actualPeriod: { startDate: string; endDate: string };
  freshness: string;
  periods: Record<PerformanceOverviewPeriodKey, PerformanceOverviewMetrics | null>;
  dailyPerformance: PerformanceOverviewDailyPoint[];
  asinRanking: PerformanceOverviewAsinRanking;
  sections: Record<PerformanceOverviewSectionKey, PerformanceOverviewSection>;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMetrics(value: unknown): PerformanceOverviewMetrics | null {
  if (!isRecord(value)) return null;
  const totalSales = finiteNonNegative(value.totalSales);
  const ppcSales = finiteNonNegative(value.ppcSales);
  const spend = finiteNonNegative(value.spend);
  const totalOrders = finiteNonNegative(value.totalOrders);
  const ppcOrders = finiteNonNegative(value.ppcOrders);
  const clicks = finiteNonNegative(value.clicks);
  return [totalSales, ppcSales, spend, totalOrders, ppcOrders, clicks].some(metric => metric == null)
    ? null
    : { totalSales: totalSales!, ppcSales: ppcSales!, spend: spend!, totalOrders: totalOrders!, ppcOrders: ppcOrders!, clicks: clicks! };
}

function parseRow(value: unknown): PerformanceOverviewRow | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const impressions = finiteNonNegative(value.impressions);
  const clicks = finiteNonNegative(value.clicks);
  const spend = finiteNonNegative(value.spend);
  const sales = finiteNonNegative(value.sales);
  const orders = finiteNonNegative(value.orders);
  const nullableMetric = (candidate: unknown) => candidate === null ? null : finiteNonNegative(candidate);
  const acos = nullableMetric(value.acos);
  const roas = nullableMetric(value.roas);
  const conversionRate = nullableMetric(value.conversionRate);
  const optionalMetric = (candidate: unknown) => candidate === undefined ? undefined : nullableMetric(candidate);
  const cpc = optionalMetric(value.cpc);
  const ctr = optionalMetric(value.ctr);
  const dailyBudget = optionalMetric(value.dailyBudget);
  const invalidOptionalMetric = ["cpc", "ctr", "dailyBudget"].some(key => value[key] != null && finiteNonNegative(value[key]) == null);
  if (!id || !name || [impressions, clicks, spend, sales, orders].some(metric => metric == null) || acos === undefined || roas === undefined || conversionRate === undefined || invalidOptionalMetric) return null;
  return {
    id,
    name,
    campaign: stringValue(value.campaign),
    asin: stringValue(value.asin).toUpperCase(),
    matchType: stringValue(value.matchType),
    targetType: stringValue(value.targetType),
    impressions: impressions!,
    clicks: clicks!,
    spend: spend!,
    sales: sales!,
    orders: orders!,
    acos,
    roas,
    conversionRate,
    state: stringValue(value.state) || undefined,
    cpc,
    ctr,
    dailyBudget,
  };
}

function parseAsinRow(value: unknown): PerformanceOverviewAsinRow | null {
  if (!isRecord(value)) return null;
  const asin = stringValue(value.asin).toUpperCase();
  const spend = finiteNonNegative(value.spend);
  const ppcSales = finiteNonNegative(value.ppcSales);
  const ppcOrders = finiteNonNegative(value.ppcOrders);
  const clicks = finiteNonNegative(value.clicks);
  const totalSales = finiteNonNegative(value.totalSales);
  const totalOrders = finiteNonNegative(value.totalOrders);
  const previousTotalSales = value.previousTotalSales === null ? null : finiteNonNegative(value.previousTotalSales);
  if (!/^[A-Z0-9]{10}$/.test(asin) || [spend, ppcSales, ppcOrders, clicks, totalSales, totalOrders].some(metric => metric == null) || previousTotalSales === null && value.previousTotalSales !== null) return null;
  return { asin, spend: spend!, ppcSales: ppcSales!, ppcOrders: ppcOrders!, clicks: clicks!, totalSales: totalSales!, totalOrders: totalOrders!, previousTotalSales };
}

function parsePeriod(value: unknown) {
  if (!isRecord(value)) return null;
  const startDate = stringValue(value.startDate);
  const endDate = stringValue(value.endDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate ? { startDate, endDate } : null;
}

function parseDailyPoint(value: unknown): PerformanceOverviewDailyPoint | null {
  if (!isRecord(value)) return null;
  const date = stringValue(value.date);
  const spend = finiteNonNegative(value.spend);
  const ppcSales = finiteNonNegative(value.ppcSales);
  const totalSales = finiteNonNegative(value.totalSales);
  const nullableMetric = (candidate: unknown) => candidate === null ? null : finiteNonNegative(candidate);
  const acos = nullableMetric(value.acos);
  const tacos = nullableMetric(value.tacos);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || spend == null || ppcSales == null || totalSales == null || acos === undefined || tacos === undefined) return null;
  return { date, spend, ppcSales, totalSales, acos, tacos };
}

export function parsePerformanceOverviewData(value: unknown): PerformanceOverviewData | null {
  if (!isRecord(value) || !Array.isArray(value.asins) || !isRecord(value.periods) || !Array.isArray(value.dailyPerformance) || !isRecord(value.asinRanking) || !isRecord(value.sections) || !Array.isArray(value.warnings)) return null;
  const asins = value.asins.every(asin => typeof asin === "string" && /^[A-Z0-9]{10}$/.test(asin)) ? value.asins as string[] : null;
  const country = stringValue(value.country).toUpperCase();
  const currency = stringValue(value.currency).toUpperCase();
  const requestedPeriod = parsePeriod(value.requestedPeriod);
  const actualPeriod = parsePeriod(value.actualPeriod);
  if (!asins || !/^[A-Z]{2}$/.test(country) || !/^[A-Z]{3}$/.test(currency) || !requestedPeriod || !actualPeriod) return null;

  const periods = {} as PerformanceOverviewData["periods"];
  for (const key of ["yesterday", "sevenDays", "fourteenDays", "selectedRange"] as const) {
    const candidate = value.periods[key];
    const parsed = candidate === null ? null : parseMetrics(candidate);
    if (candidate !== null && !parsed) return null;
    periods[key] = parsed;
  }

  const dailyPerformance = value.dailyPerformance.map(parseDailyPoint);
  if (dailyPerformance.some(point => !point)) return null;
  const dailyDates = (dailyPerformance as PerformanceOverviewDailyPoint[]).map(point => point.date);
  if (dailyDates.some((date, index) => date < actualPeriod.startDate || date > actualPeriod.endDate || (index > 0 && date <= dailyDates[index - 1]))) return null;

  if ((value.asinRanking.status !== "ready" && value.asinRanking.status !== "unavailable") || typeof value.asinRanking.message !== "string" || !Array.isArray(value.asinRanking.rows)) return null;
  const asinRows = value.asinRanking.rows.map(parseAsinRow);
  if (asinRows.some(row => !row)) return null;
  const asinRanking: PerformanceOverviewAsinRanking = { status: value.asinRanking.status, message: value.asinRanking.message, rows: asinRows as PerformanceOverviewAsinRow[] };

  const sections = {} as PerformanceOverviewData["sections"];
  for (const key of ["keywords", "campaigns", "productTargets", "searchTerms"] as const) {
    const candidate = value.sections[key];
    if (!isRecord(candidate) || (candidate.status !== "ready" && candidate.status !== "unavailable") || typeof candidate.message !== "string" || !Array.isArray(candidate.rows)) return null;
    const rows = candidate.rows.map(parseRow);
    if (rows.some(row => !row)) return null;
    sections[key] = { status: candidate.status, message: candidate.message, rows: rows as PerformanceOverviewRow[] };
  }

  if (!value.warnings.every(warning => typeof warning === "string")) return null;
  return { asins, country, currency, requestedPeriod, actualPeriod, freshness: stringValue(value.freshness), periods, dailyPerformance: dailyPerformance as PerformanceOverviewDailyPoint[], asinRanking, sections, warnings: value.warnings as string[] };
}
