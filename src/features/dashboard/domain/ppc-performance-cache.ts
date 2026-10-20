import { calculateWeeklyPerformance } from "./ppc-dashboard-state";
import type { ScaleInsightsWeeklyPerformance } from "../data/scale-insights-performance";

export const PPC_PERFORMANCE_CACHE_KEY = "glassco.ppcPerformanceCache.v1";
export const PPC_PERFORMANCE_METRICS_REVISION = 4;
export type PerformanceCache = Record<string, ScaleInsightsWeeklyPerformance>;
export const performanceCacheKey = (asin: string, weekStart: string) => `US:${asin.trim().toUpperCase()}:${weekStart}`;
export const performanceSnapshotNeedsMetricsUpgrade = (snapshot: ScaleInsightsWeeklyPerformance | undefined) => snapshot?.metricsRevision !== PPC_PERFORMANCE_METRICS_REVISION;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : "";

export function parsePerformanceSnapshot(value: unknown): ScaleInsightsWeeklyPerformance | null {
  if (!record(value) || !record(value.metrics) || !record(value.freshness)) return null;
  const { asin, country, startDate, endDate, metrics } = value;
  if (typeof asin !== "string" || !/^[A-Z0-9]{10}$/.test(asin) || country !== "US") return null;
  if (typeof startDate !== "string" || typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate || start.getUTCDay() !== 3 || end.getTime() - start.getTime() > 6 * 86_400_000) return null;
  const { spend, ppcSales, ppcOrders, totalSales, totalOrders, totalSessions, ppcClicks, ppcImpressions, ppcUnits, totalUnits } = metrics;
  if (![spend, ppcSales, ppcOrders, totalSales, totalOrders].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) || !Number.isInteger(ppcOrders) || !Number.isInteger(totalOrders)) return null;
  if (totalSessions != null && (typeof totalSessions !== "number" || !Number.isFinite(totalSessions) || totalSessions < 0 || !Number.isInteger(totalSessions))) return null;
  if (ppcClicks != null && (typeof ppcClicks !== "number" || !Number.isFinite(ppcClicks) || ppcClicks < 0 || !Number.isInteger(ppcClicks))) return null;
  for (const value of [ppcImpressions, ppcUnits, totalUnits]) if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value))) return null;
  return {
    asin, country, startDate, endDate, ...(value.metricsRevision === 2 || value.metricsRevision === 3 || value.metricsRevision === 4 ? { metricsRevision: value.metricsRevision } : {}), currency: text(value.currency),
    metrics: calculateWeeklyPerformance({ spend: spend as number, ppcSales: ppcSales as number, ppcOrders: ppcOrders as number, totalSales: totalSales as number, totalOrders: totalOrders as number, ...(totalSessions == null ? {} : { totalSessions }), ...(ppcClicks == null ? {} : { ppcClicks }), ...(typeof ppcImpressions === "number" ? { ppcImpressions } : {}), ...(typeof ppcUnits === "number" ? { ppcUnits } : {}), ...(typeof totalUnits === "number" ? { totalUnits } : {}) }),
    freshness: { adsDataAsOf: text(value.freshness.adsDataAsOf), salesDataAsOf: text(value.freshness.salesDataAsOf), salesDataThrough: text(value.freshness.salesDataThrough), ...(value.freshness.searchDataAsOf == null ? {} : { searchDataAsOf: text(value.freshness.searchDataAsOf) }) },
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 10).map(text) : [],
  };
}

export function parsePerformanceCache(raw: string | null): PerformanceCache {
  try {
    const value: unknown = JSON.parse(raw || "null");
    if (!record(value) || value.version !== 1 || !record(value.entries)) return {};
    return Object.fromEntries(Object.values(value.entries).flatMap(candidate => {
      const snapshot = parsePerformanceSnapshot(candidate);
      return snapshot ? [[performanceCacheKey(snapshot.asin, snapshot.startDate), snapshot]] : [];
    }));
  } catch { return {}; }
}
