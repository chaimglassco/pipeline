import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWeeklyPpcReport, PPC_DASHBOARD_STORAGE_KEY, reportKey } from "../domain/ppc-dashboard-state";
import type { DashboardDocument, DashboardDocumentResponse } from "../domain/shared-dashboard";
import { PPC_SHARED_REPORT_OUTBOX_KEY, SharedDashboardStorage, type DashboardResponses } from "./shared-dashboard-client";

const key = PPC_DASHBOARD_STORAGE_KEY;
const reportsValue = (reports: Record<string, unknown>) => JSON.stringify({ version: 1, reports });
const document = (value: string, operationId = "operation-base", savedAt = "2026-09-23T01:00:00.000Z"): DashboardDocument => ({
  version: 1, key, value, operationId, savedAt, actor: "user@example.com",
});
const response = (value: string, etag: string, operationId?: string, savedAt?: string): DashboardDocumentResponse => ({ document: document(value, operationId, savedAt), etag, canEdit: true });
const outboxEntries = () => Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index) || "")
  .filter(candidate => candidate.startsWith(PPC_SHARED_REPORT_OUTBOX_KEY));

describe("SharedDashboardStorage", () => {
  it("keeps deleted goals removed during stale local writes and later team sync", () => {
    vi.useFakeTimers();
    const first = createWeeklyPpcReport("product-1", "2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const goal = { id: "old-sales", title: "PPC Sales", target: "", actual: "", status: "On Track" };
    const deleted = reportsValue({ [firstKey]: { ...first, goals: [], deletedGoalIds: [goal.id] } });
    const stale = reportsValue({ [firstKey]: { ...first, goals: [goal], notes: "Keep this note" } });
    const storage = new SharedDashboardStorage(new Map([[key, response(deleted, "etag-1")]]), vi.fn());
    storage.setItem(key, stale);
    expect(JSON.parse(storage.getItem(key)!).reports[firstKey]).toMatchObject({ goals: [], deletedGoalIds: [goal.id], notes: "Keep this note" });
    window.localStorage.clear();
    const synced = new SharedDashboardStorage(new Map([[key, response(deleted, "etag-1")]]), vi.fn());
    expect(synced.sync(new Map([[key, response(stale, "etag-2", "stale-operation", "2026-09-23T01:01:00.000Z")]]))).toBe(true);
    expect(JSON.parse(synced.getItem(key)!).reports[firstKey].goals).toEqual([]);
    expect(synced.hasPending()).toBe(true);
  });
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); });

  it("merges and retries an ETag conflict without exposing a save error", async () => {
    const first = createWeeklyPpcReport("product-1", "2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const local = reportsValue({ [firstKey]: { ...first, notes: "Local summary" } });
    const remote = reportsValue({ [firstKey]: { ...first, weeklyBudget: 700, dailyBudget: 100 } });
    let putCount = 0;
    let savedValue = "";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putCount += 1;
        if (putCount === 1) return Response.json({ error: "Someone else updated this dataset." }, { status: 409 });
        const body = JSON.parse(String(init.body));
        savedValue = body.value;
        return Response.json({ ...response(body.value, "etag-3", body.operationId, "2026-09-23T01:02:00.000Z") });
      }
      return Response.json({ ...response(remote, "etag-2", "operation-remote", "2026-09-23T01:01:00.000Z") });
    });
    vi.stubGlobal("fetch", fetchMock);
    const statuses: Array<{ pending: number; error: string }> = [];
    const remoteChange = vi.fn();
    const responses: DashboardResponses = new Map([[key, response(base, "etag-1")]]);
    const storage = new SharedDashboardStorage(responses, status => statuses.push(status), remoteChange);

    storage.setItem(key, local);
    await storage.flush();

    expect(putCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(statuses.at(-1)).toMatchObject({ pending: 0, error: "" });
    expect(remoteChange).toHaveBeenCalled();
    expect(JSON.parse(savedValue).reports[firstKey]).toMatchObject({ notes: "Local summary", weeklyBudget: 700, dailyBudget: 100 });
  });

  it("adopts newer confirmed team data when there is no pending local edit", () => {
    const first = createWeeklyPpcReport("product-1", "2026-09-02");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const remote = reportsValue({ [firstKey]: { ...first, notes: "Colleague update" } });
    const remoteChange = vi.fn();
    const storage = new SharedDashboardStorage(new Map([[key, response(base, "etag-1")]]), vi.fn(), remoteChange);

    expect(storage.sync(new Map([[key, response(remote, "etag-2", "operation-remote", "2026-09-23T01:01:00.000Z")]]))).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).reports[firstKey].notes).toBe("Colleague update");
    expect(remoteChange).toHaveBeenCalledOnce();
  });

  it("keeps both editors' Action Items after a remote conflict and reload", async () => {
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    let current = response(base, "etag-1");
    let version = 1;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "PUT") return Response.json(current);
      const body = JSON.parse(String(init.body));
      if (body.expectedEtag !== current.etag) return Response.json({ error: "Someone else updated this dataset." }, { status: 409 });
      current = response(body.value, `etag-${++version}`, body.operationId, `2026-09-23T01:0${version}:00.000Z`);
      return Response.json(current);
    }));
    const editorA = new SharedDashboardStorage(new Map([[key, current]]), vi.fn());
    const editorB = new SharedDashboardStorage(new Map([[key, current]]), vi.fn());
    const action = (id: string) => ({ id, title: id, priority: "Medium", dueDate: "", done: false });

    editorA.setItem(key, reportsValue({ [firstKey]: { ...first, actions: [action("from-editor-a")] } }));
    await editorA.flush();
    editorB.setItem(key, reportsValue({ [firstKey]: { ...first, actions: [action("from-editor-b")] } }));
    await editorB.flush();

    expect(JSON.parse(current.document!.value).reports[firstKey].actions.map((item: { id: string }) => item.id).sort())
      .toEqual(["from-editor-a", "from-editor-b"]);
    expect(editorB.hasPending()).toBe(false);
    const reloaded = new SharedDashboardStorage(new Map([[key, current]]), vi.fn());
    expect(JSON.parse(reloaded.getItem(key)!).reports[firstKey].actions).toHaveLength(2);
  });

  it("restores an unsent weekly-report edit after refresh and uploads it automatically", async () => {
    vi.useFakeTimers();
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const local = reportsValue({ [firstKey]: {
      ...first,
      actions: [{ id: "recover-me", title: "Recovered action", priority: "Medium", dueDate: "", done: false }],
    } });
    const responses: DashboardResponses = new Map([[key, response(base, "etag-1")]]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Temporarily unavailable." }, { status: 503 })));
    const firstStorage = new SharedDashboardStorage(responses, vi.fn());

    firstStorage.setItem(key, local);
    await firstStorage.flush();

    const latestLocal = reportsValue({ [firstKey]: {
      ...first,
      actions: [{ id: "recover-me", title: "Recovered action after error", priority: "Medium", dueDate: "", done: false }],
    } });
    expect(() => firstStorage.setItem(key, latestLocal)).not.toThrow();

    expect(outboxEntries()).toHaveLength(1);

    let uploadedValue = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      uploadedValue = body.value;
      return Response.json({ ...response(body.value, "etag-2", body.operationId, "2026-09-23T02:00:00.000Z") });
    }));
    const restoredStorage = new SharedDashboardStorage(responses, vi.fn());
    await restoredStorage.flush();

    expect(JSON.parse(uploadedValue).reports[firstKey].actions).toContainEqual(expect.objectContaining({ id: "recover-me", title: "Recovered action after error" }));
    expect(outboxEntries()).toHaveLength(0);
  });

  it("keeps separate browser-tab recovery copies until each tab's save is confirmed", () => {
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const remote: DashboardResponses = new Map([[key, response(reportsValue({ [firstKey]: first }), "etag-1")]]);
    const action = (id: string) => ({ id, title: id, priority: "Medium", dueDate: "", done: false });
    const editorA = new SharedDashboardStorage(remote, vi.fn());
    editorA.setItem(key, reportsValue({ [firstKey]: { ...first, actions: [action("first-tab")] } }));
    window.sessionStorage.clear();
    const editorB = new SharedDashboardStorage(remote, vi.fn());
    editorB.setItem(key, reportsValue({ [firstKey]: { ...first, actions: [action("second-tab")] } }));
    expect(outboxEntries()).toHaveLength(2);
    expect(outboxEntries()[0]).not.toBe(outboxEntries()[1]);
  });

  it("keeps an unsaved report pending and surfaces repeated conflicts", async () => {
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const local = reportsValue({ [firstKey]: { ...first, actions: [{ id: "pending", title: "Pending action", priority: "Medium", dueDate: "", done: false }] } });
    const statuses: Array<{ pending: number; error: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT"
      ? Response.json({ error: "Someone else updated this dataset." }, { status: 409 })
      : Response.json(response(base, "etag-2"))));
    const storage = new SharedDashboardStorage(new Map([[key, response(base, "etag-1")]]), status => statuses.push(status));
    storage.setItem(key, local);
    await storage.flush();
    expect(storage.hasPending()).toBe(true);
    expect(statuses.at(-1)?.error).toContain("Not saved online yet");
    expect(outboxEntries()).toHaveLength(1);
  });

  it("restores the legacy outbox without replacing a newer team Action Item", async () => {
    vi.useFakeTimers();
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const action = (id: string) => ({ id, title: id, priority: "Medium", dueDate: "", done: false });
    const local = reportsValue({ [firstKey]: { ...first, actions: [action("recovered")] } });
    const remote = reportsValue({ [firstKey]: { ...first, actions: [action("teammate")] } });
    window.localStorage.setItem(PPC_SHARED_REPORT_OUTBOX_KEY, JSON.stringify({ version: 1, entry: { value: local, baseValue: base } }));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Response.json(response(body.value, "etag-3", body.operationId));
    }));
    const storage = new SharedDashboardStorage(new Map([[key, response(remote, "etag-2")]]), vi.fn());
    expect(JSON.parse(storage.getItem(key)!).reports[firstKey].actions).toHaveLength(2);
    await storage.flush();
    expect(outboxEntries()).toHaveLength(0);
  });

  it("warns when browser recovery cannot be written and blocks viewer report edits", () => {
    vi.useFakeTimers();
    const first = createWeeklyPpcReport("product-1", "2026-09-16");
    const firstKey = reportKey(first.productId, first.weekStart);
    const base = reportsValue({ [firstKey]: first });
    const local = reportsValue({ [firstKey]: { ...first, actions: [{ id: "pending", title: "Pending", priority: "Medium", dueDate: "", done: false }] } });
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, itemKey, value) {
      if (this === window.localStorage) throw new Error("Storage full");
      return originalSetItem.call(this, itemKey, value);
    });
    const statuses: Array<{ pending: number; error: string; recoveryError?: string }> = [];
    const editor = new SharedDashboardStorage(new Map([[key, response(base, "etag-1")]]), status => statuses.push(status));
    editor.setItem(key, local);
    expect(statuses.at(-1)).toMatchObject({ pending: 1, recoveryError: expect.stringContaining("recovery storage is unavailable") });

    const viewer = new SharedDashboardStorage(new Map([[key, { ...response(base, "etag-1"), canEdit: false }]]), vi.fn());
    expect(() => viewer.setItem(key, local)).toThrow(/view-only/);
    expect(viewer.getItem(key)).toBe(base);
  });
});
