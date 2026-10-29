import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuditPerformanceSummary } from "./audit-performance-summary";
import { type AuditAd, type AuditData } from "../domain/ppc-audit";

const ad = (asin: string, spend: number, sales: number, orders: number): AuditAd => ({ asin, spend, sales, orders, clicks: 10, impressions: 100, entity: "keyword", type: "SP", campaign: asin, campaignId: asin, adGroup: "Main", sku: "", target: "glass", query: "", match: "Exact", placement: "", strategy: "", state: "enabled", bid: 1 });
const ads = [ad("B012345678", 20, 100, 4), ad("B012345679", 10, 0, 0)];
const audit: AuditData = { version: 1, name: "Audit", currency: "USD", start: "2026-09-01", end: "2026-09-30", importedAt: "2026-10-01", files: [], ads, business: [{ asin: "B012345678", sales: 500, orders: 12, units: 14, sessions: 100 }, { asin: "B012345679", sales: 200, orders: 6, units: 7, sessions: 50 }] };
const catalog = [{ asin: "B012345678", sku: "ROUND", name: "Round came" }, { asin: "B012345679", sku: "FLAT", name: "Flat came" }];
afterEach(cleanup);

it("shows the dashboard layout before upload without presenting missing metrics as zeros", () => {
  render(<AuditPerformanceSummary audit={null} ads={[]} catalog={[]} onWasted={() => {}} />);
  expect(screen.getByText(/Upload your PPC Report/)).toBeVisible();
  expect(screen.getByRole("heading", { name: "PPC Performance" })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View Wasted Spend" })).toBeDisabled();
});

it("renders the supplied metric groups and reconciled ASIN composition without duplicate parent totals", () => {
  const onWasted = vi.fn();
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={onWasted} />);
  for (const name of ["Business Performance", "Advertising Investment", "Efficiency Metrics", "Traffic"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  const table = screen.getByRole("table", { name: "ASIN Performance Overview" });
  const row = within(table).getByText("Round came").closest("tr")!;
  expect(within(row).getByText("$400")).toBeVisible();
  expect(within(row).getByText("4%")).toBeVisible();
  expect(within(table).getAllByRole("columnheader")).toHaveLength(13);
  fireEvent.click(screen.getByRole("button", { name: "View Wasted Spend" }));
  expect(onWasted).toHaveBeenCalledOnce();
});

it("scopes both reports by product search and multiple ASIN choices, resets, and filters table separately", () => {
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={() => {}} />);
  fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "ROUND" } });
  expect(screen.getAllByText("$500").length).toBeGreaterThan(0);
  expect(screen.queryByText("Flat came")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.click(screen.getByText("ASIN Level Summary · All"));
  fireEvent.click(screen.getByLabelText("B012345679"));
  expect(screen.queryByText("Round came")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("B012345678"));
  expect(screen.getByText("Round came")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Search ASIN table"), { target: { value: "FLAT" } });
  expect(screen.queryByText("Round came")).not.toBeInTheDocument();
  expect(screen.getByText("Flat came")).toBeVisible();
});

it("does not subtract filtered PPC from unfiltered business totals or invent ratios for zero denominators", () => {
  render(<AuditPerformanceSummary audit={audit} ads={ads} catalog={catalog} onWasted={() => {}} />);
  fireEvent.change(screen.getByLabelText("Match type"), { target: { value: "Exact" } });
  const table = screen.getByRole("table", { name: "ASIN Performance Overview" });
  expect(within(table).queryByText("$400")).not.toBeInTheDocument();
  expect(within(table).getAllByText("—").length).toBeGreaterThan(3);
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.click(screen.getByText("Columns"));
  fireEvent.click(screen.getByLabelText("TACOS"));
  expect(within(table).getAllByRole("columnheader")).toHaveLength(12);
});
