import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuditPerformanceSummary } from "./audit-performance-summary";
import { type AuditAd, type AuditData } from "../domain/ppc-audit";

const ad = (asin: string, spend: number, sales: number, orders: number): AuditAd => ({ asin, spend, sales, orders, clicks: 10, impressions: 100, entity: "keyword", type: "SP", campaign: asin, campaignId: asin, adGroup: "Main", sku: "", target: "glass", query: "", match: "Exact", placement: "", strategy: "", state: "enabled", bid: 1 });
const ads = [ad("B012345678", 20, 100, 4), ad("B012345679", 10, 0, 0)];
const audit: AuditData = { version: 1, name: "Audit", currency: "USD", start: "2026-09-01", end: "2026-09-30", importedAt: "2026-10-01", files: ["bulk.xlsx", "business.csv"], ads, business: [{ asin: "B012345678", sales: 500, orders: 12, units: 14, sessions: 100 }, { asin: "B012345679", sales: 200, orders: 6, units: 7, sessions: 50 }] };
const catalog = [{ asin: "B012345678", sku: "ROUND", name: "Round came" }, { asin: "B012345679", sku: "FLAT", name: "Flat came" }];
const table = () => screen.getByRole("table", { name: "ASIN Performance Overview" });
afterEach(cleanup);

it("shows the dashboard layout before upload without presenting missing metrics as zeros", () => {
  render(<AuditPerformanceSummary audit={null} ads={[]} catalog={[]} onWasted={() => {}} />);
  expect(screen.getByText(/Upload your PPC Report/)).toBeVisible();
  for (const name of ["Ad funnel", "Efficiency", "Spend by campaign type", "ASINs to act on"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View details" })).toBeDisabled();
});

it("shows totals, the sales mix, efficiency and per-ASIN composition without duplicate parent totals", () => {
  const onWasted = vi.fn();
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={onWasted} />);
  expect(screen.getByRole("heading", { name: "Total sales" })).toBeVisible();
  expect(screen.getAllByText("$700").length).toBeGreaterThan(0);
  // $100 of $700 sales came from ads; 4 of 18 orders.
  expect(screen.getByRole("img", { name: "14% of sales from ads, 86% organic" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Orders" }));
  expect(screen.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("img", { name: "22% of orders from ads, 78% organic" })).toBeVisible();
  expect(screen.getByRole("img", { name: "ACOS: 30.0%" })).toBeVisible();
  expect(screen.getByRole("img", { name: "TACOS: 4.3%" })).toBeVisible();
  const row = within(table()).getByText("Round came").closest("tr")!;
  expect(within(row).getByText("20% PPC")).toBeVisible();
  expect(within(row).getByText("4%")).toBeVisible();
  expect(within(row).getByText("Healthy")).toBeVisible();
  expect(within(table()).getAllByRole("columnheader")).toHaveLength(7);
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(onWasted).toHaveBeenCalledOnce();
});

it("scopes both reports by product search and multiple ASIN choices, then resets", () => {
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={() => {}} />);
  fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "ROUND" } });
  expect(screen.getAllByText("$500").length).toBeGreaterThan(0);
  expect(screen.queryByText("Flat came")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  fireEvent.click(screen.getByText("All ASINs"));
  fireEvent.click(screen.getByLabelText("B012345679"));
  expect(screen.queryByText("Round came")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("B012345678"));
  expect(screen.getByText("Round came")).toBeVisible();
});

it("does not subtract filtered PPC from unfiltered business totals, and toggles columns", () => {
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={() => {}} />);
  fireEvent.change(screen.getByLabelText("Match type"), { target: { value: "Exact" } });
  expect(screen.getByRole("img", { name: "Sales mix unavailable" })).toBeVisible();
  expect(within(table()).getAllByText("—").length).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  fireEvent.click(screen.getByText("Columns"));
  fireEvent.click(screen.getByLabelText("TACOS"));
  expect(within(table()).getAllByRole("columnheader")).toHaveLength(6);
  fireEvent.click(screen.getByLabelText("Organic sales"));
  expect(within(table()).getByRole("columnheader", { name: "Organic sales" })).toBeVisible();
});

it("sorts by the chosen tab, flags wasted ASINs and lists only ASINs advertised in the period", () => {
  const stale = { ...ad("B0STALE001", 0, 0, 0), impressions: 0, clicks: 0, campaign: "Old", campaignId: "old" };
  const term = { ...ad("B012345679", 6, 0, 0), entity: "searchterm", query: "glass cutter", clicks: 12 };
  const withWaste = { ...audit, ads: [...ads, stale, term], business: [], wasteRules: { groups: [{ maxOrders: 0, minClicks: 10 }] } };
  render(<AuditPerformanceSummary audit={withWaste} ads={withWaste.ads} catalog={catalog} onWasted={() => {}} />);
  expect(screen.getByText("2 ASINs")).toBeVisible();
  expect(screen.queryByText("B0STALE001")).not.toBeInTheDocument();
  expect(screen.getByText("2 campaigns")).toBeVisible();
  expect(screen.getByRole("heading", { name: "PPC sales" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Most waste" }));
  const first = within(table()).getAllByRole("row")[1];
  expect(within(first).getByText("Flat came")).toBeVisible();
  expect(within(first).getByText("Cut waste")).toBeVisible();
});
