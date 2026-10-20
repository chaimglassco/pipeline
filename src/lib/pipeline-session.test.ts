import { describe, expect, it } from "vitest";
import {
  GLASSCO_LOGOUT_STORAGE_KEY,
  GLASSCO_AUTH_HANDOFF_STORAGE_KEY,
  PIPELINE_SESSION_STORAGE_KEY,
  clearAndBroadcastGlasscoSession,
  consumePipelineSessionHandoff,
  createPipelineSessionHandoff,
  parseStoredPipelineSession,
} from "./pipeline-session";

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

const validSession = { token: "header.payload.signature", email: "user@glassco.test", name: "User", role: "USER" };

describe("Pipeline session parsing", () => {
  it("accepts a valid stored session and normalizes its role", () => {
    expect(parseStoredPipelineSession(JSON.stringify({ ...validSession, role: "viewer" }))).toEqual({ ...validSession, role: "VIEWER" });
  });

  it("rejects malformed and tokenless values", () => {
    expect(parseStoredPipelineSession("bad")).toBeNull();
    expect(parseStoredPipelineSession(JSON.stringify({ email: "user@glassco.test" }))).toBeNull();
  });

  it.each([["admin", "ADMIN"], ["user", "USER"], ["viewer", "VIEWER"], ["unknown", "USER"]] as const)("normalizes %s access to %s", (role, expected) => {
    expect(parseStoredPipelineSession(JSON.stringify({ ...validSession, role }))?.role).toBe(expected);
  });
});

describe("cross-tab authentication handoff", () => {
  it("moves a session-only login into the destination tab and deletes the handoff", () => {
    const local = storage();
    const sourceSession = storage({ [PIPELINE_SESSION_STORAGE_KEY]: JSON.stringify(validSession) });
    const destinationSession = storage();
    expect(createPipelineSessionHandoff(local, sourceSession, "ppc", 1_000)).toBe(true);
    expect(consumePipelineSessionHandoff(local, destinationSession, "ppc", 2_000)).toEqual(validSession);
    expect(parseStoredPipelineSession(destinationSession.getItem(PIPELINE_SESSION_STORAGE_KEY))).toEqual(validSession);
    expect(local.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).toBeNull();
    expect(consumePipelineSessionHandoff(local, destinationSession, "ppc", 2_001)).toBeNull();
  });

  it("preserves Remember me storage without creating a handoff", () => {
    const local = storage({ [PIPELINE_SESSION_STORAGE_KEY]: JSON.stringify(validSession) });
    expect(createPipelineSessionHandoff(local, storage(), "ppc", 1_000)).toBe(false);
    expect(parseStoredPipelineSession(local.getItem(PIPELINE_SESSION_STORAGE_KEY))).toEqual(validSession);
    expect(local.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("rejects and removes expired or malformed handoffs", () => {
    const expired = storage({ [GLASSCO_AUTH_HANDOFF_STORAGE_KEY]: JSON.stringify({ version: 1, targetApp: "ppc", expiresAt: 999, session: validSession }) });
    expect(consumePipelineSessionHandoff(expired, storage(), "ppc", 1_000)).toBeNull();
    expect(expired.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).toBeNull();

    const malformed = storage({ [GLASSCO_AUTH_HANDOFF_STORAGE_KEY]: "not-json" });
    expect(consumePipelineSessionHandoff(malformed, storage(), "ppc", 1_000)).toBeNull();
    expect(malformed.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).toBeNull();
  });

  it("does not consume a valid handoff intended for the other application", () => {
    const local = storage({ [GLASSCO_AUTH_HANDOFF_STORAGE_KEY]: JSON.stringify({ version: 1, targetApp: "pipeline", expiresAt: 31_000, session: validSession }) });
    expect(consumePipelineSessionHandoff(local, storage(), "ppc", 1_000)).toBeNull();
    expect(local.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).not.toBeNull();
  });
});

describe("shared logout", () => {
  it("clears persistent and tab sessions and broadcasts the logout timestamp", () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(PIPELINE_SESSION_STORAGE_KEY, JSON.stringify(validSession));
    window.sessionStorage.setItem(PIPELINE_SESSION_STORAGE_KEY, JSON.stringify(validSession));
    window.localStorage.setItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY, "pending");

    clearAndBroadcastGlasscoSession(12_345);

    expect(window.localStorage.getItem(PIPELINE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PIPELINE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(GLASSCO_LOGOUT_STORAGE_KEY)).toBe("12345");
  });
});
