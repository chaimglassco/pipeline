import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { AuditSearchTerms } from "./audit-search-terms";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "searchterm", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "lead came cutter", match: "Phrase", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 300, orders: 8, clicks: 40, impressions: 1000, ...v });
const ads = [ad(), ad({ query: "", entity: "keyword", spend: 100, sales: 800 }), ad({ placement: "Top of Search", spend: 10, sales: 100, orders: 2 }), ad({ query: "free patterns", spend: 25, sales: 0, orders: 0 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-22", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("renders the supplied sections and honest empty state", () => {
  render(<AuditSearchTerms audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Search Term Portfolio", "Performance by Match Type", "Actionable Signals", "Search Term Performance"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});
it("expands the query placement and source context without inflating metrics", () => {
  render(<AuditSearchTerms audit={audit} ads={ads} catalog={[]} />);
  const portfolio = screen.getByRole("region", { name: "Search term portfolio metrics" });
  expect(within(portfolio).getByText("$65")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Expand search term lead came cutter 1 g1 B012345678 Phrase" }));
  expect(screen.getByRole("heading", { name: "Source Target Contribution" })).toBeVisible();
  expect(within(screen.getByRole("table", { name: "Placement breakdown for search term lead came cutter" })).getByText("$10")).toBeVisible();
  expect(screen.getByText(/\$40 of \$100/)).toBeVisible();
  expect(within(portfolio).getByText("$65")).toBeVisible();
  expect(screen.getByText(/Harvest and Negate open this review/)).toBeVisible();
});
it("filters signals, placement and source type and resets filters", () => {
  render(<AuditSearchTerms audit={audit} ads={ads} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Search Term Performance" });
  fireEvent.click(screen.getByRole("button", { name: "Review Harvest Candidates" }));
  expect(within(table).queryByText("free patterns")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), { target: { value: "Top of Search" } });
  expect(within(screen.getByRole("region", { name: "Search term portfolio metrics" })).getByText("$10")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "Source Target" }));
  expect(within(table).queryByRole("columnheader", { name: "Source Target" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});
it("paginates and changes row count while preserving contextual queries", () => {
  const many = Array.from({ length: 26 }, (_, i) => ad({ query: `query ${i}`, spend: i + 1 }));
  render(<AuditSearchTerms audit={audit} ads={many} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Search Term Performance" });
  expect(within(table).getAllByRole("row")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(within(table).getByText("query 0")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), { target: { value: "50" } });
  expect(within(table).getAllByRole("row")).toHaveLength(27);
});
