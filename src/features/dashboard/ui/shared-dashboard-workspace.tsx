"use client";

import { useEffect, useRef, useState } from "react";
import { useGlasscoSession } from "@/components/glassco-session";
import { DASHBOARD_STORES, dashboardRecordCount, validateDashboardValue, type DashboardStoreKey } from "../domain/shared-dashboard";
import { attachDashboardStorage, loadDashboardStores, requestDashboardStore, SharedDashboardStorage, type DashboardResponses, type SharedSaveStatus } from "../state/shared-dashboard-client";
import { PpcPerformanceDashboard } from "./ppc-performance-dashboard";
import styles from "./shared-dashboard-workspace.module.css";

type ImportCandidate = { key: DashboardStoreKey; label: string; value: string; count: number; exists: boolean };
function downloadBackup(values: Record<string, string>, label: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), stores: values }, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${label}-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SharedDashboardWorkspaceClient({ initialToday }: { initialToday: string }) {
  const { canEdit, canAdmin } = useGlasscoSession();
  const [responses, setResponses] = useState<DashboardResponses | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SharedSaveStatus>({ pending: 0, error: "" });
  const [reload, setReload] = useState(0);
  const [remoteSync, setRemoteSync] = useState<{ version: number; keys: DashboardStoreKey[] }>({ version: 0, keys: [] });
  const storage = useRef<SharedDashboardStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDashboardStores().then(result => {
      if (cancelled) return;
      const local: ImportCandidate[] = [];
      if (canAdmin) {
        for (const store of DASHBOARD_STORES) {
          const raw = window.localStorage.getItem(store.key);
          if (!raw) continue;
          try {
            const count = dashboardRecordCount(store.key, raw);
            if (count && !result.get(store.key)?.document) local.push({ ...store, count, value: validateDashboardValue(store.key, raw), exists: false });
          } catch { setProblem(`The local ${store.label.toLowerCase()} could not be validated for sharing. Download a local backup before continuing; it has not been changed.`); }
        }
      }
      setResponses(result); setCandidates(local);
    }).catch(error => { if (!cancelled) setProblem(error instanceof Error ? error.message : "Could not load team data."); });
    return () => { cancelled = true; };
  }, [canAdmin, reload]);

  useEffect(() => {
    if (!responses || candidates.length) return;
    const adapter = new SharedDashboardStorage(responses, setStatus, keys => setRemoteSync(current => ({ version: current.version + 1, keys })));
    storage.current = adapter;
    const detach = attachDashboardStorage(adapter);
    const timer = setTimeout(() => setReady(true), 0);
    const warn = (event: BeforeUnloadEvent) => { if (adapter.hasPending()) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { clearTimeout(timer); detach(); window.removeEventListener("beforeunload", warn); };
  }, [responses, candidates]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let syncing = false;
    const sync = async () => {
      if (syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const latest = await loadDashboardStores();
        if (!cancelled) storage.current?.sync(latest);
      } catch { /* Keep confirmed shared data visible; the next interval or focus retries. */ }
      finally { syncing = false; }
    };
    const interval = window.setInterval(() => { void sync(); }, 15_000);
    window.addEventListener("focus", sync);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", sync); };
  }, [ready]);

  const exportLocal = () => downloadBackup(Object.fromEntries(DASHBOARD_STORES.flatMap(({ key }) => { const value = window.localStorage.getItem(key); return value ? [[key, value]] : []; })), "ppc-local-backup");
  const migrate = async () => {
    if (!responses || !canAdmin) return;
    setBusy(true); setProblem(""); exportLocal();
    const next = new Map(responses);
    const remaining = [...candidates];
    try {
      for (const item of candidates) {
        const result = await requestDashboardStore(item.key, { value: item.value, expectedEtag: null, operationId: crypto.randomUUID() });
        next.set(item.key, result); remaining.shift();
      }
    } catch (error) { setProblem(error instanceof Error ? error.message : "Import failed. Your local data is unchanged."); }
    finally { setResponses(next); setCandidates(remaining); setBusy(false); }
  };
  const refresh = () => {
    if (storage.current?.hasPending()) return;
    setReady(false); setResponses(null); setCandidates([]); setProblem(""); setStatus({ pending: 0, error: "" }); setReload(value => value + 1);
  };

  return <>
    <section className={styles.bar} aria-label="Shared dashboard status">
      <div><strong>Team dashboard</strong><p role={status.error || status.recoveryError || problem ? "alert" : "status"}>{status.error || status.recoveryError || problem || (status.pending ? `Saving ${status.pending} dataset${status.pending === 1 ? "" : "s"} online… Keep this tab open.` : ready ? canEdit ? "Shared data loaded · Changes save online · Team updates sync automatically" : "Shared data loaded · View-only access" : "Loading shared dashboard…")}</p></div>
      <div className={styles.actions}>
        <button type="button" onClick={exportLocal}>Download local backup</button>
        {status.error ? <><button type="button" onClick={() => downloadBackup(storage.current?.exportData() ?? {}, "ppc-pending-changes")}>Download pending changes</button><button type="button" onClick={() => storage.current?.retry()}>Retry save</button></> : null}
        <button type="button" disabled={busy || status.pending > 0} onClick={refresh}>Refresh team data</button>
      </div>
    </section>
    {candidates.length ? <section className={styles.import} aria-label="Share existing dashboard data"><h2>Share this browser’s existing dashboard data</h2><p>The following datasets are not online yet. Importing creates shared copies for the team and downloads a backup. Your existing local data is kept. Datasets already online are never replaced by this import.</p><ul>{candidates.map(item => <li key={item.key}>{item.label}: {item.count} records</li>)}</ul><button type="button" disabled={busy} onClick={() => void migrate()}>{busy ? "Sharing…" : "Back up and share these datasets"}</button><button type="button" disabled={busy} onClick={() => { setCandidates([]); setProblem(""); }}>Use shared data without importing</button></section> : null}
    {ready && !candidates.length ? <PpcPerformanceDashboard key={reload} initialToday={initialToday} remoteSync={remoteSync} sharedSaveStatus={status} canEdit={canEdit} /> : !candidates.length ? <p className={styles.wait}>{problem ? "Team data is unavailable. Retry with Refresh team data. Local records have not been changed." : "Connecting to the shared dashboard…"}</p> : null}
  </>;
}

export function SharedDashboardWorkspace({ initialToday }: { initialToday: string }) {
  // Page-level tests exercise the original dashboard component directly and do not provide a network session.
  // Production always uses the shared wrapper below this boundary.
  if (process.env.NODE_ENV === "test") return <PpcPerformanceDashboard initialToday={initialToday} />;
  return <SharedDashboardWorkspaceClient initialToday={initialToday} />;
}
