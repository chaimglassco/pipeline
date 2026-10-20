import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { AuditKeywords } from "./audit-keywords";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead came", query: "", match: "Exact", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });
const ads = [ad(), ad({ entity: "searchterm", query: "lead supplies", spend: 20, sales: 180, orders: 7 }), ad({ placement: "Top of Search", spend: 10, sales: 100 }), ad({ keywordId: "k2", target: "glass tools", match: "Broad", spend: 60, sales: 100, orders: 2 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-20", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("renders the supplied empty sections without sample metrics", () => {
  render(<AuditKeywords audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Keyword Portfolio Aggregate Metrics", "Match Type Distribution & Diagnostics", "Keyword Signals Breakdown", "Keyword Target Performance"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});
it("expands linked query and placement evidence without changing keyword totals", () => {
  render(<AuditKeywords audit={audit} ads={ads} catalog={[]} />);
  const portfolio = screen.getByRole("region", { name: "Keyword portfolio metrics" });
  expect(within(portfolio).getByText("$100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Expand keyword lead came 1 Core B012345678 Exact k1" }));
  expect(screen.getByRole("table", { name: "Search terms for lead came" })).toHaveTextContent("lead supplies");
  expect(screen.getByRole("heading", { name: "Placement Performance for this Keyword" })).toBeVisible();
  expect(within(portfolio).getByText("$100")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
});
it("filters by match, minimum spend and signals, changes columns and refreshes", () => {
  render(<AuditKeywords audit={audit} ads={ads} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Keyword Target Performance" });
  fireEvent.change(screen.getByRole("combobox", { name: "Match" }), { target: { value: "Exact" } });
  expect(within(table).queryByText("glass tools")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByLabelText("Min Spend"), { target: { value: "50" } });
  expect(within(table).queryByText("lead came")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "Bid" }));
  expect(within(table).queryByRole("columnheader", { name: "Bid" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});
it("sorts and paginates keyword identities rather than collapsing equal text", () => {
  const many = Array.from({ length: 26 }, (_, i) => ad({ keywordId: String(i), spend: i + 1, sales: 100 }));
  render(<AuditKeywords audit={{ ...audit, ads: many }} ads={many} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Keyword Target Performance" });
  expect(within(table).getAllByRole("row")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(within(table).getByRole("button", { name: "Expand keyword lead came 1 Core B012345678 Exact 0" })).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "Lowest ACOS" } });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("$1");
});
