export const AUDIT_MODULES = ["Performance Summary", "Wasted Ad Spend", "Opportunities", "Advertised ASIN", "Campaigns", "Campaign Type", "Placement", "Keyword Target", "Product Target", "Search Terms", "Match Type", "Brand Terms", "Duplicated Targets", "Bidding Strategy"] as const;
export type AuditModule = typeof AUDIT_MODULES[number];
export type AuditAd = { entity: string; type: string; campaign: string; campaignId: string; adGroup: string; asin: string; sku: string; target: string; query: string; match: string; placement: string; strategy: string; state: string; dailyBudget?: number; campaignState?: string; keywordId?: string; targetId?: string; adGroupId?: string; targetMetricsAvailable?: boolean; bidAvailable?: boolean; placementMetricsAvailable?: boolean; placementBidAdjustment?: number; bid: number; spend: number; sales: number; orders: number; clicks: number; impressions: number };
export type AuditBusiness = { asin: string; sales: number; orders: number; units: number; sessions: number };
export type AuditData = { version: 1; name: string; start: string; end: string; currency: string; importedAt: string; files: string[]; ads: AuditAd[]; business: AuditBusiness[] };
export type AuditSheet = { name: string; rows: string[][] };
const norm = (text: string) => text.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseAuditCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted cell.");
  row.push(cell.replace(/\r$/, "")); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
function reader(headers: string[], row: string[]) {
  const map = new Map(headers.map((h, i) => [norm(h), row[i]?.trim() || ""]));
  return (...keys: string[]) => keys.map(norm).map(k => map.get(k)).find(v => v !== undefined && v !== "") || "";
}
function number(text: string, context: string) {
  if (!text || text === "—" || text === "-") return 0;
  const cleaned = text.replace(/[$£€,\s%]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned) || !Number.isFinite(Number(cleaned))) throw new Error(`Invalid number in ${context}. Use English-format Amazon reports.`);
  return Number(cleaned);
}
function headerIndex(rows: string[][], required: string[]) { return rows.findIndex(row => required.every(key => row.some(h => norm(h) === norm(key)))); }
export function parseAuditAds(sheets: AuditSheet[], onRepeatedRow?: () => void): AuditAd[] {
  const result: AuditAd[] = []; const identities = new Map<string, { ad: AuditAd; columns: {key: string; column: number}[]; row: string[]; location: string }>();
  for (const sheet of sheets) {
    const h = sheet.rows.findIndex(row => row.some(c => norm(c) === "spend") && row.some(c => norm(c) === "clicks") && row.some(c => norm(c) === "impressions"));
    if (h < 0) continue;
    const headers = sheet.rows[h];
    const sourceColumns = headers.map((header, column) => ({ key: norm(header), column })).filter(({ key }) => key).sort((a, b) => a.key.localeCompare(b.key));
    if (!headers.some(c => /^(sales|7daytotalsales|14daytotalsales|14daytotalsalesattributed)$/i.test(norm(c))) || !headers.some(c => /^(orders|7daytotalorders|14daytotalorders|14daytotalordersattributed)$/i.test(norm(c)))) throw new Error(`Missing Sales or Orders columns in ${sheet.name}. Include performance metrics in the bulk export.`);
    for (let i = h + 1; i < sheet.rows.length; i++) {
      const get = reader(headers, sheet.rows[i]);
      const campaign = get("Campaign Name", "Campaign Name (Informational only)", "Campaign");
      if (!campaign) continue;
      const query = get("Customer Search Term", "Search Term", "Search Query");
      const entity = query ? "searchterm" : norm(get("Entity") || (get("Keyword Text", "Targeting", "Product Targeting Expression") ? "target" : "campaign"));
      const type = get("Product", "Campaign Type", "Ad Product") || sheet.name;
      const metric = (...keys: string[]) => number(get(...keys), `${sheet.name}, row ${i + 1}`);
      const asin = get("ASIN", "ASIN (Informational only)", "Advertised ASIN").toUpperCase();
      if (asin && !/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`Invalid advertised ASIN in ${sheet.name}, row ${i + 1}.`);
      const ad: AuditAd = { entity, type, campaign, campaignId: get("Campaign ID", "Campaign ID (Informational only)") || campaign, adGroup: get("Ad Group Name", "Ad Group Name (Informational only)", "Ad Group"), asin, sku: get("SKU", "SKU (Informational only)"), target: get("Keyword Text", "Product Targeting Expression", "Targeting"), query, match: get("Match Type"), placement: get("Placement"), strategy: get("Bidding Strategy"), state: get("State", "Status", "Campaign State (Informational only)"), bid: metric("Bid"), spend: metric("Spend"), sales: metric("Sales", "7 Day Total Sales", "14 Day Total Sales", "14 Day Total Sales (attributed)"), orders: metric("Orders", "7 Day Total Orders", "14 Day Total Orders", "14 Day Total Orders (attributed)"), clicks: metric("Clicks"), impressions: metric("Impressions") };
      const targetId = get("Product Targeting ID", "Targeting ID", "Target ID"); if (targetId) ad.targetId = targetId;
      const keywordId = get("Keyword ID"); if (keywordId) ad.keywordId = keywordId;
      const adGroupId = get("Ad Group ID"); if (adGroupId) ad.adGroupId = adGroupId;
      if (ad.target || ad.query) {
        ad.targetMetricsAvailable = [get("Spend"), get("Sales", "7 Day Total Sales", "14 Day Total Sales", "14 Day Total Sales (attributed)"), get("Orders", "7 Day Total Orders", "14 Day Total Orders", "14 Day Total Orders (attributed)"), get("Clicks"), get("Impressions")].every(value => value !== "" && value !== "—" && value !== "-");
        ad.bidAvailable = !!get("Bid") && !["—", "-"].includes(get("Bid"));
      }
      const reportedBudget = get("Campaign Daily Budget", "Campaign Daily Budget (Informational only)", "Daily Budget");
      if (reportedBudget.trim()) ad.dailyBudget = number(reportedBudget, `${sheet.name}, row ${i + 1}, daily budget`);
      const reportedCampaignState = entity === "campaign" ? ad.state : get("Campaign State (Informational only)", "Campaign State");
      if (reportedCampaignState) ad.campaignState = reportedCampaignState;
      if (ad.placement) {
        ad.placementMetricsAvailable = [get("Spend"), get("Sales", "7 Day Total Sales", "14 Day Total Sales", "14 Day Total Sales (attributed)"), get("Orders", "7 Day Total Orders", "14 Day Total Orders", "14 Day Total Orders (attributed)"), get("Clicks"), get("Impressions")].every(value => value !== "" && value !== "—" && value !== "-");
        const adjustment = get("Percentage", "Placement Percentage", "Placement Bid Adjustment", "Bid Adjustment");
        if (adjustment) ad.placementBidAdjustment = number(adjustment.replace(/^\+/, ""), `${sheet.name}, row ${i + 1}, placement bid adjustment`);
      }
      const identity = JSON.stringify([ad.type, ad.entity, ad.campaignId, ad.adGroup, ad.asin, ad.sku, ad.target, ad.query, ad.match, ad.placement, ad.keywordId || "", ad.adGroupId || "", ad.targetId || ""]);
      // Compare all source columns too: an unmodelled creative/segment field must
      // never turn distinct report rows into an apparent exact duplicate.
      const previous = identities.get(identity);
      if (previous) {
        const sameSource = previous.columns.length === sourceColumns.length && sourceColumns.every(({key, column}, index) => key === previous.columns[index].key && (sheet.rows[i][column]?.trim() || "") === (previous.row[previous.columns[index].column]?.trim() || ""));
        if (sameSource && JSON.stringify(previous.ad) === JSON.stringify(ad)) { onRepeatedRow?.(); continue; }
        throw new Error(`Conflicting ${ad.entity} records in ${campaign}: ${previous.location} and ${sheet.name}, row ${i + 1}. Their values differ; use one reporting-period export.`);
      }
      identities.set(identity, { ad, columns: sourceColumns, row: sheet.rows[i], location: `${sheet.name}, row ${i + 1}` }); result.push(ad);
      if (result.length > 100000) throw new Error("Audit supports up to 100,000 advertising rows per import.");
    }
  }
  if (!result.length) throw new Error("No advertising performance rows found. Upload an English Amazon bulk or search-term report with Spend, Sales, Orders, Clicks and Impressions.");
  return result;
}
export function parseAuditBusiness(sheets: AuditSheet[]): AuditBusiness[] {
  const rows: AuditBusiness[] = []; const seen = new Set<string>();
  for (const sheet of sheets) {
    const h = headerIndex(sheet.rows, ["(Child) ASIN", "Ordered Product Sales"]);
    if (h < 0) continue;
    for (let i = h + 1; i < sheet.rows.length; i++) {
      const get = reader(sheet.rows[h], sheet.rows[i]); const asin = get("(Child) ASIN").toUpperCase();
      if (!asin) continue;
      if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) throw new Error("Business report must contain one row per valid child ASIN.");
      seen.add(asin);
      rows.push({ asin, sales: number(get("Ordered Product Sales"), asin), orders: number(get("Total Order Items"), asin), units: number(get("Units Ordered"), asin), sessions: number(get("Sessions - Total", "Sessions"), asin) });
    }
  }
  if (!rows.length) throw new Error("Upload the Detail Page Sales and Traffic by Child Item business report with (Child) ASIN and Ordered Product Sales columns.");
  return rows;
}
export const auditTotals = (rows: AuditAd[]) => rows.reduce((sum, row) => ({ spend: sum.spend + row.spend, sales: sum.sales + row.sales, orders: sum.orders + row.orders, clicks: sum.clicks + row.clicks, impressions: sum.impressions + row.impressions }), { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
export const auditRate = (a: number, b: number) => b > 0 ? a / b * 100 : null;
export function mapAuditAsins(rows: AuditAd[], catalog: { asin: string; sku: string }[]) {
  const mapped = rows.map(row => row.asin || !row.sku ? row : { ...row, asin: catalog.find(p => p.sku === row.sku)?.asin || "" });
  const groups = new Map<string, Set<string>>();
  mapped.filter(row => row.entity === "productad" && row.asin && row.adGroup).forEach(row => { const key = `${row.type}:${row.campaignId}:${row.adGroup}`; const group = groups.get(key) || new Set<string>(); group.add(row.asin); groups.set(key, group); });
  return mapped.map(row => { const group = groups.get(`${row.type}:${row.campaignId}:${row.adGroup}`); return !row.asin && row.adGroup && group?.size === 1 && (row.target || row.query) ? { ...row, asin: [...group][0] } : row; });
}
export function auditTargetLevel(rows: AuditAd[]) {
  const groups = new Map<string, AuditAd[]>();
  rows.forEach(row => { const key = `${row.type}:${row.campaignId}`; const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); });
  return [...groups.values()].flatMap(group => { const queries = group.filter(row => row.query); return queries.length ? queries : group.filter(row => row.target); });
}
// Bulk files repeat performance at several entity levels. Pick one level per campaign.
export function auditCampaignLevel(rows: AuditAd[]) {
  const groups = new Map<string, AuditAd[]>();
  rows.forEach(row => { const key = `${row.type}:${row.campaignId}`; const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]); });
  return [...groups.values()].flatMap(group => {
    for (const level of ["campaign", "adgroup", "productad", "keyword", "producttargeting", "target", "searchterm"]) {
      const selected = level === "keyword" ? group.filter(r => r.entity === "keyword" || r.entity === "producttargeting") : group.filter(r => r.entity === level);
      if (selected.length) return selected;
    }
    return [];
  });
}
export function auditDuplicates(rows: AuditAd[]) {
  const groups = new Map<string, AuditAd[]>();
  rows.filter(r => r.target && !r.query && !/paused|archived/i.test(r.state)).forEach(row => {
    const key = [row.type, row.asin || row.sku || "unknown-product", row.target.trim().replace(/\s+/g, " ").toLowerCase(), row.match.toLowerCase()].join(":");
    const group = groups.get(key); if (group) group.push(row); else groups.set(key, [row]);
  });
  return [...groups.values()].filter(group => group.length > 1);
}
export function parseSavedAudit(text: string | null): AuditData | null {
  try {
    if (!text || text.length > 15000000) return null;
    const value = JSON.parse(text) as AuditData;
    if (value.version !== 1 || typeof value.name !== "string" || value.name.length > 150 || !/^\d{4}-\d{2}-\d{2}$/.test(value.start) || !/^\d{4}-\d{2}-\d{2}$/.test(value.end) || value.start > value.end || !["USD", "GBP", "EUR", "CAD", "AUD", "JPY"].includes(value.currency) || typeof value.importedAt !== "string" || !Array.isArray(value.files) || ![1, 2].includes(value.files.length) || !value.files.every(s => typeof s === "string") || !Array.isArray(value.ads) || value.ads.length > 100000 || !Array.isArray(value.business) || value.business.length > 100000) return null;
    if (!value.ads.every(row => row && ["entity", "type", "campaign", "campaignId", "adGroup", "asin", "sku", "target", "query", "match", "placement", "strategy", "state"].every(k => typeof row[k as keyof AuditAd] === "string") && ["bid", "spend", "sales", "orders", "clicks", "impressions"].every(k => typeof row[k as keyof AuditAd] === "number" && Number.isFinite(row[k as keyof AuditAd]) && Number(row[k as keyof AuditAd]) >= 0) && (row.dailyBudget === undefined || typeof row.dailyBudget === "number" && Number.isFinite(row.dailyBudget) && row.dailyBudget >= 0) && (row.campaignState === undefined || typeof row.campaignState === "string") && (row.targetId === undefined || typeof row.targetId === "string") && (row.keywordId === undefined || typeof row.keywordId === "string") && (row.adGroupId === undefined || typeof row.adGroupId === "string") && (row.targetMetricsAvailable === undefined || typeof row.targetMetricsAvailable === "boolean") && (row.bidAvailable === undefined || typeof row.bidAvailable === "boolean") && (row.placementMetricsAvailable === undefined || typeof row.placementMetricsAvailable === "boolean") && (row.placementBidAdjustment === undefined || typeof row.placementBidAdjustment === "number" && Number.isFinite(row.placementBidAdjustment) && row.placementBidAdjustment >= 0))) return null;
    if (!value.business.every(row => row && /^[A-Z0-9]{10}$/.test(row.asin) && [row.sales, row.orders, row.units, row.sessions].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0))) return null;
    return value;
  } catch { return null; }
}
