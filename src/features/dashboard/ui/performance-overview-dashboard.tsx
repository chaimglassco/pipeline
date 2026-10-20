import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, Database, PackageSearch, RefreshCw, Search, X } from "lucide-react";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { addDaysIso, currency, getIsoWeekNumber, reportKey, type WeeklyPpcReport } from "../domain/ppc-dashboard-state";
import type { ManagedDashboardProduct } from "../domain/ppc-dashboard-catalog";
import { parsePerformanceOverviewData, type PerformanceOverviewDailyPoint, type PerformanceOverviewData, type PerformanceOverviewMetrics, type PerformanceOverviewRow, type PerformanceOverviewSection, type PerformanceOverviewSectionKey } from "../domain/performance-overview";
import styles from "./performance-overview-dashboard.module.css";

type Props = { products: ManagedDashboardProduct[]; reports: Record<string, WeeklyPpcReport>; currentWeekStart: string; todayIso: string };
type LedgerSummary = PerformanceOverviewMetrics & { reports?: number };
type OverviewLoadState =
  | { status: "idle" | "loading"; data: PerformanceOverviewData | null; message: string; authorizationUrl?: undefined }
  | { status: "ready"; data: PerformanceOverviewData; message: string; authorizationUrl?: undefined }
  | { status: "error"; data: PerformanceOverviewData | null; message: string; authorizationUrl?: string };

const EMPTY_SUMMARY: LedgerSummary = { reports: 0, totalSales: 0, ppcSales: 0, spend: 0, totalOrders: 0, ppcOrders: 0, clicks: 0 };
const DETAIL_SECTIONS: ReadonlyArray<{ key: PerformanceOverviewSectionKey; title: string; description: string }> = [
  { key: "keywords", title: "Keyword Targeting", description: "Granular bid-level telemetry across active Sponsored Products and Sponsored Brands keyword clusters." },
  { key: "campaigns", title: "Campaign Movers and Anchors", description: "Campaign movement, efficiency, and budget actions across the account." },
  { key: "productTargets", title: "ASIN Targeting", description: "Product-target performance grouped by target ASIN and campaign context." },
  { key: "searchTerms", title: "Search Terms", description: "Customer queries and attributed outcomes from the selected reporting period." },
];
const DETAIL_COLUMNS: Record<PerformanceOverviewSectionKey, string[]> = {
  keywords: ["#", "Keyword Target & Match Type", "Campaign / ASIN", "Impressions / CTR", "Clicks / CPC", "Spend", "Sales", "Orders / CVR", "ACOS", "ROAS"],
  campaigns: ["#", "Campaign & Ad Type", "Status", "Spend", "Sales", "Orders", "ACOS", "ROAS", "CPC", "CTR", "CVR", "Daily Budget"],
  productTargets: ["#", "Target ASIN / Category", "Campaign / Advertised ASIN", "Clicks", "Spend", "Sales", "Orders", "Conversion Rate", "ACOS", "ROAS"],
  searchTerms: ["#", "Customer Search Query", "Campaign / Advertised ASIN", "Clicks", "Spend", "Sales", "Orders", "Conversion Rate", "ACOS", "ROAS"],
};

function hasPerformance(report: WeeklyPpcReport | undefined) {
  return Boolean(report && (report.spend || report.ppcSales || report.totalSales || report.ppcOrders || report.totalOrders || report.updatedAt));
}

function summarize(products: ManagedDashboardProduct[], reports: Record<string, WeeklyPpcReport>, weekStarts: string[]) {
  return products.reduce<LedgerSummary>((summary, product) => weekStarts.reduce<LedgerSummary>((next, weekStart) => {
    const report = reports[reportKey(product.id, weekStart)];
    if (!hasPerformance(report)) return next;
    return { reports: (next.reports || 0) + 1, totalSales: next.totalSales + report.totalSales, ppcSales: next.ppcSales + report.ppcSales, spend: next.spend + report.spend, totalOrders: next.totalOrders + report.totalOrders, ppcOrders: next.ppcOrders + report.ppcOrders, clicks: next.clicks + (report.ppcClicks || 0) };
  }, summary), { ...EMPTY_SUMMARY });
}

function percentage(numerator: number, denominator: number) { return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null }
function displayPercent(value: number | null) { return value == null ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%` }
function displayNumber(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) }
function displayMoney(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value) }
function displayDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) }
function displayRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(`${start}T12:00:00Z`))} — ${formatter.format(new Date(`${end}T12:00:00Z`))}`;
}
function inclusiveDays(start: string, end: string) { return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1 }
function trustedAuthorizationUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "vercel.com" || url.hostname.endsWith(".vercel.com")) ? url.toString() : undefined } catch { return undefined }
}

function TemporalCard({ index, label, range, summary, source, unavailableReason }: { index: number; label: string; range: string; summary?: LedgerSummary | null; source: string; unavailableReason?: string }) {
  const available = summary != null;
  const coverage = summary?.reports;
  return <article className={styles.temporalCard}>
    <header><div><small>Index {String(index).padStart(2, "0")}</small><h2>{label}</h2><span>{range}</span></div><div><small>Net Sales</small><strong>{available ? currency(summary.totalSales) : "—"}</strong></div></header>
    <div className={styles.cardAudit}><span><small>Coverage</small><strong>{available ? coverage ? `${coverage} saved report${coverage === 1 ? "" : "s"}` : "Completed range" : "Unavailable"}</strong></span><span><small>Data Source</small><strong>{available ? source : "Daily source pending"}</strong></span></div>
    <dl>
      <div><dt>Orders / PPC Orders</dt><dd>{available ? `${displayNumber(summary.totalOrders)} / ${displayNumber(summary.ppcOrders)}` : "—"}</dd></div>
      <div><dt>PPC Sales</dt><dd>{available ? currency(summary.ppcSales) : "—"}</dd></div>
      <div><dt>Advertising Cost</dt><dd>{available ? currency(summary.spend) : "—"}</dd></div>
      <div><dt>ACOS Actual</dt><dd>{displayPercent(available ? percentage(summary.spend, summary.ppcSales) : null)}</dd></div>
      <div><dt>TACOS</dt><dd>{displayPercent(available ? percentage(summary.spend, summary.totalSales) : null)}</dd></div>
    </dl>
    <footer><span><small>Status</small><strong>{available ? "Actual data" : unavailableReason || "Awaiting data"}</strong></span></footer>
  </article>;
}

type DailyMetricKey = "spend" | "ppcSales" | "totalSales" | "acos" | "tacos";
type DailyMetricDefinition = { key: DailyMetricKey; label: string; color?: string };
const DAILY_METRICS: ReadonlyArray<DailyMetricDefinition> = [
  { key: "spend", label: "Spend", color: "#dc2626" },
  { key: "ppcSales", label: "PPC Sales", color: "#059669" },
  { key: "totalSales", label: "Total Sales" },
  { key: "acos", label: "ACOS" },
  { key: "tacos", label: "TACOS" },
];
const PLOTTED_DAILY_METRICS = DAILY_METRICS.filter((item): item is DailyMetricDefinition & { color: string } => Boolean(item.color));

function dailyMetricValue(point: PerformanceOverviewDailyPoint, metric: DailyMetricKey) {
  return point[metric];
}

function formatDailyMetric(value: number | null, metric: DailyMetricKey, currencyCode: string) {
  if (value == null) return "—";
  if (metric === "acos" || metric === "tacos") return displayPercent(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(value);
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(0, -1).reduce((path, point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const firstControlX = point.x + (next.x - previous.x) / 6;
    const firstControlY = point.y + (next.y - previous.y) / 6;
    const secondControlX = next.x - (afterNext.x - point.x) / 6;
    const secondControlY = next.y - (afterNext.y - point.y) / 6;
    return `${path} C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${next.x} ${next.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function DailyPerformanceChart({ rows, summary, currencyCode, loading }: { rows: PerformanceOverviewDailyPoint[]; summary?: PerformanceOverviewMetrics | null; currencyCode: string; loading: boolean }) {
  const [metric, setMetric] = useState<DailyMetricKey>("spend");
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const aggregates = summary ?? rows.reduce<PerformanceOverviewMetrics>((total, row) => ({ ...total, totalSales: total.totalSales + row.totalSales, ppcSales: total.ppcSales + row.ppcSales, spend: total.spend + row.spend }), { ...EMPTY_SUMMARY });
  const quickValue = (key: DailyMetricKey) => key === "acos" ? percentage(aggregates.spend, aggregates.ppcSales) : key === "tacos" ? percentage(aggregates.spend, aggregates.totalSales) : aggregates[key];
  const chartLeft = 10;
  const chartRight = 990;
  const chartTop = 24;
  const chartBottom = 210;
  const xForIndex = (index: number) => rows.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + (index / Math.max(rows.length - 1, 1)) * (chartRight - chartLeft);
  const metricSeries = PLOTTED_DAILY_METRICS.map(item => {
    const validRows = rows.map((row, index) => ({ row, index, value: dailyMetricValue(row, item.key) })).filter((entry): entry is typeof entry & { value: number } => entry.value != null);
    const maximum = Math.max(...validRows.map(entry => entry.value), 0);
    const range = maximum || 1;
    const points = validRows.map(entry => ({ ...entry, x: xForIndex(entry.index), y: chartBottom - (entry.value / range) * (chartBottom - chartTop) }));
    return { ...item, maximum, points, linePath: smoothPath(points) };
  });
  const selectedSeries = metricSeries.find(item => item.key === metric)!;
  const selectedLabel = selectedSeries.label;
  const labelIndexes = rows.length ? [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])] : [];
  const activeRow = activeDayIndex == null ? null : rows[activeDayIndex];
  const activeX = activeDayIndex == null ? 0 : xForIndex(activeDayIndex);
  const activeY = activeDayIndex == null ? chartBottom : selectedSeries.points.find(point => point.index === activeDayIndex)?.y ?? chartBottom;
  const tooltipHorizontalClass = activeDayIndex === 0 ? styles.chartTooltipLeft : activeDayIndex === rows.length - 1 ? styles.chartTooltipRight : "";
  const tooltipVerticalClass = activeY < 120 ? styles.chartTooltipBelow : styles.chartTooltipAbove;

  return <section className={styles.dailyChart} aria-labelledby="daily-performance-heading">
    <header><div><small>Selected Range Trend</small><h2 id="daily-performance-heading">Daily Performance Quick Stats</h2><p>Spend and PPC Sales are plotted together and scaled to their own daily peak. Select either line to emphasize it.</p></div><strong>{rows.length} completed day{rows.length === 1 ? "" : "s"}</strong></header>
    <div className={styles.dailyMetricTabs} role="group" aria-label="Daily performance metric">
      {DAILY_METRICS.map(item => {
        const content = <><span>{item.color ? <i aria-hidden="true" style={{ backgroundColor: item.color }} /> : null}{item.label}</span><strong>{formatDailyMetric(quickValue(item.key), item.key, currencyCode)}</strong></>;
        return item.color ? <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{content}</button> : <div key={item.key} className={styles.dailyMetricStat}>{content}</div>;
      })}
    </div>
    {rows.length ? <div className={styles.chartCanvas}>
      <div className={styles.chartCaption}><span>{selectedLabel} emphasized</span><strong>{formatDailyMetric(selectedSeries.maximum, metric, currencyCode)} peak</strong></div>
      <div className={styles.chartPlot} onMouseLeave={() => setActiveDayIndex(null)}>
        <svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label={`Daily performance trends from ${displayDate(rows[0].date)} to ${displayDate(rows.at(-1)!.date)}`}>
          {[0, 1, 2, 3].map(index => { const y = chartTop + index * ((chartBottom - chartTop) / 3); return <line key={index} x1={chartLeft} x2={chartRight} y1={y} y2={y} className={styles.chartGridLine} />; })}
          {metricSeries.map(series => <path key={series.key} data-chart-metric={series.key} d={series.linePath} stroke={series.color} className={`${styles.chartLine} ${series.key === metric ? styles.chartLineActive : ""}`} />)}
          {activeDayIndex != null ? <line x1={activeX} x2={activeX} y1={chartTop} y2={chartBottom} className={styles.chartGuideLine} /> : null}
          {labelIndexes.map(index => <text key={rows[index].date} x={xForIndex(index)} y="238" textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"} className={styles.chartAxisLabel}>{displayDate(rows[index].date).replace(/, \d{4}$/, "")}</text>)}
          {rows.map((row, index) => {
            const start = index === 0 ? 0 : (xForIndex(index - 1) + xForIndex(index)) / 2;
            const end = index === rows.length - 1 ? 1000 : (xForIndex(index) + xForIndex(index + 1)) / 2;
            return <rect key={row.date} data-chart-date={row.date} x={start} y="8" width={end - start} height="238" className={styles.chartHitArea} onMouseEnter={() => setActiveDayIndex(index)} aria-hidden="true" />;
          })}
        </svg>
        {metricSeries.flatMap(series => series.points.map(point => <span key={`${series.key}:${point.row.date}`} data-chart-dot={`${series.key}:${point.row.date}`} className={`${styles.chartDot} ${series.key === metric ? styles.chartDotActive : ""}`} style={{ left: `${point.x / 10}%`, top: `${point.y / 2.5}%`, borderColor: series.color }} aria-hidden="true" />))}
        {activeRow ? <div className={`${styles.chartTooltip} ${tooltipHorizontalClass} ${tooltipVerticalClass}`} style={{ left: `${activeX / 10}%`, top: `${activeY / 2.5}%` }} role="tooltip">
          <strong>{displayDate(activeRow.date)}</strong>
          <dl>{DAILY_METRICS.map(item => <div key={item.key} className={item.key === metric ? styles.chartTooltipActive : undefined}><dt>{item.label}</dt><dd>{formatDailyMetric(dailyMetricValue(activeRow, item.key), item.key, currencyCode)}</dd></div>)}</dl>
        </div> : null}
      </div>
    </div> : <div className={styles.chartEmpty} role="status"><Database aria-hidden="true" /><strong>{loading ? "Loading daily performance" : "No daily performance in this period"}</strong><span>{loading ? "Retrieving completed daily values from Scale Insights." : "Choose a completed date range with Scale Insights sales data."}</span></div>}
  </section>;
}

function metricPair(first: string, second: string) { return <><strong>{first}</strong><small>{second}</small></> }
type CampaignSortKey = "clicks" | "spend" | "sales" | "orders" | "acos" | "roas" | "cpc" | "ctr" | "conversionRate" | "dailyBudget";
const CAMPAIGN_SORT_COLUMNS: Partial<Record<string, CampaignSortKey>> = { Spend: "spend", Sales: "sales", Orders: "orders", ACOS: "acos", ROAS: "roas", CPC: "cpc", CTR: "ctr", CVR: "conversionRate", "Daily Budget": "dailyBudget" };
const TARGET_SORT_COLUMNS: Partial<Record<string, CampaignSortKey>> = { Clicks: "clicks", Spend: "spend", Sales: "sales", Orders: "orders", "Conversion Rate": "conversionRate", ACOS: "acos", ROAS: "roas" };
function campaignMetric(row: PerformanceOverviewRow, key: CampaignSortKey) {
  return row[key] ?? null;
}
function DetailRow({ row, index, sectionKey }: { row: PerformanceOverviewRow; index: number; sectionKey: PerformanceOverviewSectionKey }) {
  const ctr = percentage(row.clicks, row.impressions);
  const cpc = row.clicks > 0 ? row.spend / row.clicks : null;
  const identity = <td>{metricPair(row.name, sectionKey === "campaigns" ? row.targetType || "Reported campaign" : [row.matchType, row.targetType].filter(Boolean).join(" · ") || "Reported row")}</td>;
  if (sectionKey === "keywords") return <tr><td><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span></td>{identity}<td>{metricPair(row.campaign || "—", row.asin || "No ASIN returned")}</td><td>{metricPair(displayNumber(row.impressions), `CTR ${displayPercent(ctr)}`)}</td><td>{metricPair(displayNumber(row.clicks), `CPC ${cpc == null ? "—" : displayMoney(cpc)}`)}</td><td>{displayMoney(row.spend)}</td><td>{displayMoney(row.sales)}</td><td>{metricPair(displayNumber(row.orders), `CVR ${displayPercent(row.conversionRate)}`)}</td><td>{displayPercent(row.acos)}</td><td>{row.roas == null ? "—" : row.roas.toFixed(2)}</td></tr>;
  if (sectionKey === "campaigns") return <tr><td><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span></td>{identity}<td>{row.state || row.matchType || "—"}</td><td>{displayMoney(row.spend)}</td><td>{displayMoney(row.sales)}</td><td>{displayNumber(row.orders)}</td><td>{displayPercent(row.acos)}</td><td>{row.roas == null ? "—" : row.roas.toFixed(2)}</td><td>{row.cpc == null ? "—" : displayMoney(row.cpc)}</td><td>{displayPercent(row.ctr ?? null)}</td><td>{displayPercent(row.conversionRate)}</td><td>{row.dailyBudget == null ? "—" : displayMoney(row.dailyBudget)}</td></tr>;
  return <tr><td><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span></td>{identity}<td>{metricPair(row.campaign || "—", row.asin || "No advertised ASIN returned")}</td><td>{displayNumber(row.clicks)}</td><td>{displayMoney(row.spend)}</td><td>{displayMoney(row.sales)}</td><td>{displayNumber(row.orders)}</td><td>{displayPercent(row.conversionRate)}</td><td>{displayPercent(row.acos)}</td><td>{row.roas == null ? "—" : row.roas.toFixed(2)}</td></tr>;
}

function DetailPerformance({ meta, section, loadStatus, scopeLabel, periodLabel }: { meta: (typeof DETAIL_SECTIONS)[number]; section?: PerformanceOverviewSection; loadStatus: OverviewLoadState["status"]; scopeLabel: string; periodLabel: string }) {
  const columns = DETAIL_COLUMNS[meta.key];
  const sortColumns = meta.key === "campaigns" ? CAMPAIGN_SORT_COLUMNS : meta.key === "productTargets" ? TARGET_SORT_COLUMNS : undefined;
  const sortLabel = meta.key === "productTargets" ? "ASIN targets" : "campaigns";
  const [campaignSort, setCampaignSort] = useState<{ key: CampaignSortKey; direction: "asc" | "desc" } | null>(null);
  const rows = (() => {
    if (!sortColumns || !campaignSort || !section?.rows.length) return section?.rows ?? [];
    return section.rows.map((row, index) => ({ row, index })).toSorted((first, second) => {
      const firstValue = campaignMetric(first.row, campaignSort.key);
      const secondValue = campaignMetric(second.row, campaignSort.key);
      if (firstValue == null && secondValue == null) return first.index - second.index;
      if (firstValue == null) return 1;
      if (secondValue == null) return -1;
      const difference = campaignSort.direction === "desc" ? secondValue - firstValue : firstValue - secondValue;
      return difference || first.index - second.index;
    }).map(item => item.row);
  })();
  const badge = loadStatus === "loading" ? "Loading" : section?.status === "ready" ? `${section.rows.length} row${section.rows.length === 1 ? "" : "s"}` : "Unavailable";
  return <details className={styles.ledgerSection}>
    <summary><div><span aria-hidden="true" /><div><h2>{meta.title}</h2><p>{meta.description} Selected period: {periodLabel}.{meta.key === "campaigns" ? " Campaigns cover all ASINs in the connected account." : ""}</p></div></div><span className={styles.disclosureMeta}><strong>{badge}</strong><ChevronDown aria-hidden="true" /></span></summary>
    <div className={styles.tableScroll}><table><thead><tr>{columns.map(column => {
      const sortKey = sortColumns?.[column];
      const active = sortKey && campaignSort?.key === sortKey;
      return <th key={column} aria-sort={active ? campaignSort.direction === "asc" ? "ascending" : "descending" : undefined}>{sortKey ? <button type="button" className={styles.sortButton} onClick={() => setCampaignSort(current => current?.key === sortKey ? { key: sortKey, direction: current.direction === "desc" ? "asc" : "desc" } : { key: sortKey, direction: "desc" })} aria-label={`Sort ${sortLabel} by ${column} ${active && campaignSort.direction === "desc" ? "ascending" : "descending"}`}>{column}{active ? campaignSort.direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : column}</th>;
    })}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <DetailRow key={row.id} row={row} index={index} sectionKey={meta.key} />) : <tr><td colSpan={columns.length}><div className={styles.emptyLedger}><Database aria-hidden="true" /><strong>{loadStatus === "loading" ? "Loading Scale Insights data" : section?.status === "ready" ? "No rows in this period" : "Performance data unavailable"}</strong><span>{section?.message || `${scopeLabel}. Apply a valid range to retrieve this report.`}</span></div></td></tr>}</tbody></table></div>
  </details>;
}

export function PerformanceOverviewDashboard({ products, reports, currentWeekStart, todayIso }: Props) {
  const defaultStart = addDaysIso(currentWeekStart, -28);
  const [asinFilter, setAsinFilter] = useState("");
  const [draftStartDate, setDraftStartDate] = useState(defaultStart);
  const [draftEndDate, setDraftEndDate] = useState(todayIso);
  const [selectedRange, setSelectedRange] = useState({ startDate: defaultStart, endDate: todayIso });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [overviewState, setOverviewState] = useState<OverviewLoadState>({ status: "idle", data: null, message: "Select a valid ASIN range." });
  const normalizedFilter = asinFilter.trim().toLowerCase();
  const filteredProducts = normalizedFilter ? products.filter(product => [product.asin, product.sku, product.name].some(value => value?.toLowerCase().includes(normalizedFilter))) : products;
  const filteredAsins = useMemo(() => [...new Set(filteredProducts.map(product => product.asin?.trim().toUpperCase()).filter((asin): asin is string => Boolean(asin && /^[A-Z0-9]{10}$/.test(asin))))], [filteredProducts]);
  const asinKey = filteredAsins.join(",");

  useEffect(() => {
    if (!asinKey) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ asins: asinKey, country: "US", startDate: selectedRange.startDate, endDate: selectedRange.endDate });
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setOverviewState({ status: "loading", data: null, message: "Loading Scale Insights performance…" });
      return fetch(`${withPpcBasePath("/api/dashboard/performance-overview")}?${query}`, { headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal });
    })
      .then(async response => {
        if (!response) return;
        const value: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
          throw Object.assign(new Error(typeof candidate.error === "string" ? candidate.error : "Scale Insights dashboard data is unavailable."), { authorizationUrl: trustedAuthorizationUrl(candidate.authorizationUrl) });
        }
        const candidate = value && typeof value === "object" ? parsePerformanceOverviewData((value as Record<string, unknown>).overview) : null;
        if (!candidate) throw new Error("Scale Insights returned an invalid dashboard response.");
        setOverviewState({ status: "ready", data: candidate, message: candidate.warnings.join(" ") || "Scale Insights data loaded." });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const candidate = error as Error & { authorizationUrl?: string };
        setOverviewState(current => ({ status: "error", data: current.data, message: candidate.message || "Scale Insights dashboard data is unavailable.", authorizationUrl: candidate.authorizationUrl }));
      });
    return () => controller.abort();
  }, [asinKey, selectedRange, refreshVersion]);

  const weekStarts = Array.from({ length: 5 }, (_, index) => addDaysIso(currentWeekStart, index * -7));
  const localSevenDay = summarize(filteredProducts, reports, weekStarts.slice(0, 1));
  const localFourteenDay = summarize(filteredProducts, reports, weekStarts.slice(0, 2));
  const localSelected = summarize(filteredProducts, reports, weekStarts);
  const live = asinKey ? overviewState.data : null;
  const productsByAsin = new Map(filteredProducts.flatMap(product => product.asin ? [[product.asin.trim().toUpperCase(), product] as const] : []));
  const asinRows = (live?.asinRanking.rows ?? []).map(row => {
    const previousSales = row.previousTotalSales;
    const momentum = previousSales && previousSales > 0 ? Math.round(((row.totalSales - previousSales) / previousSales) * 1000) / 10 : null;
    return { row, product: productsByAsin.get(row.asin), momentum };
  });
  const currentTotalSpend = asinRows.reduce((total, item) => total + item.row.spend, 0);
  const currentTotalSales = asinRows.reduce((total, item) => total + item.row.totalSales, 0);
  const filteredIds = new Set(filteredProducts.map(product => product.id));
  const latestUpdate = Object.values(reports).filter(report => filteredIds.has(report.productId)).map(report => report.updatedAt).filter(Boolean).toSorted().at(-1);
  const scopeLabel = normalizedFilter ? filteredProducts.length === 1 ? `Filtered to ${filteredProducts[0].asin || filteredProducts[0].sku || filteredProducts[0].name}` : `Filtered to ${filteredProducts.length} matching products` : "Showing all ASINs";
  const displayedLoadStatus: OverviewLoadState["status"] = asinKey ? overviewState.status : "idle";
  const periodLabel = displayRange(selectedRange.startDate, selectedRange.endDate);
  const customLabel = inclusiveDays(selectedRange.startDate, selectedRange.endDate) === 30 ? "30 Days" : "Custom Range";
  const dateError = draftStartDate > draftEndDate ? "Start date must be before the end date." : inclusiveDays(draftStartDate, draftEndDate) > 90 ? "Choose a range of 90 days or less." : "";

  return <main className={styles.overview} aria-label="Account performance dashboard">
    <section className={styles.telemetry} aria-label="Dashboard data status"><span><i aria-hidden="true" /><small>Data Source</small><strong>{live ? "Scale Insights + local reports" : "Browser-local weekly reports"}</strong></span><span><small>Products</small><strong>{normalizedFilter ? `${filteredProducts.length} / ${products.length}` : products.length}</strong></span><span><small>Latest Update</small><strong>{live?.freshness || (latestUpdate ? new Date(latestUpdate).toLocaleString() : "Awaiting saved data")}</strong></span><span className={styles.prototypeBadge}>Performance dashboard</span></section>
    <div className={styles.canvas}>
      <header className={styles.overviewHeader}><div><span>Week {getIsoWeekNumber(currentWeekStart)} · Multi-Timeframe Performance Ledger</span><h1>Performance Overview</h1><p>Account and ASIN performance from Scale Insights, scoped by the selected date range.</p></div><div className={styles.headerControls}>
        <label className={styles.asinFilter}><Search aria-hidden="true" /><span className={styles.srOnly}>Filter dashboard by ASIN, SKU, or product name</span><input type="search" value={asinFilter} onChange={event => setAsinFilter(event.target.value)} placeholder="Filter ASIN performance" aria-label="Filter dashboard by ASIN, SKU, or product name" />{asinFilter ? <button type="button" onClick={() => setAsinFilter("")} aria-label="Clear ASIN performance filter"><X aria-hidden="true" /></button> : null}</label>
        <div className={styles.auditWindow}><CalendarDays aria-hidden="true" /><label><span>Start date</span><input type="date" value={draftStartDate} max={draftEndDate} onChange={event => setDraftStartDate(event.target.value)} aria-label="Dashboard start date" /></label><label><span>End date</span><input type="date" value={draftEndDate} min={draftStartDate} onChange={event => setDraftEndDate(event.target.value)} aria-label="Dashboard end date" /></label><button type="button" onClick={() => !dateError && setSelectedRange({ startDate: draftStartDate, endDate: draftEndDate })} disabled={Boolean(dateError) || overviewState.status === "loading"}><RefreshCw aria-hidden="true" />Apply</button><button className={styles.refreshAll} type="button" onClick={() => setRefreshVersion(version => version + 1)} disabled={!asinKey || overviewState.status === "loading"} aria-label="Refresh all dashboard data"><RefreshCw aria-hidden="true" />Refresh All</button></div>
        <small className={styles.scopeStatus} aria-live="polite">{dateError || `${scopeLabel} · ${periodLabel}`}</small>
      </div></header>
      {!asinKey || overviewState.status === "error" || overviewState.status === "loading" ? <div className={overviewState.status === "error" ? styles.dataError : styles.dataNotice} role="status"><span>{asinKey ? overviewState.message : "No valid ASIN matches the current filter."}</span>{overviewState.authorizationUrl ? <a href={overviewState.authorizationUrl}>Connect Scale Insights</a> : null}</div> : null}
      <section className={styles.temporalSection} aria-labelledby="temporal-ledger-heading">
        <div className={styles.sectionKicker}><span id="temporal-ledger-heading"><i aria-hidden="true" />Temporal Ledger Matrix // Continuous Historical Benchmarks</span><small>Currency: {live?.currency || "USD"} ($)</small></div>
        <div className={styles.temporalGrid}>
          <TemporalCard index={1} label="Today" range={displayDate(todayIso)} source="Scale Insights" unavailableReason="Incomplete day excluded" />
          <TemporalCard index={2} label="Yesterday" range={displayDate(addDaysIso(todayIso, -1))} summary={live?.periods.yesterday} source="Scale Insights" unavailableReason="Daily source pending" />
          <TemporalCard index={3} label="7 Days" range={displayRange(addDaysIso(todayIso, -7), addDaysIso(todayIso, -1))} summary={live?.periods.sevenDays || (localSevenDay.reports ? localSevenDay : null)} source={live?.periods.sevenDays ? "Scale Insights" : "Local weekly reports"} />
          <TemporalCard index={4} label="14 Days" range={displayRange(addDaysIso(todayIso, -14), addDaysIso(todayIso, -1))} summary={live?.periods.fourteenDays || (localFourteenDay.reports ? localFourteenDay : null)} source={live?.periods.fourteenDays ? "Scale Insights" : "Local weekly reports"} />
          <TemporalCard index={5} label={customLabel} range={periodLabel} summary={live?.periods.selectedRange || (localSelected.reports ? localSelected : null)} source={live?.periods.selectedRange ? "Scale Insights" : "Local weekly reports"} />
        </div>
      </section>
      <DailyPerformanceChart rows={live?.dailyPerformance ?? []} summary={live?.periods.selectedRange} currencyCode={live?.currency || "USD"} loading={overviewState.status === "loading"} />
      <details className={styles.ledgerSection}>
        <summary><div><span aria-hidden="true" /><div><h2>ASIN Velocity &amp; Performance Ranking</h2><p>Product-level Scale Insights results for {live ? displayRange(live.actualPeriod.startDate, live.actualPeriod.endDate) : periodLabel}.</p></div></div><span className={styles.disclosureMeta}><strong>{asinRows.length} active row{asinRows.length === 1 ? "" : "s"}</strong><ChevronDown aria-hidden="true" /></span></summary>
        <div className={styles.tableScroll}><table><thead><tr><th>Rank &amp; Velocity</th><th>ASIN / SKU Details</th><th>Sales</th><th>Spend</th><th>Orders</th><th>ACOS</th><th>TACOS</th><th className={styles.spendShare}>Spend Share</th><th className={styles.salesShare}>Sales Share</th><th>WoW Momentum</th></tr></thead><tbody>{asinRows.length ? asinRows.map(({ product, row, momentum }, index) => <tr key={row.asin}><td><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span></td><td><strong>{product?.name || row.asin}</strong><small>ASIN: {row.asin} · SKU: {product?.sku || "N/A"}</small></td><td>{currency(row.totalSales)}</td><td>{currency(row.spend)}</td><td>{Math.round(row.totalOrders)}</td><td>{displayPercent(percentage(row.spend, row.ppcSales))}</td><td>{displayPercent(percentage(row.spend, row.totalSales))}</td><td className={styles.spendShare}>{displayPercent(percentage(row.spend, currentTotalSpend))}</td><td className={styles.salesShare}>{displayPercent(percentage(row.totalSales, currentTotalSales))}</td><td className={momentum == null ? styles.neutral : momentum >= 0 ? styles.positive : styles.negative}>{momentum == null ? "New / unavailable" : `${momentum >= 0 ? "↗" : "↘"} ${Math.abs(momentum)}%`}</td></tr>) : <tr><td colSpan={10}><div className={styles.emptyLedger}><PackageSearch aria-hidden="true" /><strong>{overviewState.status === "loading" ? "Loading ASIN performance" : live?.asinRanking.status === "ready" ? "No ASIN performance in this period" : "ASIN performance unavailable"}</strong><span>{live?.asinRanking.message || "Apply a valid date range to retrieve ASIN-level Scale Insights data."}</span></div></td></tr>}</tbody></table></div>
      </details>
      {DETAIL_SECTIONS.map(meta => <DetailPerformance key={meta.key} meta={meta} section={live?.sections[meta.key]} loadStatus={displayedLoadStatus} scopeLabel={scopeLabel} periodLabel={periodLabel} />)}
    </div>
  </main>;
}
