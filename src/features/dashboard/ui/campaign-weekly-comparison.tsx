"use client";

import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, BarChart3, CheckCircle2, ChevronDown, ExternalLink, FileUp, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addDaysIso } from "../domain/ppc-dashboard-state";
import {
  CAMPAIGN_OUTCOME_CATEGORIES,
  getCampaignAcos,
  getCampaignOutcomes,
  getScaleInsightsCampaignTrendHref,
  HIGH_ACOS_THRESHOLD,
  type CampaignComparisonRow,
  type CampaignOutcomeGroup,
  type CampaignOutcomeCategoryId,
  type CampaignWeeklyComparison,
} from "../domain/campaign-weekly-comparison";
import {
  campaignCsvCacheKey,
  createCampaignComparisonFromCsv,
  createCampaignComparisonFromPreviousComparison,
  inferCsvPeriodFromFileName,
  parseCampaignCsvImportCache,
  PPC_CAMPAIGN_CSV_CACHE_KEY,
  withCampaignCsvImport,
  type CampaignCsvImport,
} from "../domain/campaign-comparison-csv";
import ws from "./ppc-performance-workspace.module.css";
import styles from "./campaign-weekly-comparison.module.css";
import { dashboardStorage } from "../state/shared-dashboard-client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatPeriod(startDate: string, endDate: string) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
}

function formatDelta(value: number, percentage: number | null, currency: string) {
  const sign = value > 0 ? "+" : "";
  const percentageText = percentage == null ? "new" : `${percentage > 0 ? "+" : ""}${Math.round(percentage)}%`;
  return `${sign}${formatCurrency(value, currency)} (${percentageText})`;
}

function expectedPeriods(weekStart: string) {
  return {
    previous: { startDate: addDaysIso(weekStart, -7), endDate: addDaysIso(weekStart, -1) },
    current: { startDate: weekStart, endDate: addDaysIso(weekStart, 6) },
  };
}

function periodMismatch(file: File, expected: { startDate: string; endDate: string }) {
  const inferred = inferCsvPeriodFromFileName(file.name, Number(expected.startDate.slice(0, 4)));
  if (!inferred || (inferred.startDate === expected.startDate && inferred.endDate === expected.endDate)) return "";
  return `${file.name} appears to cover ${formatPeriod(inferred.startDate, inferred.endDate)}, but this slot requires ${formatPeriod(expected.startDate, expected.endDate)}.`;
}

type CampaignSortMetric = "previousSpend" | "currentSpend" | "spendChange" | "previousSales" | "currentSales" | "salesChange" | "orders" | "currentAcos";
type CampaignSortDirection = "asc" | "desc";
type CampaignSort = { metric: CampaignSortMetric; direction: CampaignSortDirection };

const CAMPAIGN_SORT_LABELS: Record<CampaignSortMetric, string> = {
  previousSpend: "Previous Spend",
  currentSpend: "Current Spend",
  spendChange: "Spend Change",
  previousSales: "Previous Sales",
  currentSales: "Current Sales",
  salesChange: "Sales Change",
  orders: "Current Orders",
  currentAcos: "Current ACOS",
};

function campaignSortValue(campaign: CampaignComparisonRow, metric: CampaignSortMetric) {
  if (metric === "previousSpend") return campaign.previous.spend;
  if (metric === "currentSpend") return campaign.current.spend;
  if (metric === "spendChange") return campaign.delta.spend.absolute;
  if (metric === "previousSales") return campaign.previous.sales;
  if (metric === "currentSales") return campaign.current.sales;
  if (metric === "salesChange") return campaign.delta.sales.absolute;
  if (metric === "orders") return campaign.current.orders;
  return getCampaignAcos(campaign.current);
}

function sortCampaignRows(rows: CampaignComparisonRow[], sort: CampaignSort | undefined) {
  if (!sort) return rows;
  return rows.toSorted((first, second) => {
    const firstValue = campaignSortValue(first, sort.metric);
    const secondValue = campaignSortValue(second, sort.metric);
    if (firstValue == null && secondValue == null) return first.campaignName.localeCompare(second.campaignName);
    if (firstValue == null) return 1;
    if (secondValue == null) return -1;
    const difference = sort.direction === "desc" ? secondValue - firstValue : firstValue - secondValue;
    return difference || first.campaignName.localeCompare(second.campaignName);
  });
}

function SortableCampaignHeader({ metric, sort, onSort, children }: { metric: CampaignSortMetric; sort: CampaignSort | undefined; onSort: (metric: CampaignSortMetric) => void; children?: string }) {
  const active = sort?.metric === metric;
  const nextDirection = active && sort.direction === "desc" ? "lowest to highest" : "highest to lowest";
  const Icon = active ? (sort.direction === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return <th scope="col" aria-sort={active ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
    <button type="button" className={styles.sortButton} aria-label={`Sort ${CAMPAIGN_SORT_LABELS[metric]} ${nextDirection}`} onClick={() => onSort(metric)}>{children ?? CAMPAIGN_SORT_LABELS[metric]}<Icon aria-hidden="true" /></button>
  </th>;
}

function CampaignTable({ comparison, group }: { comparison: CampaignWeeklyComparison; group: CampaignOutcomeGroup }) {
  const categories = CAMPAIGN_OUTCOME_CATEGORIES.filter(category => category.group === group);
  const [sorts, setSorts] = useState<Partial<Record<CampaignOutcomeCategoryId, CampaignSort>>>({});
  const updateSort = (categoryId: CampaignOutcomeCategoryId, metric: CampaignSortMetric) => {
    setSorts(current => {
      const active = current[categoryId];
      return { ...current, [categoryId]: { metric, direction: active?.metric === metric && active.direction === "desc" ? "asc" : "desc" } };
    });
  };
  return <section className={`${styles.outcomeGroup} ${styles[`outcome${group}`]}`} aria-labelledby={`campaign-${group.toLowerCase()}-heading`}>
    <header className={styles.outcomeGroupHeader}>
      <h4 id={`campaign-${group.toLowerCase()}-heading`}>{group === "Good" ? <CheckCircle2 aria-hidden="true" /> : group === "Bad" ? <TriangleAlert aria-hidden="true" /> : <BarChart3 aria-hidden="true" />}{group}</h4>
      <span>{categories.reduce((total, category) => total + getCampaignOutcomes(comparison.campaigns, category).length, 0)} campaigns</span>
    </header>
    <div className={styles.accordionList}>{categories.map(category => {
      const rows = sortCampaignRows(getCampaignOutcomes(comparison.campaigns, category), sorts[category.id]);
      return <details className={`${styles.moverAccordion} ${styles[`group${group}`]}`} key={category.id}>
        <summary>
          <span className={styles.categoryIcon}>{group === "Good" ? <CheckCircle2 aria-hidden="true" /> : group === "Bad" ? <TriangleAlert aria-hidden="true" /> : <BarChart3 aria-hidden="true" />}</span>
          <span><strong>{category.label}</strong><small>{category.description}</small></span>
          <span className={styles.categorySummary}>{rows.length} campaign{rows.length === 1 ? "" : "s"}</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.accordionContent}>{rows.length ? <div className={styles.tableScroll}>
          <table aria-label={`${category.label} campaigns`}>
            <thead><tr><th>Campaign</th><SortableCampaignHeader metric="previousSpend" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="currentSpend" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="spendChange" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="previousSales" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="currentSales" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="salesChange" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /><SortableCampaignHeader metric="orders" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)}>Orders</SortableCampaignHeader><SortableCampaignHeader metric="currentAcos" sort={sorts[category.id]} onSort={metric => updateSort(category.id, metric)} /></tr></thead>
            <tbody>{rows.map(campaign => {
              const currentAcos = getCampaignAcos(campaign.current);
              return <tr key={`${campaign.sponsoredType}:${campaign.campaignId}`}>
                <th scope="row"><a href={getScaleInsightsCampaignTrendHref(campaign, comparison.previousPeriod.startDate, comparison.currentPeriod.endDate)} target="_blank" rel="noopener noreferrer"><span>{campaign.campaignName}</span><ExternalLink aria-hidden="true" /></a><small>{campaign.campaignId}</small></th>
                <td>{formatCurrency(campaign.previous.spend, comparison.currency)}</td>
                <td>{formatCurrency(campaign.current.spend, comparison.currency)}</td>
                <td className={campaign.delta.spend.absolute > 0 ? styles.deltaIncrease : campaign.delta.spend.absolute < 0 ? styles.deltaDecline : styles.deltaNeutral}>{formatDelta(campaign.delta.spend.absolute, campaign.delta.spend.percentage, comparison.currency)}</td>
                <td>{formatCurrency(campaign.previous.sales, comparison.currency)}</td>
                <td><strong>{formatCurrency(campaign.current.sales, comparison.currency)}</strong></td>
                <td className={campaign.delta.sales.absolute > 0 ? styles.deltaIncrease : campaign.delta.sales.absolute < 0 ? styles.deltaDecline : styles.deltaNeutral}>{formatDelta(campaign.delta.sales.absolute, campaign.delta.sales.percentage, comparison.currency)}</td>
                <td>{campaign.previous.orders} <ArrowRight aria-hidden="true" /> <strong>{campaign.current.orders}</strong></td>
                <td className={currentAcos != null && currentAcos >= HIGH_ACOS_THRESHOLD ? styles.highAcos : ""}>{currentAcos == null ? "—" : `${Math.round(currentAcos)}%`}</td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <p className={styles.emptyCategory}>No campaigns match this rule.</p>}</div>
      </details>;
    })}</div>
  </section>;
}

export function CampaignWeeklyComparison({ asin, country = "US", weekStart }: { asin: string; country?: string; weekStart: string; refreshVersion: number }) {
  const comparisonKey = campaignCsvCacheKey(country, asin, weekStart);
  const periods = useMemo(() => expectedPeriods(weekStart), [weekStart]);
  const [entry, setEntry] = useState<CampaignCsvImport | null>(null);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [carriedPreviousEntry, setCarriedPreviousEntry] = useState<CampaignCsvImport | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cache = parseCampaignCsvImportCache(dashboardStorage().getItem(PPC_CAMPAIGN_CSV_CACHE_KEY));
      const nextEntry = cache[comparisonKey] ?? null;
      const previousEntry = cache[campaignCsvCacheKey(country, asin, periods.previous.startDate)] ?? null;
      const reusablePreviousEntry = previousEntry
        && previousEntry.comparison.currentPeriod.startDate === periods.previous.startDate
        && previousEntry.comparison.currentPeriod.endDate === periods.previous.endDate
        ? previousEntry
        : null;
      setEntry(nextEntry);
      setCarriedPreviousEntry(reusablePreviousEntry);
      setPreviousFile(null);
      setCurrentFile(null);
      setShowImporter(!nextEntry);
      setError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [asin, comparisonKey, country, periods]);

  const importComparison = async () => {
    if ((!previousFile && !carriedPreviousEntry) || !currentFile || !asin) return;
    setImporting(true);
    setError("");
    try {
      const previousMismatch = previousFile ? periodMismatch(previousFile, periods.previous) : "";
      const currentMismatch = periodMismatch(currentFile, periods.current);
      if (previousMismatch || currentMismatch) throw new Error([previousMismatch, currentMismatch].filter(Boolean).join(" "));
      const currentText = await currentFile.text();
      const comparison = previousFile
        ? createCampaignComparisonFromCsv({ asin, country, previousText: await previousFile.text(), currentText, previousPeriod: periods.previous, currentPeriod: periods.current })
        : createCampaignComparisonFromPreviousComparison({ asin, country, previousComparison: carriedPreviousEntry!.comparison, currentText, previousPeriod: periods.previous, currentPeriod: periods.current });
      const nextEntry: CampaignCsvImport = { comparison, previousFileName: previousFile?.name ?? carriedPreviousEntry!.currentFileName, currentFileName: currentFile.name, importedAt: new Date().toISOString() };
      const cache = parseCampaignCsvImportCache(dashboardStorage().getItem(PPC_CAMPAIGN_CSV_CACHE_KEY));
      dashboardStorage().setItem(PPC_CAMPAIGN_CSV_CACHE_KEY, JSON.stringify({ version: 1, entries: withCampaignCsvImport(cache, nextEntry) }));
      setEntry(nextEntry);
      setShowImporter(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The campaign CSV files could not be imported.");
    } finally {
      setImporting(false);
    }
  };

  const comparison = entry?.comparison;
  return <section className={`${ws.card} ${styles.comparisonCard}`} aria-labelledby="campaign-comparison-heading">
    <header className={styles.comparisonHeader}>
      <div><h3 id="campaign-comparison-heading"><BarChart3 aria-hidden="true" />Campaign Week-over-Week Comparison</h3><p>Campaigns are grouped by Spend and Sales movement. ACOS of {HIGH_ACOS_THRESHOLD}% or higher is considered high for new-spend campaigns.</p></div>
      {comparison ? <button type="button" className={styles.replaceButton} onClick={() => setShowImporter(value => !value)}><RefreshCw aria-hidden="true" />{showImporter ? "Cancel" : "Replace CSVs"}</button> : null}
    </header>

    {showImporter ? <div className={styles.csvImporter}>
      <div className={styles.importNotice}><FileUp aria-hidden="true" /><span><strong>{carriedPreviousEntry ? "Upload the current-week Scale Insights Campaign CSV" : "Upload two Scale Insights Campaign CSV exports"}</strong><small>{carriedPreviousEntry ? `The saved ${formatPeriod(periods.previous.startDate, periods.previous.endDate)} export will be reused as the previous week. Upload only the new current week for ${asin || "the selected ASIN"}.` : `The files do not include report dates or advertised ASIN. They will be assigned to the labeled weeks and saved locally for ${asin || "the selected ASIN"}. Export them after filtering Scale Insights to this product.`}</small></span></div>
      <div className={styles.fileGrid}>
        {carriedPreviousEntry ? <div className={styles.carriedFile} aria-label="Reused previous week campaign CSV"><span>Previous week · Reused</span><strong>{formatPeriod(periods.previous.startDate, periods.previous.endDate)}</strong><small>{carriedPreviousEntry.currentFileName}</small></div> : <label><span>Previous week</span><strong>{formatPeriod(periods.previous.startDate, periods.previous.endDate)}</strong><input aria-label="Previous week campaign CSV" type="file" accept=".csv,text/csv" onChange={event => setPreviousFile(event.target.files?.[0] ?? null)} /><small>{previousFile?.name || "Choose CSV file"}</small></label>}
        <label><span>Current week</span><strong>{formatPeriod(periods.current.startDate, periods.current.endDate)}</strong><input aria-label="Current week campaign CSV" type="file" accept=".csv,text/csv" onChange={event => setCurrentFile(event.target.files?.[0] ?? null)} /><small>{currentFile?.name || "Choose CSV file"}</small></label>
      </div>
      {error ? <p className={styles.importError} role="alert">{error}</p> : null}
      <button type="button" className={styles.importButton} disabled={!asin || (!previousFile && !carriedPreviousEntry) || !currentFile || importing} onClick={() => void importComparison()}>{importing ? "Importing…" : "Import comparison"}</button>
    </div> : null}

    {!comparison && !showImporter ? <div className={styles.stateMessage}><span>No campaign comparison has been imported for this product and week.</span></div> : null}
    {comparison ? <>
      <div className={styles.periodComparison} aria-label="Campaign reporting periods">
        <span><small>Previous week</small><strong>{formatPeriod(comparison.previousPeriod.startDate, comparison.previousPeriod.endDate)}</strong></span><ArrowRight aria-hidden="true" /><span><small>Current week</small><strong>{formatPeriod(comparison.currentPeriod.startDate, comparison.currentPeriod.endDate)}</strong></span>
        <small>Imported {new Date(entry.importedAt).toLocaleString()}</small>
      </div>
      <div className={styles.importedFiles}><span>Previous: <strong>{entry.previousFileName}</strong></span><span>Current: <strong>{entry.currentFileName}</strong></span></div>
      {comparison.warnings.length ? <ul className={styles.warnings}>{comparison.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
      <CampaignTable comparison={comparison} group="Good" />
      <CampaignTable comparison={comparison} group="Bad" />
      <CampaignTable comparison={comparison} group="Neutral" />
    </> : null}
  </section>;
}
