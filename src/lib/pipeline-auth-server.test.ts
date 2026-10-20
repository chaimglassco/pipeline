import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPipelineRequest } from "./pipeline-auth-server";

afterEach(() => vi.unstubAllGlobals());

function request() {
  return new Request("https://glasscopipeline.vercel.app/ppc/api/library", { headers: { Authorization: "Bearer valid-token" } });
}

function pipelineResponse(role: "ADMIN" | "USER" | "VIEWER", status = 200) {
  return new Response(JSON.stringify({ user: { id: "user-1", email: "user@glassco.test", name: "Glassco user", role } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Pipeline server authorization", () => {
  it("allows ADMIN mutations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pipelineResponse("ADMIN")));
    await expect(verifyPipelineRequest(request(), true)).resolves.toEqual({ user: { id: "user-1", email: "user@glassco.test", name: "Glassco user", role: "ADMIN" } });
  });

  it.each(["USER", "VIEWER"] as const)("rejects %s mutations", async role => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pipelineResponse(role)));
    const result = await verifyPipelineRequest(request(), true);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("rejects expired Pipeline sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session expired." }), { status: 401 })));
    const result = await verifyPipelineRequest(request());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("keeps temporary upstream failures distinct from expired sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 })));
    const result = await verifyPipelineRequest(request());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
  });
});
