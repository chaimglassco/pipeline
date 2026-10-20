import { describe, expect, it } from "vitest";
import { getSharedLibraryRefreshDelay } from "./shared-library-retry";

describe("shared Library retry schedule", () => {
  it("uses normal polling while connected and progressive backoff after failures", () => {
    expect(getSharedLibraryRefreshDelay(0)).toBe(5_000);
    expect(getSharedLibraryRefreshDelay(1)).toBe(5_000);
    expect(getSharedLibraryRefreshDelay(2)).toBe(15_000);
    expect(getSharedLibraryRefreshDelay(3)).toBe(30_000);
    expect(getSharedLibraryRefreshDelay(4)).toBe(60_000);
    expect(getSharedLibraryRefreshDelay(20)).toBe(60_000);
  });
});
