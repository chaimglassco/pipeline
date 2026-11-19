import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuditWastedSpend } from "./audit-wasted-spend";
import { type AuditAd, type AuditData } from "../domain/ppc-audit";
const ad = (changes: Partial<AuditAd> = {}): AuditAd => ({ entity: "searchterm", type: "SP", campaign: "Main", campaignId: "1", adGroup: "Group", asin: "B012345678", sku: "ROUND", target: "glass", query: "glass", match: "Broad", placement: "", strategy: "", state: "enabled", bid: 1, spend: 30, sales: 0, orders: 0, clicks: 20, impressions: 1000, ...changes });
// A keyword with no orders, two search terms without orders, and one that sold at 50% ACOS.
const ads = [ad({ entity: "keyword", query: "", spend: 90 }), ad(), ad({ query: "lead strips", spend: 8, clicks: 3 }), ad({ query: "came", campaign: "Other", campaignId: "2", asin: "B012345679", spend: 50, sales: 100, orders: 3 })];
const audit: AuditData = { version: 1, name: "Test", importedAt: "2026-10-16", start: "2026-09-01", end: "2026-09-30", currency: "USD", files: [], business: [], ads, wasteRules: { groups: [{ maxOrders: 0, minClicks: 10 }], highAcos: 40 } };
const catalog = [{ asin: "B012345678", sku: "ROUND", name: "Round came" }];
beforeEach(() => { localStorage.clear(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
// The search term, campaign and ASIN lists are tabs; Search Terms is the one shown first.
const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: /^Search Terms/ }));
it("shows the supplied waste layout before import without sample metrics", () => {
  render(<AuditWastedSpend audit={null} ads={[]} catalog={[]} />);
  for (const name of ["Waste by ASIN", "Waste by Campaign", "Waste by Match Type", "Search Term Waste Details"]) expect(screen.getByRole("heading", { name })).toBeVisible();
  for (const name of [/^Search Terms/, /^Campaigns/, /^ASINs/]) expect(screen.getByRole("tab", { name })).toBeVisible();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
});
it("counts only search terms that meet the import rules and flags High ACOS apart", () => {
  render(<AuditWastedSpend audit={audit} ads={ads} catalog={catalog} />);
  openDetails();
  const table = screen.getByRole("table", { name: "Search Term Waste Details" });
  // "glass" is waste; "came" is High ACOS; the keyword and the 3-click term are not listed.
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(within(table).queryByText("lead strips")).not.toBeInTheDocument();
  expect(screen.getByText("$30", { selector: "div" })).toBeVisible();
  expect(screen.getByText("1 search terms above 40% ACOS")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Reason" }), { target: { value: "High ACOS" } });
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(table).getByText("came")).toBeVisible();
});
it("edits the shared rules from Audit Rules and rejects bad values", () => {
  const onRulesChange = vi.fn();
  render(<AuditWastedSpend audit={audit} ads={ads} catalog={catalog} onRulesChange={onRulesChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Audit Rules" }));
  const dialog = screen.getByRole("dialog");
  // Saved rules open collapsed, showing the written rule.
  expect(within(dialog).queryByLabelText("Clicks at least")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: /Rule 1 Orders ≤ 0 AND Clicks ≥ 10/ }));
  expect(within(dialog).getByLabelText("Clicks at least")).toHaveValue("10");
  fireEvent.change(within(dialog).getByLabelText("Clicks at least"), { target: { value: "-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Settings" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Rule 1 · Clicks at least");
  fireEvent.change(within(dialog).getByLabelText("Clicks at least"), { target: { value: "" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add rule" }));
  fireEvent.change(within(screen.getByRole("region", { name: "Rule 2" })).getByLabelText("ACOS at least (%)"), { target: { value: "80" } });
  expect(within(dialog).getByRole("radio", { name: "OR" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(within(dialog).getByRole("radio", { name: "AND" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Settings" }));
  expect(onRulesChange).toHaveBeenCalledWith({ groups: [{ maxOrders: 0 }, { minAcos: 80, join: "and" }], highAcos: 40 });
});
it("asks for rules when the audit has none", () => {
  render(<AuditWastedSpend audit={{ ...audit, wasteRules: undefined }} ads={ads} catalog={catalog} />);
  openDetails();
  expect(screen.getByText("No wasted spend rules are set for this audit. Use the gear icon or Audit Rules to choose them.")).toBeVisible();
  expect(within(screen.getByRole("table", { name: "Search Term Waste Details" })).getAllByRole("row")).toHaveLength(1);
});
it("saves manual review marks across reload and isolates another import", async () => {
  const view = render(<AuditWastedSpend audit={audit} ads={ads} catalog={catalog} />);
  openDetails();
  fireEvent.change(screen.getByLabelText("Status for glass in Main Group"), { target: { value: "Reviewed" } });
  expect(screen.getByText("Saved on this device")).toBeVisible();
  view.unmount();
  const second = render(<AuditWastedSpend audit={audit} ads={ads} catalog={catalog} />);
  openDetails();
  await waitFor(() => expect(screen.getByLabelText("Status for glass in Main Group")).toHaveValue("Reviewed"));
  second.unmount();
  render(<AuditWastedSpend audit={{ ...audit, importedAt: "another-import" }} ads={ads} catalog={catalog} />);
  openDetails();
  await waitFor(() => expect(screen.getByLabelText("Status for glass in Main Group")).toHaveValue("Open"));
});
