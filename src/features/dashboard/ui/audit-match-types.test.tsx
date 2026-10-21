import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AuditAd, type AuditData } from "../domain/ppc-audit";
import { AuditMatchTypes } from "./audit-match-types";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "keyword", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "", match: "Phrase", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 200, orders: 8, clicks: 40, impressions: 1000, ...v });
const ads = [ad(), ad({ query: "lead cutter", entity: "searchterm", spend: 10, sales: 80, orders: 2 }), ad({ placement: "Top of Search", spend: 15, sales: 100 }), ad({ match: "Broad", keywordId: "k2", spend: 60, sales: 80 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-22", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
it("renders the supplied sections without fake performance", () => {
  render(<AuditMatchTypes audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Spend Share vs. Sales Share", "Match Type Signals Breakdown", "ASIN Performance by Match Type", "Query Ledger", "Placement by Match Type", "Campaign Performance by Match", "Strategic Match Type Findings & Audit Directives"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled(); expect(screen.queryByText("$0")).not.toBeInTheDocument();
});
it("expands ASIN allocation and switches query and keyword ledgers", () => {
  render(<AuditMatchTypes audit={audit} ads={ads} catalog={[{ asin: "B012345678", sku: "ROUND", name: "Round Came" }]} />);
  expect(within(screen.getByRole("region", { name: "Match type portfolio metrics" })).getByText("$100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "+ Round Came" }));
  const asins = screen.getByRole("table", { name: "ASIN performance by match type" }); expect(within(asins).getByText("↳ Phrase Match")).toBeVisible();
  const ledger = screen.getByRole("table", { name: "Match type query ledger" }); expect(within(ledger).getByText("lead cutter")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keyword Targets (2)" })); expect(within(ledger).queryByText("lead cutter")).not.toBeInTheDocument(); expect(within(ledger).getAllByText("lead knife").length).toBeGreaterThan(0);
});
it("filters match and placements, resets filters, updates columns and refreshes", () => {
  render(<AuditMatchTypes audit={audit} ads={ads} catalog={[]} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Match" }), { target: { value: "Phrase" } });
  expect(within(screen.getByRole("region", { name: "Match type portfolio metrics" })).getByText("$40")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), { target: { value: "Top of Search" } });
  expect(within(screen.getByRole("region", { name: "Match type portfolio metrics" })).getByText("$15")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));
  fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "Waste" }));
  expect(within(screen.getByRole("table", { name: "Match type query ledger" })).queryByRole("columnheader", { name: "Waste" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.getByRole("status")).toHaveTextContent("Recalculated from the current uploaded reports.");
});
it("opens campaign context and query review without applying changes", () => {
  const onCampaign = vi.fn(); render(<AuditMatchTypes audit={audit} ads={ads} catalog={[]} onCampaign={onCampaign} />);
  fireEvent.click(within(screen.getByRole("table", { name: "Campaign performance by match" })).getAllByRole("button", { name: "Main" })[0]); expect(onCampaign).toHaveBeenCalledWith(JSON.stringify(["SP", "1"]));
  fireEvent.click(within(screen.getByRole("table", { name: "Match type query ledger" })).getByRole("button", { name: /^Review lead cutter/ })); expect(screen.getByText(/No Amazon campaign changes are applied here/)).toBeVisible();
});
