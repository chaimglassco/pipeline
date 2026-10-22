import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
import { BRAND_CONFIG_KEY } from "../domain/ppc-audit-brand-terms";
import { AuditBrandTerms } from "./audit-brand-terms";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity: "searchterm", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Core", adGroupId: "g1", keywordId: "k1", asin: "B012345678", sku: "ROUND", target: "lead knife", query: "glassco lead knife", match: "Phrase", placement: "", strategy: "", state: "enabled", bid: 1.25, bidAvailable: true, targetMetricsAvailable: true, spend: 40, sales: 300, orders: 8, clicks: 40, impressions: 1000, ...v });
const ads = [ad(), ad({ query: "generic", spend: 60, sales: 100 }), ad({ placement: "Top of Search", spend: 10, sales: 80 })];
const audit: AuditData = { version: 1, name: "Audit", start: "2026-09-01", end: "2026-09-30", currency: "USD", importedAt: "2026-10-22", files: [], ads, business: [] };
beforeEach(() => localStorage.clear()); afterEach(cleanup);
function saveRules() { fireEvent.click(screen.getByRole("button", { name: "Configure Brand Terms" })); fireEvent.change(screen.getByRole("textbox", { name: "Primary Brand" }), { target: { value: "Glassco" } }); fireEvent.click(screen.getByRole("button", { name: "Save Brand Rules" })); }
it("renders supplied sections and an honest unconfigured state", () => {
  render(<AuditBrandTerms audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Brand Term Configuration", "Brand Dependency by ASIN", "Performance by Match Type", "Performance by Placement", "Search Term Drill-down", "Strategic Audit Findings"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled(); expect(screen.queryByText("$0")).not.toBeInTheDocument(); expect(screen.getByText(/No brand ownership is inferred/)).toBeVisible();
});
it("saves configuration, reclassifies queries and reloads device rules", async () => {
  const view = render(<AuditBrandTerms audit={audit} ads={ads} catalog={[]} />); saveRules();
  expect(screen.getByRole("status")).toHaveTextContent("Brand rules saved on this device.");
  expect(JSON.parse(localStorage.getItem(BRAND_CONFIG_KEY)!).primary).toBe("Glassco");
  expect(within(screen.getByRole("region", { name: "Brand terms portfolio metrics" })).getByText("$100")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Classification" }), { target: { value: "Brand" } }); expect(within(screen.getByRole("region", { name: "Brand terms portfolio metrics" })).getByText("$40")).toBeVisible();
  view.unmount(); render(<AuditBrandTerms audit={audit} ads={ads} catalog={[]} />); await waitFor(() => expect(screen.getByText("Rule Active", { exact: false })).toBeVisible());
  expect(screen.getByText(/Showing 2 search terms \(1 Brand \/ 1 Non-Brand\)/)).toBeVisible();
});
it("shows matched rules and actual placements without changing portfolio totals", () => {
  render(<AuditBrandTerms audit={audit} ads={ads} catalog={[]} />); saveRules();
  fireEvent.click(screen.getByRole("button", { name: /^Expand brand query glassco lead knife/ }));
  expect(screen.getByText('Matched brand rule: “Glassco”.')).toBeVisible();
  expect(within(screen.getByRole("table", { name: "Brand query placements glassco lead knife" })).getByText("$10")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Brand terms portfolio metrics" })).getByText("$100")).toBeVisible();
});
it("validates edits, applies exclusions, and supports filters and columns", () => {
  render(<AuditBrandTerms audit={audit} ads={ads} catalog={[]} />); saveRules();
  fireEvent.click(screen.getByRole("button", { name: "Edit Configuration" })); fireEvent.change(screen.getByRole("textbox", { name: "Primary Brand" }), { target: { value: "" } }); fireEvent.click(screen.getByRole("button", { name: "Save Brand Rules" })); expect(screen.getByRole("alert")).toHaveTextContent("Add a brand term.");
  fireEvent.change(screen.getByRole("textbox", { name: "Primary Brand" }), { target: { value: "Glassco" } }); fireEvent.change(screen.getByRole("textbox", { name: "Exclusions" }), { target: { value: "glassco lead" } }); fireEvent.click(screen.getByRole("button", { name: "Save Brand Rules" }));
  expect(screen.getByText(/Showing 2 search terms \(0 Brand \/ 2 Non-Brand\)/)).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), { target: { value: "Top of Search" } }); expect(within(screen.getByRole("region", { name: "Brand terms portfolio metrics" })).getByText("$10")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" })); fireEvent.click(screen.getByText("Column Settings")); fireEvent.click(screen.getByRole("checkbox", { name: "Waste" })); expect(within(screen.getByRole("table", { name: "Brand terms search term drill-down" })).queryByRole("columnheader", { name: "Waste" })).not.toBeInTheDocument();
});
