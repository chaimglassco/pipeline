import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWeeklyPpcReport, reportKey } from "../domain/ppc-dashboard-state";
import type { ManagedDashboardProduct } from "../domain/ppc-dashboard-catalog";
import type { PerformanceOverviewData } from "../domain/performance-overview";
import { PerformanceOverviewDashboard } from "./performance-overview-dashboard";

const product: ManagedDashboardProduct = { id: "product-1", name: "Round U Lead Came", asin: "B012345678", sku: "LEAD-1", stageId: "active", status: "Active", source: "pipeline", tagId: "", imageDataUrl: "" };
const row = { id: "row-1", name: "stained glass came", campaign: "Exact Campaign", asin: product.asin, matchType: "exact", targetType: "keyword", impressions: 1000, clicks: 50, spend: 25, sales: 200, orders: 10, acos: 12.5, roas: 8, conversionRate: 20 };
const metrics = { totalSales: 1000, ppcSales: 500, spend: 100, totalOrders: 40, ppcOrders: 20, clicks: 50 };

function overview(startDate = "2026-07-29", endDate = "2026-08-28"): PerformanceOverviewData {
  return {
    asins: [product.asin], country: "US", currency: "USD", requestedPeriod: { startDate, endDate }, actualPeriod: { startDate, endDate: endDate === "2026-08-28" ? "2026-08-27" : endDate }, freshness: "2026-08-28",
    periods: { yesterday: metrics, sevenDays: metrics, fourteenDays: metrics, selectedRange: metrics },
    dailyPerformance: [
      { date: startDate, spend: 40, ppcSales: 200, totalSales: 400, acos: 20, tacos: 10 },
      { date: endDate === "2026-08-28" ? "2026-08-27" : endDate, spend: 60, ppcSales: 300, totalSales: 600, acos: 20, tacos: 10 },
    ],
    asinRanking: { status: "ready", message: "1 ASIN row from Scale Insights.", rows: [{ asin: product.asin, spend: 100, ppcSales: 500, ppcOrders: 20, clicks: 50, totalSales: 1000, totalOrders: 40, previousTotalSales: 800 }] },
    sections: {
      keywords: { status: "ready", message: "1 row from Scale Insights.", rows: [row] },
      campaigns: { status: "ready", message: "2 rows from Scale Insights.", rows: [
        { ...row, id: "campaign-1", name: "Exact Campaign", targetType: "SP", matchType: "enabled", state: "enabled", cpc: 0.5, ctr: 5, dailyBudget: 50 },
        { ...row, id: "campaign-2", name: "Auto Campaign", targetType: "SP", matchType: "enabled", state: "enabled", spend: 75, sales: 100, orders: 4, acos: 75, roas: 1.33, conversionRate: 8, cpc: 1.5, ctr: 2, dailyBudget: 100 },
      ] },
      productTargets: { status: "ready", message: "2 rows from Scale Insights.", rows: [
        { ...row, id: "target-1", name: "B099999999", targetType: "product" },
        { ...row, id: "target-2", name: "B088888888", targetType: "product", clicks: 75, spend: 50, sales: 100, orders: 4, conversionRate: 5.3, acos: 50, roas: 2 },
      ] },
      searchTerms: { status: "ready", message: "1 row from Scale Insights.", rows: [{ ...row, id: "search-1", name: "round u lead came" }] },
    }, warnings: [],
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async input => {
    const url = new URL(String(input), "http://localhost");
    return { ok: true, status: 200, json: async () => ({ overview: overview(url.searchParams.get("startDate")!, url.searchParams.get("endDate")!) }) } as Response;
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals() });

describe("PerformanceOverviewDashboard", () => {
  it("keeps the temporal matrix visible, loads actual metrics, and renders live detail rows", async () => {
    const current = { ...createWeeklyPpcReport(product.id, "2026-08-26"), spend: 100, ppcSales: 500, totalSales: 800, ppcOrders: 20, totalOrders: 32, updatedAt: "2026-09-01T12:00:00.000Z" };
    const previous = { ...createWeeklyPpcReport(product.id, "2026-08-19"), spend: 80, ppcSales: 400, totalSales: 700, ppcOrders: 18, totalOrders: 29, updatedAt: "2026-08-25T12:00:00.000Z" };
    const { container } = render(<PerformanceOverviewDashboard products={[product]} reports={{ [reportKey(product.id, current.weekStart)]: current, [reportKey(product.id, previous.weekStart)]: previous }} currentWeekStart="2026-08-26" todayIso="2026-08-28" />);

    const disclosures = Array.from(container.querySelectorAll("details"));
    expect(disclosures).toHaveLength(5);
    disclosures.forEach(disclosure => expect(disclosure).not.toHaveAttribute("open"));
    expect(screen.getByText(/Temporal Ledger Matrix/i).closest("section")).toBeVisible();
    expect(screen.queryByText(/Overview Source Coverage/i)).not.toBeInTheDocument();
    const yesterday = screen.getByRole("heading", { name: "Yesterday" }).closest("article")!;
    await waitFor(() => expect(within(yesterday).getByText("$1,000")).toBeVisible());
    expect(within(yesterday).getByText("20%")).toBeVisible();
    expect(within(yesterday).getByText("10%")).toBeVisible();
    const chart = screen.getByRole("region", { name: "Daily Performance Quick Stats" });
    const chartGraphic = within(chart).getByRole("img", { name: /Daily performance trends/ });
    expect(chartGraphic).toBeVisible();
    expect(chartGraphic).toHaveAttribute("preserveAspectRatio", "none");
    const metricLines = chart.querySelectorAll("[data-chart-metric]");
    expect(metricLines).toHaveLength(2);
    expect(Array.from(metricLines, line => line.getAttribute("stroke"))).toEqual(["#dc2626", "#059669"]);
    const chartDots = chart.querySelectorAll("[data-chart-dot]");
    expect(chartDots).toHaveLength(4);
    expect(chartDots[0].tagName).toBe("SPAN");
    fireEvent.mouseEnter(chart.querySelector('[data-chart-date="2026-07-29"]')!);
    const tooltip = within(chart).getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Jul 29, 2026");
    expect(tooltip).toHaveTextContent("$40.00");
    expect(tooltip).toHaveTextContent("$200.00");
    expect(tooltip).toHaveTextContent("$400.00");
    fireEvent.click(within(chart).getByRole("button", { name: /PPC Sales/ }));
    expect(within(chart).getByRole("img", { name: /Daily performance trends/ })).toBeVisible();
    expect(within(chart).getByRole("button", { name: /PPC Sales/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(chart).queryByRole("button", { name: /TACOS/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("ASIN Velocity & Performance Ranking").closest("summary")!);
    expect(screen.getByText("Round U Lead Came")).toBeVisible();
    expect(screen.getByText("↗ 25%")).toBeVisible();
    for (const heading of DETAIL_SECTIONS_FOR_TEST) fireEvent.click(screen.getByText(heading).closest("summary")!);
    expect(screen.getByText("stained glass came")).toBeVisible();
    expect(screen.getAllByText("Exact Campaign").length).toBeGreaterThan(0);
    expect(screen.getByText("B099999999")).toBeVisible();
    expect(screen.getByText("round u lead came")).toBeVisible();
  });

  it("filters the ASIN scope and applies a custom date range to the live request", async () => {
    const second: ManagedDashboardProduct = { ...product, id: "product-2", name: "Homasote Board", asin: "B087654321", sku: "BOARD-2" };
    render(<PerformanceOverviewDashboard products={[product, second]} reports={{}} currentWeekStart="2026-08-26" todayIso="2026-08-28" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter dashboard by ASIN, SKU, or product name" }), { target: { value: product.asin } });
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(`asins=${product.asin}`));
    expect(screen.getByText(new RegExp(`Filtered to ${product.asin}`))).toBeVisible();

    fireEvent.change(screen.getByLabelText("Dashboard start date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Dashboard end date"), { target: { value: "2026-08-15" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    await waitFor(() => {
      const request = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), "http://localhost");
      expect(request.searchParams.get("startDate")).toBe("2026-08-01");
      expect(request.searchParams.get("endDate")).toBe("2026-08-15");
    });
    expect(screen.getByRole("heading", { name: "Custom Range" })).toBeVisible();
    const requestCount = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh all dashboard data" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(requestCount));
    const refreshed = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), "http://localhost");
    expect(refreshed.searchParams.get("startDate")).toBe("2026-08-01");
    expect(refreshed.searchParams.get("endDate")).toBe("2026-08-15");
    fireEvent.click(screen.getByRole("button", { name: "Clear ASIN performance filter" }));
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("B087654321"));
  });

  it("sorts campaign metrics in both directions while keeping the table ranks in display order", async () => {
    render(<PerformanceOverviewDashboard products={[product]} reports={{}} currentWeekStart="2026-08-26" todayIso="2026-08-28" />);
    await waitFor(() => expect(screen.getByText("Campaign Movers and Anchors")).toBeVisible());
    const campaignDetails = screen.getByText("Campaign Movers and Anchors").closest("details")!;
    fireEvent.click(within(campaignDetails).getByText("Campaign Movers and Anchors").closest("summary")!);
    const table = within(campaignDetails).getByRole("table");

    const descendingFirst: Record<string, string> = { Spend: "Auto Campaign", Sales: "Exact Campaign", Orders: "Exact Campaign", ACOS: "Auto Campaign", ROAS: "Exact Campaign", CPC: "Auto Campaign", CTR: "Exact Campaign", CVR: "Exact Campaign", "Daily Budget": "Auto Campaign" };
    for (const [metric, expectedFirst] of Object.entries(descendingFirst)) {
      fireEvent.click(within(table).getByRole("button", { name: `Sort campaigns by ${metric} descending` }));
      let rows = within(table).getAllByRole("row").slice(1);
      expect(rows[0]).toHaveTextContent(expectedFirst);
      expect(within(table).getByText(metric).closest("th")).toHaveAttribute("aria-sort", "descending");

      fireEvent.click(within(table).getByRole("button", { name: `Sort campaigns by ${metric} ascending` }));
      rows = within(table).getAllByRole("row").slice(1);
      expect(rows[1]).toHaveTextContent(expectedFirst);
      expect(within(table).getByText(metric).closest("th")).toHaveAttribute("aria-sort", "ascending");
    }
  });

  it("sorts every ASIN target metric independently without requesting new data", async () => {
    render(<PerformanceOverviewDashboard products={[product]} reports={{}} currentWeekStart="2026-08-26" todayIso="2026-08-28" />);
    await waitFor(() => expect(screen.getByText("ASIN Targeting").closest("details")).toHaveTextContent("2 rows"));
    const details = screen.getByText("ASIN Targeting").closest("details")!;
    fireEvent.click(screen.getByText("ASIN Targeting").closest("summary")!);
    const table = within(details).getByRole("table");
    const requestCount = vi.mocked(fetch).mock.calls.length;
    const descendingFirst: Record<string, string> = { Clicks: "B088888888", Spend: "B088888888", Sales: "B099999999", Orders: "B099999999", "Conversion Rate": "B099999999", ACOS: "B088888888", ROAS: "B099999999" };
    for (const [metric, expectedFirst] of Object.entries(descendingFirst)) {
      fireEvent.click(within(table).getByRole("button", { name: `Sort ASIN targets by ${metric} descending` }));
      expect(within(table).getAllByRole("row")[1]).toHaveTextContent(expectedFirst);
      fireEvent.click(within(table).getByRole("button", { name: `Sort ASIN targets by ${metric} ascending` }));
      expect(within(table).getAllByRole("row")[2]).toHaveTextContent(expectedFirst);
      expect(within(table).getByText(metric).closest("th")).toHaveAttribute("aria-sort", "ascending");
    }
    expect(vi.mocked(fetch).mock.calls.length).toBe(requestCount);
  });
});

const DETAIL_SECTIONS_FOR_TEST = ["Keyword Targeting", "Campaign Movers and Anchors", "ASIN Targeting", "Search Terms"];
