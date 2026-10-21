import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { AuditProductTargets } from "./audit-product-targets";

const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "producttargeting", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", targetId: "t1", asin: "B012345678", sku: "ROUND", target: 'asin="B012345679"', query: "", match: "", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });
const ads = [ad(), ad({ placement: "Top of Search", spend: 10, sales: 100, orders: 2 }), ad({ targetId: "t2", target: 'category="123"', spend: 60, sales: 100, orders: 2 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-21", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("renders the supplied sections without fabricated sample data", () => {
  render(<AuditProductTargets audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Product Target Portfolio Aggregate Metrics", "Target Type Performance", "Product Target Signals", "Product Target Performance"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});
it("expands actual placements without changing target totals or inventing product metadata", () => {
  render(<AuditProductTargets audit={audit} ads={ads} catalog={[{ asin: "B012345678", sku: "ROUND", name: "Round Came" }]} />);
  const portfolio = screen.getByRole("region", { name: "Product target portfolio metrics" });
  expect(within(portfolio).getByText("$100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: 'Expand target asin="B012345679" 1 Core B012345678 ASIN Target t1' }));
  const placements = screen.getByRole("table", { name: 'Placement breakdown for asin="B012345679"' });
  expect(within(placements).getByText("$10")).toBeVisible(); expect(within(portfolio).getByText("$100")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open targeted ASIN B012345679 on Amazon" })).toHaveAttribute("href", "https://www.amazon.com/dp/B012345679");
  expect(screen.getByRole("heading", { name: "Product Target Findings & Action Plan" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
});
it("filters target type and placement evidence, updates columns and recalculates uploaded data", () => {
  render(<AuditProductTargets audit={audit} ads={ads} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Product Target Performance" });
  fireEvent.change(screen.getByRole("combobox", { name: "Target Type" }), { target: { value: "Category Target" } });
  expect(within(table).queryByText('asin="B012345679"')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), { target: { value: "Top of Search" } });
  expect(within(screen.getByRole("region", { name: "Product target portfolio metrics" })).getByText("$10")).toBeVisible();
  fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "Bid" }));
  expect(within(table).queryByRole("columnheader", { name: "Bid" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});
it("paginates distinct target IDs and sorts without collapsing equal ASIN expressions", () => {
  const many = Array.from({ length: 26 }, (_, i) => ad({ targetId: String(i), spend: i + 1 }));
  render(<AuditProductTargets audit={{ ...audit, ads: many }} ads={many} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Product Target Performance" }); expect(within(table).getAllByRole("row")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByRole("button", { name: 'Expand target asin="B012345679" 1 Core B012345678 ASIN Target 0' })).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "Lowest ACOS" } }); expect(within(table).getAllByRole("row")[1]).toHaveTextContent("$1");
});
