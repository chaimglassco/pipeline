import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline-auth-server", () => ({
  getPipelineOrigin: () => "https://glasscopipeline.vercel.app",
  verifyPipelineRequest: vi.fn(),
}));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error {
    constructor(readonly authorizationUrl: string) {
      super("authorization required");
    }
  }
  class ScaleInsightsConfigurationError extends Error {}
  return { getScaleInsightsWeeklyPerformance: vi.fn(), ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError };
});

import {
  getScaleInsightsWeeklyPerformance,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "@/features/dashboard/data/scale-insights-server";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { GET, parsePerformanceQuery } from "./route";

const requestUrl = "http://localhost/ppc/api/dashboard/performance?asin=b0fg4h5c6w&country=us&weekStart=2026-08-26";

describe("PPC dashboard performance API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T01:30:00Z"));
    vi.mocked(verifyPipelineRequest).mockReset();
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "pipeline-user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    vi.mocked(getScaleInsightsWeeklyPerformance).mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("requests only completed days for the current week and labels the actual coverage", async () => {
    vi.mocked(getScaleInsightsWeeklyPerformance).mockImplementation(async params => ({
      ...params, currency: "USD",
      metrics: { spend: 30.37, ppcSales: 271.87, ppcOrders: 9, totalSales: 944.55, totalOrders: 39, organicSales: 672.68, organicOrders: 30, acos: 11.17, tacos: 3.22 },
      freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: params.endDate },
      warnings: [],
    }));
    const response = await GET(new Request(requestUrl.replace("2026-08-26", "2026-09-02")));
    expect(response.status).toBe(200);
    expect(getScaleInsightsWeeklyPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-09-02", endDate: "2026-09-06" }), expect.anything(),
    );
    const { performance } = await response.json();
    expect(performance.endDate).toBe("2026-09-06");
    expect(performance.metrics.spend).toBe(30.37);
    expect(performance.warnings).toEqual(["Partial week: actual metrics cover 2026-09-02 through 2026-09-06. Today and future days are excluded."]);
  });

  it("does not request a week with no completed days, including Wednesday and future weeks", async () => {
    vi.setSystemTime(new Date("2026-09-02T23:59:59Z"));
    for (const weekStart of ["2026-09-02", "2026-09-09"]) {
      const response = await GET(new Request(requestUrl.replace("2026-08-26", weekStart)));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toEqual({ error: expect.stringContaining("no completed days yet") });
    }
    expect(getScaleInsightsWeeklyPerformance).not.toHaveBeenCalled();
  });

  it("normalizes a bounded Wednesday-through-Tuesday query", () => {
    expect(parsePerformanceQuery(new Request(requestUrl))).toEqual({
      asin: "B0FG4H5C6W",
      country: "US",
      startDate: "2026-08-26",
      endDate: "2026-09-01",
    });
    expect(() => parsePerformanceQuery(new Request(requestUrl.replace("2026-08-26", "2026-08-27")))).toThrow(/Wednesday/);
    expect(() => parsePerformanceQuery(new Request(requestUrl.replace("b0fg4h5c6w", "bad")))).toThrow(/ASIN/);
  });

  it("authenticates before returning a minimal no-store performance DTO", async () => {
    const performance = {
      asin: "B0FG4H5C6W", country: "US", startDate: "2026-08-26", endDate: "2026-09-01", currency: "USD",
      metrics: { spend: 81.75, ppcSales: 481.75, ppcOrders: 23, totalSales: 1317.35, totalOrders: 59, organicSales: 835.6, organicOrders: 36, acos: 16.97, tacos: 6.21 },
      freshness: { adsDataAsOf: "ads", salesDataAsOf: "sales", salesDataThrough: "2026-09-01" }, warnings: [],
    };
    vi.mocked(getScaleInsightsWeeklyPerformance).mockResolvedValue(performance);

    const response = await GET(new Request(requestUrl, { headers: { Authorization: "Bearer pipeline-token" } }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({ performance });
    expect(verifyPipelineRequest).toHaveBeenCalledOnce();
    expect(getScaleInsightsWeeklyPerformance).toHaveBeenCalledWith(
      { asin: "B0FG4H5C6W", country: "US", startDate: "2026-08-26", endDate: "2026-09-01" },
      {
        userId: "pipeline-user-1",
        issuer: "https://glasscopipeline.vercel.app",
        callbackUrl: "http://localhost/ppc/dashboard",
      },
    );
  });

  it("does not query Scale Insights when Pipeline authentication fails", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(401);
    expect(getScaleInsightsWeeklyPerformance).not.toHaveBeenCalled();
  });

  it("requires a stable server-verified Pipeline user id", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(503);
    expect(getScaleInsightsWeeklyPerformance).not.toHaveBeenCalled();
  });

  it("returns only the hosted consent URL when the verified user needs authorization", async () => {
    vi.mocked(getScaleInsightsWeeklyPerformance).mockRejectedValue(
      new ScaleInsightsAuthorizationRequiredError("https://vercel.com/api/v1/connect/authorize/scl_test"),
    );
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      error: "Authorize Scale Insights to retrieve weekly performance.",
      authorizationRequired: true,
      authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
    });
  });

  it("returns a safe configuration error without leaking credential details", async () => {
    vi.mocked(getScaleInsightsWeeklyPerformance).mockRejectedValue(new ScaleInsightsConfigurationError("secret name"));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Scale Insights is not configured on this server." });
  });
});
