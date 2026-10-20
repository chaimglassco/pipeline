"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import { auditRate, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { campaignPerformance, type CampaignPerformance } from "../domain/ppc-audit-campaigns";
import { campaignTypeAnalysis, campaignTypeFindings, campaignTypeName, canonicalCampaignType } from "../domain/ppc-audit-campaign-types";
import { DEFAULT_WASTE_RULES, readWasteReview, type WasteRules } from "../domain/ppc-audit-waste";
import { CampaignDetails } from "./audit-campaigns";
import s from "./audit-campaign-types.module.css";

type Product = { asin: string; sku: string; name: string };
const MATRIX_COLUMNS = ["Campaign Type", "Camps", "Spend", "PPC Sales", "PPC Orders", "CTR", "CPC", "CVR", "ACOS", "Wasted Spend", "Waste %", "Spend Share", "Sales Share", "Order Share", "Status"];
const SORTS = ["Highest Spend", "Highest Sales", "Highest Waste", "ACOS (High to Low)", "ACOS (Low to High)"];

export function AuditCampaignTypes({ audit, ads, catalog, onCampaign }: {
  audit: AuditData | null; ads: AuditAd[]; catalog: Product[]; onCampaign?: (id: string) => void;
}) {
  const [asins, setAsins] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [match, setMatch] = useState("");
  const [placement, setPlacement] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [sort, setSort] = useState(SORTS[0]);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [rules, setRules] = useState<WasteRules>(DEFAULT_WASTE_RULES);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || !audit) return;
      try { const saved = readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) setRules(saved.rules); } catch { /* Use defaults if storage is unavailable. */ }
    });
    return () => { active = false; };
  }, [audit]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const all = useMemo(() => campaignPerformance(ads, {}, rules), [ads, rules]);
  const scoped = useMemo(() => campaignPerformance(ads, { asins, campaigns, match, placement, state }, rules), [ads, asins, campaigns, match, placement, state, rules]);
  const rows = useMemo(() => scoped.filter(c => (!types.length || types.includes(canonicalCampaignType(c.type))) &&
    [c.name, ...c.asins, ...c.asins.map(id => products.get(id)?.name || ""), ...c.raw.map(r => `${r.adGroup} ${r.sku}`)]
      .some(value => value.toLowerCase().includes(search.toLowerCase().trim()))), [scoped, types, search, products]);
  const { portfolio, groups } = useMemo(() => campaignTypeAnalysis(rows), [rows]);
  const findings = useMemo(() => campaignTypeFindings(groups, portfolio), [groups, portfolio]);
  const shownGroups = groups.filter(g => !types.length || types.includes(g.type));
  const activeType = shownGroups.some(g => g.type === selected) ? selected :
    shownGroups.find(g => g.campaigns.length)?.type || shownGroups[0]?.type || "SP";
  const activeGroup = groups.find(g => g.type === activeType)!;
  const drilldown = [...(activeGroup?.campaigns || [])].sort((a, b) => {
    const value = (r: CampaignPerformance) => sort.startsWith("ACOS") ? r.acos : sort === "Highest Sales" ? r.totals?.sales ?? null : sort === "Highest Waste" ? r.waste : r.totals?.spend ?? null;
    const av = value(a), bv = value(b);
    if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
    if (bv === null) return -1;
    return (av - bv) * (sort === "ACOS (Low to High)" ? 1 : -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(drilldown.length / 25)), currentPage = Math.min(page, pages);
  const num = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const money = (n: number | null) => n === null || !audit ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, maximumFractionDigits: 0 }).format(n);
  const percent = (n: number | null) => n === null || !audit ? "—" : `${num(n)}%`;
  const ratio = (a: number, b: number) => percent(auditRate(a, b));
  const delta = (n: number | null) => n === null || !audit ? "—" : `${n > 0 ? "+" : ""}${num(n)} pp`;
  const metric = (n: number) => portfolio.available ? n : null;
  function chooseType(type: string) { setSelected(type); setPage(1); setExpanded([]); }
  function reset() { setAsins([]); setTypes([]); setCampaigns([]); setMatch(""); setPlacement(""); setState(""); setSearch(""); setSelected(""); setPage(1); setExpanded([]); }
  function refresh() {
    let next = DEFAULT_WASTE_RULES;
    try { const saved = audit && readWasteReview(localStorage.getItem("glassco.ppcWasteReview.v1"), audit.importedAt); if (saved) next = saved.rules; } catch { /* Retain default rules. */ }
    setRules({ ...next }); setNotice("Recalculated from the current uploaded reports.");
  }
  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^\s*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [[...MATRIX_COLUMNS], ...shownGroups.map(g => [g.name, g.campaigns.length, g.available ? g.totals.spend : null, g.available ? g.totals.sales : null, g.available ? g.totals.orders : null,
      g.ctr, g.cpc, g.cvr, g.acos, g.available ? g.waste : null, g.wasteRate, g.spendShare, g.salesShare, g.orderShare, g.status])]
      .map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-campaign-types.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function multi(label: string, values: string[], setter: (v: string[]) => void, options: [string, string][]) {
    return <details><summary>{label}: {values.length ? `${values.length} selected` : "All"}</summary><div className={s.options}>
      <button type="button" onClick={() => { setter([]); setPage(1); }}>All {label}</button>
      {options.map(([value, name]) => <label key={value}><input type="checkbox" checked={values.includes(value)} onChange={e => { setter(e.target.checked ? [...values, value] : values.filter(v => v !== value)); setPage(1); }} />{name}</label>)}
    </div></details>;
  }
  function select(label: string, value: string, setter: (v: string) => void, options: string[], allLabel: string) {
    return <label>{label}<select value={value} onChange={e => { setter(e.target.value); setPage(1); }}><option value="">{allLabel}</option>{options.map(v => <option key={v}>{v}</option>)}</select></label>;
  }
  const matrixRow = (g: typeof portfolio & { name: string; spendShare?: number | null; salesShare?: number | null; orderShare?: number | null }, total = false) => [g.name, num(g.campaigns.length), money(g.available ? g.totals.spend : null), money(g.available ? g.totals.sales : null), num(g.available ? g.totals.orders : null), percent(g.ctr), money(g.cpc), percent(g.cvr), percent(g.acos), money(g.available ? g.waste : null), percent(g.wasteRate), percent(total ? auditRate(g.totals.spend, g.totals.spend) : g.spendShare ?? null), percent(total ? auditRate(g.totals.sales, g.totals.sales) : g.salesShare ?? null), percent(total ? auditRate(g.totals.orders, g.totals.orders) : g.orderShare ?? null), g.status];

  return <div className={s.workspace}>
    <header className={s.heading}><div><h1>Campaign Type</h1><small>{types.length ? `Showing ${types.length} selected types` : "Showing all campaign types"}</small><p>Compare Sponsored Products, Sponsored Brands, and Sponsored Display spend, efficiency, waste, and sales contribution.</p></div>
      <div className={s.actions}><button type="button" disabled={!rows.length} onClick={exportCsv}><Download size={14} aria-hidden="true" />Export CSV</button><button type="button" disabled={!audit} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh</button>
        <details><summary><SlidersHorizontal size={14} aria-hidden="true" />Column Settings</summary><div className={s.options}><small>Efficiency breakdown columns</small>{MATRIX_COLUMNS.slice(1).map(c => <label key={c}><input type="checkbox" checked={!hidden.includes(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(h => h !== c) : [...hidden, c])} />{c}</label>)}</div></details>
      </div>
    </header>
    {!audit ? <p className={s.note}>Upload your PPC Report and Business Report above to populate this dashboard.</p> : null}
    {notice ? <p className={s.note} role="status">{notice}</p> : null}
    <div className={s.filters}>
      {multi("ASINs", asins, setAsins, [...new Set([...all.flatMap(c => c.asins), "Unmapped"])].sort().map(id => [id, products.get(id)?.name ? `${id} · ${products.get(id)!.name}` : id]))}
      {multi("Types", types, setTypes, groups.map(g => [g.type, g.name]))}
      {multi("Campaigns", campaigns, setCampaigns, all.map(c => [c.id, `${c.name} · ${c.type} · ${c.raw[0].campaignId}`]))}
      {select("Match Type", match, setMatch, [...new Set(ads.map(r => r.match))].filter(Boolean).sort(), "All / not applicable")}
      {select("Placement", placement, setPlacement, [...new Set(ads.map(r => r.placement))].filter(Boolean).sort(), "All Placements")}
      {select("Campaign state", state, setState, [...new Set(all.map(c => c.state))].sort(), "All States")}
      <label className={s.search}>Search<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Campaign, ASIN, ad group…" /></label><button type="button" onClick={reset}>Reset Filters</button>
    </div>
    {audit && (portfolio.missing > 0 || asins.length > 0 || match || placement) ? <p className={s.note}>Metrics and shares use available evidence in this scope. {portfolio.missing ? `${portfolio.missing} campaigns have no performance at this level. ` : ""}Separate report dimensions are not added together.</p> : null}
    <section className={s.portfolio} aria-label="Campaign type portfolio metrics">
      {[["Types", num(groups.filter(g => g.campaigns.length).length)], ["Campaigns", num(rows.length)], ["Spend", money(metric(portfolio.totals.spend))], ["PPC Sales", money(metric(portfolio.totals.sales))], ["PPC Orders", num(metric(portfolio.totals.orders))], ["ACOS", percent(portfolio.acos)], ["Wasted Spend", money(metric(portfolio.waste))], ["Avg CPC", money(portfolio.cpc)], ["CTR", percent(portfolio.ctr)], ["CVR", percent(portfolio.cvr)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong>{label === "ACOS" ? <small>Review threshold ≤ 20%</small> : label === "Wasted Spend" ? <small>{percent(portfolio.wasteRate)} of spend</small> : null}</div>)}
    </section>
    <section className={s.cards} aria-label="Campaign type cards">{shownGroups.map(g => <article key={g.type} className={g.type === activeType ? s.activeCard : ""}>
      <header><span>Campaign Type</span><span className={s.badge}>{!g.campaigns.length ? "Not supplied" : g.status}</span></header><h2>{g.name}</h2><small>{num(g.campaigns.length)} campaigns · {ratio(g.campaigns.length, rows.length)} of portfolio</small>
      <div className={s.cardMetrics}><div><span>Spend</span><strong>{money(g.available ? g.totals.spend : null)}</strong><small>{percent(g.spendShare)} spend share</small></div><div><span>PPC Sales</span><strong>{money(g.available ? g.totals.sales : null)}</strong><small>{percent(g.salesShare)} sales share</small></div>
        <div><span>Orders</span><strong>{num(g.available ? g.totals.orders : null)}</strong></div><div><span>ACOS</span><strong>{percent(g.acos)}</strong></div><div><span>CTR / CPC</span><strong>{percent(g.ctr)} · {money(g.cpc)}</strong></div><div><span>CVR</span><strong>{percent(g.cvr)}</strong></div></div>
      <footer><small>Wasted Spend: {money(g.available ? g.waste : null)} ({percent(g.wasteRate)})</small><button type="button" aria-pressed={activeType === g.type} onClick={() => chooseType(g.type)}>View {g.name} campaigns</button></footer>
    </article>)}</section>
    <section className={s.panel}><header><div><h2>Spend Share vs. Sales &amp; Order Contribution</h2><p>Compare reported contribution with spend allocation. Contribution is not a profit or return-on-investment measure.</p></div></header>
      <div className={s.legend}><span>■ Spend Share</span><span>▧ Sales Share</span></div>
      {shownGroups.map(g => <div className={s.contribution} key={g.type}><header><strong>{g.name}</strong><span>Spend Share: {percent(g.spendShare)} · Sales Share: {percent(g.salesShare)} · {delta(g.salesDelta)} difference</span></header>
        <div className={s.bar} role="img" aria-label={`${g.name} spend share ${percent(g.spendShare)}`}><span style={{ width: `${Math.min(100, Math.max(0, g.spendShare ?? 0))}%` }} /></div>
        <div className={`${s.bar} ${s.salesBar}`} role="img" aria-label={`${g.name} sales share ${percent(g.salesShare)}`}><span style={{ width: `${Math.min(100, Math.max(0, g.salesShare ?? 0))}%` }} /></div>
        <footer><small>Order Share: {percent(g.orderShare)} ({delta(g.orderDelta)} vs spend)</small><small>Sales Share Relative to Spend Share: {g.efficiencyIndex === null || !audit ? "—" : `${num(g.efficiencyIndex * 100)}%`}</small></footer>
      </div>)}
    </section>
    <section className={s.panel}><header><div><h2>Campaign Type Efficiency Breakdown</h2><p>Full comparative matrix · available report metrics</p></div><small>{groups.filter(g => g.campaigns.length).length} reported types</small></header>
      <div className={s.tableWrap}><table aria-label="Campaign Type Efficiency Breakdown"><caption className={s.srOnly}>Campaign Type Efficiency Breakdown</caption><thead><tr>{MATRIX_COLUMNS.filter(c => !hidden.includes(c)).map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{shownGroups.map(g => <tr key={g.type}>{matrixRow(g).map((v, i) => hidden.includes(MATRIX_COLUMNS[i]) ? null : i === 0 ? <th scope="row" key={i}><button type="button" onClick={() => chooseType(g.type)}>{v}</button></th> : <td key={i}>{v}</td>)}</tr>)}</tbody>
        <tfoot><tr>{matrixRow({ ...portfolio, name: "Portfolio Total" }, true).map((v, i) => hidden.includes(MATRIX_COLUMNS[i]) ? null : i === 0 ? <th key={i} scope="row">{v}</th> : <td key={i}>{v}</td>)}</tr></tfoot>
      </table></div>
    </section>
    <section className={s.panel}><header><div><h2>Strategic Findings &amp; Recommended Reviews</h2><p>Calculated from this reporting scope and the saved waste rules.</p></div><small>{findings.length} review signals</small></header>
      <div className={s.findings}>{findings.map(f => { const g = groups.find(g => g.type === f.type)!; return <article key={f.kind}><small>{f.kind === "share" ? delta(g.salesDelta) + " sales vs spend share" : f.kind === "acos" ? percent(g.acos) + " ACOS" : f.kind === "cvr" ? `${percent(g.cvr)} CVR vs ${percent(portfolio.cvr)}` : percent(g.wasteRate) + " flagged spend"}</small><h3>{f.title}</h3><p>{f.detail}</p><p><strong>Recommended Review:</strong> {f.review}</p><button type="button" onClick={() => chooseType(f.type)}>View {campaignTypeName(f.type)} campaigns</button></article>; })}</div>
      {!findings.length ? <p className={s.empty}>{audit ? "No comparative review signals in the available data." : "Upload reports to calculate review signals."}</p> : null}
    </section>
    <section className={s.panel}><header><div><h2>Campaigns by Selected Type: {campaignTypeName(activeType)}</h2><p>{drilldown.length} campaigns · expand a campaign for target and placement evidence.</p></div><label>Sort by<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{SORTS.map(v => <option key={v}>{v}</option>)}</select></label></header>
      <div className={s.tableWrap}><table aria-label="Campaigns by Selected Type"><caption className={s.srOnly}>Campaigns by Selected Type</caption><thead><tr>{["Expand", "Campaign Name", "ASIN", "Status", "Bidding Strategy", "Daily Budget", "Spend", "Wasted", "Sales", "Orders", "CTR", "CPC", "CVR", "ACOS", "Type Sales Share", "Best Match", "Best Placement"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
        {drilldown.slice((currentPage - 1) * 25, currentPage * 25).map(c => {
          const open = expanded.includes(c.id);
          const bestMatch = c.matches.find(m => m.sales > 0);
          const values: ReactNode[] = [<button key="expand" type="button" aria-label={`Expand type campaign ${c.name} ${c.type} ${c.raw[0].campaignId}`} aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter(id => id !== c.id) : [...expanded, c.id])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>, <Fragment key="name"><strong>{c.name}</strong><small>{c.raw[0].campaignId}</small></Fragment>, c.asins.join(", ") || "Unmapped", c.state, c.strategy, money(c.dailyBudget), money(c.totals?.spend ?? null), money(c.waste), money(c.totals?.sales ?? null), num(c.totals?.orders ?? null), c.totals ? ratio(c.totals.clicks, c.totals.impressions) : "—", money(c.cpc), percent(c.cvr), percent(c.acos), c.totals ? ratio(c.totals.sales, activeGroup.totals.sales) : "—", bestMatch?.name || "—", c.bestPlacement];
          return <Fragment key={c.id}><tr>{values.map((v, i) => <td key={i}>{v}</td>)}</tr>{open ? <tr><td colSpan={17}>{onCampaign ? <button className={s.fullAnalysis} type="button" onClick={() => onCampaign(c.id)}>View Full Campaign Analysis →</button> : null}<CampaignDetails campaign={c} audit={audit} products={products} money={money} count={num} ratio={ratio} /></td></tr> : null}</Fragment>;
        })}
      </tbody></table>{!drilldown.length ? <p className={s.empty}>{audit ? "No campaigns match this type and scope." : "Waiting for uploaded reports."}</p> : null}</div>
      <footer><span>{drilldown.length ? `Showing ${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, drilldown.length)} of ${drilldown.length}` : "0 campaigns"}{audit ? ` · ${audit.start} – ${audit.end}` : ""}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button> Page {currentPage} of {pages} <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
    </section>
  </div>;
}
