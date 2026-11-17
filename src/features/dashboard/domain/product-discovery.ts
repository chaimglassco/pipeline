export type DiscoveryTermRow = { term: string; sales: number; orders: number; spend: number; impressions: number; clicks: number };
export type DiscoveryCandidate = DiscoveryTermRow & { foundVia: string[] };

const STOP_WORDS = new Set(["and", "for", "the", "with", "pack", "pcs", "set", "inch", "inches"]);

function tokens(text: string) {
  return text.toLowerCase().split(/[^a-z0-9/.]+/).map(token => token.replace(/^[./]+|[./]+$/g, "").replace(/(?<=[a-z]{3})s$/, ""))
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/** A term is covered when every meaningful word in it appears in one of our product names. */
export function isCoveredByCatalog(term: string, productNames: string[]) {
  const words = tokens(term);
  return productNames.some(name => {
    const nameWords = new Set(tokens(name));
    return words.every(word => nameWords.has(word));
  });
}

/** Merges search terms found across our ASINs and keeps the ones no product we sell already covers, best first. */
export function discoverProductTerms(found: { productName: string; terms: DiscoveryTermRow[] }[], productNames: string[]): DiscoveryCandidate[] {
  const merged = new Map<string, DiscoveryCandidate>();
  for (const { productName, terms } of found) {
    for (const row of terms) {
      const key = row.term.trim().replace(/\s+/g, " ").toLowerCase();
      if (!key || /^b0[a-z0-9]{8}$/.test(key) || /^asin=/.test(key)) continue; // product-targeting rows, not shopper searches
      const current = merged.get(key);
      if (!current) { merged.set(key, { ...row, term: key, foundVia: [productName] }); continue; }
      current.sales += row.sales; current.orders += row.orders; current.spend += row.spend; current.impressions += row.impressions; current.clicks += row.clicks;
      if (!current.foundVia.includes(productName)) current.foundVia.push(productName);
    }
  }
  return [...merged.values()]
    .filter(candidate => !isCoveredByCatalog(candidate.term, productNames))
    .sort((a, b) => b.orders - a.orders || b.clicks - a.clicks || b.impressions - a.impressions);
}
