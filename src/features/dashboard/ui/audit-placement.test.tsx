import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { AuditPlacement } from "./audit-placement";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "placement", type: "SP", campaign: "Main", campaignId: "1", adGroup: "", asin: "B012345678", sku: "ROUND", target: "", query: "", match: "Exact", placement: "Top of Search", strategy: "", state: "enabled", placementMetricsAvailable: true, placementBidAdjustment: 30, bid: 0, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 2000, ...v });
const ads = [ad(), ad({ placement: "Product Pages", spend: 60, sales: 100, orders: 2, clicks: 60, match: "Broad" })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-16", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("shows the requested sections with no sample values before import", () => {
  render(<AuditPlacement audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Placement Portfolio Summary", "Placement by Advertised ASIN", "Placement by Contributing Campaign", "Match Type by Placement Matrix", "Detailed Placement Performance Ledger"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
});
it("expands ASIN evidence and opens the exact contributing campaign", () => {
  const onCampaign = vi.fn(); render(<AuditPlacement audit={audit} ads={ads} catalog={[]} onCampaign={onCampaign} />);
  const asinTable = screen.getByRole("table", { name: "Placement by Advertised ASIN" });
  expect(within(asinTable).getAllByRole("row")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Expand placement ASIN B012345678" }));
  expect(within(asinTable).getAllByRole("row")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "View placement campaign Main Top of Search" }));
  expect(onCampaign).toHaveBeenCalledWith(JSON.stringify(["SP", "1"]));
  const ledger = screen.getByRole("table", { name: "Detailed Placement Performance Ledger" });
  fireEvent.click(within(ledger).getByRole("button", { name: "Review placement Main Top of Search B012345678" }));
  expect(within(ledger).getByRole("button", { name: "View Full Campaign Analysis →" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
});
it("filters, toggles columns, refreshes and preserves unavailable joint data", () => {
  render(<AuditPlacement audit={audit} ads={ads} catalog={[]} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), { target: { value: "Top of Search" } });
  expect(within(screen.getByRole("region", { name: "Placement portfolio metrics" })).getByText("$40")).toBeVisible();
  fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "CTR" }));
  expect(within(screen.getByRole("table", { name: "Placement Efficiency Comparison" })).queryByRole("columnheader", { name: "CTR" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.change(screen.getByRole("combobox", { name: "ASIN / Product" }), { target: { value: "Unmapped" } });
  expect(screen.getByText("No placement performance metrics are available in this scope.")).toBeVisible();
});
it("paginates and sorts the ledger while keeping campaign and placement identities", () => {
  const many = Array.from({ length: 26 }, (_, i) => ad({ campaign: `Campaign ${i}`, campaignId: String(i), spend: i + 1, sales: 100 }));
  render(<AuditPlacement audit={{ ...audit, ads: many }} ads={many} catalog={[]} />);
  const ledger = screen.getByRole("table", { name: "Detailed Placement Performance Ledger" });
  expect(within(ledger).getAllByRole("row")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "Next ledger page" }));
  expect(within(ledger).getByText("Campaign 0")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Sort By" }), { target: { value: "Lowest ACOS" } });
  expect(within(ledger).getAllByRole("row")[1]).toHaveTextContent("Campaign 0");
});
