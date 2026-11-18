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

const AD_KEYS = ["spend", "ppcSales", "ppcOrders", "ppcUnits", "ppcClicks", "ppcImpressions"] as const;
const SALES_KEYS = ["totalSales", "totalOrders", "totalUnits", "totalSessions"] as const;

/**
 * Builds weekly performance snapshots from a Scale Insights "Products" ad export (ProductStats.csv)
 * and/or an Amazon Business Report "by Child ASIN" export for the same week. Only `asins` are imported.
 * With one file, the other side's numbers come from `existing` (the saved snapshot for that ASIN and week).
 */
export function importWeeklyPerformanceCsv(files: ImportFile[], asins: string[], weekStart: string, existing: (asin: string) => ScaleInsightsWeeklyPerformance | undefined = () => undefined) {
  const tables = files.map(table);
  const ads = tables.find(t => ["type", "asin", "spent", "sales", "orders"].every(c => t.columns.includes(c)));
  const business = tables.find(t => ["childasin", "orderedproductsales", "totalorderitems"].every(c => t.columns.includes(c)));
  if (!ads && !business) throw new Error("Upload the Scale Insights Products export (ProductStats.csv), the Amazon Business Report by Child ASIN, or both.");

  const wanted = new Set(asins.map(asin => asin.trim().toUpperCase()));
  const adTotals = new Map<string, Totals>();
  ads?.rows.forEach((row, index) => {
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
  business?.rows.forEach((row, index) => {
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
    // A side whose file was not uploaded keeps its saved numbers; a side whose file was uploaded is replaced (zero if the ASIN is absent).
    const saved = existing(asin);
    const keep = (keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, (saved?.metrics as Record<string, number | undefined> | undefined)?.[key] ?? 0]));
    const names = [ads?.name, business?.name].filter(Boolean).join(" and ");
    const snapshot = parsePerformanceSnapshot({
      metricsRevision: PPC_PERFORMANCE_METRICS_REVISION, asin, country: "US", startDate: weekStart, endDate, currency: "USD",
      metrics: { ...keep(AD_KEYS), ...keep(SALES_KEYS), ...(ads ? { spend: 0, ppcSales: 0, ppcOrders: 0, ppcUnits: 0, ppcClicks: 0, ppcImpressions: 0, ...ad } : {}), ...(business ? { totalSales: 0, totalOrders: 0, totalUnits: 0, totalSessions: 0, ...sales } : {}) },
      freshness: {
        adsDataAsOf: ads ? `Imported ${ads.name}` : saved?.freshness.adsDataAsOf ?? "",
        salesDataAsOf: business ? `Imported ${business.name}` : saved?.freshness.salesDataAsOf ?? "",
        salesDataThrough: business ? endDate : saved?.freshness.salesDataThrough ?? endDate,
      },
      warnings: [`Imported from ${names}.`],
    });
    if (!snapshot) throw new Error(`Imported data for ${asin} is invalid.`);
    snapshots.push(snapshot);
  }
  return { snapshots, missing };
}

export const PPC_WEEKLY_IMPORT_HISTORY_KEY = "glassco.ppcWeeklyImportHistory.v1";
export type WeeklyImportHistoryEntry = { id: string; importedAt: string; weekStart: string; files: string[]; products: number; missing: number; by: string };
export type WeeklyImportHistory = Record<string, WeeklyImportHistoryEntry>;
const HISTORY_LIMIT = 50;

export function parseWeeklyImportHistory(raw: string | null): WeeklyImportHistory {
  try {
    const value: unknown = JSON.parse(raw || "null");
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return {};
    const entries = (value as { entries?: unknown }).entries;
    if (!entries || typeof entries !== "object") return {};
    return Object.fromEntries(Object.entries(entries).flatMap(([key, candidate]) => {
      const entry = candidate as Partial<WeeklyImportHistoryEntry> | null;
      const valid = entry && entry.id === key && typeof entry.importedAt === "string" && !Number.isNaN(Date.parse(entry.importedAt))
        && typeof entry.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.weekStart)
        && Array.isArray(entry.files) && entry.files.every(file => typeof file === "string")
        && Number.isInteger(entry.products) && Number.isInteger(entry.missing) && typeof entry.by === "string";
      return valid ? [[key, { id: entry.id!, importedAt: entry.importedAt!, weekStart: entry.weekStart!, files: entry.files!.slice(0, 5), products: entry.products!, missing: entry.missing!, by: entry.by! }]] : [];
    }));
  } catch {
    return {};
  }
}

/** Adds an entry and keeps the newest HISTORY_LIMIT imports. */
export function withWeeklyImportHistoryEntry(history: WeeklyImportHistory, entry: WeeklyImportHistoryEntry): WeeklyImportHistory {
  const entries = [...Object.values(history), entry].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, HISTORY_LIMIT);
  return Object.fromEntries(entries.map(item => [item.id, item]));
}
