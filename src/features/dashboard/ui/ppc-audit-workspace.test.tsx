import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PpcAuditWorkspace } from "./ppc-audit-workspace";
vi.mock("../data/ppc-audit-files", () => ({ readAuditFile: vi.fn(async (file: File) => file.name.includes("business") ? [{ name: "Business", rows: [["(Child) ASIN", "Ordered Product Sales", "Total Order Items"], ["B012345678", "500", "12"]] }] : [{ name: "Sponsored Products", rows: [["Product", "Entity", "Campaign Name", "Ad Group Name", "ASIN", "Keyword Text", "Match Type", "Spend", "Sales", "Orders", "Clicks", "Impressions"], ["SP", "Campaign", "Test Campaign", "", "", "", "", "20", "100", "4", "10", "1000"], ["SP", "Product Ad", "Test Campaign", "Main", "B012345678", "", "", "20", "100", "4", "10", "1000"], ["SP", "Keyword", "Test Campaign", "Main", "B012345678", "lead came", "Exact", "20", "100", "4", "10", "1000"]] }]) }));
beforeEach(() => localStorage.clear());
it("opens all fourteen modules and imports, saves, and reloads a real calculated audit", async () => {
  const view = render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />);
  expect(within(screen.getByRole("navigation", { name: "Audit modules" })).getAllByRole("button")).toHaveLength(14);
  expect(within(screen.getByRole("navigation", { name: "Audit modules" })).getAllByRole("button").map(button => button.textContent).slice(0, 4)).toEqual(["Performance Summary", "Wasted Ad Spend", "Opportunities", "Advertised ASIN"]);
  expect(screen.queryByRole("button", { name: "New Audit" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Upload Reports" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PPC Report" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Business Report" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("PPC Report file"), { target: { files: [new File(["test"], "bulk_20260901_20260930.csv")] } });


  const dialog = screen.getByRole("dialog", { name: "Create PPC Audit" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Run Audit" })).toBeEnabled());
  expect(within(dialog).getByRole("status")).toHaveTextContent("Dates detected from file name");
  for (const label of ["Start date", "End date", "Report currency"]) {
    expect(within(dialog).queryByLabelText(label)).not.toBeInTheDocument();
  }
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(within(screen.getByRole("table", { name: "ASIN Performance Overview" })).getByText("$20")).toBeVisible());
  const table = screen.getByRole("table", { name: "ASIN Performance Overview" });
  expect(within(table).getByText("20%")).toBeVisible();
  expect(screen.getByText(/Saved on this device/)).toBeVisible();
  const cached = JSON.parse(localStorage.getItem("glassco.ppcUploadedAudit.v1")!);
  expect(cached).toMatchObject({ start: "2026-09-01", end: "2026-09-30", currency: "USD" });
  expect(cached.ads).toHaveLength(3);
  expect(cached.files).toEqual(["bulk_20260901_20260930.csv"]);
  expect(cached.business).toEqual([]);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Search Terms" }));
  expect(screen.getByRole("heading", { name: "Search Term Portfolio" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Search Term Performance" })).toBeVisible();
  expect(screen.getByText("No search terms match this scope. Check the filters and report contents.")).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Campaign Type" }));
  expect(within(screen.getByRole("table", { name: "Campaign Type Efficiency Breakdown" })).getAllByText("$100")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Expand type campaign Test Campaign SP Test Campaign" }));
  fireEvent.click(screen.getByRole("button", { name: "View Full Campaign Analysis →" }));
  expect(screen.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Key Target & Search Term Signals" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Keyword Target" }));
  expect(within(screen.getByRole("table", { name: "Keyword Target Performance" })).getByText("lead came")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Keyword portfolio metrics" })).getByText("$20")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Expand keyword lead came Test Campaign Main B012345678 Exact" }));
  expect(screen.getByText("Uniquely linked search-term data was not supplied.")).toBeVisible();
  expect(screen.getByText("Keyword-level placement data was not supplied.")).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Product Target" }));
  expect(screen.getByRole("heading", { name: "Product Target" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Target Type Performance" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Product Target Performance" })).toBeVisible();
  expect(screen.getByText("No product targets match this scope. Check the filters and report contents.")).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Match Type" }));
  expect(screen.getByRole("heading", { name: "Match Type" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "ASIN Performance by Match Type" })).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Match type portfolio metrics" })).getByText("$20")).toBeVisible();
  expect(screen.getByRole("table", { name: "Match type query ledger" })).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Brand Terms" }));
  expect(screen.getByRole("heading", { name: "Brand Terms" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Brand Dependency by ASIN" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Brand terms search term drill-down" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Configure Brand Terms" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Brand Rules" }));
  expect(JSON.parse(localStorage.getItem("glassco.ppcBrandTerms.v1")!).primary).toBe("Glassco");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Duplicated Targets" }));
  expect(screen.getByRole("table", { name: "Duplicate group performance" })).toBeVisible();
  expect(screen.getByText("No duplicate target groups match this scope.")).toBeVisible();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Audit modules" })).getByRole("button", { name: "Bidding Strategy" }));
  expect(screen.getByRole("table", { name: "Campaign bidding strategy performance" })).toBeVisible();
  expect(within(screen.getByRole("region", { name: "Bidding strategy portfolio metrics" })).getByText("$100")).toBeVisible();
  view.unmount();
  render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />);
  await waitFor(() => expect(screen.getByRole("table", { name: "ASIN Performance Overview" })).toBeVisible());
});

it("imports without rules, then sets them from the gear settings with tabs", async () => {
  const view = within(render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />).container);
  expect(view.getByRole("button", { name: "Audit settings" })).toBeDisabled();
  fireEvent.change(view.getByLabelText("PPC Report file"), { target: { files: [new File(["test"], "bulk.csv")] } });
  const dialog = view.getByRole("dialog", { name: "Create PPC Audit" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Run Audit" })).toBeEnabled());
  expect(within(dialog).queryByLabelText("Clicks at least")).not.toBeInTheDocument();
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(view.queryByRole("dialog")).not.toBeInTheDocument());
  expect(view.getByText("No wasted spend rules set. Use the gear icon to choose them.")).toBeVisible();
  fireEvent.click(view.getByRole("button", { name: "Audit settings" }));
  let settings = view.getByRole("dialog", { name: "Audit Settings" });
  expect(within(settings).getByRole("tab", { name: "Wasted Ad Spend" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(within(settings).getByLabelText("Clicks at least"), { target: { value: "2.5" } });
  fireEvent.click(within(settings).getByRole("tab", { name: "High ACOS" }));
  fireEvent.change(within(settings).getByLabelText("Min ACOS (%)"), { target: { value: "40" } });
  fireEvent.click(within(settings).getByRole("button", { name: "Save Settings" }));
  // The bad value sends you back to its tab.
  expect(within(settings).getByRole("alert")).toHaveTextContent("Clicks at least: enter a whole number");
  expect(within(settings).getByRole("tab", { name: "Wasted Ad Spend" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(within(settings).getByLabelText("Clicks at least"), { target: { value: "" } });
  fireEvent.change(within(settings).getByLabelText("Orders at most"), { target: { value: "0" } });
  fireEvent.click(within(settings).getByRole("button", { name: "Save Settings" }));
  expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(JSON.parse(localStorage.getItem("glassco.ppcUploadedAudit.v1")!).wasteRules).toEqual({ groups: [{ maxOrders: 0 }], highAcos: 40 }));
  expect(view.getByRole("list", { name: "Affected by wasted spend" })).toBeVisible();
  fireEvent.click(view.getByRole("button", { name: "Audit settings" }));
  settings = view.getByRole("dialog", { name: "Audit Settings" });
  expect(within(settings).getByRole("button", { name: /Rule 1 Orders ≤ 0/ })).toHaveAttribute("aria-expanded", "false");
});

it("adds a Business Report to the current audit and shows total and organic sales", async () => {
  const view = within(render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />).container);
  fireEvent.change(view.getByLabelText("PPC Report file"), { target: { files: [new File(["test"], "bulk.csv")] } });
  const dialog = view.getByRole("dialog", { name: "Create PPC Audit" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Run Audit" })).toBeEnabled());
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(view.getByRole("button", { name: "Business Report" })).toBeEnabled());
  expect(view.queryByRole("heading", { name: "Total sales" })).not.toBeInTheDocument();
  fireEvent.change(view.getByLabelText("Business Report file"), { target: { files: [new File(["test"], "business.csv")] } });
  expect(await view.findByRole("heading", { name: "Total sales" })).toBeVisible();
  expect(view.getByText("Business Report", { selector: "summary" }).closest("summary")).toHaveAccessibleName("Business Report loaded: business.csv");
  // $500 total sales, $100 from ads, so $400 organic.
  expect(view.getAllByText("$400").length).toBeGreaterThan(0);
  await waitFor(() => expect(JSON.parse(localStorage.getItem("glassco.ppcUploadedAudit.v1")!).files).toEqual(["bulk.csv", "business.csv"]));
});

it("shows a readable error for a file that is not a Business Report", async () => {
  const view = within(render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />).container);
  fireEvent.change(view.getByLabelText("PPC Report file"), { target: { files: [new File(["test"], "bulk.csv")] } });
  const dialog = view.getByRole("dialog", { name: "Create PPC Audit" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Run Audit" })).toBeEnabled());
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(view.getByRole("button", { name: "Business Report" })).toBeEnabled());
  fireEvent.change(view.getByLabelText("Business Report file"), { target: { files: [new File(["test"], "other.csv")] } });
  expect(await view.findByRole("alert")).toHaveTextContent(/^Business Report: Upload the Detail Page Sales and Traffic by Child Item/);
});

it("shows loaded files and removes the Business Report, then the whole audit", async () => {
  const view = within(render(<PpcAuditWorkspace todayIso="2026-10-15" catalog={[]} />).container);
  fireEvent.change(view.getByLabelText("PPC Report file"), { target: { files: [new File(["test"], "bulk.csv")] } });
  const dialog = view.getByRole("dialog", { name: "Create PPC Audit" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Run Audit" })).toBeEnabled());
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(view.getByRole("button", { name: "Business Report" })).toBeEnabled());
  fireEvent.change(view.getByLabelText("Business Report file"), { target: { files: [new File(["test"], "business.csv")] } });
  const businessMenu = await view.findByRole("menu", { name: "Business Report file", hidden: true });
  expect(within(businessMenu).getByText("business.csv")).toBeInTheDocument();
  fireEvent.click(within(businessMenu).getByRole("menuitem", { name: "Remove file", hidden: true }));
  expect(await view.findByRole("button", { name: "Business Report" })).toBeEnabled();
  expect(view.queryByRole("heading", { name: "Total sales" })).not.toBeInTheDocument();
  const ppcMenu = view.getByRole("menu", { name: "PPC Report file", hidden: true });
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  fireEvent.click(within(ppcMenu).getByRole("menuitem", { name: "Remove file", hidden: true }));
  expect(view.getByRole("menu", { name: "PPC Report file", hidden: true })).toBeInTheDocument();
  fireEvent.click(within(ppcMenu).getByRole("menuitem", { name: "Remove file", hidden: true }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(await view.findByRole("button", { name: "PPC Report" })).toBeEnabled();
  expect(view.getByText("Upload a PPC Report to start an audit")).toBeVisible();
  await waitFor(() => expect(localStorage.getItem("glassco.ppcUploadedAudit.v1")).toBeNull());
  confirm.mockRestore();
});
