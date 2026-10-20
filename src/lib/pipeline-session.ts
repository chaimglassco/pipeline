export const PIPELINE_SESSION_STORAGE_KEY = "launchflow.authSession.v1";
export const GLASSCO_AUTH_HANDOFF_STORAGE_KEY = "glassco.authHandoff.v1";
export const GLASSCO_LOGOUT_STORAGE_KEY = "glassco.logout.v1";
export const GLASSCO_AUTH_HANDOFF_TTL_MS = 30_000;

export type PipelineRole = "ADMIN" | "USER" | "VIEWER";
export type GlasscoAuthTarget = "pipeline" | "ppc";

export type PipelineUser = {
  id?: string;
  email: string;
  name: string;
  role: PipelineRole;
  jobTitle?: string;
  avatarDataUrl?: string;
  avatarUrl?: string;
};

export type StoredPipelineSession = PipelineUser & { token: string };

type StoredAuthHandoff = {
  version: 1;
  targetApp: GlasscoAuthTarget;
  expiresAt: number;
  session: StoredPipelineSession;
};

function normalizeRole(value: unknown): PipelineRole {
  const role = String(value ?? "").toUpperCase();
  if (role === "ADMIN" || role === "VIEWER") return role;
  return "USER";
}

export function parseStoredPipelineSession(value: string | null): StoredPipelineSession | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.token !== "string" || !candidate.token || typeof candidate.email !== "string" || !candidate.email) return null;
    return {
      token: candidate.token,
      email: candidate.email,
      name: typeof candidate.name === "string" && candidate.name ? candidate.name : candidate.email,
      role: normalizeRole(candidate.role),
    };
  } catch {
    return null;
  }
}

export function createPipelineSessionHandoff(localStorage: Storage, sessionStorage: Storage, targetApp: GlasscoAuthTarget, now = Date.now()): boolean {
  const persistentSession = parseStoredPipelineSession(localStorage.getItem(PIPELINE_SESSION_STORAGE_KEY));
  if (persistentSession) {
    localStorage.removeItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    return false;
  }

  const session = parseStoredPipelineSession(sessionStorage.getItem(PIPELINE_SESSION_STORAGE_KEY));
  if (!session) return false;
  const handoff: StoredAuthHandoff = { version: 1, targetApp, expiresAt: now + GLASSCO_AUTH_HANDOFF_TTL_MS, session };
  localStorage.setItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
  return true;
}

export function consumePipelineSessionHandoff(localStorage: Storage, sessionStorage: Storage, targetApp: GlasscoAuthTarget, now = Date.now()): StoredPipelineSession | null {
  const raw = localStorage.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Malformed handoff");
    const candidate = parsed as Partial<StoredAuthHandoff>;
    if (candidate.version !== 1 || (candidate.targetApp !== "pipeline" && candidate.targetApp !== "ppc") || typeof candidate.expiresAt !== "number") {
      throw new Error("Malformed handoff");
    }
    if (candidate.expiresAt <= now) throw new Error("Expired handoff");
    if (candidate.targetApp !== targetApp) return null;

    localStorage.removeItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    const session = parseStoredPipelineSession(JSON.stringify(candidate.session));
    if (!session) return null;
    sessionStorage.setItem(PIPELINE_SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    localStorage.removeItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    return null;
  }
}

export function createBrowserPipelineSessionHandoff(targetApp: GlasscoAuthTarget): boolean {
  if (typeof window === "undefined") return false;
  return createPipelineSessionHandoff(window.localStorage, window.sessionStorage, targetApp);
}

export function readStoredPipelineSession(): StoredPipelineSession | null {
  if (typeof window === "undefined") return null;
  return parseStoredPipelineSession(window.localStorage.getItem(PIPELINE_SESSION_STORAGE_KEY))
    ?? parseStoredPipelineSession(window.sessionStorage.getItem(PIPELINE_SESSION_STORAGE_KEY))
    ?? consumePipelineSessionHandoff(window.localStorage, window.sessionStorage, "ppc");
}

export function clearStoredPipelineSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PIPELINE_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(PIPELINE_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
}

export function clearAndBroadcastGlasscoSession(now = Date.now()) {
  if (typeof window === "undefined") return;
  clearStoredPipelineSession();
  window.localStorage.setItem(GLASSCO_LOGOUT_STORAGE_KEY, String(now));
}

export function getPipelineAuthorizationHeader(): Record<string, string> {
  const session = readStoredPipelineSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}
