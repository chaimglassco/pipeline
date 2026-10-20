import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PPC_CAMPAIGN_CSV_CACHE_KEY } from "../domain/campaign-comparison-csv";
import { CampaignWeeklyComparison } from "./campaign-weekly-comparison";

const header = "Type,Campaign,Orders,Sales,Spent,CampaignId\r\n";

function csvFile(name: string, rows: string) {
  const file = new File([`${header}${rows}`], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => `${header}${rows}` });
  return file;
}

describe("CampaignWeeklyComparison CSV import", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows two exact weekly CSV slots when no saved comparison exists", async () => {
    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    const region = screen.getByRole("region", { name: "Campaign Week-over-Week Comparison" });
    expect(await within(region).findByLabelText("Previous week campaign CSV")).toBeVisible();
    expect(within(region).getByText("Aug 26, 2026 – Sep 1, 2026")).toBeVisible();
    expect(within(region).getByText("Sep 2, 2026 – Sep 8, 2026")).toBeVisible();
    expect(within(region).getByRole("button", { name: "Import comparison" })).toBeDisabled();
  });

  it("imports, classifies, renders, and saves joined campaigns locally", async () => {
    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    const previous = csvFile("Aug 26 - Sept 1.csv", [
      "SP Manual,Good up,1,50,10,111",
      "SP Manual,New high,0,0,0,222",
      "SP Manual,Lost sales,2,100,20,333",
      "SP Auto,Flat,1,50,10,444",
      "SP Manual,Wasted spend,0,0,10,555",
      "SP Manual,Good high spend,1,10,100,666",
    ].join("\r\n"));
    const current = csvFile("Sept 2 - 8.csv", [
      "SP Manual,Good up,2,80,20,111",
      "SP Manual,New high,1,100,15,222",
      "SP Auto,Flat,1,50,10,444",
      "SP Manual,Wasted spend,0,0,5,555",
      "SP Manual,Good high spend,2,20,110,666",
    ].join("\r\n"));
    fireEvent.change(await screen.findByLabelText("Previous week campaign CSV"), { target: { files: [previous] } });
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [current] } });
    fireEvent.click(screen.getByRole("button", { name: "Import comparison" }));

    expect(await screen.findByText("Good up")).toBeInTheDocument();
    expect(screen.getByText("New high")).toBeInTheDocument();
    expect(screen.getByText("Lost sales")).toBeInTheDocument();
    expect(screen.getByText("Flat")).toBeInTheDocument();
    expect(screen.getByText("Wasted spend")).toBeInTheDocument();
    expect(screen.getByText("Good high spend")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Spend Up, Sales Up campaigns" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Spend but No Sales This Week campaigns" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "New Spend, High ACOS campaigns" })).toBeInTheDocument();
    expect(screen.queryByText("Lost Current-Week Sales")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Unchanged or Mixed campaigns" })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(PPC_CAMPAIGN_CSV_CACHE_KEY) || "{}");
    expect(stored.entries["US:B012345678:2026-09-02"].comparison.campaigns).toHaveLength(6);
  });

  it("sorts every dropdown independently by its metric headers", async () => {
    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    const previous = csvFile("Aug 26 - Sept 1.csv", [
      "SP Manual,Lower current spend,1,50,10,111",
      "SP Manual,Higher current spend,1,60,100,222",
    ].join("\r\n"));
    const current = csvFile("Sept 2 - 8.csv", [
      "SP Manual,Lower current spend,2,100,20,111",
      "SP Manual,Higher current spend,2,70,110,222",
    ].join("\r\n"));
    fireEvent.change(await screen.findByLabelText("Previous week campaign CSV"), { target: { files: [previous] } });
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [current] } });
    fireEvent.click(screen.getByRole("button", { name: "Import comparison" }));

    const table = await screen.findByRole("table", { name: "Spend Up, Sales Up campaigns" });
    const names = () => within(table).getAllByRole("row").slice(1).map(row => within(row).getByRole("rowheader").textContent);
    expect(names()[0]).toContain("Lower current spend");
    fireEvent.click(within(table).getByRole("button", { name: "Sort Current Spend highest to lowest" }));
    expect(within(table).getByRole("columnheader", { name: /Current Spend/ })).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toContain("Higher current spend");
    fireEvent.click(within(table).getByRole("button", { name: "Sort Current Spend lowest to highest" }));
    expect(within(table).getByRole("columnheader", { name: /Current Spend/ })).toHaveAttribute("aria-sort", "ascending");
    expect(names()[0]).toContain("Lower current spend");
  });

  it("rejects a filename whose recognizable range does not match its weekly slot", async () => {
    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    fireEvent.change(await screen.findByLabelText("Previous week campaign CSV"), { target: { files: [csvFile("July 26 - Sept. 1.csv", "SP Manual,Campaign,1,10,2,111")] } });
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [csvFile("Sept. 2 - 8.csv", "SP Manual,Campaign,1,10,2,111")] } });
    fireEvent.click(screen.getByRole("button", { name: "Import comparison" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("appears to cover Jul 26, 2026 – Sep 1, 2026");
    expect(window.localStorage.getItem(PPC_CAMPAIGN_CSV_CACHE_KEY)).toBeNull();
  });

  it("restores a validated comparison after remounting", async () => {
    const view = render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    fireEvent.change(await screen.findByLabelText("Previous week campaign CSV"), { target: { files: [csvFile("Aug 26 - Sept 1.csv", "SP Manual,Campaign,1,10,2,111")] } });
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [csvFile("Sept 2 - 8.csv", "SP Manual,Campaign,2,20,3,111")] } });
    fireEvent.click(screen.getByRole("button", { name: "Import comparison" }));
    await screen.findByRole("button", { name: "Replace CSVs" });
    view.unmount();
    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={1} />);
    expect(await screen.findByRole("button", { name: "Replace CSVs" })).toBeVisible();
    expect(screen.queryByLabelText("Previous week campaign CSV")).not.toBeInTheDocument();
  });

  it("reuses the prior imported current week for the next comparison", async () => {
    const first = render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    fireEvent.change(await screen.findByLabelText("Previous week campaign CSV"), { target: { files: [csvFile("Aug 26 - Sept 1.csv", "SP Manual,Campaign,1,10,2,111")] } });
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [csvFile("Sept 2 - 8.csv", "SP Manual,Campaign,2,20,3,111")] } });
    fireEvent.click(screen.getByRole("button", { name: "Import comparison" }));
    await screen.findByRole("button", { name: "Replace CSVs" });
    first.unmount();

    render(<CampaignWeeklyComparison asin="B012345678" weekStart="2026-09-09" refreshVersion={0} />);
    const reused = await screen.findByLabelText("Reused previous week campaign CSV");
    expect(reused).toHaveTextContent("Sep 2, 2026 – Sep 8, 2026");
    expect(reused).toHaveTextContent("Sept 2 - 8.csv");
    expect(screen.queryByLabelText("Previous week campaign CSV")).not.toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: "Import comparison" });
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Current week campaign CSV"), { target: { files: [csvFile("Sept 9 - 15.csv", "SP Manual,Campaign,3,30,4,111")] } });
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);

    expect((await screen.findAllByText("Campaign")).length).toBeGreaterThan(0);
    const stored = JSON.parse(window.localStorage.getItem(PPC_CAMPAIGN_CSV_CACHE_KEY) || "{}");
    expect(stored.entries["US:B012345678:2026-09-09"].previousFileName).toBe("Sept 2 - 8.csv");
    expect(stored.entries["US:B012345678:2026-09-09"].comparison.campaigns[0]).toMatchObject({ previous: { spend: 3, sales: 20, orders: 2 }, current: { spend: 4, sales: 30, orders: 3 } });
  });
});
