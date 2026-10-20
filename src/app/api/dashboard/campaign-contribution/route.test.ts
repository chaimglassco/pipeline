import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/pipeline-auth-server", () => ({ getPipelineOrigin: () => "https://glasscopipeline.vercel.app", verifyPipelineRequest: vi.fn() }));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error { constructor(readonly authorizationUrl: string) { super("authorize"); } }
  return { getScaleInsightsCampaignContribution: vi.fn(), getScaleInsightsCampaignSpendBaseline: vi.fn(), ScaleInsightsAuthorizationRequiredError, ScaleInsightsConfigurationError: class extends Error {} };
});
import { getScaleInsightsCampaignContribution } from "@/features/dashboard/data/scale-insights-server";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { GET } from "./route";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  vi.mocked(verifyPipelineRequest).mockReset().mockResolvedValue({ user: { id: "user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" } });
  vi.mocked(getScaleInsightsCampaignContribution).mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof getScaleInsightsCampaignContribution>>);
});
afterEach(() => vi.useRealTimers());
const url = "http://localhost/ppc/api/dashboard/campaign-contribution?asin=B0DCTX18KK&country=US&weekStart=2026-09-23";
it("matches the elapsed days of a partial week and disables HTTP caching", async () => {
  const result = await GET(new Request(url));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(getScaleInsightsCampaignContribution).toHaveBeenCalledWith(expect.objectContaining({ currentStartDate: "2026-09-23", currentEndDate: "2026-09-27", previousStartDate: "2026-09-16", previousEndDate: "2026-09-20", dataState: "Partial" }), expect.objectContaining({ userId: "user-1" }), expect.any(String));
});
it("authenticates before inspecting provider capabilities", async () => {
  vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
  expect((await GET(new Request(url))).status).toBe(401);
  expect(getScaleInsightsCampaignContribution).not.toHaveBeenCalled();
});
it("rejects invalid product and week scope", async () => {
  expect((await GET(new Request(url.replace("B0DCTX18KK", "bad")))).status).toBe(400);
  expect((await GET(new Request(url.replace("2026-09-23", "2026-09-24")))).status).toBe(400);
  expect(getScaleInsightsCampaignContribution).not.toHaveBeenCalled();
});
