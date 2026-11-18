"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, BarChart3, CheckCircle2, Copy, Layers, ListFilter, Search, Settings, Store, Target, TrendingDown, TrendingUp, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { AUDIT_MODULES, mapAuditAsins, type AuditData, type AuditModule, type AuditWasteRules } from "../domain/ppc-audit";
import { AuditSettingsDialog } from "./audit-settings-dialog";
import { clearAudit, loadAudit, saveAudit } from "../data/audit-storage";
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
import { cloudAuditRequest } from "../data/cloud-audit-client";
const CloudAuditWorkspace=lazy(()=>import("./cloud-audit-workspace").then(module=>({default:module.CloudAuditWorkspace})));

/** Toolbar button for one report: plain upload when empty; once loaded, a check mark and a menu to replace or remove the file. */
function ReportButton({ label, icon, file, disabled, title, onPick, onRemove }: { label: string; icon: ReactNode; file?: string; disabled: boolean; title: string; onPick: () => void; onRemove: () => void }) {
  if (!file) return <button type="button" disabled={disabled} title={title} onClick={onPick}>{icon}{label}</button>;
  const choose = (event: React.MouseEvent<HTMLElement>, action: () => void) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; action(); };
  return <details className={s.fileMenu} onToggle={e => { if (disabled) e.currentTarget.open = false; }}>
    <summary aria-label={`${label} loaded: ${file}`} title={file} aria-disabled={disabled}>{icon}{label}<CheckCircle2 className={s.loaded} size={14} aria-hidden="true" /></summary>
    <div role="menu" aria-label={`${label} file`}>
      <p><small>Loaded file</small>{file}</p>
      <button type="button" role="menuitem" onClick={e => choose(e, onPick)}>Replace file</button>
      <button type="button" role="menuitem" className={s.danger} onClick={e => choose(e, onRemove)}>Remove file</button>
    </div>
  </details>;
}
const ICONS = [Activity, TrendingDown, TrendingUp, Layers, BarChart3, Layers, Target, Target, Target, Search, ListFilter, Search, Copy, Activity];

export function PpcAuditWorkspace({ todayIso, catalog }: { todayIso: string; catalog: { asin: string; sku: string; name: string }[] }) {
  const [cloud,setCloud]=useState<{enabled:boolean;canEdit:boolean}|null>(null);
  const [legacy,setLegacy]=useState(false);
  useEffect(()=>{if(process.env.NEXT_PUBLIC_PPC_CLOUD_AUDITS_ENABLED!=="true")return;let current=true;cloudAuditRequest<{enabled:boolean;canEdit:boolean}>("/config").then(value=>{if(current)setCloud(value);}).catch(()=>{if(current)setCloud({enabled:false,canEdit:false});});return()=>{current=false;};},[]);
  if(cloud?.enabled&&!legacy)return <Suspense fallback={<p>Loading shared audits…</p>}><CloudAuditWorkspace todayIso={todayIso} canEdit={cloud.canEdit} onLegacy={()=>setLegacy(true)}/></Suspense>;
  return <>{cloud?.enabled&&<button onClick={()=>setLegacy(false)}>Return to shared audits · local audits are not shared</button>}<LegacyPpcAuditWorkspace todayIso={todayIso} catalog={catalog}/></>;
}

function LegacyPpcAuditWorkspace({ todayIso, catalog }: { todayIso: string; catalog: { asin: string; sku: string; name: string }[] }) {
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [saved, setSaved] = useState(false);
  const [module, setModule] = useState<AuditModule>("Performance Summary");
  const [campaignFocus, setCampaignFocus] = useState<string | undefined>();
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Amazon PPC Audit");
  const [ppcFile, setPpcFile] = useState<File | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [dateNotice, setDateNotice] = useState("");
  const ppcRead = useRef<{file: File; result: PpcImportResult} | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const importAbort = useRef<AbortController | null>(null);
  const readVersion = useRef({value:0});
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ppcInput = useRef<HTMLInputElement>(null);
  const businessInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const reads = readVersion.current;
    const abort = importAbort;
    void loadAudit().then(data => { if (active && data) { setAudit(current => current ?? data); setSaved(true); } });
    return () => { active = false; reads.value++; abort.current?.abort(); };
  }, []);
  useEffect(() => { if (modal) dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [modal]);
  // Remount modules when a Business Report arrives so their business-only columns appear.
  const moduleKey = `${audit?.importedAt || "empty"}:${audit?.business.length ?? 0}`;
  const ads = useMemo(() => mapAuditAsins(audit?.ads || [], catalog), [audit, catalog]);

  const selectModule = (value: AuditModule) => { setModule(value); setCampaignFocus(undefined); };
  const chooseReport = async (file: File | undefined) => {
    if (!file) return;
    setPpcFile(file);
    setError("");
    setModal(true);

    const version = ++readVersion.current.value;
    const controller = new AbortController(); importAbort.current?.abort(); importAbort.current = controller;
    ppcRead.current = null; setDateNotice("Reading PPC report dates…"); setBusy(true);
    try {
      const result = await importAuditReport({kind:"ppc",file,today:todayIso},controller.signal,setImportProgress);
      if (version !== readVersion.current.value) return;
      if (result.kind !== "ppc") throw new Error("Unexpected report type.");
      ppcRead.current = { file, result };
      const period = result.period;
      const repeatedNote = result.repeatedRows ? ` Skipped ${result.repeatedRows} identical repeated row${result.repeatedRows === 1 ? "" : "s"}.` : "";
      if (period) setDateNotice(`Dates detected from ${period.source}.${repeatedNote}`);
      else setDateNotice(`Reporting dates unavailable.${repeatedNote}`);
    } catch (failure) {
      if (version !== readVersion.current.value) return;
      setError(`PPC Report: ${failure instanceof Error ? failure.message : "Could not read this file."}`); setDateNotice(""); setModal(true);
    } finally { if (version === readVersion.current.value) setBusy(false); }
  };
  // Rule edits from the Wasted Ad Spend page update the saved audit, so every page uses the same rules.
  const changeRules = (wasteRules: AuditWasteRules) => {
    if (!audit) return;
    const next = { ...audit, wasteRules };
    setAudit(next); setSaved(false);
    void saveAudit(next).then(ok => setSaved(ok));
  };
  // A Business Report joins the current audit (Total Sales, Organic, TACOS). A new PPC import starts without one.
  const chooseBusiness = async (file: File | undefined) => {
    if (!file || !audit) return;
    const controller = new AbortController(); importAbort.current?.abort(); importAbort.current = controller;
    setError(""); setBusy(true);
    try {
      const result = await importAuditReport({ kind: "business", file, today: todayIso }, controller.signal, setImportProgress);
      if (controller.signal.aborted) return;
      if (result.kind !== "business") throw new Error("Unexpected report type.");
      const next: AuditData = { ...audit, business: result.business, files: [audit.files[0], file.name] };
      setAudit(next); setSaved(false);
      void saveAudit(next).then(ok => setSaved(ok));
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(`Business Report: ${failure instanceof Error ? failure.message : "Could not read this file."}`);
    } finally { if (importAbort.current === controller) setBusy(false); }
  };
  const removePpc = () => {
    if (!audit || !window.confirm(`Remove ${audit.files[0]}? This clears the whole audit${audit.business.length ? ", including the Business Report" : ""}, and it cannot be undone.`)) return;
    setAudit(null); setSaved(false); setPpcFile(null); ppcRead.current = null; setError("");
    void clearAudit();
  };
  const removeBusiness = () => {
    if (!audit) return;
    const next: AuditData = { ...audit, business: [], files: [audit.files[0]] };
    setAudit(next); setSaved(false); setError("");
    void saveAudit(next).then(ok => setSaved(ok));
  };
  const closeImport = () => { importAbort.current?.abort(); readVersion.current.value++; setBusy(false); setImportProgress(""); setModal(false); opener.current?.focus(); };
  async function runAudit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!ppcFile || busy) return;
    const controller = new AbortController(); importAbort.current?.abort(); importAbort.current = controller;
    setBusy(true);
    try {
      const ppc = ppcRead.current?.file === ppcFile ? ppcRead.current.result : await importAuditReport({kind:"ppc",file:ppcFile,today:todayIso},controller.signal,setImportProgress);
      if (controller.signal.aborted) return;
      if (ppc.kind !== "ppc") throw new Error("Unexpected report type.");
      const data: AuditData = { version: 1, name: name.trim() || "Amazon PPC Audit", start: ppc.period?.start ?? "", end: ppc.period?.end ?? "", currency: "USD", importedAt: new Date().toISOString(), files: [ppcFile.name], ads: ppc.ads, business: [], ...(audit?.wasteRules ? { wasteRules: audit.wasteRules } : {}) };
      setAudit(data); setSaved(false); ppcRead.current = null;
      // Keeps working for the current session if no storage can hold it.
      void saveAudit(data).then(ok => setSaved(ok));
      setModal(false); selectModule("Performance Summary"); opener.current?.focus();
    } catch (failure) { controller.abort(); if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "These reports could not be read."); }
    finally { if (importAbort.current === controller) setBusy(false); }
  }
  return <section className={s.workspace} aria-label="Amazon PPC Audit">
    <header className={s.toolbar}><div><strong>{audit?.name || "Amazon PPC Audit"}</strong><small role={busy ? "status" : undefined}>{busy ? importProgress || "Reading report…" : audit ? `${audit.start ? `${audit.start} – ${audit.end}` : "Reporting dates unavailable"} · ${audit.files.length} report${audit.files.length === 1 ? "" : "s"} imported · ${saved ? "Saved on this device" : "Current session only"}` : "Upload a PPC Report to start an audit"}</small></div><div className={s.actions}><button type="button" className={s.iconButton} aria-label="Audit settings" title={audit ? "Audit settings" : "Import a PPC Report to change settings"} disabled={!audit || busy} onClick={() => setSettingsOpen(true)}><Settings size={15} aria-hidden="true" /></button>{busy ? <button type="button" onClick={closeImport}>Cancel import</button> : null}<ReportButton label="PPC Report" icon={<Upload size={14} aria-hidden="true" />} file={audit?.files[0]} disabled={busy} title="Upload an Amazon bulk or search-term report" onPick={() => { opener.current = null; ppcInput.current?.click(); }} onRemove={removePpc} /><ReportButton label="Business Report" icon={<Store size={14} aria-hidden="true" />} file={audit?.business.length ? audit.files[1] || "Business Report" : undefined} disabled={busy || !audit} title={audit ? "Add the Detail Page Sales and Traffic by Child Item report" : "Import a PPC Report first"} onPick={() => businessInput.current?.click()} onRemove={removeBusiness} /><input ref={businessInput} hidden type="file" aria-label="Business Report file" accept=".csv,.xlsx" onChange={e => { void chooseBusiness(e.target.files?.[0]); e.currentTarget.value = ""; }} /><input ref={ppcInput} hidden type="file" aria-label="PPC Report file" accept=".csv,.xlsx" onChange={e => { void chooseReport(e.target.files?.[0]); e.currentTarget.value = ""; }} /></div></header>
    {error && !modal ? <p role="alert" className={`${s.note} ${s.toolbarAlert}`}>{error}</p> : null}
    <div className={s.body}><aside className={s.sidebar}><h2>Audit Navigation · {AUDIT_MODULES.length} Modules</h2><nav aria-label="Audit modules">{AUDIT_MODULES.map((label, i) => { const Icon = ICONS[i]; return <button key={label} type="button" aria-current={module === label ? "page" : undefined} onClick={() => selectModule(label)}><Icon aria-hidden="true" />{label}</button>; })}</nav><div className={s.sources}><strong>Data Sources</strong>{audit ? audit.files.map(file => <p key={file}>{file}</p>) : <p>Amazon PPC Bulk Operations</p>}<p>Files are processed on this device.</p></div></aside>
    <main className={s.main} tabIndex={0} aria-label="Audit report content">
      {module === "Performance Summary" ? <AuditPerformanceSummary key={moduleKey} audit={audit} ads={ads} catalog={catalog} onWasted={() => { selectModule("Wasted Ad Spend"); }} /> : module === "Wasted Ad Spend" ? <AuditWastedSpend key={moduleKey} audit={audit} ads={ads} catalog={catalog} onRulesChange={changeRules} /> : module === "Opportunities" ? <AuditOpportunities key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Advertised ASIN" ? <AuditAdvertisedAsins key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Campaigns" ? <AuditCampaigns key={`${audit?.importedAt || "empty"}:${campaignFocus || "all"}`} audit={audit} ads={ads} catalog={catalog} initialCampaignId={campaignFocus} /> : module === "Campaign Type" ? <AuditCampaignTypes key={moduleKey} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Placement" ? <AuditPlacement key={moduleKey} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Keyword Target" ? <AuditKeywords key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Product Target" ? <AuditProductTargets key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Search Terms" ? <AuditSearchTerms key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Match Type" ? <AuditMatchTypes key={moduleKey} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Brand Terms" ? <AuditBrandTerms key={moduleKey} audit={audit} ads={ads} catalog={catalog} /> : module === "Duplicated Targets" ? <AuditDuplicates key={moduleKey} audit={audit} ads={ads} /> : module === "Bidding Strategy" ? <AuditBiddingStrategies key={moduleKey} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : null}
    </main></div>
    {settingsOpen && audit ? <AuditSettingsDialog rules={audit.wasteRules} onClose={() => setSettingsOpen(false)} onSave={rules => { changeRules(rules); setSettingsOpen(false); }} /> : null}
    {modal ? <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) closeImport(); }}><div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="create-audit-title" onKeyDown={e => { if (e.key === "Escape") closeImport(); if (e.key === "Tab") { const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []); const first = items[0]; const last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><form onSubmit={runAudit}><h2 id="create-audit-title">Create PPC Audit</h2><p>English Amazon exports · CSV or XLSX · 50 MB per file. Files stay on this device.</p>{dateNotice ? <p role="status">{dateNotice}</p> : null}<label>Audit identifier<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><p><strong>PPC Report:</strong> {ppcFile?.name}</p>{error ? <p role="alert" className={s.note}>{error}</p> : null}<footer><button type="button" onClick={closeImport}>Cancel</button><button className={s.primary} disabled={busy || !ppcFile} type="submit">{busy ? "Reading reports…" : "Run Audit"}</button></footer></form></div></div> : null}
  </section>;
}
