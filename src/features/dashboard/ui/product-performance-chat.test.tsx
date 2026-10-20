import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWeeklyPpcReport } from "../domain/ppc-dashboard-state";
import { ProductPerformanceChat } from "./product-performance-chat";

const product = { id: "product-1", name: "Glass Cleaner", asin: "B012345678", sku: "GC-01", stageId: "launch", status: "Active" as const };
const current = { ...createWeeklyPpcReport(product.id, "2026-09-02"), spend: 50, ppcSales: 250, totalSales: 550, ppcOrders: 10, totalOrders: 22, organicSales: 300, organicOrders: 12, acos: 20, tacos: 9.09, targetAcos: 22 };
const previous = { ...createWeeklyPpcReport(product.id, "2026-08-26"), spend: 60, ppcSales: 200, totalSales: 450, ppcOrders: 8, totalOrders: 18, organicSales: 250, organicOrders: 10, acos: 30, tacos: 13.33 };

describe("ProductPerformanceChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ answer: "ACOS improved by 10 percentage points." }) })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens from a compact widget and sends the active ASIN plus visible reporting periods", async () => {
    render(<ProductPerformanceChat product={product} activeWeekStart="2026-09-02" periods={[
      { weekStart: "2026-09-02", dataState: "Partial", report: current },
      { weekStart: "2026-08-26", dataState: "Final", report: previous },
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI performance assistant" }));
    expect(screen.getByRole("dialog", { name: "AI product performance assistant" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Why did ACOS change?" }));

    await screen.findByText("ACOS improved by 10 percentage points.");
    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse(String(options?.body));
    expect(payload.question).toBe("Why did ACOS change?");
    expect(payload.context.product).toEqual({ name: "Glass Cleaner", asin: "B012345678", sku: "GC-01" });
    expect(payload.context.periods).toHaveLength(2);
    expect(payload.context.periods[0]).toEqual(expect.objectContaining({ weekStart: "2026-09-02", dataState: "Partial", metrics: expect.objectContaining({ acos: 20 }) }));
  });

  it("supports typed questions and shows safe API errors", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "The AI performance assistant is not configured for this environment." }) } as Response);
    render(<ProductPerformanceChat product={product} activeWeekStart="2026-09-02" periods={[{ weekStart: "2026-09-02", dataState: "Partial", report: current }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open AI performance assistant" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ask about product performance" }), { target: { value: "How are sales doing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send performance question" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not configured"));
    expect(screen.getByText("How are sales doing?")).toBeVisible();
  });

  it("offers the hosted Scale Insights consent link when authorization is required", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Connect Scale Insights before asking a live performance question.",
        authorizationRequired: true,
        authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
      }),
    } as Response);
    render(<ProductPerformanceChat product={product} activeWeekStart="2026-09-02" periods={[{ weekStart: "2026-09-02", dataState: "Partial", report: current }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open AI performance assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Why did ACOS change?" }));
    expect(await screen.findByRole("link", { name: "Connect Scale Insights" })).toHaveAttribute("href", "https://vercel.com/api/v1/connect/authorize/scl_test");
  });
});
