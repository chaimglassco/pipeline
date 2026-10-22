import { auditRate, type AuditAd } from "./ppc-audit";
import { canonicalCampaignType } from "./ppc-audit-campaign-types";
import { searchTermAnalysis } from "./ppc-audit-search-terms";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
import { placementName } from "./ppc-audit-placements";

export const BRAND_CONFIG_KEY = "glassco.ppcBrandTerms.v1";
export type BrandConfig = { version: 1; primary: string; terms: string[]; exclusions: string[]; updatedAt: string | null };
export const EMPTY_BRAND_CONFIG: BrandConfig = { version: 1, primary: "", terms: [], exclusions: [], updatedAt: null };
const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function brandTermList(text: string) { return [...new Map(text.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map(s => [norm(s), s])).values()]; }
export function validBrandConfig(v: unknown): v is BrandConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as BrandConfig, text = (s: unknown) => typeof s === "string" && s.length <= 200;
  return c.version === 1 && text(c.primary) && [c.terms, c.exclusions].every(list => Array.isArray(list) && list.length <= 100 && list.every(s => text(s) && !!s.trim())) &&
    (c.updatedAt === null || typeof c.updatedAt === "string" && c.updatedAt.length <= 40 && Number.isFinite(Date.parse(c.updatedAt)));
}
export function readBrandConfig(text: string | null): BrandConfig | null { try { if (!text || text.length > 50000) return null; const v: unknown = JSON.parse(text); return validBrandConfig(v) ? v : null; } catch { return null; } }
export function classifyBrandQuery(query: string, config: BrandConfig) {
  const terms = brandTermList([config.primary, ...config.terms].join("\n"));
  if (!terms.length) return { classification: "Unclassified", matched: "", excluded: "" };
  const q = norm(query), excluded = config.exclusions.find(t => q.includes(norm(t))) || "";
  const matched = terms.find(t => q.includes(norm(t))) || "";
  return { classification: !excluded && matched ? "Brand" : "Non-Brand", matched: excluded ? "" : matched, excluded };
}
type Metrics = { available: boolean; totals: { spend: number; sales: number; orders: number; clicks: number; impressions: number }; waste: number };
function summarize<T extends Metrics>(rows: T[]) {
  const measured = rows.filter(r => r.available), available = measured.length > 0;
  const totals = measured.reduce((t, r) => ({ spend: t.spend + r.totals.spend, sales: t.sales + r.totals.sales, orders: t.orders + r.totals.orders, clicks: t.clicks + r.totals.clicks, impressions: t.impressions + r.totals.impressions }), { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
  const waste = measured.reduce((sum, r) => sum + r.waste, 0), acos = available ? auditRate(totals.spend, totals.sales) : null;
  return { rows, totals, available, waste, acos, cvr: available ? auditRate(totals.orders, totals.clicks) : null,
    cpc: available && totals.clicks > 0 ? totals.spend / totals.clicks : null, roas: available && totals.spend > 0 ? totals.sales / totals.spend : null,
    wasteRate: available ? auditRate(waste, totals.spend) : null, missing: rows.length - measured.length,
    status: !available ? "Performance Unavailable" : waste > 0 || acos !== null && acos > 20 ? "Needs Attention" : totals.orders >= 5 && acos !== null && acos <= 20 ? "Strong Efficiency" : "Healthy" };
}
export type BrandScope = { classification?: string; asin?: string; campaign?: string; type?: string; match?: string; placement?: string; minSpend?: number; search?: string };
export function brandTermAnalysis(ads: AuditAd[], config: BrandConfig, scope: BrandScope = {}, rules: WasteRules = DEFAULT_WASTE_RULES) {
  const source = searchTermAnalysis(ads, { asin: scope.asin, campaign: scope.campaign, match: scope.match, placement: scope.placement, minSpend: scope.minSpend, search: scope.search }, rules);
  const rows = source.rows.map(r => ({ ...r, ...classifyBrandQuery(r.row.query, config) })).filter(r => (!scope.classification || r.classification === scope.classification) && (!scope.type || canonicalCampaignType(r.row.type) === scope.type));
  const portfolio = summarize(rows);
  const compare = (items: typeof rows) => ({ ...summarize(items), brand: summarize(items.filter(r => r.classification === "Brand")), nonBrand: summarize(items.filter(r => r.classification === "Non-Brand")) });
  const groups = ["Brand", "Non-Brand"].map(name => {
    const summary = summarize(rows.filter(r => r.classification === name));
    const spendShare = summary.available ? auditRate(summary.totals.spend, portfolio.totals.spend) : null, salesShare = summary.available ? auditRate(summary.totals.sales, portfolio.totals.sales) : null;
    return { name, ...summary, spendShare, salesShare, delta: spendShare !== null && salesShare !== null ? salesShare - spendShare : null };
  });
  const byAsin = new Map<string, typeof rows>();
  for (const row of rows) { const key = row.row.asin || "Unmapped", bucket = byAsin.get(key); if (bucket) bucket.push(row); else byAsin.set(key, [row]); }
  const asins = [...byAsin].map(([asin, items]) => {
    const summary = compare(items), brandShare = summary.missing === 0 && items.every(r => r.classification !== "Unclassified") && summary.available ? auditRate(summary.brand.totals.sales, summary.totals.sales) : null;
    return { asin, ...summary, brandShare, dependency: brandShare === null ? "Unavailable" : brandShare >= 60 ? "High Brand Pull" : brandShare >= 40 ? "Moderate / Balanced" : "Low / Generic Capture" };
  });
  const matches = [...new Set(["Exact", "Phrase", "Broad", "Auto", ...rows.map(r => r.match)])].map(name => ({ name, ...compare(rows.filter(r => r.match === name)) }));
  const placementNames = [...new Set(rows.flatMap(r => r.placements.map(p => p.name)))].filter(name => !scope.placement || name === scope.placement);
  const placements = placementNames.map(name => {
    const items = rows.flatMap(r => { const p = r.placements.find(p => p.name === name); if (!p) return []; const raw = r.placementRows.filter(v => placementName(v.placement) === name); return [{ ...p, classification: r.classification, waste: p.available ? wasteFindings(raw, rules).reduce((sum, f) => sum + f.row.spend, 0) : 0 }]; });
    return { name, ...summarize(items), brand: summarize(items.filter(r => r.classification === "Brand")), nonBrand: summarize(items.filter(r => r.classification === "Non-Brand")) };
  });
  return { rows, portfolio, groups, asins, matches, placements, configured: !!brandTermList([config.primary, ...config.terms].join("\n")).length, unclassified: rows.filter(r => r.classification === "Unclassified").length };
}
export type BrandTermPerformance = ReturnType<typeof brandTermAnalysis>["rows"][number];
