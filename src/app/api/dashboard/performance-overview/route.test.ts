import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline-auth-server", () => ({ getPipelineOrigin: () => "https://glasscopipeline.vercel.app", verifyPipelineRequest: vi.fn() }));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error { constructor(readonly authorizationUrl: string) { super("authorization required") } }
  class ScaleInsightsConfigurationError extends Error {}
  return { getScaleInsightsPerformanceOverview: vi.fn(), ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError };
});

import { getScaleInsightsPerformanceOverview, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { GET, parsePerformanceOverviewQuery } from "./route";

const requestUrl = "http://localhost/ppc/api/dashboard/performance-overview?asins=b012345678,b087654321&country=us&startDate=2026-08-01&endDate=2026-09-15";

describe("performance overview API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    vi.mocked(verifyPipelineRequest).mockReset();
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "pipeline-user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    vi.mocked(getScaleInsightsPerformanceOverview).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("normalizes ASINs and validates a bounded custom range", () => {
    expect(parsePerformanceOverviewQuery(new Request(requestUrl))).toEqual({ asins: ["B012345678", "B087654321"], country: "US", startDate: "2026-08-01", endDate: "2026-09-15" });
    expect(() => parsePerformanceOverviewQuery(new Request(requestUrl.replace("2026-08-01", "2026-01-01")))).toThrow(/90 days/);
    expect(() => parsePerformanceOverviewQuery(new Request(requestUrl.replace("b012345678,b087654321", "bad")))).toThrow(/ASIN/);
  });

  it("clamps the selected range to completed data and returns a no-store DTO", async () => {
    const overview = { marker: "overview" };
    vi.mocked(getScaleInsightsPerformanceOverview).mockResolvedValue(overview as never);
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({ overview });
    expect(getScaleInsightsPerformanceOverview).toHaveBeenCalledWith(expect.objectContaining({
      asins: ["B012345678", "B087654321"], requestedStartDate: "2026-08-01", requestedEndDate: "2026-09-15", actualStartDate: "2026-08-01", actualEndDate: "2026-09-14", yesterday: "2026-09-14", sevenDayStart: "2026-09-08", fourteenDayStart: "2026-09-01",
      previousStartDate: "2026-06-17", previousEndDate: "2026-07-31",
    }), { userId: "pipeline-user-1", issuer: "https://glasscopipeline.vercel.app", callbackUrl: "http://localhost/ppc/dashboard" });
  });

  it("authenticates before querying and returns the trusted provider consent URL", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await GET(new Request(requestUrl))).status).toBe(401);
    expect(getScaleInsightsPerformanceOverview).not.toHaveBeenCalled();

    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "pipeline-user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
    vi.mocked(getScaleInsightsPerformanceOverview).mockRejectedValue(new ScaleInsightsAuthorizationRequiredError("https://vercel.com/api/v1/connect/authorize/scl_test"));
    const response = await GET(new Request(requestUrl));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ authorizationRequired: true, authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test" });
  });
});
