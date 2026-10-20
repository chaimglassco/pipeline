import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY } from "../domain/account-campaign-compare";
import { AccountCampaignCompare } from "./account-campaign-compare";

const header = "Type,Campaign,Orders,Sales,Spent,CampaignId\r\n";

function csvFile(name: string, rows: string) {
  const file = new File([`${header}${rows}`], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => `${header}${rows}` });
  return file;
}

describe("AccountCampaignCompare", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("imports account CSVs and displays one selected Spend movement at a time", async () => {
    render(<AccountCampaignCompare todayIso="2026-09-21" />);
    const main = screen.getByRole("main", { name: "Campaign Spend Comparison" });
    const previous = csvFile("previous.csv", "SP Manual,Existing,1,10,10,1\r\nSP Manual,Stopped,1,10,5,2");
    const current = csvFile("current.csv", "SP Manual,Existing,1,20,20,1\r\nSP Manual,New,1,10,4,3");
    fireEvent.change(within(main).getByLabelText("Previous period account campaign CSV"), { target: { files: [previous] } });
    fireEvent.change(within(main).getByLabelText("Current period account campaign CSV"), { target: { files: [current] } });
    fireEvent.click(within(main).getByRole("button", { name: "Import comparison" }));

    expect(await within(main).findByText("Existing")).toBeInTheDocument();
    expect(within(main).getAllByText("New").length).toBeGreaterThan(0);
    expect(within(main).getAllByText("Spend Up, Sales Up").length).toBeGreaterThan(0);
    expect(within(main).getAllByText("New Spend, High ACOS").length).toBeGreaterThan(0);
    expect(within(main).getByRole("columnheader", { name: /Current Sales/ })).toBeInTheDocument();
    expect(within(main).getByRole("columnheader", { name: /Current ACOS/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY) || "{}").version).toBe(1);

    fireEvent.click(within(main).getByRole("button", { name: /Spend Up, Sales Up/ }));
    const table = within(main).getByRole("table", { name: "Account campaign Spend comparison" });
    expect(within(table).getByText("Existing")).toBeInTheDocument();
    expect(within(table).queryByText("New")).not.toBeInTheDocument();
    expect(within(table).queryByText("Stopped Spending")).not.toBeInTheDocument();
  });

  it("supports weekly and monthly period controls and sortable Spend columns", () => {
    render(<AccountCampaignCompare todayIso="2026-09-21" />);
    const main = screen.getByRole("main", { name: "Campaign Spend Comparison" });
    fireEvent.change(within(main).getByRole("combobox", { name: "Comparison period" }), { target: { value: "week" } });
    expect(within(main).getAllByText("Sep 2, 2026 – Sep 8, 2026").length).toBeGreaterThan(0);
    fireEvent.change(within(main).getByRole("combobox", { name: "Comparison period" }), { target: { value: "month" } });
    expect(within(main).getByDisplayValue("2026-08")).toBeInTheDocument();
  });
});
