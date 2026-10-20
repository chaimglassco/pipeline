import { describe, expect, it } from "vitest";
import { createWeeklyPpcReport, PPC_DASHBOARD_STORAGE_KEY, reportKey } from "./ppc-dashboard-state";
import { mergeDashboardValues } from "./shared-dashboard";

const report = (weekStart: string) => createWeeklyPpcReport("product-1", weekStart);
const value = (reports: Record<string, unknown>) => JSON.stringify({ version: 1, reports });

describe("shared dashboard merging", () => {
  it("retains deletions when the remote equals the base and a stale local report replaces its goals", () => {
    const first = report("2026-09-02");
    const key = reportKey(first.productId, first.weekStart);
    const goal = { id: "deleted-sales", title: "PPC Sales", target: "", actual: "", status: "On Track" };
    const deleted = value({ [key]: { ...first, goals: [], deletedGoalIds: [goal.id] } });
    const stale = value({ [key]: { ...first, goals: [goal], notes: "Latest note" } });
    for (const [base, local, remote] of [[deleted, stale, deleted], [deleted, deleted, stale]]) {
      const merged = JSON.parse(mergeDashboardValues(PPC_DASHBOARD_STORAGE_KEY, base, local, remote));
      expect(merged.reports[key].goals).toEqual([]);
      expect(merged.reports[key].deletedGoalIds).toEqual([goal.id]);
      expect(merged.reports[key].notes).toBe("Latest note");
    }
  });
  it("keeps deleted goals removed when a stale session edits them or recovers without a base", () => {
    const first = report("2026-09-02");
    const key = reportKey(first.productId, first.weekStart);
    const goal = { id: "deleted-sales", title: "PPC Sales", target: "", actual: "", status: "On Track" };
    const base = value({ [key]: { ...first, goals: [goal] } });
    const deleted = value({ [key]: { ...first, goals: [], deletedGoalIds: [goal.id] } });
    const stale = value({ [key]: { ...first, goals: [{ ...goal, target: "500" }], notes: "Keep this note" } });
    for (const original of [base, null]) {
      for (const [local, remote] of [[deleted, stale], [stale, deleted]]) {
        const merged = JSON.parse(mergeDashboardValues(PPC_DASHBOARD_STORAGE_KEY, original, local, remote));
        expect(merged.reports[key].goals).toEqual([]);
        expect(merged.reports[key].deletedGoalIds).toEqual([goal.id]);
        if (original) expect(merged.reports[key].notes).toBe("Keep this note");
      }
    }
  });

  it("preserves edits from both sessions when they touch different fields and records", () => {
    const first = report("2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = value({ [firstKey]: first });
    const local = value({ [firstKey]: { ...first, notes: "Local summary" } });
    const second = report("2026-09-09");
    const secondKey = reportKey(second.productId, second.weekStart);
    const remote = value({ [firstKey]: { ...first, weeklyBudget: 700, dailyBudget: 100 }, [secondKey]: second });

    const merged = JSON.parse(mergeDashboardValues(PPC_DASHBOARD_STORAGE_KEY, base, local, remote));

    expect(merged.reports[firstKey]).toMatchObject({ notes: "Local summary", weeklyBudget: 700, dailyBudget: 100 });
    expect(merged.reports[secondKey]).toMatchObject({ weekStart: "2026-09-09" });
  });

  it("uses the latest local intent when both sessions change the same scalar", () => {
    const first = report("2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const merged = JSON.parse(mergeDashboardValues(
      PPC_DASHBOARD_STORAGE_KEY,
      value({ [firstKey]: first }),
      value({ [firstKey]: { ...first, notes: "Local summary" } }),
      value({ [firstKey]: { ...first, notes: "Remote summary" } }),
    ));
    expect(merged.reports[firstKey].notes).toBe("Local summary");
  });

  it("preserves independently added action items inside the same weekly report", () => {
    const first = report("2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const localAction = { id: "local-action", title: "Local action", priority: "Medium", dueDate: "", done: false };
    const remoteAction = { id: "remote-action", title: "Remote action", priority: "Medium", dueDate: "", done: false };
    const merged = JSON.parse(mergeDashboardValues(
      PPC_DASHBOARD_STORAGE_KEY,
      value({ [firstKey]: first }),
      value({ [firstKey]: { ...first, actions: [localAction] } }),
      value({ [firstKey]: { ...first, actions: [remoteAction] } }),
    ));
    expect(merged.reports[firstKey].actions.map((action: { id: string }) => action.id).sort()).toEqual(["local-action", "remote-action"]);
  });

  it("merges an optional stable-ID list introduced in both sessions", () => {
    const first = report("2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const merged = JSON.parse(mergeDashboardValues(
      PPC_DASHBOARD_STORAGE_KEY,
      value({ [firstKey]: first }),
      value({ [firstKey]: { ...first, summaryTopics: [{ id: "good", title: "Good", body: "Local win" }] } }),
      value({ [firstKey]: { ...first, summaryTopics: [{ id: "bad", title: "Bad", body: "Remote issue" }] } }),
    ));
    expect(merged.reports[firstKey].summaryTopics.map((topic: { id: string }) => topic.id).sort()).toEqual(["bad", "good"]);
  });
});
