"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, BarChart3, Copy, FileSearch, Layers, ListFilter, Search, Target, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { AUDIT_MODULES, auditCampaignLevel, auditDuplicates, auditRate, auditTotals, mapAuditAsins, parseAuditAds, parseAuditBusiness, parseSavedAudit, type AuditAd, type AuditData, type AuditModule } from "../domain/ppc-audit";
import { readAuditFile } from "../data/ppc-audit-files";
import s from "./ppc-audit-workspace.module.css";
import { AuditPerformanceSummary } from "./audit-performance-summary";
import { AuditWastedSpend } from "./audit-wasted-spend";
import { AuditOpportunities } from "./audit-opportunities";
import { AuditAdvertisedAsins } from "./audit-advertised-asins";
import { AuditCampaigns } from "./audit-campaigns";
import { AuditCampaignTypes } from "./audit-campaign-types";
import { AuditPlacement } from "./audit-placement";
import { AuditKeywords } from "./audit-keywords";
import { AuditMatchTypes } from "./audit-match-types";
import { AuditSearchTerms } from "./audit-search-terms";
import { AuditProductTargets } from "./audit-product-targets";

const STORAGE_KEY = "glassco.ppcUploadedAudit.v1";
const ICONS = [Activity, TrendingDown, TrendingUp, Layers, BarChart3, Layers, Target, Target, Target, Search, ListFilter, Search, Copy, Activity];
type TableRow = { name: string; detail?: string; spend: number; sales: number; orders: number; clicks: number; impressions: number; totalSales?: number; status?: string; members?: AuditAd[] };
function groupRows(rows: AuditAd[], key: (row: AuditAd) => string): TableRow[] {
  const groups = new Map<string, AuditAd[]>();
  rows.forEach(row => { const name = key(row) || "Not supplied"; const group = groups.get(name); if (group) group.push(row); else groups.set(name, [row]); });
  return [...groups].map(([name, members]) => ({ name, ...auditTotals(members), members }));
}
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
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [asin, setAsin] = useState("");
  const [type, setType] = useState("");
  const [match, setMatch] = useState("");
  const [brands, setBrands] = useState("");
  const [acosLimit, setAcosLimit] = useState(30);
  const [sort, setSort] = useState<{ key: "spend" | "sales" | "orders" | "clicks" | "impressions"; direction: number }>({ key: "spend", direction: -1 });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ppcInput = useRef<HTMLInputElement>(null);
  const businessInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active) return; try { const data = parseSavedAudit(localStorage.getItem(STORAGE_KEY)); if (data) { setAudit(data); setSaved(true); } } catch { /* Storage may be disabled. */ } });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (modal) dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [modal]);
  const ads = useMemo(() => mapAuditAsins(audit?.ads || [], catalog), [audit, catalog]);
  const scope = useMemo(() => ads.filter(row => (!asin || row.asin === asin) && (!type || row.type === type) && (!match || row.match === match) && (!query || [row.campaign, row.adGroup, row.asin, row.target, row.query].some(v => v.toLowerCase().includes(query.toLowerCase())))), [ads, asin, type, match, query]);
  const duplicates = auditDuplicates(scope);
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: audit?.currency || currency, maximumFractionDigits: 0 }).format(n);
  const count = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const rate = (n: number | null) => n == null ? "—" : `${count(n)}%`;
  const selectModule = (value: AuditModule) => { setModule(value); setPage(1); setExpanded(null); setCampaignFocus(undefined); };
  const reset = () => { setQuery(""); setAsin(""); setType(""); setMatch(""); setPage(1); };
  const chooseReport = (kind: "ppc" | "business", file: File | undefined) => {
    if (!file) return;
    if (kind === "ppc") setPpcFile(file); else setBusinessFile(file);
    setError(""); setConfirmed(false);
    if ((kind === "ppc" ? file : ppcFile) && (kind === "business" ? file : businessFile)) setModal(true);
  };
  const closeImport = () => { if (busy) return; setModal(false); opener.current?.focus(); };
  async function runAudit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!ppcFile || !businessFile || !confirmed || !validDate(start) || !validDate(end) || start > end || end > todayIso) { setError("Choose both reports, valid dates, and confirm their reporting period."); return; }
    setBusy(true);
    try {
      const [ppcSheets, businessSheets] = await Promise.all([readAuditFile(ppcFile), readAuditFile(businessFile)]);
      const data: AuditData = { version: 1, name: name.trim() || "Amazon PPC Audit", start, end, currency, importedAt: new Date().toISOString(), files: [ppcFile.name, businessFile.name], ads: parseAuditAds(ppcSheets), business: parseAuditBusiness(businessSheets) };
      setAudit(data); setSaved(false);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaved(true); } catch { /* Keep usable in the current session if storage is full. */ }
      setModal(false); reset(); selectModule("Performance Summary"); opener.current?.focus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "These reports could not be read."); }
    finally { setBusy(false); }
  }
  let rows: TableRow[] = [];
  if (module === "Product Target") rows = scope.filter(row => row.target && !row.query && /producttarget|target/.test(row.entity) && row.entity !== "keyword").map(row => ({ name: row.target, detail: row.campaign, ...auditTotals([row]), members: [row] }));
  else if (module === "Search Terms") rows = groupRows(scope.filter(row => row.query), row => row.query.toLowerCase());
  else if (module === "Match Type") rows = groupRows(scope.filter(row => row.target && !row.query), row => row.match);
  else if (module === "Brand Terms") {
    const terms = brands.split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
    if (terms.length) rows = groupRows(scope.filter(row => row.query), row => terms.some(term => row.query.toLowerCase().includes(term)) ? "Brand" : "Non-brand");
  } else if (module === "Duplicated Targets") rows = duplicates.map(members => ({ name: members[0].target, detail: `${members.length} targets · ${members[0].match || "unspecified match"}`, ...auditTotals(members), members, status: members[0].asin || members[0].sku ? "Review overlap" : "Product scope not supplied" }));
  else if (module === "Bidding Strategy") rows = groupRows(auditCampaignLevel(scope), row => row.strategy);
  rows.sort((a, b) => (a[sort.key] - b[sort.key]) * sort.direction || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(rows.length / 25)); const visiblePage = Math.min(page, pages); const visibleRows = rows.slice((visiblePage - 1) * 25, visiblePage * 25);
  function exportRows() {
    const escape = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [["Name", "Detail", "Spend", "Sales", "Orders", "Clicks", "Impressions", "ACOS", "Status"], ...rows.map(row => [row.name, row.detail || "", row.spend, row.sales, row.orders, row.clicks, row.impressions, auditRate(row.spend, row.sales) ?? "", row.status || ""])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `ppc-audit-${module.toLowerCase().replace(/\W+/g, "-")}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={s.workspace} aria-label="Amazon PPC Audit">
    <header className={s.toolbar}><div><strong>{audit?.name || "Amazon PPC Audit"}</strong><small>{audit ? `${audit.start} – ${audit.end} · 2 reports imported · ${saved ? "Saved on this device" : "Current session only"}` : "Upload Amazon reports to start an audit"}</small></div><div className={s.actions}><button type="button" disabled={busy} title={ppcFile?.name} onClick={e => { opener.current = e.currentTarget; ppcInput.current?.click(); }}><Upload size={13} aria-hidden="true" /> PPC Report{ppcFile ? " ✓" : ""}</button><button type="button" disabled={busy} className={s.primary} title={businessFile?.name} onClick={e => { opener.current = e.currentTarget; businessInput.current?.click(); }}><Upload size={13} aria-hidden="true" /> Business Report{businessFile ? " ✓" : ""}</button><input ref={ppcInput} hidden type="file" aria-label="PPC Report file" accept=".csv,.xlsx" onChange={e => { chooseReport("ppc", e.target.files?.[0]); e.currentTarget.value = ""; }} /><input ref={businessInput} hidden type="file" aria-label="Business Report file" accept=".csv,.xlsx" onChange={e => { chooseReport("business", e.target.files?.[0]); e.currentTarget.value = ""; }} /></div></header>
    <div className={s.body}><aside className={s.sidebar}><h2>Audit Navigation · {AUDIT_MODULES.length} Modules</h2><nav aria-label="Audit modules">{AUDIT_MODULES.map((label, i) => { const Icon = ICONS[i]; return <button key={label} type="button" aria-current={module === label ? "page" : undefined} onClick={() => selectModule(label)}><Icon aria-hidden="true" />{label}</button>; })}</nav><div className={s.sources}><strong>Data Sources</strong>{audit ? audit.files.map(file => <p key={file}>{file}</p>) : <p>PPC Bulk Operations<br />Amazon Business Report</p>}<p>Files are processed on this device.</p></div></aside>
    <main className={s.main}>{module !== "Performance Summary" && module !== "Wasted Ad Spend" && module !== "Opportunities" && module !== "Advertised ASIN" && module !== "Campaigns" && module !== "Campaign Type" && module !== "Placement" && module !== "Keyword Target" && module !== "Product Target" && module !== "Search Terms" && module !== "Match Type" ? <div className={s.heading}><div><h1>{module}</h1><p>{audit ? "Review findings from your uploaded reports." : "Amazon advertising and business report analysis."}</p></div><button type="button" disabled={!audit || !rows.length} onClick={exportRows}>Export CSV</button></div> : null}
      {module === "Performance Summary" ? <AuditPerformanceSummary key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onWasted={() => { reset(); selectModule("Wasted Ad Spend"); }} /> : module === "Wasted Ad Spend" ? <AuditWastedSpend key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Opportunities" ? <AuditOpportunities key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Advertised ASIN" ? <AuditAdvertisedAsins key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Campaigns" ? <AuditCampaigns key={`${audit?.importedAt || "empty"}:${campaignFocus || "all"}`} audit={audit} ads={ads} catalog={catalog} initialCampaignId={campaignFocus} /> : module === "Campaign Type" ? <AuditCampaignTypes key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Placement" ? <AuditPlacement key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : module === "Keyword Target" ? <AuditKeywords key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Product Target" ? <AuditProductTargets key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Search Terms" ? <AuditSearchTerms key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} /> : module === "Match Type" ? <AuditMatchTypes key={audit?.importedAt || "empty"} audit={audit} ads={ads} catalog={catalog} onCampaign={id => { selectModule("Campaigns"); setCampaignFocus(id); }} /> : !audit ? <div className={s.empty}><FileSearch size={36} aria-hidden="true" /><h2>Create your first PPC audit</h2><p>Use PPC Report and Business Report above. These two files populate all Audit tabs.</p>{ppcFile || businessFile ? <p role="status">{ppcFile && !businessFile ? "PPC Report selected. Add your Business Report." : businessFile && !ppcFile ? "Business Report selected. Add your PPC Report." : "Both reports selected. Confirm their reporting period to run the audit."}</p> : null}</div> : <>
        <div className={s.filters}><label>ASIN<select value={asin} onChange={e => { setAsin(e.target.value); setPage(1); }}><option value="">All ASINs</option>{[...new Set([...ads.map(row => row.asin), ...audit.business.map(row => row.asin)])].filter(Boolean).sort().map(id => <option key={id}>{id}</option>)}</select></label><label>Campaign type<select value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">All types</option>{[...new Set(ads.map(row => row.type))].sort().map(v => <option key={v}>{v}</option>)}</select></label><label>Match type<select value={match} onChange={e => { setMatch(e.target.value); setPage(1); }}><option value="">All match types</option>{[...new Set(ads.map(row => row.match))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select></label><label>Search<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Target, ASIN, campaign…" /></label><label>ACOS threshold %<input type="number" min="1" max="1000" value={acosLimit} onChange={e => setAcosLimit(Math.max(1, Number(e.target.value) || 1))} /></label><button type="button" onClick={reset}>Reset filters</button></div>
        <p className={s.note}>Dates and currency use your confirmation. ASIN metrics require a product match.</p>
        {module === "Brand Terms" ? <label>Brand names, separated by commas<input aria-label="Brand terms" value={brands} onChange={e => setBrands(e.target.value)} placeholder="Enter your brand names" /></label> : null}
        {module === "Duplicated Targets" ? <p className={s.note}>Overlap is a review signal, not a recommendation to pause targets. Confirm product and campaign intent before making changes.</p> : null}
        {!rows.length ? <div className={s.empty}><h2>No matching rows</h2><p>{module === "Brand Terms" && !brands.trim() ? "Enter brand names to classify search terms." : "No matching data in these two reports. Check the filters and report contents."}</p></div> : <><div className={s.tableWrap}><table className={s.table}><caption>{module}</caption><thead><tr><th scope="col">{"Entity / Target"}</th>{([ ["spend", "PPC Spend"], ["sales", "PPC Sales"], ["orders", "Orders"], ["clicks", "Clicks"], ["impressions", "Impressions"] ] as const).map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === -1 ? "descending" : "ascending" : "none"}><button type="button" onClick={() => setSort({ key, direction: sort.key === key ? -sort.direction : -1 })}>{label} {sort.key === key ? sort.direction === -1 ? "↓" : "↑" : "↕"}</button></th>)}<th scope="col">ACOS</th><th scope="col">Status / Detail</th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${row.name}:${index}`}><td><strong>{row.name}</strong>{row.detail ? <small>{row.detail}</small> : null}{module === "Duplicated Targets" ? <><button type="button" aria-expanded={expanded === row.name} onClick={() => setExpanded(expanded === row.name ? null : row.name)}>View {row.members?.length} targets</button>{expanded === row.name ? row.members?.map((member, i) => <small key={i}>{member.campaign} / {member.adGroup} · Bid {money(member.bid)} · Spend {money(member.spend)}</small>) : null}</> : null}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : money(row.spend)}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : money(row.sales)}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : count(row.orders)}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : count(row.clicks)}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : count(row.impressions)}</td><td>{row.status === "No ASIN-level ad metrics" ? "—" : rate(auditRate(row.spend, row.sales))}</td><td><span className={`${s.badge} ${row.sales && row.spend / row.sales * 100 > acosLimit ? s.danger : ""}`}>{row.status || (row.spend && !row.orders ? "Review no-order spend" : "Review")}</span></td></tr>)}</tbody></table></div><div className={s.footer}><span>{rows.length} rows · {audit.start} – {audit.end}</span><div className={s.actions}><button type="button" disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>Previous</button><span>Page {visiblePage} of {pages}</span><button type="button" disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)}>Next</button></div></div></>}
      </>}
    </main></div>
    {modal ? <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) closeImport(); }}><div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="create-audit-title" onKeyDown={e => { if (e.key === "Escape") closeImport(); if (e.key === "Tab") { const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []); const first = items[0]; const last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><form onSubmit={runAudit}><h2 id="create-audit-title">Create PPC Audit</h2><p>English Amazon exports · CSV or XLSX · 50 MB per file. Files stay on this device.</p><label>Audit identifier<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label><div className={s.actions}><label>Start date<input required type="date" value={start} onChange={e => setStart(e.target.value)} disabled={busy} /></label><label>End date<input required type="date" max={todayIso} value={end} onChange={e => setEnd(e.target.value)} disabled={busy} /></label><label>Report currency<select value={currency} onChange={e => setCurrency(e.target.value)} disabled={busy}>{["USD", "GBP", "EUR", "CAD", "AUD", "JPY"].map(code => <option key={code}>{code}</option>)}</select></label></div><p><strong>PPC Report:</strong> {ppcFile?.name}</p><p><strong>Business Report:</strong> {businessFile?.name}</p><label className={s.check}><input required type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Both reports use the selected dates and currency.</label>{error ? <p role="alert" className={s.note}>{error}</p> : null}<footer><button type="button" disabled={busy} onClick={closeImport}>Cancel</button><button className={s.primary} disabled={busy || !ppcFile || !businessFile || !confirmed} type="submit">{busy ? "Reading reports…" : "Run Audit"}</button></footer></form></div></div> : null}
  </section>;
}
