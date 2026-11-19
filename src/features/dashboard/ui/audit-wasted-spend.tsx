"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, ExternalLink, Pin, PinOff, SlidersHorizontal, TrendingDown } from "lucide-react";
import { amazonCampaignUrl, auditCampaignLevel, auditRate, auditTotals, describeAcosRange, hasHighAcosRule, hasWasteCriteria, type AuditAd, type AuditData, type AuditWasteRules } from "../domain/ppc-audit";
import { AuditSettingsDialog } from "./audit-settings-dialog";
import { DEFAULT_WASTE_RULES, readWasteReview, searchTermFindings, type WasteFinding, type WasteRules, type WasteStatus } from "../domain/ppc-audit-waste";
import s from "./audit-wasted-spend.module.css";

const REVIEW_KEY = "glassco.ppcWasteReview.v1";
// Search term leads so each row shows where the waste comes from.
const DETAIL_COLUMNS = ["Search Term / Target", "ASIN / Product", "Campaign & Ad Group", "Source", "Match", "Spend", "Waste $", "Waste %", "Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Waste Reason", "Severity", "Recommended Action", "Status"];
type Product = { asin: string; sku: string; name: string };
/** Section the Performance Summary links to: affected search terms, campaigns or ASINs. */
export type WasteFocus = "terms" | "campaigns" | "asins";
type Breakdown = { name: string; spend: number; count: number };
function breakdown(rows: WasteFinding[], key: (f: WasteFinding) => string): Breakdown[] {
  const groups = new Map<string, Breakdown>();
  for (const finding of rows) { const name = key(finding); const group = groups.get(name) || { name, spend: 0, count: 0 }; group.spend += finding.row.spend; group.count++; groups.set(name, group); }
  return [...groups.values()].sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
}

export function AuditWastedSpend({ audit, ads, catalog, onRulesChange, focus }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[]; onRulesChange?: (rules: AuditWasteRules) => void; focus?: WasteFocus }) {
  const rules = audit?.wasteRules;
  // Other audit pages still read their own thresholds from the review record; keep them as saved.
  const [reviewRules, setReviewRules] = useState<WasteRules>(DEFAULT_WASTE_RULES);
  const [statuses, setStatuses] = useState<Record<string, WasteStatus>>({});
  const [persistence, setPersistence] = useState("");
  const [asins, setAsins] = useState<string[]>([]);
  const [asinSearch, setAsinSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [match, setMatch] = useState("");
  // Affected search terms open on the waste rows only.
  const [reason, setReason] = useState(focus === "terms" ? "Wasted Spend" : "");
  const [severity, setSeverity] = useState("");
  const [query, setQuery] = useState("");
  const [minimum, setMinimum] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [detailAsin, setDetailAsin] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [asinPage, setAsinPage] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState({ key: "spend", descending: true });
  const ruleButton = useRef<HTMLButtonElement>(null);
  const detailsSection = useRef<HTMLElement>(null);
  const campaignSection = useRef<HTMLElement>(null);
  // Search term table: its scroll box (for the top scrollbar) and whether the header with that bar stays pinned on screen.
  const [termsWrap, setTermsWrap] = useState<HTMLDivElement | null>(null);
  const [termsPinned, setTermsPinned] = useState(false);
  // ASIN, campaign and search-term sections start collapsed; a Performance Summary count opens its own one.
  const [open, setOpen] = useState<Record<WasteFocus, boolean>>({ asins: focus === "asins", campaigns: focus === "campaigns", terms: focus === "terms" });
  const openSection = (key: WasteFocus) => setOpen(current => ({ ...current, [key]: true }));
  const sectionToggle = (key: WasteFocus, title: string, summary: string) => <button type="button" className={s.collapse} aria-expanded={open[key]} onClick={() => setOpen({ ...open, [key]: !open[key] })}>{open[key] ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}<div><h2>{title}</h2><p>{summary}</p></div></button>;
  const [campaignPage, setCampaignPage] = useState(1);
  const asinSection = useRef<HTMLElement>(null);
  useEffect(() => { (focus === "terms" ? detailsSection : focus === "campaigns" ? campaignSection : focus === "asins" ? asinSection : null)?.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [focus]);
  const auditId = audit?.importedAt || "";
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !auditId) return; try { const saved = readWasteReview(localStorage.getItem(REVIEW_KEY), auditId); if (saved) { setReviewRules(saved.rules); setStatuses(saved.statuses); setPersistence("Saved on this device"); } } catch { /* Storage is optional. */ } });
    return () => { active = false; };
  }, [auditId]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const all = useMemo(() => searchTermFindings(ads, rules), [ads, rules]);
  const ids = [...new Set(ads.map(r => r.asin || "Unmapped"))].sort();
  const campaignKey = (row: AuditAd) => JSON.stringify([row.type, row.campaignId]);
  const campaigns = [...new Map(ads.map(row => [campaignKey(row), `${row.campaign} · ${row.type}`])).entries()];
  const base = ads.filter(row => (!asins.length || asins.includes(row.asin || "Unmapped")) && (!campaign || campaignKey(row) === campaign) && (!match || row.match === match));
  const totals = auditTotals(auditCampaignLevel(base));
  const findingStatus = (finding: WasteFinding) => statuses[finding.id] || "Open";
  const findings = all.filter(f => (!asins.length || asins.includes(f.row.asin || "Unmapped")) && (!campaign || campaignKey(f.row) === campaign) && (!match || f.row.match === match) && (!reason || f.reasons.includes(reason)) && (!severity || f.severity === severity) && (!statusFilter || findingStatus(f) === statusFilter) && f.row.spend >= (Number(minimum) || 0) && [f.row.asin, f.row.sku, products.get(f.row.asin)?.name || "", f.row.campaign, f.row.adGroup, f.row.target, f.row.query].some(v => v.toLowerCase().includes(query.toLowerCase())));
  // Only "Wasted Spend" rows make up the waste total and charts; High ACOS rows are listed but kept apart.
  const wasted = findings.filter(f => f.reasons.includes("Wasted Spend"));
  const waste = wasted.reduce((sum, f) => sum + f.row.spend, 0);
  const highAcos = findings.filter(f => f.reasons.includes("High ACOS"));
  const highAcosSpend = highAcos.reduce((sum, f) => sum + f.row.spend, 0);
  const rulesSet = hasWasteCriteria(rules);
  const byAsin = breakdown(wasted, f => f.row.asin || "Unmapped");
  const byMatch = breakdown(wasted, f => f.row.match || "Product targeting");
  const adsByAsin = new Map<string, AuditAd[]>();
  for (const row of base) { const id = row.asin || "Unmapped"; const group = adsByAsin.get(id); if (group) group.push(row); else adsByAsin.set(id, [row]); }
  const findingsByAsin = new Map<string, WasteFinding[]>();
  for (const f of wasted) { const id = f.row.asin || "Unmapped"; const group = findingsByAsin.get(id); if (group) group.push(f); else findingsByAsin.set(id, [f]); }
  const money = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const count = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const percent = (a: number, b: number) => { const rate = auditRate(a, b); return rate === null || !audit ? "—" : `${count(rate)}%`; };
  function save(nextStatuses: Record<string, WasteStatus>) {
    if (!audit) return;
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify({ version: 1, auditId, rules: reviewRules, statuses: nextStatuses })); setPersistence("Saved on this device"); }
    catch { setPersistence("Current session only — device storage unavailable"); }
  }
  function updateStatus(id: string, status: WasteStatus) { const next = { ...statuses, [id]: status }; setStatuses(next); save(next); }
  function reset() { setAsins([]); setAsinSearch(""); setCampaign(""); setMatch(""); setReason(""); setSeverity(""); setQuery(""); setMinimum(""); setStatusFilter(""); setDetailAsin(null); setPage(1); setAsinPage(1); }
  function closeRules() { setDrawer(false); ruleButton.current?.focus(); }
  function viewDetails(asin: string | null) { setDetailAsin(asin); setPage(1); openSection("terms"); detailsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const detailRows = findings.filter(f => detailAsin === null || (f.row.asin || "Unmapped") === detailAsin);
  detailRows.sort((a, b) => { const value = (f: WasteFinding) => sort.key === "sales" ? f.row.sales : sort.key === "clicks" ? f.row.clicks : sort.key === "orders" ? f.row.orders : f.row.spend; return (value(a) - value(b)) * (sort.descending ? -1 : 1) || a.id.localeCompare(b.id); });
  const pages = Math.max(1, Math.ceil(detailRows.length / 25)), currentPage = Math.min(page, pages);
  const asinPages = Math.max(1, Math.ceil(byAsin.length / 25)), currentAsinPage = Math.min(asinPage, asinPages);
  // Campaign-level view of the same waste: one row per campaign (type + ID), totals from its campaign rows.
  const byCampaign = breakdown(wasted, f => campaignKey(f.row));
  const adsByCampaign = new Map<string, AuditAd[]>();
  for (const row of base) { const key = campaignKey(row); const group = adsByCampaign.get(key); if (group) group.push(row); else adsByCampaign.set(key, [row]); }
  const campaignPages = Math.max(1, Math.ceil(byCampaign.length / 25)), currentCampaignPage = Math.min(campaignPage, campaignPages);
  // byCampaign keys are JSON [type, campaignId]; "Others (n)" rows are not keys and get no name lookup or link.
  const campaignInfo = (key: string) => { try { const [type, id] = JSON.parse(key) as [string, string]; return { type, id, name: adsByCampaign.get(key)?.[0]?.campaign || wasted.find(f => campaignKey(f.row) === key)?.row.campaign || id }; } catch { return null; } };
  const campaignLabel = (key: string) => campaignInfo(key)?.name ?? key;
  const campaignUrl = (key: string) => { const info = campaignInfo(key); return info ? amazonCampaignUrl(info.type, info.id) : null; };
  function viewCampaign(key: string) { setCampaign(key); setDetailAsin(null); setPage(1); openSection("terms"); detailsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const rows = detailRows.map(f => [f.row.query || f.row.target || f.row.campaign, f.row.asin, f.row.campaign, f.row.adGroup, f.source, f.row.match, f.row.spend, f.row.spend, f.row.sales, f.row.orders, f.row.clicks, f.row.impressions, f.reasons.join("; "), f.severity, f.action, findingStatus(f)]);
    const csv = [["Term / Target", "ASIN", "Campaign", "Ad Group", "Source", "Match", "Spend", "Flagged Spend", "Sales", "Orders", "Clicks", "Impressions", "Reasons", "Severity", "Recommended Review", "Status"], ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-wasted-spend.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Opens a campaign in Amazon Ads in a new tab; nothing when the report has no campaign ID.
  const campaignLink = (url: string | null, name: string) => url ? <a className={s.amazonLink} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in Amazon Ads`} title="Open in Amazon Ads"><ExternalLink size={12} aria-hidden="true" /></a> : null;
  function chart(title: string, hint: string, data: Breakdown[], asinNames = false, campaignNames = false) {
    const top = data.slice(0, 5), rest = data.slice(5);
    if (rest.length) top.push({ name: `Others (${rest.length})`, spend: rest.reduce((sum, r) => sum + r.spend, 0), count: rest.reduce((sum, r) => sum + r.count, 0) });
    return <section className={s.panel}><header><h2>{title}</h2><small>{hint}</small></header>{top.length ? top.map(row => <div className={s.chartRow} key={row.name}><div><span>{asinNames ? products.get(row.name)?.name || row.name : campaignNames ? campaignLabel(row.name) : row.name}{campaignNames ? campaignLink(campaignUrl(row.name), campaignLabel(row.name)) : null}</span><strong>{money(row.spend)} <small>({percent(row.spend, waste)})</small></strong></div><div className={s.track}><span style={{ width: `${waste ? row.spend / waste * 100 : 0}%` }} /></div></div>) : <p className={s.emptyChart}>{audit ? "No findings in this scope." : "Waiting for reports"}</p>}</section>;
  }
  return <div className={s.workspace}>
    <div className={s.heading}><div><div className={s.headingLine}><h1>Wasted Ad Spend</h1><span>{byAsin.length} ASIN groups with identified waste</span></div><p>Trace inefficient spend to ASINs, campaigns, search terms, and targets.</p></div><div className={s.actions}><button ref={ruleButton} type="button" disabled={!audit || !onRulesChange} onClick={() => setDrawer(true)}><SlidersHorizontal size={14} aria-hidden="true" />Audit Rules</button><button type="button" disabled={!detailRows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button></div></div>
    {!audit ? <p className={s.note}>Upload your PPC Report above to populate this dashboard.</p> : !rulesSet ? <p className={s.note}>No wasted spend rules are set for this audit. Use the gear icon or Audit Rules to choose them.</p> : null}
    <div className={s.counts}><strong>{count(findings.length)}</strong> Issues Identified <span />{count(findings.filter(f => findingStatus(f) === "Reviewed").length)} Reviewed <span />{count(findings.filter(f => findingStatus(f) === "Action Taken").length)} Action Taken <span />{count(findings.filter(f => findingStatus(f) === "Open").length)} Open {persistence ? <small role="status">{persistence}</small> : null}</div>
    <div className={s.filters}>
      <details><summary>ASIN: {asins.length ? `${asins.length} selected` : "All ASINs"}</summary><div className={s.options}><input aria-label="Find waste ASIN" placeholder="Find ASIN or product…" value={asinSearch} onChange={e => setAsinSearch(e.target.value)} /><button type="button" onClick={() => { setAsins([]); setAsinPage(1); setPage(1); }}>All ASINs</button>{ids.filter(id => `${id} ${products.get(id)?.name || ""}`.toLowerCase().includes(asinSearch.toLowerCase())).map(id => <label key={id}><input type="checkbox" checked={asins.includes(id)} onChange={e => { setAsins(e.target.checked ? [...asins, id] : asins.filter(v => v !== id)); setAsinPage(1); setPage(1); }} />{id}</label>)}</div></details>
      <label>Campaign<select value={campaign} onChange={e => { setCampaign(e.target.value); setPage(1); }}><option value="">All Campaigns</option>{campaigns.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Match<select value={match} onChange={e => { setMatch(e.target.value); setPage(1); }}><option value="">All Match Types</option>{[...new Set(ads.map(r => r.match))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Reason<select value={reason} onChange={e => { setReason(e.target.value); setPage(1); }}><option value="">All Reasons</option>{["Wasted Spend", "High ACOS"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Severity<select value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}><option value="">All Severities</option>{["Critical", "High"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All Statuses</option>{["Open", "Reviewed", "Action Taken"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Min Spend<input type="number" min="0" value={minimum} onChange={e => { setMinimum(e.target.value); setPage(1); }} placeholder="Any" /></label><label className={s.search}>Search<input placeholder="ASIN, SKU, campaign, term…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><button type="button" onClick={reset}>Reset</button>
    </div>
    <section className={s.hero}><div><span className={s.eyebrow}><TrendingDown size={15} aria-hidden="true" />Total Wasted Ad Spend</span><div className={`${s.amount} ${s.wasteRed}`}>{money(waste)} {audit && totals.spend > 0 ? <span className={s.wasteShare}>{(waste / totals.spend * 100).toFixed(1)}% of spend</span> : null} <small>/ {money(totals.spend)} total</small></div><p className={s.highAcosLine}>High ACOS spend <b>{!rules || !hasHighAcosRule(rules) ? "—" : money(highAcosSpend)}</b> · <span>{!rules || !hasHighAcosRule(rules) ? "No High ACOS rule set" : `${count(highAcos.length)} search terms ${describeAcosRange(rules.highAcos, rules.highAcosMax, true)} ACOS`}</span></p><p>Share of PPC spend in the product/campaign/match scope.</p><p>Search terms that meet every wasted spend rule set for this audit. A review estimate, not confirmed savings.</p></div><div className={s.stats}>{[["Total Spend", money(totals.spend), "PPC reporting scope"], ["Affected Search Terms", audit ? count(wasted.length) : "—", "Search terms meeting the rules"], ["Affected Campaigns", audit ? count(byCampaign.length) : "—", "Campaigns with wasted search terms"], ["Affected ASINs", audit ? `${count(byAsin.filter(r => r.name !== "Unmapped").length)} / ${count(ids.filter(id => id !== "Unmapped").length)}` : "—", "Mapped ASINs"]].map(([label, value, hint]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div></section>
    <div className={s.charts}>{chart("Waste by ASIN", "Top 5 Products", byAsin, true)}{chart("Waste by Campaign", "Top 5 Campaigns", byCampaign, false, true)}{chart("Waste by Match Type", "Source Keyword Match", byMatch)}</div>
    <section ref={detailsSection} className={s.panel}><header className={open.terms ? `${s.withTools} ${termsPinned ? s.pinned : ""}` : undefined}>{sectionToggle("terms", "Search Term Waste Details", `${count(detailRows.length)} identified waste items${detailAsin ? ` · ${detailAsin}` : ""}`)}{open.terms ? <div className={s.scrollTools}><TopScrollbar target={termsWrap} /><button type="button" className={s.pin} aria-pressed={termsPinned} aria-label={termsPinned ? "Unpin table header" : "Pin table header"} title={termsPinned ? "Unpin: the bar scrolls away with the page" : "Pin: keep this bar on screen while scrolling down the list"} onClick={() => setTermsPinned(!termsPinned)}>{termsPinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}</button></div> : null}<div className={s.actions}>{detailAsin ? <button type="button" onClick={() => viewDetails(null)}>All ASIN details</button> : null}<details><summary>Columns</summary><div className={s.options}>{DETAIL_COLUMNS.filter(c => c !== "Search Term / Target").map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!detailRows.length} onClick={exportCsv}>CSV Export</button></div></header>{open.terms ? <><div ref={setTermsWrap} className={s.tableWrap}><table className={s.details}><caption className={s.srOnly}>Search Term Waste Details</caption><thead><tr>{DETAIL_COLUMNS.map((c, i) => hidden.includes(c) ? null : <th key={c} scope="col" aria-sort={[5, 8, 9, 10].includes(i) && sort.key === ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i] ? sort.descending ? "descending" : "ascending" : undefined}>{[5, 8, 9, 10].includes(i) ? <button type="button" onClick={() => { const key = ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i]; setSort({ key, descending: sort.key !== key || !sort.descending }); }}>{c} ↕</button> : c}</th>)}</tr></thead><tbody>{detailRows.slice((currentPage - 1) * 25, currentPage * 25).map(f => {
      const r = f.row;
      const values = [<strong key="term">{r.query || r.target || r.campaign}</strong>, <Fragment key="product">{r.asin || "Unmapped"}<small>{products.get(r.asin)?.name || r.sku || "Product not supplied"}</small></Fragment>, <Fragment key="campaign">{r.campaign}{campaignLink(amazonCampaignUrl(r.type, r.campaignId), r.campaign)}<small>{r.adGroup || "Ad group not supplied"}</small></Fragment>, f.source, r.match || "—", money(r.spend), money(r.spend), "100%", money(r.sales), count(r.orders), count(r.clicks), money(r.clicks ? r.spend / r.clicks : null), percent(r.orders, r.clicks), percent(r.spend, r.sales), f.reasons.join(" · "), <span key="severity" className={s[f.severity.toLowerCase()]}>{f.severity}</span>, f.action, <select key="status" aria-label={`Status for ${r.query || r.target || r.campaign} in ${r.campaign} ${r.adGroup}`} value={findingStatus(f)} onChange={e => updateStatus(f.id, e.target.value as WasteStatus)}>{["Open", "Reviewed", "Action Taken"].map(v => <option key={v}>{v}</option>)}</select>];
      return <tr key={f.id}>{values.map((value, i) => hidden.includes(DETAIL_COLUMNS[i]) ? null : <td key={i}>{value}</td>)}</tr>;
    })}</tbody></table>{!detailRows.length ? <p className={s.emptyChart}>No waste details match this scope.</p> : null}</div><footer><span>{audit ? `${audit.start && audit.end ? `${audit.start} – ${audit.end}` : "Reporting dates unavailable"}` : "No reports imported"} · Status marks are review notes only.</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button> Page {currentPage} of {pages} <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer></> : null}</section>
    <section ref={campaignSection} className={s.panel}><header>{sectionToggle("campaigns", "Campaign Waste Details", `${count(byCampaign.length)} campaigns · highest flagged spend first`)}</header>{open.campaigns ? <div id="campaign-waste-table"><div className={s.tableWrap}><table className={s.campaignTable}><caption className={s.srOnly}>Campaign Waste Details</caption><thead><tr>{["Campaign", "Type", "Total Spend", "Wasted Spend", "Waste %", "PPC Sales", "ACOS", "Search Terms", "Action"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{byCampaign.slice((currentCampaignPage - 1) * 25, currentCampaignPage * 25).map(group => {
      const rows = adsByCampaign.get(group.name) || [], total = auditTotals(auditCampaignLevel(rows)), [type] = JSON.parse(group.name) as [string, string];
      const name = rows[0]?.campaign || findings.find(f => campaignKey(f.row) === group.name)?.row.campaign || "Campaign not supplied";
      return <tr key={group.name}><td><strong>{name}</strong>{campaignLink(amazonCampaignUrl(type, (JSON.parse(group.name) as [string, string])[1]), name)}</td><td>{type}</td><td>{money(total.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, total.spend)}</td><td>{money(total.sales)}</td><td>{percent(total.spend, total.sales)}</td><td>{count(group.count)}</td><td><button type="button" onClick={() => viewCampaign(group.name)}>View Details</button></td></tr>;
    })}</tbody></table>{!byCampaign.length ? <p className={s.emptyChart}>{audit ? "No campaign waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div><footer><span>{count(byCampaign.length)} campaigns</span><div><button type="button" disabled={currentCampaignPage === 1} onClick={() => setCampaignPage(currentCampaignPage - 1)}>Previous</button> Page {currentCampaignPage} of {campaignPages} <button type="button" disabled={currentCampaignPage === campaignPages} onClick={() => setCampaignPage(currentCampaignPage + 1)}>Next</button></div></footer></div> : null}</section>
    <section ref={asinSection} className={s.panel}><header>{sectionToggle("asins", "ASIN Waste Details", `${count(byAsin.length)} ASIN groups · highest flagged spend first`)}</header>{open.asins ? <><div className={s.tableWrap}><table className={s.asinTable}><caption className={s.srOnly}>ASIN Waste Details</caption><thead><tr>{["", "Product / SKU", "ASIN", "Total Spend", "Wasted Spend", "Waste %", "PPC Sales", "Orders", "ACOS", "Campaigns", "Terms/Targets", "Top Reason", "Status", "Action"].map((label, i) => <th key={i} scope="col">{label || <span className={s.srOnly}>Expand campaigns</span>}</th>)}</tr></thead><tbody>{byAsin.slice((currentAsinPage - 1) * 25, currentAsinPage * 25).map(group => {
      const rows = findingsByAsin.get(group.name) || [], total = auditTotals(auditCampaignLevel(adsByAsin.get(group.name) || []));
      const reason = breakdown(rows, f => f.reason)[0]?.name;
      return <AsinRows key={group.name} group={group} rows={rows} total={total} product={products.get(group.name)} reason={reason} expanded={expanded.includes(group.name)} onExpand={() => setExpanded(expanded.includes(group.name) ? expanded.filter(v => v !== group.name) : [...expanded, group.name])} onDetails={() => viewDetails(group.name)} status={rows.every(f => findingStatus(f) === "Action Taken") ? "Action Taken" : rows.every(f => findingStatus(f) !== "Open") ? "Reviewed" : "Open"} money={money} percent={percent} />;
    })}</tbody></table>{!byAsin.length ? <p className={s.emptyChart}>{audit ? "No ASIN waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div><footer><span>{byAsin.length} ASIN groups</span><div><button type="button" disabled={currentAsinPage === 1} onClick={() => setAsinPage(currentAsinPage - 1)}>Previous</button> Page {currentAsinPage} of {asinPages} <button type="button" disabled={currentAsinPage === asinPages} onClick={() => setAsinPage(currentAsinPage + 1)}>Next</button></div></footer></> : null}</section>
    {drawer && audit ? <AuditSettingsDialog rules={rules} onClose={closeRules} onSave={next => { onRulesChange?.(next); setPage(1); setAsinPage(1); setCampaignPage(1); closeRules(); }} /> : null}
  </div>;
}

/** A second horizontal scrollbar above a wide table, kept in step with the table's own scrollbar at its bottom. */
function TopScrollbar({ target }: { target: HTMLElement | null }) {
  const bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const top = bar.current;
    if (!target || !top) return;
    const update = () => setWidth(target.scrollWidth);
    const follow = () => { if (top.scrollLeft !== target.scrollLeft) top.scrollLeft = target.scrollLeft; };
    const lead = () => { if (target.scrollLeft !== top.scrollLeft) target.scrollLeft = top.scrollLeft; };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    if (target.firstElementChild) observer.observe(target.firstElementChild);
    target.addEventListener("scroll", follow);
    top.addEventListener("scroll", lead);
    return () => { observer.disconnect(); target.removeEventListener("scroll", follow); top.removeEventListener("scroll", lead); };
  }, [target]);
  // Hidden from screen readers: the table itself scrolls by keyboard; this bar only mirrors it.
  return <div ref={bar} className={s.topScroll} aria-hidden="true"><div style={{ width }} /></div>;
}

function AsinRows({ group, rows, total, product, reason, expanded, onExpand, onDetails, status, money, percent }: { group: Breakdown; rows: WasteFinding[]; total: ReturnType<typeof auditTotals>; product?: Product; reason?: string; expanded: boolean; onExpand: () => void; onDetails: () => void; status: string; money: (n: number | null) => string; percent: (a: number, b: number) => string }) {
  return <><tr><td><button type="button" aria-label={`Expand campaigns for ${group.name}`} aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td><td><strong>{product?.name || "Product not supplied"}</strong><small>{product?.sku || "SKU not supplied"}</small></td><td>{group.name}</td><td>{money(total.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, total.spend)}</td><td>{money(total.sales)}</td><td>{total.orders}</td><td>{percent(total.spend, total.sales)}</td><td>{new Set(rows.map(f => `${f.row.type}:${f.row.campaignId}`)).size}</td><td>{rows.length}</td><td>{reason}</td><td>{status}</td><td><button type="button" onClick={onDetails}>View Details</button></td></tr>{expanded ? <tr><td colSpan={14}><div className={s.subrows}>{breakdown(rows, f => `${f.row.campaign} · ${f.row.type}`).map(r => <div key={r.name}><span>{r.name}</span><strong>{money(r.spend)}</strong><small>{r.count} findings</small></div>)}</div></td></tr> : null}</>;
}
