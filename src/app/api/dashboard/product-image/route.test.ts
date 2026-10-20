import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/pipeline-auth-server", () => ({ verifyPipelineRequest: vi.fn(), getPipelineOrigin: () => "https://glasscopipeline.vercel.app" }));
vi.mock("@/features/dashboard/data/scale-insights-server", () => ({ withScaleInsightsClient: vi.fn(), ScaleInsightsAuthorizationRequiredError: class extends Error {} }));
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { withScaleInsightsClient } from "@/features/dashboard/data/scale-insights-server";
import { GET } from "./route";
const request = () => new Request("http://localhost/ppc/api/dashboard/product-image?asin=b0fg4h5c6w");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "user-1", email: "test@example.com", name: "Test", role: "USER" } });
});
it("requires authentication before contacting Scale Insights", async () => {
  vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
  expect((await GET(request())).status).toBe(401);
  expect(withScaleInsightsClient).not.toHaveBeenCalled();
});
it("validates the ASIN before contacting Scale Insights", async () => {
  expect((await GET(new Request("http://localhost/ppc/api/dashboard/product-image?asin=invalid"))).status).toBe(400);
  expect(withScaleInsightsClient).not.toHaveBeenCalled();
});
it("binds the lookup to the verified user and returns no-store image data", async () => {
  const result = { asin: "B0FG4H5C6W", imageDataUrl: "data:image/jpeg;base64,/9j/" };
  vi.mocked(withScaleInsightsClient).mockResolvedValue(result);
  const response = await GET(request());
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual(result);
  expect(withScaleInsightsClient).toHaveBeenCalledWith({ userId: "user-1", issuer: "https://glasscopipeline.vercel.app", callbackUrl: "http://localhost/ppc/dashboard" }, expect.any(Function));
});
