"use client";
import { CheckCircle2, FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatWeekRange } from "../domain/ppc-dashboard-state";
import type { WeeklyImportHistoryEntry } from "../domain/weekly-csv-import";
import s from "./manual-weekly-metrics.module.css";
import w from "./weekly-import-dialog.module.css";

export type WeeklyImportProgress = { percent: number; label: string };
export type WeeklyImportOutcome = { products: number; missing: number; warning: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function WeeklyImportDialog({ weekStart: initialWeekStart, weekOptions, history, onImport, onClose }: {
  weekStart: string;
  /** Week starts the files can be applied to, newest first. */
  weekOptions: string[];
  history: WeeklyImportHistoryEntry[];
  onImport: (files: File[], weekStart: string, progress: (step: WeeklyImportProgress) => void) => Promise<WeeklyImportOutcome>;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [importedWeek, setImportedWeek] = useState(initialWeekStart);
  const [progress, setProgress] = useState<WeeklyImportProgress | null>(null);
  const [outcome, setOutcome] = useState<WeeklyImportOutcome | null>(null);
  const [error, setError] = useState("");
  const busy = progress != null && progress.percent < 100 && !error;
  const dialog = useRef<HTMLDivElement>(null);
  const previousImport = history.find(entry => entry.weekStart === weekStart);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLElement>("select,input,button")?.focus(); return () => previous?.focus(); }, []);

  const run = async () => {
    setError(""); setOutcome(null); setProgress({ percent: 0, label: "Starting…" });
    try {
      const result = await onImport(files, weekStart, setProgress);
      setImportedWeek(weekStart);
      setOutcome(result);
      setFiles([]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The files could not be imported.");
    }
  };

  return <div className={s.backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="weekly-import-heading" onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)") ?? []);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header><h2 id="weekly-import-heading">Import week from CSV</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close import">×</button></header>
      <label className={w.week}><span>Apply to week</span>
        <select value={weekStart} disabled={busy} onChange={event => { setWeekStart(event.target.value); setOutcome(null); setError(""); setProgress(null); }}>
          {[...new Set([weekStart, ...weekOptions])].sort((a, b) => b.localeCompare(a)).map(option => <option key={option} value={option}>{formatWeekRange(option)}</option>)}
        </select></label>
      <p>Upload the Scale Insights Products export (ProductStats.csv) for PPC performance, the Amazon Business Report by Child ASIN, or both, exported for exactly <strong>{formatWeekRange(weekStart)}</strong>. A file you leave out keeps its saved numbers. No Scale Insights requests are used.</p>
      {previousImport ? <p className={w.notice} role="note">Already imported {when(previousImport.importedAt)} by {previousImport.by} ({previousImport.files.join(" + ")}). Importing again replaces those numbers; it does not add to them.</p> : null}
      <label className={w.picker}><FileUp aria-hidden="true" /><span>{files.length ? files.map(file => file.name).join(" + ") : "Choose PPC and/or Business Report CSV"}</span>
        <input className="sr-only" type="file" accept=".csv,text/csv" multiple aria-label="Choose CSV files" disabled={busy} onChange={event => { setFiles([...(event.target.files ?? [])]); setOutcome(null); setError(""); setProgress(null); event.target.value = ""; }} /></label>
      {progress ? <div className={w.progress}>
        <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className={w.track}><span style={{ width: `${progress.percent}%` }} data-state={error ? "error" : progress.percent === 100 ? "done" : "running"} /></div>
        <small aria-live="polite">{error ? "Import stopped." : progress.label}</small>
      </div> : null}
      {error ? <p className={w.error} role="alert">{error}</p> : null}
      {outcome ? <p className={w.done} role="status"><CheckCircle2 aria-hidden="true" />Completed: {outcome.products} products updated for {formatWeekRange(importedWeek)}.{outcome.missing ? ` ${outcome.missing} not in the files kept their data.` : ""}{outcome.warning ? ` ${outcome.warning}` : ""}</p> : null}
      <footer><button type="button" onClick={onClose} disabled={busy}>{outcome ? "Done" : "Cancel"}</button><button type="button" onClick={() => void run()} disabled={busy || !files.length}>{busy ? "Importing…" : "Import"}</button></footer>
      <section className={w.history} aria-labelledby="weekly-import-history">
        <h3 id="weekly-import-history">Upload history</h3>
        {!history.length ? <p>No uploads yet.</p> : <div className={w.historyScroll}><table>
          <thead><tr><th scope="col">Uploaded</th><th scope="col">Week</th><th scope="col">Products</th><th scope="col">By</th><th scope="col">Files</th></tr></thead>
          <tbody>{history.map(entry => <tr key={entry.id}><td>{when(entry.importedAt)}</td><td>{formatWeekRange(entry.weekStart)}</td><td>{entry.products}</td><td>{entry.by}</td><td>{entry.files.join(", ")}</td></tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
}
