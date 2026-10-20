"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Download, SlidersHorizontal, Store, TrendingDown, Wallet, MousePointer2 } from "lucide-react";
import { auditCampaignLevel, auditRate, auditTargetLevel, auditTotals, type AuditAd, type AuditData } from "../domain/ppc-audit";
import s from "./audit-performance-summary.module.css";

type Product = { asin: string; sku: string; name: string };
const columns = ["Product / SKU", "ASIN", "Spend", "Wasted Spend", "PPC Sales", "Organic Sales", "Total Sales", "PPC Orders", "Org Orders", "Tot Orders", "ACOS", "TACOS", "Status"];
const EMPTY_AUDIT: AuditData = { version: 1, name: "", start: "", end: "", currency: "USD", importedAt: "", files: [], ads: [], business: [] };

export function AuditPerformanceSummary({ audit: uploadedAudit, ads, catalog, onWasted }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[]; onWasted: () => void }) {
  const audit = uploadedAudit || EMPTY_AUDIT;
  const [selected, setSelected] = useState<string[]>([]);
  const [asinSearch, setAsinSearch] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [match, setMatch] = useState("");
  const [tableQuery, setTableQuery] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ index: 2, descending: true });
  const ids = useMemo(() => [...new Set([...audit.business.map(r => r.asin), ...ads.map(r => r.asin).filter(Boolean)])].sort(), [audit.business, ads]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const productText = (id: string) => { const p = products.get(id); return `${id} ${p?.sku || ""} ${p?.name || ""}`.toLowerCase(); };
  const scopedIds = ids.filter(id => (!selected.length || selected.includes(id)) && productText(id).includes(query.toLowerCase()));
  const scopedSet = new Set(scopedIds);
  const scopedAds = ads.filter(r => ((!selected.length && !query) || scopedSet.has(r.asin)) && (!type || r.type === type) && (!match || r.match === match));
  const totals = auditTotals(auditCampaignLevel(scopedAds));
  const business = audit.business.filter(r => scopedSet.has(r.asin));
  const businessByAsin = new Map(business.map(r => [r.asin, r]));
  const adsByAsin = new Map<string, AuditAd[]>();
  for (const row of scopedAds) { const group = adsByAsin.get(row.asin); if (group) group.push(row); else adsByAsin.set(row.asin, [row]); }
  const sales = business.reduce((sum, r) => sum + r.sales, 0);
  const orders = business.reduce((sum, r) => sum + r.orders, 0);
  const wasteRows = auditTargetLevel(scopedAds).filter(r => r.orders === 0 && r.spend > 0);
  const waste = wasteRows.reduce((sum, r) => sum + r.spend, 0);
  const comparable = !type && !match && business.length > 0 && scopedAds.length > 0;
  const organicSales = comparable && sales >= totals.sales ? sales - totals.sales : null;
  const organicOrders = comparable && orders >= totals.orders ? orders - totals.orders : null;
  const money = (n: number | null) => n === null || !uploadedAudit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const count = (n: number | null) => n === null || !uploadedAudit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const rate = (a: number, b: number) => { const n = auditRate(a, b); return n === null ? "—" : `${count(n)}%`; };
  const metric = (label: string, value: string, hint: string) => <div className={s.metric} key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
  const panel = (title: string, icon: ReactNode, hint: string, body: ReactNode) => <section className={s.panel}><header>{icon}<h2>{title}</h2><small>{hint}</small></header>{body}</section>;
  const rows = scopedIds.map(id => {
    const product = products.get(id);
    const adRows = adsByAsin.get(id) || [];
    const t = auditTotals(auditCampaignLevel(adRows));
    const b = businessByAsin.get(id);
    const w = auditTargetLevel(adRows).filter(r => r.orders === 0).reduce((sum, r) => sum + r.spend, 0);
    const organic = comparable && b && adRows.length && b.sales >= t.sales ? b.sales - t.sales : null;
    const orgOrders = comparable && b && adRows.length && b.orders >= t.orders ? b.orders - t.orders : null;
    const values = [product?.name || "Product name not supplied", id, adRows.length ? t.spend : null, adRows.length ? w : null, adRows.length ? t.sales : null, organic, b?.sales ?? null, adRows.length ? t.orders : null, orgOrders, b?.orders ?? null, adRows.length ? auditRate(t.spend, t.sales) : null, comparable && b && adRows.length ? auditRate(t.spend, b.sales) : null, !adRows.length ? "No ASIN-level ad metrics" : !b ? "Business data unavailable" : w > 0 ? "Review no-order spend" : "Matched"];
    return { id, product, values };
  }).filter(r => `${productText(r.id)} ${r.values[12]}`.includes(tableQuery.toLowerCase()));
  rows.sort((a, b) => {
    const av = a.values[sort.index], bv = b.values[sort.index];
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * (sort.descending ? -1 : 1);
  });
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pages);
  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [["Product", "SKU", ...columns.slice(1)], ...rows.map(r => [r.values[0], r.product?.sku || "", ...r.values.slice(1)])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-performance-summary.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() { setSelected([]); setQuery(""); setAsinSearch(""); setType(""); setMatch(""); setTableQuery(""); setPage(1); }
  return <div className={s.summary}>
    {!uploadedAudit ? <p className={s.uploadNote}>Upload your PPC Report and Business Report above to populate this dashboard.</p> : null}
    <div className={s.title}><div><div className={s.titleLine}><h1>Performance Summary</h1><span>{selected.length || query ? `${scopedIds.length} of ${ids.length} ASINs` : `Showing all ASINs (${scopedIds.length})`}</span></div><p>Advertising and business performance from your uploaded Amazon reports.</p></div><button type="button" onClick={exportCsv} disabled={!rows.length}><Download size={14} aria-hidden="true" /> Export CSV</button></div>
    <div className={s.filters}>
      <details className={s.asins}><summary>ASIN Level Summary · {selected.length || "All"}</summary><div className={s.options}><input aria-label="Find ASIN options" value={asinSearch} onChange={e => setAsinSearch(e.target.value)} placeholder="Find ASIN or product…" /><button type="button" onClick={() => setSelected([])}>Select all ASINs</button>{ids.filter(id => productText(id).includes(asinSearch.toLowerCase())).map(id => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e => { setSelected(e.target.checked ? [...selected, id] : selected.filter(v => v !== id)); setPage(1); }} />{id}</label>)}</div></details>
      <label>Campaign type<select value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">ALL</option>{[...new Set(ads.map(r => r.type))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Match type<select value={match} onChange={e => { setMatch(e.target.value); setPage(1); }}><option value="">ALL</option>{[...new Set(ads.map(r => r.match))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select></label>
      <label className={s.search}>Search products<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search ASIN, SKU, product…" /></label><button type="button" onClick={reset}>Reset Filters</button>
      <p>ASIN selection scopes business and PPC metrics. Campaign and match filters scope PPC only.</p>
    </div>
    <div className={s.waste}><TrendingDown size={23} aria-hidden="true" /><div><strong>Wasted Ad Spend <b>{money(waste)}</b></strong><p>{uploadedAudit ? `${rate(waste, totals.spend)} of PPC spend · ${count(wasteRows.length)} target/query rows without orders` : "Waiting for uploaded reports"}</p></div><button type="button" disabled={!uploadedAudit} onClick={onWasted}>View Wasted Spend <ArrowRight size={14} aria-hidden="true" /></button></div>
    <div className={s.grid}>
      {panel("Business Performance", <Store size={17} aria-hidden="true" />, "Business Report + PPC", <><h3>Revenue Composition</h3><div className={s.three}>{metric("Total Sales", money(business.length ? sales : null), "Business report revenue")}{metric("PPC Sales", money(totals.sales), `${rate(totals.sales, sales)} of total sales`)}{metric("Organic Sales", money(organicSales), organicSales === null ? "Unavailable for this scope" : `${rate(organicSales, sales)} of total sales`)}</div><h3>Order Volume Distribution</h3><div className={s.three}>{metric("Total Orders", count(business.length ? orders : null), "Business report order items")}{metric("PPC Orders", count(totals.orders), "Attributed orders")}{metric("Organic Orders", count(organicOrders), "Total orders less PPC orders")}</div></>)}
      {panel("Advertising Investment", <Wallet size={17} aria-hidden="true" />, "PPC Report", <div className={s.investment}>{metric("Total Ad Spend", money(totals.spend), `${new Set(scopedAds.map(r => r.campaignId || r.campaign)).size} campaigns`)}{metric("Wasted Ad Spend", money(waste), `${rate(waste, totals.spend)} of PPC spend`)}</div>)}
      {panel("Efficiency Metrics", <SlidersHorizontal size={17} aria-hidden="true" />, "Calculated ratios", <div className={s.five}>{metric("ACOS", rate(totals.spend, totals.sales), "Spend ÷ PPC sales")}{metric("TACOS", comparable ? rate(totals.spend, sales) : "—", "Spend ÷ total sales")}{metric("CPC", money(totals.clicks ? totals.spend / totals.clicks : null), "Spend ÷ clicks")}{metric("CTR", rate(totals.clicks, totals.impressions), "Clicks ÷ impressions")}{metric("CVR", rate(totals.orders, totals.clicks), "Orders ÷ clicks")}</div>)}
      {panel("Traffic", <MousePointer2 size={17} aria-hidden="true" />, "PPC Report", <div className={s.two}>{metric("Impressions", count(totals.impressions), "Ad impressions")}{metric("Clicks", count(totals.clicks), "Ad clicks")}</div>)}
    </div>
    <p className={s.note}>Organic values are calculated differences. Unavailable or incompatible report scopes show —. Unmatched PPC rows remain in account totals.</p>
    <section className={s.tablePanel}><div className={s.tableHeading}><div><h2>ASIN Level Summary <span>{rows.length} ASINs</span></h2><p>Product-level advertising and business performance.</p></div><div className={s.tableTools}><input aria-label="Search ASIN table" placeholder="Search ASIN, SKU or product…" value={tableQuery} onChange={e => { setTableQuery(e.target.value); setPage(1); }} /><details><summary>Columns</summary><div className={s.options}>{columns.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details><button type="button" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div></div>
      <div className={s.tableWrap}><table><caption className={s.srOnly}>ASIN Performance Overview</caption><thead><tr>{columns.map((c, i) => hidden.includes(c) ? null : <th key={c} scope="col" aria-sort={sort.index === i ? sort.descending ? "descending" : "ascending" : "none"}><button type="button" onClick={() => setSort({ index: i, descending: sort.index !== i || !sort.descending })}>{c} {sort.index === i ? sort.descending ? "↓" : "↑" : "↕"}</button></th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 25, currentPage * 25).map(r => <tr key={r.id}>{r.values.map((value, i) => hidden.includes(columns[i]) ? null : <td key={i}>{i === 0 ? <><strong>{value}</strong><small>{r.product?.sku || "SKU not supplied"}</small></> : i === 12 ? <span className={s.status}>{value}</span> : value === null ? "—" : i >= 2 && i <= 6 ? money(Number(value)) : i === 10 || i === 11 ? `${count(Number(value))}%` : typeof value === "number" ? count(value) : value}</td>)}</tr>)}</tbody></table>{!rows.length ? <p className={s.noRows}>No ASINs match these filters.</p> : null}</div>
      <footer><span>{rows.length} ASINs{uploadedAudit ? ` · ${audit.start} – ${audit.end}` : " · No reports imported"}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button> Page {currentPage} of {pages} <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
    </section>
  </div>;
}
