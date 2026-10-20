import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { PPC_DASHBOARD_STORAGE_KEY } from "../domain/ppc-dashboard-state";
import { DASHBOARD_STORES, isDashboardStoreKey, mergeDashboardValues, parseDashboardDocument, validateDashboardValue, type DashboardDocumentResponse, type DashboardStoreKey } from "../domain/shared-dashboard";

export type DashboardStorage = Pick<Storage, "getItem" | "setItem">;
export type SharedSaveStatus = { pending: number; error: string; recoveryError?: string };
export type DashboardResponses = Map<DashboardStoreKey, DashboardDocumentResponse>;
export const PPC_SHARED_REPORT_OUTBOX_KEY = "glassco.ppcSharedReportOutbox.v1";
const PPC_SHARED_REPORT_TAB_KEY = "glassco.ppcSharedReportTab.v1";
function reportOutboxKey() {
  if (typeof window === "undefined") return PPC_SHARED_REPORT_OUTBOX_KEY;
  try {
    let tabId = window.sessionStorage.getItem(PPC_SHARED_REPORT_TAB_KEY);
    if (!tabId || !/^[a-f0-9-]{36}$/i.test(tabId)) {
      tabId = crypto.randomUUID();
      window.sessionStorage.setItem(PPC_SHARED_REPORT_TAB_KEY, tabId);
    }
    return `${PPC_SHARED_REPORT_OUTBOX_KEY}:${tabId}`;
  } catch { return PPC_SHARED_REPORT_OUTBOX_KEY; }
}
class DashboardRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
type PendingSave = { value: string; baseValue: string | null; expectedEtag: string | null; operationId: string };

export async function requestDashboardStore(key: DashboardStoreKey, body?: { value: string; expectedEtag: string | null; operationId: string }): Promise<DashboardDocumentResponse> {
  const response = await fetch(withPpcBasePath(`/api/dashboard/state?key=${encodeURIComponent(key)}`), {
    method: body ? "PUT" : "GET", headers: { ...getPipelineAuthorizationHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok) throw new DashboardRequestError(typeof data?.error === "string" ? data.error : "Shared dashboard request failed.", response.status);
  if (!data || typeof data.canEdit !== "boolean" || !(data.etag === null || typeof data.etag === "string") || (data.document === null) !== (data.etag === null)) throw new Error("Incomplete shared dashboard response. Please retry.");
  return { document: data.document === null ? null : parseDashboardDocument(data.document, key), etag: data.etag, canEdit: data.canEdit };
}

export async function loadDashboardStores(): Promise<DashboardResponses> {
  return new Map(await Promise.all(DASHBOARD_STORES.map(async ({ key }) => [key, await requestDashboardStore(key)] as const)));
}

// A mounted workspace owns this adapter. It never changes the browser's legacy v1 stores.
export class SharedDashboardStorage implements DashboardStorage {
  private values = new Map<DashboardStoreKey, string>();
  private responses: DashboardResponses;
  private pending = new Map<DashboardStoreKey, PendingSave>();
  private running = false;
  private error = "";
  private recoveryError = "";
  private conflictRetryCount = 0;
  private invalidRecoveryData = false;
  private outboxKey = reportOutboxKey();
  private reportOutboxOwned = false;
  private legacyOutboxRaw: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(responses: DashboardResponses, private onStatus: (status: SharedSaveStatus) => void, private onRemoteChange: (keys: DashboardStoreKey[]) => void = () => {}) {
    this.responses = new Map(responses);
    for (const [key, result] of responses) if (result.document) this.values.set(key, result.document.value);
    this.restoreReportOutbox();
    if (this.pending.size || this.recoveryError) this.notify();
  }
  getItem(key: string) { return isDashboardStoreKey(key) ? this.values.get(key) ?? null : null; }
  setItem(key: string, raw: string) {
    if (!isDashboardStoreKey(key)) throw new Error("Unknown dashboard dataset.");
    const currentValue = this.values.get(key) ?? null;
    const value = key === PPC_DASHBOARD_STORAGE_KEY
      ? mergeDashboardValues(key, currentValue, raw, currentValue)
      : validateDashboardValue(key, raw);
    if (this.values.get(key) === value) return;
    // Viewers may retrieve fresh metrics in memory, but cannot persist changes for the team.
    if (!this.responses.get(key)?.canEdit) {
      if (key === PPC_DASHBOARD_STORAGE_KEY) throw new Error("This account has view-only dashboard access.");
      this.values.set(key, value);
      return;
    }
    this.values.set(key, value);
    const existing = this.pending.get(key);
    this.pending.set(key, {
      value,
      baseValue: existing?.baseValue ?? this.responses.get(key)?.document?.value ?? null,
      expectedEtag: this.responses.get(key)?.etag ?? null,
      operationId: crypto.randomUUID(),
    });
    if (key === PPC_DASHBOARD_STORAGE_KEY) this.reportOutboxOwned = true;
    if (this.error && this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.error = "";
    this.persistReportOutbox();
    this.notify();
    if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 500);
  }
  private restoreReportOutbox() {
    if (typeof window === "undefined" || !this.responses.get(PPC_DASHBOARD_STORAGE_KEY)?.canEdit) return;
    for (const key of [...new Set([PPC_SHARED_REPORT_OUTBOX_KEY, this.outboxKey])]) try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { version?: unknown; entry?: { value?: unknown; baseValue?: unknown } };
      if (parsed.version !== 1 || !parsed.entry || typeof parsed.entry.value !== "string"
        || !(parsed.entry.baseValue === null || typeof parsed.entry.baseValue === "string")) continue;
      const localValue = validateDashboardValue(PPC_DASHBOARD_STORAGE_KEY, parsed.entry.value);
      const baseValue = parsed.entry.baseValue === null ? null : validateDashboardValue(PPC_DASHBOARD_STORAGE_KEY, parsed.entry.baseValue);
      const remote = this.responses.get(PPC_DASHBOARD_STORAGE_KEY)!;
      const remoteValue = remote.document?.value ?? null;
      const merged = mergeDashboardValues(PPC_DASHBOARD_STORAGE_KEY, baseValue, localValue, this.values.get(PPC_DASHBOARD_STORAGE_KEY) ?? null);
      if (key === PPC_SHARED_REPORT_OUTBOX_KEY) this.legacyOutboxRaw = raw;
      this.reportOutboxOwned = true;
      if (merged === remoteValue) continue;
      this.values.set(PPC_DASHBOARD_STORAGE_KEY, merged);
      this.pending.set(PPC_DASHBOARD_STORAGE_KEY, {
        value: merged, baseValue: remoteValue, expectedEtag: remote.etag, operationId: crypto.randomUUID(),
      });
    } catch {
      // Invalid or unavailable recovery data never replaces the confirmed shared document.
      // Keep the original outbox so it remains available for manual recovery.
      this.invalidRecoveryData = true;
      this.recoveryError = "Saved browser recovery data could not be read. Download a local backup before clearing browser data.";
    }
    if (this.pending.has(PPC_DASHBOARD_STORAGE_KEY)) {
      this.persistReportOutbox();
      this.timer = setTimeout(() => { this.timer = undefined; this.notify(); void this.flush(); }, 0);
    } else if (this.reportOutboxOwned) {
      this.persistReportOutbox();
    }
  }
  private persistReportOutbox() {
    if (typeof window === "undefined") return;
    try {
      const item = this.pending.get(PPC_DASHBOARD_STORAGE_KEY);
      if (!item) {
        if (!this.reportOutboxOwned) return;
        window.localStorage.removeItem(this.outboxKey);
        if (this.legacyOutboxRaw && window.localStorage.getItem(PPC_SHARED_REPORT_OUTBOX_KEY) === this.legacyOutboxRaw) {
          window.localStorage.removeItem(PPC_SHARED_REPORT_OUTBOX_KEY);
          this.legacyOutboxRaw = null;
        }
        this.reportOutboxOwned = false;
        if (!this.invalidRecoveryData) this.recoveryError = "";
        return;
      }
      window.localStorage.setItem(this.outboxKey, JSON.stringify({
        version: 1, savedAt: new Date().toISOString(), entry: { value: item.value, baseValue: item.baseValue },
      }));
      if (!this.invalidRecoveryData) this.recoveryError = "";
    } catch {
      this.recoveryError = "Browser recovery storage is unavailable. Keep this tab open until the online save is confirmed.";
    }
  }
  private notify() { this.onStatus({ pending: this.pending.size, error: this.error, recoveryError: this.recoveryError }); }
  async flush() {
    if (this.running || this.error) return;
    this.running = true;
    try {
      while (this.pending.size) {
        const [key, initialItem] = this.pending.entries().next().value!;
        let item = initialItem;
        let conflicts = 0;
        let result: DashboardDocumentResponse;
        while (true) {
          try { result = await requestDashboardStore(key, item); break; }
          catch (error) {
            if (!(error instanceof DashboardRequestError) || error.status !== 409 || conflicts >= 5) throw error;
            conflicts += 1;
            const remote = await requestDashboardStore(key);
            const latestLocal = this.pending.get(key)?.value ?? item.value;
            const merged = mergeDashboardValues(key, this.responses.get(key)?.document?.value ?? null, latestLocal, remote.document?.value ?? null);
            if (merged === remote.document?.value && this.pending.get(key) === item) {
              this.responses.set(key, remote);
              this.values.set(key, merged);
              this.pending.delete(key);
              this.persistReportOutbox();
              this.conflictRetryCount = 0;
              this.notify();
              this.onRemoteChange([key]);
              result = remote;
              break;
            }
            item = { value: merged, baseValue: remote.document?.value ?? null, expectedEtag: remote.etag, operationId: crypto.randomUUID() };
            this.values.set(key, merged);
            this.responses.set(key, remote);
            this.pending.set(key, item);
            this.persistReportOutbox();
            this.notify();
            this.onRemoteChange([key]);
          }
        }
        if (this.pending.get(key) !== item && !this.pending.has(key)) continue;
        if (!result.document || result.document.value !== item.value) throw new Error("The server did not confirm this save. Keep the tab open and retry.");
        this.responses.set(key, result);
        this.conflictRetryCount = 0;
        if (this.pending.get(key) === item) this.pending.delete(key);
        else { const newer = this.pending.get(key)!; this.pending.set(key, { ...newer, baseValue: item.value, expectedEtag: result.etag }); }
        this.persistReportOutbox();
        this.notify();
      }
    } catch (error) {
      // A busy shared dataset can conflict repeatedly. Keep the edit queued and
      // retry with a fresh ETag instead of surfacing an old conflict as a dead end.
      const conflict = error instanceof DashboardRequestError && error.status === 409;
      this.conflictRetryCount = conflict ? this.conflictRetryCount + 1 : 0;
      this.error = conflict ? "Not saved online yet. Another edit keeps conflicting; retrying automatically." : error instanceof Error ? error.message : "Online save failed.";
      if (this.pending.size && !this.timer) this.timer = setTimeout(() => {
        this.timer = undefined;
        this.error = "";
        this.notify();
        void this.flush();
      }, conflict ? Math.min(30_000, 1_000 * 2 ** Math.min(this.conflictRetryCount, 5)) : 5_000);
    }
    finally { this.running = false; this.notify(); }
  }
  retry() { this.error = ""; this.notify(); void this.flush(); }
  exportData() { return Object.fromEntries(this.values); }
  hasPending() { return this.pending.size > 0; }
  sync(responses: DashboardResponses) {
    const changed: DashboardStoreKey[] = [];
    for (const [key, result] of responses) {
      if (this.pending.has(key)) continue;
      const current = this.responses.get(key);
      if (current?.etag === result.etag) continue;
      const currentSavedAt = current?.document ? Date.parse(current.document.savedAt) : 0;
      const nextSavedAt = result.document ? Date.parse(result.document.savedAt) : 0;
      if (currentSavedAt > nextSavedAt) continue;
      const protectedValue = key === PPC_DASHBOARD_STORAGE_KEY && result.document
        ? mergeDashboardValues(key, this.values.get(key) ?? null, result.document.value, this.values.get(key) ?? null)
        : null;
      this.responses.set(key, result);
      if (result.document) this.values.set(key, result.document.value); else this.values.delete(key);
      if (protectedValue && protectedValue !== result.document?.value) this.setItem(key, protectedValue);
      changed.push(key);
    }
    if (changed.length) this.onRemoteChange(changed);
    return changed.length > 0;
  }
}

let activeStorage: DashboardStorage | null = null;
export function attachDashboardStorage(storage: DashboardStorage) { activeStorage = storage; return () => { if (activeStorage === storage) activeStorage = null; }; }
export function dashboardStorage(): DashboardStorage {
  if (activeStorage) return activeStorage;
  // Standalone component tests exercise the unchanged v1 contracts.
  if (process.env.NODE_ENV === "test") return window.localStorage;
  throw new Error("Shared dashboard has not finished loading.");
}
