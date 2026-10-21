"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { auditRate, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { asinCampaignKey } from "../domain/ppc-audit-asins";
import { searchTermAnalysis, type SearchTermPerformance } from "../domain/ppc-audit-search-terms";
import { DEFAULT_WASTE_RULES, readWasteReview, type WasteRules } from "../domain/ppc-audit-waste";
import s from "./audit-keywords.module.css";
import pt from "./audit-product-targets.module.css";

type Product = { asin: string; sku: string; name: string };
type Format = (n: number | null) => string;
const COLUMNS = ["Search Term", "Match", "Campaign & Ad Group", "Advertised ASIN", "Source Target", "Spend", "Waste", "PPC Sales", "Orders", "CPC", "CVR", "ACOS", "Status", "Actions"];
const SORTS = ["Highest Spend", "Highest ACOS", "Lowest ACOS", "Most Wasted Spend", "Most Orders"];

export function AuditSearchTerms({ audit, ads, catalog }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[] }) {
  const [adGroup, setAdGroup] = useState(""); const [sourceType, setSourceType] = useState(""); const [pageSize, setPageSize] = useState(25);
  const [asin, setAsin] = useState(""); const [campaign, setCampaign] = useState(""); const [match, setMatch] = useState(""); const [placement, setPlacement] = useState(""); const [status, setStatus] = useState("");
  const [search, setSearch] = useState(""); const [minSpend, setMinSpend] = useState(""); const [sort, setSort] = useState(SORTS[0]); const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]); const [hidden, setHidden] = useState<string[]>([]); const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES); const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !audit) return; try { const saved = readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) setRules(saved.rules); } catch { /* Use default rules when storage is unavailable. */ } });
    return () => { active = false; };
  }, [audit]);
  const all = useMemo(() => searchTermAnalysis(ads, {}, rules), [ads, rules]);
  const data = useMemo(() => searchTermAnalysis(ads, { asin, campaign, adGroup, sourceType, match, placement, status, search, minSpend: Number.isFinite(Number(minSpend)) ? Math.max(0, Number(minSpend)) : 0 }, rules), [ads, asin, campaign, adGroup, sourceType, match, placement, status, search, minSpend, rules]);
  const p = data.portfolio;
  const count: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const money: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const percent: Format = n => n === null || !audit ? "—" : `${count(n)}%`;
  const ratio = (a: number, b: number) => percent(auditRate(a, b));
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p.name])), [catalog]);
  const rows = useMemo(() => [...data.rows].sort((a, b) => {
    const value = (r: SearchTermPerformance) => sort.includes("ACOS") ? r.acos : sort === "Most Wasted Spend" ? r.waste : sort === "Most Orders" ? r.available ? r.totals.orders : null : r.available ? r.totals.spend : null;
    const av = value(a), bv = value(b);
    if (av === null) return bv === null ? a.id.localeCompare(b.id) : 1;
    if (bv === null) return -1;
    return (av - bv) * (sort === "Lowest ACOS" ? 1 : -1) || a.id.localeCompare(b.id);
  }), [data.rows, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages);
  function reset() { setAdGroup(""); setSourceType(""); setAsin(""); setCampaign(""); setMatch(""); setPlacement(""); setStatus(""); setSearch(""); setMinSpend(""); setPage(1); setExpanded([]); }
  function refresh() {
    let next = DEFAULT_WASTE_RULES;
    try { const saved = audit && readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) next = saved.rules; } catch { /* Use default rules. */ }
    setRules({ ...next }); setNotice("Recalculated from the current uploaded reports.");
  }
  function select(label: string, value: string, setter: (value: string) => void, options: [string, string][], placeholder: string) {
    return <label>{label}<select value={value} onChange={e => { setter(e.target.value); setPage(1); }}><option value="">{placeholder}</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
  }
  function exportCsv() {
    const escape = (value: string | number | null) => `"${String(value ?? "").replace(/^\s*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [["Search Term", "Source Type", "Target", "Source ID", "Match", "Campaign", "Campaign ID", "Ad Group", "Ad Group ID", "ASIN", "Bid", "Spend", "Flagged Spend", "PPC Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Source", "Signals", "Recommended Review", "Status"], ...rows.map(r => [r.row.query, r.sourceType, r.row.target, r.row.targetId || r.row.keywordId || "", r.match, r.row.campaign, r.row.campaignId, r.row.adGroup, r.row.adGroupId || "", r.row.asin, r.bid, r.available ? r.totals.spend : null, r.available ? r.waste : null, r.available ? r.totals.sales : null, r.available ? r.totals.orders : null, r.available ? r.totals.clicks : null, r.cpc, r.cvr, r.acos, r.source, r.signals.join("; "), r.review, r.status])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-search-terms.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const campaigns = [...new Map(all.rows.map(r => [asinCampaignKey(r.row), `${r.row.campaign} · ${r.row.type} · ${r.row.campaignId}`])).entries()];
  const needsAttention = data.rows.filter(r => r.signals.some(signal => ["High ACOS", "No Orders", "High Wasted Spend", "Low CVR", "High CPC"].includes(signal))).length;
  return <div className={`${s.workspace} ${pt.workspace}`}>
    <header className={s.heading}><div><h1>Search Terms</h1><small>Showing {rows.length} search terms</small><p>Analyze customer search queries, flagged spend, negative candidates, and exact-match opportunities.</p></div><div className={s.actions}>
      <button type="button" disabled={!audit} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh</button><details><summary><SlidersHorizontal size={14} aria-hidden="true" />Column Settings</summary><div className={s.options}>{COLUMNS.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!rows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button>
    </div></header>
    {!audit ? <p className={s.note}>Upload your PPC Report and Business Report above to populate this dashboard.</p> : null}
    {notice ? <p className={s.note} role="status">{notice}</p> : null}
    <div className={s.filters}><label className={s.search}>Search<input value={search} placeholder="Search term, target, campaign, ASIN…" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      {select("ASIN", asin, setAsin, [...new Set(all.rows.map(r => r.row.asin || "Unmapped"))].sort().map(v => [v, v === "Unmapped" ? "ASIN not supplied" : `${v}${products.get(v) ? ` · ${products.get(v)}` : ""}`]), "All ASINs")}
      {select("Campaign", campaign, setCampaign, campaigns, "All Campaigns")}
      {select("Ad Group", adGroup, setAdGroup, [...new Set(all.rows.map(r => r.row.adGroupId || r.row.adGroup || "Not supplied"))].sort().map(v => [v, all.rows.find(r => (r.row.adGroupId || r.row.adGroup || "Not supplied") === v)?.row.adGroup || v]), "All Ad Groups")}
      {select("Source Type", sourceType, setSourceType, [...new Set(all.rows.map(r => r.sourceType))].sort().map(v => [v, v]), "All Source Types")}
      {select("Match", match, setMatch, [...new Set(all.rows.map(r => r.match))].sort().map(v => [v, v]), "All Matches")}
      {select("Placement", placement, setPlacement, [...new Set(all.rows.flatMap(r => r.placements.map(p => p.name)))].sort().map(v => [v, v]), "All Placements")}
      {select("Status", status, setStatus, [...new Set(["Strong", "Healthy", "Exact Harvest", "Negative Candidate", "High ACOS", "High Wasted Spend", "No Orders", "Low CVR", "Performance Unavailable"])].map(v => [v, v]), "All Statuses")}
      <label>Min Spend<input type="number" min="0" step="any" value={minSpend} placeholder="Any" onChange={e => { setMinSpend(e.target.value); setPage(1); }} /></label><button type="button" onClick={reset}>Reset Filters</button>
    </div>
    <section className={s.panel}><header><h2>Search Term Portfolio</h2><small>{data.rows.filter(r => r.signals.includes("Strong")).length} Strong · {needsAttention} Need Attention · {data.rows.filter(r => r.signals.includes("Exact Harvest")).length} Opportunities</small></header><div className={s.portfolio} role="region" aria-label="Search term portfolio metrics">
      {[["Search Terms", count(rows.length)], ["Total Spend", money(p.available ? p.totals.spend : null)], ["PPC Sales", money(p.available ? p.totals.sales : null)], ["PPC Orders", count(p.available ? p.totals.orders : null)], ["Avg ACOS", percent(p.acos)], ["Avg CPC", money(p.cpc)], ["Avg CVR", percent(p.cvr)], ["Wasted Ad Spend", money(p.available ? p.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong>{label === "Avg ACOS" ? <small>Review threshold ≤ 20%</small> : label === "Wasted Ad Spend" ? <small>{p.available ? ratio(p.waste, p.totals.spend) : "—"} of spend</small> : null}</div>)}
    </div></section>
    <div className={s.diagnostics}><section className={s.panel}><header><h2>Performance by Match Type</h2><small>Side-by-side efficiency</small></header><div className={pt.types}>{data.matches.map(g => <article key={g.name}><header><strong>{g.name}</strong><small>{count(g.count)} Terms</small></header>{[["Spend", money(g.available ? g.totals.spend : null)], ["Sales", money(g.available ? g.totals.sales : null)], ["Orders", count(g.available ? g.totals.orders : null)], ["CPC / CVR", `${money(g.cpc)} / ${percent(g.cvr)}`], ["ACOS", percent(g.acos)], ["Wasted", money(g.available ? g.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>)}</div></section>
      <section className={s.panel}><header><h2>Actionable Signals</h2></header><p>Signals may overlap. High ACOS &gt;35%; low CVR &lt;8%. Waste uses your saved rules. Harvest candidates need at least 2 orders and ACOS ≤20%.</p><div className={s.signals}>{data.signals.map(signal => <button key={signal.name} type="button" onClick={() => { setStatus(signal.name); setPage(1); }} aria-pressed={status === signal.name}><span>{signal.name}</span><strong>{count(signal.count)}</strong></button>)}</div><p className={s.note}>{data.rows.filter(r => r.signals.includes("Exact Harvest")).length} terms eligible for exact-harvest review. <button type="button" disabled={!data.rows.some(r => r.signals.includes("Exact Harvest"))} onClick={() => { setStatus("Exact Harvest"); setPage(1); }}>Review Harvest Candidates</button></p></section>
    </div>
    {audit && rows.some(r => !r.available) ? <p className={s.note}>Some search-term metrics are unavailable. Totals include available report evidence only.</p> : null}
    <section className={s.panel}><header><div><h2>Search Term Performance</h2><p>Compare actual queries with their source targets, campaign context, and conversion performance.</p></div><label>Sort by<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{SORTS.map(v => <option key={v}>{v}</option>)}</select></label></header><div className={s.tableWrap}><table aria-label="Search Term Performance"><caption className={s.srOnly}>Search Term Performance</caption><thead><tr>{COLUMNS.filter(c => !hidden.includes(c)).map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>
      {rows.slice((current - 1) * pageSize, current * pageSize).map(r => {
        const open = expanded.includes(r.id);
        const values: ReactNode[] = [<button key="expand" type="button" aria-label={`Expand search term ${r.row.query} ${r.row.campaignId} ${r.row.adGroupId || r.row.adGroup} ${r.row.asin || "Unmapped"} ${r.row.match} ${r.row.targetId || ""}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== r.id) : [...expanded, r.id])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.row.query}</button>, r.match, <Fragment key="context"><strong>{r.row.campaign}</strong><small>{r.row.adGroup || "Ad group not supplied"}</small></Fragment>, <Fragment key="product"><strong>{r.row.asin || "Not supplied"}</strong><small>{products.get(r.row.asin) || ""}</small></Fragment>, <Fragment key="source"><strong>{r.row.target || "Not supplied"}</strong><small>{r.sourceType}</small></Fragment>, money(r.available ? r.totals.spend : null), money(r.available ? r.waste : null), money(r.available ? r.totals.sales : null), count(r.available ? r.totals.orders : null), money(r.cpc), percent(r.cvr), percent(r.acos), <span key="status" className={s.badge}>{r.status}</span>, <button key="review" type="button" aria-label={`Review search term ${r.row.query} ${r.row.campaignId} ${r.row.adGroupId || r.row.adGroup} ${r.row.asin || "Unmapped"} ${r.row.targetId || ""}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== r.id) : [...expanded, r.id])}>{r.status === "Exact Harvest" ? "Harvest" : r.status === "Negative Candidate" ? "Negate" : "View"}</button>];
        return <Fragment key={r.id}><tr>{values.map((v, i) => hidden.includes(COLUMNS[i]) ? null : <td key={i}>{v}</td>)}</tr>{open ? <tr><td colSpan={COLUMNS.filter(c => !hidden.includes(c)).length}><SearchTermDetails term={r} money={money} count={count} percent={percent} ratio={ratio} portfolioSpend={p.totals.spend} portfolioSales={p.totals.sales} portfolioCvr={p.cvr} scopedPlacement={placement} /></td></tr> : null}</Fragment>;
      })}
    </tbody></table>{!rows.length ? <p className={s.empty}>{!audit ? "Waiting for uploaded reports." : placement ? "Search-term placement data was not supplied for this scope." : "No search terms match this scope. Check the filters and report contents."}</p> : null}</div><footer><span>{rows.length ? `Showing ${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, rows.length)} of ${rows.length} search terms` : "0 search terms"}{audit ? ` · ${audit.start} – ${audit.end}` : ""}</span><div><label>Rows per page<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button> Page {current} of {pages} <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></footer></section>
  </div>;
}

function SearchTermDetails({ term: r, money, count, percent, ratio, portfolioSpend, portfolioSales, portfolioCvr, scopedPlacement }: { term: SearchTermPerformance; money: Format; count: Format; percent: Format; ratio: (a: number, b: number) => string; portfolioSpend: number; portfolioSales: number; portfolioCvr: number | null; scopedPlacement: string }) {
  const placements = r.placements.filter(p => !scopedPlacement || p.name === scopedPlacement);
  const best = placements.filter(p => p.acos !== null && p.totals.orders > 0).sort((a, b) => a.acos! - b.acos!)[0];
  const parent = r.parent, contributionAvailable = !scopedPlacement && r.available && parent?.available && r.totals.spend <= parent.totals.spend + 0.01 && r.totals.sales <= parent.totals.sales + 0.01;
  return <div className={s.detail}>
    <header><div><strong>{r.row.query}</strong><span className={s.badge}>{r.match}</span><p>{r.row.campaign} · {r.row.adGroup || "Ad group not supplied"} · ASIN {r.row.asin || "not supplied"}</p></div><span className={s.badge}>{r.status}</span></header>
    <div className={pt.metrics} aria-label="Expanded search term metrics">
      <div><span>Source Bid / Avg CPC</span><strong>{money(r.bid)} / {money(r.cpc)}</strong><small>{r.bid !== null && r.cpc !== null ? `${money(r.bid - r.cpc)} difference` : "Source bid not supplied"}</small></div>
      <div><span>Spend &amp; Revenue</span><strong>{money(r.available ? r.totals.spend : null)} / {money(r.available ? r.totals.sales : null)}</strong><small>{r.available && r.totals.spend > 0 ? `${(r.totals.sales / r.totals.spend).toFixed(1)}x ROAS` : "ROAS unavailable"}</small></div>
      <div><span>Orders &amp; CVR</span><strong>{count(r.available ? r.totals.orders : null)} / {percent(r.cvr)}</strong><small>Portfolio CVR {percent(portfolioCvr)}</small></div>
      <div><span>ACOS Efficiency</span><strong>{percent(r.acos)}</strong><small>Harvest review threshold ≤20%</small></div>
      <div><span>Spend / Sales Share</span><strong>{r.available ? ratio(r.totals.spend, portfolioSpend) : "—"} / {r.available ? ratio(r.totals.sales, portfolioSales) : "—"}</strong><small>Of filtered search terms</small></div>
    </div>
    <div className={s.diagnostics}><section className={s.evidence}><header><h3>Source Target Contribution</h3><small>{r.sourceType}</small></header><p><strong>{r.row.target || "Source target not supplied"}</strong> · {r.match}</p>
      <p>Spend share: {contributionAvailable ? `${money(r.totals.spend)} of ${money(parent.totals.spend)} · ${ratio(r.totals.spend, parent.totals.spend)}` : "—"}</p>
      <p>Revenue contribution: {contributionAvailable ? `${money(r.totals.sales)} of ${money(parent.totals.sales)} · ${ratio(r.totals.sales, parent.totals.sales)}` : "—"}</p>
      <p>Search term / source ACOS: {percent(r.acos)} / {percent(parent?.available ? parent.acos : null)}</p>
      {!contributionAvailable ? <small>Matching source-target totals were not supplied for this scope.</small> : null}
    </section><section className={s.evidence}><header><h3>Placement Breakdown (Search Term Level)</h3><small>{placements.length} reported placements</small></header><div className={s.tableWrap}><table aria-label={`Placement breakdown for search term ${r.row.query}`}><thead><tr>{["Placement", "Spend", "Sales", "Orders", "CPC", "CVR", "ACOS"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{placements.map(p => <tr key={p.name}><th scope="row">{p.name}</th><td>{money(p.available ? p.totals.spend : null)}</td><td>{money(p.available ? p.totals.sales : null)}</td><td>{count(p.available ? p.totals.orders : null)}</td><td>{money(p.cpc)}</td><td>{percent(p.cvr)}</td><td>{percent(p.acos)}</td></tr>)}</tbody></table></div>{!placements.length ? <p className={s.empty}>Search-term placement data was not supplied.</p> : null}</section></div>
    <section className={s.evidence}><header><h3>Audit Findings &amp; Strategic Recommendations</h3></header><div className={pt.findings}>
      <article><strong>01 · Action review</strong><p>{r.review}. {r.status === "Exact Harvest" ? "No active exact keyword was found for this ASIN in the uploaded report. Confirm current account coverage before creating one." : r.status === "Negative Candidate" ? "Review intent and the reporting window before adding exclusions." : "No campaign changes have been applied."}</p></article>
      <article><strong>02 · Conversion efficiency</strong><p>CVR {percent(r.cvr)} versus portfolio {percent(portfolioCvr)}. {money(r.available ? r.waste : null)} spend is flagged under the saved waste rules.</p></article>
      <article><strong>03 · Placement evidence</strong><p>{best ? `${best.name} has the lowest reported converting-placement ACOS at ${percent(best.acos)}. Review volume before changing exposure.` : "No converting query-level placement evidence is available."}</p></article>
      <article><strong>04 · Source context</strong><p>{contributionAvailable ? `${ratio(r.totals.sales, parent.totals.sales)} of the source target’s reported sales.` : "Source contribution is unavailable without a unique matching target report."} Review parent coverage and relevance before acting.</p></article>
    </div></section>
    <p className={s.detailNote}>Review only. Parent, query, and placement totals are separate report views. Harvest and Negate open this review; they do not change Amazon campaigns.</p>
  </div>;
}
