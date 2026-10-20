"use client";

import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Copy, ExternalLink, SquarePlus, Target, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import {
  parseUntargetedOpportunityCache,
  parseUntargetedSalesOpportunities,
  PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY,
  untargetedOpportunityCacheKey,
  withUntargetedOpportunityCacheEntry,
  type UntargetedOpportunityCache,
  type UntargetedOpportunityType,
  type UntargetedSalesOpportunities,
} from "../domain/untargeted-sales-opportunities";
import { getScaleInsightsKeywordCampaignCreationHref, getScaleInsightsSearchTermHref } from "../domain/ppc-analysis-navigation";
import { dashboardStorage } from "../state/shared-dashboard-client";
import ws from "./ppc-performance-workspace.module.css";
import styles from "./campaign-weekly-comparison.module.css";

type LoadState = {
  key: string;
  status: "idle" | "loading" | "authorization" | "ready" | "unsupported" | "error";
  message: string;
  report?: UntargetedSalesOpportunities;
  authorizationUrl?: string;
  requestId?: string;
};

export type OpportunityPpcClickTotal = { asin: string; country: string; weekStart: string; ppcClicks: number };

const INITIAL_ROW_COUNT = 10;
const COPY_FEEDBACK_MS = 2_000;
const EMPTY_SELECTED_TERMS = new Set<string>();
type SortMetric = "impressions" | "clicks" | "spend" | "sales" | "orders" | "acos";
type SortDirection = "asc" | "desc";

const SORT_LABELS: Record<SortMetric, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  spend: "Spend",
  sales: "Sales",
  orders: "Orders",
  acos: "ACOS",
};

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

function numericFilter(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function SortableMetricHeader({ metric, total, activeMetric, direction, onSort }: { metric: SortMetric; total: string; activeMetric: SortMetric; direction: SortDirection; onSort: (metric: SortMetric) => void }) {
  const active = metric === activeMetric;
  const nextDirection = active && direction === "desc" ? "lowest to highest" : "highest to lowest";
  const Icon = active ? (direction === "desc" ? ArrowDown : ArrowUp) : ChevronsUpDown;
  return <th scope="col" aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : "none"}>
    <span className={styles.metricColumnHeader}><strong className={styles.metricColumnTotal} aria-label={`Total ${SORT_LABELS[metric]}`}>{total}</strong><button type="button" className={styles.sortButton} aria-label={`Sort ${SORT_LABELS[metric]} ${nextDirection}`} onClick={() => onSort(metric)}>{SORT_LABELS[metric]}<Icon aria-hidden="true" /></button></span>
  </th>;
}

function CopyTermButton({ term }: { term: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
  }, []);
  const copyTerm = async () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(term);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    resetTimer.current = window.setTimeout(() => {
      setCopyState("idle");
      resetTimer.current = null;
    }, COPY_FEEDBACK_MS);
  };
  const label = copyState === "copied" ? `Copied search term ${term}` : copyState === "error" ? `Copy search term ${term} failed` : `Copy search term ${term}`;
  return <button type="button" className={styles.copyTermButton} aria-label={label} title={copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy search term"} onClick={copyTerm}>
    {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
  </button>;
}

function copyTermForScaleInsights(term: string) {
  if (!navigator.clipboard?.writeText) return;
  void navigator.clipboard.writeText(term).catch(() => undefined);
}

export function UntargetedSalesOpportunities({ asin, country = "US", weekStart, refreshVersion, onPpcClicksLoaded }: { asin: string; country?: string; weekStart: string; refreshVersion: number; onPpcClicksLoaded?: (total: OpportunityPpcClickTotal) => void }) {
  const reportKey = untargetedOpportunityCacheKey(country, asin, weekStart);
  const selectionKey = `${reportKey}:${refreshVersion}`;
  const cacheRef = useRef<UntargetedOpportunityCache | null>(null);
  if (cacheRef.current === null) {
    cacheRef.current = typeof window === "undefined"
      ? {}
      : parseUntargetedOpportunityCache(dashboardStorage().getItem(PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY));
  }
  const handledRefreshes = useRef(new Map<string, number>());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [selection, setSelection] = useState<{ key: string; terms: Set<string> }>(() => ({ key: selectionKey, terms: new Set() }));
  const selectedTerms = selection.key === selectionKey ? selection.terms : EMPTY_SELECTED_TERMS;
  const [typeFilter, setTypeFilter] = useState<"All" | UntargetedOpportunityType>("All");
  const [minimumSales, setMinimumSales] = useState("");
  const [maximumAcos, setMaximumAcos] = useState("");
  const [sort, setSort] = useState<{ metric: SortMetric; direction: SortDirection }>({ metric: "sales", direction: "desc" });
  const [loadState, setLoadState] = useState<LoadState>({ key: "", status: "idle", message: "" });

  useEffect(() => {
    if (!asin) return;
    const controller = new AbortController();
    const cached = (cacheRef.current ?? {})[reportKey];
    const handledRefresh = handledRefreshes.current.get(reportKey) ?? 0;
    if (refreshVersion <= handledRefresh) {
      setLoadState(cached
        ? { key: reportKey, status: "ready", message: "", report: cached }
        : { key: reportKey, status: "idle", message: "This report loads with Refresh Data and reuses the latest saved result for this product and week." });
      return () => controller.abort();
    }
    handledRefreshes.current.set(reportKey, refreshVersion);
    setShowAll(false);
    setLoadState({ key: reportKey, status: "loading", message: "Finding converting PPC search terms and their primary source campaigns…", report: cached });
    const query = new URLSearchParams({ asin, country, weekStart });
    void fetch(withPpcBasePath(`/api/dashboard/untargeted-opportunities?${query}`), {
      headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const value: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 409 && value && typeof value === "object") {
        const candidate = value as { authorizationRequired?: unknown; authorizationUrl?: unknown };
        if (candidate.authorizationRequired === true && typeof candidate.authorizationUrl === "string") {
          const authorizationUrl = new URL(candidate.authorizationUrl);
          if (authorizationUrl.protocol === "https:" && (authorizationUrl.hostname === "vercel.com" || authorizationUrl.hostname.endsWith(".vercel.com"))) {
            setLoadState({ key: reportKey, status: "authorization", message: "Connect Scale Insights to find untargeted sales opportunities.", authorizationUrl: authorizationUrl.toString(), report: cached });
            return;
          }
        }
      }
      if (!response.ok || !value || typeof value !== "object") {
        const candidate = value && typeof value === "object" ? value as { error?: unknown; code?: unknown; requestId?: unknown } : {};
        if (candidate.code === "opportunity_capability_missing") {
          setLoadState({ key: reportKey, status: "unsupported", message: "The connected Scale Insights account does not expose both PPC search-term performance and campaign-attribution reporting.", requestId: typeof candidate.requestId === "string" ? candidate.requestId : undefined, report: cached });
          return;
        }
        const error = new Error(typeof candidate.error === "string" ? candidate.error : "Untargeted sales opportunities are temporarily unavailable.") as Error & { requestId?: string };
        if (typeof candidate.requestId === "string") error.requestId = candidate.requestId;
        throw error;
      }
      const report = parseUntargetedSalesOpportunities((value as { opportunities?: unknown }).opportunities);
      if (!report || report.asin !== asin.toUpperCase() || report.country !== country || report.period.startDate !== weekStart) throw new Error("Scale Insights returned invalid opportunity data.");
      cacheRef.current = withUntargetedOpportunityCacheEntry(cacheRef.current ?? {}, report);
      try {
        dashboardStorage().setItem(PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY, JSON.stringify({ version: 1, entries: cacheRef.current }));
      } catch {
        // Keep the validated result in memory when browser storage is unavailable.
      }
      setLoadState({ key: reportKey, status: "ready", message: "", report });
    }).catch(error => {
      if (controller.signal.aborted || (error as Error).name === "AbortError") return;
      setLoadState({ key: reportKey, status: "error", message: error instanceof Error ? error.message : "Untargeted sales opportunities are temporarily unavailable.", requestId: (error as Error & { requestId?: string }).requestId, report: cached });
    });
    return () => controller.abort();
  }, [asin, country, refreshVersion, reportKey, weekStart]);

  const displayedState: LoadState = !asin
    ? { key: reportKey, status: "idle", message: "Add an ASIN to check untargeted sales opportunities." }
    : loadState.key === reportKey
      ? loadState
      : { key: reportKey, status: "idle", message: "This report loads with Refresh Data and reuses the latest saved result for this product and week." };
  const report = displayedState.report;
  useEffect(() => {
    if (report?.ppcClicks == null) return;
    onPpcClicksLoaded?.({ asin: report.asin, country: report.country, weekStart: report.period.startDate, ppcClicks: report.ppcClicks });
  }, [onPpcClicksLoaded, report]);
  const filteredRows = useMemo(() => {
    if (!report) return [];
    const minSales = numericFilter(minimumSales) ?? 0;
    const maxAcos = numericFilter(maximumAcos);
    return report.opportunities.filter(row => (typeFilter === "All" || row.type === typeFilter)
      && row.orders >= 1 && row.sales >= minSales
      && (maxAcos == null || (row.acos != null && row.acos <= maxAcos)));
  }, [maximumAcos, minimumSales, report, typeFilter]);
  const sortedRows = useMemo(() => [...filteredRows].sort((first, second) => {
    const firstValue = first[sort.metric];
    const secondValue = second[sort.metric];
    if (firstValue == null && secondValue == null) return first.term.localeCompare(second.term);
    if (firstValue == null) return 1;
    if (secondValue == null) return -1;
    const difference = sort.direction === "desc" ? secondValue - firstValue : firstValue - secondValue;
    return difference || first.term.localeCompare(second.term);
  }), [filteredRows, sort]);
  const totals = useMemo(() => {
    const values = filteredRows.reduce((current, row) => ({
      impressions: current.impressions + row.impressions,
      clicks: current.clicks + row.clicks,
      spend: current.spend + row.spend,
      sales: current.sales + row.sales,
      orders: current.orders + row.orders,
    }), { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 });
    return { ...values, acos: values.sales > 0 ? (values.spend / values.sales) * 100 : null };
  }, [filteredRows]);
  const metricTotals: Record<SortMetric, string> = {
    impressions: new Intl.NumberFormat("en-US").format(totals.impressions),
    clicks: new Intl.NumberFormat("en-US").format(totals.clicks),
    spend: formatCurrency(totals.spend, report?.currency || "USD"),
    sales: formatCurrency(totals.sales, report?.currency || "USD"),
    orders: new Intl.NumberFormat("en-US").format(totals.orders),
    acos: totals.acos == null ? "—" : `${Math.round(totals.acos)}%`,
  };
  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, INITIAL_ROW_COUNT);
  const visibleSearchTerms = visibleRows.filter(row => row.type === "Search term").map(row => row.term);
  const allVisibleSearchTermsSelected = visibleSearchTerms.length > 0 && visibleSearchTerms.every(term => selectedTerms.has(term));
  const someVisibleSearchTermsSelected = visibleSearchTerms.some(term => selectedTerms.has(term));
  const selectedTermList = displayedState.status === "ready" ? [...selectedTerms] : [];
  const bulkCampaignHref = getScaleInsightsKeywordCampaignCreationHref(asin, selectedTermList);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSearchTermsSelected && !allVisibleSearchTermsSelected;
  }, [allVisibleSearchTermsSelected, someVisibleSearchTermsSelected]);

  const updateSort = (metric: SortMetric) => {
    setSort(current => current.metric === metric
      ? { metric, direction: current.direction === "desc" ? "asc" : "desc" }
      : { metric, direction: "desc" });
    setShowAll(false);
  };
  const toggleTerm = (term: string) => {
    setSelection(current => {
      const next = new Set(current.key === selectionKey ? current.terms : EMPTY_SELECTED_TERMS);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return { key: selectionKey, terms: next };
    });
  };
  const toggleVisibleSearchTerms = () => {
    setSelection(current => {
      const next = new Set(current.key === selectionKey ? current.terms : EMPTY_SELECTED_TERMS);
      if (allVisibleSearchTermsSelected) visibleSearchTerms.forEach(term => next.delete(term));
      else visibleSearchTerms.forEach(term => next.add(term));
      return { key: selectionKey, terms: next };
    });
  };

  return <section className={`${ws.card} ${styles.comparisonCard}`} aria-labelledby="untargeted-opportunities-heading">
    <header className={styles.comparisonHeader}>
      <div><h3 id="untargeted-opportunities-heading"><Target aria-hidden="true" />Untargeted Sales Opportunities</h3><p>PPC search terms and product ASINs with at least one attributed order and no exact PPC target.</p></div>
      {report ? <span className={report.dataState === "Partial" ? styles.partialBadge : styles.finalBadge}>{report.dataState}</span> : null}
    </header>

    {displayedState.status === "idle" ? <div className={styles.stateMessage}><span>{displayedState.message}</span></div> : null}
    {displayedState.status === "loading" ? <div className={styles.stateMessage} role="status"><RefreshCw className={styles.loadingIcon} aria-hidden="true" /><span>{displayedState.message}</span></div> : null}
    {displayedState.status === "authorization" ? <div className={styles.stateMessage}><span>{displayedState.message}</span><a href={displayedState.authorizationUrl}>Connect Scale Insights</a></div> : null}
    {displayedState.status === "unsupported" ? <div className={`${styles.stateMessage} ${styles.capabilityState}`} role="status"><span className={styles.errorCopy}><strong>Opportunity reporting is unavailable</strong><span>{displayedState.message}</span>{displayedState.requestId ? <small>Reference ID: {displayedState.requestId}</small> : null}</span></div> : null}
    {displayedState.status === "error" ? <div className={`${styles.stateMessage} ${styles.errorState}`} role="alert"><span className={styles.errorCopy}><strong>Opportunities could not be loaded</strong><span>{displayedState.message} Use Refresh Data to try again.</span>{displayedState.requestId ? <small>Reference ID: {displayedState.requestId}</small> : null}</span></div> : null}

    {report ? <>
      <div className={styles.opportunityMeta}><span><small>Reporting period</small><strong>{formatDate(report.period.startDate)} – {formatDate(report.period.endDate)}</strong></span><span><small>Matched opportunities</small><strong>{report.opportunities.length}</strong></span><small>Orders ≥ 1 and explicitly not exact-targeted.</small></div>
      {report.warnings.length ? <ul className={styles.warnings}>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
      <div className={styles.opportunityFilters} aria-label="Opportunity criteria">
        <label><span>Type</span><select aria-label="Opportunity type" value={typeFilter} onChange={event => setTypeFilter(event.target.value as "All" | UntargetedOpportunityType)}><option>All</option><option>Search term</option><option>Product ASIN</option></select></label>
        <label><span>Minimum Sales</span><input aria-label="Minimum PPC Sales" type="number" min="0" step="1" placeholder="Any" value={minimumSales} onChange={event => setMinimumSales(event.target.value)} /></label>
        <label><span>Maximum ACOS</span><span className={styles.percentFilter}><input aria-label="Maximum ACOS" type="number" min="0" step="1" placeholder="Any" value={maximumAcos} onChange={event => setMaximumAcos(event.target.value)} /><i>%</i></span></label>
      </div>
      {filteredRows.length ? <div className={styles.baselineTable}>
        <div className={styles.baselineSummary}><strong>{filteredRows.length} match{filteredRows.length === 1 ? "" : "es"}</strong>
        {filteredRows.some(row => row.type === "Search term") ? <div className={styles.bulkCampaignBar}><span role="status" aria-live="polite" aria-label={`${selectedTerms.size} search term${selectedTerms.size === 1 ? "" : "s"} selected`}><strong>{selectedTerms.size}</strong> search term{selectedTerms.size === 1 ? "" : "s"} selected</span>{selectedTerms.size ? <a className={styles.bulkCampaignButton} href={bulkCampaignHref} target="_blank" rel="noopener noreferrer" aria-label={`Create bulk campaigns for ${selectedTerms.size} selected search ${selectedTerms.size === 1 ? "term" : "terms"}`}><SquarePlus aria-hidden="true" />Create Bulk Campaigns</a> : <button type="button" className={styles.bulkCampaignButton} disabled><SquarePlus aria-hidden="true" />Create Bulk Campaigns</button>}</div> : null}</div>
        <div className={styles.tableScroll}><table className={styles.opportunityTable} aria-label="Untargeted sales opportunities"><thead><tr><th className={styles.selectionCell}><input ref={selectAllRef} type="checkbox" aria-label="Select all visible search terms" checked={allVisibleSearchTermsSelected} disabled={displayedState.status !== "ready" || !visibleSearchTerms.length} onChange={toggleVisibleSearchTerms} /></th><th>Search Term</th>{(Object.keys(SORT_LABELS) as SortMetric[]).map(metric => <SortableMetricHeader key={metric} metric={metric} total={metricTotals[metric]} activeMetric={sort.metric} direction={sort.direction} onSort={updateSort} />)}<th>Status</th></tr></thead><tbody>{visibleRows.map(row => <tr key={`${row.type}:${row.term}`}>
          <td className={styles.selectionCell}>{row.type === "Search term" ? <input type="checkbox" aria-label={`Select search term ${row.term}`} checked={selectedTerms.has(row.term)} disabled={displayedState.status !== "ready"} onChange={() => toggleTerm(row.term)} /> : null}</td>
          <th scope="row"><span className={styles.opportunityTerm}>{row.type === "Product ASIN" ? <a className={styles.productAsinLink} href={`https://www.amazon.com/dp/${encodeURIComponent(row.term)}`} target="_blank" rel="noopener noreferrer"><span>{row.term}</span></a> : <span className={styles.campaignName}>{row.term}</span>}<CopyTermButton term={row.term} /><a className={styles.sourceLink} href={getScaleInsightsSearchTermHref(asin, report.period.startDate, report.period.endDate)} target="_blank" rel="noopener noreferrer" aria-label={`Open Scale Insights Search terms for ${row.term}`} title="Open Scale Insights Search terms and copy this value for Instant Search" onClick={() => copyTermForScaleInsights(row.term)}><ExternalLink aria-hidden="true" /></a></span></th>
          <td>{new Intl.NumberFormat("en-US").format(row.impressions)}</td><td>{new Intl.NumberFormat("en-US").format(row.clicks)}</td><td>{formatCurrency(row.spend, report.currency)}</td><td><strong>{formatCurrency(row.sales, report.currency)}</strong></td><td>{row.orders}</td><td>{row.acos == null ? "—" : `${Math.round(row.acos)}%`}</td><td><span className={styles.untargetedBadge}>Not targeted</span></td>
        </tr>)}</tbody></table></div>
        {filteredRows.length > INITIAL_ROW_COUNT ? <button type="button" className={styles.showAllButton} onClick={() => setShowAll(value => !value)}>{showAll ? "Show first 10" : `Show all ${filteredRows.length}`}</button> : null}
      </div> : <p className={styles.emptyCategory}>No confirmed untargeted sales opportunities match these criteria.</p>}
    </> : null}
  </section>;
}
