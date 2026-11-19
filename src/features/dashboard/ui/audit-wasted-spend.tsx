"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, Download, ExternalLink, SlidersHorizontal, TrendingDown } from "lucide-react";
import { amazonCampaignUrl, amazonSearchTermsUrl, auditCampaignLevel, auditRate, auditTotals, describeAcosRange, hasHighAcosRule, hasWasteCriteria, type AuditAd, type AuditData, type AuditWasteRules } from "../domain/ppc-audit";
import { AuditSettingsDialog } from "./audit-settings-dialog";
import { DEFAULT_WASTE_RULES, readWasteReview, searchTermFindings, type WasteFinding, type WasteRules, type WasteStatus } from "../domain/ppc-audit-waste";
import s from "./audit-wasted-spend.module.css";

const REVIEW_KEY = "glassco.ppcWasteReview.v1";
// Search term leads so each row shows where the waste comes from.
const DETAIL_COLUMNS = ["Search Term / Target", "ASIN / Product", "Campaign & Ad Group", "Source", "Match", "Spend", "Waste $", "Waste %", "Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Waste Reason", "Severity", "Recommended Action", "Status"];
type Product = { asin: string; sku: string; name: string };
/** Section the Performance Summary links to: affected search terms, campaigns or ASINs. */
export type WasteFocus = "terms" | "campaigns" | "asins" | "matches";
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
  const [openCampaigns, setOpenCampaigns] = useState<string[]>([]);
  const [detailAsin, setDetailAsin] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [asinPage, setAsinPage] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sort, setSort] = useState({ key: "spend", descending: true });
  const ruleButton = useRef<HTMLButtonElement>(null);
  const detailsSection = useRef<HTMLElement>(null);
  const campaignSection = useRef<HTMLElement>(null);
  // Per table: its scroll box, which the top scrollbar mirrors. Each list's header and column names always stick at the top while scrolling.
  const [wraps, setWraps] = useState<Partial<Record<WasteFocus, HTMLDivElement | null>>>({});
  // Stable ref callbacks: a new function each render would make React detach and re-attach the ref every time.
  const attachBox = useMemo(() => Object.fromEntries((["terms", "campaigns", "asins", "matches"] as const).map(key => [key, (node: HTMLDivElement | null) => setWraps(current => current[key] === node ? current : { ...current, [key]: node })])) as Record<WasteFocus, (node: HTMLDivElement | null) => void>, []);
  const { terms: attachTermsBox, campaigns: attachCampaignsBox, asins: attachAsinsBox } = attachBox;
  const headerClass = (key: WasteFocus) => tab === key ? `${s.withTools} ${s.pinned}` : undefined;
  const listBox = `${s.tableWrap} ${s.pinnedTable}`;
  const scrollTools = (key: WasteFocus) => tab === key ? <div className={s.scrollTools}><TopScrollbar target={wraps[key] ?? null} /></div> : null;
  // ASIN, campaign and search-term sections start collapsed; a Performance Summary count opens its own one.
  // Search term, campaign and ASIN lists are tabs on the left of one panel; a Performance Summary count opens its own tab.
  const [tab, setTab] = useState<WasteFocus>(focus ?? "terms");
  const tabsSection = useRef<HTMLDivElement>(null);
  const sectionTitle = (title: string, summary: string) => <div className={s.sectionTitle}><h2>{title}</h2><p>{summary}</p></div>;
  const [campaignPage, setCampaignPage] = useState(1);
  const asinSection = useRef<HTMLElement>(null);
  useEffect(() => { if (focus) tabsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [focus]);
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
  const matchName = (r: AuditAd) => r.match || "Product targeting";
  const byMatch = breakdown(wasted, f => matchName(f.row));
  // Each match type's search-term spend and sales, so its waste can be read against what it spent.
  const matchTotals = new Map<string, { spend: number; sales: number }>();
  for (const r of base) if (r.query) { const m = matchTotals.get(matchName(r)) || { spend: 0, sales: 0 }; m.spend += r.spend; m.sales += r.sales; matchTotals.set(matchName(r), m); }
  const adsByAsin = new Map<string, AuditAd[]>();
  for (const row of base) { const id = row.asin || "Unmapped"; const group = adsByAsin.get(id); if (group) group.push(row); else adsByAsin.set(id, [row]); }
  const findingsByAsin = new Map<string, WasteFinding[]>();
  for (const f of wasted) { const id = f.row.asin || "Unmapped"; const group = findingsByAsin.get(id); if (group) group.push(f); else findingsByAsin.set(id, [f]); }
  // Whole dollars, except amounts under $1, which keep their cents instead of rounding to $0 or $1.
  const money = (n: number | null) => { if (n === null || !audit) return "—"; const digits = n !== 0 && Math.abs(n) < 1 ? 2 : 0; return new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); };
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
  function viewDetails(asin: string | null) { setDetailAsin(asin); setPage(1); setTab("terms"); tabsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const detailRows = findings.filter(f => detailAsin === null || (f.row.asin || "Unmapped") === detailAsin);
  detailRows.sort((a, b) => { const value = (f: WasteFinding) => sort.key === "sales" ? f.row.sales : sort.key === "clicks" ? f.row.clicks : sort.key === "orders" ? f.row.orders : f.row.spend; return (value(a) - value(b)) * (sort.descending ? -1 : 1) || a.id.localeCompare(b.id); });
  const pages = Math.max(1, Math.ceil(detailRows.length / 25)), currentPage = Math.min(page, pages);
  const asinPages = Math.max(1, Math.ceil(byAsin.length / 25)), currentAsinPage = Math.min(asinPage, asinPages);
  // Campaign-level view of the same waste: one row per campaign (type + ID), totals from its campaign rows.
  const byCampaign = breakdown(wasted, f => campaignKey(f.row));
  const adsByCampaign = new Map<string, AuditAd[]>();
  for (const row of base) { const key = campaignKey(row); const group = adsByCampaign.get(key); if (group) group.push(row); else adsByCampaign.set(key, [row]); }
  const campaignPages = Math.max(1, Math.ceil(byCampaign.length / 25)), currentCampaignPage = Math.min(campaignPage, campaignPages);
  // A campaign's wasted search terms, largest first, with each term's share of that campaign's waste.
  function campaignTerms(group: Breakdown, name: string) {
    // Highest spend first (then most clicks); cents shown because many terms cost under $1 and would all round to $0.
    const terms = wasted.filter(f => campaignKey(f.row) === group.name).sort((a, b) => b.row.spend - a.row.spend || b.row.clicks - a.row.clicks || a.id.localeCompare(b.id));
    const cents = (n: number) => !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const sum = (key: "clicks" | "orders" | "sales") => terms.reduce((total, f) => total + f.row[key], 0);
    return <div className={s.subrows}>
      <p>{count(terms.length)} wasted search terms in this campaign · Share = the term&apos;s part of the campaign&apos;s wasted spend</p>
      <table className={`${s.subTable} ${s.termSplit}`}><caption className={s.srOnly}>Wasted search terms for {name}</caption>{/* The first header names the campaign, so its search terms stay labelled while the list scrolls under the sticky header. */}<thead><tr><th scope="col" className={s.campaignHead} title={name}>{name}<span className={s.srOnly}> search terms</span></th>{["Ad Group", "ASIN", "Match", "Wasted", "Share", "Clicks", "Orders", "Sales"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{terms.map(f => { const term = f.row.query || f.row.target; const url = amazonSearchTermsUrl(f.row.type, f.row.campaignId, f.row.adGroupId); return <tr key={f.id}><td><div className={s.termCell}><strong title={term}>{term}</strong><span className={s.termTools}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => { void navigator.clipboard?.writeText(term).catch(() => undefined); }} aria-label={`Open the Search terms tab of ad group ${f.row.adGroup || f.row.adGroupId} in Amazon Ads (copies ${term})`} title="Opens this ad group's Search terms in Amazon Ads and copies the term"><ArrowUpRight size={13} aria-hidden="true" /></a> : null}<CopyTermButton term={term} /></span></div></td><td>{f.row.adGroup || "—"}</td><td>{f.row.asin || "Unmapped"}</td><td>{f.row.match || "—"}</td><td><strong>{cents(f.row.spend)}</strong></td><td>{(group.spend ? f.row.spend / group.spend * 100 : 0).toFixed(1)}%</td><td>{count(f.row.clicks)}</td><td>{count(f.row.orders)}</td><td>{cents(f.row.sales)}</td></tr>; })}</tbody>
        <tfoot><tr><th scope="row" colSpan={4}>Total · {count(terms.length)} search terms</th><td><strong>{cents(group.spend)}</strong></td><td>100%</td><td>{count(sum("clicks"))}</td><td>{count(sum("orders"))}</td><td>{cents(sum("sales"))}</td></tr></tfoot>
      </table>
    </div>;
  }
  function viewCampaign(key: string) { setCampaign(key); setDetailAsin(null); setPage(1); setTab("terms"); tabsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const rows = detailRows.map(f => [f.row.query || f.row.target || f.row.campaign, f.row.asin, f.row.campaign, f.row.adGroup, f.source, f.row.match, f.row.spend, f.row.spend, f.row.sales, f.row.orders, f.row.clicks, f.row.impressions, f.reasons.join("; "), f.severity, f.action, findingStatus(f)]);
    const csv = [["Term / Target", "ASIN", "Campaign", "Ad Group", "Source", "Match", "Spend", "Flagged Spend", "Sales", "Orders", "Clicks", "Impressions", "Reasons", "Severity", "Recommended Review", "Status"], ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-wasted-spend.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Opens a campaign in Amazon Ads in a new tab; nothing when the report has no campaign ID.
  const campaignLink = (url: string | null, name: string) => url ? <a className={s.amazonLink} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in Amazon Ads`} title="Open in Amazon Ads"><ExternalLink size={12} aria-hidden="true" /></a> : null;
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
    <div ref={tabsSection} className={s.wasteTabs}>
      <div role="tablist" aria-orientation="vertical" aria-label="Waste lists" className={s.tabList}>{([["terms", "Search Terms", `${count(detailRows.length)} waste items`], ["campaigns", "Campaigns", `${count(byCampaign.length)} campaigns`], ["asins", "ASINs", `${count(byAsin.length)} ASIN groups`], ["matches", "Match Types", `${count(byMatch.length)} match types`]] as const).map(([key, label, sub]) => <button key={key} type="button" role="tab" id={`waste-tab-${key}`} aria-selected={tab === key} aria-controls="waste-tab-panel" onClick={() => setTab(key)}><strong>{label}</strong><small>{sub}</small></button>)}</div>
      <div role="tabpanel" id="waste-tab-panel" aria-labelledby={`waste-tab-${tab}`} className={s.tabPanel}>
        {tab === "terms" ? <section ref={detailsSection} className={s.panel}><header className={headerClass("terms")}>{sectionTitle("Search Term Waste Details", `${count(detailRows.length)} identified waste items${detailAsin ? ` · ${detailAsin}` : ""}`)}{scrollTools("terms")}<div className={s.actions}>{detailAsin ? <button type="button" onClick={() => viewDetails(null)}>All ASIN details</button> : null}<details><summary>Columns</summary><div className={s.options}>{DETAIL_COLUMNS.filter(c => c !== "Search Term / Target").map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!detailRows.length} onClick={exportCsv}>CSV Export</button></div></header>{tab === "terms" ? <><div ref={attachTermsBox} className={listBox}><table className={s.details}><caption className={s.srOnly}>Search Term Waste Details</caption><thead><tr>{DETAIL_COLUMNS.map((c, i) => hidden.includes(c) ? null : <th key={c} scope="col" className={c === "Spend" ? s.spendCol : undefined} aria-sort={[5, 8, 9, 10].includes(i) && sort.key === ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i] ? sort.descending ? "descending" : "ascending" : undefined}>{[5, 8, 9, 10].includes(i) ? <button type="button" onClick={() => { const key = ({ 5: "spend", 8: "sales", 9: "orders", 10: "clicks" } as Record<number, string>)[i]; setSort({ key, descending: sort.key !== key || !sort.descending }); }}>{c} ↕</button> : c}</th>)}</tr></thead><tbody>{detailRows.slice((currentPage - 1) * 25, currentPage * 25).map(f => {
              const r = f.row;
              const term = r.query || r.target || r.campaign;
              const values = [<div key="term" className={s.termCell}><strong title={term}>{term}</strong><span className={s.termTools}>{amazonSearchTermsUrl(r.type, r.campaignId, r.adGroupId) ? <a href={amazonSearchTermsUrl(r.type, r.campaignId, r.adGroupId)!} target="_blank" rel="noopener noreferrer" onClick={() => { void navigator.clipboard?.writeText(term).catch(() => undefined); }} aria-label={`Open the Search terms tab of ad group ${r.adGroup || r.adGroupId} in ${r.campaign} in Amazon Ads (copies ${term})`} title="Opens this ad group's Search terms in Amazon Ads and copies the term. Amazon keeps your last search, so paste over it (Ctrl+A, Ctrl+V)."><ArrowUpRight size={13} aria-hidden="true" /></a> : null}<CopyTermButton term={term} /></span></div>, <Fragment key="product">{r.asin || "Unmapped"}<small>{products.get(r.asin)?.name || r.sku || "Product not supplied"}</small></Fragment>, <Fragment key="campaign">{r.campaign}{campaignLink(amazonCampaignUrl(r.type, r.campaignId), r.campaign)}<small>{r.adGroup || "Ad group not supplied"}</small></Fragment>, f.source, r.match || "—", money(r.spend), money(r.spend), "100%", money(r.sales), count(r.orders), count(r.clicks), money(r.clicks ? r.spend / r.clicks : null), percent(r.orders, r.clicks), percent(r.spend, r.sales), f.reasons.join(" · "), <span key="severity" className={s[f.severity.toLowerCase()]}>{f.severity}</span>, f.action, <select key="status" aria-label={`Status for ${r.query || r.target || r.campaign} in ${r.campaign} ${r.adGroup}`} value={findingStatus(f)} onChange={e => updateStatus(f.id, e.target.value as WasteStatus)}>{["Open", "Reviewed", "Action Taken"].map(v => <option key={v}>{v}</option>)}</select>];
              return <tr key={f.id}>{values.map((value, i) => hidden.includes(DETAIL_COLUMNS[i]) ? null : <td key={i} className={DETAIL_COLUMNS[i] === "Spend" ? s.spendCol : undefined}>{value}</td>)}</tr>;
            })}</tbody></table>{!detailRows.length ? <p className={s.emptyChart}>No waste details match this scope.</p> : null}</div><footer><span>{audit ? `${audit.start && audit.end ? `${audit.start} – ${audit.end}` : "Reporting dates unavailable"}` : "No reports imported"} · Status marks are review notes only.</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button> Page {currentPage} of {pages} <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer></> : null}</section> : null}
        {tab === "campaigns" ? <section ref={campaignSection} className={s.panel}><header className={headerClass("campaigns")}>{sectionTitle("Campaign Waste Details", `${count(byCampaign.length)} campaigns · highest flagged spend first`)}{scrollTools("campaigns")}</header>{tab === "campaigns" ? <div id="campaign-waste-table"><div ref={attachCampaignsBox} className={listBox}><table className={s.campaignTable}><caption className={s.srOnly}>Campaign Waste Details</caption><thead><tr>{["Campaign", "Type", "Total Spend", "Wasted Spend", "Waste %", "PPC Sales", "ACOS", "Search Terms", "Action"].map(label => <th key={label} scope="col" className={label === "Total Spend" ? s.spendCol : undefined}>{label}</th>)}</tr></thead><tbody>{byCampaign.slice((currentCampaignPage - 1) * 25, currentCampaignPage * 25).map(group => {
              const rows = adsByCampaign.get(group.name) || [], total = auditTotals(auditCampaignLevel(rows)), [type] = JSON.parse(group.name) as [string, string];
              const name = rows[0]?.campaign || findings.find(f => campaignKey(f.row) === group.name)?.row.campaign || "Campaign not supplied";
              const termsOpen = openCampaigns.includes(group.name);
              return <Fragment key={group.name}><tr><td><div className={s.campaignCell}><button type="button" aria-label={`Show wasted search terms for ${name}`} aria-expanded={termsOpen} onClick={() => setOpenCampaigns(termsOpen ? openCampaigns.filter(v => v !== group.name) : [...openCampaigns, group.name])}>{termsOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button><span><strong>{name}</strong>{campaignLink(amazonCampaignUrl(type, (JSON.parse(group.name) as [string, string])[1]), name)}</span></div></td><td>{type}</td><td className={s.spendCol}>{money(total.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, total.spend)}</td><td>{money(total.sales)}</td><td>{percent(total.spend, total.sales)}</td><td>{count(group.count)}</td><td><button type="button" onClick={() => viewCampaign(group.name)}>View Details</button></td></tr>{termsOpen ? <tr><td colSpan={9}>{campaignTerms(group, name)}</td></tr> : null}</Fragment>;
            })}</tbody></table>{!byCampaign.length ? <p className={s.emptyChart}>{audit ? "No campaign waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div><footer><span>{count(byCampaign.length)} campaigns</span><div><button type="button" disabled={currentCampaignPage === 1} onClick={() => setCampaignPage(currentCampaignPage - 1)}>Previous</button> Page {currentCampaignPage} of {campaignPages} <button type="button" disabled={currentCampaignPage === campaignPages} onClick={() => setCampaignPage(currentCampaignPage + 1)}>Next</button></div></footer></div> : null}</section> : null}
        {tab === "asins" ? <section ref={asinSection} className={s.panel}><header className={headerClass("asins")}>{sectionTitle("ASIN Waste Details", `${count(byAsin.length)} ASIN groups · highest flagged spend first`)}{scrollTools("asins")}</header>{tab === "asins" ? <><div ref={attachAsinsBox} className={listBox}><table className={s.asinTable}><caption className={s.srOnly}>ASIN Waste Details</caption><thead><tr>{["", "Product / SKU", "ASIN", "Total Spend", "Wasted Spend", "Waste %", "PPC Sales", "Orders", "ACOS", "Campaigns", "Terms/Targets", "Top Reason", "Status", "Action"].map((label, i) => <th key={i} scope="col" className={label === "Total Spend" ? s.spendCol : undefined}>{label || <span className={s.srOnly}>Expand campaigns</span>}</th>)}</tr></thead><tbody>{byAsin.slice((currentAsinPage - 1) * 25, currentAsinPage * 25).map(group => {
              const rows = findingsByAsin.get(group.name) || [], total = auditTotals(auditCampaignLevel(adsByAsin.get(group.name) || []));
              const reason = breakdown(rows, f => f.reason)[0]?.name;
              return <AsinRows key={group.name} group={group} rows={rows} ads={adsByAsin.get(group.name) || []} total={total} product={products.get(group.name)} reason={reason} expanded={expanded.includes(group.name)} onExpand={() => setExpanded(expanded.includes(group.name) ? expanded.filter(v => v !== group.name) : [...expanded, group.name])} onDetails={() => viewDetails(group.name)} status={rows.every(f => findingStatus(f) === "Action Taken") ? "Action Taken" : rows.every(f => findingStatus(f) !== "Open") ? "Reviewed" : "Open"} money={money} percent={percent} count={count} />;
            })}</tbody></table>{!byAsin.length ? <p className={s.emptyChart}>{audit ? "No ASIN waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div><footer><span>{byAsin.length} ASIN groups</span><div><button type="button" disabled={currentAsinPage === 1} onClick={() => setAsinPage(currentAsinPage - 1)}>Previous</button> Page {currentAsinPage} of {asinPages} <button type="button" disabled={currentAsinPage === asinPages} onClick={() => setAsinPage(currentAsinPage + 1)}>Next</button></div></footer></> : null}</section> : null}
        {tab === "matches" ? <section className={s.panel}><header>{sectionTitle("Match Type Waste Details", `${count(byMatch.length)} match types · highest flagged spend first`)}</header><div className={s.tableWrap}><table className={s.matchTable}><caption className={s.srOnly}>Match Type Waste Details</caption><thead><tr>{["Match Type", "Search Term Spend", "Wasted Spend", "Waste %", "Share of Waste", "PPC Sales", "ACOS", "Search Terms", "Action"].map(label => <th key={label} scope="col" className={label === "Search Term Spend" ? s.spendCol : undefined}>{label}</th>)}</tr></thead><tbody>{byMatch.map(group => { const totals = matchTotals.get(group.name) || { spend: 0, sales: 0 }; const filterable = group.name !== "Product targeting"; return <tr key={group.name}><td><strong>{group.name}</strong></td><td className={s.spendCol}>{money(totals.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, totals.spend)}</td><td>{percent(group.spend, waste)}</td><td>{money(totals.sales)}</td><td>{percent(totals.spend, totals.sales)}</td><td>{count(group.count)}</td><td>{filterable ? <button type="button" onClick={() => { setMatch(group.name); setDetailAsin(null); setPage(1); setTab("terms"); }}>View Details</button> : null}</td></tr>; })}</tbody></table>{!byMatch.length ? <p className={s.emptyChart}>{audit ? "No match type waste matches these rules and filters." : "Waiting for uploaded reports."}</p> : null}</div></section> : null}
      </div>
    </div>
    {drawer && audit ? <AuditSettingsDialog rules={rules} onClose={closeRules} onSave={next => { onRulesChange?.(next); setPage(1); setAsinPage(1); setCampaignPage(1); closeRules(); }} /> : null}
  </div>;
}

/** Copies a search term to the clipboard, showing a check for a moment after it worked. */
function CopyTermButton({ term }: { term: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(term); setState("copied"); } catch { setState("error"); }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1500);
  }
  return <button type="button" aria-label={state === "copied" ? `Copied ${term}` : state === "error" ? `Copy ${term} failed` : `Copy ${term}`} title={state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "Copy search term"} onClick={() => void copy()}>{state === "copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}</button>;
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
    // Re-measure when the table changes width (paging, hidden columns); skipped where ResizeObserver is missing.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(target);
    if (target.firstElementChild) observer?.observe(target.firstElementChild);
    target.addEventListener("scroll", follow);
    top.addEventListener("scroll", lead);
    return () => { observer?.disconnect(); target.removeEventListener("scroll", follow); top.removeEventListener("scroll", lead); };
  }, [target]);
  // Hidden from screen readers: the table itself scrolls by keyboard; this bar only mirrors it.
  return <div ref={bar} className={s.topScroll} aria-hidden="true"><div style={{ width }} /></div>;
}

type CampaignSplit = { key: string; name: string; type: string; url: string | null; spend: number; sales: number; orders: number; clicks: number; wasted: number; terms: number };
/** One ASIN's campaigns with their own totals (campaign-level rows only, as for the ASIN row) and the waste found in each. */
function asinCampaigns(ads: AuditAd[], findings: WasteFinding[]): CampaignSplit[] {
  const key = (r: AuditAd) => JSON.stringify([r.type, r.campaignId]);
  const groups = new Map<string, AuditAd[]>();
  for (const r of ads) { const group = groups.get(key(r)); if (group) group.push(r); else groups.set(key(r), [r]); }
  const waste = new Map<string, { spend: number; count: number }>();
  for (const f of findings) { const w = waste.get(key(f.row)) || { spend: 0, count: 0 }; w.spend += f.row.spend; w.count++; waste.set(key(f.row), w); }
  return [...groups].map(([k, rows]) => { const t = auditTotals(auditCampaignLevel(rows)); const w = waste.get(k); return { key: k, name: rows[0].campaign, type: rows[0].type, url: amazonCampaignUrl(rows[0].type, rows[0].campaignId), spend: t.spend, sales: t.sales, orders: t.orders, clicks: t.clicks, wasted: w?.spend ?? 0, terms: w?.count ?? 0 }; })
    .filter(c => c.spend > 0 || c.wasted > 0)
    .sort((a, b) => b.wasted - a.wasted || b.spend - a.spend || a.name.localeCompare(b.name));
}

function AsinRows({ group, rows, ads, total, product, reason, expanded, onExpand, onDetails, status, money, percent, count }: { group: Breakdown; rows: WasteFinding[]; ads: AuditAd[]; total: ReturnType<typeof auditTotals>; product?: Product; reason?: string; expanded: boolean; onExpand: () => void; onDetails: () => void; status: string; money: (n: number | null) => string; percent: (a: number, b: number) => string; count: (n: number) => string }) {
  const campaigns = expanded ? asinCampaigns(ads, rows) : [];
  return <><tr><td><button type="button" aria-label={`Expand campaigns for ${group.name}`} aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td><td><strong>{product?.name || "Product not supplied"}</strong><small>{product?.sku || "SKU not supplied"}</small></td><td>{group.name}</td><td className={s.spendCol}>{money(total.spend)}</td><td><strong>{money(group.spend)}</strong></td><td>{percent(group.spend, total.spend)}</td><td>{money(total.sales)}</td><td>{total.orders}</td><td>{percent(total.spend, total.sales)}</td><td>{new Set(rows.map(f => `${f.row.type}:${f.row.campaignId}`)).size}</td><td>{rows.length}</td><td>{reason}</td><td>{status}</td><td><button type="button" onClick={onDetails}>View Details</button></td></tr>{expanded ? <tr><td colSpan={14}><div className={s.subrows}>
    <p>{count(campaigns.length)} campaigns with spend on this ASIN · {count(campaigns.filter(c => c.wasted > 0).length)} with wasted spend · Share = the campaign&apos;s part of the ASIN total</p>
    <table className={s.subTable}><caption className={s.srOnly}>Campaigns for {group.name}</caption><thead><tr>{["Campaign", "Type", "Spend", "Spend share", "Wasted", "Waste %", "PPC Sales", "Sales share", "Orders", "Clicks", "ACOS", "Wasted terms"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{campaigns.map(c => <tr key={c.key}><td>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" title={`${c.name} · open in Amazon Ads`}>{c.name}<ExternalLink size={11} aria-hidden="true" /></a> : <span title={c.name}>{c.name}</span>}</td><td>{c.type}</td><td>{money(c.spend)}</td><td>{percent(c.spend, total.spend)}</td><td>{c.wasted ? <strong>{money(c.wasted)}</strong> : money(0)}</td><td>{percent(c.wasted, c.spend)}</td><td>{money(c.sales)}</td><td>{percent(c.sales, total.sales)}</td><td>{count(c.orders)}</td><td>{count(c.clicks)}</td><td>{percent(c.spend, c.sales)}</td><td>{count(c.terms)}</td></tr>)}</tbody>
    </table>
  </div></td></tr> : null}</>;
}
