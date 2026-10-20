"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Download, SlidersHorizontal, TrendingDown, X } from "lucide-react";
import { auditCampaignLevel, auditRate, auditTotals, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { DEFAULT_WASTE_RULES, readWasteReview, validWasteRules, wasteFindings, type WasteFinding, type WasteRules, type WasteStatus } from "../domain/ppc-audit-waste";
import s from "./audit-wasted-spend.module.css";

const REVIEW_KEY = "glassco.ppcWasteReview.v1";
const DETAIL_COLUMNS = ["ASIN / Product", "Campaign & Ad Group", "Source", "Search Term / Target", "Match", "Spend", "Waste $", "Waste %", "Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Waste Reason", "Severity", "Recommended Action", "Status"];
const RULE_FIELDS = [["minClicks", "Min Clicks"], ["minSpend", "Min Spend"], ["acos", "Cutoff ACOS (%)"], ["cvr", "Min CVR Floor (%)"], ["cpc", "Max Acceptable CPC"]] as const;
type Product = { asin: string; sku: string; name: string };
type Breakdown = { name: string; spend: number; count: number };
function breakdown(rows: WasteFinding[], key: (f: WasteFinding) => string): Breakdown[] {
  const groups = new Map<string, Breakdown>();
  for (const finding of rows) { const name = key(finding); const group = groups.get(name) || { name, spend: 0, count: 0 }; group.spend += finding.row.spend; group.count++; groups.set(name, group); }
  return [...groups.values()].sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
}

export function AuditWastedSpend({ audit, ads, catalog }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[] }) {
  const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES);
  const [draft, setDraft] = useState<WasteRules>(DEFAULT_WASTE_RULES);
  const [statuses, setStatuses] = useState<Record<string, WasteStatus>>({});
  const [persistence, setPersistence] = useState("");
  const [asins, setAsins] = useState<string[]>([]);
  const [asinSearch, setAsinSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("");
  const [match, setMatch] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState("");
  const [query, setQuery] = useState("");
  const [minimum, setMinimum] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [detailAsin, setDetailAsin] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [asinPage, setAsinPage] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState({ key: "spend", descending: true });
  const dialog = useRef<HTMLDivElement>(null);
  const ruleButton = useRef<HTMLButtonElement>(null);
  const detailsSection = useRef<HTMLElement>(null);
  const auditId = audit?.importedAt || "";
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !auditId) return; try { const saved = readWasteReview(localStorage.getItem(REVIEW_KEY), auditId); if (saved) { setRules(saved.rules); setStatuses(saved.statuses); setPersistence("Saved on this device"); } } catch { /* Storage is optional. */ } });
    return () => { active = false; };
  }, [auditId]);
  useEffect(() => { if (drawer) dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [drawer]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const all = useMemo(() => wasteFindings(ads, rules), [ads, rules]);
  const ids = [...new Set(ads.map(r => r.asin || "Unmapped"))].sort();
  const campaignKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId]);
  const campaigns = [...new Map(ads.map(row => [campaignKey(row), `${row.campaign} · ${row.type}`])).entries()];
  const base = ads.filter(row => (!asins.length || asins.includes(row.asin || "Unmapped")) && (!campaign || campaignKey(row) === campaign) && (!match || row.match === match));
  const totals = auditTotals(auditCampaignLevel(base));
  const findingStatus = (finding: WasteFinding) => statuses[finding.id] || "Open";
  const findings = all.filter(f => (!asins.length || asins.includes(f.row.asin || "Unmapped")) && (!campaign || campaignKey(f.row) === campaign) && (!match || f.row.match === match) && (!source || f.source === source) && (!reason || f.reasons.includes(reason)) && (!severity || f.severity === severity) && (!statusFilter || findingStatus(f) === statusFilter) && f.row.spend >= (Number(minimum) || 0) && [f.row.asin, f.row.sku, products.get(f.row.asin)?.name || "", f.row.campaign, f.row.adGroup, f.row.target, f.row.query].some(v => v.toLowerCase().includes(query.toLowerCase())));
  const waste = findings.reduce((sum, f) => sum + f.row.spend, 0);
  const byAsin = breakdown(findings, f => f.row.asin || "Unmapped");
  const bySource = breakdown(findings, f => f.source);
  const byMatch = breakdown(findings, f => f.row.match || (f.source === "Product Targets" ? "Product ASIN" : "Not supplied"));
  const byReason = breakdown(findings, f => f.reason);
  const adsByAsin = new Map<string, AuditAd[]>();
  for (const row of base) { const id = row.asin || "Unmapped"; const group = adsByAsin.get(id); if (group) group.push(row); else adsByAsin.set(id, [row]); }
  const findingsByAsin = new Map<string, WasteFinding[]>();
  for (const f of findings) { const id = f.row.asin || "Unmapped"; const group = findingsByAsin.get(id); if (group) group.push(f); else findingsByAsin.set(id, [f]); }
  const money = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const count = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const percent = (a: number, b: number) => { const rate = auditRate(a, b); return rate === null || !audit ? "—" : `${count(rate)}%`; };
  function save(nextRules: WasteRules, nextStatuses: Record<string, WasteStatus>) {
    if (!audit) return;
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify({ version: 1, auditId, rules: nextRules, statuses: nextStatuses })); setPersistence("Saved on this device"); }
    catch { setPersistence("Current session only — device storage unavailable"); }
  }
  function updateStatus(id: string, status: WasteStatus) { const next = { ...statuses, [id]: status }; setStatuses(next); save(rules, next); }
  function reset() { setAsins([]); setAsinSearch(""); setCampaign(""); setSource(""); setMatch(""); setReason(""); setSeverity(""); setQuery(""); setMinimum(""); setStatusFilter(""); setDetailAsin(null); setPage(1); setAsinPage(1); }
  function closeRules() { setDrawer(false); ruleButton.current?.focus(); }
  function applyRules(event: FormEvent) { event.preventDefault(); if (!validWasteRules(draft)) { setRuleError("Enter valid non-negative thresholds. ACOS and CPC must be above zero; CVR must be 0–100."); return; } setRules(draft); save(draft, statuses); setPage(1); setAsinPage(1); closeRules(); }
  function viewDetails(asin: string | null) { setDetailAsin(asin); setPage(1); detailsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const detailRows = findings.filter(f => detailAsin === null || (f.row.asin || "Unmapped") === detailAsin);
  detailRows.sort((a, b) => { const value = (f: WasteFinding) => sort.key === "sales" ? f.row.sales : sort.key === "clicks" ? f.row.clicks : sort.key === "orders" ? f.row.orders : f.row.spend; return (value(a) - value(b)) * (sort.descending ? -1 : 1) || a.id.localeCompare(b.id); });
  const pages = Math.max(1, Math.ceil(detailRows.length / 25)), currentPage = Math.min(page, pages);
  const asinPages = Math.max(1, Math.ceil(byAsin.length / 25)), currentAsinPage = Math.min(asinPage, asinPages);
  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const rows = detailRows.map(f => [f.row.asin, f.row.campaign, f.row.adGroup, f.source, f.row.query || f.row.target || f.row.campaign, f.row.match, f.row.spend, f.row.spend, f.row.sales, f.row.orders, f.row.clicks, f.row.impressions, f.reasons.join("; "), f.severity, f.action, findingStatus(f)]);
    const csv = [["ASIN", "Campaign", "Ad Group", "Source", "Term / Target", "Match", "Spend", "Flagged Spend", "Sales", "Orders", "Clicks", "Impressions", "Reasons", "Severity", "Recommended Review", "Status"], ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-wasted-spend.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function chart(title: string, hint: string, data: Breakdown[], asinNames = false) {
    const top = data.slice(0, 5), rest = data.slice(5);
    if (rest.length) top.push({ name: `Others (${rest.length})`, spend: rest.reduce((sum, r) => sum + r.spend, 0), count: rest.reduce((sum, r) => sum + r.count, 0) });
    return <section className={s.panel}><header><h2>{title}</h2><small>{hint}</small></header>{top.length ? top.map(row => <div className={s.chartRow} key={row.name}><div><span>{asinNames ? products.get(row.name)?.name || row.name : row.name}</span><strong>{money(row.spend)} <small>({percent(row.spend, waste)})</small></strong></div><div className={s.track}><span style={{ width: `${waste ? row.spend / waste * 100 : 0}%` }} /></div></div>) : <p className={s.emptyChart}>{audit ? "No findings in this scope." : "Waiting for reports"}</p>}</section>;
  }
  return <div className={s.workspace}>
    <div className={s.heading}><div><div className={s.headingLine}><h1>Wasted Ad Spend</h1><span>{byAsin.length} ASIN groups with identified waste</span></div><p>Trace inefficient spend to ASINs, campaigns, search terms, and targets.</p></div><div className={s.actions}><button ref={ruleButton} type="button" onClick={() => { setDraft({ ...rules }); setRuleError(""); setDrawer(true); }}><SlidersHorizontal size={14} aria-hidden="true" />Audit Rules</button><button type="button" disabled={!detailRows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button></div></div>
    {!audit ? <p className={s.note}>Upload your PPC Report and Business Report above to populate this dashboard.</p> : null}
    <div className={s.counts}><strong>{count(findings.length)}</strong> Issues Identified <span />{count(findings.filter(f => findingStatus(f) === "Reviewed").length)} Reviewed <span />{count(findings.filter(f => findingStatus(f) === "Action Taken").length)} Action Taken <span />{count(findings.filter(f => findingStatus(f) === "Open").length)} Open {persistence ? <small role="status">{persistence}</small> : null}</div>
    <div className={s.filters}>
      <details><summary>ASIN: {asins.length ? `${asins.length} selected` : "All ASINs"}</summary><div className={s.options}><input aria-label="Find waste ASIN" placeholder="Find ASIN or product…" value={asinSearch} onChange={e => setAsinSearch(e.target.value)} /><button type="button" onClick={() => { setAsins([]); setAsinPage(1); setPage(1); }}>All ASINs</button>{ids.filter(id => `${id} ${products.get(id)?.name || ""}`.toLowerCase().includes(asinSearch.toLowerCase())).map(id => <label key={id}><input type="checkbox" checked={asins.includes(id)} onChange={e => { setAsins(e.target.checked ? [...asins, id] : asins.filter(v => v !== id)); setAsinPage(1); setPage(1); }} />{id}</label>)}</div></details>
      <label>Campaign<select value={campaign} onChange={e => { setCampaign(e.target.value); setPage(1); }}><option value="">All Campaigns</option>{campaigns.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Source<select value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">All Sources</option>{[...new Set(all.map(f => f.source))].sort().map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Match<select value={match} onChange={e => { setMatch(e.target.value); setPage(1); }}><option value="">All Match Types</option>{[...new Set(ads.map(r => r.match))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Reason<select value={reason} onChange={e => { setReason(e.target.value); setPage(1); }}><option value="">All Reasons</option>{["Spend With No Orders", "High ACOS", "Low CVR", "High CPC"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Severity<select value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}><option value="">All Severities</option>{["Critical", "High", "Medium"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option>{["Open", "Reviewed", "Action Taken"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Min Spend<input type="number" min="0" value={minimum} onChange={e => { setMinimum(e.target.value); setPage(1); }} placeholder="Any" /></label><label className={s.search}>Search<input placeholder="ASIN, SKU, campaign, term…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><button type="button" onClick={reset}>Reset</button>
    </div>
    <section className={s.hero}><div><span className={s.eyebrow}><TrendingDown size={15} aria-hidden="true" />Total Wasted Ad Spend</span><div className={s.amount}>{money(waste)} <small>/ {money(totals.spend)} total</small></div><p>{percent(waste, totals.spend)} of PPC spend in the product/campaign/match scope.</p><p>Flagged spend is a review estimate, not confirmed savings. Each source row is counted once.</p></div><div className={s.stats}>{[["Total Spend", money(totals.spend), "PPC reporting scope"], ["Affected ASINs", audit ? `${byAsin.filter(r => r.name !== "Unmapped").length} / ${ids.filter(id => id !== "Unmapped").length}` : "—", "Mapped ASINs"], ["Waste Sources", audit ? `${findings.length} items` : "—", "Unique source rows"], ["Highest Waste Source", bySource[0]?.name || "—", bySource[0] ? `${money(bySource[0].spend)} (${percent(bySource[0].spend, waste)})` : "No findings"]].map(([label, value, hint]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div></section>
    <div className={s.charts}>{chart("Waste by ASIN", "Top 5 Products", byAsin, true)}{chart("Where Is the Waste Coming From?", "Source Level", bySource)}{chart("Waste by Match Type", "Targeting Type", byMatch)}</div>
    <section className={s.panel}><header><h2>Priority Waste Findings</h2><small>Review before making changes</small></header>{byReason.length ? byReason.slice(0, 3).map((r, i) => <div className={s.priority} key={r.name}><span className={s.rank}>{String(i + 1).padStart(2, "0")}</span><div><strong>{r.name} · {money(r.spend)}</strong><p>{r.count} source rows. {r.name === "Spend With No Orders" ? "Review relevance and exact negative coverage." : "Review bids, listing, and targeting relevance."}</p></div><button type="button" onClick={() => { setReason(r.name); viewDetails(null); }}>View Affected Items <ArrowRight size={13} aria-hidden="true" /></button></div>) : <p className={s.emptyChart}>No findings under the current rules and filters.</p>}</section>
    <section className={s.panel}><header><div><h2>ASIN Waste Summary</h2><p>{byAsin.length} ASIN groups · highest flagged spend first</p></div></header><div className={s.tableWrap}><table><caption className={s.srOnly}>ASIN Waste Summary</caption><thead><tr>{["", "Product / SKU", "ASIN", "Total Spend", "Wasted Spend", "Waste %", "PPC Sales", "Orders", "ACOS", "Campaigns", "Terms/Targets", "Top Reason", "Status", "Action"].map((label, i) => <th key={i} scope="col">{label || <span className={s.srOnly}>Expand campaigns</span>}</th>)}</tr></thead><tbody>{byAsin.slice((currentAsinPage - 1) * 25, currentAsinPage * 25).map(group => {
      const rows = findingsByAsin.get(group.name) || [], total = auditTotals(auditCampaignLevel(adsByAsin.get(group.name) || []));
      const reason = breakdown(rows, f => f.reason)[0]?.name;
      return <AsinRows key={group.name} group={group} rows={rows} total={total} product={products.get(group.name)} reason={reason} expanded={expanded.includes(group.name)} onExpand={() => setExpanded(expanded.includes(group.name) ? expanded.filter(v => v !== group.name) : [...expanded, group.name])} onDetails={() => viewDetails(group.name)} status={rows.every(f => findingStatus(f) === "Action Taken") ? "Action Taken" : rows.every(f => findingStatus(f) !== "Open") ? "Reviewed" : "Open"} money={money} percent={percent} />;
    })}</tbody></table>{!byAsin.length ? <p className={s.emptyChart}>{audit ? "No ASIN waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div><footer><span>{byAsin.length} ASIN groups</span><div><button type="button" disabled={currentAsinPage === 1} onClick={() => setAsinPage(currentAsinPage - 1)}>Previous</button> Page {currentAsinPage} of {asinPages} <button type="button" disabled={currentAsinPage === asinPages} onClick={() => setAsinPage(currentAsinPage + 1)}>Next</button></div></footer></section>
    <section ref={detailsSection} className={s.panel}><header><div><h2>Waste Details</h2><p>{detailRows.length} identified waste items{detailAsin ? ` · ${detailAsin}` : ""}</p></div><div className={s.actions}>{detailAsin ? <button type="button" onClick={() => viewDetails(null)}>All ASIN details</button> : null}<details><summary>Columns</summary><div className={s.options}>{DETAIL_COLUMNS.filter(c => c !== "Search Term / Target").map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!detailRows.length} onClick={exportCsv}>CSV Export</button></div></header><div className={s.tableWrap}><table><caption className={s.srOnly}>Waste Details</caption><thead><tr>{DETAIL_COLUMNS.map((c, i) => hidden.includes(c) ? null : <th key={c} scope="col" aria-sort={[5, 8, 9, 10].includes(i) && sort.key === ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i] ? sort.descending ? "descending" : "ascending" : undefined}>{[5, 8, 9, 10].includes(i) ? <button type="button" onClick={() => { const key = ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i]; setSort({ key, descending: sort.key !== key || !sort.descending }); }}>{c} ↕</button> : c}</th>)}</tr></thead><tbody>{detailRows.slice((currentPage - 1) * 25, currentPage * 25).map(f => {
      const r = f.row;
      const values = [<Fragment key="product">{r.asin || "Unmapped"}<small>{products.get(r.asin)?.name || r.sku || "Product not supplied"}</small></Fragment>, <Fragment key="campaign">{r.campaign}<small>{r.adGroup || "Ad group not supplied"}</small></Fragment>, f.source, r.query || r.target || r.campaign, r.match || "—", money(r.spend), money(r.spend), "100%", money(r.sales), count(r.orders), count(r.clicks), money(r.clicks ? r.spend / r.clicks : null), percent(r.orders, r.clicks), percent(r.spend, r.sales), f.reasons.join(" · "), <span key="severity" className={s[f.severity.toLowerCase()]}>{f.severity}</span>, f.action, <select key="status" aria-label={`Status for ${r.query || r.target || r.campaign} in ${r.campaign} ${r.adGroup}`} value={findingStatus(f)} onChange={e => updateStatus(f.id, e.target.value as WasteStatus)}>{["Open", "Reviewed", "Action Taken"].map(v => <option key={v}>{v}</option>)}</select>];
      return <tr key={f.id}>{values.map((value, i) => hidden.includes(DETAIL_COLUMNS[i]) ? null : <td key={i}>{value}</td>)}</tr>;
    })}</tbody></table>{!detailRows.length ? <p className={s.emptyChart}>No waste details match this scope.</p> : null}</div><footer><span>{audit ? `${audit.start} – ${audit.end}` : "No reports imported"} · Status marks are review notes only.</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button> Page {currentPage} of {pages} <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer></section>
    {drawer ? <div className={s.backdrop} onMouseDown={e => { if (e.currentTarget === e.target) closeRules(); }}><div ref={dialog} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="waste-rules-heading" onKeyDown={e => { if (e.key === "Escape") closeRules(); if (e.key === "Tab") { const nodes = [...dialog.current!.querySelectorAll<HTMLElement>('button,input')]; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}><form onSubmit={applyRules}><header><div><h2 id="waste-rules-heading">Audit Rules & Thresholds</h2><p>Choose thresholds for review findings.</p></div><button type="button" aria-label="Close audit rules" onClick={closeRules}><X size={16} /></button></header><p className={s.note}>Minimum clicks and spend apply to every rule. Multiple reasons on one row never multiply its spend.</p>{RULE_FIELDS.map(([key, label]) => <label key={key}>{label}<input type="number" min={key === "acos" || key === "cpc" ? "0.01" : "0"} max={key === "cvr" ? "100" : "1000000"} step={key === "minClicks" ? "1" : "0.01"} required value={Number.isFinite(draft[key]) ? draft[key] : ""} onChange={e => setDraft({ ...draft, [key]: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>)}{ruleError ? <p role="alert">{ruleError}</p> : null}<footer><button type="button" onClick={() => setDraft({ ...DEFAULT_WASTE_RULES })}>Reset Defaults</button><div><button type="button" onClick={closeRules}>Cancel</button><button type="submit">Apply Rules</button></div></footer></form></div></div> : null}
  </div>;
}

function AsinRows({ group, rows, total, product, reason, expanded, onExpand, onDetails, status, money, percent }: { group: Breakdown; rows: WasteFinding[]; total: ReturnType<typeof auditTotals>; product?: Product; reason?: string; expanded: boolean; onExpand: () => void; onDetails: () => void; status: string; money: (n: number | null) => string; percent: (a: number, b: number) => string }) {
  return <><tr><td><button type="button" aria-label={`Expand campaigns for ${group.name}`} aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td><td><strong>{product?.name || "Product not supplied"}</strong><small>{product?.sku || "SKU not supplied"}</small></td><td>{group.name}</td><td>{money(total.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, total.spend)}</td><td>{money(total.sales)}</td><td>{total.orders}</td><td>{percent(total.spend, total.sales)}</td><td>{new Set(rows.map(f => `${f.row.type}:${f.row.campaignId}`)).size}</td><td>{rows.length}</td><td>{reason}</td><td>{status}</td><td><button type="button" onClick={onDetails}>View Details</button></td></tr>{expanded ? <tr><td colSpan={14}><div className={s.subrows}>{breakdown(rows, f => `${f.row.campaign} · ${f.row.type}`).map(r => <div key={r.name}><span>{r.name}</span><strong>{money(r.spend)}</strong><small>{r.count} findings</small></div>)}</div></td></tr> : null}</>;
}
