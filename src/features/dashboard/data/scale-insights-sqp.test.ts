import { describe, expect, it } from "vitest";
import { loadSqp, sqpWeek } from "./scale-insights-sqp";
const params = { asin: "B0DYSBW3X5", country: "US", startDate: "2026-09-20", endDate: "2026-09-26" };
const definitions = [{ name: "get_search_query_data", inputSchema: { type: "object" as const } }];
const row = { Query: "lead came for stained glass", ASIN: params.asin, AsinImpressions: 447, AsinClicks: 22, AsinCartAdd: 12, AsinPurchase: 4, TotalImpressions: 8654 };
const payload = (rows: unknown[], meta = { total_count: rows.length, has_next_page: false }) => ({ Country: params.country, AsinList: [params.asin], StartDate: params.startDate, EndDate: params.endDate, Queries: rows, Meta: meta });
describe("ASIN SQP", () => {
  it("aligns the selected dashboard week to the latest full Amazon week", () => {
    expect(sqpWeek("2026-09-23", "2026-10-14")).toEqual({ startDate: "2026-09-20", endDate: "2026-09-26" });
  });
  it("uses ASIN fields and purchases per click, never market totals or purchase share", async () => {
    const report = await loadSqp(params, definitions, async () => payload([row]));
    expect(report.rows[0]).toEqual({ query: row.Query, impressions: 447, clicks: 22, cartAdds: 12, orders: 4, conversionRate: 4 / 22 * 100 });
    expect(report.complete).toBe(true);
  });
  it("keeps genuine zeros and marks zero-click conversion undefined", async () => {
    const report = await loadSqp(params, definitions, async () => payload([{ ...row, AsinClicks: 0, AsinPurchase: 0 }]));
    expect(report.rows[0].orders).toBe(0);
    expect(report.rows[0].conversionRate).toBeNull();
  });
  it("rejects a different ASIN or missing funnel fields", async () => {
    await expect(loadSqp(params, definitions, async () => payload([{ ...row, ASIN: "B012345678" }]))).rejects.toThrow("outside");
    await expect(loadSqp(params, definitions, async () => payload([{ ...row, AsinCartAdd: undefined }]))).rejects.toThrow("missing");
  });
  it("does not mark unreadable pagination complete", async () => {
    const report = await loadSqp(params, definitions, async () => payload([row], { total_count: 2, has_next_page: false }));
    expect(report.complete).toBe(false);
  });
  it("walks all pages and rejects repeated queries", async () => {
    const report = await loadSqp(params, definitions, async (_, args) => payload([{ ...row, Query: `query ${args.page}` }], { total_count: 2, has_next_page: args.page === 1 }));
    expect(report.rows).toHaveLength(2);
    expect(report.complete).toBe(true);
    await expect(loadSqp(params, definitions, async () => payload([row], { total_count: 2, has_next_page: true }))).rejects.toThrow("duplicate");
  });
});
