import type { PipelineUser } from "./pipeline-session";

const pipelineOrigin = (process.env.PIPELINE_AUTH_ORIGIN || "https://glasscopipeline.vercel.app").replace(/\/$/, "");

export function getPipelineOrigin() {
  return pipelineOrigin;
}

type VerifiedSession = { user: PipelineUser };

export async function verifyPipelineRequest(request: Request, requireAdmin = false): Promise<VerifiedSession | Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Sign in through Product Pipeline to continue." }, { status: 401 });

  try {
    const response = await fetch(`${pipelineOrigin}/api/auth/session`, { headers: { Authorization: authorization }, cache: "no-store" });
    const value: unknown = await response.json();
    if (response.status === 401) return Response.json({ error: "Your Pipeline session has expired." }, { status: 401 });
    if (!response.ok || !value || typeof value !== "object") return Response.json({ error: "Pipeline authentication is temporarily unavailable." }, { status: 503 });
    const user = (value as Record<string, unknown>).user;
    if (!user || typeof user !== "object") return Response.json({ error: "Your Pipeline session is invalid." }, { status: 401 });
    const candidate = user as Record<string, unknown>;
    const role = String(candidate.role ?? "USER").toUpperCase();
    const verified: PipelineUser = {
      id: typeof candidate.id === "string" ? candidate.id : undefined,
      email: typeof candidate.email === "string" ? candidate.email : "",
      name: typeof candidate.name === "string" ? candidate.name : "Glassco user",
      role: role === "ADMIN" ? "ADMIN" : role === "VIEWER" ? "VIEWER" : "USER",
    };
    if (!verified.email) return Response.json({ error: "Your Pipeline session is invalid." }, { status: 401 });
    if (requireAdmin && verified.role !== "ADMIN") return Response.json({ error: "Administrator access is required." }, { status: 403 });
    return { user: verified };
  } catch {
    return Response.json({ error: "Pipeline authentication is temporarily unavailable." }, { status: 503 });
  }
}
