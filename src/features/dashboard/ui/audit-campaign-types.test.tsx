import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { AuditCampaignTypes } from "./audit-campaign-types";

const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "campaign", type: "SP", campaign: "Main", campaignId: "1", adGroup: "", asin: "", sku: "", target: "", query: "", match: "", placement: "", strategy: "Dynamic down", state: "enabled", dailyBudget: 50, bid: 1, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 2000, ...changes });
const ads = [ad(), ad({ entity: "productad", asin: "B012345678", adGroup: "Core" }), ad({ entity: "keyword", asin: "B012345678", adGroup: "Core", target: "glass", match: "Exact" }), ad({ campaign: "Brand", campaignId: "2", type: "Sponsored Brands", state: "paused", spend: 60, sales: 100 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-16", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);

it("renders the requested empty dashboard with no example performance", () => {
  render(<AuditCampaignTypes audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Spend Share vs. Sales & Order Contribution", "Campaign Type Efficiency Breakdown", "Strategic Findings & Recommended Reviews"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});

it("switches type drilldowns without changing portfolio totals and opens full campaign analysis", () => {
  const onCampaign = vi.fn();
  render(<AuditCampaignTypes audit={audit} ads={ads} catalog={[]} onCampaign={onCampaign} />);
  const portfolio = screen.getByRole("region", { name: "Campaign type portfolio metrics" });
  expect(within(portfolio).getByText("$100")).toBeVisible();
  const drilldown = screen.getByRole("table", { name: "Campaigns by Selected Type" });
  expect(within(drilldown).getByText("Main")).toBeVisible();
  fireEvent.click(within(screen.getByRole("region", { name: "Campaign type cards" })).getByRole("button", { name: "View Sponsored Display campaigns" }));
  expect(within(drilldown).queryByText("Main")).not.toBeInTheDocument();
  expect(screen.getByText("No campaigns match this type and scope.")).toBeVisible();
  fireEvent.click(within(screen.getByRole("region", { name: "Campaign type cards" })).getByRole("button", { name: "View Sponsored Brands campaigns" }));
  expect(within(drilldown).queryByText("Main")).not.toBeInTheDocument();
  expect(within(drilldown).getByText("Brand")).toBeVisible();
  expect(within(portfolio).getByText("$100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Expand type campaign Brand Sponsored Brands 2" }));
  expect(screen.getByRole("heading", { name: "Placement Performance" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "View Full Campaign Analysis →" }));
  expect(onCampaign).toHaveBeenCalledWith(JSON.stringify(["Sponsored Brands", "2"]));
});

it("filters by state and search, applies column settings, and refreshes calculations", () => {
  render(<AuditCampaignTypes audit={audit} ads={ads} catalog={[]} />);
  const matrix = screen.getByRole("table", { name: "Campaign Type Efficiency Breakdown" });
  fireEvent.change(screen.getByRole("combobox", { name: "Campaign state" }), { target: { value: "Paused" } });
  expect(within(screen.getByRole("table", { name: "Campaigns by Selected Type" })).getByText("Brand")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "B012345678" } });
  expect(within(screen.getByRole("region", { name: "Campaign type portfolio metrics" })).getByText("$40")).toBeVisible();
  fireEvent.click(screen.getByText("Column Settings"));
  fireEvent.click(screen.getByRole("checkbox", { name: "CTR" }));
  expect(within(matrix).queryByRole("columnheader", { name: "CTR" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});

it("paginates large type drilldowns and sorts campaign ACOS without changing shares", () => {
  const many = Array.from({ length: 26 }, (_, i) => ad({ campaignId: String(i), campaign: `Campaign ${i}`, spend: i + 1, sales: 100 }));
  render(<AuditCampaignTypes audit={{ ...audit, ads: many }} ads={many} catalog={[]} />);
  const table = screen.getByRole("table", { name: "Campaigns by Selected Type" });
  expect(within(table).getAllByRole("row")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(within(table).getByText("Campaign 0")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "ACOS (Low to High)" } });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Campaign 0");
  expect(within(table).getAllByRole("row")).toHaveLength(26);
});
