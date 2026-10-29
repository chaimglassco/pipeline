"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, BarChart3, Copy, Layers, ListFilter, Search, Target, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { AUDIT_MODULES, mapAuditAsins, parseSavedAudit, type AuditData, type AuditModule } from "../domain/ppc-audit";
import { importAuditReport } from "../data/audit-import-client";
import type { PpcImportResult } from "../data/audit-import-job";
import s from "./ppc-audit-workspace.module.css";
import { AuditPerformanceSummary } from "./audit-performance-summary";
import { AuditWastedSpend } from "./audit-wasted-spend";
import { AuditOpportunities } from "./audit-opportunities";
import { AuditAdvertisedAsins } from "./audit-advertised-asins";
import { AuditCampaigns } from "./audit-campaigns";
import { AuditCampaignTypes } from "./audit-campaign-types";
import { AuditPlacement } from "./audit-placement";
import { AuditKeywords } from "./audit-keywords";
import { AuditBiddingStrategies } from "./audit-bidding-strategies";
import { AuditDuplicates } from "./audit-duplicates";
import { AuditBrandTerms } from "./audit-brand-terms";
import { AuditMatchTypes } from "./audit-match-types";
import { AuditSearchTerms } from "./audit-search-terms";
import { AuditProductTargets } from "./audit-product-targets";

const STORAGE_KEY = "glassco.ppcUploadedAudit.v1";
const ICONS = [Activity, TrendingDown, TrendingUp, Layers, BarChart3, Layers, Target, Target, Target, Search, ListFilter, Search, Copy, Activity];
function validDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }

export function PpcAuditWorkspace({ todayIso, catalog }: { todayIso: string; catalog: { asin: string; sku: string; name: string }[] }) {
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [saved, setSaved] = useState(false);
  const [module, setModule] = useState<AuditModule>("Performance Summary");
  const [campaignFocus, setCampaignFocus] = useState<string | undefined>();
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Amazon PPC Audit");
  const [start, setStart] = useState(`${todayIso.slice(0, 7)}-01`);
  const [end, setEnd] = useState(todayIso);
  const [currency, setCurrency] = useState("USD");
  const [confirmed, setConfirmed] = useState(false);
  const [ppcFile, setPpcFile] = useState<File | null>(null);

  const [dateNotice, setDateNotice] = useState("");
  const ppcRead = useRef<{file: File; result: PpcImportResult} | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const importAbort = useRef<AbortController | null>(null);
  const readVersion = useRef({value:0});
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ppcInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const reads = readVersion.current;
    const abort = importAbort;
    queueMicrotask(() => { if (!active) return; try { const data = parseSavedAudit(localStorage.getItem(STORAGE_KEY)); if (data) { setAudit(data); setSaved(true); } } catch { /* Storage may be disabled. */ } });
    return () => { active = false; reads.value++; abort.current?.abort(); };
  }, []);
  useEffect(() => { if (modal) dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [modal]);
  const ads = useMemo(() => mapAuditAsins(audit?.ads || [], catalog), [audit, catalog]);

  const selectModule = (value: AuditModule) => { setModule(value); setCampaignFocus(undefined); };
  const chooseReport = async (file: File | undefined) => {
    if (!file) return;
    setPpcFile(file);
    setError(""); setConfirmed(false);
    setModal(true);

    const version = ++readVersion.current.value;
    const controller = new AbortController(); importAbort.current?.abort(); importAbort.current = controller;
    ppcRead.current = null; setStart(""); setEnd(""); setDateNotice("Reading PPC report dates…"); setBusy(true);
    try {
      const result = await importAuditReport({kind:"ppc",file,today:todayIso},controller.signal,setImportProgress);
      if (version !== readVersion.current.value) return;
      if (result.kind !== "ppc") throw new Error("Unexpected report type.");
      ppcRead.current = { file, result };
      const period = result.period;
      if (period) { setStart(period.start); setEnd(period.end); setDateNotice(`Dates detected from ${period.source}. Review the detected reporting period.`); }
      else setDateNotice("No reliable reporting dates found. Enter the report's actual date range; campaign start/end dates are not used.");
    } catch (failure) {
      if (version !== readVersion.current.value) return;
      setError(`PPC Report: ${failure instanceof Error ? failure.message : "Could not read this file."}`); setDateNotice("Enter dates manually after choosing a readable PPC report."); setModal(true);
    } finally { if (version === readVersion.current.value) setBusy(false); }
  };
  const closeImport = () => { importAbort.current?.abort(); readVersion.current.value++; setBusy(false); setImportProgress(""); setModal(false); opener.current?.focus(); };
  async function runAudit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!ppcFile || !confirmed || !validDate(start) || !validDate(end) || start > end || end > todayIso) { setError("Choose a PPC Report, valid dates, and confirm its reporting period."); return; }
    const controller = new AbortController(); importAbort.current?.abort(); importAbort.current = controller;
    setBusy(true);
    try {
      const ppc = ppcRead.current?.file === ppcFile ? ppcRead.current.result : await importAuditReport({kind:"ppc",file:ppcFile,today:todayIso},controller.signal,setImportProgress);
      if (controller.signal.aborted) return;
      if (ppc.kind !== "ppc") throw new Error("Unexpected report type.");
      const data: AuditData = { version: 1, name: name.trim() || "Amazon PPC Audit", start, end, currency, importedAt: new Date().toISOString(), files: [ppcFile.name], ads: ppc.ads, business: [] };
      setAudit(data); setSaved(false); ppcRead.current = null;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaved(true); } catch { /* Keep usable in the current session if storage is full. */ }
      setModal(false); selectModule("Performance Summary"); opener.current?.focus();
    } catch (failure) { controller.abort(); if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "These reports could not be read."); }
    finally { if (importAbort.current === controller) setBusy(false); }
  }
  return <section className={s.workspace} aria-label="Amazon PPC Audit">
    <header className={s.toolbar}><div><strong>{audit?.name || "Amazon PPC Audit"}</strong><small role={busy ? "status" : undefined}>{busy ? importProgress || "Reading report…" : audit ? `${audit.start} – ${audit.end} · ${audit.files.length} report${audit.files.length === 1 ? "" : "s"} imported · ${saved ? "Saved on this device" : "Current session only"}` : "Upload a PPC Report to start an audit"}</small></div><div className={s.actions}>{busy ? <button type="button" onClick={closeImport}>Cancel import</button> : null}<button type="button" disabled={busy} title={ppcFile?.name} onClick={e => { opener.current = e.currentTarget; ppcInput.current?.click(); }}><Upload size={13} aria-hidden="true" /> PPC Report{ppcFile ? " ✓" : ""}</button><input ref={ppcInput} hidden type="file" aria-label="PPC Report file" accept=".csv,.xlsx" onChange={e => { void chooseReport(e.target.files?.[0]); e.currentTarget.value = ""; }} /></div></header>
    <div className={s.body}><aside className={s.sidebar}><h2>Audit Navigation · {AUDIT_MODULES.length} Modules</h2><nav aria-label="Audit modules">{AUDIT_MODULES.map((label, i) => { const Icon = ICONS[i]; return <button key={label} type="button" aria-current={module === label ? "page" : undefined} onClick={() => selectModule(label)}><Icon aria-hidden="true" />{label}</button>; })}</nav><div className={s.sources}><strong>Data Sources</strong>{audit ? audit.files.map(file => <p key={file}>{file}</p>) : <p>Amazon PPC Bulk Operations</p>}<p>Files are processed on this device.</p></div></aside>
    <main className={s.main} tabIndex={0} aria-label="Audit report content">
      {module === "Performance Summary" ? <AuditPerformanceSummary key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onWasted={() => { selectModule("Wasted Ad Spend"); }} /> : module === "Wasted Ad Spend" ? <AuditWastedSpend key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Opportunities" ? <AuditOpportunities key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Advertised ASIN" ? <AuditAdvertisedAsins key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Campaigns" ? <AuditCampaigns key={`${audit?.importedAt || "empty"}:${campaignFocus || "all"}`} audit={audit} ads={ads} catalog={catalog} initialCampaignId={campaignFocus} /> : module === "Campaign Type" ? <AuditCampaignTypes key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Placement" ? <AuditPlacement key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Keyword Target" ? <AuditKeywords key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Product Target" ? <AuditProductTargets key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Search Terms" ? <AuditSearchTerms key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Match Type" ? <AuditMatchTypes key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Brand Terms" ? <AuditBrandTerms key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Duplicated Targets" ? <AuditDuplicates key={audit?.importedAt || "empty"} audit={audit} ads={ads} /> : module === "Bidding Strategy" ? <AuditBiddingStrategies key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : null}
    </main></div>
    {modal ? <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) closeImport(); }}><div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="create-audit-title" onKeyDown={e => { if (e.key === "Escape") closeImport(); if (e.key === "Tab") { const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []); const first = items[0]; const last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><form onSubmit={runAudit}><h2 id="create-audit-title">Create PPC Audit</h2><p>English Amazon exports · CSV or XLSX · 50 MB per file. Files stay on this device.</p>{dateNotice ? <p role="status">{dateNotice}</p> : null}<label>Audit identifier<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><div className={s.actions}><label>Start date<input required type="date" value={start} onChange={e => {setStart(e.target.value);setConfirmed(false);}} disabled={busy} /></label><label>End date<input required type="date" max={todayIso} value={end} onChange={e => {setEnd(e.target.value);setConfirmed(false);}} disabled={busy} /></label><label>Report currency<select value={currency} onChange={e => {setCurrency(e.target.value);setConfirmed(false);}} disabled={busy}>{["USD", "GBP", "EUR", "CAD", "AUD", "JPY"].map(code => <option key={code}>{code}</option>)}</select></label></div><p><strong>PPC Report:</strong> {ppcFile?.name}</p><label className={s.check}><input required type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />The PPC Report uses the selected dates and currency.</label>{error ? <p role="alert" className={s.note}>{error}</p> : null}<footer><button type="button" onClick={closeImport}>Cancel</button><button className={s.primary} disabled={busy || !ppcFile || !confirmed} type="submit">{busy ? "Reading reports…" : "Run Audit"}</button></footer></form></div></div> : null}
  </section>;
}
