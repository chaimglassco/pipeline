import type { ScaleInsightsWeeklyPerformance } from "../data/scale-insights-performance";
import { parseAuditCsv } from "./ppc-audit";
import { addDaysIso } from "./ppc-dashboard-state";
import { PPC_PERFORMANCE_METRICS_REVISION, parsePerformanceSnapshot } from "./ppc-performance-cache";

type ImportFile = { name: string; text: string };
type Totals = Record<string, number>;

const norm = (value: string) => value.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function table(file: ImportFile) {
  const [header = [], ...rows] = parseAuditCsv(file.text);
  const columns = header.map(norm);
  return { columns, rows, name: file.name };
}

function reader(columns: string[], row: string[], fileName: string, rowNumber: number) {
  return (column: string, integer = false) => {
    const index = columns.indexOf(column);
    const text = (index < 0 ? "" : row[index] ?? "").trim().replace(/[$,%\s]/g, "");
    if (!text) return 0;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new Error(`${fileName}, row ${rowNumber}: invalid ${column}.`);
    return value;
  };
}

/**
 * Builds weekly performance snapshots from a Scale Insights "Products" ad export (ProductStats.csv)
 * and an Amazon Business Report "by Child ASIN" export for the same week. Only `asins` are imported.
 */
export function importWeeklyPerformanceCsv(files: ImportFile[], asins: string[], weekStart: string) {
  const tables = files.map(table);
  const ads = tables.find(t => ["type", "asin", "spent", "sales", "orders"].every(c => t.columns.includes(c)));
  const business = tables.find(t => ["childasin", "orderedproductsales", "totalorderitems"].every(c => t.columns.includes(c)));
  if (!ads || !business) throw new Error("Upload both files: the Scale Insights Products export (ProductStats.csv) and the Amazon Business Report by Child ASIN.");

  const wanted = new Set(asins.map(asin => asin.trim().toUpperCase()));
  const adTotals = new Map<string, Totals>();
  ads.rows.forEach((row, index) => {
    const asin = (row[ads.columns.indexOf("asin")] ?? "").trim().toUpperCase();
    if (!wanted.has(asin)) return;
    const get = reader(ads.columns, row, ads.name, index + 2);
    // One row per ad type (Products, Display, …); add them per ASIN.
    const sum = adTotals.get(asin) ?? { spend: 0, ppcSales: 0, ppcOrders: 0, ppcUnits: 0, ppcClicks: 0, ppcImpressions: 0 };
    sum.spend += get("spent"); sum.ppcSales += get("sales"); sum.ppcOrders += get("orders", true); sum.ppcUnits += get("units", true); sum.ppcClicks += get("clicks", true); sum.ppcImpressions += get("impressions", true);
    // Money sums pick up float noise (0.1 + 0.2); keep cents.
    sum.spend = Math.round(sum.spend * 100) / 100; sum.ppcSales = Math.round(sum.ppcSales * 100) / 100;
    adTotals.set(asin, sum);
  });
  const salesTotals = new Map<string, Totals>();
  business.rows.forEach((row, index) => {
    const asin = (row[business.columns.indexOf("childasin")] ?? "").trim().toUpperCase();
    if (!wanted.has(asin)) return;
    if (salesTotals.has(asin)) throw new Error(`${business.name} lists ${asin} twice.`);
    const get = reader(business.columns, row, business.name, index + 2);
    salesTotals.set(asin, { totalSales: get("orderedproductsales"), totalOrders: get("totalorderitems", true), totalUnits: get("unitsordered", true), totalSessions: get("sessionstotal", true) });
  });

  const endDate = addDaysIso(weekStart, 6);
  const snapshots: ScaleInsightsWeeklyPerformance[] = [];
  const missing: string[] = [];
  for (const asin of wanted) {
    const ad = adTotals.get(asin), sales = salesTotals.get(asin);
    // An ASIN in neither file keeps whatever data it already had.
    if (!ad && !sales) { missing.push(asin); continue; }
    const snapshot = parsePerformanceSnapshot({
      metricsRevision: PPC_PERFORMANCE_METRICS_REVISION, asin, country: "US", startDate: weekStart, endDate, currency: "USD",
      metrics: { spend: 0, ppcSales: 0, ppcOrders: 0, ppcUnits: 0, ppcClicks: 0, ppcImpressions: 0, totalSales: 0, totalOrders: 0, totalUnits: 0, totalSessions: 0, ...ad, ...sales },
      freshness: { adsDataAsOf: `Imported ${ads.name}`, salesDataAsOf: `Imported ${business.name}`, salesDataThrough: endDate },
      warnings: [`Imported from ${ads.name} and ${business.name}.`],
    });
    if (!snapshot) throw new Error(`Imported data for ${asin} is invalid.`);
    snapshots.push(snapshot);
  }
  return { snapshots, missing };
}
