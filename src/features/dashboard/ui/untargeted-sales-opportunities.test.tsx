import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UntargetedSalesOpportunities } from "./untargeted-sales-opportunities";

function payload() {
  return {
    asin: "B012345678", country: "US", currency: "USD", dataState: "Final",
    ppcClicks: 55,
    period: { startDate: "2026-09-02", endDate: "2026-09-08" },
    freshness: { searchDataAsOf: "2026-09-09", coverageDataAsOf: "2026-09-09" }, warnings: [],
    opportunities: Array.from({ length: 11 }, (_, index) => ({
      term: index === 1 ? "B0ABCDEF12" : `search term ${index + 1}`,
      type: index === 1 ? "Product ASIN" : "Search term", sourceCampaignId: `campaign-${index + 1}`, sourceAdGroupId: `ad-group-${index + 1}`, sourceKeyword: `keyword ${index + 1}`, sourceMatchType: "broad", sales: 110 - index * 10, orders: index + 1, spend: 10, impressions: 1000 - index, clicks: 5, acos: 10 + index,
    })),
  };
}

describe("UntargetedSalesOpportunities", () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("loads with shared Refresh Data, shows converting matches, and filters without another request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => { void url; void options; return { ok: true, status: 200, json: async () => ({ opportunities: payload() }) }; });
    const onPpcClicksLoaded = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={0} onPpcClicksLoaded={onPpcClicksLoaded} />);
    const region = screen.getByRole("region", { name: "Untargeted Sales Opportunities" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(region).queryByRole("button", { name: "Load Opportunities" })).not.toBeInTheDocument();
    expect(within(region).getByText(/loads with Refresh Data/i)).toBeVisible();
    view.rerender(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={1} onPpcClicksLoaded={onPpcClicksLoaded} />);
    expect(within(region).queryByLabelText("Reporting week")).not.toBeInTheDocument();
    const table = await within(region).findByRole("table", { name: "Untargeted sales opportunities" });
    await waitFor(() => expect(onPpcClicksLoaded).toHaveBeenCalledWith({ asin: "B012345678", country: "US", weekStart: "2026-09-02", ppcClicks: 55 }));
    expect(within(table).getAllByRole("columnheader").map(header => header.querySelector("button")?.textContent ?? header.textContent)).toEqual(["", "Search Term", "Impressions", "Clicks", "Spend", "Sales", "Orders", "ACOS", "Status"]);
    expect(within(table).getByRole("columnheader", { name: /Sales/ })).toHaveAttribute("aria-sort", "descending");
    expect(fetchMock.mock.calls[0][0]).toContain("weekStart=2026-09-02");
    expect(fetchMock.mock.calls[0][0]).not.toMatch(/weeks=12|history=1/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getAllByText("Not targeted")).toHaveLength(10);
    expect(within(table).getByLabelText("Total Impressions")).toHaveTextContent("10,945");
    expect(within(table).getByLabelText("Total Clicks")).toHaveTextContent("55");
    expect(within(table).getByLabelText("Total Spend")).toHaveTextContent("$110.00");
    expect(within(table).getByLabelText("Total Sales")).toHaveTextContent("$660.00");
    expect(within(table).getByLabelText("Total Orders")).toHaveTextContent("66");
    expect(within(table).getByLabelText("Total ACOS")).toHaveTextContent("17%");
    expect(within(region).queryByText(/Filtered locally/)).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Create Bulk Campaigns" }).closest("div")?.parentElement).toHaveTextContent("11 matches");
    const sourceLink = within(table).getByRole("link", { name: "Open Scale Insights Search terms for search term 1" });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://portal.scaleinsights.com/Ads/SearchTerms/Index?from=2026-09-02&to=2026-09-08&asinList=B012345678",
    );
    expect(within(table).queryByRole("link", { name: "Create SKC campaign in Scale Insights for search term 1" })).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Create Bulk Campaigns" })).toBeDisabled();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select search term search term 1" }));
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select search term search term 3" }));
    expect(within(region).getByRole("status", { name: "2 search terms selected" })).toBeVisible();
    expect(within(region).getByRole("link", { name: "Create bulk campaigns for 2 selected search terms" })).toHaveAttribute(
      "href",
      "https://portal.scaleinsights.com/MassCampaigns/KeywordCampaigns/Customize?asin=B012345678&keyword=search+term+1%0Asearch+term+3",
    );
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select all visible search terms" }));
    expect(within(region).getByRole("status", { name: "9 search terms selected" })).toBeVisible();
    expect(within(table).getByRole("checkbox", { name: "Select all visible search terms" })).toBeChecked();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select all visible search terms" }));
    expect(within(region).getByRole("status", { name: "0 search terms selected" })).toBeVisible();
    expect(within(region).getByRole("button", { name: "Create Bulk Campaigns" })).toBeDisabled();
    fireEvent.click(sourceLink);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("search term 1"));
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(within(table).getByRole("button", { name: "Copy search term search term 1" }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(within(table).getByRole("button", { name: "Copied search term search term 1" })).toBeVisible();
    act(() => vi.advanceTimersByTime(2_000));
    expect(within(table).getByRole("button", { name: "Copy search term search term 1" })).toBeVisible();
    vi.useRealTimers();
    fireEvent.click(within(table).getByRole("button", { name: "Sort Impressions highest to lowest" }));
    expect(within(table).getByRole("columnheader", { name: /Impressions/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(table).getByRole("button", { name: "Sort Impressions lowest to highest" }));
    expect(within(table).getByRole("columnheader", { name: /Impressions/ })).toHaveAttribute("aria-sort", "ascending");
    expect(table.querySelector("tbody th")?.textContent).toContain("search term 11");
    expect(within(region).getByLabelText("Minimum PPC Sales")).toHaveValue(null);
    expect(within(region).queryByLabelText("Minimum PPC Orders")).not.toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Show all 11" }));
    expect(within(table).getByText("search term 11")).toBeVisible();
    expect(within(table).getByText("990")).toBeVisible();
    fireEvent.change(within(region).getByLabelText("Opportunity type"), { target: { value: "Product ASIN" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByLabelText("Total Impressions")).toHaveTextContent("999");
    expect(within(table).getByLabelText("Total Clicks")).toHaveTextContent("5");
    expect(within(table).getByLabelText("Total Spend")).toHaveTextContent("$10.00");
    expect(within(table).getByLabelText("Total Sales")).toHaveTextContent("$100.00");
    expect(within(table).getByLabelText("Total Orders")).toHaveTextContent("2");
    expect(within(table).getByLabelText("Total ACOS")).toHaveTextContent("10%");
    expect(within(table).getByRole("link", { name: "B0ABCDEF12" })).toHaveAttribute("href", "https://www.amazon.com/dp/B0ABCDEF12");
    expect(within(table).queryByRole("link", { name: /Create .* campaign in Scale Insights for B0ABCDEF12/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(region).queryByRole("button", { name: "Fetch Again" })).not.toBeInTheDocument();
  });

  it("restores the latest validated result and refreshes it only on a new shared request", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => { void url; void options; return { ok: true, status: 200, json: async () => ({ opportunities: payload() }) }; });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    view.rerender(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={1} />);
    await screen.findByRole("table", { name: "Untargeted sales opportunities" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    await screen.findByRole("table", { name: "Untargeted sales opportunities" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    cleanup();
    const refreshed = render(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={0} />);
    refreshed.rerender(<UntargetedSalesOpportunities asin="B012345678" weekStart="2026-09-02" refreshVersion={2} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
