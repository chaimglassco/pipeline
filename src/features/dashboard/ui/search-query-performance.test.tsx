import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchQueryPerformance } from "./search-query-performance";
afterEach(() => vi.unstubAllGlobals());
it("renders ASIN funnel metrics, refreshes, and clears data when ASIN changes", async () => {
  const fetcher = vi.fn(async (url: string) => {
    const asin = new URL(url, "https://example.test").searchParams.get("asin");
    return { ok: true, json: async () => ({ report: { asin, country: "US", startDate: "2026-09-20", endDate: "2026-09-26", dataThrough: "2026-09-26", complete: true, rows: asin === "B0DYSBW3X5" ? [{ query: "lead came", impressions: 447, clicks: 22, cartAdds: 12, orders: 4, conversionRate: 18.18 }] : [] } }) };
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<SearchQueryPerformance asin="B0DYSBW3X5" country="US" weekStart="2026-09-23" refreshVersion={0} />);
  const table = await screen.findByRole("table", { name: "ASIN SQP metrics" });
  expect(within(table).getByRole("row", { name: "lead came 447 22 12 4 18%" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry / Refresh" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  view.rerender(<SearchQueryPerformance asin="B0DCTX18KK" country="US" weekStart="2026-09-23" refreshVersion={0} />);
  expect(screen.queryByText("lead came")).not.toBeInTheDocument();
  expect(await screen.findByText("SQP data is not available for this week yet.")).toBeVisible();
});
