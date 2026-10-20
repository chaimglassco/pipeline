import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@vercel/connect", () => {
  class ConnectError extends Error {}
  class NoValidTokenError extends ConnectError {}
  class UserAuthorizationRequiredError extends ConnectError {}
  return {
    ConnectError,
    NoValidTokenError,
    UserAuthorizationRequiredError,
    getToken: vi.fn(),
    startAuthorization: vi.fn(),
  };
});

vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
  StreamableHTTPClientTransport: class {},
}));

import {
  ConnectError,
  UserAuthorizationRequiredError,
  getToken,
  startAuthorization,
} from "@vercel/connect";
import {
  getScaleInsightsWeeklyPerformance,
  ScaleInsightsAuthorizationRequiredError,
  ScaleInsightsConfigurationError,
} from "./scale-insights-server";

const scope = { asin: "B0FG4H5C6W", country: "US", startDate: "2026-08-26", endDate: "2026-09-01" };
const identity = {
  userId: "pipeline-user-1",
  issuer: "https://glasscopipeline.vercel.app",
  callbackUrl: "https://example.com/ppc/dashboard",
};

describe("Scale Insights Vercel Connect authorization", () => {
  beforeEach(() => {
    vi.mocked(getToken).mockReset();
    vi.mocked(startAuthorization).mockReset();
  });

  it("starts hosted consent for the exact verified Pipeline subject", async () => {
    vi.mocked(getToken).mockRejectedValue(new UserAuthorizationRequiredError("consent required"));
    vi.mocked(startAuthorization).mockResolvedValue({
      request: "request-id",
      verifier: "verifier",
      url: "https://vercel.com/api/v1/connect/authorize/scl_test",
    });

    const operation = getScaleInsightsWeeklyPerformance(scope, identity);
    await expect(operation).rejects.toEqual(expect.objectContaining({
      name: "ScaleInsightsAuthorizationRequiredError",
      authorizationUrl: "https://vercel.com/api/v1/connect/authorize/scl_test",
    }));
    expect(getToken).toHaveBeenCalledWith("mcp.scaleinsights.com/glassco-scale-insights", {
      subject: { type: "user", id: "pipeline-user-1", issuer: "https://glasscopipeline.vercel.app" },
    });
    expect(startAuthorization).toHaveBeenCalledWith(
      "mcp.scaleinsights.com/glassco-scale-insights",
      { subject: { type: "user", id: "pipeline-user-1", issuer: "https://glasscopipeline.vercel.app" } },
      { callbackUrl: "https://example.com/ppc/dashboard" },
    );
  });

  it("rejects an untrusted consent URL", async () => {
    vi.mocked(getToken).mockRejectedValue(new UserAuthorizationRequiredError("consent required"));
    vi.mocked(startAuthorization).mockResolvedValue({
      request: "request-id",
      verifier: "verifier",
      url: "https://attacker.example/authorize",
    });

    await expect(getScaleInsightsWeeklyPerformance(scope, identity)).rejects.toBeInstanceOf(ScaleInsightsConfigurationError);
  });

  it("maps non-consent Connect failures to a bounded configuration error", async () => {
    vi.mocked(getToken).mockRejectedValue(new ConnectError("upstream details"));

    await expect(getScaleInsightsWeeklyPerformance(scope, identity)).rejects.toBeInstanceOf(ScaleInsightsConfigurationError);
    expect(startAuthorization).not.toHaveBeenCalled();
  });

  it("keeps the authorization URL on the typed error only", () => {
    const error = new ScaleInsightsAuthorizationRequiredError("https://vercel.com/authorize");
    expect(error.message).not.toContain(error.authorizationUrl);
  });
});
