import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline-auth-server", () => ({
  getPipelineOrigin: () => "https://glasscopipeline.vercel.app",
  verifyPipelineRequest: vi.fn(),
}));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error {
    constructor(readonly authorizationUrl: string) { super("authorization required"); }
  }
  class ScaleInsightsConfigurationError extends Error {}
  class ScaleInsightsCampaignProviderError extends Error {
    constructor(readonly campaignCode: string, message: string) { super(message); }
  }
  return {
    getScaleInsightsCampaignSpendBaseline: vi.fn(),
    ScaleInsightsAuthorizationRequiredError,
    ScaleInsightsConfigurationError,
    ScaleInsightsCampaignProviderError,
  };
});

import {
  getScaleInsightsCampaignSpendBaseline,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { ScaleInsightsCampaignProviderError } from "@/features/dashboard/data/scale-insights-campaign-comparison";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { GET, parseCampaignComparisonQuery } from "./route";

const requestUrl = "http://localhost/ppc/api/dashboard/campaign-comparison?asin=b012345678&country=us&weekStart=2026-09-02";

describe("campaign comparison API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T01:30:00Z"));
    vi.mocked(verifyPipelineRequest).mockReset();
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "pipeline-user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    vi.mocked(getScaleInsightsCampaignSpendBaseline).mockReset();
    vi.mocked(getScaleInsightsCampaignSpendBaseline).mockImplementation(async params => ({
      asin: params.asin, country: params.country, currency: "USD", dataState: params.dataState,
      previousPeriod: { startDate: params.previousStartDate, endDate: params.previousEndDate },
      currentPeriod: { startDate: params.currentStartDate, endDate: params.currentEndDate },
      freshness: { previousDataAsOf: params.previousEndDate },
      campaigns: [], warnings: [],
    }));
  });

  afterEach(() => vi.useRealTimers());

  it("derives matched comparison days for a partial current week", async () => {
    const response = await GET(new Request(requestUrl, { headers: { Authorization: "Bearer pipeline-token" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(getScaleInsightsCampaignSpendBaseline).toHaveBeenCalledWith({
      asin: "B012345678", country: "US",
      previousStartDate: "2026-08-26", previousEndDate: "2026-08-30",
      currentStartDate: "2026-09-02", currentEndDate: "2026-09-06", dataState: "Partial",
    }, expect.objectContaining({ userId: "pipeline-user-1", issuer: "https://glasscopipeline.vercel.app" }), {
      requestId: expect.any(String),
    });
    const body = await response.json();
    expect(body.comparison.warnings).toEqual([expect.stringContaining("Matched partial comparison")]);
  });

  it("uses two full Wednesday-through-Tuesday periods for a completed week", async () => {
    vi.setSystemTime(new Date("2026-09-10T01:30:00Z"));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(200);
    expect(getScaleInsightsCampaignSpendBaseline).toHaveBeenCalledWith(expect.objectContaining({
      previousStartDate: "2026-08-26", previousEndDate: "2026-09-01",
      currentStartDate: "2026-09-02", currentEndDate: "2026-09-08", dataState: "Final",
    }), expect.anything(), { requestId: expect.any(String) });
  });

  it("normalizes and validates the query", () => {
    expect(parseCampaignComparisonQuery(new Request(requestUrl))).toEqual({ asin: "B012345678", country: "US", startDate: "2026-09-02", endDate: "2026-09-08" });
    expect(() => parseCampaignComparisonQuery(new Request(requestUrl.replace("2026-09-02", "2026-09-03")))).toThrow(/Wednesday/);
    expect(() => parseCampaignComparisonQuery(new Request(requestUrl.replace("b012345678", "bad")))).toThrow(/ASIN/);
  });

  it("authenticates before loading provider data", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(401);
    expect(getScaleInsightsCampaignSpendBaseline).not.toHaveBeenCalled();
  });

  it("returns the hosted authorization URL without caching it", async () => {
    vi.mocked(getScaleInsightsCampaignSpendBaseline).mockRejectedValue(new ScaleInsightsAuthorizationRequiredError("https://vercel.com/api/v1/connect/authorize/scl_test"));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      error: "Authorize Scale Insights to retrieve campaign comparison data.",
      authorizationRequired: true,
      authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
    });
  });

  it("uses safe errors for future weeks and provider configuration failures", async () => {
    let response = await GET(new Request(requestUrl.replace("2026-09-02", "2026-09-09")));
    expect(response.status).toBe(404);
    vi.mocked(getScaleInsightsCampaignSpendBaseline).mockRejectedValue(new ScaleInsightsConfigurationError("secret"));
    response = await GET(new Request(requestUrl));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Scale Insights is not configured for campaign comparison on this server." });
  });

  it("returns a stable provider code and correlation ID for an unsupported campaign contract", async () => {
    vi.mocked(getScaleInsightsCampaignSpendBaseline).mockRejectedValue(new ScaleInsightsCampaignProviderError(
      "campaign_capability_missing",
      "The connected Scale Insights integration does not expose campaign-level reporting.",
    ));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      error: "The connected Scale Insights integration does not expose campaign-level reporting.",
      code: "campaign_capability_missing",
      requestId: expect.any(String),
    });
  });
});
