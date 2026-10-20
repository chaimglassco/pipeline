"use client";
import { PpcAuditWorkspace } from "./ppc-audit-workspace";
import { SearchQueryPerformance } from "./search-query-performance";

import Image from "next/image";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Bold, CalendarDays, Check, CheckCircle2, Clock3,
  FileText, Flag, GitCompareArrows, Italic, LayoutDashboard, Underline, List, ListOrdered, Package, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import {
  PPC_DASHBOARD_STORAGE_KEY, addDaysIso, addMonthsIso, calculateWeeklyPerformance, createWeeklyPpcReport, currency, latestWeeklyBudget, withInheritedWeeklyBudget,
  formatReportingMonthRange, formatWeekRange, formatWeeklyGoalTarget, formatWeeklyGoalValue, getIsoWeekNumber, getSelectedMonthWeekStarts, getSummaryTopics, summaryTopicsNotes, parsePpcDashboardStore, percentage, reportKey,
  startOfWeekIso, withCalculatedPerformance, type ActionItem, type DashboardProduct, type GoalOutcome,
  WEEKLY_GOAL_OPTIONS, weeklyGoalActualValue, weeklyGoalLabel, weeklyGoalUnit, type GoalDataState, type SummaryTopic, type WeeklyGoal, type WeeklyGoalMetric, type WeeklyPpcReport,
} from "../domain/ppc-dashboard-state";
import {
  PPC_DASHBOARD_CATALOG_STORAGE_KEY, createDashboardTagId, emptyDashboardCatalog, mergeDashboardProducts, orderDashboardProductsByTag,
  parseDashboardCatalogStore, reorderVisibleProducts, type DashboardCatalogProduct, type DashboardCatalogStore, type ManagedDashboardProduct,
} from "../domain/ppc-dashboard-catalog";
import { ProductPortfolioPanel, type ProductFormValue } from "./product-portfolio-panel";
import { ProductPerformanceChat, type PerformanceChatPeriod } from "./product-performance-chat";
import { CampaignWeeklyComparison } from "./campaign-weekly-comparison";
import { UntargetedSalesOpportunities, type OpportunityPpcClickTotal } from "./untargeted-sales-opportunities";
import { PerformanceOverviewDashboard } from "./performance-overview-dashboard";
import { AccountCampaignCompare } from "./account-campaign-compare";
import { WeeklyPerformanceTable, type WeeklyTableColumn } from "./weekly-performance-table";
import { dashboardStorage, type SharedSaveStatus } from "../state/shared-dashboard-client";
import { ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY } from "../domain/account-campaign-compare";
import { PPC_CAMPAIGN_CSV_CACHE_KEY } from "../domain/campaign-comparison-csv";
import { PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY, PPC_OPPORTUNITY_HISTORY_CACHE_KEY } from "../domain/untargeted-sales-opportunities";
import type { ScaleInsightsWeeklyPerformance } from "../data/scale-insights-performance";
import { PPC_PERFORMANCE_CACHE_KEY, parsePerformanceCache, parsePerformanceSnapshot, performanceCacheKey, performanceSnapshotNeedsMetricsUpgrade, type PerformanceCache } from "../domain/ppc-performance-cache";
import { PPC_WORKSPACE_SELECTION_KEY, parsePpcWorkspaceSelection, serializePpcWorkspaceSelection } from "../domain/ppc-workspace-selection";
import { getScaleInsightsAnalysisHref, PPC_ANALYSIS_COLUMNS } from "../domain/ppc-analysis-navigation";
import styles from "./ppc-performance-dashboard.module.css";
import periods from "./ppc-reporting-periods.module.css";
import ws from "./ppc-performance-workspace.module.css";

type PerformanceLoadState = {
  key: string;
  status: "idle" | "loading" | "authorization" | "ready" | "error";
  message: string;
  warnings: string[];
  authorizationUrl?: string;
};

const BUDGET_HISTORY_PAGE_SIZE = 5;
const PERFORMANCE_BACKFILL_CONCURRENCY = 2;
const MISSING_PPC_CLICKS_WARNING = "Scale Insights did not include PPC Clicks for this reporting period; PPC Conversion Rate is unavailable.";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function numericValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundedMetricValue(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.max(0, value))) : "0";
}

function withSearchTermPpcClicks(snapshot: ScaleInsightsWeeklyPerformance | undefined, ppcClicks: number | undefined) {
  if (!snapshot || snapshot.metrics.ppcClicks != null || ppcClicks == null) return snapshot;
  return {
    ...snapshot,
    metrics: calculateWeeklyPerformance({ ...snapshot.metrics, ppcClicks }),
    warnings: snapshot.warnings.filter(warning => warning !== MISSING_PPC_CLICKS_WARNING),
  };
}

function formatPeriodCardRange(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear !== endYear) return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  if (startMonth === endMonth) return `${startMonth} ${startDay} – ${endDay}, ${endYear}`;
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
}

function dailyLimitFromWeekly(weeklyLimit: number) {
  return Math.round((weeklyLimit / 7) * 100) / 100;
}

function preciseCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value || 0);
}

function WeeklyGoalRow({ goal, report, dataState, onUpdate, onResolve, onRemove }: { goal: WeeklyGoal; report: WeeklyPpcReport; dataState: GoalDataState | null; onUpdate: (patch: Partial<WeeklyGoal>) => void; onResolve: (status: GoalOutcome) => void; onRemove: () => void }) {
  const [targetEditing, setTargetEditing] = useState(false);
  const isCustomGoal = goal.custom === true || (!goal.metric && goal.title !== "Choose goal");
  const label = goal.metric ? weeklyGoalLabel(goal.metric) : goal.title || "Choose goal";
  const actualState = goal.metric ? dataState : null;
  const actualValue = weeklyGoalActualValue(goal, report);
  const actual = actualState ? formatWeeklyGoalValue(goal, actualValue) : "";
  const targetValue = numericValue(goal.target);
  const goalProgress = targetValue > 0 && actualValue != null
    ? Math.min(100, Math.round((actualValue / targetValue) * 100))
    : 0;
  const selectMetric = (selection: string) => {
    if (selection === "custom") {
      onUpdate({ metric: undefined, title: "Custom goal", unit: undefined, custom: true, target: "", actual: "" });
      return;
    }
    const metric = selection as WeeklyGoalMetric;
    onUpdate({ metric, title: weeklyGoalLabel(metric), unit: weeklyGoalUnit(metric), custom: undefined, target: "", actual: "" });
  };

  return <div className={ws.goalRow}>
    <div className={ws.goalDefinition}>
      <CheckCircle2 aria-hidden="true" /><label><span className={ws.srOnly}>Goal</span><select aria-label={`Goal metric ${goal.id}`} value={goal.metric ?? (isCustomGoal ? "custom" : "")} onChange={event => selectMetric(event.target.value)}><option value="" disabled>Choose goal</option><option value="custom">Custom Goal</option>{WEEKLY_GOAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {goal.metric === "organicOrders" ? <label>Measure<select aria-label="Organic Order measurement" value={weeklyGoalUnit(goal.metric, goal.unit)} onChange={event => onUpdate({ unit: event.target.value as "number" | "percentage", target: "", actual: "" })}><option value="number">Number</option><option value="percentage">Percentage</option></select></label> : null}
      {isCustomGoal ? <label className={ws.customGoalName}>Goal text<input aria-label="Custom goal text" value={goal.title === "Custom goal" ? "" : goal.title} placeholder="Write your goal…" onChange={event => onUpdate({ title: event.target.value || "Custom goal" })} /></label> : null}
    </div>
    <div className={ws.goalProgress}><span><i style={{ width: `${goalProgress}%` }} /></span><div className={ws.goalInlineValues}><label><span>Target</span><input aria-label={`${label} target`} inputMode="decimal" value={targetEditing ? goal.target.replace(/[^0-9.-]/g, "") : formatWeeklyGoalTarget(goal)} placeholder="—" onFocus={() => setTargetEditing(true)} onBlur={() => setTargetEditing(false)} onChange={event => onUpdate({ target: event.target.value })} /></label><label><span>Actual</span><input aria-label={`${label} actual`} aria-readonly="true" readOnly value={actual} placeholder="—" /></label></div></div>
    <div className={ws.goalFooter}><small className={`${ws.goalDataState} ${actualState === "Final" ? ws.goalActualFinal : actualState === "Partial" ? ws.goalActualPartial : ws.goalActualWaiting}`}>{actualState ?? (goal.metric ? "Waiting" : isCustomGoal ? "Manual goal" : "Select goal")}</small><div className={ws.goalOutcomeActions}><button type="button" aria-label={`Mark ${label} achieved`} title="Mark achieved" onClick={() => onResolve("Achieved")}><CheckCircle2 aria-hidden="true" /></button><button type="button" aria-label={`Mark ${label} missed`} title="Mark missed" onClick={() => onResolve("Missed")}><X aria-hidden="true" /></button><button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><Trash2 aria-hidden="true" /></button></div></div>
  </div>;
}

const WEEK_METRIC_CARDS = [
  { key: "totalSales", label: "Total Sales", kind: "currency" },
  { key: "totalOrders", label: "Total Orders", kind: "number" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "ppcSales", label: "PPC Sales", kind: "currency" },
  { key: "organicSales", label: "Organic Sales", kind: "currency" },
  { key: "ppcOrders", label: "PPC Orders", kind: "number" },
  { key: "organicOrders", label: "Organic Orders", kind: "number" },
  { key: "acos", label: "ACOS", kind: "percentage" },
  { key: "tacos", label: "TACOS", kind: "percentage" },
] as const;

function WeekMetricCards({ current, previous }: { current?: WeeklyTableColumn; previous?: WeeklyTableColumn }) {
  const format = (value: number | undefined, kind: string) => {
    if (value == null || !Number.isFinite(value)) return "—";
    if (kind === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}${kind === "percentage" ? "%" : ""}`;
  };
  return <section className={ws.weekMetricOverview} aria-label="Selected week metric cards">
    <div className={ws.weekMetricCaption}><strong>{current ? formatWeekRange(current.weekStart) : "Selected week"}</strong><span>vs previous week{current?.dataState === "Partial" ? " · Selected week is partial; previous week covers its full period" : ""}</span></div>
    {[{ title: "Sales & Spend Metrics", keys: ["spend", "ppcSales", "organicSales", "totalSales"] }, { title: "Order Volume & Efficiency", keys: ["ppcOrders", "organicOrders", "totalOrders", "acos", "tacos"] }].map(group => <div key={group.title} className={ws.weekMetricGroup}><div className={ws.weekMetricGroupHeading}><h4>{group.title}</h4><span>{group.title.startsWith("Sales") ? `Total Revenue: ${format(current?.report?.totalSales, "currency")}` : `Total Orders: ${format(current?.report?.totalOrders, "number")}`}</span></div><div className={ws.weekMetricGrid}>{group.keys.filter(metricKey => metricKey !== "tacos").map(metricKey => { const cards = (metricKey === "acos" ? ["acos", "tacos"] : [metricKey]).map(cardKey => WEEK_METRIC_CARDS.find(card => card.key === cardKey)!).map(({ key, label, kind }) => {
      const value = current?.report?.[key];
      const prior = previous?.report?.[key];
      const available = value != null && prior != null && Number.isFinite(value) && Number.isFinite(prior);
      const delta = available ? value - prior : null;
      const change = delta == null ? "No comparison" : kind === "percentage" ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)} pp` : prior === 0 ? value === 0 ? "0%" : "New" : `${delta > 0 ? "+" : ""}${(delta / prior! * 100).toFixed(0)}%`;
      const tone = delta == null || delta === 0 || key === "spend" ? "neutral" : (kind === "percentage" ? delta < 0 : delta > 0) ? "positive" : "negative";
      return <article key={key} className={ws.weekMetricTile} aria-label={`${label} weekly comparison`} data-tone={tone}>
        <span className={ws.weekMetricLabel}>{label}</span><b className={ws.weekMetricChange} title={kind === "percentage" ? "Percentage-point change from previous week" : "Change from previous week"}>{delta != null && delta !== 0 ? delta > 0 ? "↑ " : "↓ " : ""}{change}</b><strong className={ws.weekMetricValue}>{format(value, kind)}</strong>
        <small className={ws.weekMetricContext}>{kind === "currency" && key !== "totalSales" && value != null && current?.report?.totalSales ? `${(value / current.report.totalSales * 100).toFixed(0)}% of total sales` : (key === "ppcOrders" || key === "organicOrders") && value != null && current?.report?.totalOrders ? `${(value / current.report.totalOrders * 100).toFixed(0)}% of orders` : "Week-over-week snapshot"}</small><div className={ws.weekMetricComparison}><span title="Previous week">Prev {format(prior, kind)}</span></div>
      </article>;
    }); return metricKey === "acos" ? <div key="efficiency" className={`${ws.weekMetricTile} ${ws.weekMetricPair}`} aria-label="ACOS and TACOS weekly comparison">{cards}</div> : cards[0]; })}</div></div>)}
  </section>;
}

function resizeSummaryTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`;
}

function SummaryTopicComposer({ topics, onChange }: { topics: SummaryTopic[]; onChange: (topics: SummaryTopic[]) => void }) {
  const label = "Performance documentation";
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  useLayoutEffect(() => {
    textareaRefs.current.forEach(resizeSummaryTextarea);
  }, [topics]);
  const updateTopic = (id: string, patch: Partial<SummaryTopic>) => onChange(topics.map(topic => topic.id === id ? { ...topic, ...patch } : topic));
  const moveTopic = (index: number, offset: number) => {
    const next = [...topics];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const applyFormat = (format: "bold" | "italic" | "underline" | "bullet" | "numbered", topicId: string) => {
    const topic = topics.find(candidate => candidate.id === topicId);
    if (!topic) return;
    const textarea = textareaRefs.current.get(topic.id);
    if (!textarea) return;
    const value = topic.body;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    let replacement = selected;
    let selectionStart = start;
    let selectionEnd = end;

    if (format === "bold" || format === "italic" || format === "underline") {
      const marker = format === "bold" ? "**" : format === "underline" ? "<u>" : "_";
      const content = selected || `${format} text`;
      replacement = `${marker}${content}${format === "underline" ? "</u>" : marker}`;
      selectionStart = start + marker.length;
      selectionEnd = selectionStart + content.length;
    } else {
      if (!selected) {
        replacement = format === "bullet" ? "• " : "1. ";
      } else {
        replacement = selected.split("\n").map((line, index) => `${format === "bullet" ? "•" : `${index + 1}.`} ${line.replace(/^\s*(?:[-•]|\d+\.)\s*/, "")}`).join("\n");
      }
      selectionStart = start + replacement.length;
      selectionEnd = start + replacement.length;
    }

    updateTopic(topic.id, { body: `${value.slice(0, start)}${replacement}${value.slice(end)}` });
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const continueList = (event: ReactKeyboardEvent<HTMLTextAreaElement>, topic: SummaryTopic) => {
    if (event.key !== "Enter" || !event.shiftKey) return;
    const textarea = event.currentTarget;
    const value = topic.body;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const currentLine = value.slice(lineStart, start);
    const bullet = currentLine.match(/^(\s*)•\s?/);
    const numbered = currentLine.match(/^(\s*)(\d+)\.\s?/);
    if (!bullet && !numbered) return;

    event.preventDefault();
    const continuation = bullet ? `\n${bullet[1]}• ` : `\n${numbered?.[1] ?? ""}${Number(numbered?.[2] ?? 0) + 1}. `;
    const nextCursor = start + continuation.length;
    updateTopic(topic.id, { body: `${value.slice(0, start)}${continuation}${value.slice(end)}` });
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return <div className={ws.textAreaLabel}><span className={ws.textAreaHeader}><span>{label}</span><span className={ws.formatToolbar}>
    <button type="button" aria-label="Add summary topic" disabled={topics.length >= 100} onClick={() => {
      const id = crypto.randomUUID();
      onChange([...topics, { id, title: "New Topic", body: "" }]);
      window.requestAnimationFrame(() => textareaRefs.current.get(id)?.focus());
    }}><Plus aria-hidden="true" /></button>
  </span></span><div className={ws.summaryTopics}>{topics.map((topic, index) => <section key={topic.id} className={`${ws.summaryTopic} ${topic.id === "summary-default-good" || topic.title.trim().toLowerCase() === "good" ? ws.summaryTopicGood : topic.id === "summary-default-bad" || topic.title.trim().toLowerCase() === "bad" ? ws.summaryTopicBad : ""}`} aria-label={`Summary topic ${topic.title || "Untitled Topic"}`}>
    <div className={ws.summaryTopicHeader}><input aria-label={`Topic title ${index + 1}`} maxLength={200} value={topic.title} placeholder="Topic title" onChange={event => updateTopic(topic.id, { title: event.target.value })} /><span className={ws.topicFormatToolbar} role="toolbar" aria-label={`${topic.title || "Untitled Topic"} formatting`} onMouseDown={event => event.preventDefault()}>
      <button type="button" aria-label={`Bold ${topic.title || "Untitled Topic"}`} onClick={() => applyFormat("bold", topic.id)}><Bold aria-hidden="true" /></button>
      <button type="button" aria-label={`Italic ${topic.title || "Untitled Topic"}`} onClick={() => applyFormat("italic", topic.id)}><Italic aria-hidden="true" /></button>
      <button type="button" aria-label={`Underline ${topic.title || "Untitled Topic"}`} onClick={() => applyFormat("underline", topic.id)}><Underline aria-hidden="true" /></button>
      <button type="button" aria-label={`Bulleted list ${topic.title || "Untitled Topic"}`} onClick={() => applyFormat("bullet", topic.id)}><List aria-hidden="true" /></button>
      <button type="button" aria-label={`Numbered list ${topic.title || "Untitled Topic"}`} onClick={() => applyFormat("numbered", topic.id)}><ListOrdered aria-hidden="true" /></button>
    </span><div className={ws.summaryTopicActions}>
      <button type="button" aria-label={`Move ${topic.title || "Untitled Topic"} up`} disabled={index === 0} onClick={() => moveTopic(index, -1)}><ArrowUp aria-hidden="true" /></button>
      <button type="button" aria-label={`Move ${topic.title || "Untitled Topic"} down`} disabled={index === topics.length - 1} onClick={() => moveTopic(index, 1)}><ArrowDown aria-hidden="true" /></button>
      <button type="button" aria-label={`Remove topic ${topic.title || "Untitled Topic"}`} onClick={() => onChange(topics.filter(candidate => candidate.id !== topic.id))}><X aria-hidden="true" /></button>
    </div></div><textarea ref={element => { if (element) textareaRefs.current.set(topic.id, element); else textareaRefs.current.delete(topic.id); }} className={ws.notesArea} aria-label={`${topic.title || "Untitled Topic"} documentation`} value={topic.body} onChange={event => { resizeSummaryTextarea(event.currentTarget); updateTopic(topic.id, { body: event.target.value }); }} onKeyDown={event => continueList(event, topic)} placeholder="Add discussion notes…" />
  </section>)}{!topics.length ? <p>No topics yet. Use + to add a topic.</p> : null}</div></div>;
}

function summaryTopicsFromText(text: string): SummaryTopic[] {
  const source = text.trim();
  if (!source) return [];
  const headings = [...source.matchAll(/^##\s+(.+)\r?$/gm)];
  if (!headings.length) return [{ id: "previous-summary-general", title: "General Summary", body: source }];
  return headings.map((heading, index) => ({
    id: `previous-summary-${index}`,
    title: heading[1].trim(),
    body: source.slice((heading.index ?? 0) + heading[0].length, headings[index + 1]?.index ?? source.length).trim(),
  }));
}

function SummaryColumns({ children }: { children: ReactNode }) {
  const columnsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = columnsRef.current;
    if (!root) return;
    const panels = Array.from(root.children) as HTMLElement[];
    const topics = panels.map(panel => Array.from(panel.querySelectorAll<HTMLElement>(`.${ws.summaryTopic}`)));
    const align = () => {
      topics.flat().forEach(topic => { topic.style.minHeight = ""; });
      if (panels.length !== 2 || panels[0].offsetTop !== panels[1].offsetTop) return;
      for (let index = 0; index < Math.min(topics[0].length, topics[1].length); index += 1) {
        const pair = [topics[0][index], topics[1][index]];
        const height = Math.max(...pair.map(topic => topic.getBoundingClientRect().height));
        pair.forEach(topic => { topic.style.minHeight = `${height}px`; });
      }
    };
    align();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(align);
    observer.observe(root);
    topics.flat().forEach(topic => {
      const body = topic.querySelector("textarea, p");
      if (body) observer.observe(body);
    });
    return () => observer.disconnect();
  }, [children]);
  return <div ref={columnsRef} className={`${ws.twoColumn} ${ws.summaryColumns}`}>{children}</div>;
}

function ReadOnlySummaryTopics({ topics }: { topics: SummaryTopic[] }) {
  return <div className={ws.readOnlySummary}><span>Performance Documentation</span><div className={ws.summaryTopics}>
    {topics.map(topic => <section key={topic.id} className={`${ws.summaryTopic} ${topic.title.trim().toLowerCase() === "good" ? ws.summaryTopicGood : topic.title.trim().toLowerCase() === "bad" ? ws.summaryTopicBad : ""}`} aria-label={`Previous summary topic ${topic.title || "Untitled Topic"}`}>
      <div className={ws.summaryTopicHeader}><strong>{topic.title || "Untitled Topic"}</strong></div>
      <p className={ws.readOnlyTopicBody}>{topic.body || "No discussion notes."}</p>
    </section>)}
    {!topics.length ? <p className={ws.emptyPreviousSummary}>No previous week documentation yet.</p> : null}
  </div></div>;
}

function statusTone(status: string) {
  if (status === "Completed" || status === "Achieved" || status === "On Track") return styles.success;
  if (status === "Needs Review" || status === "At Risk") return styles.warning;
  if (status === "Missed") return styles.danger;
  return styles.info;
}

export function PpcPerformanceDashboard({ initialToday, remoteSync, sharedSaveStatus, canEdit = true }: { initialToday: string; remoteSync?: { version: number; keys: readonly string[] }; sharedSaveStatus?: SharedSaveStatus; canEdit?: boolean }) {
  const initialWeekStart = startOfWeekIso(initialToday);
  const initialMonthKey = initialToday.slice(0, 7);
  const [pipelineProducts, setPipelineProducts] = useState<DashboardProduct[]>([]);
  const [activeView, setActiveView] = useState<"dashboard" | "products" | "compare" | "audit">("products");
  const [catalog, setCatalog] = useState<DashboardCatalogStore>(emptyDashboardCatalog);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedWeekStart, setSelectedWeekStart] = useState(initialWeekStart);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([initialMonthKey]);
  const [draftSelectedMonths, setDraftSelectedMonths] = useState<string[]>([initialMonthKey]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [goalHistoryOpen, setGoalHistoryOpen] = useState(false);
  const [budgetHistoryView, setBudgetHistoryView] = useState({ key: "", page: 1 });
  const [monthPickerYear, setMonthPickerYear] = useState(Number(initialToday.slice(0, 4)));
  const currentWeekStart = initialWeekStart;
  const [reports, setReports] = useState<Record<string, WeeklyPpcReport>>({});
  const [saveNotice, setSaveNotice] = useState("");
  const [performanceLoad, setPerformanceLoad] = useState<PerformanceLoadState>({ key: "", status: "idle", message: "", warnings: [] });
  const [performanceRefresh, setPerformanceRefresh] = useState(0);
  const [opportunityRefresh, setOpportunityRefresh] = useState({ key: "", version: 0 });
  const [opportunityPpcClicks, setOpportunityPpcClicks] = useState<Record<string, number>>({});
  const [performanceCache, setPerformanceCache] = useState<PerformanceCache>({});
  const cacheRef = useRef<PerformanceCache>({});
  const refreshRequest = useRef("");
  const budgetEditStartRef = useRef<{ key: string; value: number } | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [selectionReady, setSelectionReady] = useState(false);

  const receiveOpportunityPpcClicks = useCallback((total: OpportunityPpcClickTotal) => {
    const key = performanceCacheKey(total.asin, total.weekStart);
    setOpportunityPpcClicks(current => current[key] === total.ppcClicks ? current : { ...current, [key]: total.ppcClicks });
  }, []);

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    setProductsLoading(true);
    setProductsError("");
    let nextProducts: DashboardProduct[] = [];
    let loaded = false;
    try {
      const response = await fetch(withPpcBasePath("/api/dashboard/products"), { headers: getPipelineAuthorizationHeader(), cache: "no-store", signal });
      const value: unknown = await response.json();
      if (!response.ok || !value || typeof value !== "object") throw new Error("Could not load Pipeline products.");
      const candidates = (value as { products?: unknown }).products;
      nextProducts = Array.isArray(candidates) ? candidates as DashboardProduct[] : [];
      setPipelineProducts(nextProducts);
      loaded = true;
    } catch (error) {
      if ((error as Error).name !== "AbortError") setProductsError(error instanceof Error ? error.message : "Could not load Pipeline products.");
    } finally {
      const storedCatalog = parseDashboardCatalogStore(dashboardStorage().getItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY));
      const orderedProducts = orderDashboardProductsByTag(mergeDashboardProducts(nextProducts, storedCatalog), storedCatalog.tags);
      setSelectedProductId(current => (orderedProducts.some(product => product.id === current) || (!loaded && Boolean(current))) ? current : orderedProducts[0]?.id || "");
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storageTimer = window.setTimeout(() => {
      let savedSelection: string | null = null;
      try { savedSelection = window.localStorage.getItem(PPC_WORKSPACE_SELECTION_KEY); } catch { /* A blocked preference store must not prevent shared reports from loading. */ }
      const selection = parsePpcWorkspaceSelection(savedSelection, currentWeekStart);
      if (selection) {
        setSelectedProductId(selection.productId);
        setSelectedWeekStart(selection.weekStart);
        setSelectedMonths(selection.selectedMonths);
        setDraftSelectedMonths(selection.selectedMonths);
      }
      setSelectionReady(true);
      const storedCatalog = parseDashboardCatalogStore(dashboardStorage().getItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY));
      setReports(parsePpcDashboardStore(dashboardStorage().getItem(PPC_DASHBOARD_STORAGE_KEY)).reports);
      setCatalog(storedCatalog);
      cacheRef.current = parsePerformanceCache(dashboardStorage().getItem(PPC_PERFORMANCE_CACHE_KEY));
      setPerformanceCache(cacheRef.current);
      setCacheReady(true);
    }, 0);
    const controller = new AbortController();
    const productTimer = window.setTimeout(() => void loadProducts(controller.signal), 0);
    return () => { window.clearTimeout(storageTimer); window.clearTimeout(productTimer); controller.abort(); };
  }, [loadProducts, currentWeekStart]);

  useEffect(() => {
    if (!remoteSync?.version) return;
    const timer = window.setTimeout(() => {
      const keys = new Set(remoteSync.keys);
      if (keys.has(PPC_DASHBOARD_STORAGE_KEY)) setReports(parsePpcDashboardStore(dashboardStorage().getItem(PPC_DASHBOARD_STORAGE_KEY)).reports);
      if (keys.has(PPC_DASHBOARD_CATALOG_STORAGE_KEY)) {
        const nextCatalog = parseDashboardCatalogStore(dashboardStorage().getItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY));
        const orderedProducts = orderDashboardProductsByTag(mergeDashboardProducts(pipelineProducts, nextCatalog), nextCatalog.tags);
        setCatalog(nextCatalog);
        setSelectedProductId(current => orderedProducts.some(product => product.id === current) ? current : orderedProducts[0]?.id ?? "");
      }
      if (keys.has(PPC_PERFORMANCE_CACHE_KEY)) {
        cacheRef.current = parsePerformanceCache(dashboardStorage().getItem(PPC_PERFORMANCE_CACHE_KEY));
        setPerformanceCache(cacheRef.current);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pipelineProducts, remoteSync]);

  useEffect(() => {
    if (!monthPickerOpen && !goalHistoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMonthPickerOpen(false);
      setGoalHistoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [goalHistoryOpen, monthPickerOpen]);

  const products = useMemo(() => orderDashboardProductsByTag(mergeDashboardProducts(pipelineProducts, catalog), catalog.tags), [catalog, pipelineProducts]);
  const weekStarts = useMemo(() => getSelectedMonthWeekStarts(selectedMonths, currentWeekStart), [currentWeekStart, selectedMonths]);
  const reportingMonthLabel = useMemo(() => formatReportingMonthRange(weekStarts), [weekStarts]);
  const activeWeekStart = weekStarts.includes(selectedWeekStart) ? selectedWeekStart : weekStarts[0] ?? selectedWeekStart;
  useEffect(() => {
    if (!selectionReady || !selectedProductId) return;
    try {
      window.localStorage.setItem(PPC_WORKSPACE_SELECTION_KEY, serializePpcWorkspaceSelection({
        productId: selectedProductId, weekStart: activeWeekStart, selectedMonths,
      }));
    } catch { /* The shared report remains authoritative even if this view preference cannot be saved. */ }
  }, [selectionReady, selectedProductId, activeWeekStart, selectedMonths]);
  const performanceWeekStarts = useMemo(() => Array.from({ length: 6 }, (_, index) => addDaysIso(activeWeekStart, (index - 5) * 7)), [activeWeekStart]);
  const selectedProduct = products.find(product => product.id === selectedProductId) ?? null;
  const selectedKey = selectedProductId && activeWeekStart ? reportKey(selectedProductId, activeWeekStart) : "";
  const selectedAsin = selectedProduct?.asin?.trim() || "";
  const snapshotKey = performanceCacheKey(selectedAsin, activeWeekStart);
  const cachedPerformance = withSearchTermPpcClicks(performanceCache[snapshotKey], opportunityPpcClicks[snapshotKey]);
  const goalDataState: GoalDataState | null = cachedPerformance
    ? cachedPerformance.endDate >= addDaysIso(activeWeekStart, 6) ? "Final" : "Partial"
    : null;
  const previousWeekStart = addDaysIso(activeWeekStart, -7);
  const previousDraft = selectedProductId && activeWeekStart ? reports[reportKey(selectedProductId, previousWeekStart)] ?? null : null;
  const previousSnapshotKey = performanceCacheKey(selectedAsin, previousWeekStart);
  const previousSnapshot = withSearchTermPpcClicks(performanceCache[previousSnapshotKey], opportunityPpcClicks[previousSnapshotKey]);
  const previousReport = previousSnapshot && selectedProductId
    ? withCalculatedPerformance({ ...(previousDraft ?? createWeeklyPpcReport(selectedProductId, previousWeekStart)), ...previousSnapshot.metrics, ppcClicks: previousSnapshot.metrics.ppcClicks })
    : previousDraft;
  const inheritedWeeklyBudget = selectedProductId ? latestWeeklyBudget(reports, selectedProductId, activeWeekStart) : undefined;
  const savedReport = selectedKey
    ? reports[selectedKey]
      ? withInheritedWeeklyBudget(reports[selectedKey], inheritedWeeklyBudget)
      : createWeeklyPpcReport(selectedProductId, activeWeekStart, previousReport, inheritedWeeklyBudget)
    : null;
  const report = savedReport && cachedPerformance ? withCalculatedPerformance({ ...savedReport, ...cachedPerformance.metrics, ppcClicks: cachedPerformance.metrics.ppcClicks }) : savedReport;
  const saveMessage = saveNotice ? saveNotice
    : !canEdit ? "View-only access"
    : sharedSaveStatus?.error ? sharedSaveStatus.error
    : sharedSaveStatus?.recoveryError ? sharedSaveStatus.recoveryError
    : sharedSaveStatus?.pending ? "Saving online…"
    : report?.updatedAt ? sharedSaveStatus ? "Saved online" : "Saved locally" : "Changes save automatically";
  const performanceColumns: WeeklyTableColumn[] = performanceWeekStarts.map(weekStart => {
    const cacheKey = performanceCacheKey(selectedAsin, weekStart);
    const snapshot = withSearchTermPpcClicks(performanceCache[cacheKey], opportunityPpcClicks[cacheKey]);
    const storedReport = selectedProductId ? reports[reportKey(selectedProductId, weekStart)] ?? null : null;
    const columnReport = weekStart === activeWeekStart
      ? report
      : snapshot && selectedProductId
        ? withCalculatedPerformance({ ...(storedReport ?? createWeeklyPpcReport(selectedProductId, weekStart)), ...snapshot.metrics, ppcClicks: snapshot.metrics.ppcClicks })
        : storedReport;
    return { weekStart, report: columnReport, dataState: snapshot ? snapshot.endDate >= addDaysIso(weekStart, 6) ? "Final" : "Partial" : null };
  });
  const chatPeriods: PerformanceChatPeriod[] = [...new Set([activeWeekStart, previousWeekStart, ...weekStarts])].slice(0, 60).flatMap(weekStart => {
    if (weekStart === activeWeekStart && report) return [{ weekStart, dataState: goalDataState, report }];
    const storedReport = selectedProductId ? reports[reportKey(selectedProductId, weekStart)] : null;
    const snapshot = performanceCache[performanceCacheKey(selectedAsin, weekStart)];
    if (!storedReport && !snapshot) return [];
    const periodReport = withCalculatedPerformance({ ...(storedReport ?? createWeeklyPpcReport(selectedProductId, weekStart)), ...(snapshot?.metrics ?? {}), ...(snapshot ? { ppcClicks: snapshot.metrics.ppcClicks } : {}) });
    const dataState: GoalDataState | null = snapshot ? snapshot.endDate >= addDaysIso(weekStart, 6) ? "Final" : "Partial" : null;
    return [{ weekStart, dataState, report: periodReport }];
  });
  const previousSummaryText = report?.previousWeekResult || previousReport?.previousWeekResult || previousReport?.notes || "";
  const previousSummaryTopics = previousReport?.summaryTopics ?? summaryTopicsFromText(previousSummaryText);
  const budgetHistoryPageCount = Math.max(1, Math.ceil((report?.budgetHistory.length ?? 0) / BUDGET_HISTORY_PAGE_SIZE));
  const budgetHistoryPage = budgetHistoryView.key === selectedKey ? Math.min(budgetHistoryView.page, budgetHistoryPageCount) : 1;
  const visibleBudgetHistory = report?.budgetHistory.slice((budgetHistoryPage - 1) * BUDGET_HISTORY_PAGE_SIZE, budgetHistoryPage * BUDGET_HISTORY_PAGE_SIZE) ?? [];
  const productGoalHistory = useMemo(() => Object.values(reports)
    .filter(candidate => candidate.productId === selectedProductId)
    .flatMap(candidate => candidate.goalHistory.map(goal => ({ ...goal, weekStart: candidate.weekStart })))
    .sort((first, second) => second.resolvedAt.localeCompare(first.resolvedAt)), [reports, selectedProductId]);
  const basePerformanceLoad: PerformanceLoadState = !selectedKey
    ? { key: "", status: "idle", message: "", warnings: [] }
    : !selectedAsin
      ? { key: selectedKey, status: "idle", message: "Add an ASIN to retrieve Scale Insights performance.", warnings: [] }
      : performanceLoad.key === snapshotKey
        ? performanceLoad
        : cachedPerformance
          ? { key: snapshotKey, status: "ready", message: `Saved Scale Insights data through ${cachedPerformance.freshness.salesDataThrough || cachedPerformance.endDate}. Refresh to update.`, warnings: cachedPerformance.warnings }
        : { key: selectedKey, status: "loading", message: "Retrieving Scale Insights performance…", warnings: [] };
  const displayedPerformanceLoad = cachedPerformance?.metrics.ppcClicks != null
    ? { ...basePerformanceLoad, warnings: basePerformanceLoad.warnings.filter(warning => warning !== MISSING_PPC_CLICKS_WARNING) }
    : basePerformanceLoad;
  const importedMetricsLocked = !!cachedPerformance || displayedPerformanceLoad.status === "ready";
  const budgetUsage = report ? percentage(report.spend, report.weeklyBudget) : 0;
  const budgetBalance = report ? report.weeklyBudget - report.spend : 0;
  const isOverspent = budgetBalance < 0;
  const activeWeekEnd = addDaysIso(activeWeekStart, 6);
  const elapsedBudgetDays = initialToday < activeWeekStart ? 0 : initialToday > activeWeekEnd ? 7
    : Math.min(7, Math.max(1, Math.round((Date.parse(`${initialToday}T00:00:00Z`) - Date.parse(`${activeWeekStart}T00:00:00Z`)) / 86_400_000) + 1));
  const dailySpendAverage = elapsedBudgetDays && report ? report.spend / elapsedBudgetDays : 0;

  useEffect(() => {
    if (!cacheReady || !selectedKey || !selectedAsin) return;
    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => {
      const forceActiveRefresh = refreshRequest.current === snapshotKey;
      if (forceActiveRefresh) refreshRequest.current = "";

      const activeCached = cacheRef.current[snapshotKey];
      const activeCacheNeedsUpgrade = performanceSnapshotNeedsMetricsUpgrade(activeCached);
      if (activeCached && !forceActiveRefresh && !activeCacheNeedsUpgrade) {
        setPerformanceLoad({ key: snapshotKey, status: "ready", message: `Saved Scale Insights data through ${activeCached.freshness.salesDataThrough || activeCached.endDate}. Refresh to update.`, warnings: activeCached.warnings });
      } else {
        setPerformanceLoad({ key: snapshotKey, status: "loading", message: activeCacheNeedsUpgrade ? "Updating saved weeks with traffic metrics…" : "Retrieving Scale Insights performance…", warnings: [] });
      }

      const orderedWeeks = [...new Set([activeWeekStart, ...performanceWeekStarts, ...weekStarts])];
      const pendingWeeks = orderedWeeks.filter(weekStart => {
        const key = performanceCacheKey(selectedAsin, weekStart);
        const snapshot = cacheRef.current[key];
        return (weekStart === activeWeekStart && forceActiveRefresh) || performanceSnapshotNeedsMetricsUpgrade(snapshot);
      });
      let nextWeekIndex = 0;

      const fetchNextWeek = async () => {
        while (!controller.signal.aborted) {
          const weekStart = pendingWeeks[nextWeekIndex];
          nextWeekIndex += 1;
          if (!weekStart) return;
          const key = performanceCacheKey(selectedAsin, weekStart);
          const isActiveWeek = weekStart === activeWeekStart;
          const query = new URLSearchParams({ asin: selectedAsin, country: "US", weekStart });

          try {
            const response = await fetch(withPpcBasePath(`/api/dashboard/performance?${query}`), {
              headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal,
            });
            const value: unknown = await response.json();
            if (controller.signal.aborted) return;
            if (response.status === 409 && value && typeof value === "object") {
              const candidate = value as { authorizationRequired?: unknown; authorizationUrl?: unknown };
              if (candidate.authorizationRequired === true && typeof candidate.authorizationUrl === "string") {
                const authorizationUrl = new URL(candidate.authorizationUrl);
                if (authorizationUrl.protocol === "https:" && (authorizationUrl.hostname === "vercel.com" || authorizationUrl.hostname.endsWith(".vercel.com"))) {
                  if (isActiveWeek) {
                    setPerformanceLoad({
                      key: snapshotKey,
                      status: "authorization",
                      message: "Connect Scale Insights once to retrieve weekly performance.",
                      warnings: [],
                      authorizationUrl: authorizationUrl.toString(),
                    });
                  }
                  continue;
                }
              }
            }
            if (!response.ok || !value || typeof value !== "object") {
              const message = value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string"
                ? String((value as { error: string }).error)
                : "Scale Insights performance is unavailable.";
              throw new Error(message);
            }
            const performance = parsePerformanceSnapshot((value as { performance?: unknown }).performance);
            if (!performance?.metrics || performance.asin !== selectedAsin.toUpperCase() || performance.startDate !== weekStart) {
              throw new Error("Scale Insights returned an invalid performance response.");
            }

            if (isActiveWeek) {
              setReports(current => {
                const currentReport = current[selectedKey] ?? createWeeklyPpcReport(
                  selectedProductId,
                  activeWeekStart,
                  current[reportKey(selectedProductId, addDaysIso(activeWeekStart, -7))],
                  latestWeeklyBudget(current, selectedProductId, activeWeekStart),
                );
                return { ...current, [selectedKey]: withCalculatedPerformance({ ...currentReport, ...performance.metrics, ppcClicks: performance.metrics.ppcClicks }) };
              });
            }

            const nextCache = { ...cacheRef.current, [key]: performance };
            cacheRef.current = nextCache;
            setPerformanceCache(nextCache);
            let storageWarning = "";
            try {
              dashboardStorage().setItem(PPC_PERFORMANCE_CACHE_KEY, JSON.stringify({ version: 1, entries: nextCache }));
            } catch { storageWarning = "This browser could not save these metrics. They will be lost when you close or reload the page."; }

            if (isActiveWeek) {
              const through = performance.freshness.salesDataThrough || performance.endDate;
              setPerformanceLoad({ key: snapshotKey, status: "ready", message: `Scale Insights synced through ${through}.`, warnings: [...performance.warnings, ...(storageWarning ? [storageWarning] : [])] });
            }
          } catch (error) {
            if (isActiveWeek && !controller.signal.aborted && (error as Error).name !== "AbortError") {
              setPerformanceLoad({ key: snapshotKey, status: "error", message: error instanceof Error ? error.message : "Scale Insights performance is unavailable.", warnings: cacheRef.current[snapshotKey] ? ["Refresh failed. Previously saved metrics are still displayed."] : [] });
            }
          }
        }
      };

      if (pendingWeeks.length) {
        const workerCount = Math.min(PERFORMANCE_BACKFILL_CONCURRENCY, pendingWeeks.length);
        void Promise.all(Array.from({ length: workerCount }, () => fetchNextWeek()));
      }
    }, 0);
    return () => { window.clearTimeout(requestTimer); controller.abort(); };
  }, [activeWeekStart, cacheReady, performanceRefresh, performanceWeekStarts, selectedAsin, selectedKey, selectedProductId, snapshotKey, weekStarts]);

  const replaceReport = (nextReport: WeeklyPpcReport) => {
    if (!selectedKey) return;
    if (!canEdit) { setSaveNotice("View-only access. Changes were not saved."); return; }
    const savedReport = { ...nextReport, updatedAt: new Date().toISOString() };
    try {
      const storedReports = parsePpcDashboardStore(dashboardStorage().getItem(PPC_DASHBOARD_STORAGE_KEY)).reports;
      dashboardStorage().setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({
        version: 1, reports: { ...storedReports, [selectedKey]: savedReport },
      }));
      setReports(parsePpcDashboardStore(dashboardStorage().getItem(PPC_DASHBOARD_STORAGE_KEY)).reports);
      setSaveNotice("");
    } catch {
      setReports(current => ({ ...current, [selectedKey]: savedReport }));
      setSaveNotice("Could not queue this edit online. Keep this tab open and try again.");
    }
  };
  const patchReport = (patch: Partial<WeeklyPpcReport>) => { if (report) replaceReport(withCalculatedPerformance({ ...report, ...patch })); };
  const selectProduct = (productId: string) => { setSelectedProductId(productId); setSaveNotice(""); };
  const selectWeek = (weekStart: string) => { setSelectedWeekStart(weekStart); setSaveNotice(""); };
  const commitSelectedMonths = (monthKeys: string[]) => {
    const nextMonths = [...new Set(monthKeys)].sort();
    const nextWeekStarts = getSelectedMonthWeekStarts(nextMonths, currentWeekStart);
    setSelectedMonths(nextMonths);
    setSelectedWeekStart(current => nextWeekStarts.includes(current) ? current : nextWeekStarts[0] ?? current);
  };
  const shiftReportingMonths = (months: number) => commitSelectedMonths(selectedMonths.map(monthKey => addMonthsIso(`${monthKey}-01`, months).slice(0, 7)));
  const openMonthPicker = () => {
    setMonthPickerYear(Number(selectedMonths.at(-1)?.slice(0, 4) || initialToday.slice(0, 4)));
    setDraftSelectedMonths(selectedMonths);
    setMonthPickerOpen(true);
  };
  const toggleDraftMonth = (monthIndex: number) => {
    const monthKey = `${monthPickerYear}-${String(monthIndex + 1).padStart(2, "0")}`;
    setDraftSelectedMonths(current => current.includes(monthKey) ? current.filter(candidate => candidate !== monthKey) : [...current, monthKey].sort());
  };
  const selectPickerYear = () => setDraftSelectedMonths(current => [...new Set([
    ...current,
    ...MONTH_NAMES.map((_, monthIndex) => `${monthPickerYear}-${String(monthIndex + 1).padStart(2, "0")}`),
  ])].sort());
  const applySelectedMonths = () => {
    if (!draftSelectedMonths.length) return;
    commitSelectedMonths(draftSelectedMonths);
    setMonthPickerOpen(false);
  };

  const finishBudgetEdit = (rawValue: string) => {
    if (!report || !selectedKey) return;
    const to = numericValue(rawValue);
    const from = budgetEditStartRef.current?.key === selectedKey ? budgetEditStartRef.current.value : report.weeklyBudget;
    budgetEditStartRef.current = null;
    if (from === to) return;
    const suffix = crypto.randomUUID();
    patchReport({
      weeklyBudget: to,
      dailyBudget: dailyLimitFromWeekly(to),
      budgetHistory: [{ id: `budget-change-${suffix}`, changedAt: new Date().toISOString(), from, to }, ...report.budgetHistory].slice(0, 100),
    });
    setBudgetHistoryView({ key: selectedKey, page: 1 });
  };

  const persistCatalog = (nextCatalog: DashboardCatalogStore) => {
    try {
      dashboardStorage().setItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY, JSON.stringify(nextCatalog));
      setCatalog(nextCatalog);
      return "";
    } catch {
      return "This browser could not save the product catalog. Remove a large image or free browser storage and try again.";
    }
  };
  const createTag = (name: string) => {
    const existing = catalog.tags.find(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return { id: existing.id, error: "" };
    const suffix = typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 8) : String(Date.now());
    const tag = { id: createDashboardTagId(name, suffix), name: name.trim().slice(0, 40) };
    const error = persistCatalog({ ...catalog, tags: [...catalog.tags, tag] });
    return { id: error ? "" : tag.id, error };
  };
  const saveProduct = (value: ProductFormValue) => {
    if (!value.id) {
      const suffix = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const product: DashboardCatalogProduct = { id: `dashboard-${suffix}`, source: "dashboard", stageId: "dashboard", status: "Active", name: value.name, asin: value.asin, sku: value.sku, tagId: value.tagId, imageDataUrl: value.imageDataUrl };
      const error = persistCatalog({ ...catalog, customProducts: [product, ...catalog.customProducts], productOrderIds: [product.id, ...products.map(existing => existing.id)] });
      if (error) return error;
      selectProduct(product.id);
      return "";
    }
    if (value.source === "dashboard") {
      return persistCatalog({ ...catalog, customProducts: catalog.customProducts.map(product => product.id === value.id ? { ...product, name: value.name, asin: value.asin, sku: value.sku, tagId: value.tagId, imageDataUrl: value.imageDataUrl } : product) });
    }
    return persistCatalog({ ...catalog, productOverrides: { ...catalog.productOverrides, [value.id]: { name: value.name, asin: value.asin, sku: value.sku, tagId: value.tagId, imageDataUrl: value.imageDataUrl } } });
  };
  const deleteProduct = (product: ManagedDashboardProduct) => {
    const nextCatalog = product.source === "dashboard"
      ? { ...catalog, customProducts: catalog.customProducts.filter(candidate => candidate.id !== product.id) }
      : { ...catalog, hiddenPipelineProductIds: [...new Set([...catalog.hiddenPipelineProductIds, product.id])] };
    persistCatalog(nextCatalog);
    if (selectedProductId === product.id) selectProduct(products.find(candidate => candidate.id !== product.id)?.id ?? "");
  };
  const reorderProducts = (sourceId: string, targetId: string, visibleIds: string[]) => persistCatalog({
    ...catalog,
    productOrderIds: reorderVisibleProducts(products.map(product => product.id), visibleIds, sourceId, targetId),
  });

  const updateGoal = (goalId: string, patch: Partial<WeeklyGoal>) => {
    if (report) patchReport({ goals: report.goals.map(goal => goal.id === goalId ? { ...goal, ...patch } : goal) });
  };
  const addGoal = () => {
    if (!report) return;
    patchReport({ goals: [...report.goals, { id: `goal-${crypto.randomUUID()}`, title: "Choose goal", target: "", actual: "", status: "On Track" }] });
  };
  const resolveGoal = (goalId: string, status: GoalOutcome) => {
    if (!report) return;
    const goal = report.goals.find(candidate => candidate.id === goalId);
    if (!goal) return;
    const actual = goalDataState ? formatWeeklyGoalValue(goal, weeklyGoalActualValue(goal, report)) : "";
    patchReport({
      goals: report.goals.filter(candidate => candidate.id !== goalId),
      goalHistory: [{ ...goal, actual, status, resolvedAt: new Date().toISOString(), ...(goalDataState ? { dataState: goalDataState } : {}) }, ...report.goalHistory].slice(0, 100),
    });
  };
  const removeGoal = (goalId: string) => { if (report) patchReport({ goals: report.goals.filter(goal => goal.id !== goalId), deletedGoalIds: [...new Set([...(report.deletedGoalIds ?? []), goalId])] }); };
  const updateAction = (actionId: string, patch: Partial<ActionItem>) => {
    if (report) patchReport({ actions: report.actions.map(action => action.id === actionId ? { ...action, ...patch } : action) });
  };
  const addAction = () => {
    if (!report) return;
    patchReport({ actions: [...report.actions, { id: `action-${crypto.randomUUID()}`, title: "New action item", priority: "Medium", dueDate: "", done: false }] });
  };
  const removeAction = (actionId: string) => { if (report) patchReport({ actions: report.actions.filter(action => action.id !== actionId) }); };

  return <section className={styles.dashboard} aria-label="Weekly PPC Performance Notes">
    <nav className={styles.viewTabs} aria-label="PPC workspace views" role="tablist">
      <button type="button" role="tab" aria-selected={activeView === "dashboard"} className={activeView === "dashboard" ? styles.activeViewTab : ""} onClick={() => setActiveView("dashboard")}><LayoutDashboard aria-hidden="true" />Dashboard</button>
      <button type="button" role="tab" aria-selected={activeView === "products"} className={activeView === "products" ? styles.activeViewTab : ""} onClick={() => setActiveView("products")}><Package aria-hidden="true" />Products<span>{products.length}</span></button>
      <button type="button" role="tab" aria-selected={activeView === "compare"} className={activeView === "compare" ? styles.activeViewTab : ""} onClick={() => setActiveView("compare")}><GitCompareArrows aria-hidden="true" />Compare</button>
      <button type="button" role="tab" aria-selected={activeView === "audit"} className={activeView === "audit" ? styles.activeViewTab : ""} onClick={() => setActiveView("audit")}><BarChart3 aria-hidden="true" />Audit</button>
    </nav>

    {activeView === "audit" ? <PpcAuditWorkspace todayIso={initialToday} catalog={products.map(product => ({ asin: product.asin || "", sku: product.sku || "", name: product.name }))} /> : activeView === "dashboard" ? <PerformanceOverviewDashboard products={products} reports={reports} currentWeekStart={currentWeekStart} todayIso={initialToday} /> : activeView === "compare" ? <AccountCampaignCompare key={`account-${remoteSync?.keys.includes(ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY) ? remoteSync.version : 0}`} todayIso={initialToday} /> : <>
    <ProductPortfolioPanel products={products} tags={catalog.tags} loading={productsLoading} error={productsError} selectedProductId={selectedProductId} onSelectProduct={selectProduct} onRetry={() => void loadProducts()} onCreateTag={createTag} onSaveProduct={saveProduct} onDeleteProduct={deleteProduct} onReorderProducts={reorderProducts} />

    <aside className={periods.periodsPanel} aria-labelledby="periods-heading">
      <div className={periods.panelHeader}>
        <div className={periods.headingRow}><h2 id="periods-heading">Reporting Periods</h2><button type="button" className={periods.calendarPickerButton} aria-label={`Choose reporting months, ${reportingMonthLabel}`} onClick={openMonthPicker}><CalendarDays aria-hidden="true" /></button></div>
        <div className={periods.monthPicker} role="group" aria-label="Month navigation"><button type="button" aria-label="Previous selected month range" onClick={() => shiftReportingMonths(-1)}><ArrowLeft aria-hidden="true" /></button><strong>{reportingMonthLabel}</strong><button type="button" aria-label="Next selected month range" onClick={() => shiftReportingMonths(1)}><ArrowRight aria-hidden="true" /></button></div>
      </div>
      <div className={periods.periodList} aria-label="Reporting periods">{weekStarts.map(weekStart => {
        const periodDraft = selectedProductId ? reports[reportKey(selectedProductId, weekStart)] : null;
        const periodSnapshot = performanceCache[performanceCacheKey(selectedAsin, weekStart)];
        const periodReport = periodSnapshot ? { ...periodDraft, ...periodSnapshot.metrics } : periodDraft;
        const isCurrent = weekStart === currentWeekStart;
        const periodStatus = periodSnapshot
          ? periodSnapshot.endDate >= addDaysIso(weekStart, 6) ? "Completed" : "Partial"
          : isCurrent ? "Partial" : "Draft";
        const isSelected = weekStart === activeWeekStart;
        return <button type="button" key={weekStart} aria-label={`${formatWeekRange(weekStart)} reporting period`} aria-pressed={isSelected} className={`${periods.periodCard} ${isSelected ? periods.selectedPeriod : ""}`} onClick={() => selectWeek(weekStart)}>
          {isCurrent ? <span className={periods.currentBadge}>Current</span> : null}
          <span className={periods.periodTop}><span className={periods.periodIdentity}><strong>{formatPeriodCardRange(weekStart)}</strong><span className={periods.periodMeta}>{isCurrent ? <><small>Week {getIsoWeekNumber(weekStart)}</small><i aria-hidden="true" /><span><Clock3 aria-hidden="true" />In Review</span></> : <small>Week {getIsoWeekNumber(weekStart)}</small>}</span></span><span className={`${periods.statusChip} ${periodStatus === "Partial" ? periods.partialStatus : ""}`}>{periodStatus}</span></span>
          <span className={periods.periodStats}><span><small>Spend</small><strong>{currency(periodReport?.spend ?? 0)}</strong></span><span><small>Sales</small><strong>{currency(periodReport?.ppcSales ?? 0)}</strong></span><span><small>Orders</small><strong>{periodReport?.ppcOrders ?? 0}</strong></span><span><small>ACoS</small><strong>{Math.round(periodReport?.acos ?? 0)}%</strong></span></span>
        </button>;
      })}</div>
    </aside>

    <main className={ws.workspace}>
      {!selectedProduct || !report ? <div className={ws.workspaceEmpty}><BarChart3 aria-hidden="true" /><h2>Select a product</h2><p>Choose a Pipeline product to start its weekly PPC documentation.</p></div> : <>
        <header className={ws.workspaceHeader}>
            <div className={ws.headerProductIdentity}>
              <span className={ws.workspaceProductImage}>{selectedProduct.imageDataUrl ? <Image src={selectedProduct.imageDataUrl} alt={`${selectedProduct.name} product image`} width={80} height={80} unoptimized /> : <Package aria-hidden="true" />}</span>
            </div>
            <section className={`${ws.card} ${ws.budgetCard} ${ws.budgetStrip} ${ws.headerBudget}`} aria-label="Budget Utilization">
              <div className={ws.budgetStripMain}>
                <div className={ws.budgetAmounts}><label><span className={ws.moneyInput}><i>$</i><input aria-label="Actual spend" aria-readonly={importedMetricsLocked || undefined} readOnly={importedMetricsLocked} inputMode="numeric" style={{ width: `${Math.max(1, roundedMetricValue(report.spend).length)}ch` }} value={roundedMetricValue(report.spend)} placeholder="0" onChange={event => patchReport({ spend: numericValue(event.target.value) })} /></span></label><span>/</span><label><span className={ws.moneyInput}><i>$</i><input aria-label="Weekly limit" inputMode="decimal" style={{ width: `${Math.max(1, roundedMetricValue(report.weeklyBudget).length)}ch` }} value={report.weeklyBudget ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(report.weeklyBudget) : ""} placeholder="0" onFocus={() => { budgetEditStartRef.current = { key: selectedKey, value: report.weeklyBudget }; }} onChange={event => { const weeklyBudget = numericValue(event.target.value); patchReport({ weeklyBudget, dailyBudget: dailyLimitFromWeekly(weeklyBudget) }); }} onBlur={event => finishBudgetEdit(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></span><small>cap</small></label><strong>{budgetUsage}%</strong></div>
                <div className={ws.budgetMiniMetric}><small>{isOverspent ? "Overspent" : "Remaining"}</small><strong>{preciseCurrency(Math.abs(budgetBalance))}</strong></div>
                <div className={ws.budgetMiniMetric}><small>Daily Avg</small><strong>{preciseCurrency(dailySpendAverage)} / day</strong></div>
              </div>
              <details className={`${ws.budgetHistory} ${ws.budgetStripHistory}`}><summary>Budget History</summary>
                <table aria-label="Budget change history"><thead><tr><th>Date of Change</th><th>From</th><th>To</th></tr></thead><tbody>{visibleBudgetHistory.length ? visibleBudgetHistory.map(change => <tr key={change.id}><td>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(change.changedAt))}</td><td>{preciseCurrency(change.from)}</td><td>{preciseCurrency(change.to)}</td></tr>) : <tr><td colSpan={3}>No budget changes recorded yet.</td></tr>}</tbody></table>
                {budgetHistoryPageCount > 1 ? <nav className={ws.budgetHistoryPagination} aria-label="Budget history pages"><button type="button" aria-label="Previous budget history page" disabled={budgetHistoryPage === 1} onClick={() => setBudgetHistoryView({ key: selectedKey, page: budgetHistoryPage - 1 })}><ArrowLeft aria-hidden="true" /></button>{Array.from({ length: budgetHistoryPageCount }, (_, index) => index + 1).map(page => <button type="button" key={page} aria-label={`Budget history page ${page}`} aria-current={page === budgetHistoryPage ? "page" : undefined} onClick={() => setBudgetHistoryView({ key: selectedKey, page })}>{page}</button>)}<button type="button" aria-label="Next budget history page" disabled={budgetHistoryPage === budgetHistoryPageCount} onClick={() => setBudgetHistoryView({ key: selectedKey, page: budgetHistoryPage + 1 })}><ArrowRight aria-hidden="true" /></button></nav> : null}
              </details>
            </section>
          {selectedAsin ? <nav className={ws.asinNavigation} aria-label={`Scale Insights analysis for ASIN ${selectedAsin}`}>{PPC_ANALYSIS_COLUMNS.map(column => <div key={column.key} className={ws.asinNavigationColumn} role="group" aria-label={column.label}>{column.sections.map(section => <a key={section.slug} href={getScaleInsightsAnalysisHref(selectedAsin, section.slug, activeWeekStart, addDaysIso(activeWeekStart, 6))} target="_blank" rel="noopener noreferrer">{section.label}</a>)}</div>)}</nav> : null}
          <div className={ws.saveArea}><button type="button" className={ws.secondaryButton} aria-label="Refresh Data" disabled={displayedPerformanceLoad.status === "loading" || !selectedAsin} onClick={() => { refreshRequest.current = snapshotKey; setPerformanceRefresh(value => value + 1); setOpportunityRefresh(current => ({ key: snapshotKey, version: current.version + 1 })); }}><RefreshCw aria-hidden="true" />Refresh Data</button><small className={saveNotice || sharedSaveStatus?.error || sharedSaveStatus?.recoveryError ? ws.unsaved : ws.saved}>{saveMessage}</small></div>
        </header>

        <div className={ws.workspaceScroll}><div className={ws.workspaceCanvas}>
          <div className={ws.planningStack}>


            <div className={ws.planningGrid}>
              <section className={`${ws.card} ${ws.goalCard}`} aria-label="Weekly Goals"><div className={ws.cardTitle}><div className={ws.sectionTitleGroup}><div className={ws.titleWithCount}><h3><Flag />Strategic Goals</h3><span>{report.goals.length} Active</span></div><div className={ws.goalHeaderActions}><button type="button" onClick={() => setGoalHistoryOpen(true)}>Goal History</button><button type="button" onClick={addGoal}><Plus />Add Goal</button></div></div></div><div className={ws.goalList}>{report.goals.map(goal => <WeeklyGoalRow key={goal.id} goal={goal} report={report} dataState={goalDataState} onUpdate={patch => updateGoal(goal.id, patch)} onResolve={status => resolveGoal(goal.id, status)} onRemove={() => removeGoal(goal.id)} />)}</div></section>

              <section className={`${ws.card} ${ws.actionCard}`} aria-labelledby="actions-heading"><div className={ws.cardTitle}><div className={ws.sectionTitleGroup}><div className={ws.titleWithCount}><h3 id="actions-heading">Action Items</h3><span>{report.actions.length} {report.actions.length === 1 ? "Task" : "Tasks"}</span></div><button className={ws.actionAddButton} type="button" aria-label="Add Action Item" title="Add action item" disabled={!canEdit} onClick={addAction}><Plus aria-hidden="true" />Add Item</button></div></div><div className={ws.actionList}>{report.actions.map(action => <div className={ws.actionRow} key={action.id}><button type="button" className={action.done ? ws.actionDone : ""} aria-label={action.done ? `Mark ${action.title} incomplete` : `Mark ${action.title} complete`} disabled={!canEdit} onClick={() => updateAction(action.id, { done: !action.done })}>{action.done ? <Check /> : null}</button><input aria-label="Action item" value={action.title} readOnly={!canEdit} onChange={event => updateAction(action.id, { title: event.target.value })} /><button type="button" aria-label={`Remove ${action.title}`} title="Delete action item" disabled={!canEdit} onClick={() => removeAction(action.id)}><Trash2 aria-hidden="true" /></button></div>)}</div></section>
            </div>
          </div>

          <section className={`${ws.card} ${ws.performanceCard}`} aria-labelledby="metrics-heading">
            <div className={ws.performanceTitleBar}>
              <div><div className={ws.performanceHeading}><h3 id="metrics-heading"><BarChart3 />Weekly PPC Performance</h3></div></div>
              <div className={ws.performanceSync}><span role="status" className={displayedPerformanceLoad.status === "error" ? ws.performanceError : ""}><i />{displayedPerformanceLoad.message}</span>{displayedPerformanceLoad.authorizationUrl ? <a href={displayedPerformanceLoad.authorizationUrl}>Connect Scale Insights</a> : null}</div>
            </div>
            {displayedPerformanceLoad.warnings.length ? <ul className={ws.performanceWarnings}>{displayedPerformanceLoad.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
            <WeekMetricCards current={performanceColumns.find(column => column.weekStart === activeWeekStart)} previous={performanceColumns.find(column => column.weekStart === previousWeekStart)} />
            <WeeklyPerformanceTable columns={performanceColumns} selectedWeekStart={activeWeekStart} importedLocked={importedMetricsLocked} onChange={patchReport} />
          </section>

          <SummaryColumns>
            <section className={`${ws.card} ${ws.summaryCard}`} aria-labelledby="previous-heading"><div className={ws.cardTitle}><h3 id="previous-heading"><CheckCircle2 />Previous Week Summary</h3></div><ReadOnlySummaryTopics topics={previousSummaryTopics} /></section>
            <section className={`${ws.card} ${ws.summaryCard} ${ws.currentSummaryCard}`} aria-labelledby="notes-heading"><div className={ws.cardTitle}><h3 id="notes-heading"><FileText />Current Week Summary</h3></div><SummaryTopicComposer key={selectedKey} topics={getSummaryTopics(report)} onChange={summaryTopics => patchReport({ summaryTopics, notes: summaryTopicsNotes(summaryTopics) })} /><footer className={ws.summaryFooter}><span className={saveNotice || sharedSaveStatus?.error || sharedSaveStatus?.recoveryError ? ws.unsaved : ws.autoSaved}>{saveMessage}</span><span>Last edited: {report.updatedAt ? new Date(report.updatedAt).toLocaleString() : "—"}</span></footer></section>
          </SummaryColumns>

          <CampaignWeeklyComparison key={`campaign-${remoteSync?.keys.includes(PPC_CAMPAIGN_CSV_CACHE_KEY) ? remoteSync.version : 0}`} asin={selectedAsin} country="US" weekStart={activeWeekStart} refreshVersion={performanceRefresh} />
          <UntargetedSalesOpportunities key={`opportunity-${remoteSync?.keys.some(key => key === PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY || key === PPC_OPPORTUNITY_HISTORY_CACHE_KEY) ? remoteSync.version : 0}`} asin={selectedAsin} country="US" weekStart={activeWeekStart} refreshVersion={opportunityRefresh.key === snapshotKey ? opportunityRefresh.version : 0} onPpcClicksLoaded={receiveOpportunityPpcClicks} />
          <SearchQueryPerformance asin={selectedAsin} country="US" weekStart={activeWeekStart} refreshVersion={opportunityRefresh.key === snapshotKey ? opportunityRefresh.version : 0} />

        </div></div>
      </>}
    </main>
    </>}

    {activeView === "products" && selectedProduct && report ? <ProductPerformanceChat product={selectedProduct} activeWeekStart={activeWeekStart} periods={chatPeriods} /> : null}

    {monthPickerOpen ? <div className={styles.monthDialogBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setMonthPickerOpen(false); }}>
      <section className={styles.monthDialog} role="dialog" aria-modal="true" aria-labelledby="month-dialog-heading">
        <header><div><span className={styles.eyebrow}>REPORTING PERIOD</span><h2 id="month-dialog-heading">Choose months</h2><p>Select every month you want to display. Boundary weeks are included.</p></div><button type="button" aria-label="Close month picker" onClick={() => setMonthPickerOpen(false)}><X aria-hidden="true" /></button></header>
        <div className={styles.monthDialogYear}><button type="button" aria-label="Previous year" onClick={() => setMonthPickerYear(year => year - 1)}><ArrowLeft aria-hidden="true" /></button><strong>{monthPickerYear}</strong><button type="button" aria-label="Next year" onClick={() => setMonthPickerYear(year => year + 1)}><ArrowRight aria-hidden="true" /></button></div>
        <div className={styles.monthGrid}>{MONTH_NAMES.map((monthName, monthIndex) => {
          const monthValue = `${monthPickerYear}-${String(monthIndex + 1).padStart(2, "0")}`;
          const isSelectedMonth = draftSelectedMonths.includes(monthValue);
          const isCurrentMonth = initialToday.startsWith(monthValue);
          return <button type="button" key={monthName} className={`${styles.monthOption} ${isSelectedMonth ? styles.monthOptionSelected : ""} ${isCurrentMonth ? styles.monthOptionCurrent : ""}`} aria-label={`${monthName} ${monthPickerYear}`} aria-pressed={isSelectedMonth} aria-current={isCurrentMonth ? "date" : undefined} onClick={() => toggleDraftMonth(monthIndex)}><span>{monthName}</span>{isCurrentMonth ? <small>Current</small> : null}</button>;
        })}</div>
        <footer className={styles.monthDialogFooter}><span>{draftSelectedMonths.length} month{draftSelectedMonths.length === 1 ? "" : "s"} selected</span><div><button type="button" onClick={() => setDraftSelectedMonths([])}>Clear</button><button type="button" onClick={selectPickerYear}>Select {monthPickerYear}</button><button type="button" className={styles.applyMonths} disabled={!draftSelectedMonths.length} onClick={applySelectedMonths}>Apply months</button></div></footer>
      </section>
    </div> : null}
    {goalHistoryOpen ? <div className={styles.monthDialogBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setGoalHistoryOpen(false); }}>
      <section className={styles.goalHistoryDialog} role="dialog" aria-modal="true" aria-labelledby="goal-history-heading">
        <header><div><span className={styles.eyebrow}>WEEKLY GOALS</span><h2 id="goal-history-heading">Goal History</h2><p>Achieved and missed goals for {selectedProduct?.name ?? "this product"}.</p></div><button type="button" aria-label="Close goal history" onClick={() => setGoalHistoryOpen(false)}><X aria-hidden="true" /></button></header>
        <div className={styles.goalHistoryList}>{productGoalHistory.length ? productGoalHistory.map(goal => <article key={`${goal.weekStart}:${goal.id}:${goal.resolvedAt}`}><div><strong>{goal.metric ? weeklyGoalLabel(goal.metric) : goal.title}</strong><small>{formatWeekRange(goal.weekStart)} · Target {formatWeeklyGoalTarget(goal) || "—"} · Actual {goal.actual || "—"}{goal.dataState ? ` · ${goal.dataState}` : ""}</small><small>Recorded {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(goal.resolvedAt))}</small></div><span className={statusTone(goal.status)}>{goal.status}</span></article>) : <p className={styles.goalHistoryEmpty}>No achieved or missed goals yet.</p>}</div>
      </section>
    </div> : null}
  </section>;
}
