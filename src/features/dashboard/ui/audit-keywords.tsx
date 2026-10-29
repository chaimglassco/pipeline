"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { auditRate, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { asinCampaignKey } from "../domain/ppc-audit-asins";
import { keywordAnalysis, keywordMatchName, type KeywordPerformance } from "../domain/ppc-audit-keywords";
import { DEFAULT_WASTE_RULES, readWasteReview, type WasteRules } from "../domain/ppc-audit-waste";
import s from "./audit-keywords.module.css";

type Product = { asin: string; sku: string; name: string };
type Format = (n: number | null) => string;
const COLUMNS = ["Keyword", "Match", "Campaign & Ad Group", "ASIN", "Bid", "Spend", "Waste", "PPC Sales", "Orders", "CPC", "CVR", "ACOS", "Performance Signal", "Recommended Review", "Status"];
const SORTS = ["Highest Spend", "Highest ACOS", "Lowest ACOS", "Most Wasted Spend", "Most Orders"];

export function AuditKeywords({ audit, ads, catalog }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[] }) {
  const [asin, setAsin] = useState(""); const [campaign, setCampaign] = useState(""); const [match, setMatch] = useState(""); const [placement, setPlacement] = useState(""); const [status, setStatus] = useState("");
  const [search, setSearch] = useState(""); const [minSpend, setMinSpend] = useState(""); const [sort, setSort] = useState(SORTS[0]); const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]); const [hidden, setHidden] = useState<string[]>([]); const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES); const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !audit) return; try { const saved = readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) setRules(saved.rules); } catch { /* Use default rules when storage is unavailable. */ } });
    return () => { active = false; };
  }, [audit]);
  const all = useMemo(() => keywordAnalysis(ads, {}, rules), [ads, rules]);
  const data = useMemo(() => keywordAnalysis(ads, { asin, campaign, match, placement, status, search, minSpend: Number.isFinite(Number(minSpend)) ? Math.max(0, Number(minSpend)) : 0 }, rules), [ads, asin, campaign, match, placement, status, search, minSpend, rules]);
  const p = data.portfolio;
  const count: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const money: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const percent: Format = n => n === null || !audit ? "—" : `${count(n)}%`;
  const ratio = (a: number, b: number) => percent(auditRate(a, b));
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p.name])), [catalog]);
  const rows = [...data.rows].sort((a, b) => {
    const value = (r: KeywordPerformance) => sort.includes("ACOS") ? r.acos : sort === "Most Wasted Spend" ? r.waste : sort === "Most Orders" ? r.available ? r.totals.orders : null : r.available ? r.totals.spend : null;
    const av = value(a), bv = value(b);
    if (av === null) return bv === null ? a.id.localeCompare(b.id) : 1;
    if (bv === null) return -1;
    return (av - bv) * (sort === "Lowest ACOS" ? 1 : -1) || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(rows.length / 25)), current = Math.min(page, pages);
  function reset() { setAsin(""); setCampaign(""); setMatch(""); setPlacement(""); setStatus(""); setSearch(""); setMinSpend(""); setPage(1); setExpanded([]); }
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
    const csv = [["Keyword", "Keyword ID", "Match", "Campaign", "Campaign ID", "Ad Group", "Ad Group ID", "ASIN", "Bid", "Spend", "Flagged Spend", "PPC Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Source", "Signals", "Recommended Review", "Status"], ...rows.map(r => [r.row.target, r.row.keywordId || "", r.row.match, r.row.campaign, r.row.campaignId, r.row.adGroup, r.row.adGroupId || "", r.row.asin, r.bid, r.available ? r.totals.spend : null, r.available ? r.waste : null, r.available ? r.totals.sales : null, r.available ? r.totals.orders : null, r.available ? r.totals.clicks : null, r.cpc, r.cvr, r.acos, r.source, r.signals.join("; "), r.review, r.status])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-keyword-targets.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const campaigns = [...new Map(all.rows.map(r => [asinCampaignKey(r.row), `${r.row.campaign} · ${r.row.type} · ${r.row.campaignId}`])).entries()];
  const needsAttention = data.rows.filter(r => r.signals.some(signal => ["High ACOS", "No Orders", "High Wasted Spend", "Low CVR", "High CPC"].includes(signal))).length;
  return <div className={s.workspace}>
    <header className={s.heading}><div><h1>Keyword Target</h1><small>Showing {rows.length} keyword targets</small><p>Review keyword efficiency, match-type patterns, and reported search-term and placement evidence.</p></div><div className={s.actions}>
      <button type="button" disabled={!audit} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh</button><details><summary><SlidersHorizontal size={14} aria-hidden="true" />Column Settings</summary><div className={s.options}>{COLUMNS.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!rows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button>
    </div></header>
    {!audit ? <p className={s.note}>Upload your PPC Report above to populate this dashboard.</p> : null}
    {notice ? <p className={s.note} role="status">{notice}</p> : null}
    <div className={s.filters}><label className={s.search}>Search<input value={search} placeholder="Keyword, ASIN, campaign…" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      {select("ASIN", asin, setAsin, [...new Set(all.rows.map(r => r.row.asin || "Unmapped"))].sort().map(v => [v, v === "Unmapped" ? "ASIN not supplied" : `${v}${products.get(v) ? ` · ${products.get(v)}` : ""}`]), "All ASINs")}
      {select("Campaign", campaign, setCampaign, campaigns, "All Campaigns")}
      {select("Match", match, setMatch, [...new Set(all.rows.map(r => keywordMatchName(r.row.match)))].sort().map(v => [v, v]), "All Match Types")}
      {select("Placement", placement, setPlacement, [...new Set(all.rows.flatMap(r => r.placements.map(p => p.name)))].sort().map(v => [v, v]), "All Placements")}
      {select("Status", status, setStatus, [...new Set(["Strong", "Healthy", "Opportunity", "High ACOS", "High Wasted Spend", "No Orders", "Low CVR", "High CPC", "Performance Unavailable"])].map(v => [v, v]), "All Statuses")}
      <label>Min Spend<input type="number" min="0" step="any" value={minSpend} placeholder="Any" onChange={e => { setMinSpend(e.target.value); setPage(1); }} /></label><button type="button" onClick={reset}>Reset Filters</button>
    </div>
    <section className={s.panel}><header><h2>Keyword Portfolio Aggregate Metrics</h2><small>{data.rows.filter(r => r.signals.includes("Strong")).length} Strong · {needsAttention} Need Attention · {data.rows.filter(r => r.signals.includes("Opportunity")).length} Opportunities</small></header><div className={s.portfolio} role="region" aria-label="Keyword portfolio metrics">
      {[["Keyword Targets", count(rows.length)], ["Total Spend", money(p.available ? p.totals.spend : null)], ["PPC Sales", money(p.available ? p.totals.sales : null)], ["PPC Orders", count(p.available ? p.totals.orders : null)], ["Avg ACOS", percent(p.acos)], ["Avg CPC", money(p.cpc)], ["Avg CVR", percent(p.cvr)], ["Wasted Ad Spend", money(p.available ? p.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong>{label === "Avg ACOS" ? <small>Review threshold ≤ 20%</small> : label === "Wasted Ad Spend" ? <small>{p.available ? ratio(p.waste, p.totals.spend) : "—"} of spend</small> : null}</div>)}
    </div></section>
    <div className={s.diagnostics}><section className={s.panel}><header><h2>Match Type Distribution &amp; Diagnostics</h2></header><div className={s.matchCards}>{data.matches.map(g => <article key={g.name}><header><strong>{g.name}</strong><small>{count(g.count)} Keywords</small></header>{[["Spend", money(g.available ? g.totals.spend : null)], ["Sales", money(g.available ? g.totals.sales : null)], ["Orders", count(g.available ? g.totals.orders : null)], ["CPC / CVR", `${money(g.cpc)} / ${percent(g.cvr)}`], ["ACOS", percent(g.acos)], ["Wasted", money(g.available ? g.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>)}</div></section>
      <section className={s.panel}><header><h2>Keyword Signals Breakdown</h2></header><p>Signals may overlap. High CPC uses 150% of the scoped average before status filtering. Waste and low-CVR checks use your saved rules.</p><div className={s.signals}>{data.signals.map(signal => <button key={signal.name} type="button" onClick={() => { setStatus(signal.name); setPage(1); }} aria-pressed={status === signal.name}><span>{signal.name}</span><strong>{count(signal.count)}</strong></button>)}</div></section>
    </div>
    {audit && data.unlinkedQueries > 0 ? <p className={s.note}>Some search terms lack a unique keyword link and are excluded from keyword drilldowns.</p> : null}
    {audit && rows.some(r => !r.available) ? <p className={s.note}>Some keyword metrics are unavailable. Totals include available report evidence only.</p> : null}
    <section className={s.panel}><header><div><h2>Keyword Target Performance</h2><p>Compare keywords across ASINs, campaigns, ad groups, and match types.</p></div><label>Sort by<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{SORTS.map(v => <option key={v}>{v}</option>)}</select></label></header><div className={s.tableWrap}><table aria-label="Keyword Target Performance"><caption className={s.srOnly}>Keyword Target Performance</caption><thead><tr>{COLUMNS.filter(c => !hidden.includes(c)).map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>
      {rows.slice((current - 1) * 25, current * 25).map(r => {
        const open = expanded.includes(r.id);
        const values: ReactNode[] = [<button key="expand" type="button" aria-label={`Expand keyword ${r.row.target} ${r.row.campaignId} ${r.row.adGroupId || r.row.adGroup} ${r.row.asin || "Unmapped"} ${r.row.match} ${r.row.keywordId || ""}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== r.id) : [...expanded, r.id])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.row.target}</button>, keywordMatchName(r.row.match), <Fragment key="context"><strong>{r.row.campaign}</strong><small>{r.row.adGroup || "Ad group not supplied"}</small></Fragment>, r.row.asin || "Not supplied", money(r.bid), money(r.available ? r.totals.spend : null), money(r.available ? r.waste : null), money(r.available ? r.totals.sales : null), count(r.available ? r.totals.orders : null), money(r.cpc), percent(r.cvr), percent(r.acos), r.signals.join(" · ") || (r.available ? "Monitor" : "Unavailable"), r.review, <span key="status" className={s.badge}>{r.status}</span>];
        return <Fragment key={r.id}><tr>{values.map((v, i) => hidden.includes(COLUMNS[i]) ? null : <td key={i}>{v}</td>)}</tr>{open ? <tr><td colSpan={COLUMNS.filter(c => !hidden.includes(c)).length}><KeywordDetails keyword={r} money={money} count={count} percent={percent} ratio={ratio} portfolioSpend={p.totals.spend} portfolioSales={p.totals.sales} scopedPlacement={placement} /></td></tr> : null}</Fragment>;
      })}
    </tbody></table>{!rows.length ? <p className={s.empty}>{!audit ? "Waiting for uploaded reports." : placement ? "Keyword-level placement data was not supplied for this scope." : "No keyword targets match this scope. Check the filters and report contents."}</p> : null}</div><footer><span>{rows.length ? `Showing ${(current - 1) * 25 + 1}–${Math.min(current * 25, rows.length)} of ${rows.length} keyword targets` : "0 keyword targets"}{audit ? ` · ${audit.start} – ${audit.end}` : ""}</span><div><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button> Page {current} of {pages} <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></footer></section>
  </div>;
}

function KeywordDetails({ keyword: r, money, count, percent, ratio, portfolioSpend, portfolioSales, scopedPlacement }: { keyword: KeywordPerformance; money: Format; count: Format; percent: Format; ratio: (a: number, b: number) => string; portfolioSpend: number; portfolioSales: number; scopedPlacement: string }) {
  const [page, setPage] = useState(1); const pages = Math.max(1, Math.ceil(r.searchTerms.length / 25)), current = Math.min(page, pages);
  const selectedPlacements = r.placements.filter(p => !scopedPlacement || p.name === scopedPlacement);
  const best = selectedPlacements.filter(p => p.acos !== null && p.totals.orders > 0).sort((a, b) => a.acos! - b.acos!)[0];
  return <div className={s.detail}><header><div><strong>{r.row.target}</strong><span className={s.badge}>{keywordMatchName(r.row.match)}</span><p>{r.row.campaign} · {r.row.adGroup || "Ad group not supplied"} · ASIN {r.row.asin || "not supplied"}</p></div><span className={s.badge}>{r.status}</span></header>
    <div className={s.context}>{[["Current Bid / Avg CPC", `${money(r.bid)} / ${money(r.cpc)}`], ["Spend / Sales", `${money(r.available ? r.totals.spend : null)} / ${money(r.available ? r.totals.sales : null)}`], ["Orders / CVR", `${count(r.available ? r.totals.orders : null)} / ${percent(r.cvr)}`], ["Actual ACOS", percent(r.acos)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p>Source: {r.source}. Spend share {r.available ? ratio(r.totals.spend, portfolioSpend) : "—"} · Sales share {r.available ? ratio(r.totals.sales, portfolioSales) : "—"}.</p>
    <section className={s.evidence}><header><h3>Search Terms Triggered by this Keyword</h3><small>{r.searchTerms.length} reported terms · {r.searchTerms.filter(q => q.harvest).length} exact-coverage reviews</small></header><div className={s.tableWrap}><table aria-label={`Search terms for ${r.row.target}`}><caption className={s.srOnly}>Search terms for {r.row.target}</caption><thead><tr>{["Customer Search Term", "Spend", "Sales", "Orders", "CVR", "ACOS", "Signal & Review"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{r.searchTerms.slice((current - 1) * 25, current * 25).map((q, i) => <tr key={i}><td>{q.row.query}</td><td>{money(q.row.spend)}</td><td>{money(q.row.sales)}</td><td>{count(q.row.orders)}</td><td>{percent(q.cvr)}</td><td>{percent(q.acos)}</td><td>{q.harvest ? "Review exact coverage before harvesting" : q.waste > 0 ? "Review relevance and exclusions" : q.row.orders > 0 ? "Converting search term" : "Monitor"}</td></tr>)}</tbody></table></div>{!r.searchTerms.length ? <p className={s.empty}>Uniquely linked search-term data was not supplied.</p> : null}{r.searchTerms.length > 25 ? <footer><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous search terms</button> Page {current} of {pages}<button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next search terms</button></footer> : null}</section>
    <section className={s.evidence}><header><h3>Placement Performance for this Keyword</h3><small>{selectedPlacements.length} reported placements</small></header><div className={s.placementCards}>{selectedPlacements.map(p => <article key={p.name}><strong>{p.name}</strong><p>Spend: {money(p.available ? p.totals.spend : null)} · Sales: {money(p.available ? p.totals.sales : null)}</p><p>CVR: {percent(p.cvr)} · ACOS: {percent(p.acos)}</p></article>)}</div>{!selectedPlacements.length ? <p className={s.empty}>Keyword-level placement data was not supplied.</p> : null}</section>
    <section className={s.evidence}><header><h3>Audit Findings &amp; Recommended Reviews</h3></header><div className={s.review}><p><strong>Keyword performance:</strong> {r.review}.</p><p><strong>Search-term coverage:</strong> {r.searchTerms.filter(q => q.harvest).length} terms qualify for an exact-coverage review against the uploaded targets. Confirm current coverage before acting.</p>{best ? <p><strong>Placement comparison:</strong> {best.name} has the lowest reported converting-placement ACOS at {percent(best.acos)}. Review the reported scope before changing exposure.</p> : null}<p><strong>Spend review:</strong> {money(r.available ? r.waste : null)} flagged under the saved waste rules.</p></div></section>
    <p className={s.detailNote}>Keyword totals, search terms, and placement breakdowns are separate report views. Their totals are not added together.</p>
  </div>;
}
