"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { CONTRIBUTION_DIAGNOSES, CONTRIBUTION_METRICS, type CampaignContributionAnalysis, type ContributionMetric, type ContributionRow, type ContributionDelta } from "../domain/campaign-contribution";
import ws from "./ppc-performance-workspace.module.css";
import styles from "./campaign-weekly-comparison.module.css";

const labels: Record<ContributionMetric, string> = { impressions: "Impressions", clicks: "Clicks", spend: "Spend", cpc: "CPC", sales: "PPC Sales", orders: "Orders", acos: "ACOS" };
const filters = ["All campaigns", "Spend increased", "CPC increased", "Spend and CPC increased", "Impressions decreased", "Clicks decreased", "Paying more for less traffic", "New campaigns", "Stopped / no traffic"];
function matches(row: ContributionRow, filter: string) {
  const upSpend = (row.delta.spend.absolute ?? 0) > 0, upCpc = (row.delta.cpc.absolute ?? 0) > 0;
  return filter === filters[0] || (filter === filters[1] && upSpend) || (filter === filters[2] && upCpc) || (filter === filters[3] && upSpend && upCpc) || (filter === filters[4] && (row.delta.impressions.absolute ?? 0) < 0) || (filter === filters[5] && (row.delta.clicks.absolute ?? 0) < 0) || (filter === filters[6] && row.diagnosis.includes(filter)) || (filter === filters[7] && row.diagnosis.includes("New campaign")) || (filter === filters[8] && row.diagnosis.includes(filter));
}
function deltaText(delta: ContributionDelta, metric: ContributionMetric) {
  if (delta.absolute == null) return "Unavailable";
  const absolute = `${delta.absolute > 0 ? "+" : ""}${delta.absolute.toLocaleString("en-US", { maximumFractionDigits: metric === "clicks" || metric === "impressions" || metric === "orders" ? 0 : 2 })}`;
  return metric === "acos" ? `${absolute} pp` : `${absolute} (${delta.isNew ? "NEW" : delta.percentage == null ? "—" : `${delta.percentage > 0 ? "+" : ""}${delta.percentage.toFixed(1)}%`})`;
}
export function CampaignContribution({ asin, productName, country = "US", weekStart, refreshVersion }: { asin: string; productName: string; country?: string; weekStart: string; refreshVersion: number }) {
  const cache = useRef(new Map<string, { at: number; analysis: CampaignContributionAnalysis }>());
  const key = `${country}:${asin}:${weekStart}`;
  const [result, setResult] = useState<{ key: string; analysis: CampaignContributionAnalysis | null; error: string } | null>(null);
  const [retry, setRetry] = useState(0), [filter, setFilter] = useState(filters[0]), [minimumClicks, setMinimumClicks] = useState(3), [allCpc, setAllCpc] = useState(false);
  const [sort, setSort] = useState<{ metric: ContributionMetric | "contribution"; direction: number }>({ metric: "spend", direction: -1 });
  useEffect(() => {
    if (!asin || !weekStart) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const saved = cache.current.get(key);
      if (!refreshVersion && !retry && saved && Date.now() - saved.at < 300000) { setResult({ key, analysis: saved.analysis, error: "" }); return; }
      setResult(null);
      try {
        const query = new URLSearchParams({ asin, country, weekStart });
        const response = await fetch(withPpcBasePath(`/api/dashboard/campaign-contribution?${query}`), { headers: getPipelineAuthorizationHeader(), signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Campaign analysis could not be loaded.");
        const analysis = payload.analysis as CampaignContributionAnalysis;
        if (analysis?.asin !== asin || analysis.country !== country || analysis.currentStartDate !== weekStart || !Array.isArray(analysis.campaigns) || !Array.isArray(analysis.reconciliation) || !["available", "unavailable"].includes(analysis.state)) throw new Error("Campaign analysis returned a different reporting scope.");
        if (controller.signal.aborted) return;
        if (cache.current.size >= 24) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key, { at: Date.now(), analysis });
        setResult({ key, analysis, error: "" });
      } catch (error) { if (!controller.signal.aborted) setResult({ key, analysis: null, error: error instanceof Error ? error.message : "Campaign analysis could not be loaded." }); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [asin, country, weekStart, key, refreshVersion, retry]);
  const analysis = result?.key === key ? result.analysis : null;
  const rows = useMemo(() => (analysis?.campaigns ?? []).filter(row => matches(row, filter)).toSorted((a, b) => {
    const aValue = sort.metric === "contribution" ? a.spendContributionPct : a.delta[sort.metric].absolute;
    const bValue = sort.metric === "contribution" ? b.spendContributionPct : b.delta[sort.metric].absolute;
    if (aValue == null) return bValue == null ? a.campaignId.localeCompare(b.campaignId) : 1;
    if (bValue == null) return -1;
    return (aValue - bValue) * sort.direction || a.campaignId.localeCompare(b.campaignId);
  }), [analysis, filter, sort]);
  const format = (value: number | null | undefined, metric: ContributionMetric) => value == null ? "Unavailable" : metric === "spend" || metric === "sales" || metric === "cpc" ? new Intl.NumberFormat("en-US", { style: "currency", currency: analysis?.currency ?? "USD" }).format(value) : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${metric === "acos" ? "%" : ""}`;
  const changeSort = (metric: ContributionMetric | "contribution") => setSort(current => ({ metric, direction: current.metric === metric ? -current.direction : -1 }));
  const drivers = analysis?.campaigns.filter(row => (row.delta.spend.absolute ?? 0) > 0).slice(0, 5) ?? [];
  const cpcDrivers = analysis?.campaigns.filter(row => (row.delta.cpc.percentage ?? 0) > 0 && (allCpc || ((row.previousMetrics?.clicks ?? 0) >= minimumClicks && (row.currentMetrics?.clicks ?? 0) >= minimumClicks))).toSorted((a, b) => b.delta.cpc.percentage! - a.delta.cpc.percentage!).slice(0, 5) ?? [];
  return <section className={`${ws.card} ${styles.comparisonCard}`} aria-labelledby="campaign-contribution-heading">
    <header className={styles.comparisonHeader}><div><h3 id="campaign-contribution-heading">Campaign Contribution Analysis</h3><p>{productName} · {asin} · {country}</p></div><button type="button" className={styles.replaceButton} onClick={() => setRetry(value => value + 1)}>Retry / Refresh</button></header>
    {!asin ? <p>Select a product with a valid ASIN to view campaign contributions.</p> : result?.key === key && result.error ? <p role="alert">{result.error}</p> : !analysis ? <p role="status">Loading native campaign reports…</p> : <>
      <p>{analysis.previousStartDate} – {analysis.previousEndDate} → {analysis.currentStartDate} – {analysis.currentEndDate}. Completed days only. Checked {new Date(analysis.checkedAt).toLocaleString()}.</p>
      {analysis.warning ? <p className={styles.importNotice} role="status">{analysis.warning}</p> : null}
      {analysis.state === "available" && analysis.summary ? <>
        <div className={styles.contributionSummary}>{(["spend", "cpc", "clicks", "impressions", "sales", "acos"] as const).map(metric => <div key={metric}><small>{labels[metric]}</small><strong>{format(analysis.summary!.current[metric], metric)}</strong><small>Previous {format(analysis.summary!.previous[metric], metric)}</small><span>{deltaText(analysis.summary!.delta[metric], metric)}</span></div>)}</div>
        <div className={styles.contributionDrivers}><div><strong>Top spend increase drivers</strong>{drivers.length ? drivers.map(row => <p key={row.campaignId}>{row.campaignName}: {deltaText(row.delta.spend, "spend")} · {row.spendContributionPct == null ? "Contribution unavailable (no positive ASIN spend increase)" : `${row.spendContributionPct.toFixed(1)}% of ASIN net spend increase`}</p>) : <p>No campaign spend increases.</p>}</div><div><strong>Top CPC increases</strong><label>Minimum clicks in each period <input aria-label="Minimum CPC comparison clicks" type="number" min="1" max="10000" value={minimumClicks} onChange={event => setMinimumClicks(Math.max(1, Math.min(10000, Number(event.target.value) || 3)))} /></label><label><input type="checkbox" checked={allCpc} onChange={event => setAllCpc(event.target.checked)} /> Show all CPC changes</label>{cpcDrivers.length ? cpcDrivers.map(row => <p key={row.campaignId}>{row.campaignName}: {deltaText(row.delta.cpc, "cpc")} · {row.previousMetrics?.clicks} → {row.currentMetrics?.clicks} clicks {row.lowData ? "(Low data)" : ""}</p>) : <p>No qualifying CPC increases.</p>}</div></div>
        <label className={styles.historyControls}>Campaign filter <select value={filter} onChange={event => setFilter(event.target.value)}>{filters.map(value => <option key={value}>{value}</option>)}</select></label>
        <div className={styles.tableScroll}><table aria-label="Campaign contribution metrics"><thead><tr><th>Campaign</th>{CONTRIBUTION_METRICS.map(metric => <th key={metric} aria-sort={sort.metric === metric ? sort.direction < 0 ? "descending" : "ascending" : "none"}><button className={styles.sortButton} onClick={() => changeSort(metric)}>Δ {labels[metric]}</button><small>Previous → Current · change</small></th>)}<th><button className={styles.sortButton} onClick={() => changeSort("contribution")}>Spend contribution</button></th><th>Diagnosis</th></tr></thead><tbody>{rows.map(row => <tr key={row.campaignId}><th scope="row"><strong>{row.campaignName}</strong><small>{row.campaignId} · {row.adType} · {row.status}</small></th>{CONTRIBUTION_METRICS.map(metric => <td key={metric}><div>{format(row.previousMetrics?.[metric], metric)} → <strong>{format(row.currentMetrics?.[metric], metric)}</strong></div><small>{deltaText(row.delta[metric], metric)}</small></td>)}<td>{row.spendContributionPct == null ? "Unavailable" : `${row.spendContributionPct.toFixed(1)}%`}</td><td>{row.diagnosis.map(label => <span className={styles.contributionDiagnosis} title={CONTRIBUTION_DIAGNOSES[label]} key={label}>{label}</span>)}</td></tr>)}</tbody></table></div>
        {!rows.length ? <p>No campaigns match this filter.</p> : null}
        <details><summary>Native campaign reconciliation (1% tolerance)</summary>{analysis.reconciliation.map(row => <p key={`${row.period}:${row.metric}`}>{row.period} {row.metric}: campaign {row.campaignTotal.toFixed(2)} / ASIN {row.asinTotal.toFixed(2)} · {row.coveragePct == null ? "Coverage unavailable (zero ASIN total)" : `${row.coveragePct.toFixed(1)}% coverage`} · {row.matches ? "Reconciled" : "Mismatch / incomplete"}</p>)}</details>
      </> : null}
    </>}
  </section>;
}
