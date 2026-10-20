import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline-auth-server", () => ({
  getPipelineOrigin: () => "https://glasscopipeline.vercel.app",
  verifyPipelineRequest: vi.fn(),
}));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error { constructor(readonly authorizationUrl: string) { super("authorization required"); } }
  class ScaleInsightsConfigurationError extends Error {}
  return { getScaleInsightsUntargetedSalesOpportunities: vi.fn(), ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError };
});

import { ScaleInsightsOpportunityProviderError } from "@/features/dashboard/data/scale-insights-untargeted-opportunities";
import { getScaleInsightsUntargetedSalesOpportunities, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { GET, parseUntargetedOpportunityQuery } from "./route";

const requestUrl = "http://localhost/ppc/api/dashboard/untargeted-opportunities?asin=b012345678&country=us&weekStart=2026-09-02";

describe("untargeted sales opportunities API", () => {
  it("returns 429 for exhausted provider quota without a success report", async () => {
    vi.mocked(getScaleInsightsUntargetedSalesOpportunities).mockRejectedValue(new ScaleInsightsOpportunityProviderError("opportunity_rate_limited", "Session quota exhausted. Try again after reset."));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "opportunity_rate_limited", error: expect.stringContaining("quota exhausted") });
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T01:30:00Z"));
    vi.mocked(verifyPipelineRequest).mockReset();
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "pipeline-user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    vi.mocked(getScaleInsightsUntargetedSalesOpportunities).mockReset();
    vi.mocked(getScaleInsightsUntargetedSalesOpportunities).mockImplementation(async params => ({
      asin: params.asin, country: params.country, currency: "USD", dataState: params.dataState,
      period: { startDate: params.startDate, endDate: params.endDate }, freshness: { searchDataAsOf: params.endDate, coverageDataAsOf: params.endDate },
      opportunities: [], warnings: [],
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("validates and normalizes the selected Wednesday week", () => {
    expect(parseUntargetedOpportunityQuery(new Request(requestUrl))).toEqual({ asin: "B012345678", country: "US", startDate: "2026-09-02", endDate: "2026-09-08" });
    expect(() => parseUntargetedOpportunityQuery(new Request(requestUrl.replace("2026-09-02", "2026-09-03")))).toThrow(/Wednesday/);
  });

  it("caps a partial week at yesterday and sends no-store", async () => {
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(getScaleInsightsUntargetedSalesOpportunities).toHaveBeenCalledWith({
      asin: "B012345678", country: "US", startDate: "2026-09-02", endDate: "2026-09-06", dataState: "Partial",
    }, expect.objectContaining({ userId: "pipeline-user-1" }), { requestId: expect.any(String) });
    expect((await response.json()).opportunities.warnings).toEqual([expect.stringContaining("Partial week")]);
  });

  it("accepts only one or twelve weeks and rechecks the twelve-week range within the authenticated connector", async () => {
    expect(() => parseUntargetedOpportunityQuery(new Request(`${requestUrl}&weeks=13`))).toThrow(/1 or 12/);
    const response = await GET(new Request(`${requestUrl}&weeks=12`));
    expect(response.status).toBe(200);
    expect(getScaleInsightsUntargetedSalesOpportunities).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-06-17", endDate: "2026-09-06", includeHistory: true, verifyCoverage: true }), expect.objectContaining({ userId: "pipeline-user-1" }), expect.objectContaining({ requestId: expect.any(String) }));
  });

  it("authenticates before loading data", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(401);
    expect(getScaleInsightsUntargetedSalesOpportunities).not.toHaveBeenCalled();
  });

  it("returns authorization and correlated provider errors without caching", async () => {
    vi.mocked(getScaleInsightsUntargetedSalesOpportunities).mockRejectedValueOnce(new ScaleInsightsAuthorizationRequiredError("https://vercel.com/api/v1/connect/authorize/scl_test"));
    let response = await GET(new Request(requestUrl));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect((await response.json()).authorizationUrl).toBe("https://vercel.com/api/v1/connect/authorize/scl_test");

    vi.mocked(getScaleInsightsUntargetedSalesOpportunities).mockRejectedValueOnce(new ScaleInsightsOpportunityProviderError("source_rows_unreadable", "Campaign attribution shape unsupported."));
    response = await GET(new Request(requestUrl));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Campaign attribution shape unsupported.", code: "source_rows_unreadable", requestId: expect.any(String) });
  });
});
