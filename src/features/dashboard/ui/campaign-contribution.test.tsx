import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignContribution } from "./campaign-contribution";
import { analyzeCampaignContribution, CAMPAIGN_ATTRIBUTION_UNAVAILABLE } from "../domain/campaign-contribution";
vi.mock("@/lib/pipeline-session", () => ({ getPipelineAuthorizationHeader: () => ({}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows the exact provider limitation without fabricated metrics", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ analysis: { asin: "B0DCTX18KK", country: "US", currentStartDate: "2026-09-23", currentEndDate: "2026-09-29", previousStartDate: "2026-09-16", previousEndDate: "2026-09-22", checkedAt: "2026-10-01T00:00:00Z", state: "unavailable", warning: CAMPAIGN_ATTRIBUTION_UNAVAILABLE, summary: null, campaigns: [], reconciliation: [] } }) }));
  render(<CampaignContribution asin="B0DCTX18KK" productName="Round U" weekStart="2026-09-23" refreshVersion={1} />);
  expect(await screen.findByText(CAMPAIGN_ATTRIBUTION_UNAVAILABLE)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("renders native values and filters CPC pressure without using search terms", async () => {
  const prior = { impressions: 100, clicks: 10, spend: 10, sales: 100, orders: 2 }, current = { impressions: 50, clicks: 5, spend: 20, sales: 100, orders: 2 };
  const analysis = analyzeCampaignContribution({ asin: "B0DCTX18KK", country: "US", productName: "Round U", currency: "USD", previous: { startDate: "2026-09-16", endDate: "2026-09-22", complete: true, campaigns: [{ ...prior, campaignId: "1", campaignName: "Native Campaign" }], asinTotals: prior }, current: { startDate: "2026-09-23", endDate: "2026-09-29", complete: true, campaigns: [{ ...current, campaignId: "1", campaignName: "Native Campaign" }], asinTotals: current } });
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ analysis }) });
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignContribution asin="B0DCTX18KK" productName="Round U" weekStart="2026-09-23" refreshVersion={2} />);
  expect(await screen.findByRole("table", { name: "Campaign contribution metrics" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Campaign filter"), { target: { value: "Spend and CPC increased" } });
  expect(screen.getByText("CPC pressure")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Campaign filter"), { target: { value: "New campaigns" } });
  expect(screen.getByText("No campaigns match this filter.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry / Refresh" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});
