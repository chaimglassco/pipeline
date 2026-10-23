import { calculateWeeklyPerformance, createWeeklyPpcReport, withCalculatedPerformance, type WeeklyPpcReport, type WeeklyPerformanceSourceMetrics } from "./ppc-dashboard-state";
import type { ScaleInsightsWeeklyPerformance } from "../data/scale-insights-performance";
export const MANUAL_METRIC_FIELDS = ["spend","ppcSales","totalSales","ppcOrders","totalOrders","totalUnits","ppcUnits","ppcImpressions","ppcClicks","totalSessions"] as const;
export const manualForAsin = (report: WeeklyPpcReport | null | undefined, asin: string) => !!report?.manualPerformance && report.manualPerformance.asin === asin.trim().toUpperCase();
export function resolveWeeklyPerformance(report: WeeklyPpcReport | null, snapshot: ScaleInsightsWeeklyPerformance | undefined, asin: string) {
  if (!report) return null;
  if (manualForAsin(report,asin)) return withCalculatedPerformance({...report,...emptyManualMetrics(),...report.manualPerformance!.metrics,totalUnits:report.manualPerformance!.metrics.totalUnits,ppcUnits:report.manualPerformance!.metrics.ppcUnits,ppcClicks:report.manualPerformance!.metrics.ppcClicks,ppcImpressions:report.manualPerformance!.metrics.ppcImpressions,totalSessions:report.manualPerformance!.metrics.totalSessions});
  if (snapshot) return withCalculatedPerformance({...report,...emptyManualMetrics(),...snapshot.metrics,ppcClicks:snapshot.metrics.ppcClicks});
  if (report.manualPerformance) return withCalculatedPerformance({...report,...emptyManualMetrics()});
  return report;
}
export function emptyManualMetrics(): WeeklyPerformanceSourceMetrics & {organicUnits?:number;cpc?:number;conversionRate?:number} { return {organicUnits:undefined,cpc:undefined,conversionRate:undefined,spend:0,ppcSales:0,totalSales:0,ppcOrders:0,totalOrders:0,totalUnits:undefined,ppcUnits:undefined,ppcImpressions:undefined,ppcClicks:undefined,totalSessions:undefined}; }
export function saveManualPerformance(report: WeeklyPpcReport, asin: string, metrics: WeeklyPerformanceSourceMetrics, dataState: "Partial"|"Final", now: string): WeeklyPpcReport {
  return withCalculatedPerformance({...report,...emptyManualMetrics(),...calculateWeeklyPerformance(metrics),manualPerformance:{version:1,asin:asin.trim().toUpperCase(),metrics,dataState,updatedAt:now}});
}
export function resumeAutomaticPerformance(report: WeeklyPpcReport, snapshot: ScaleInsightsWeeklyPerformance | undefined): WeeklyPpcReport {
  const clean={...report,...emptyManualMetrics(),manualPerformance:undefined};
  return resolveWeeklyPerformance(clean,snapshot,"") ?? createWeeklyPpcReport(report.productId,report.weekStart);
}
