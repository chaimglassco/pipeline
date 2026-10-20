import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AuditCampaigns } from "./audit-campaigns";
import { type AuditAd, type AuditData } from "../domain/ppc-audit";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "campaign", type: "SP", campaign: "Main", campaignId: "1", adGroup: "", asin: "", sku: "", target: "", query: "", match: "", placement: "", strategy: "Dynamic down", state: "enabled", dailyBudget: 50, bid: 1, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...changes });
const ads = [ad(), ad({ entity: "productad", asin: "B012345678", adGroup: "Main Group" }), ad({ entity: "keyword", asin: "B012345678", adGroup: "Main Group", target: "glass", match: "Exact" }), ad({ campaign: "Other", campaignId: "2", type: "SB", state: "paused", strategy: "Fixed bids", spend: 60, sales: 100 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-16", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("shows the supplied campaign sections and no example money before import", () => {
  render(<AuditCampaigns audit={null} ads={[]} catalog={[]} />);
  for (const title of ["Campaign Type Performance", "Bidding Strategy Performance", "Campaign Performance"]) expect(screen.getByRole("heading", { name: title })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
});
it("expands campaign evidence and shows reported budgets without inventing utilization", () => {
  render(<AuditCampaigns audit={audit} ads={ads} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Campaign Performance" });
  expect(within(table).getAllByText("$50/day")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Expand campaign Main SP 1" }));
  for (const title of ["Ad Group Performance", "Placement Performance", "Match Type Performance", "Key Target & Search Term Signals"]) expect(screen.getByRole("heading", { name: title })).toBeVisible();
  expect(screen.getByText("Needs budget history and active-day coverage.")).toBeVisible();
  expect(within(screen.getByRole("table", { name: "Ad Group Performance" })).getByText("$200")).toBeVisible();
});
it("filters campaign state, searches ad groups, sorts and refreshes imported calculations", () => {
  render(<AuditCampaigns audit={audit} ads={ads} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Campaign Performance" });
  fireEvent.change(screen.getByRole("combobox", { name: "Campaign state" }), { target: { value: "Paused" } });
  expect(within(table).queryByText("Main")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Main Group" } });
  expect(within(table).queryByText("Other")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "Highest PPC Sales" } });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Main");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});
