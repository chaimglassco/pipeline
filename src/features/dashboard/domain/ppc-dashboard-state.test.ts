import { describe, expect, it } from "vitest";
import { addDaysIso, calculateWeeklyPerformance, createWeeklyPpcReport, formatReportingMonthRange, formatWeekRange, formatWeeklyGoalTarget, formatWeeklyGoalValue, getMonthWeekStarts, getSelectedMonthWeekStarts, getSummaryTopics, latestWeeklyBudget, summaryTopicsNotes, parsePpcDashboardStore, reportKey, startOfWeekIso, weeklyGoalActualValue, weeklyGoalUnit, withCalculatedPerformance, withInheritedWeeklyBudget } from "./ppc-dashboard-state";
import type { WeeklyPpcReport } from "./ppc-dashboard-state";

describe("PPC dashboard state", () => {
  it("does not recreate deleted goals when a report is loaded or a new week begins", () => {
    const empty = createWeeklyPpcReport("product-1", "2026-08-26");
    expect(empty.goals).toEqual([]);
    const restored = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { saved: { ...empty, goals: [] } } })).reports[reportKey(empty.productId, empty.weekStart)];
    expect(restored.goals).toEqual([]);
    expect(createWeeklyPpcReport("product-1", "2026-09-02", restored).goals).toEqual([]);
    const legacy = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { saved: { ...empty, goals: undefined } } })).reports[reportKey(empty.productId, empty.weekStart)];
    expect(legacy.goals).toEqual([]);
  });
  it("restores summary topics, preserves legacy notes, and rejects malformed topic storage", () => {
    const report = createWeeklyPpcReport("product-1", "2026-08-26");
    expect(getSummaryTopics(report)).toEqual([
      { id: "summary-default-good", title: "Good", body: "" },
      { id: "summary-default-bad", title: "Bad", body: "" },
    ]);
    const topics = [{ id: "topic-1", title: "Conversion Rate", body: "Keep the best campaign." }, { id: "topic-2", title: "Spend", body: "Reduce bids." }];
    const parse = (summaryTopics: unknown) => parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { saved: { ...report, notes: "Legacy notes", summaryTopics } } })).reports[reportKey(report.productId, report.weekStart)];
    expect(parse(topics).summaryTopics).toEqual(topics);
    expect(parse(topics).notes).toBe(summaryTopicsNotes(topics));
    expect(parse([]).summaryTopics).toEqual([]);
    expect(getSummaryTopics(parse([]))).toEqual([]);
    expect(parse([]).notes).toBe("");
    expect(parse([{ ...topics[0], body: 123 }]).summaryTopics).toBeUndefined();
    expect(parse([topics[0], topics[0]]).summaryTopics).toBeUndefined();
    expect(parse(null).notes).toBe("Legacy notes");
    expect(getSummaryTopics(parse(null))).toEqual([{ id: "summary-legacy", title: "General Summary", body: "Legacy notes" }]);
  });
  it("creates stable product/week report keys for Wednesday through Tuesday periods", () => {
    expect(startOfWeekIso("2026-08-26")).toBe("2026-08-26");
    expect(startOfWeekIso("2026-09-01")).toBe("2026-08-26");
    expect(startOfWeekIso("2026-09-02")).toBe("2026-09-02");
    expect(addDaysIso("2026-08-26", 6)).toBe("2026-09-01");
    expect(reportKey("product-1", "2026-08-26")).toBe("product-1:2026-08-26");
    expect(formatWeekRange("2026-08-26")).toBe("August 26 to September 1");
    expect(formatWeekRange("2026-09-02")).toBe("September 2 to September 8");
    expect(getMonthWeekStarts("2026-08-28")).toContain("2026-08-26");
  });

  it("validates browser drafts, migrates legacy Monday keys, and discards malformed records", () => {
    const report = { ...createWeeklyPpcReport("product-1", "2026-08-24"), weeklyBudget: 2000, notes: "Keep this" };
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { anything: report, bad: { productId: "" } } }));
    expect(Object.keys(parsed.reports)).toEqual(["product-1:2026-08-26"]);
    expect(parsed.reports["product-1:2026-08-26"].weekStart).toBe("2026-08-26");
    expect(parsed.reports["product-1:2026-08-26"].weeklyBudget).toBe(2000);
    expect(parsed.reports["product-1:2026-08-26"].targetAcos).toBe(0);
    expect(parsed.reports["product-1:2026-08-26"].notes).toBe("Keep this");
    expect(parsePpcDashboardStore("not json")).toEqual({ version: 1, reports: {} });
  });

  it("validates budget history while keeping older reports backward compatible", () => {
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: {
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      budgetHistory: [
        { id: "valid", changedAt: "2026-09-08T01:00:00.000Z", from: 30, to: 50 },
        { id: "same", changedAt: "2026-09-08T01:00:00.000Z", from: 50, to: 50 },
        { id: "invalid", changedAt: "not-a-date", from: 50, to: 80 },
      ],
    } } }));

    expect(parsed.reports["product-1:2026-08-26"].budgetHistory).toEqual([
      { id: "valid", changedAt: "2026-09-08T01:00:00.000Z", from: 30, to: 50 },
    ]);
    expect(parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { legacy: {
      productId: "legacy-product", weekStart: "2026-08-26",
    } } })).reports["legacy-product:2026-08-26"].budgetHistory).toEqual([]);
  });

  it("finds the most recent earlier budget across weeks without saved reports", () => {
    const reports = {
      "product-1:2026-08-05": { ...createWeeklyPpcReport("product-1", "2026-08-05"), weeklyBudget: 500 },
      "product-1:2026-08-19": { ...createWeeklyPpcReport("product-1", "2026-08-19"), weeklyBudget: 700 },
      "product-1:2026-08-26": createWeeklyPpcReport("product-1", "2026-08-26"),
      "product-2:2026-08-26": { ...createWeeklyPpcReport("product-2", "2026-08-26"), weeklyBudget: 900 },
    };

    expect(latestWeeklyBudget(reports, "product-1", "2026-09-02")).toBe(700);
    expect(latestWeeklyBudget(reports, "product-1", "2026-08-19")).toBe(500);
    expect(latestWeeklyBudget(reports, "product-3", "2026-09-02")).toBeUndefined();
    expect(createWeeklyPpcReport("product-1", "2026-09-02", null, 700).weeklyBudget).toBe(700);
    expect(withInheritedWeeklyBudget(reports["product-1:2026-08-26"], 700)).toMatchObject({ weeklyBudget: 700, dailyBudget: 100 });

    const explicitZero = { ...reports["product-1:2026-08-26"], budgetHistory: [{ id: "zero", changedAt: "2026-08-26T12:00:00.000Z", from: 700, to: 0 }] };
    expect(withInheritedWeeklyBudget(explicitZero, 700).weeklyBudget).toBe(0);
    expect(latestWeeklyBudget({ ...reports, "product-1:2026-08-26": explicitZero }, "product-1", "2026-09-02")).toBe(0);
  });

  it("starts actions empty and removes only the untouched legacy seeded task", () => {
    expect(createWeeklyPpcReport("product-1", "2026-08-26").actions).toEqual([]);
    const base = createWeeklyPpcReport("product-1", "2026-08-26");
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: {
      report: {
        ...base,
        actions: [
          { id: "action-negatives", title: "Review search terms and add negative exact keywords", priority: "High", dueDate: "", done: false },
          { id: "action-negatives", title: "Edited task", priority: "High", dueDate: "", done: false },
          { id: "custom", title: "Inspect exact match", priority: "Medium", dueDate: "", done: false },
        ],
      },
    } }));

    expect(parsed.reports["product-1:2026-08-26"].actions.map(action => action.title)).toEqual(["Edited task", "Inspect exact match"]);
  });

  it("keeps an Action Item while its title is temporarily empty during editing", () => {
    const report = createWeeklyPpcReport("product-1", "2026-08-26");
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: {
      ...report, actions: [{ id: "action-edit", title: "", priority: "Medium", dueDate: "", done: false }],
    } } }));
    expect(parsed.reports["product-1:2026-08-26"].actions).toContainEqual(expect.objectContaining({ id: "action-edit", title: "" }));
  });

  it("validates goal history and migrates terminal legacy goals out of the active list", () => {
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: {
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      updatedAt: "2026-09-02T01:00:00.000Z",
      goals: [
        { id: "active", title: "Active goal", target: "10", actual: "8", status: "At Risk" },
        { id: "legacy-done", title: "Legacy completed goal", target: "10", actual: "10", status: "Achieved" },
      ],
      goalHistory: [
        { id: "custom-achieved", title: "Increase PPC Sales quality", target: "Review weekly", actual: "", status: "Achieved", resolvedAt: "2026-09-01T02:00:00.000Z", custom: true },
        { id: "missed", title: "Missed goal", target: "20", actual: "12", status: "Missed", resolvedAt: "2026-09-01T01:00:00.000Z" },
        { id: "invalid", title: "Invalid history", target: "", actual: "", status: "On Track", resolvedAt: "not-a-date" },
      ],
    } } }));

    const report = parsed.reports["product-1:2026-08-26"];
    expect(report.goals.map(goal => goal.id)).toEqual(["active"]);
    expect(report.goalHistory).toEqual([
      { id: "custom-achieved", title: "Increase PPC Sales quality", target: "Review weekly", actual: "", status: "Achieved", resolvedAt: "2026-09-01T02:00:00.000Z", custom: true },
      { id: "missed", title: "Missed goal", target: "20", actual: "12", status: "Missed", resolvedAt: "2026-09-01T01:00:00.000Z" },
      { id: "legacy-done", title: "Legacy completed goal", target: "10", actual: "10", status: "Achieved", resolvedAt: "2026-09-02T01:00:00.000Z" },
    ]);
    expect(parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { legacy: {
      productId: "legacy-product", weekStart: "2026-08-26",
    } } })).reports["legacy-product:2026-08-26"].goalHistory).toEqual([]);
  });

  it("validates structured goal metrics and derives their actual values from weekly performance", () => {
    const report = withCalculatedPerformance({
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      goals: [
        { id: "acos", title: "ACOS", metric: "acos", unit: "percentage", target: "25", actual: "", status: "On Track" },
        { id: "sales", title: "PPC Sales", metric: "ppcSales", unit: "currency", target: "", actual: "", status: "On Track" },
      ] as WeeklyPpcReport["goals"],
      spend: 82.4, ppcSales: 500, totalSales: 1200, ppcOrders: 20, totalOrders: 50,
    });
    const organicGoal = { id: "organic", title: "Organic Order", metric: "organicOrders" as const, unit: "percentage" as const, target: "65", actual: "", status: "On Track" as const };

    expect(formatWeeklyGoalValue(report.goals[0], weeklyGoalActualValue(report.goals[0], report))).toBe("16%");
    expect(formatWeeklyGoalValue(report.goals[1], weeklyGoalActualValue(report.goals[1], report))).toBe("$500");
    expect(formatWeeklyGoalValue(organicGoal, weeklyGoalActualValue(organicGoal, report))).toBe("60%");
    expect(weeklyGoalUnit("organicOrders", "number")).toBe("number");
    expect(formatWeeklyGoalTarget({ ...report.goals[1], target: "2000" })).toBe("$2,000");
    expect(formatWeeklyGoalTarget({ ...report.goals[0], target: "25" })).toBe("25%");
    expect(formatWeeklyGoalTarget({ ...report.goals[0], target: "24.6" })).toBe("25%");
    expect(formatWeeklyGoalTarget({ id: "legacy", title: "Legacy", target: "$500", actual: "", status: "On Track" })).toBe("$500");
    expect(weeklyGoalActualValue({ ...report.goals[1], metric: "totalSales" }, report)).toBe(1200);
    expect(weeklyGoalActualValue({ ...report.goals[0], metric: "tacos" }, report)).toBe(6.87);

    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: {
      ...report,
      goals: [
        { id: "custom", title: "Increase PPC Sales quality", target: "Review weekly", actual: "", status: "On Track", custom: true },
        { id: "legacy-acos", title: "Reduce ACOS", target: "25%", actual: "", status: "On Track" },
        { id: "bad-unit", title: "Spend", metric: "spend", unit: "percentage", target: "100", actual: "", status: "On Track" },
        { id: "legacy-sales", title: "Sales", metric: "sales", unit: "currency", target: "500", actual: "", status: "On Track" },
        { id: "total-orders", title: "Total Orders", target: "50", actual: "", status: "On Track" },
        { id: "tacos", title: "TACOS", target: "10", actual: "", status: "On Track" },
      ],
    } } }));
    expect(parsed.reports["product-1:2026-08-26"].goals).toEqual([
      expect.objectContaining({ id: "custom", title: "Increase PPC Sales quality", target: "Review weekly", custom: true }),
      expect.objectContaining({ id: "legacy-acos", metric: "acos", unit: "percentage" }),
      expect.objectContaining({ id: "bad-unit", metric: "decreaseSpend", unit: "currency" }),
      expect.objectContaining({ id: "legacy-sales", metric: "ppcSales", unit: "currency" }),
      expect.objectContaining({ id: "total-orders", metric: "totalOrders", unit: "number" }),
      expect.objectContaining({ id: "tacos", metric: "tacos", unit: "percentage" }),
    ]);
    expect(parsed.reports["product-1:2026-08-26"].goals[0].metric).toBeUndefined();
  });

  it("unions selected months, includes boundary weeks, and describes their full coverage", () => {
    expect(getSelectedMonthWeekStarts(["2026-09"], "2026-09-02")).toEqual(["2026-09-02", "2026-08-26"]);
    expect(formatReportingMonthRange(["2026-09-02", "2026-08-26"])).toBe("August & September 2026");

    const augustAndSeptember = getSelectedMonthWeekStarts(["2026-08", "2026-09"], "2026-09-02");
    expect(augustAndSeptember).toEqual(["2026-09-02", "2026-08-26", "2026-08-19", "2026-08-12", "2026-08-05", "2026-07-29"]);
    expect(formatReportingMonthRange(augustAndSeptember)).toBe("July–September 2026");
    expect(getSelectedMonthWeekStarts(["invalid", "2026-13"], "2026-09-02")).toEqual([]);
  });

  it("migrates legacy sales and order metrics into the expanded performance report", () => {
    const legacyReport = {
      productId: "product-1", weekStart: "2026-08-26", status: "Draft", sales: 320, orders: 8,
    };
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { legacy: legacyReport } }));

    expect(parsed.reports["product-1:2026-08-26"]).toMatchObject({
      ppcSales: 320, organicSales: 0, totalSales: 320,
      ppcOrders: 8, organicOrders: 0, totalOrders: 8,
    });
  });

  it("calculates organic results and efficiency metrics from verified totals", () => {
    const calculated = withCalculatedPerformance({
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      spend: 75, ppcSales: 100, totalSales: 300, ppcOrders: 3, totalOrders: 8,
    });

    expect(calculated).toMatchObject({ organicSales: 200, organicOrders: 5, acos: 75, tacos: 25 });
  });

  it("validates and preserves a weekly Target ACOS", () => {
    const report = { ...createWeeklyPpcReport("product-1", "2026-08-26"), targetAcos: 24.5 };
    const parsed = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report } }));
    expect(parsed.reports["product-1:2026-08-26"].targetAcos).toBe(24.5);

    const invalid = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: { ...report, targetAcos: -1 } } }));
    expect(invalid.reports["product-1:2026-08-26"].targetAcos).toBe(0);
  });

  it("rounds currency differences and handles zero denominators without invalid percentages", () => {
    expect(calculateWeeklyPerformance({
      spend: 12.34, ppcSales: 0, totalSales: 20.1, ppcOrders: 4, totalOrders: 3,
    })).toEqual({
      spend: 12.34, ppcSales: 0, totalSales: 20.1, ppcOrders: 4, totalOrders: 3,
      organicSales: 20.1, organicOrders: 0, acos: 0, tacos: 61.39,
    });
    expect(calculateWeeklyPerformance({
      spend: 86.54, ppcSales: 287.73, totalSales: 491.45, ppcOrders: 27, ppcClicks: 78, totalOrders: 42, totalSessions: 87,
    }).conversionRate).toBe(34.62);
    const invalidClicks = parsePpcDashboardStore(JSON.stringify({ version: 1, reports: { report: {
      ...createWeeklyPpcReport("product-1", "2026-08-26"), ppcOrders: 2, ppcClicks: 1.5,
    } } })).reports["product-1:2026-08-26"];
    expect(invalidClicks.ppcClicks).toBeUndefined();
    expect(invalidClicks.conversionRate).toBeUndefined();
  });

  it("carries unfinished goals into the following week and resets their progress", () => {
    const previous = {
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      weeklyBudget: 700,
      dailyBudget: 100,
      goals: [
        { id: "done", title: "Completed goal", target: "10", actual: "10", status: "Achieved" as const },
        { id: "risk", title: "Improve ACOS", target: "25%", actual: "32%", status: "At Risk" as const },
        { id: "missed", title: "Increase sales", target: "$500", actual: "$300", status: "Missed" as const },
      ],
      actions: [
        { id: "done-action", title: "Completed action", priority: "Low" as const, dueDate: "", done: true },
        { id: "open-action", title: "Carry this action", priority: "High" as const, dueDate: "2026-09-03", done: false },
      ],
      previousWeekResult: "Carry this result into next week.",
    };
    const next = createWeeklyPpcReport("product-1", "2026-09-02", previous);

    expect(next.goals.map(goal => ({ title: goal.title, actual: goal.actual, status: goal.status }))).toEqual([
      { title: "Improve ACOS", actual: "", status: "On Track" },
    ]);
    expect(next.previousWeekResult).toBe("Carry this result into next week.");
    expect(next.actions).toEqual([{
      id: "open-action-carried-2026-09-02-0", title: "Carry this action", priority: "High", dueDate: "2026-09-03", done: false,
    }]);
    expect(next.weeklyBudget).toBe(700);
    expect(next.dailyBudget).toBe(100);
    expect(next.budgetHistory).toEqual([]);
  });
});
