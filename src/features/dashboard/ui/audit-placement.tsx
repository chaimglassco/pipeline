"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { auditRate, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { asinCampaignKey } from "../domain/ppc-audit-asins";
import { canonicalCampaignType, campaignTypeName } from "../domain/ppc-audit-campaign-types";
import { placementAnalysis, placementName, type PlacementAnalysis } from "../domain/ppc-audit-placements";
import { DEFAULT_WASTE_RULES, readWasteReview, type WasteRules } from "../domain/ppc-audit-waste";
import s from "./audit-placement.module.css";

type Product = { asin: string; sku: string; name: string };
const COLUMNS = ["Placement", "Spend", "PPC Sales", "Orders", "Impr", "Clicks", "CTR", "CPC", "CVR", "ACOS", "Wasted Spend", "Waste %", "Spend %", "Sales %", "Order %", "Status"];
const SORTS = ["Highest Spend", "Highest ACOS", "Lowest ACOS", "Highest Wasted Spend", "Orders (Desc)"];
type Summary = PlacementAnalysis["portfolio"];
function pageRows<T>(rows: T[], page: number) {
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  return rows.slice((current - 1) * 25, current * 25);
}

export function AuditPlacement({ audit, ads, catalog, onCampaign }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[]; onCampaign?: (id: string) => void }) {
  const [asin, setAsin] = useState(""); const [campaign, setCampaign] = useState(""); const [type, setType] = useState("");
  const [placement, setPlacement] = useState(""); const [match, setMatch] = useState(""); const [status, setStatus] = useState(""); const [search, setSearch] = useState("");
  const [sort, setSort] = useState(SORTS[0]); const [page, setPage] = useState(1); const [asinPage, setAsinPage] = useState(1); const [campaignPage, setCampaignPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]); const [reviewed, setReviewed] = useState<string[]>([]); const [hidden, setHidden] = useState<string[]>([]);
  const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES); const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (!active || !audit) return; try { const saved = readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) setRules(saved.rules); } catch { /* Default rules remain usable. */ } });
    return () => { active = false; };
  }, [audit]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const all = useMemo(() => placementAnalysis(ads, {}, rules), [ads, rules]);
  const base = useMemo(() => placementAnalysis(ads, { asin, campaign, type, placement, match, search }, rules), [ads, asin, campaign, type, placement, match, search, rules]);
  const data = useMemo(() => status ? placementAnalysis(base.raw.filter(r => base.groups.find(g => g.name === placementName(r.placement))?.status === status), {}, rules) : base, [base, status, rules]);
  const { portfolio: p, groups } = data;
  const shownGroups = groups.filter(g => (!placement || g.name === placement) && (!status || g.status === status));
  const num = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const money = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const percent = (n: number | null) => n === null || !audit ? "—" : `${num(n)}%`;
  const ratio = (a: number, b: number) => percent(auditRate(a, b));
  const delta = (n: number | null) => n === null || !audit ? "—" : `${n > 0 ? "+" : ""}${num(n)} pp`;
  const metric = (summary: Summary, n: number) => summary.available ? n : null;
  const campaignOptions = [...new Map(ads.map(r => [asinCampaignKey(r), `${r.campaign} · ${r.type} · ${r.campaignId}`])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  function resetPages() { setPage(1); setAsinPage(1); setCampaignPage(1); }
  function select(label: string, value: string, setter: (value: string) => void, options: [string, string][], placeholder: string) {
    return <label>{label}<select value={value} onChange={e => { setter(e.target.value); resetPages(); }}><option value="">{placeholder}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  }
  function reset() { setAsin(""); setCampaign(""); setType(""); setPlacement(""); setMatch(""); setStatus(""); setSearch(""); setExpanded([]); setReviewed([]); resetPages(); }
  function refresh() {
    let next = DEFAULT_WASTE_RULES;
    try { const saved = audit && readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) next = saved.rules; } catch { /* Use defaults if storage is unavailable. */ }
    setRules({ ...next }); setNotice("Recalculated from the current uploaded reports.");
  }
  const ledger = [...data.ledger].sort((a, b) => {
    const value = (r: typeof a) => sort.includes("ACOS") ? r.acos : sort === "Highest Wasted Spend" ? r.waste : sort === "Orders (Desc)" ? r.totals.orders : r.totals.spend;
    const av = value(a), bv = value(b);
    if (av === null) return bv === null ? a.id.localeCompare(b.id) : 1;
    if (bv === null) return -1;
    return (av - bv) * (sort === "Lowest ACOS" ? 1 : -1) || a.id.localeCompare(b.id);
  });
  function exportCsv() {
    const escape = (value: string | number | null) => `"${String(value ?? "").replace(/^\s*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [["ASIN", "Campaign", "Campaign ID", "Type", "Placement", "Entity", "Spend", "Sales", "Orders", "Impressions", "Clicks", "CTR", "CPC", "CVR", "ACOS", "Flagged Spend", "Status"], ...ledger.map(l => [l.row.asin, l.row.campaign, l.row.campaignId, l.row.type, placementName(l.row.placement), l.row.entity, l.totals.spend, l.totals.sales, l.totals.orders, l.totals.impressions, l.totals.clicks, l.ctr, l.cpc, l.cvr, l.acos, l.waste, l.status])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-placement.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const comparison = (summary: Summary, shares: (number | null)[]) => [money(metric(summary, summary.totals.spend)), money(metric(summary, summary.totals.sales)), num(metric(summary, summary.totals.orders)), num(metric(summary, summary.totals.impressions)), num(metric(summary, summary.totals.clicks)), percent(summary.ctr), money(summary.cpc), percent(summary.cvr), percent(summary.acos), money(metric(summary, summary.waste)), percent(summary.wasteRate), ...shares.map(percent), summary.status];
  const asinMetrics = (summary: Summary, salesTotal: number) => [money(metric(summary, summary.totals.spend)), money(metric(summary, summary.totals.sales)), num(metric(summary, summary.totals.orders)), num(metric(summary, summary.totals.clicks)), money(summary.cpc), percent(summary.cvr), percent(summary.acos), money(metric(summary, summary.waste)), summary.available ? ratio(summary.totals.sales, salesTotal) : "—", summary.status];
  const findings: { title: string; detail: string; review: string }[] = [];
  const leading = [...groups].filter(g => g.delta !== null && g.delta > 0).sort((a, b) => b.delta! - a.delta!)[0];
  if (leading) findings.push({ title: `${leading.name} sales contribution`, detail: `${percent(leading.salesShare)} of sales from ${percent(leading.spendShare)} of spend (${delta(leading.delta)}).`, review: "Review the contributing campaigns and product margins before increasing exposure." });
  const high = [...groups].filter(g => g.acos !== null && g.acos > 20).sort((a, b) => b.acos! - a.acos!)[0];
  if (high) findings.push({ title: `${high.name} needs attention`, detail: `${percent(high.acos)} ACOS exceeds the 20% review threshold.`, review: "Check campaign relevance, product selection, and the reported placement settings." });
  if (data.highestWaste) findings.push({ title: `${data.highestWaste.name} flagged spend`, detail: `${money(data.highestWaste.waste)} flagged under the configured waste rules.`, review: "Inspect the reported evidence before changing bids or exclusions." });
  const productOpportunity = data.byAsin.flatMap(a => a.placements.map(g => ({ asin: a.asin, ...g }))).filter(g => g.acos !== null && p.acos !== null && g.acos < p.acos && g.totals.orders >= 5).sort((a, b) => a.acos! - b.acos!)[0];
  if (productOpportunity) findings.push({ title: "ASIN-specific placement review", detail: `${productOpportunity.asin} · ${productOpportunity.name}: ${percent(productOpportunity.acos)} ACOS versus ${percent(p.acos)} in this scope.`, review: "Confirm inventory, margins, and budget history before considering more exposure." });

  return <div className={s.workspace}>
    <header className={s.heading}><div><h1>Placement</h1><small>Showing {placement || "all placements"} · {groups.filter(g => g.available).length} with metrics</small><p>Compare placement efficiency, sales contribution, and spend to review.</p></div><div className={s.actions}>
      <button type="button" disabled={!ledger.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button><button type="button" disabled={!audit} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh</button>
      <details><summary><SlidersHorizontal size={14} aria-hidden="true" />Column Settings</summary><div className={s.options}><small>Placement comparison columns</small>{COLUMNS.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details>
    </div></header>
    {!audit ? <p className={s.note}>Upload your PPC Report and Business Report above to populate this dashboard.</p> : !all.portfolio.available ? <p className={s.note}>Placement metrics are unavailable. Check that your PPC Report includes placement performance.</p> : <p className={s.note}>ASIN and match breakdowns require placement data at those levels. Flagged spend uses placement evidence and may differ from target-level waste.</p>}
    {notice ? <p className={s.note} role="status">{notice}</p> : null}
    {data.unavailableGroups > 0 && p.available ? <p className={s.note}>Partial data: {data.unavailableGroups} campaign-placement groups have unavailable metrics. Totals include available evidence only.</p> : null}
    <div className={s.filters}>
      {select("ASIN / Product", asin, setAsin, [...new Set([...catalog.map(c => c.asin), ...ads.map(r => r.asin)])].filter(Boolean).sort().map((id): [string, string] => [id, `${id}${products.get(id) ? ` · ${products.get(id)!.name}` : ""}`]).concat([["Unmapped", "ASIN not supplied"]]), "All ASINs")}
      {select("Campaign", campaign, setCampaign, campaignOptions, "All Campaigns")}
      {select("Campaign Type", type, setType, [...new Set(ads.map(r => canonicalCampaignType(r.type)))].sort().map(t => [t, campaignTypeName(t)]), "All Types")}
      {select("Placement", placement, setPlacement, all.groups.map(g => [g.name, g.name]), "All Placements")}
      {select("Match Type", match, setMatch, [...new Set(ads.filter(r => r.placement).map(r => r.match))].filter(Boolean).sort().map(v => [v, v]), "All Matches")}
      {select("Audit Status", status, setStatus, [...new Set(all.groups.map(g => g.status))].sort().map(v => [v, v]), "All Statuses")}
      <label className={s.search}>Search Identifier<input value={search} onChange={e => { setSearch(e.target.value); resetPages(); }} placeholder="Campaign, ASIN, target…" /></label><button type="button" onClick={reset}>Reset Filters</button>
    </div>
    <section className={s.panel}><header><h2>Placement Portfolio Summary</h2><small>{audit ? `${audit.start} – ${audit.end}` : "Waiting for reports"}</small></header><div className={s.portfolio} role="region" aria-label="Placement portfolio metrics">
      {[["Spend", money(metric(p, p.totals.spend))], ["PPC Sales", money(metric(p, p.totals.sales))], ["PPC Orders", num(metric(p, p.totals.orders))], ["ACOS", percent(p.acos)], ["Wasted Spend", money(metric(p, p.waste))], ["Avg CPC", money(p.cpc)], ["CTR", percent(p.ctr)], ["CVR", percent(p.cvr)], ["Best Placement", data.best?.name || "—"], ["Highest Waste", data.highestWaste?.name || "—"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div></section>
    <section className={s.cards} aria-label="Placement cards">{shownGroups.map(g => <article key={g.name}><header><span>Placement</span><span className={s.badge}>{g.status}</span></header><h2>{g.name}</h2><div className={s.cardMetrics}>
      {[["Spend", money(metric(g, g.totals.spend))], ["PPC Sales", money(metric(g, g.totals.sales))], ["Orders", num(metric(g, g.totals.orders))], ["ACOS", percent(g.acos)], ["CTR / CPC", `${percent(g.ctr)} / ${money(g.cpc)}`], ["CVR", percent(g.cvr)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div><footer><small>Wasted Spend: {money(metric(g, g.waste))} ({percent(g.wasteRate)})</small><small>Sales Share {percent(g.salesShare)} · Spend Share {percent(g.spendShare)}</small><small>Order Share {percent(g.orderShare)} · {delta(g.delta)} sales vs spend share</small></footer></article>)}</section>
    <section className={s.panel}><header><div><h2>Placement Share Distribution &amp; Efficiency Delta</h2><p>Spend allocation compared with reported sales and orders.</p></div></header><div className={s.legend}><span>■ Spend Share</span><span>▧ Sales Share</span></div>
      {shownGroups.map(g => <div key={g.name} className={s.contribution}><header><strong>{g.name}</strong><span>Spend: {percent(g.spendShare)} · Sales: {percent(g.salesShare)} · {delta(g.delta)}</span></header><div className={s.bar} role="img" aria-label={`${g.name} spend share ${percent(g.spendShare)}`}><span style={{ width: `${Math.min(100, g.spendShare || 0)}%` }} /></div><div className={`${s.bar} ${s.salesBar}`} role="img" aria-label={`${g.name} sales share ${percent(g.salesShare)}`}><span style={{ width: `${Math.min(100, g.salesShare || 0)}%` }} /></div><footer><small>Order Share: {percent(g.orderShare)}</small></footer></div>)}
    </section>
    <section className={s.panel}><header><h2>Placement Efficiency Comparison Table</h2><small>Aggregated placement performance</small></header><div className={s.tableWrap}><table aria-label="Placement Efficiency Comparison"><caption className={s.srOnly}>Placement Efficiency Comparison</caption><thead><tr>{COLUMNS.filter(c => !hidden.includes(c)).map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>
      {shownGroups.map(g => <tr key={g.name}>{[g.name, ...comparison(g, [g.spendShare, g.salesShare, g.orderShare])].map((v, i) => hidden.includes(COLUMNS[i]) ? null : <td key={i}>{v}</td>)}</tr>)}
    </tbody><tfoot><tr>{["Total / Average", ...comparison(p, [p.available ? auditRate(p.totals.spend, p.totals.spend) : null, p.available ? auditRate(p.totals.sales, p.totals.sales) : null, p.available ? auditRate(p.totals.orders, p.totals.orders) : null])].map((v, i) => hidden.includes(COLUMNS[i]) ? null : <td key={i}>{v}</td>)}</tr></tfoot></table></div></section>
    <section className={s.panel}><header><div><h2>Placement by Advertised ASIN</h2><p>Only reported ASIN × placement combinations are included.</p></div></header><div className={s.tableWrap}><table aria-label="Placement by Advertised ASIN"><caption className={s.srOnly}>Placement by Advertised ASIN</caption><thead><tr>{["Product / ASIN", "Placement", "Spend", "PPC Sales", "PPC Orders", "Clicks", "CPC", "CVR", "ACOS", "Wasted Spend", "Sales Share", "Status"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
      {pageRows(data.byAsin, asinPage).map(a => { const open = expanded.includes(a.asin); return <Fragment key={a.asin}><tr><td><button type="button" aria-label={`Expand placement ASIN ${a.asin}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== a.asin) : [...expanded, a.asin])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{products.get(a.asin)?.name || a.asin}</button><small>{a.asin}</small></td><td>All Reported Placements</td>{asinMetrics(a, a.totals.sales).map((v, i) => <td key={i}>{v}</td>)}</tr>{open ? a.placements.map(g => <tr key={g.name}><td>↳ {a.asin}</td><td>{g.name}</td>{asinMetrics(g, a.totals.sales).map((v, i) => <td key={i}>{v}</td>)}</tr>) : null}</Fragment>; })}
    </tbody></table>{!data.byAsin.length ? <p className={s.empty}>ASIN-level placement data was not supplied for this scope.</p> : null}</div><Pager count={data.byAsin.length} page={asinPage} setPage={setAsinPage} label="ASIN" /></section>
    <section className={s.panel}><header><h2>Placement by Contributing Campaign</h2><small>Reported campaign drivers</small></header><div className={s.tableWrap}><table aria-label="Placement by Contributing Campaign"><caption className={s.srOnly}>Placement by Contributing Campaign</caption><thead><tr>{["Campaign Name", "Placement Slot", "Spend", "Sales", "Orders", "CPC", "CVR", "ACOS", "Bid Adj %", "Status", "Action"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{pageRows(data.byCampaign, campaignPage).map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>{c.type} · {c.campaignState}</small></td><td>{c.placement}</td>{[money(metric(c, c.totals.spend)), money(metric(c, c.totals.sales)), num(metric(c, c.totals.orders)), money(c.cpc), percent(c.cvr), percent(c.acos), percent(c.adjustment), c.status].map((v, i) => <td key={i}>{v}</td>)}<td>{onCampaign ? <button type="button" aria-label={`View placement campaign ${c.name} ${c.placement}`} onClick={() => onCampaign(c.campaignKey)}>View Campaign</button> : "—"}</td></tr>)}</tbody></table>{!data.byCampaign.length ? <p className={s.empty}>No placement campaign rows in this scope.</p> : null}</div><Pager count={data.byCampaign.length} page={campaignPage} setPage={setCampaignPage} label="campaign" /></section>
    <section className={s.panel}><header><div><h2>Match Type by Placement Matrix</h2><p>Reported combinations only.</p></div></header><div className={s.findings}>{data.matches.map(g => <article key={`${g.match}:${g.placement}`}><h3>{g.match} · {g.placement}</h3><span className={s.badge}>{g.status}</span><p>Spend: {money(metric(g, g.totals.spend))} · Sales: {money(metric(g, g.totals.sales))}</p><p>ACOS: {percent(g.acos)} · CVR: {percent(g.cvr)}</p></article>)}</div>{!data.matches.length ? <p className={s.empty}>Match-type by placement data was not supplied.</p> : null}</section>
    <section className={s.panel}><header><h2>Placement Findings &amp; Recommended Reviews</h2><small>{findings.length} review signals</small></header><div className={s.findings}>{findings.map((f, i) => <article key={f.title}><small>0{i + 1} · Review signal</small><h3>{f.title}</h3><p>{f.detail}</p><p><strong>Recommended Review:</strong> {f.review}</p></article>)}</div>{!findings.length ? <p className={s.empty}>No placement review signals in the available data.</p> : null}</section>
    <section className={s.panel}><header><div><h2>Detailed Placement Performance Ledger</h2><p>One reported performance level per campaign and placement.</p></div><label>Sort By<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{SORTS.map(v => <option key={v}>{v}</option>)}</select></label></header><div className={s.tableWrap}><table aria-label="Detailed Placement Performance Ledger"><caption className={s.srOnly}>Detailed Placement Performance Ledger</caption><thead><tr>{["ASIN / Product", "Campaign", "Placement", "Spend", "Sales", "Orders", "Impr", "Clicks", "CTR", "CPC", "CVR", "ACOS", "Wasted", "Status", "Recommended Review", "Action"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
      {pageRows(ledger, page).map(l => <Fragment key={l.id}><tr><td>{products.get(l.row.asin)?.name || l.row.asin || "ASIN not supplied"}<small>{l.row.asin || "Campaign-level placement"}</small></td><td>{l.row.campaign}<small>{l.row.type} · {l.row.campaignId}</small></td><td>{placementName(l.row.placement)}</td>{[money(l.totals.spend), money(l.totals.sales), num(l.totals.orders), num(l.totals.impressions), num(l.totals.clicks), percent(l.ctr), money(l.cpc), percent(l.cvr), percent(l.acos), money(l.waste), l.status, l.waste > 0 ? "Review relevance and cost efficiency" : "Monitor reported efficiency"].map((v, i) => <td key={i}>{v}</td>)}<td><button type="button" aria-label={`Review placement ${l.row.campaign} ${placementName(l.row.placement)} ${l.row.asin || l.row.entity}`} aria-expanded={reviewed.includes(l.id)} onClick={() => setReviewed(reviewed.includes(l.id) ? reviewed.filter(id => id !== l.id) : [...reviewed, l.id])}>Review</button></td></tr>{reviewed.includes(l.id) ? <tr><td colSpan={16}><div className={s.review}><strong>{l.row.campaign} · {placementName(l.row.placement)}</strong><p>Source: {l.row.entity} {l.row.target || l.row.query || ""}. Review relevance, product margins, inventory, and current placement settings before making changes.</p>{onCampaign ? <button type="button" onClick={() => onCampaign(l.campaignKey)}>View Full Campaign Analysis →</button> : null}</div></td></tr> : null}</Fragment>)}
    </tbody></table>{!ledger.length ? <p className={s.empty}>No placement performance metrics are available in this scope.</p> : null}</div><Pager count={ledger.length} page={page} setPage={setPage} label="ledger" /></section>
  </div>;
}

function Pager({ count, page, setPage, label }: { count: number; page: number; setPage: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(count / 25)), current = Math.min(page, pages);
  return <footer><span>{count} {label} rows · Page {current} of {pages}</span><div><button type="button" aria-label={`Previous ${label} page`} disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button> <button type="button" aria-label={`Next ${label} page`} disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></footer>;
}
