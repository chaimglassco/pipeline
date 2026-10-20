export const PPC_DASHBOARD_STORAGE_KEY = "glassco.ppcPerformanceNotes.v1";

export type DashboardProduct = { id: string; name: string; asin: string; sku: string; stageId: string; status: "Active" | "Paused" };
export type GoalStatus = "On Track" | "At Risk" | "Achieved" | "Missed";
export type GoalOutcome = Extract<GoalStatus, "Achieved" | "Missed">;
export type WeeklyGoalMetric = "increaseSpend" | "decreaseSpend" | "ppcSales" | "totalSales" | "ppcOrders" | "organicOrders" | "totalOrders" | "acos" | "tacos";
export type WeeklyGoalUnit = "currency" | "number" | "percentage";
export type GoalDataState = "Partial" | "Final";
export type ReportStatus = "Draft" | "In Progress" | "Completed" | "Needs Review";
export type WeeklyGoal = { id: string; title: string; target: string; actual: string; status: GoalStatus; metric?: WeeklyGoalMetric; unit?: WeeklyGoalUnit; custom?: true };
export type GoalHistoryEntry = WeeklyGoal & { status: GoalOutcome; resolvedAt: string; dataState?: GoalDataState };
export type ActionItem = { id: string; title: string; priority: "High" | "Medium" | "Low"; dueDate: string; done: boolean };
export type BudgetChange = { id: string; changedAt: string; from: number; to: number };
export type SummaryTopic = { id: string; title: string; body: string };
export type WeeklyPpcReport = {
  productId: string; weekStart: string; status: ReportStatus; weeklyBudget: number; dailyBudget: number;
  budgetHistory: BudgetChange[];
  spend: number; ppcSales: number; organicSales: number; totalSales: number;
  ppcOrders: number; organicOrders: number; totalOrders: number; targetAcos: number; acos: number; tacos: number;
  totalSessions?: number; ppcClicks?: number; ppcImpressions?: number; ppcUnits?: number; totalUnits?: number; organicUnits?: number; cpc?: number; conversionRate?: number;
  goals: WeeklyGoal[]; goalHistory: GoalHistoryEntry[]; previousWeekResult: string; notes: string; actions: ActionItem[]; updatedAt: string | null;
  summaryTopics?: SummaryTopic[];
  deletedGoalIds?: string[];
};
export type WeeklyPerformanceSourceMetrics = {
  spend: number;
  ppcSales: number;
  ppcOrders: number;
  totalSales: number;
  totalOrders: number;
  totalSessions?: number;
  ppcClicks?: number;
  ppcImpressions?: number;
  ppcUnits?: number;
  totalUnits?: number;
};
export type WeeklyPerformanceCalculatedMetrics = WeeklyPerformanceSourceMetrics & {
  organicSales: number;
  organicOrders: number;
  organicUnits?: number;
  cpc?: number;
  acos: number;
  tacos: number;
  conversionRate?: number;
};
export type PpcDashboardStore = { version: 1; reports: Record<string, WeeklyPpcReport> };

export const WEEKLY_GOAL_OPTIONS: ReadonlyArray<{ value: WeeklyGoalMetric; label: string }> = [
  { value: "increaseSpend", label: "Increase Spend" },
  { value: "decreaseSpend", label: "Decrease Spend" },
  { value: "ppcSales", label: "PPC Sales" },
  { value: "totalSales", label: "Total Sales" },
  { value: "ppcOrders", label: "PPC Order" },
  { value: "organicOrders", label: "Organic Order" },
  { value: "totalOrders", label: "Total Orders" },
  { value: "acos", label: "ACOS" },
  { value: "tacos", label: "TACOS" },
];

const REPORTING_WEEK_START_DAY = 3;
const LEGACY_REPORTING_WEEK_START_DAY = 1;

export function reportKey(productId: string, weekStart: string) { return `${productId}:${weekStart}`; }

function hasExplicitWeeklyBudget(report: WeeklyPpcReport) {
  return report.weeklyBudget > 0 || report.budgetHistory[0]?.to === report.weeklyBudget;
}

export function latestWeeklyBudget(reports: Record<string, WeeklyPpcReport>, productId: string, weekStart: string) {
  const latest = Object.values(reports)
    .filter(report => report.productId === productId && report.weekStart < weekStart && hasExplicitWeeklyBudget(report))
    .sort((first, second) => second.weekStart.localeCompare(first.weekStart))[0];
  return latest?.weeklyBudget;
}

export function withInheritedWeeklyBudget(report: WeeklyPpcReport, inheritedWeeklyBudget?: number) {
  if (hasExplicitWeeklyBudget(report) || inheritedWeeklyBudget == null || inheritedWeeklyBudget <= 0) return report;
  return { ...report, weeklyBudget: inheritedWeeklyBudget, dailyBudget: Math.round((inheritedWeeklyBudget / 7) * 100) / 100 };
}

export function getSummaryTopics(report: WeeklyPpcReport): SummaryTopic[] {
  if (report.summaryTopics) return report.summaryTopics;
  if (report.notes) return [{ id: "summary-legacy", title: "General Summary", body: report.notes }];
  return [
    { id: "summary-default-good", title: "Good", body: "" },
    { id: "summary-default-bad", title: "Bad", body: "" },
  ];
}

export function summaryTopicsNotes(topics: SummaryTopic[]) {
  return topics.filter(topic => topic.body.trim()).map(topic => `## ${topic.title || "Untitled Topic"}\n${topic.body}`).join("\n\n");
}

function normalizeSummaryTopics(value: unknown): SummaryTopic[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const ids = new Set<string>();
  const topics: SummaryTopic[] = [];
  for (const topic of value) {
    if (!isRecord(topic) || typeof topic.id !== "string" || !topic.id.trim() || topic.id.length > 100 || ids.has(topic.id)
      || typeof topic.title !== "string" || topic.title.length > 200 || typeof topic.body !== "string") return undefined;
    ids.add(topic.id);
    topics.push({ id: topic.id, title: topic.title, body: topic.body });
  }
  return topics;
}

export function createWeeklyPpcReport(productId: string, weekStart: string, previousReport?: WeeklyPpcReport | null, inheritedWeeklyBudget?: number): WeeklyPpcReport {
  const carriedGoals = previousReport
    ? previousReport.goals.filter(goal => goal.status !== "Achieved" && goal.status !== "Missed").map((goal, index) => ({
      ...goal, id: `${goal.id}-carried-${weekStart}-${index}`, actual: "", status: "On Track" as GoalStatus,
    }))
    : [];
  const carriedActions = previousReport
    ? previousReport.actions.filter(action => !action.done).map((action, index) => ({
      ...action, id: `${action.id}-carried-${weekStart}-${index}`, done: false,
    }))
    : [];
  const weeklyBudget = inheritedWeeklyBudget ?? previousReport?.weeklyBudget ?? 0;
  return {
    productId, weekStart, status: "Draft", weeklyBudget, dailyBudget: Math.round((weeklyBudget / 7) * 100) / 100, budgetHistory: [], spend: 0,
    ppcSales: 0, organicSales: 0, totalSales: 0, ppcOrders: 0, organicOrders: 0, totalOrders: 0, targetAcos: 0,
    acos: 0, tacos: 0, goals: carriedGoals, goalHistory: [], previousWeekResult: previousReport?.previousWeekResult || "",
    notes: "", actions: carriedActions, updatedAt: null,
  };
}

function roundMoney(value: number) { return Math.round(value * 100) / 100; }

export function calculateWeeklyPerformance(metrics: WeeklyPerformanceSourceMetrics): WeeklyPerformanceCalculatedMetrics {
  return {
    ...metrics,
    organicSales: roundMoney(Math.max(0, metrics.totalSales - metrics.ppcSales)),
    organicOrders: Math.max(0, metrics.totalOrders - metrics.ppcOrders),
    ...(metrics.totalUnits == null || metrics.ppcUnits == null ? {} : { organicUnits: Math.max(0, metrics.totalUnits - metrics.ppcUnits) }),
    ...(metrics.ppcClicks == null ? {} : { cpc: metrics.ppcClicks ? roundMoney(metrics.spend / metrics.ppcClicks) : 0 }),
    acos: metrics.ppcSales ? Math.round((metrics.spend / metrics.ppcSales) * 10000) / 100 : 0,
    tacos: metrics.totalSales ? Math.round((metrics.spend / metrics.totalSales) * 10000) / 100 : 0,
    conversionRate: metrics.ppcClicks == null ? undefined : metrics.ppcClicks ? Math.round((metrics.ppcOrders / metrics.ppcClicks) * 10000) / 100 : 0,
  };
}

export function withCalculatedPerformance(report: WeeklyPpcReport): WeeklyPpcReport {
  return { ...report, ...calculateWeeklyPerformance(report) };
}

export function weeklyGoalLabel(metric: WeeklyGoalMetric) {
  return WEEKLY_GOAL_OPTIONS.find(option => option.value === metric)?.label ?? "Goal";
}

export function weeklyGoalUnit(metric: WeeklyGoalMetric, preferred?: WeeklyGoalUnit): WeeklyGoalUnit {
  if (metric === "increaseSpend" || metric === "decreaseSpend" || metric === "ppcSales" || metric === "totalSales") return "currency";
  if (metric === "acos" || metric === "tacos") return "percentage";
  if (metric === "organicOrders" && preferred === "percentage") return "percentage";
  return "number";
}

export function weeklyGoalActualValue(goal: WeeklyGoal, report: WeeklyPpcReport): number | null {
  if (!goal.metric) return null;
  if (goal.metric === "increaseSpend" || goal.metric === "decreaseSpend") return report.spend;
  if (goal.metric === "ppcSales") return report.ppcSales;
  if (goal.metric === "totalSales") return report.totalSales;
  if (goal.metric === "ppcOrders") return report.ppcOrders;
  if (goal.metric === "totalOrders") return report.totalOrders;
  if (goal.metric === "acos") return report.acos;
  if (goal.metric === "tacos") return report.tacos;
  if (weeklyGoalUnit(goal.metric, goal.unit) === "percentage") {
    return report.totalOrders ? (report.organicOrders / report.totalOrders) * 100 : 0;
  }
  return report.organicOrders;
}

export function formatWeeklyGoalValue(goal: WeeklyGoal, value: number | null) {
  if (value == null) return "";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
  const unit = goal.metric ? weeklyGoalUnit(goal.metric, goal.unit) : goal.unit;
  return unit === "currency" ? `$${formatted}` : unit === "percentage" ? `${formatted}%` : formatted;
}

export function formatWeeklyGoalTarget(goal: WeeklyGoal) {
  const raw = goal.target.trim();
  if (!raw) return "";
  if (!goal.metric && !goal.unit) return raw;
  const value = Number(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(value) || value < 0) return raw;
  const unit = goal.metric ? weeklyGoalUnit(goal.metric, goal.unit) : goal.unit;
  if (unit === "currency") return formatWeeklyGoalValue(goal, value);
  if (unit === "percentage") {
    if (goal.metric === "acos") return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))}%`;
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
function optionalNonNegativeInteger(value: unknown) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && Number.isInteger(number) ? number : undefined;
}

function normalizeGoal(value: unknown, index: number): WeeklyGoal | null {
  if (!isRecord(value)) return null;
  const title = String(value.title ?? "").trim();
  if (!title) return null;
  const statuses: GoalStatus[] = ["On Track", "At Risk", "Achieved", "Missed"];
  const metrics: WeeklyGoalMetric[] = ["increaseSpend", "decreaseSpend", "ppcSales", "totalSales", "ppcOrders", "organicOrders", "totalOrders", "acos", "tacos"];
  const normalizedTitle = title.toLowerCase();
  const legacyMetric: WeeklyGoalMetric | undefined = value.metric === "spend"
    ? normalizedTitle.includes("increase") ? "increaseSpend" : "decreaseSpend"
    : value.metric === "sales" ? "ppcSales" : undefined;
  const storedMetric = metrics.includes(value.metric as WeeklyGoalMetric) ? value.metric as WeeklyGoalMetric : legacyMetric;
  const inferredMetric: WeeklyGoalMetric | undefined = normalizedTitle.includes("organic") && normalizedTitle.includes("order") ? "organicOrders"
    : normalizedTitle.includes("total") && normalizedTitle.includes("order") ? "totalOrders"
    : normalizedTitle.includes("ppc") && normalizedTitle.includes("order") ? "ppcOrders"
      : normalizedTitle.includes("tacos") ? "tacos"
        : normalizedTitle.includes("acos") ? "acos"
          : normalizedTitle.includes("increase") && normalizedTitle.includes("spend") ? "increaseSpend"
            : normalizedTitle.includes("spend") ? "decreaseSpend"
              : normalizedTitle.includes("total") && normalizedTitle.includes("sales") ? "totalSales"
                : normalizedTitle.includes("sales") ? "ppcSales"
                  : undefined;
  const metric = storedMetric ?? inferredMetric;
  const preferredUnit = value.unit === "percentage" || value.unit === "number" || value.unit === "currency" ? value.unit : undefined;
  const custom = value.custom === true;
  return {
    id: String(value.id ?? `goal-${index}`), title, target: String(value.target ?? ""), actual: String(value.actual ?? ""),
    status: statuses.includes(value.status as GoalStatus) ? value.status as GoalStatus : "On Track",
    ...(!custom && metric ? { metric, unit: weeklyGoalUnit(metric, preferredUnit) } : {}),
    ...(custom ? { custom: true as const } : {}),
  };
}

function normalizeGoalHistoryEntry(value: unknown, index: number): GoalHistoryEntry | null {
  const goal = normalizeGoal(value, index);
  if (!goal || (goal.status !== "Achieved" && goal.status !== "Missed") || !isRecord(value)) return null;
  const resolvedAt = typeof value.resolvedAt === "string" ? value.resolvedAt : "";
  if (!resolvedAt || Number.isNaN(new Date(resolvedAt).getTime())) return null;
  const dataState = value.dataState === "Partial" || value.dataState === "Final" ? value.dataState : undefined;
  return { ...goal, status: goal.status, resolvedAt: new Date(resolvedAt).toISOString(), ...(dataState ? { dataState } : {}) };
}

function normalizeAction(value: unknown, index: number): ActionItem | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  // An empty title is a valid in-progress edit; only explicit deletion removes an item.
  const title = value.title.slice(0, 500);
  const priorities: ActionItem["priority"][] = ["High", "Medium", "Low"];
  return { id: String(value.id ?? `action-${index}`), title, priority: priorities.includes(value.priority as ActionItem["priority"]) ? value.priority as ActionItem["priority"] : "Medium", dueDate: String(value.dueDate ?? ""), done: value.done === true };
}

function isUntouchedLegacyDefaultAction(action: ActionItem) {
  return action.id === "action-negatives"
    && action.title === "Review search terms and add negative exact keywords"
    && action.priority === "High"
    && action.dueDate === ""
    && !action.done;
}

function normalizeBudgetChange(value: unknown, index: number): BudgetChange | null {
  if (!isRecord(value)) return null;
  const changedAt = typeof value.changedAt === "string" ? value.changedAt : "";
  const from = Number(value.from);
  const to = Number(value.to);
  if (!changedAt || Number.isNaN(new Date(changedAt).getTime()) || !Number.isFinite(from) || from < 0 || !Number.isFinite(to) || to < 0 || from === to) return null;
  return { id: String(value.id ?? `budget-change-${index}`).slice(0, 100), changedAt: new Date(changedAt).toISOString(), from, to };
}

function normalizeReport(value: unknown): WeeklyPpcReport | null {
  if (!isRecord(value)) return null;
  const productId = String(value.productId ?? "").trim();
  const storedWeekStart = String(value.weekStart ?? "").trim();
  if (!productId || !/^\d{4}-\d{2}-\d{2}$/.test(storedWeekStart)) return null;
  const storedWeekDate = dateFromIso(storedWeekStart);
  if (Number.isNaN(storedWeekDate.getTime())) return null;
  const weekStart = storedWeekDate.getDay() === LEGACY_REPORTING_WEEK_START_DAY ? addDaysIso(storedWeekStart, 2) : storedWeekStart;
  const statuses: ReportStatus[] = ["Draft", "In Progress", "Completed", "Needs Review"];
  const parsedGoals = Array.isArray(value.goals) ? value.goals.map(normalizeGoal).filter((goal): goal is WeeklyGoal => Boolean(goal)) : [];
  const deletedGoalIds = Array.isArray(value.deletedGoalIds) ? [...new Set(value.deletedGoalIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1000))] : [];
  const goals = parsedGoals.filter(goal => !deletedGoalIds.includes(goal.id) && goal.status !== "Achieved" && goal.status !== "Missed");
  const updatedAt = typeof value.updatedAt === "string" && !Number.isNaN(new Date(value.updatedAt).getTime()) ? new Date(value.updatedAt).toISOString() : null;
  const storedGoalHistory = Array.isArray(value.goalHistory)
    ? value.goalHistory.map(normalizeGoalHistoryEntry).filter((goal): goal is GoalHistoryEntry => Boolean(goal))
    : [];
  const legacyGoalHistory: GoalHistoryEntry[] = parsedGoals.flatMap(goal => goal.status === "Achieved" || goal.status === "Missed"
    ? [{ ...goal, status: goal.status, resolvedAt: updatedAt ?? new Date(`${weekStart}T12:00:00.000Z`).toISOString() }]
    : []);
  const goalHistory = [...storedGoalHistory, ...legacyGoalHistory]
    .filter((goal, index, entries) => entries.findIndex(candidate => candidate.id === goal.id) === index)
    .slice(0, 100);
  const actions = Array.isArray(value.actions)
    ? value.actions.map(normalizeAction).filter((action): action is ActionItem => Boolean(action)).filter(action => !isUntouchedLegacyDefaultAction(action))
    : [];
  const budgetHistory = Array.isArray(value.budgetHistory)
    ? value.budgetHistory.map(normalizeBudgetChange).filter((change): change is BudgetChange => Boolean(change)).slice(0, 100)
    : [];
  const ppcSales = finiteNumber(value.ppcSales ?? value.sales);
  const organicSales = finiteNumber(value.organicSales);
  const ppcOrders = finiteNumber(value.ppcOrders ?? value.orders);
  const organicOrders = finiteNumber(value.organicOrders);
  const totalSessions = value.totalSessions == null ? undefined : finiteNumber(value.totalSessions);
  const ppcClicks = optionalNonNegativeInteger(value.ppcClicks);
  const ppcImpressions = optionalNonNegativeInteger(value.ppcImpressions);
  const ppcUnits = optionalNonNegativeInteger(value.ppcUnits);
  const totalUnits = optionalNonNegativeInteger(value.totalUnits);
  const summaryTopics = normalizeSummaryTopics(value.summaryTopics);
  return withCalculatedPerformance({
    productId, weekStart, status: statuses.includes(value.status as ReportStatus) ? value.status as ReportStatus : "Draft",
    weeklyBudget: finiteNumber(value.weeklyBudget), dailyBudget: finiteNumber(value.dailyBudget), budgetHistory, spend: finiteNumber(value.spend),
    ppcSales, organicSales, totalSales: value.totalSales == null ? ppcSales + organicSales : finiteNumber(value.totalSales),
    ppcOrders, organicOrders, totalOrders: value.totalOrders == null ? ppcOrders + organicOrders : finiteNumber(value.totalOrders),
    ...(totalSessions == null ? {} : { totalSessions }),
    ...(ppcClicks == null ? {} : { ppcClicks }),
    ...(ppcImpressions == null ? {} : { ppcImpressions }),
    ...(ppcUnits == null ? {} : { ppcUnits }),
    ...(totalUnits == null ? {} : { totalUnits }),
    ...(summaryTopics == null ? {} : { summaryTopics }),
    ...(deletedGoalIds.length ? { deletedGoalIds } : {}),
    targetAcos: finiteNumber(value.targetAcos), acos: finiteNumber(value.acos), tacos: finiteNumber(value.tacos),
    goals: Array.isArray(value.goals) ? goals : [], goalHistory, previousWeekResult: String(value.previousWeekResult ?? ""), notes: summaryTopics == null ? String(value.notes ?? "") : summaryTopicsNotes(summaryTopics),
    actions: Array.isArray(value.actions) ? actions : [], updatedAt,
  });
}

export function parsePpcDashboardStore(raw: string | null): PpcDashboardStore {
  if (!raw) return { version: 1, reports: {} };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.reports)) return { version: 1, reports: {} };
    const reports: Record<string, WeeklyPpcReport> = {};
    for (const candidate of Object.values(value.reports)) {
      const report = normalizeReport(candidate);
      if (report) reports[reportKey(report.productId, report.weekStart)] = report;
    }
    return { version: 1, reports };
  } catch { return { version: 1, reports: {} }; }
}

function dateFromIso(iso: string) { return new Date(`${iso}T12:00:00`); }
export function toIsoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function startOfWeekIso(iso: string) { const date = dateFromIso(iso); const daysSinceWednesday = (date.getDay() - REPORTING_WEEK_START_DAY + 7) % 7; date.setDate(date.getDate() - daysSinceWednesday); return toIsoDate(date); }
export function addDaysIso(iso: string, days: number) { const date = dateFromIso(iso); date.setDate(date.getDate() + days); return toIsoDate(date); }
export function addMonthsIso(iso: string, months: number) { const date = dateFromIso(iso); date.setDate(1); date.setMonth(date.getMonth() + months); return toIsoDate(date); }
export function getMonthWeekStarts(monthIso: string) {
  const month = dateFromIso(monthIso); const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12); const starts: string[] = [];
  let cursor = startOfWeekIso(toIsoDate(new Date(month.getFullYear(), month.getMonth(), 1, 12)));
  while (dateFromIso(cursor) <= last) { starts.push(cursor); cursor = addDaysIso(cursor, 7); }
  return starts.reverse();
}
export function getSelectedMonthWeekStarts(monthKeys: string[], maximumWeekStart?: string) {
  const selectedMonths = [...new Set(monthKeys)]
    .filter(monthKey => /^\d{4}-\d{2}$/.test(monthKey) && toIsoDate(dateFromIso(`${monthKey}-01`)).slice(0, 7) === monthKey);
  return [...new Set(selectedMonths.flatMap(monthKey => getMonthWeekStarts(`${monthKey}-01`)))]
    .filter(weekStart => !maximumWeekStart || weekStart <= maximumWeekStart)
    .sort((first, second) => second.localeCompare(first));
}
export function formatReportingMonthRange(weekStarts: string[]) {
  const monthKeys = [...new Set(weekStarts.flatMap(weekStart => [weekStart.slice(0, 7), addDaysIso(weekStart, 6).slice(0, 7)]))].sort();
  if (!monthKeys.length) return "No months selected";
  const monthName = (monthKey: string, style: "long" | "short", includeYear = true) => new Intl.DateTimeFormat("en-US", {
    month: style, ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(dateFromIso(`${monthKey}-01`));
  if (monthKeys.length === 1) return monthName(monthKeys[0], "long");
  if (monthKeys.length === 2) {
    const sameYear = monthKeys[0].slice(0, 4) === monthKeys[1].slice(0, 4);
    return sameYear
      ? `${monthName(monthKeys[0], "long", false)} & ${monthName(monthKeys[1], "long")}`
      : `${monthName(monthKeys[0], "long")} & ${monthName(monthKeys[1], "long")}`;
  }
  const consecutive = monthKeys.every((monthKey, index) => addMonthsIso(`${monthKeys[0]}-01`, index).slice(0, 7) === monthKey);
  const sameYear = monthKeys[0].slice(0, 4) === monthKeys.at(-1)?.slice(0, 4);
  if (consecutive) return sameYear
    ? `${monthName(monthKeys[0], "long", false)}–${monthName(monthKeys.at(-1)!, "long")}`
    : `${monthName(monthKeys[0], "short")}–${monthName(monthKeys.at(-1)!, "short")}`;
  return `${monthKeys.length} months · ${monthName(monthKeys[0], "short")}–${monthName(monthKeys.at(-1)!, "short")}`;
}
export function formatMonth(iso: string) { return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(dateFromIso(iso)); }
export function formatWeekRange(weekStart: string) {
  const start = dateFromIso(weekStart); const end = dateFromIso(addDaysIso(weekStart, 6));
  const formatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  return `${formatter.format(start)} to ${formatter.format(end)}`;
}
export function getIsoWeekNumber(iso: string) { const date = dateFromIso(iso); const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1)); return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7); }
export function currency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0); }
export function percentage(numerator: number, denominator: number) { return denominator ? Math.min(999, Math.round((numerator / denominator) * 100)) : 0; }
