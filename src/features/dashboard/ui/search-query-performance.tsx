"use client";
import { useEffect, useState } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import type { SqpReport } from "../data/scale-insights-sqp";
import ws from "./ppc-performance-workspace.module.css";

export function SearchQueryPerformance({ asin, country, weekStart, refreshVersion }: { asin: string; country: string; weekStart: string; refreshVersion: number }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; report?: SqpReport; error?: string; authorizationUrl?: string }>({ key: "" });
  const key = `${country}:${asin}:${weekStart}:${refreshVersion}:${retry}`;
  useEffect(() => {
    if (!asin) return;
    const controller = new AbortController();
    fetch(withPpcBasePath(`/api/dashboard/sqp?${new URLSearchParams({ asin, country, weekStart })}`), { headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { setState({ key, error: data.error || "SQP could not be loaded.", authorizationUrl: data.authorizationUrl }); return; }
      if (data.report?.asin !== asin || data.report?.country !== country || !Array.isArray(data.report?.rows)) throw new Error("Invalid SQP response.");
      setState({ key, report: data.report });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, error: "SQP could not be loaded. Please retry." }); });
    return () => controller.abort();
  }, [asin, country, weekStart, refreshVersion, retry, key]);
  const report = state.key === key ? state.report : undefined;
  const error = state.key === key ? state.error : undefined;
  const count = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  return <section className={ws.card} aria-label="Search Query Performance">
    <div className={ws.cardTitle}><h3>Search Query Performance · SQP</h3><button type="button" onClick={() => setRetry(value => value + 1)}>Retry / Refresh</button></div>
    <p>ASIN {asin} · {country}</p>
    {error ? <p role="alert">{error} {state.authorizationUrl ? <a href={state.authorizationUrl}>Connect Scale Insights</a> : null}</p> : !report ? <p role="status">Loading SQP…</p> : <>
      <p>{report.startDate} – {report.endDate}{report.dataThrough ? ` · Updated through ${report.dataThrough}` : ""}</p>
      {!report.complete ? <p role="alert">Partial SQP data. Retry to load all queries.</p> : null}
      {!report.rows.length ? <p>SQP data is not available for this week yet.</p> : <div style={{ overflowX: "auto" }}><table aria-label="ASIN SQP metrics" className={ws.weeklyTable}><thead><tr>{["Search query", "Impressions", "Clicks", "Cart adds", "Orders (purchases)", "Conversion rate"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={row.query}><th scope="row">{row.query}</th><td>{count(row.impressions)}</td><td>{count(row.clicks)}</td><td>{count(row.cartAdds)}</td><td>{count(row.orders)}</td><td>{row.conversionRate == null ? "—" : `${count(row.conversionRate)}%`}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
