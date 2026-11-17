"use client";
import { Search } from "lucide-react";
import { useState } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { discoverProductTerms, type DiscoveryCandidate, type DiscoveryTermRow } from "../domain/product-discovery";
import styles from "./account-campaign-compare.module.css";
import ws from "./ppc-performance-workspace.module.css";

type Result = { ranAt: string; startDate: string; endDate: string; candidates: DiscoveryCandidate[]; failed: string[] };
const STORAGE_KEY = "glassco.ppcProductDiscovery.v2"; // v1 lists were unfiltered by orders
const SHOWN = 200;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-US");

function savedResult(): Result | null {
  // shortcut: last run is kept per browser only; move to shared dashboard state if the team needs one shared list.
  try { const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"); return Array.isArray(value?.candidates) ? value : null; } catch { return null; }
}

export function ProductDiscovery({ products }: { products: { name: string; asin: string }[] }) {
  const [result, setResult] = useState<Result | null>(() => typeof window === "undefined" ? null : savedResult());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; authorizationUrl?: string } | null>(null);
  const withAsin = products.filter(product => /^[A-Z0-9]{10}$/i.test(product.asin.trim()));

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: withAsin.length });
    const found: { productName: string; terms: DiscoveryTermRow[] }[] = [];
    const failed: string[] = [];
    let period = { startDate: "", endDate: "" };
    // One ASIN at a time keeps us inside the Scale Insights session request limit.
    for (const [index, product] of withAsin.entries()) {
      try {
        const response = await fetch(withPpcBasePath(`/api/dashboard/product-discovery?${new URLSearchParams({ asin: product.asin.trim(), country: "US" })}`), { headers: getPipelineAuthorizationHeader(), cache: "no-store" });
        const data = await response.json();
        if (response.status === 409 || response.status === 429) { setError({ message: data.error, authorizationUrl: data.authorizationUrl }); break; }
        if (!response.ok || !Array.isArray(data.terms)) throw new Error(data.error);
        found.push({ productName: product.name, terms: data.terms });
        period = { startDate: data.startDate, endDate: data.endDate };
      } catch { failed.push(product.name); }
      setProgress({ done: index + 1, total: withAsin.length });
    }
    setProgress(null);
    if (!found.length) { setError(current => current ?? { message: "No search terms could be loaded from Scale Insights. Please retry." }); return; }
    const next = { ranAt: new Date().toISOString(), ...period, candidates: discoverProductTerms(found, products.map(product => product.name)), failed };
    setResult(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* still shown for this visit */ }
  };

  return <main className={styles.compareWorkspace} aria-labelledby="product-discovery-heading">
    <section className={`${styles.compareCard} ${ws.card}`}>
      <div className={ws.cardTitle}>
        <h3 id="product-discovery-heading"><Search aria-hidden="true" />Product Discovery</h3>
        <button type="button" className={ws.secondaryButton} disabled={!!progress || !withAsin.length} onClick={() => void run()}>{progress ? `Scanning ${progress.done} / ${progress.total}…` : result ? "Run again" : "Find new search terms"}</button>
      </div>
      <p>Searches over the last 30 days where shoppers saw or clicked our ads for {withAsin.length} products but never bought, and that no product name we sell covers. These shoppers likely wanted something we don&apos;t sell yet, so each term is a possible new product. Terms that produced any order for us are hidden, as we already sell them. Searches we never appear for are not included.</p>
      {error ? <p role="alert">{error.message} {error.authorizationUrl ? <a href={error.authorizationUrl}>Connect Scale Insights</a> : null}</p> : null}
      {progress ? <p role="status">Reading search terms from Scale Insights: {progress.done} of {progress.total} products…</p> : null}
      {result ? <>
        <p>{result.startDate} – {result.endDate} · {count.format(result.candidates.length)} new terms · run {new Date(result.ranAt).toLocaleString()}{result.failed.length ? ` · ${result.failed.length} products could not be read: ${result.failed.join(", ")}` : ""}</p>
        {!result.candidates.length ? <p>No uncovered search terms were found.</p> : <div style={{ overflowX: "auto" }}>
          <table aria-label="Product discovery search terms" className={ws.weeklyTable}>
            <thead><tr>{["Search term", "Clicks", "Impressions", "Ad spend", "Found via"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{result.candidates.slice(0, SHOWN).map(row => <tr key={row.term}><th scope="row">{row.term}</th><td>{count.format(row.clicks)}</td><td>{count.format(row.impressions)}</td><td>{money.format(row.spend)}</td><td>{row.foundVia.join(", ")}</td></tr>)}</tbody>
          </table>
          {result.candidates.length > SHOWN ? <p>Showing the top {SHOWN} of {count.format(result.candidates.length)} terms.</p> : null}
        </div>}
      </> : !progress ? <p>Not run yet. This reads one search-term report per product, about {withAsin.length} Scale Insights requests.</p> : null}
    </section>
  </main>;
}
