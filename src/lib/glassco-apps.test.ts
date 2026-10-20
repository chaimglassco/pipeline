import { describe, expect, it } from "vitest";
import {
  GLASSCO_APP_ROUTES_STORAGE_KEY,
  getPipelineLoginUrl,
  getPipelineProfileUrl,
  getSafeGlasscoReturnRoute,
  readGlasscoAppRoutes,
  rememberGlasscoAppRoute,
  withPpcBasePath,
} from "./glassco-apps";

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Glassco app routing", () => {
  it("prefixes PPC routes once", () => {
    expect(withPpcBasePath("/library")).toBe("/ppc/library");
    expect(withPpcBasePath("/ppc/library")).toBe("/ppc/library");
  });

  it("builds the canonical Pipeline profile deep link", () => {
    expect(getPipelineProfileUrl()).toBe("https://glasscopipeline.vercel.app/?open=profile");
  });

  it("keeps legacy route memory and supplies the new dashboard fallback", () => {
    const source = storage({ [GLASSCO_APP_ROUTES_STORAGE_KEY]: JSON.stringify({ pipeline: "/products?stage=shipping", ppc: "/ppc/library/example" }) });
    expect(readGlasscoAppRoutes(source)).toEqual({
      pipeline: "/products?stage=shipping",
      ppc: "/ppc/library/example",
      ppcDashboard: "/ppc/dashboard",
    });
  });

  it("rejects unsafe remembered routes", () => {
    const source = storage({ [GLASSCO_APP_ROUTES_STORAGE_KEY]: JSON.stringify({ pipeline: "//example.com", ppc: "/ppc/dashboard", ppcDashboard: "https://example.com" }) });
    expect(readGlasscoAppRoutes(source)).toEqual({ pipeline: "/", ppc: "/ppc/library", ppcDashboard: "/ppc/dashboard" });
  });

  it("remembers valid destinations independently", () => {
    const source = storage();
    rememberGlasscoAppRoute(source, "ppc", "/ppc/library/example?mode=read#topic");
    const routes = rememberGlasscoAppRoute(source, "ppcDashboard", "/ppc/dashboard?range=30d#summary");
    expect(routes.ppc).toBe("/ppc/library/example?mode=read#topic");
    expect(routes.ppcDashboard).toBe("/ppc/dashboard?range=30d#summary");
  });

  it.each([
    "/ppc/library",
    "/ppc/library/example?mode=read#topic",
    "/ppc/dashboard",
    "/ppc/dashboard?range=30d#summary",
  ])("accepts the safe return destination %s", route => {
    expect(getSafeGlasscoReturnRoute(route)).toBe(route);
    expect(getPipelineLoginUrl(route)).toContain(`returnTo=${encodeURIComponent(route)}`);
  });

  it.each([
    "https://evil.example/ppc/library",
    "//evil.example/ppc/library",
    "/ppc/library\\evil",
    "/ppc/dashboard/extra",
    "/ppc/dashboard/products/B012345678/campaigns",
    "/ppc/other",
    "not-a-route",
  ])("rejects the unsafe return destination %s", route => {
    expect(getSafeGlasscoReturnRoute(route)).toBeNull();
    expect(new URL(getPipelineLoginUrl(route)).searchParams.has("returnTo")).toBe(false);
  });
});
