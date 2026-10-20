"use client";

import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, CheckCircle2, ExternalLink, FileUp, GitCompareArrows, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { inferCsvPeriodFromFileName } from "../domain/campaign-comparison-csv";
import { getScaleInsightsCampaignTrendHref } from "../domain/campaign-weekly-comparison";
import {
  ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY,
  accountCampaignSnapshotKey,
  compareAccountCampaignSnapshots,
  createAccountCampaignSnapshot,
  defaultAccountComparisonEnd,
  filterAccountCampaignRows,
  getAccountComparisonPeriods,
  normalizeAccountComparisonEnd,
  parseAccountCampaignSnapshotCache,
  withAccountCampaignSnapshots,
  type AccountCampaignComparisonRow,
  type AccountCampaignFilter,
  type AccountCampaignSnapshot,
  type AccountComparisonGranularity,
  type AccountComparisonPeriod,
} from "../domain/account-campaign-compare";
import styles from "./account-campaign-compare.module.css";
import { dashboardStorage } from "../state/shared-dashboard-client";

import { CAMPAIGN_OUTCOME_CATEGORIES, type CampaignOutcomeGroup } from "../domain/campaign-weekly-comparison";

type SortMetric = "previousSpend" | "currentSpend" | "spendChange" | "previousSales" | "currentSales" | "salesChange" | "orders" | "currentAcos";
type SortState = { metric: SortMetric; direction: "asc" | "desc" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatPeriod(period: AccountComparisonPeriod) {
  return period.startDate === period.endDate ? formatDate(period.startDate) : `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
}

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatSignedCurrency(value: number, currency: string) {
  return `${value > 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function periodMismatch(file: File, period: AccountComparisonPeriod) {
  const inferred = inferCsvPeriodFromFileName(file.name, Number(period.startDate.slice(0, 4)));
  if (!inferred || (inferred.startDate === period.startDate && inferred.endDate === period.endDate)) return "";
  return `${file.name} appears to cover ${formatPeriod(inferred)}, but this slot requires ${formatPeriod(period)}.`;
}

function campaignType(value: number) {
  return value === 0 ? "Sponsored Products" : value === 1 ? "Sponsored Brands" : value === 2 ? "Sponsored Display" : "Unknown";
}

function sortValue(row: AccountCampaignComparisonRow, metric: SortMetric) {
  if (metric === "previousSpend") return row.previous.spend;
  if (metric === "currentSpend") return row.current.spend;
  if (metric === "spendChange") return row.spendChange;
  if (metric === "previousSales") return row.previous.sales;
  if (metric === "currentSales") return row.current.sales;
  if (metric === "salesChange") return row.salesChange;
  if (metric === "orders") return row.current.orders;
  return row.currentAcos;
}

function SortHeader({ metric, label, sort, onSort }: { metric: SortMetric; label: string; sort: SortState; onSort: (metric: SortMetric) => void }) {
  const active = sort.metric === metric;
  const Icon = active ? (sort.direction === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return <th scope="col" aria-sort={active ? (sort.direction === "desc" ? "descending" : "ascending") : "none"}>
    <button type="button" onClick={() => onSort(metric)} aria-label={`Sort ${label} ${active && sort.direction === "desc" ? "lowest to highest" : "highest to lowest"}`}>{label}<Icon aria-hidden="true" /></button>
  </th>;
}

const CATEGORY_GROUPS: CampaignOutcomeGroup[] = ["Good", "Bad", "Neutral"];

function categoryIcon(group: CampaignOutcomeGroup) {
  return group === "Good" ? <CheckCircle2 aria-hidden="true" /> : group === "Bad" ? <TriangleAlert aria-hidden="true" /> : <BarChart3 aria-hidden="true" />;
}

function OutcomeFilterCard({ filter, label, description, count, active, group, onSelect }: { filter: AccountCampaignFilter; label: string; description: string; count: number; active: boolean; group: CampaignOutcomeGroup | "All"; onSelect: (filter: AccountCampaignFilter) => void }) {
  return <button type="button" className={`${styles.outcomeFilterCard} ${active ? styles.outcomeFilterActive : ""} ${group === "Good" ? styles.outcomeGood : group === "Bad" ? styles.outcomeBad : group === "Neutral" ? styles.outcomeNeutral : styles.outcomeAll}`} aria-pressed={active} onClick={() => onSelect(filter)}>
    <span className={styles.outcomeFilterIcon}>{group === "All" ? <GitCompareArrows aria-hidden="true" /> : categoryIcon(group)}</span>
    <span className={styles.outcomeFilterCopy}><strong>{label}</strong><small>{description}</small></span>
    <span className={styles.outcomeFilterCount}>{count}</span>
    <ArrowRight className={styles.outcomeFilterArrow} aria-hidden="true" />
  </button>;
}

function UploadSlot({ label, period, snapshot, file, onFile }: { label: string; period: AccountComparisonPeriod; snapshot: AccountCampaignSnapshot | null; file: File | null; onFile: (file: File | null) => void }) {
  return <label className={styles.uploadSlot}>
    <span>{label}</span>
    <strong>{formatPeriod(period)}</strong>
    {snapshot ? <small>Saved: {snapshot.fileName}</small> : <small>No saved export</small>}
    <input aria-label={`${label} account campaign CSV`} type="file" accept=".csv,text/csv" onChange={event => onFile(event.target.files?.[0] ?? null)} />
    <i>{file ? file.name : snapshot ? "Choose a CSV to replace" : "Choose CSV file"}</i>
  </label>;
}

export function AccountCampaignCompare({ todayIso }: { todayIso: string }) {
  const country = "US";
  const [granularity, setGranularity] = useState<AccountComparisonGranularity>("day");
  const [currentEnd, setCurrentEnd] = useState(() => defaultAccountComparisonEnd("day", todayIso));
  const [previousSnapshot, setPreviousSnapshot] = useState<AccountCampaignSnapshot | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<AccountCampaignSnapshot | null>(null);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showImporter, setShowImporter] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<AccountCampaignFilter>("all");
  const [sort, setSort] = useState<SortState>({ metric: "spendChange", direction: "desc" });
  const [showAll, setShowAll] = useState(false);
  const periods = useMemo(() => getAccountComparisonPeriods(granularity, currentEnd), [currentEnd, granularity]);
  const maximumEnd = defaultAccountComparisonEnd(granularity, todayIso);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cache = parseAccountCampaignSnapshotCache(dashboardStorage().getItem(ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY));
      const previous = cache[accountCampaignSnapshotKey(country, granularity, periods.previous)] ?? null;
      const current = cache[accountCampaignSnapshotKey(country, granularity, periods.current)] ?? null;
      setPreviousSnapshot(previous);
      setCurrentSnapshot(current);
      setPreviousFile(null);
      setCurrentFile(null);
      setShowImporter(!(previous && current));
      setError("");
      setFilter("all");
      setSort({ metric: "spendChange", direction: "desc" });
      setShowAll(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [granularity, periods]);

  const comparison = useMemo(() => {
    if (!previousSnapshot || !currentSnapshot) return { rows: [] as AccountCampaignComparisonRow[], error: "" };
    try {
      return { rows: compareAccountCampaignSnapshots(previousSnapshot, currentSnapshot), error: "" };
    } catch (comparisonError) {
      return { rows: [] as AccountCampaignComparisonRow[], error: comparisonError instanceof Error ? comparisonError.message : "The saved campaign exports could not be compared." };
    }
  }, [currentSnapshot, previousSnapshot]);
  const filteredRows = useMemo(() => filterAccountCampaignRows(comparison.rows, filter), [comparison.rows, filter]);
  const sortedRows = useMemo(() => filteredRows.toSorted((first, second) => {
    const firstValue = sortValue(first, sort.metric);
    const secondValue = sortValue(second, sort.metric);
    if (firstValue == null && secondValue == null) return first.campaignName.localeCompare(second.campaignName);
    if (firstValue == null) return 1;
    if (secondValue == null) return -1;
    const difference = sort.direction === "desc" ? secondValue - firstValue : firstValue - secondValue;
    return difference || first.campaignName.localeCompare(second.campaignName);
  }), [filteredRows, sort]);
  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, 10);
  const combinedChange = filteredRows.reduce((total, row) => total + row.spendChange, 0);
  const currency = currentSnapshot?.currency ?? previousSnapshot?.currency ?? "USD";

  const changeGranularity = (next: AccountComparisonGranularity) => {
    setGranularity(next);
    setCurrentEnd(defaultAccountComparisonEnd(next, todayIso));
  };
  const changeCurrentEnd = (value: string) => {
    if (!value) return;
    const normalized = normalizeAccountComparisonEnd(granularity, granularity === "month" ? `${value}-01` : value);
    if (normalized > maximumEnd) {
      setError("Choose a completed period.");
      return;
    }
    setCurrentEnd(normalized);
  };
  const importComparison = async () => {
    if ((!previousSnapshot && !previousFile) || (!currentSnapshot && !currentFile) || (!previousFile && !currentFile)) return;
    setImporting(true);
    setError("");
    try {
      const mismatches = [previousFile ? periodMismatch(previousFile, periods.previous) : "", currentFile ? periodMismatch(currentFile, periods.current) : ""].filter(Boolean);
      if (mismatches.length) throw new Error(mismatches.join(" "));
      const importedAt = new Date().toISOString();
      const nextPrevious = previousFile ? createAccountCampaignSnapshot({ country, granularity, period: periods.previous, csvText: await previousFile.text(), fileName: previousFile.name, importedAt }) : previousSnapshot!;
      const nextCurrent = currentFile ? createAccountCampaignSnapshot({ country, granularity, period: periods.current, csvText: await currentFile.text(), fileName: currentFile.name, importedAt }) : currentSnapshot!;
      compareAccountCampaignSnapshots(nextPrevious, nextCurrent);
      const cache = parseAccountCampaignSnapshotCache(dashboardStorage().getItem(ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY));
      const nextCache = withAccountCampaignSnapshots(cache, [nextPrevious, nextCurrent]);
      dashboardStorage().setItem(ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 1, entries: nextCache }));
      setPreviousSnapshot(nextPrevious);
      setCurrentSnapshot(nextCurrent);
      setPreviousFile(null);
      setCurrentFile(null);
      setShowImporter(false);
      setFilter("all");
      setSort({ metric: "spendChange", direction: "desc" });
      setShowAll(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The campaign CSV files could not be imported.");
    } finally {
      setImporting(false);
    }
  };
  const updateSort = (metric: SortMetric) => setSort(current => ({ metric, direction: current.metric === metric && current.direction === "desc" ? "asc" : "desc" }));

  return <main className={styles.compareWorkspace} aria-labelledby="account-compare-heading">
    <section className={styles.compareCard}>
      <header className={styles.compareHeader}>
        <div><span>ACCOUNT CAMPAIGN DIAGNOSTIC</span><h1 id="account-compare-heading"><GitCompareArrows aria-hidden="true" />Campaign Spend Comparison</h1><p>Upload account-wide Scale Insights Campaign exports to find the campaigns behind a Spend change.</p></div>
        {previousSnapshot && currentSnapshot ? <button type="button" className={styles.replaceButton} onClick={() => setShowImporter(value => !value)}><RefreshCw aria-hidden="true" />{showImporter ? "Cancel" : "Replace CSVs"}</button> : null}
      </header>

      <div className={styles.periodControls}>
        <label><span>Comparison period</span><select aria-label="Comparison period" value={granularity} onChange={event => changeGranularity(event.target.value as AccountComparisonGranularity)}><option value="day">Day</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
        <label><span>Current completed {granularity}</span><span className={styles.dateInput}><CalendarDays aria-hidden="true" /><input aria-label={`Current completed ${granularity}`} type={granularity === "month" ? "month" : "date"} max={granularity === "month" ? maximumEnd.slice(0, 7) : maximumEnd} value={granularity === "month" ? currentEnd.slice(0, 7) : currentEnd} onChange={event => changeCurrentEnd(event.target.value)} /></span></label>
        <div className={styles.periodPair}><span><small>Previous</small><strong>{formatPeriod(periods.previous)}</strong></span><i>vs</i><span><small>Current</small><strong>{formatPeriod(periods.current)}</strong></span></div>
      </div>

      {showImporter ? <div className={styles.importer}>
        <div className={styles.importNotice}><FileUp aria-hidden="true" /><div><strong>Upload whole-account Scale Insights Campaign CSV exports</strong><p>Export the Campaign report without filtering to an ASIN. Files do not contain report dates, so each file is assigned to its labeled period.</p></div></div>
        <div className={styles.uploadGrid}>
          <UploadSlot label="Previous period" period={periods.previous} snapshot={previousSnapshot} file={previousFile} onFile={setPreviousFile} />
          <UploadSlot label="Current period" period={periods.current} snapshot={currentSnapshot} file={currentFile} onFile={setCurrentFile} />
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button type="button" className={styles.importButton} disabled={(!previousSnapshot && !previousFile) || (!currentSnapshot && !currentFile) || (!previousFile && !currentFile) || importing} onClick={() => void importComparison()}>{importing ? "Importing…" : "Import comparison"}</button>
      </div> : null}

      {!showImporter && comparison.error ? <p className={styles.error} role="alert">{comparison.error}</p> : null}
      {!showImporter && previousSnapshot && currentSnapshot && !comparison.error ? <>
        <div className={styles.importMeta}><span>Previous: <strong>{previousSnapshot.fileName}</strong></span><span>Current: <strong>{currentSnapshot.fileName}</strong></span><small>Imported {new Date(Math.max(Date.parse(previousSnapshot.importedAt), Date.parse(currentSnapshot.importedAt))).toLocaleString()}</small></div>
        <div className={styles.outcomeFilters} aria-label="Campaign comparison filters">
          <OutcomeFilterCard filter="all" label="All campaigns" description="Show every account campaign in the selected comparison." count={comparison.rows.length} active={filter === "all"} group="All" onSelect={nextFilter => { setFilter(nextFilter); setShowAll(false); }} />
          {CATEGORY_GROUPS.map(group => <section className={`${styles.outcomeGroup} ${group === "Good" ? styles.outcomeGoodGroup : group === "Bad" ? styles.outcomeBadGroup : styles.outcomeNeutralGroup}`} key={group} aria-labelledby={`account-outcome-${group.toLowerCase()}`}>
            <h2 id={`account-outcome-${group.toLowerCase()}`}>{categoryIcon(group)}{group}</h2>
            <div className={styles.outcomeFilterList}>{CAMPAIGN_OUTCOME_CATEGORIES.filter(category => category.group === group).map(category => <OutcomeFilterCard key={category.id} filter={category.id} label={category.label.replace(" This Week", "")} description={category.description.replaceAll("current-week", "current-period").replace("Previous-week", "Previous-period")} count={comparison.rows.filter(row => row.outcome === category.id).length} active={filter === category.id} group={group} onSelect={nextFilter => { setFilter(nextFilter); setShowAll(false); }} />)}</div>
          </section>)}
        </div>
        <div className={styles.resultToolbar}><div aria-live="polite"><strong>{filteredRows.length}</strong><span>campaign{filteredRows.length === 1 ? "" : "s"}</span><i /><strong className={combinedChange > 0 ? styles.increase : combinedChange < 0 ? styles.decrease : ""}>{formatSignedCurrency(combinedChange, currency)}</strong><span>combined Spend change</span></div></div>
        <div className={styles.tableScroll}>
          <table aria-label="Account campaign Spend comparison">
            <thead><tr><th scope="col">Campaign</th><th scope="col">Type</th><SortHeader metric="previousSpend" label="Previous Spend" sort={sort} onSort={updateSort} /><SortHeader metric="currentSpend" label="Current Spend" sort={sort} onSort={updateSort} /><SortHeader metric="spendChange" label="Spend Change" sort={sort} onSort={updateSort} /><SortHeader metric="previousSales" label="Previous Sales" sort={sort} onSort={updateSort} /><SortHeader metric="currentSales" label="Current Sales" sort={sort} onSort={updateSort} /><SortHeader metric="salesChange" label="Sales Change" sort={sort} onSort={updateSort} /><SortHeader metric="orders" label="Orders" sort={sort} onSort={updateSort} /><SortHeader metric="currentAcos" label="Current ACOS" sort={sort} onSort={updateSort} /></tr></thead>
            <tbody>{visibleRows.map(row => <tr key={`${row.sponsoredType}:${row.campaignId}`}>
              <th scope="row"><a href={getScaleInsightsCampaignTrendHref(row, periods.previous.startDate, periods.current.endDate)} target="_blank" rel="noopener noreferrer"><span>{row.campaignName}</span><ExternalLink aria-hidden="true" /></a><small>{row.campaignId}</small></th>
              <td>{campaignType(row.sponsoredType)}</td>
              <td>{formatCurrency(row.previous.spend, currency)}</td>
              <td>{formatCurrency(row.current.spend, currency)}</td>
              <td className={row.spendChange > 0 ? styles.increase : row.spendChange < 0 ? styles.decrease : ""}>{formatSignedCurrency(row.spendChange, currency)}</td>
              <td>{formatCurrency(row.previous.sales, currency)}</td>
              <td>{formatCurrency(row.current.sales, currency)}</td>
              <td className={row.salesChange > 0 ? styles.increase : row.salesChange < 0 ? styles.decrease : ""}>{formatSignedCurrency(row.salesChange, currency)}{row.salesChangePercentage == null ? " (New)" : ` (${row.salesChangePercentage > 0 ? "+" : ""}${Math.round(row.salesChangePercentage)}%)`}</td>
              <td>{row.previous.orders} <ArrowRight aria-hidden="true" /> <strong>{row.current.orders}</strong></td>
              <td>{row.currentAcos == null ? "—" : `${Math.round(row.currentAcos)}%`}</td>
            </tr>)}</tbody>
          </table>
          {!visibleRows.length ? <p className={styles.empty}>No campaigns match this filter.</p> : null}
        </div>
        {sortedRows.length > 10 ? <button type="button" className={styles.showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show first 10" : `Show all ${sortedRows.length}`}</button> : null}
      </> : null}
    </section>
  </main>;
}
