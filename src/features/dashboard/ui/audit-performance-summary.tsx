"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, ChevronDown, Download, Search, ShoppingBag, Tag, TrendingUp } from "lucide-react";
import { auditCampaignLevel, auditRate, auditSearchTermHighAcos, auditSearchTermWaste, auditTotals, describeWasteRules, hasWasteCriteria, type AuditAd, type AuditData } from "../domain/ppc-audit";
import { auditMatchType } from "../domain/ppc-audit-match-types";
import s from "./audit-performance-summary.module.css";

type Product = { asin: string; sku: string; name: string };
type Status = { label: string; tone: "danger" | "warning" | "success" | "neutral" };
type Row = { id: string; product?: Product; spend: number | null; wasted: number | null; ppcSales: number | null; organicSales: number | null; totalSales: number | null; ppcOrders: number | null; orgOrders: number | null; totOrders: number | null; acos: number | null; tacos: number | null; status: Status };
const EMPTY_AUDIT: AuditData = { version: 1, name: "", start: "", end: "", currency: "USD", importedAt: "", files: [], ads: [], business: [] };
// Optional table columns; Product and Status always show.
const COLUMNS = ["Spend", "Wasted", "Total sales", "ACOS", "TACOS", "PPC sales", "Organic sales", "PPC orders", "Organic orders", "Total orders"] as const;
type Column = typeof COLUMNS[number];
const DEFAULT_HIDDEN: Column[] = ["PPC sales", "Organic sales", "PPC orders", "Organic orders", "Total orders"];
const TABS = [{ name: "Most spend", key: "spend" }, { name: "Most waste", key: "wasted" }, { name: "Highest ACOS", key: "acos" }] as const;
// shortcut: fixed review thresholds for the status pill; move into Audit Settings if the team wants to tune them.
const HIGH_TACOS = 20, WASTE_SHARE = 5;
// Five rows keep the table level with the campaign-type and match-type cards beside it.
const TOP_ROWS = 5, PAGE_ROWS = 25;
// The table column each sort tab orders by, tinted so the sort is visible.
const SORTED_COLUMN: Record<typeof TABS[number]["key"], Column> = { spend: "Spend", wasted: "Wasted", acos: "ACOS" };
const RING_R = 71, RING_C = 2 * Math.PI * RING_R, RING_GAP = 4;

function statusFor(hasAds: boolean, businessExpected: boolean, hasBusiness: boolean, spend: number, wasted: number | null, tacos: number | null): Status {
  if (!hasAds) return { label: "No ad data", tone: "neutral" };
  if (wasted && spend > 0 && wasted / spend * 100 >= WASTE_SHARE) return { label: "Cut waste", tone: "danger" };
  if (businessExpected && !hasBusiness) return { label: "No business data", tone: "neutral" };
  if (tacos !== null && tacos >= HIGH_TACOS) return { label: "High TACOS", tone: "warning" };
  return { label: "Healthy", tone: "success" };
}

export function AuditPerformanceSummary({ audit: uploadedAudit, ads, catalog, onWasted }: { audit: AuditData | null; ads: AuditAd[]; catalog: Product[]; onWasted: () => void }) {
  const audit = uploadedAudit || EMPTY_AUDIT;
  const [selected, setSelected] = useState<string[]>([]);
  const [asinSearch, setAsinSearch] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [match, setMatch] = useState("");
  const [mix, setMix] = useState<"sales" | "orders">("sales");
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("spend");
  const [hidden, setHidden] = useState<Column[]>(audit.business.length ? DEFAULT_HIDDEN : [...DEFAULT_HIDDEN, "Total sales", "TACOS"]);
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);

  // Bulk files list every ASIN ever advertised; only ASINs with impressions in this period belong in the summary.
  const ids = useMemo(() => [...new Set([...audit.business.map(r => r.asin), ...ads.filter(r => r.asin && r.impressions > 0).map(r => r.asin)])].sort(), [audit.business, ads]);
  const products = useMemo(() => new Map(catalog.map(p => [p.asin, p])), [catalog]);
  const productText = (id: string) => { const p = products.get(id); return `${id} ${p?.sku || ""} ${p?.name || ""}`.toLowerCase(); };
  const scopedIds = ids.filter(id => (!selected.length || selected.includes(id)) && productText(id).includes(query.toLowerCase()));
  const scopedSet = new Set(scopedIds);
  const scopedAds = ads.filter(r => ((!selected.length && !query) || scopedSet.has(r.asin)) && (!type || r.type === type) && (!match || r.match === match));
  const campaignRows = auditCampaignLevel(scopedAds);
  const totals = auditTotals(campaignRows);
  const business = audit.business.filter(r => scopedSet.has(r.asin));
  const businessByAsin = new Map(business.map(r => [r.asin, r]));
  const adsByAsin = new Map<string, AuditAd[]>();
  for (const row of scopedAds) { const group = adsByAsin.get(row.asin); if (group) group.push(row); else adsByAsin.set(row.asin, [row]); }
  const sales = business.reduce((sum, r) => sum + r.sales, 0);
  const orders = business.reduce((sum, r) => sum + r.orders, 0);
  const rules = audit.wasteRules;
  const wasteSet = hasWasteCriteria(rules);
  const wasteRows = auditSearchTermWaste(scopedAds, rules);
  const waste = wasteSet ? wasteRows.reduce((sum, r) => sum + r.spend, 0) : null;
  const highAcosRows = auditSearchTermHighAcos(scopedAds, rules);
  const highAcosSpend = rules?.highAcos === undefined ? null : highAcosRows.reduce((sum, r) => sum + r.spend, 0);
  const comparable = !type && !match && business.length > 0 && scopedAds.length > 0;
  const organicSales = comparable && sales >= totals.sales ? sales - totals.sales : null;
  const organicOrders = comparable && orders >= totals.orders ? orders - totals.orders : null;
  const ready = !!uploadedAudit;

  const money = (n: number | null, digits = 0) => n === null || !ready ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: audit.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  const count = (n: number | null) => n === null || !ready ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const compact = (n: number) => !ready ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  const pct = (n: number | null, digits = 1) => n === null || !ready ? "—" : `${n.toFixed(digits)}%`;
  const ratio = (a: number, b: number, digits = 1) => pct(auditRate(a, b), digits);

  const rows: Row[] = scopedIds.map(id => {
    const adRows = adsByAsin.get(id) || [];
    const has = adRows.length > 0;
    const t = auditTotals(auditCampaignLevel(adRows));
    const b = businessByAsin.get(id);
    const wasted = has && wasteSet ? auditSearchTermWaste(adRows, rules).reduce((sum, r) => sum + r.spend, 0) : null;
    const tacos = comparable && b && has ? auditRate(t.spend, b.sales) : null;
    return {
      id, product: products.get(id), spend: has ? t.spend : null, wasted, ppcSales: has ? t.sales : null,
      organicSales: comparable && b && has && b.sales >= t.sales ? b.sales - t.sales : null, totalSales: b?.sales ?? null,
      ppcOrders: has ? t.orders : null, orgOrders: comparable && b && has && b.orders >= t.orders ? b.orders - t.orders : null, totOrders: b?.orders ?? null,
      acos: has ? auditRate(t.spend, t.sales) : null, tacos, status: statusFor(has, audit.business.length > 0, !!b, t.spend, wasted, tacos),
    };
  });
  rows.sort((a, b) => { const av = a[tab], bv = b[tab]; return av === null ? (bv === null ? 0 : 1) : bv === null ? -1 : bv - av || a.id.localeCompare(b.id); });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_ROWS)), currentPage = Math.min(page, pages);
  const sortedColumn = SORTED_COLUMN[tab];
  const visible = showAll ? rows.slice((currentPage - 1) * PAGE_ROWS, currentPage * PAGE_ROWS) : rows.slice(0, TOP_ROWS);

  // Sales mix ring: PPC share of total sales, or of total orders.
  const share = !comparable ? null : mix === "sales" ? auditRate(totals.sales, sales) : auditRate(totals.orders, orders);
  const ppcArc = share === null ? 0 : Math.max(0, share / 100 * RING_C - RING_GAP);
  const orgArc = share === null ? 0 : Math.max(0, (1 - share / 100) * RING_C - RING_GAP);
  type Split = [name: string, spend: number, sales: number];
  const addSplit = (map: Map<string, Split>, name: string, r: AuditAd) => { const e = map.get(name); if (e) { e[1] += r.spend; e[2] += r.sales; } else map.set(name, [name, r.spend, r.sales]); };
  const byType = new Map<string, Split>();
  for (const r of campaignRows) addSplit(byType, r.type, r);
  const types = [...byType.values()].sort((a, b) => b[1] - a[1]);
  const typeTone = (name: string) => /product/i.test(name) ? s.toneInk : /brand/i.test(name) ? s.toneAccent : s.toneStone;
  // Match type lives on keyword and target rows, not campaigns: sum those rows (no search terms, placements or negatives).
  const byMatch = new Map<string, Split>();
  for (const r of scopedAds) if (r.target && !r.query && !r.placement && !/negative/i.test(r.entity) && r.spend > 0) addSplit(byMatch, auditMatchType(r) ?? "Product targeting", r);
  const matches = [...byMatch.values()].sort((a, b) => b[1] - a[1]);
  const MATCH_TONES: Record<string, string> = { Exact: s.toneInk, Phrase: s.toneAccent, Broad: s.toneSoft, Auto: s.toneStone, "Product targeting": s.toneLight };
  const campaignsWithSpend = new Set(campaignRows.filter(r => r.spend > 0).map(r => r.campaignId || r.campaign)).size;
  const filtersActive = !!(selected.length || query || type || match);
  const show = (column: Column) => !hidden.includes(column);

  function exportCsv() {
    const escape = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const header = ["Product", "SKU", "ASIN", "Spend", "Wasted Spend", "PPC Sales", "Organic Sales", "Total Sales", "PPC Orders", "Org Orders", "Tot Orders", "ACOS", "TACOS", "Status"];
    const csv = [header, ...rows.map(r => [r.product?.name || "Product name not supplied", r.product?.sku || "", r.id, r.spend, r.wasted, r.ppcSales, r.organicSales, r.totalSales, r.ppcOrders, r.orgOrders, r.totOrders, r.acos, r.tacos, r.status.label])].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "ppc-audit-performance-summary.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() { setSelected([]); setQuery(""); setAsinSearch(""); setType(""); setMatch(""); setPage(1); }
  const segmented = <T extends string>(label: string, options: readonly { name: string; key: T }[], value: T, onChange: (key: T) => void) =>
    <div className={s.segmented} role="group" aria-label={label}>{options.map(o => <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>{o.name}</button>)}</div>;
  const tile = (label: string, icon: ReactNode, value: string, caption: ReactNode, extra?: string) =>
    <div className={`${s.tile} ${extra || ""}`}><div className={s.tileHead}><span>{label}</span><span className={s.badge} aria-hidden="true">{icon}</span></div><div><strong className={s.tileValue}>{value}</strong><div className={s.tileCaption}>{caption}</div></div></div>;
  const efficiencyTile = (name: string, hint: string, value: number | null) =>
    <div className={`${s.mixTile} ${s.ratioTile}`}><div>{name}</div><strong>{pct(value)}</strong><small>{hint}</small></div>;
  // One segmented bar with a legend, shared by the campaign-type and match-type cards.
  // Spend and sales shares are each out of the card's own totals.
  const splitCard = (id: string, title: string, hint: string, entries: Split[], tone: (name: string) => string) => { const total = entries.reduce((sum, e) => sum + e[1], 0), salesTotal = entries.reduce((sum, e) => sum + e[2], 0); return (
    <section className={s.card} aria-labelledby={`${id}-heading`}>
      <div className={s.cardHead}><h2 id={`${id}-heading`}>{title}</h2><span className={s.caption}>{hint}</span></div>
      <div className={s.segments} role="img" aria-label={entries.map(([name, spend]) => `${name} ${ratio(spend, total, 0)}`).join(", ") || "No spend"}>{entries.map(([name, spend]) => <span key={name} className={tone(name)} style={{ flexGrow: total ? spend / total : 0 }} />)}</div>
      {entries.length ? <ul className={s.legend}><li className={s.legendHead} aria-hidden="true"><span /><span>Spend</span><span>Sales</span></li>{entries.map(([name, spend, sales]) => <li key={name}><span className={s.legendName}><span className={`${s.dot} ${tone(name)}`} /><span title={name}>{name}</span></span><span className={s.legendValue}><b>{money(spend)}</b><small>{ratio(spend, total, 0)}</small></span><span className={s.legendValue}><b>{money(sales)}</b><small>{ratio(sales, salesTotal, 0)}</small></span></li>)}</ul> : <p className={s.caption}>{ready ? "No spend in this scope." : "Waiting for uploaded reports."}</p>}
    </section>); };

  return <div className={s.summary}>
    <div className={s.shell}>
      {!ready ? <p className={s.uploadNote}>Upload your PPC Report above to populate this dashboard.</p> : null}
      <header className={s.header}>
        <div>
          <h1>Performance summary</h1>
          <div className={s.chips}>
            <span className={s.chip}><Tag size={14} aria-hidden="true" />{selected.length || query ? `${scopedIds.length} of ${ids.length} ASINs` : `${scopedIds.length} ASINs`}</span>
          </div>
        </div>
        <div className={s.controls}>
          <details className={s.asinMenu}>
            <summary>{selected.length ? `${selected.length} ASINs` : "All ASINs"}<ChevronDown size={16} aria-hidden="true" /></summary>
            <div className={s.options}><input aria-label="Find ASIN options" value={asinSearch} onChange={e => setAsinSearch(e.target.value)} placeholder="Find ASIN or product" /><button type="button" onClick={() => setSelected([])}>Select all ASINs</button>{ids.filter(id => productText(id).includes(asinSearch.toLowerCase())).map(id => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e => { setSelected(e.target.checked ? [...selected, id] : selected.filter(v => v !== id)); setPage(1); }} />{id}</label>)}</div>
          </details>
          <label className={s.select}><span className={s.srOnly}>Campaign type</span><select aria-label="Campaign type" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">All campaign types</option>{[...new Set(ads.map(r => r.type))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
          <label className={s.select}><span className={s.srOnly}>Match type</span><select aria-label="Match type" value={match} onChange={e => { setMatch(e.target.value); setPage(1); }}><option value="">All match types</option>{[...new Set(ads.map(r => r.match))].filter(Boolean).sort().map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
          <label className={s.search}><Search size={16} aria-hidden="true" /><input aria-label="Search products" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search ASIN or product" /></label>
          {filtersActive ? <button type="button" className={s.ghost} onClick={reset}>Reset filters</button> : null}
          <button type="button" className={s.primary} onClick={exportCsv} disabled={!rows.length}><Download size={16} aria-hidden="true" />Export</button>
        </div>
      </header>

      <div className={s.rowTop}>
        <section className={s.card} aria-labelledby="sales-heading">
          <div className={s.salesTop}>
            <div className={s.salesMain}>
              <div className={s.salesLabel}><h2 id="sales-heading" className={s.label}>{comparable || !audit.business.length ? (audit.business.length ? "Total sales" : "PPC sales") : "Total sales"}</h2><span className={s.chipGrey}>30-day total</span></div>
              <strong className={s.hero}>{audit.business.length ? money(business.length ? sales : null) : money(totals.sales)}</strong>
              <p className={s.caption}>{!ready ? "Waiting for uploaded reports" : audit.business.length ? `${count(orders)} orders across ${scopedIds.length} ASINs` : "Add a Business Report to see total and organic sales"}</p>
            </div>
            <dl className={s.funnelStats} aria-label="Ad funnel metrics">
              {([["Impressions", compact(totals.impressions)], ["Clicks", count(totals.clicks)], ["CTR", ratio(totals.clicks, totals.impressions, 2)],
                ["CVR", ratio(totals.orders, totals.clicks)], ["CPC", money(totals.clicks ? totals.spend / totals.clicks : null, 2)], ["AOV", money(totals.orders ? totals.sales / totals.orders : null, 2)]] as const)
                .map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
          <div className={s.divider} />
          <div className={s.mixHead}><span>Sales mix · PPC vs organic</span></div>
          <div className={s.mix}>
            <svg className={s.ring} viewBox="0 0 160 160" role="img" aria-label={share === null ? "Sales mix unavailable" : `${share.toFixed(0)}% of ${mix} from ads, ${(100 - share).toFixed(0)}% organic`}>
              <circle cx="80" cy="80" r={RING_R} className={s.ringTrack} />
              {share !== null ? <>
                <circle cx="80" cy="80" r={RING_R} className={s.ringPpc} strokeDasharray={`${ppcArc} ${RING_C}`} transform="rotate(-90 80 80)" />
                <circle cx="80" cy="80" r={RING_R} className={s.ringOrganic} strokeDasharray={`${orgArc} ${RING_C}`} strokeDashoffset={-(ppcArc + RING_GAP)} transform="rotate(-90 80 80)" />
              </> : null}
              <text x="80" y="80" className={s.ringValue}>{share === null ? "—" : `${share.toFixed(0)}%`}</text>
              <text x="80" y="102" className={s.ringCaption}>{share === null ? (audit.business.length ? "unavailable here" : "needs business data") : `${mix} from ads`}</text>
            </svg>
            <div className={s.mixSide}>
              {segmented("Sales mix measure", [{ name: "Sales", key: "sales" }, { name: "Orders", key: "orders" }] as const, mix, setMix)}
              {/* PPC and Organic on the left, with the ACOS and TACOS tiles level beside them. */}
              <div className={s.mixTiles}>
                <div className={s.mixTile}><div><span className={`${s.dot} ${s.toneAccent}`} />PPC<b>{pct(share, 0)}</b></div>{mix === "sales" ? <><strong>{money(totals.sales)}</strong><small>{count(totals.orders)} orders</small></> : <><strong>{count(totals.orders)}</strong><small>{money(totals.sales)} sales</small></>}</div>
                {efficiencyTile("ACOS", "Ad spend / PPC sales", auditRate(totals.spend, totals.sales))}
                <div className={s.mixTile}><div><span className={`${s.dot} ${s.toneInk}`} />Organic<b>{pct(share === null ? null : 100 - share, 0)}</b></div>{mix === "sales" ? <><strong>{money(organicSales)}</strong><small>{count(organicOrders)} orders</small></> : <><strong>{count(organicOrders)}</strong><small>{money(organicSales)} sales</small></>}</div>
                {efficiencyTile("TACOS", "Ad spend / Total sales", comparable ? auditRate(totals.spend, sales) : null)}
              </div>
            </div>
          </div>
        </section>

        <section className={`${s.card} ${s.kpiCard}`} aria-label="Key spend metrics">
          <div className={s.kpiGrid}>
            <div className={`${s.tile} ${s.tileDanger}`}>
              <div className={s.tileHead}><h2>Wasted spend</h2><span className={s.badge} aria-hidden="true"><AlertTriangle size={16} /></span></div>
              <div><div className={s.wasteValue}><strong className={s.tileValue}>{money(waste)}</strong>{ready && waste !== null ? <span className={s.wasteShare}>{ratio(waste, totals.spend)} of spend</span> : null}</div><div className={s.tileCaption}>{!ready ? "Waiting for uploaded reports" : waste === null ? "No wasted spend rules set. Use the gear icon to choose them." : <>{`${count(wasteRows.length)} search terms`}<span className={s.rule} title={`Rule: ${describeWasteRules(rules)}`}>Rule: {describeWasteRules(rules)}</span></>}</div>
                <button type="button" className={s.linkButton} disabled={!ready} onClick={onWasted}>View details<ArrowRight size={14} aria-hidden="true" /></button></div>
            </div>
            {tile("Ad spend", <TrendingUp size={16} />, money(totals.spend), <span className={s.miniChips}><span>CPC {money(totals.clicks ? totals.spend / totals.clicks : null, 2)}</span><span>{count(ready ? campaignsWithSpend : null)} campaigns</span></span>)}
            {tile("High ACOS spend", <AlertCircle size={16} />, money(highAcosSpend), highAcosSpend === null ? "No High ACOS rule set" : `${count(highAcosRows.length)} search terms above ${rules!.highAcos}% ACOS`, s.tileWarn)}
            {tile("Cost per order", <ShoppingBag size={16} />, money(totals.orders ? totals.spend / totals.orders : null, 2), `${count(totals.orders)} ad orders`)}
          </div>
        </section>
      </div>

      <div className={s.rowBottom}>
        <div className={s.stack}>
          {splitCard("types", "Spend by campaign type", `${types.length} format${types.length === 1 ? "" : "s"}`, types, typeTone)}
          {splitCard("matches", "Spend by match type", "Keyword and target level", matches, name => MATCH_TONES[name] || s.toneStone)}
        </div>

        <section className={`${s.card} ${s.tableCard}`} aria-labelledby="asin-heading">
          <div className={s.cardHead}>
            <div><h2 id="asin-heading">ASINs to act on</h2><p className={s.caption}>{showAll ? `All ${rows.length} ASINs` : `Top ${Math.min(TOP_ROWS, rows.length)} of ${rows.length}`} · sorted by {TABS.find(t => t.key === tab)!.name.toLowerCase().replace("most ", "")}</p></div>
            <div className={s.tableTools}>{segmented("Sort ASINs", TABS, tab, key => { setTab(key); setPage(1); })}
              <details className={s.columnMenu}><summary>Columns<ChevronDown size={16} aria-hidden="true" /></summary><div className={s.options}>{COLUMNS.map(c => <label key={c}><input type="checkbox" checked={show(c)} onChange={e => setHidden(e.target.checked ? hidden.filter(v => v !== c) : [...hidden, c])} />{c}</label>)}</div></details></div>
          </div>
          <div className={s.tableWrap}><table><caption className={s.srOnly}>ASIN Performance Overview</caption>
            <thead><tr><th scope="col">Product</th>{COLUMNS.filter(show).map(c => <th key={c} scope="col" className={c === sortedColumn ? s.sortedCol : undefined} aria-sort={c === sortedColumn ? "descending" : undefined}>{c}</th>)}<th scope="col">Status</th></tr></thead>
            <tbody>{visible.map(r => { const name = r.product?.name || "Product name not supplied"; const ppcShare = r.totalSales && r.ppcSales !== null ? auditRate(r.ppcSales, r.totalSales) : null; return <tr key={r.id}>
              <td><div className={s.product}><span className={s.initials} aria-hidden="true">{(r.product?.name || r.id).split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</span><div><strong>{name}</strong><small>{r.id}</small></div></div></td>
              {show("Spend") ? <td className={sortedColumn === "Spend" ? s.sortedCol : undefined}>{money(r.spend)}</td> : null}
              {show("Wasted") ? <td className={[r.status.tone === "danger" ? s.flagged : "", sortedColumn === "Wasted" ? s.sortedCol : ""].join(" ").trim() || undefined}>{money(r.wasted)}</td> : null}
              {show("Total sales") ? <td>{r.totalSales === null ? "—" : <div className={s.salesCell}><span>{money(r.totalSales)}</span><small>{ppcShare === null ? "—" : `${ppcShare.toFixed(0)}% PPC`}</small><div className={s.thinTrack}><span style={{ width: `${Math.min(100, ppcShare ?? 0)}%` }} /></div></div>}</td> : null}
              {show("ACOS") ? <td className={sortedColumn === "ACOS" ? s.sortedCol : undefined}>{pct(r.acos, 0)}</td> : null}
              {show("TACOS") ? <td>{pct(r.tacos, 0)}</td> : null}
              {show("PPC sales") ? <td>{money(r.ppcSales)}</td> : null}
              {show("Organic sales") ? <td>{money(r.organicSales)}</td> : null}
              {show("PPC orders") ? <td>{count(r.ppcOrders)}</td> : null}
              {show("Organic orders") ? <td>{count(r.orgOrders)}</td> : null}
              {show("Total orders") ? <td>{count(r.totOrders)}</td> : null}
              <td><span className={`${s.status} ${s[r.status.tone]}`}>{r.status.label}</span></td>
            </tr>; })}</tbody></table>
            {!rows.length ? <p className={s.empty}>{ready ? "No ASINs match these filters." : "Waiting for uploaded reports."}</p> : null}
          </div>
          <footer className={s.tableFoot}>
            <span>{showAll ? `Page ${currentPage} of ${pages}` : `Showing ${visible.length} of ${rows.length}`}</span>
            {showAll ? <div className={s.pager}><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button><button type="button" onClick={() => { setShowAll(false); setPage(1); }}>Show top {TOP_ROWS}</button></div>
              : rows.length > TOP_ROWS ? <button type="button" className={s.pill} onClick={() => setShowAll(true)}>Show all {rows.length} ASINs<ArrowRight size={14} aria-hidden="true" /></button> : null}
          </footer>
        </section>
      </div>
      <p className={s.note}>Organic values are calculated differences. Unavailable or incompatible report scopes show —.</p>
    </div>
  </div>;
}
