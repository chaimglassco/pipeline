"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { auditRate, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { asinCampaignKey } from "../domain/ppc-audit-asins";
import { productTargetAnalysis, productTargetMatchName, type ProductTargetPerformance } from "../domain/ppc-audit-product-targets";
import { DEFAULT_WASTE_RULES, readWasteReview, type WasteRules } from "../domain/ppc-audit-waste";
import s from "./audit-keywords.module.css";
import pt from "./audit-product-targets.module.css";

type Product = { asin: string; sku: string; name: string };
type Format = (n: number | null) => string;
const COLUMNS = ["Target", "Target Type", "Campaign & Ad Group", "Advertised ASIN", "Bid", "Spend", "Waste", "PPC Sales", "Orders", "CPC", "CVR", "ACOS", "Status", "Actions"];
const SORTS = ["Highest Spend", "Highest ACOS", "Lowest ACOS", "Most Wasted Spend", "Most Orders"];

export function AuditProductTargets({ audit, ads, catalog }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[] }) {
  const [asin, setAsin] = useState(""); const [campaign, setCampaign] = useState(""); const [match, setMatch] = useState(""); const [placement, setPlacement] = useState(""); const [status, setStatus] = useState("");
  const [search, setSearch] = useState(""); const [minSpend, setMinSpend] = useState(""); const [sort, setSort] = useState(SORTS[0]); const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]); const [hidden, setHidden] = useState<string[]>([]); const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES); const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !audit) return; try { const saved = readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) setRules(saved.rules); } catch { /* Use default rules when storage is unavailable. */ } });
    return () => { active = false; };
  }, [audit]);
  const all = useMemo(() => productTargetAnalysis(ads, {}, rules), [ads, rules]);
  const data = useMemo(() => productTargetAnalysis(ads, { asin, campaign, match, placement, status, search, minSpend: Number.isFinite(Number(minSpend)) ? Math.max(0, Number(minSpend)) : 0 }, rules), [ads, asin, campaign, match, placement, status, search, minSpend, rules]);
  const p = data.portfolio;
  const count: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const money: Format = n => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const percent: Format = n => n === null || !audit ? "—" : `${count(n)}%`;
  const ratio = (a: number, b: number) => percent(auditRate(a, b));
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p.name])), [catalog]);
  const rows = useMemo(() => [...data.rows].sort((a, b) => {
    const value = (r: ProductTargetPerformance) => sort.includes("ACOS") ? r.acos : sort === "Most Wasted Spend" ? r.waste : sort === "Most Orders" ? r.available ? r.totals.orders : null : r.available ? r.totals.spend : null;
    const av = value(a), bv = value(b);
    if (av === null) return bv === null ? a.id.localeCompare(b.id) : 1;
    if (bv === null) return -1;
    return (av - bv) * (sort === "Lowest ACOS" ? 1 : -1) || a.id.localeCompare(b.id);
  }), [data.rows, sort]);
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
    const csv = [["Target", "Target ID", "Target Type", "Campaign", "Campaign ID", "Ad Group", "Ad Group ID", "ASIN", "Bid", "Spend", "Flagged Spend", "PPC Sales", "Orders", "Clicks", "CPC", "CVR", "ACOS", "Source", "Signals", "Recommended Review", "Status"], ...rows.map(r => [r.row.target, r.row.targetId || "", r.row.match, r.row.campaign, r.row.campaignId, r.row.adGroup, r.row.adGroupId || "", r.row.asin, r.bid, r.available ? r.totals.spend : null, r.available ? r.waste : null, r.available ? r.totals.sales : null, r.available ? r.totals.orders : null, r.available ? r.totals.clicks : null, r.cpc, r.cvr, r.acos, r.source, r.signals.join("; "), r.review, r.status])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-product-targets.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const campaigns = [...new Map(all.rows.map(r => [asinCampaignKey(r.row), `${r.row.campaign} · ${r.row.type} · ${r.row.campaignId}`])).entries()];
  const needsAttention = data.rows.filter(r => r.signals.some(signal => ["High ACOS", "No Orders", "High Wasted Spend", "Low CVR", "High CPC"].includes(signal))).length;
  return <div className={`${s.workspace} ${pt.workspace}`}>
    <header className={s.heading}><div><h1>Product Target</h1><small>Showing {rows.length} product targets</small><p>Analyze ASIN and category targeting efficiency, flagged spend, and reported placement evidence.</p></div><div className={s.actions}>
      <button type="button" disabled={!audit} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh</button><details><summary><SlidersHorizontal size={14} aria-hidden="true" />Column Settings</summary><div className={s.options}>{COLUMNS.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" disabled={!rows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button>
    </div></header>
    {!audit ? <p className={s.note}>Upload your PPC Report above to populate this dashboard.</p> : null}
    {notice ? <p className={s.note} role="status">{notice}</p> : null}
    <div className={s.filters}><label className={s.search}>Search<input value={search} placeholder="Target, ASIN, campaign…" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      {select("ASIN", asin, setAsin, [...new Set(all.rows.map(r => r.row.asin || "Unmapped"))].sort().map(v => [v, v === "Unmapped" ? "ASIN not supplied" : `${v}${products.get(v) ? ` · ${products.get(v)}` : ""}`]), "All ASINs")}
      {select("Campaign", campaign, setCampaign, campaigns, "All Campaigns")}
      {select("Target Type", match, setMatch, [...new Set(all.rows.map(r => productTargetMatchName(r.row.match)))].sort().map(v => [v, v]), "All Target Types")}
      {select("Placement", placement, setPlacement, [...new Set(all.rows.flatMap(r => r.placements.map(p => p.name)))].sort().map(v => [v, v]), "All Placements")}
      {select("Status", status, setStatus, [...new Set(["Strong", "Healthy", "Opportunity", "High ACOS", "High Wasted Spend", "No Orders", "Low CVR", "High CPC", "Performance Unavailable"])].map(v => [v, v]), "All Statuses")}
      <label>Min Spend<input type="number" min="0" step="any" value={minSpend} placeholder="Any" onChange={e => { setMinSpend(e.target.value); setPage(1); }} /></label><button type="button" onClick={reset}>Reset Filters</button>
    </div>
    <section className={s.panel}><header><h2>Product Target Portfolio Aggregate Metrics</h2><small>{data.rows.filter(r => r.signals.includes("Strong")).length} Strong · {needsAttention} Need Attention · {data.rows.filter(r => r.signals.includes("Opportunity")).length} Opportunities</small></header><div className={s.portfolio} role="region" aria-label="Product target portfolio metrics">
      {[["Product Targets", count(rows.length)], ["Total Spend", money(p.available ? p.totals.spend : null)], ["PPC Sales", money(p.available ? p.totals.sales : null)], ["PPC Orders", count(p.available ? p.totals.orders : null)], ["Avg ACOS", percent(p.acos)], ["Avg CPC", money(p.cpc)], ["Avg CVR", percent(p.cvr)], ["Wasted Ad Spend", money(p.available ? p.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong>{label === "Product Targets" ? <small>{data.matches[0].count} ASIN / {data.matches[1].count} Category</small> : label === "Avg ACOS" ? <small>Review threshold ≤ 20%</small> : label === "Wasted Ad Spend" ? <small>{p.available ? ratio(p.waste, p.totals.spend) : "—"} of spend</small> : null}</div>)}
    </div></section>
    <div className={s.diagnostics}><section className={s.panel}><header><h2>Target Type Performance</h2><small>ASIN vs Category Comparison</small></header><div className={pt.types}>{data.matches.map(g => <article key={g.name}><header><strong>{g.name}</strong><small>{count(g.count)} Targets</small></header>{[["Spend", money(g.available ? g.totals.spend : null)], ["Sales", money(g.available ? g.totals.sales : null)], ["Orders", count(g.available ? g.totals.orders : null)], ["CPC / CVR", `${money(g.cpc)} / ${percent(g.cvr)}`], ["ACOS", percent(g.acos)], ["Wasted", money(g.available ? g.waste : null)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>)}</div></section>
      <section className={s.panel}><header><h2>Product Target Signals</h2></header><p>Signals may overlap. Review thresholds: 20% ACOS, 8% CVR, and CPC above 150% of the scoped average. Waste uses your saved rules.</p><div className={s.signals}>{data.signals.map(signal => <button key={signal.name} type="button" onClick={() => { setStatus(signal.name); setPage(1); }} aria-pressed={status === signal.name}><span>{signal.name}</span><strong>{count(signal.count)}</strong></button>)}</div></section>
    </div>
    {audit && data.unlinkedQueries > 0 ? <p className={s.note}>Some search terms lack a unique product-target link and are excluded from target findings.</p> : null}
    {audit && data.aggregateCopies > 0 ? <p className={s.note}>Aggregate target copies are excluded where ASIN-specific evidence is available.</p> : null}
    {audit && rows.some(r => !r.available) ? <p className={s.note}>Some product-target metrics are unavailable. Totals include available report evidence only.</p> : null}
    <section className={s.panel}><header><div><h2>Product Target Performance</h2><p>Compare ASIN and category targets across advertised products, campaigns, and ad groups.</p></div><label>Sort by<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{SORTS.map(v => <option key={v}>{v}</option>)}</select></label></header><div className={s.tableWrap}><table aria-label="Product Target Performance"><caption className={s.srOnly}>Product Target Performance</caption><thead><tr>{COLUMNS.filter(c => !hidden.includes(c)).map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>
      {rows.slice((current - 1) * 25, current * 25).map(r => {
        const open = expanded.includes(r.id);
        const values: ReactNode[] = [<button key="expand" type="button" aria-label={`Expand target ${r.row.target} ${r.row.campaignId} ${r.row.adGroupId || r.row.adGroup} ${r.row.asin || "Unmapped"} ${r.row.match} ${r.row.targetId || ""}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== r.id) : [...expanded, r.id])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.row.target}</button>, productTargetMatchName(r.row.match), <Fragment key="context"><strong>{r.row.campaign}</strong><small>{r.row.adGroup || "Ad group not supplied"}</small></Fragment>, <Fragment key="product"><strong>{r.row.asin || "Not supplied"}</strong><small>{products.get(r.row.asin) || ""}</small></Fragment>, money(r.bid), money(r.available ? r.totals.spend : null), money(r.available ? r.waste : null), money(r.available ? r.totals.sales : null), count(r.available ? r.totals.orders : null), money(r.cpc), percent(r.cvr), percent(r.acos), <span key="status" className={s.badge}>{r.status}</span>, <button key="review" type="button" aria-label={`Review target ${r.row.target} ${r.row.campaignId} ${r.row.adGroupId || r.row.adGroup} ${r.row.asin || "Unmapped"} ${r.row.targetId || ""}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== r.id) : [...expanded, r.id])}>Review</button>];
        return <Fragment key={r.id}><tr>{values.map((v, i) => hidden.includes(COLUMNS[i]) ? null : <td key={i}>{v}</td>)}</tr>{open ? <tr><td colSpan={COLUMNS.filter(c => !hidden.includes(c)).length}><ProductTargetDetails target={r} money={money} count={count} percent={percent} ratio={ratio} portfolioSpend={p.totals.spend} portfolioSales={p.totals.sales} portfolioCvr={p.cvr} scopedPlacement={placement} /></td></tr> : null}</Fragment>;
      })}
    </tbody></table>{!rows.length ? <p className={s.empty}>{!audit ? "Waiting for uploaded reports." : placement ? "Target-level placement data was not supplied for this scope." : "No product targets match this scope. Check the filters and report contents."}</p> : null}</div><footer><span>{rows.length ? `Showing ${(current - 1) * 25 + 1}–${Math.min(current * 25, rows.length)} of ${rows.length} product targets` : "0 product targets"}{audit ? ` · ${audit.start} – ${audit.end}` : ""}</span><div><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button> Page {current} of {pages} <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></footer></section>
  </div>;
}

function ProductTargetDetails({ target: r, money, count, percent, ratio, portfolioSpend, portfolioSales, portfolioCvr, scopedPlacement }: { target: ProductTargetPerformance; money: Format; count: Format; percent: Format; ratio: (a: number, b: number) => string; portfolioSpend: number; portfolioSales: number; portfolioCvr: number | null; scopedPlacement: string }) {
  const placements = r.placements.filter(p => !scopedPlacement || p.name === scopedPlacement);
  const best = placements.filter(p => p.acos !== null && p.totals.orders > 0).sort((a, b) => a.acos! - b.acos!)[0];
  const targetAsin = r.row.match === "ASIN Target" ? r.row.target.match(/["'=:\s]([A-Z0-9]{10})(?:["']|$|\s)/i)?.[1] || (/^[a-z0-9]{10}$/i.test(r.row.target) ? r.row.target : "") : "";
  const roas = r.available && r.totals.spend > 0 ? `${(r.totals.sales / r.totals.spend).toFixed(1)}x ROAS` : "ROAS unavailable";
  return <div className={s.detail}>
    <header><div><strong>{r.row.target}</strong><span className={s.badge}>{r.row.match}</span>{targetAsin ? <a className={pt.link} href={`https://www.amazon.com/dp/${targetAsin.toUpperCase()}`} target="_blank" rel="noopener noreferrer" aria-label={`Open targeted ASIN ${targetAsin.toUpperCase()} on Amazon`}><ExternalLink size={13} aria-hidden="true" />View ASIN</a> : null}<p>{r.row.campaign} · {r.row.adGroup || "Ad group not supplied"} · Advertised ASIN {r.row.asin || "not supplied"}</p></div><span className={s.badge}>{r.status}</span></header>
    <div className={pt.metrics} aria-label="Expanded target metrics">
      <div><span>Bid vs Avg CPC</span><strong>{money(r.bid)} / {money(r.cpc)}</strong><small>{r.bid !== null && r.cpc !== null ? `${money(r.bid - r.cpc)} difference` : "Bid comparison unavailable"}</small></div>
      <div><span>Spend &amp; Revenue</span><strong>{money(r.available ? r.totals.spend : null)} / {money(r.available ? r.totals.sales : null)}</strong><small>{roas}</small></div>
      <div><span>Orders &amp; CVR</span><strong>{count(r.available ? r.totals.orders : null)} / {percent(r.cvr)}</strong><small>Portfolio CVR {percent(portfolioCvr)}</small></div>
      <div><span>ACOS Efficiency</span><strong>{percent(r.acos)}</strong><small>Review threshold 20%</small></div>
      <div><span>Spend vs Sales Share</span><strong>{r.available ? ratio(r.totals.spend, portfolioSpend) : "—"} / {r.available ? ratio(r.totals.sales, portfolioSales) : "—"}</strong><small>Of the filtered product-target portfolio</small></div>
    </div>
    <section className={s.evidence}><header><h3>Placement Breakdown for Target</h3><small>{placements.length} reported placements</small></header><div className={s.tableWrap}><table aria-label={`Placement breakdown for ${r.row.target}`}><caption className={s.srOnly}>Reported target-level placement performance</caption><thead><tr>{["Placement", "Spend", "PPC Sales", "Orders", "Avg CPC", "CVR", "ACOS", "Wasted", "Status"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{placements.map(p => <tr key={p.name}><th scope="row">{p.name}</th><td>{money(p.available ? p.totals.spend : null)}</td><td>{money(p.available ? p.totals.sales : null)}</td><td>{count(p.available ? p.totals.orders : null)}</td><td>{money(p.cpc)}</td><td>{percent(p.cvr)}</td><td>{percent(p.acos)}</td><td>{money(p.available ? p.waste : null)}</td><td>{!p.available ? "Unavailable" : p.acos !== null && p.acos > 20 ? "Review" : p.totals.orders > 0 ? "Converting" : "Monitor"}</td></tr>)}</tbody></table></div>{!placements.length ? <p className={s.empty}>Target-level placement data was not supplied. Campaign placements are not assigned to individual targets.</p> : null}</section>
    <section className={s.evidence}><header><h3>Product Target Findings &amp; Action Plan</h3></header><div className={pt.findings}>
      <article><strong>01 · Target efficiency</strong><p>{r.available ? `${money(r.totals.sales)} reported sales from ${count(r.totals.orders)} orders; ACOS ${percent(r.acos)}.` : "Target performance metrics were not supplied."} {r.review}. Strong targets require at least 5 orders, ACOS ≤20%, and CVR ≥10%.</p></article>
      <article><strong>02 · Conversion comparison</strong><p>Target CVR {percent(r.cvr)}; filtered portfolio CVR {percent(portfolioCvr)}. Review relevance, listing quality and conversion stability before changing bids.</p></article>
      <article><strong>03 · Placement evidence</strong><p>{best ? `${best.name} has the lowest reported converting-placement ACOS at ${percent(best.acos)}. Compare reported volume and costs before changing exposure.` : "No converting target-level placement evidence is available. Upload that breakdown to compare placements."}</p></article>
      <article><strong>04 · Flagged spend</strong><p>{money(r.available ? r.waste : null)} flagged under the saved waste rules. Review the underlying target or uniquely linked search-term evidence before acting.{r.queryMismatch ? " Search-term spend exceeds parent spend, so waste uses target-level evidence." : ""}</p></article>
    </div></section>
    <p className={s.detailNote}>Source: {r.source}. Target totals and placement breakdowns are separate report views and are not added together. These are review signals, not profit guarantees or automatic bid changes.</p>
  </div>;
}
