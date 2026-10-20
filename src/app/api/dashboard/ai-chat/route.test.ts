import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async importOriginal => ({ ...(await importOriginal<typeof import("ai")>()), generateText: vi.fn() }));
vi.mock("@/lib/pipeline-auth-server", () => ({ getPipelineOrigin: () => "https://glasscopipeline.vercel.app", verifyPipelineRequest: vi.fn() }));
vi.mock("@/features/dashboard/data/scale-insights-server", () => {
  class ScaleInsightsAuthorizationRequiredError extends Error {
    constructor(readonly authorizationUrl: string) {
      super("authorization required");
    }
  }
  class ScaleInsightsConfigurationError extends Error {}
  return {
    ScaleInsightsAuthorizationRequiredError,
    ScaleInsightsConfigurationError,
    withScaleInsightsToolSession: vi.fn(),
  };
});

import { LoadAPIKeyError, generateText } from "ai";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import {
  ScaleInsightsAuthorizationRequiredError,
  withScaleInsightsToolSession,
} from "@/features/dashboard/data/scale-insights-server";
import { POST, createScaleInsightsAssistantTools, parsePerformanceChatRequest } from "./route";

const body = {
  question: "Why did ACOS improve?",
  history: [{ role: "user", text: "Compare the weeks" }, { role: "assistant", text: "I can do that." }],
  context: {
    product: { name: "Glass Cleaner", asin: "b012345678", sku: "GC-01" },
    activeWeekStart: "2026-09-02",
    targetAcos: 20,
    weeklyBudget: 100,
    notes: "Reduced weak search terms.",
    carryForward: "Protect profitable traffic.",
    goals: [{ goal: "ACOS", target: "20.00%", status: "On Track" }],
    actions: [{ action: "Review bids", priority: "High", completed: false }],
    periods: [
      { weekStart: "2026-09-02", weekEnd: "2026-09-08", dataState: "Partial", metrics: { spend: 50, ppcSales: 250, organicSales: 300, totalSales: 550, ppcOrders: 10, organicOrders: 12, totalOrders: 22, acos: 20, tacos: 9.09 } },
      { weekStart: "2026-08-26", weekEnd: "2026-09-01", dataState: "Final", metrics: { spend: 60, ppcSales: 200, organicSales: 250, totalSales: 450, ppcOrders: 8, organicOrders: 10, totalOrders: 18, acos: 30, tacos: 13.33 } },
    ],
  },
};

function request(value: unknown = body) {
  return new Request("http://localhost/ppc/api/dashboard/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer pipeline-token" },
    body: JSON.stringify(value),
  });
}

const adsTool = {
  name: "get_ads_performance",
  description: "Read advertising performance for selected ASINs.",
  inputSchema: {
    type: "object" as const,
    properties: {
      asin_list: { type: "array", items: { type: "string" } },
      country: { type: "string" },
      start_date: { type: "string" },
      end_date: { type: "string" },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false },
};

describe("PPC performance AI route", () => {
  beforeEach(() => {
    vi.mocked(verifyPipelineRequest).mockReset();
    vi.mocked(verifyPipelineRequest).mockResolvedValue({ user: { id: "user-1", email: "user@example.com", name: "User", role: "USER" } });
    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockResolvedValue({ text: "ACOS improved from 30% to 20% while PPC sales rose by $50." } as Awaited<ReturnType<typeof generateText>>);
    vi.mocked(withScaleInsightsToolSession).mockReset();
    vi.mocked(withScaleInsightsToolSession).mockImplementation(async (_identity, load) => load({
      definitions: [adsTool],
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Scale Insights data" }] }),
    }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("validates and bounds product-scoped performance context", () => {
    const parsed = parsePerformanceChatRequest({
      ...body,
      history: Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `Message ${index}` })),
    });
    expect(parsed.context.product.asin).toBe("B012345678");
    expect(parsed.history).toHaveLength(8);
    expect(parsed.context.periods).toHaveLength(2);
    expect(() => parsePerformanceChatRequest({ ...body, question: "" })).toThrow(/question/i);
    expect(() => parsePerformanceChatRequest({ ...body, context: { ...body.context, periods: body.context.periods.slice(1) } })).toThrow(/active reporting week/i);
  });

  it("authenticates and asks the configured OpenAI model with ASIN-scoped Scale Insights tools", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({ answer: "ACOS improved from 30% to 20% while PPC sales rose by $50." });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: "openai/gpt-5.6-sol",
      maxOutputTokens: 1_000,
      instructions: expect.stringContaining("read-only Scale Insights MCP access"),
      prompt: expect.stringContaining("Why did ACOS improve?"),
      tools: expect.objectContaining({ get_ads_performance: expect.any(Object) }),
      stopWhen: expect.any(Function),
      providerOptions: { gateway: { user: "user-1", tags: ["feature:ppc-performance-chat", "source:scale-insights-mcp"], cacheControl: "max-age=0" } },
    }));
  });

  it("forces every MCP tool call to the selected ASIN and reporting range", async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const tools = createScaleInsightsAssistantTools([
      adsTool,
      { ...adsTool, name: "update_bid", annotations: { readOnlyHint: false, destructiveHint: true } },
    ], callTool, { asin: "B012345678", country: "US", startDate: "2026-08-26", endDate: "2026-09-08" });
    expect(tools).not.toHaveProperty("update_bid");
    const executable = tools.get_ads_performance as unknown as { execute: (input: unknown) => Promise<unknown> };
    await executable.execute({ asin_list: ["B099999999"], country: "CA", start_date: "2020-01-01", end_date: "2030-01-01" });
    expect(callTool).toHaveBeenCalledWith("get_ads_performance", {
      asin_list: ["B012345678"], country: "US", start_date: "2026-08-26", end_date: "2026-09-08",
    });
  });

  it("returns hosted Scale Insights consent when the verified user has no connector grant", async () => {
    vi.mocked(withScaleInsightsToolSession).mockRejectedValue(new ScaleInsightsAuthorizationRequiredError("https://vercel.com/api/v1/connect/authorize/scl_test"));
    const response = await POST(request());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Connect Scale Insights before asking a live performance question.",
      authorizationRequired: true,
      authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not call the model when Pipeline authentication fails", async () => {
    vi.mocked(verifyPipelineRequest).mockResolvedValue(new Response(null, { status: 401 }));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("lets AI Gateway resolve deployment OIDC instead of rejecting build-time environment state", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("returns bounded authentication and provider failures", async () => {
    vi.mocked(generateText).mockRejectedValue(new LoadAPIKeyError({ message: "secret provider message" }));
    let response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI Gateway could not authenticate this deployment. Redeploy the Vercel project or configure a server-side AI Gateway key." });

    vi.mocked(generateText).mockRejectedValue(new Error("secret provider message"));
    response = await POST(request());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "The AI performance assistant is temporarily unavailable." });
  });
});
