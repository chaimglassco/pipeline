import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PPC_DASHBOARD_CATALOG_STORAGE_KEY } from "../domain/ppc-dashboard-catalog";
import { PPC_DASHBOARD_STORAGE_KEY, addDaysIso, createWeeklyPpcReport } from "../domain/ppc-dashboard-state";
import { PPC_PERFORMANCE_CACHE_KEY } from "../domain/ppc-performance-cache";
import { PPC_WORKSPACE_SELECTION_KEY } from "../domain/ppc-workspace-selection";
import { attachDashboardStorage, SharedDashboardStorage, type DashboardResponses } from "../state/shared-dashboard-client";
import { PpcPerformanceDashboard } from "./ppc-performance-dashboard";

describe("PpcPerformanceDashboard", () => {
  const writeText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    window.localStorage.clear();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal("fetch", vi.fn(async input => String(input).includes("/api/dashboard/performance?")
      ? { ok: false, status: 503, json: async () => ({ error: "Scale Insights is not configured on this server." }) }
      : {
        ok: true,
        status: 200,
        json: async () => ({
          products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }],
        }),
      }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("adds, renames, reorders, formats, and removes summary topics and restores them after reload", async () => {
    const view = render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const summary = await screen.findByRole("region", { name: "Current Week Summary" });
    const add = within(summary).getByRole("button", { name: "Add summary topic" });
    expect(add).toHaveTextContent("");
    expect(within(summary).getAllByRole("textbox", { name: /Topic title/ }).map(input => (input as HTMLInputElement).value)).toEqual(["Good", "Bad"]);
    expect(within(summary).getByRole("region", { name: "Summary topic Good" }).className).toMatch(/summaryTopicGood/);
    expect(within(summary).getByRole("region", { name: "Summary topic Bad" }).className).toMatch(/summaryTopicBad/);
    fireEvent.click(add);
    fireEvent.change(within(summary).getByRole("textbox", { name: "Topic title 3" }), { target: { value: "Next Week" } });
    const notes = within(summary).getByRole("textbox", { name: "Next Week documentation" });
    Object.defineProperty(notes, "scrollHeight", { configurable: true, value: 180 });
    fireEvent.focus(notes);
    fireEvent.change(notes, { target: { value: "Raise bids carefully" } });
    expect(notes).toHaveStyle({ height: "180px" });
    (notes as HTMLTextAreaElement).setSelectionRange(0, 5);
    fireEvent.click(within(summary).getByRole("button", { name: "Bold Next Week" }));
    expect(notes).toHaveValue("**Raise** bids carefully");
    fireEvent.click(within(summary).getByRole("button", { name: "Move Next Week up" }));
    fireEvent.click(within(summary).getByRole("button", { name: "Remove topic Good" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(PPC_DASHBOARD_STORAGE_KEY)!);
      expect(stored.reports["product-1:2026-08-26"].summaryTopics.map((topic: { title: string }) => topic.title)).toEqual(["Next Week", "Bad"]);
      expect(stored.reports["product-1:2026-08-26"].notes).toBe("## Next Week\n**Raise** bids carefully");
    }, { timeout: 3000 });
    view.unmount();
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("textbox", { name: "Next Week documentation" })).toHaveValue("**Raise** bids carefully");
    expect(screen.getByRole("textbox", { name: "Topic title 1" })).toHaveValue("Next Week");
    expect(screen.queryByRole("textbox", { name: "Good documentation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /August 19 to August 25/ }));
    expect(await screen.findByRole("textbox", { name: "Good documentation" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "Next Week documentation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /August 26 to September 1/ }));
    expect(await screen.findByRole("textbox", { name: "Next Week documentation" })).toHaveValue("**Raise** bids carefully");
  }, 10_000);

  it("automatically backfills six visible weeks and keeps the selected week at the right edge", async () => {
    const metricsCalls: string[] = [];
    window.localStorage.setItem(PPC_PERFORMANCE_CACHE_KEY, JSON.stringify({ version: 1, entries: { legacy: {
      asin: "B012345678", country: "US", startDate: "2026-08-19", endDate: "2026-08-25", currency: "USD",
      metrics: { spend: 50, ppcSales: 250, ppcOrders: 10, totalSales: 500, totalOrders: 20 },
      freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: "2026-08-25" }, warnings: [],
    } } }));
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      if (!url.includes("/api/dashboard/performance?")) return { ok: true, status: 200, json: async () => ({ products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }] }) } as Response;
      metricsCalls.push(url);
      const startDate = new URL(url, "http://localhost").searchParams.get("weekStart")!;
      return { ok: true, status: 200, json: async () => ({ performance: {
        metricsRevision: 3, asin: "B012345678", country: "US", startDate, endDate: addDaysIso(startDate, 6), currency: "USD",
        metrics: { spend: 81.75, ppcSales: 481.75, ppcOrders: 23, ppcClicks: 48, ppcImpressions: 1200, ppcUnits: 31, totalUnits: 59, totalSales: 1317.35, totalOrders: 59, totalSessions: 122 },
        freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: startDate }, warnings: [],
      } }) } as Response;
    });
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const table = await screen.findByRole("table", { name: "Six-week Scale Insights performance" });
    await waitFor(() => expect(metricsCalls).toHaveLength(6));
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getByRole("columnheader", { name: /Aug 26, 2026 to Sep 01, 2026, selected week/ })).toBeVisible();
    expect(within(table).getAllByRole("rowheader").map(row => row.textContent)).toEqual([
      "Total Sales", "Total Orders", "Total Units", "Spend", "PPC Sales", "Organic Sales", "PPC Orders", "Organic Orders", "ACOS", "TACOS", "Impressions", "Clicks", "CPC",
    ]);
    expect(within(table).getAllByRole("row", { name: /section$/ }).map(row => row.textContent)).toEqual([
      "TOTAL", "SALES", "ORDERS", "EFFICIENCY", "TRAFFIC",
    ]);
    expect(within(table).getByRole("row", { name: /Spend/ })).toHaveTextContent("$82");
    expect(within(table).getByRole("row", { name: /CPC/ })).toHaveTextContent("$2");
    expect(within(table).queryByRole("row", { name: /Organic Units|PPC Units/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Total Sales/ })).toHaveTextContent("$1,317");
    expect(within(table).getByRole("row", { name: /Total Orders/ })).toHaveTextContent("59");
    expect(within(table).getByRole("row", { name: /Total Units/ })).toHaveTextContent("59");
    expect(JSON.parse(localStorage.getItem(PPC_PERFORMANCE_CACHE_KEY)!).entries["US:B012345678:2026-08-26"].metrics.ppcImpressions).toBe(1200);
  }, 15_000);
  it("shows unavailable click data without inventing a chart value", async () => {
    const missingClicksWarning = "Scale Insights did not include PPC Clicks for this reporting period; PPC Conversion Rate is unavailable.";
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      if (url.includes("/api/dashboard/performance?")) {
        const startDate = new URL(url, "http://localhost").searchParams.get("weekStart")!;
        return { ok: true, status: 200, json: async () => ({ performance: {
          metricsRevision: 3, asin: "B012345678", country: "US", startDate, endDate: addDaysIso(startDate, 6), currency: "USD",
          metrics: { spend: 82, ppcSales: 482, ppcOrders: 23, totalSales: 1317, totalOrders: 59 },
          freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: addDaysIso(startDate, 6) }, warnings: [missingClicksWarning],
        } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }] }) } as Response;
    });
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const performanceCard = await screen.findByRole("region", { name: "Weekly PPC Performance" });
    expect(await within(performanceCard).findByText(missingClicksWarning)).toBeVisible();
    expect(within(performanceCard).getByRole("table", { name: "Six-week Scale Insights performance" })).toBeVisible();
  }, 15_000);
  it("loads a Pipeline product and automatically saves the selected weekly report", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    const copyAsin = screen.getByRole("button", { name: "Copy ASIN B012345678" });
    fireEvent.click(copyAsin);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("B012345678"));
    expect(screen.getByRole("button", { name: "Copied ASIN B012345678" })).toHaveAttribute("title", "Copied");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/dashboard/products"), expect.any(Object));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open current week" })).not.toBeInTheDocument();
    const currentPeriod = screen.getByRole("button", { name: /August 26 to September 1 reporting period/ });
    expect(within(currentPeriod).getByText("Aug 26 – Sep 1, 2026")).toBeVisible();
    expect(within(currentPeriod).getByText("Week 35").parentElement?.className).toMatch(/periodMeta/);
    expect(within(currentPeriod).getByText("In Review")).toBeVisible();
    expect(within(currentPeriod).getByText("Current").className).toMatch(/currentBadge/);
    expect(within(currentPeriod).getByText("Partial").className).toMatch(/partialStatus/);
    expect(within(currentPeriod).getByText("Sales")).toBeVisible();
    expect(within(currentPeriod).getByText("Orders")).toBeVisible();
    expect(within(currentPeriod).getByText("ACoS")).toBeVisible();
    expect(within(currentPeriod).queryByText("ROAS")).not.toBeInTheDocument();
    expect(currentPeriod).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByLabelText("Reporting periods")).getAllByRole("button")[0]).toBe(currentPeriod);

    expect(within(screen.getByRole("region", { name: "Current Week Summary" })).queryByText("Draft", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
    const monthTrigger = screen.getByRole("button", { name: "Choose reporting months, July–September 2026" });
    expect(monthTrigger.querySelector("svg")).not.toBeNull();
    expect(within(screen.getByRole("group", { name: "Month navigation" })).queryByRole("button", { name: /Choose reporting months/i })).not.toBeInTheDocument();
    fireEvent.click(monthTrigger);
    const monthDialog = screen.getByRole("dialog", { name: "Choose months" });
    expect(within(monthDialog).getByRole("button", { name: "August 2026" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(monthDialog).getByRole("button", { name: "July 2026" }));
    expect(within(monthDialog).getByRole("button", { name: "July 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("dialog", { name: "Choose months" })).toBeVisible();
    fireEvent.click(within(monthDialog).getByRole("button", { name: "Apply months" }));
    expect(screen.getByRole("button", { name: "Choose reporting months, July–September 2026" })).toBeVisible();
    expect(within(screen.getByLabelText("Reporting periods")).getAllByRole("button")[0]).toHaveTextContent("Current");
    fireEvent.click(screen.getByRole("button", { name: /Choose reporting months/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Choose months" })).not.toBeInTheDocument();

    const weeklyLimit = screen.getByRole("textbox", { name: "Weekly limit" });
    fireEvent.focus(weeklyLimit);
    fireEvent.change(weeklyLimit, { target: { value: "1500" } });
    fireEvent.blur(weeklyLimit);
    expect(screen.queryByText(/of 7 .*elapsed/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Budget History", { selector: "summary" }));
    const budgetHistory = screen.getByRole("table", { name: "Budget change history" });
    expect(within(budgetHistory).getByRole("columnheader", { name: "Date of Change" })).toBeVisible();
    expect(within(budgetHistory).getByRole("columnheader", { name: "From" })).toBeVisible();
    expect(within(budgetHistory).getByRole("columnheader", { name: "To" })).toBeVisible();
    expect(within(budgetHistory).getByText("$0")).toBeVisible();
    expect(within(budgetHistory).getByText("$1,500")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Actual spend" }), { target: { value: "350" } });
    expect(screen.getByText((_, element) => element?.tagName === "STRONG" && element.textContent === "$1,150")).toBeVisible();
    expect(screen.getByText("$116.67 / day")).toBeVisible();
    expect(screen.getByText("23%")).toBeVisible();
    expect(screen.queryByText("Burn Rate Progress")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Good documentation" }), { target: { value: "Scale the best converting exact-match campaign." } });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Current Week Summary" })).getByText("Saved locally")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(PPC_DASHBOARD_STORAGE_KEY) || "{}");
    expect(stored.version).toBe(1);
    expect(stored.reports["product-1:2026-08-26"]).toMatchObject({
      productId: "product-1",
      weekStart: "2026-08-26",
      weeklyBudget: 1500,
      dailyBudget: 214.29,
      budgetHistory: [expect.objectContaining({ from: 0, to: 1500 })],
      spend: 350,
      notes: "## Good\nScale the best converting exact-match campaign.",
      status: "Draft",
    });
  }, 10_000);

  it("shows five budget changes per page and paginates the remaining history", async () => {
    const budgetHistory = Array.from({ length: 7 }, (_, index) => ({
      id: `change-${index + 1}`,
      changedAt: `2026-08-${String(28 - index).padStart(2, "0")}T12:00:00.000Z`,
      from: index * 10,
      to: (index + 1) * 10,
    }));
    window.localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({
      version: 1,
      reports: {
        "product-1:2026-08-26": { productId: "product-1", weekStart: "2026-08-26", budgetHistory },
      },
    }));

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    fireEvent.click(screen.getByText("Budget History", { selector: "summary" }));
    const table = screen.getByRole("table", { name: "Budget change history" });
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(within(table).getAllByText("$10")).toHaveLength(2);
    expect(within(table).getByText("$50")).toBeVisible();
    expect(within(table).queryByText("$70")).not.toBeInTheDocument();

    const secondPage = screen.getByRole("button", { name: "Budget history page 2" });
    fireEvent.click(secondPage);
    expect(secondPage).toHaveAttribute("aria-current", "page");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("$70")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next budget history page" })).toBeDisabled();
  });

  it("keeps unavailable current metrics visible as dashes without false comparisons", async () => {
    window.localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({ version: 1, reports: { "product-1:2026-08-19": {
      productId: "product-1", weekStart: "2026-08-19", spend: 56, ppcSales: 163, totalSales: 339, ppcOrders: 14, totalOrders: 24, acos: 34, tacos: 16,
    } } }));
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const table = await screen.findByRole("table", { name: "Six-week Scale Insights performance" });
    expect(within(table).getByRole("row", { name: /Spend/ })).toHaveTextContent("—");
    expect(within(table).getByRole("row", { name: /Organic Sales/ })).toHaveTextContent("—");
    expect(within(table).queryByText(/100%/)).not.toBeInTheDocument();
  });

  it("retrieves the selected week and keeps imported table values read-only", async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      if (!url.includes("/api/dashboard/performance?")) return { ok: true, status: 200, json: async () => ({ products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }] }) } as Response;
      const startDate = new URL(url, "http://localhost").searchParams.get("weekStart")!;
      return { ok: true, status: 200, json: async () => ({ performance: {
        metricsRevision: 3, asin: "B012345678", country: "US", startDate, endDate: addDaysIso(startDate, 6), currency: "USD",
        metrics: { spend: 81.75, ppcSales: 481.75, ppcOrders: 23, ppcClicks: 48, ppcImpressions: 1200, ppcUnits: 31, totalUnits: 59, totalSales: 1317.35, totalOrders: 59 },
        freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: addDaysIso(startDate, 6) }, warnings: [],
      } }) } as Response;
    });
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByText("Scale Insights synced through 2026-09-01.")).toBeVisible();
    const table = screen.getByRole("table", { name: "Six-week Scale Insights performance" });
    expect(within(table).getByRole("columnheader", { name: /Aug 26, 2026 to Sep 01, 2026, selected week/ })).toBeVisible();
    expect(within(table).getByRole("row", { name: /Spend/ })).toHaveTextContent("$82");
    expect(within(table).getByRole("row", { name: /CPC/ })).toHaveTextContent("$2");
    expect(within(table).queryByRole("textbox", { name: "Spend" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Actual spend" })).toHaveValue("82");
    expect(screen.getByRole("textbox", { name: "Actual spend" })).toHaveAttribute("readonly");
  }, 10_000);
  it("switches between the Products workspace, account Dashboard, and Compare", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const productsTab = screen.getByRole("tab", { name: /Products/ });
    const dashboardTab = screen.getByRole("tab", { name: "Dashboard" });
    const compareTab = screen.getByRole("tab", { name: "Compare" });
    expect(productsTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "Products" })).toBeVisible();

    fireEvent.click(dashboardTab);
    expect(dashboardTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Performance Overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "ASIN Velocity & Performance Ranking" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Products" })).not.toBeInTheDocument();

    fireEvent.click(compareTab);
    expect(compareTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Campaign Spend Comparison" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Performance Overview" })).not.toBeInTheDocument();

    fireEvent.click(productsTab);
    expect(productsTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "Products" })).toBeVisible();
  });

  it("applies a confirmed remote report update without resetting the selected workspace tab", async () => {
    const view = render(<PpcPerformanceDashboard initialToday="2026-08-28" remoteSync={{ version: 0, keys: [] }} />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard" }));
    const report = {
      ...createWeeklyPpcReport("product-1", "2026-08-26"),
      notes: "## Good\nRemote improvement",
      summaryTopics: [{ id: "remote-good", title: "Good", body: "Remote improvement" }],
    };
    localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({ version: 1, reports: { "product-1:2026-08-26": report } }));

    view.rerender(<PpcPerformanceDashboard initialToday="2026-08-28" remoteSync={{ version: 1, keys: [PPC_DASHBOARD_STORAGE_KEY] }} />);

    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Products/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Good documentation" })).toHaveValue("Remote improvement"));
  });

  it("marks live goal actuals partial while the reporting week is incomplete", async () => {
    const report = createWeeklyPpcReport("product-1", "2026-08-26");
    report.goals = [{ id: "test-acos", title: "ACOS", metric: "acos", unit: "percentage", target: "25", actual: "", status: "On Track" }];
    localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({ version: 1, reports: { "product-1:2026-08-26": report } }));
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      if (!url.includes("/api/dashboard/performance?")) return {
        ok: true, status: 200,
        json: async () => ({ products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }] }),
      } as Response;
      const startDate = new URL(url, "http://localhost").searchParams.get("weekStart")!;
      const isActiveWeek = startDate === "2026-08-26";
      const endDate = isActiveWeek ? "2026-08-28" : addDaysIso(startDate, 6);
      return {
        ok: true, status: 200,
        json: async () => ({ performance: {
          metricsRevision: 3, asin: "B012345678", country: "US", startDate, endDate, currency: "USD",
          metrics: { spend: 50, ppcSales: 200, ppcOrders: 10, totalSales: 500, totalOrders: 25 },
          freshness: { adsDataAsOf: endDate, salesDataAsOf: endDate, salesDataThrough: endDate }, warnings: [],
        } }),
      } as Response;
    });

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    expect(await screen.findByText("Scale Insights synced through 2026-08-28.", {}, { timeout: 5000 })).toBeVisible();
    expect(within(screen.getByRole("button", { name: /August 26 to September 1/ })).getByText("Partial")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "ACOS actual" })).toHaveValue("25%");
    expect(within(screen.getByRole("textbox", { name: "ACOS actual" }).closest("[class*=goalRow]")!).getByText("Partial")).toBeVisible();
  }, 10_000);

  it("offers hosted Scale Insights consent without storing credentials in the browser", async () => {
    vi.mocked(fetch).mockImplementation(async input => String(input).includes("/api/dashboard/performance?")
      ? ({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Authorize Scale Insights to retrieve weekly performance.",
          authorizationRequired: true,
          authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
        }),
      } as Response)
      : ({
        ok: true,
        status: 200,
        json: async () => ({ products: [{ id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" }] }),
      } as Response));

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    const connect = await screen.findByRole("link", { name: "Connect Scale Insights" }, { timeout: 5000 });
    expect(connect).toHaveAttribute("href", "https://vercel.com/api/v1/connect/authorize/scl_test");
    expect(screen.getByText("Connect Scale Insights once to retrieve weekly performance.")).toBeVisible();
    expect(window.localStorage.getItem("SCALE_INSIGHTS_MCP_ACCESS_TOKEN")).toBeNull();
  });

  it("shows the six-week table alongside goals, budget, summaries, and actions", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    const performanceCard = screen.getByRole("region", { name: "Weekly PPC Performance" });
    const table = within(performanceCard).getByRole("table", { name: "Six-week Scale Insights performance" });
    expect(within(table).getAllByRole("rowheader").map(row => row.textContent)).toEqual([
      "Total Sales", "Total Orders", "Total Units", "Spend", "PPC Sales", "Organic Sales", "PPC Orders", "Organic Orders", "ACOS", "TACOS", "Impressions", "Clicks", "CPC",
    ]);
    expect(within(performanceCard).queryByRole("textbox", { name: "Target ACOS" })).not.toBeInTheDocument();
    const goalsCard = screen.getByRole("region", { name: "Weekly Goals" });
    const budgetCard = screen.getByRole("region", { name: "Budget Utilization" });
    const actionCard = screen.getByRole("region", { name: "Action Items" });
    expect(goalsCard.parentElement).toBe(actionCard.parentElement);
    expect(budgetCard.parentElement?.tagName).toBe("HEADER");
    expect(screen.getAllByRole("region", { name: "Budget Utilization" })).toHaveLength(1);
    expect(performanceCard.compareDocumentPosition(goalsCard) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(performanceCard.compareDocumentPosition(budgetCard) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(performanceCard.compareDocumentPosition(actionCard) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const goalHistory = within(goalsCard).getByRole("button", { name: "Goal History" });
    const addGoal = within(goalsCard).getByRole("button", { name: "Add Goal" });
    expect(addGoal).toBeVisible();
    expect(goalHistory.parentElement).toBe(addGoal.parentElement);
    expect(within(goalsCard).queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(within(budgetCard).getByRole("textbox", { name: "Weekly limit" })).toBeVisible();
    expect(within(budgetCard).queryByRole("heading", { name: "Budget Pacing" })).not.toBeInTheDocument();
    expect(within(goalsCard).getByRole("heading", { name: "Strategic Goals" })).toBeVisible();
    expect(within(budgetCard).queryByText("Burn Rate Progress")).not.toBeInTheDocument();
    expect(within(actionCard).getByRole("button", { name: "Add Action Item" })).toBeVisible();
    expect(within(actionCard).getByRole("button", { name: "Add Action Item" })).toHaveTextContent("Add Item");
    expect(within(actionCard).queryByText("Operational tasks generated from this week’s performance analysis")).not.toBeInTheDocument();
    fireEvent.click(within(actionCard).getByRole("button", { name: "Add Action Item" }));
    expect(within(actionCard).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(actionCard).queryByLabelText("Assignee unavailable")).not.toBeInTheDocument();
    expect(within(actionCard).getByRole("button", { name: "Remove New action item" })).toHaveAttribute("title", "Delete action item");
    fireEvent.change(within(budgetCard).getByRole("textbox", { name: "Weekly limit" }), { target: { value: "50" } });
    fireEvent.change(within(budgetCard).getByRole("textbox", { name: "Actual spend" }), { target: { value: "75" } });
    expect(within(budgetCard).queryByText("Over Budget")).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Current Week Summary" });
    expect(within(summary).getByRole("button", { name: "Add summary topic" })).toBeVisible();
    expect(actionCard).toBeVisible();
  });

  it("keeps an Action Item when the dashboard reloads immediately after editing", async () => {
    const view = render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const actionCard = await screen.findByRole("region", { name: "Action Items" });
    fireEvent.click(within(actionCard).getByRole("button", { name: "Add Action Item" }));
    fireEvent.change(within(actionCard).getByRole("textbox", { name: "Action item" }), { target: { value: "Review PPC bids" } });
    expect(JSON.parse(localStorage.getItem(PPC_DASHBOARD_STORAGE_KEY)!).reports["product-1:2026-08-26"].actions[0].title).toBe("Review PPC bids");
    view.unmount();
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("textbox", { name: "Action item" })).toHaveValue("Review PPC bids");
  });

  it("restores the product and prior week containing an Action Item after refresh", async () => {
    const view = render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    await screen.findByRole("region", { name: "Action Items" });
    fireEvent.click(screen.getByRole("button", { name: /August 19 to August 25/ }));
    const actionCard = screen.getByRole("region", { name: "Action Items" });
    fireEvent.click(within(actionCard).getByRole("button", { name: "Add Action Item" }));
    fireEvent.change(within(actionCard).getByRole("textbox", { name: "Action item" }), { target: { value: "Review last week" } });
    expect(JSON.parse(localStorage.getItem(PPC_WORKSPACE_SELECTION_KEY)!).weekStart).toBe("2026-08-19");
    view.unmount();

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("textbox", { name: "Action item" })).toHaveValue("Review last week");
    expect(screen.getByRole("button", { name: /August 19 to August 25/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not allow a viewer to create an unsavable Action Item", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" canEdit={false} />);
    const actionCard = await screen.findByRole("region", { name: "Action Items" });
    expect(within(actionCard).getByRole("button", { name: "Add Action Item" })).toBeDisabled();
    expect(screen.getAllByText("View-only access").length).toBeGreaterThan(0);
  });

  it("restores a queued cloud Action Item when refreshed before the upload starts", async () => {
    const remote: DashboardResponses = new Map([[PPC_DASHBOARD_STORAGE_KEY, { document: null, etag: null, canEdit: true }]]);
    const firstStorage = new SharedDashboardStorage(remote, vi.fn());
    const detachFirst = attachDashboardStorage(firstStorage);
    const view = render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    const actionCard = await screen.findByRole("region", { name: "Action Items" });
    fireEvent.click(within(actionCard).getByRole("button", { name: "Add Action Item" }));
    fireEvent.change(within(actionCard).getByRole("textbox", { name: "Action item" }), { target: { value: "Protect unsent action" } });
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) || "") || "")
      .some(value => value.includes("Protect unsent action"))).toBe(true);

    view.unmount();
    detachFirst();
    const restoredStorage = new SharedDashboardStorage(remote, vi.fn());
    const detachRestored = attachDashboardStorage(restoredStorage);
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("textbox", { name: "Action item" })).toHaveValue("Protect unsent action");
    detachRestored();
  });

  it("carries the latest earlier weekly budget across a missing week and keeps a manual override", async () => {
    window.localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({
      version: 1,
      reports: {
        "product-1:2026-08-12": { productId: "product-1", weekStart: "2026-08-12", weeklyBudget: 700, dailyBudget: 100 },
        "product-1:2026-08-26": { productId: "product-1", weekStart: "2026-08-26", weeklyBudget: 0, dailyBudget: 0 },
      },
    }));

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    expect(await screen.findByRole("textbox", { name: "Weekly limit" })).toHaveValue("700");
    const weeklyLimit = screen.getByRole("textbox", { name: "Weekly limit" });
    fireEvent.focus(weeklyLimit);
    fireEvent.change(weeklyLimit, { target: { value: "840" } });
    fireEvent.blur(weeklyLimit);
    fireEvent.click(screen.getByRole("button", { name: /August 19 to August 25/ }));
    expect(screen.getByRole("textbox", { name: "Weekly limit" })).toHaveValue("700");
    fireEvent.click(screen.getByRole("button", { name: /August 26 to September 1/ }));
    expect(screen.getByRole("textbox", { name: "Weekly limit" })).toHaveValue("840");
  });
  it("starts with the first priority-tag product and omits its tag beside the workspace title", async () => {
    window.localStorage.setItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY, JSON.stringify({
      version: 1,
      tags: [{ id: "tag-comp", name: "Complementary" }, { id: "tag-lead", name: "Lead Came" }],
      customProducts: [],
      productOverrides: {
        "product-comp": { name: "Plastic Fids", asin: "B000000002", sku: "PF-01", tagId: "tag-comp", imageDataUrl: "" },
        "product-lead": { name: "Lead Nippers", asin: "B000000001", sku: "LN-01", tagId: "tag-lead", imageDataUrl: "" },
      },
      hiddenPipelineProductIds: [],
    }));
    vi.mocked(fetch).mockImplementation(async input => String(input).includes("/api/dashboard/performance?")
      ? { ok: false, status: 503, json: async () => ({ error: "Unavailable" }) } as Response
      : { ok: true, status: 200, json: async () => ({ products: [
        { id: "product-comp", name: "Plastic Fids", asin: "B000000002", sku: "PF-01", stageId: "launch", status: "Active" },
        { id: "product-lead", name: "Lead Nippers", asin: "B000000001", sku: "LN-01", stageId: "launch", status: "Active" },
      ] }) } as Response);

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    const workspaceTitle = await screen.findByRole("heading", { name: "Lead Nippers" });
    expect(workspaceTitle.parentElement).toHaveTextContent(/^Lead Nippers$/);
    const productsPanel = screen.getByRole("heading", { name: "Products" }).closest("aside")!;
    const leadProduct = within(productsPanel).getByRole("button", { name: /Lead Nippers/ });
    const complementaryProduct = within(productsPanel).getByRole("button", { name: /Plastic Fids/ });
    expect(leadProduct.compareDocumentPosition(complementaryProduct) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(leadProduct).toHaveAttribute("aria-pressed", "true");
  });

  it("shows auto-save with a refresh control and no manual save or export control", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Refresh Data" });
    expect(refresh).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("carries the previous week's result documentation into an existing blank next week", async () => {
    window.localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({
      version: 1,
      reports: {
        "product-1:2026-08-19": { productId: "product-1", weekStart: "2026-08-19", previousWeekResult: "Keep the winning exact campaign." },
        "product-1:2026-08-26": { productId: "product-1", weekStart: "2026-08-26", previousWeekResult: "" },
      },
    }));

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    const previousSummary = screen.getByRole("region", { name: "Previous Week Summary" });
    expect(within(previousSummary).getByRole("region", { name: "Previous summary topic General Summary" })).toHaveTextContent("Keep the winning exact campaign.");
    expect(within(previousSummary).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Carry-forward result and lessons" })).not.toBeInTheDocument();
  });

  it("shows the previous week's Good and Bad topics as read-only colored summary cards", async () => {
    window.localStorage.setItem(PPC_DASHBOARD_STORAGE_KEY, JSON.stringify({
      version: 1,
      reports: {
        "product-1:2026-08-19": {
          productId: "product-1", weekStart: "2026-08-19",
          summaryTopics: [
            { id: "good", title: "Good", body: "PPC orders increased." },
            { id: "bad", title: "Bad", body: "ACOS increased." },
          ],
        },
        "product-1:2026-08-26": { productId: "product-1", weekStart: "2026-08-26" },
      },
    }));

    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);

    const previousSummary = await screen.findByRole("region", { name: "Previous Week Summary" });
    expect(within(previousSummary).getByRole("region", { name: "Previous summary topic Good" })).toHaveTextContent("PPC orders increased.");
    expect(within(previousSummary).getByRole("region", { name: "Previous summary topic Bad" })).toHaveTextContent("ACOS increased.");
    expect(within(previousSummary).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows only selected-month weeks, including their boundary overlap", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-09-03" />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();

    const periods = within(screen.getByLabelText("Reporting periods")).getAllByRole("button");
    expect(periods[0]).toHaveTextContent("Sep 2 – 8, 2026");
    expect(periods[1]).toHaveTextContent("Aug 26 – Sep 1, 2026");
    expect(periods).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Choose reporting months, August & September 2026" })).toBeVisible();
    expect(screen.queryByText("August 19 to August 25")).not.toBeInTheDocument();
    expect(screen.queryByText("September 30 to October 6")).not.toBeInTheDocument();
  });

  it("confirms before hiding a Pipeline product from the weekly portfolio", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Product actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Enable product editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Glass Cleaner" }));
    const warning = screen.getByRole("alertdialog", { name: "Remove Glass Cleaner?" });
    expect(within(warning).getByText(/remains unchanged in Product Pipeline/i)).toBeVisible();
    fireEvent.click(within(warning).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete Glass Cleaner" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Delete Glass Cleaner" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove Glass Cleaner?" })).getByRole("button", { name: "Delete product" }));
    expect(screen.queryByRole("button", { name: "Delete Glass Cleaner" })).not.toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY) || "{}");
    expect(stored.hiddenPipelineProductIds).toEqual(["product-1"]);
  });

  it("creates a tag and dashboard product, exposes identifier links, edits it, and deletes it", async () => {
    render(<PpcPerformanceDashboard initialToday="2026-08-28" />);
    expect(await screen.findByRole("heading", { name: "Glass Cleaner" })).toBeVisible();
    expect(screen.queryByText("Active", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Glass Cleaner" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Product actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    const tagDialog = screen.getByRole("dialog", { name: "Add tag" });
    fireEvent.change(within(tagDialog).getByRole("textbox", { name: "Tag name" }), { target: { value: "Launch group" } });
    fireEvent.click(within(tagDialog).getByRole("button", { name: "Add tag" }));
    expect(screen.getByRole("combobox", { name: "Filter products by tag" })).toHaveDisplayValue("Launch group");

    fireEvent.click(screen.getByRole("button", { name: "Product actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    const productDialog = screen.getByRole("dialog", { name: "Add product" });
    fireEvent.change(within(productDialog).getByRole("textbox", { name: "Product name" }), { target: { value: "Glass Polish" } });
    fireEvent.change(within(productDialog).getByRole("textbox", { name: "ASIN" }), { target: { value: "b012345679" } });
    fireEvent.change(within(productDialog).getByRole("textbox", { name: "SKU" }), { target: { value: "POLISH-01" } });
    fireEvent.change(within(productDialog).getByLabelText(/Product image/i), { target: { files: [new File(["image"], "polish.png", { type: "image/png" })] } });
    expect(await within(productDialog).findByAltText("Product preview")).toBeVisible();
    expect(within(productDialog).getByRole("combobox", { name: "Tag" })).toHaveDisplayValue("Launch group");
    fireEvent.click(within(productDialog).getByRole("button", { name: "Add product" }));

    expect(await screen.findByRole("heading", { name: "Glass Polish" })).toBeVisible();
    expect(screen.getAllByAltText("Glass Polish product")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Open ASIN B012345679 on Amazon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open SKU POLISH-01 in Seller Central" })).not.toBeInTheDocument();
    const headerAsinLink = screen.getByRole("link", { name: "Open selected product ASIN B012345679 on Amazon" });
    const headerSkuLink = screen.getByRole("link", { name: "Open selected product SKU POLISH-01 in Seller Central" });
    expect(headerAsinLink).toHaveAttribute("href", "https://www.amazon.com/dp/B012345679");
    expect(headerSkuLink).toHaveAttribute("href", "https://sellercentral.amazon.com/myinventory/inventory?searchField=sku&searchTerm=POLISH-01");
    expect(headerAsinLink).toHaveAttribute("target", "_blank");
    expect(headerSkuLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(headerAsinLink.parentElement?.nextElementSibling).toContainElement(headerSkuLink);
    expect(headerAsinLink.parentElement?.parentElement).not.toHaveTextContent("August 26 to September 1");
    expect(headerAsinLink.parentElement?.parentElement).not.toHaveTextContent("Week 35");
    const asinNavigation = screen.getByRole("navigation", { name: "Scale Insights analysis for ASIN B012345679" });
    expect(within(asinNavigation).getAllByRole("link")).toHaveLength(12);
    expect(within(within(asinNavigation).getByRole("group", { name: "Performance reports" })).getAllByRole("link").map(link => link.textContent)).toEqual(["Campaigns", "Keyword Targeting", "Product Targeting", "Search Terms"]);
    expect(within(within(asinNavigation).getByRole("group", { name: "Targeting reports" })).getAllByRole("link").map(link => link.textContent)).toEqual(["Ad Types", "Match Types", "Placements", "Main Keywords"]);
    expect(within(asinNavigation).getByRole("link", { name: "Campaigns" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/Campaigns/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Keyword Targeting" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/Keywords/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Product Targeting" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/ProductAds/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Search Terms" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/SearchTerms/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Match Types" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/MatchTypes/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Placements" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/Placements/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Ad Types" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/Performance/AdTypes/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Main Keywords" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Ads/MainKeywords/Index?from=2026-08-26&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Daily Performance" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Sales/SalesTrend?cycles=7&daysPerCycle=1&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Weekly Performance" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Sales/SalesTrend?cycles=7&daysPerCycle=7&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Monthly Performance" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Sales/SalesTrend?cycles=7&daysPerCycle=30&to=2026-09-01&asinList=B012345679");
    expect(within(asinNavigation).getByRole("link", { name: "Day Parting" })).toHaveAttribute("href", "https://portal.scaleinsights.com/Sales/DayParting?weeks=4&to=2026-09-01&asinList=B012345679");
    const trendNavigation = within(asinNavigation).getByRole("group", { name: "Trend reports" });
    expect(within(trendNavigation).getAllByRole("link").map(link => link.textContent)).toEqual(["Daily Performance", "Weekly Performance", "Monthly Performance", "Day Parting"]);
    for (const link of within(asinNavigation).getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getAllByText("Launch group").length).toBeGreaterThan(1);

    const productActions = screen.getByRole("button", { name: "Product actions" });
    fireEvent.click(productActions);
    fireEvent.click(screen.getByRole("button", { name: "Enable product editing" }));
    expect(productActions).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(productActions);
    expect(screen.getByRole("button", { name: "Exit product editing" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(productActions);
    fireEvent.click(screen.getByRole("button", { name: "Edit Glass Polish" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit product" });
    fireEvent.change(within(editDialog).getByRole("textbox", { name: "Product name" }), { target: { value: "Glass Polish Pro" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Glass Polish Pro" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Delete Glass Polish Pro" }));
    const deleteDialog = screen.getByRole("alertdialog", { name: "Remove Glass Polish Pro?" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete product" }));
    expect(screen.queryByRole("button", { name: "Edit Glass Polish Pro" })).not.toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(PPC_DASHBOARD_CATALOG_STORAGE_KEY) || "{}");
    expect(stored.tags).toEqual([expect.objectContaining({ name: "Launch group" })]);
    expect(stored.customProducts).toEqual([]);
  });
});
