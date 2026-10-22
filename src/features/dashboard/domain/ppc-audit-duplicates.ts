import { auditRate, auditTotals, type AuditAd } from "./ppc-audit";
import { productTargetType } from "./ppc-audit-product-targets";
const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export type DuplicateRules = { minSpend: number; gap: number; bidGap: number };
export const DEFAULT_DUPLICATE_RULES: DuplicateRules = { minSpend: 20, gap: 15, bidGap: 0.3 };
export function duplicateGroups(ads: AuditAd[], rules = DEFAULT_DUPLICATE_RULES) {
  const groups = new Map<string, Map<string, AuditAd[]>>();
  for (const r of ads) {
    if (!r.target || r.query || r.placement || /negative|paused|archived/i.test(`${r.entity} ${r.state} ${r.campaignState || ""}`)) continue;
    const kind = r.entity === "keyword" ? "Keyword Target" : /^(producttarget|producttargeting|target)$/i.test(r.entity) ? productTargetType(r) : null;
    if (!kind || !r.campaignId || !(r.adGroupId || r.adGroup)) continue;
    const key = JSON.stringify([norm(r.type), kind, norm(r.target).replace(/\s*([=:])\s*/g, "$1"), kind === "Keyword Target" ? norm(r.match) : ""]);
    const identity = JSON.stringify([r.campaignId, r.adGroupId || norm(r.adGroup), r.keywordId || r.targetId || norm(r.target)]);
    if (!groups.has(key)) groups.set(key, new Map());
    const occurrences = groups.get(key)!; occurrences.set(identity, [...(occurrences.get(identity) || []), r]);
  }
  return [...groups].filter(([, entries]) => entries.size > 1).map(([id, entries]) => {
    const occurrences = [...entries].map(([key, records]) => {
      const row = records[0]; const available = records.length === 1 && (row.targetMetricsAvailable ?? [row.spend, row.sales, row.orders, row.clicks, row.impressions].some(n => n > 0));
      return { id: key, row, available, acos: available ? auditRate(row.spend, row.sales) : null, cvr: available ? auditRate(row.orders, row.clicks) : null, bid: records.length === 1 && row.bidAvailable === true ? row.bid : null };
    });
    const row = occurrences[0].row; const available = occurrences.every(o => o.available); const totals = auditTotals(occurrences.filter(o => o.available).map(o => o.row));
    const acos = occurrences.map(o => o.acos).filter((v): v is number => v !== null); const bids = occurrences.map(o => o.bid).filter((v): v is number => v !== null);
    const gap = available && acos.length === occurrences.length ? Math.max(...acos) - Math.min(...acos) : null;
    const bidGap = bids.length === occurrences.length ? Math.max(...bids) - Math.min(...bids) : null;
    const asins = [...new Set(occurrences.map(o => o.row.asin).filter(Boolean))]; const campaigns = [...new Set(occurrences.map(o => o.row.campaignId))];
    const severity = !available ? "Unavailable" : totals.spend < rules.minSpend ? "Monitor" : gap === null ? "Review" : gap >= rules.gap ? "High" : "Low";
    return { id, target: row.target, kind: row.entity === "keyword" ? "Keyword Target" : productTargetType(row)!, match: row.match, occurrences, asins, campaigns, available, totals, acos: available ? auditRate(totals.spend, totals.sales) : null, gap, bidGap, severity };
  });
}
