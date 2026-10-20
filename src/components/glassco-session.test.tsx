import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PIPELINE_SESSION_STORAGE_KEY } from "@/lib/pipeline-session";
import { GlasscoSessionProvider } from "./glassco-session";

describe("Glassco session gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(PIPELINE_SESSION_STORAGE_KEY, JSON.stringify({ token: "test-token", email: "admin@example.com", name: "Admin", role: "ADMIN" }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("replaces an indefinitely pending verification request with a retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    render(<GlasscoSessionProvider><div>Private Library</div></GlasscoSessionProvider>);
    expect(screen.getByText(/Verifying your Pipeline session/)).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("We could not verify your session right now.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("Private Library")).not.toBeInTheDocument();
  });
});
