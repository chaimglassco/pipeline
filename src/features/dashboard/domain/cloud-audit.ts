export const AUDIT_PARSER_VERSION = "cloud-audit-2.0.0";
export const AUDIT_ADAPTER_VERSIONS = {sp:1,"sb-legacy":1,"sb-multi":1,sd:1,mixed:1} as const;
export const AUDIT_METRICS = ["spend", "sales", "orders", "clicks", "impressions"] as const;
export type AuditMetric = typeof AUDIT_METRICS[number];
export type Metrics = Record<AuditMetric, number | null>;
export type ImportStage = "uploading" | "queued" | "inspecting" | "classifying" | "awaiting_period" | "parsing" | "validating" | "reconciling" | "preview_ready" | "failed" | "cancelled";
export type Grain = "campaign" | "adgroup" | "productad" | "target" | "query" | "placement" | "configuration";
export type ReportFamily = "sp" | "sb-legacy" | "sb-multi" | "sd" | "mixed";
export type Issue = { code: string; severity: "warning" | "error"; message: string; sourceId?: string; row?: number; scope?: string };
export type SheetManifest = { id: string; name: string; path: string; rows: number; headers: string[]; headerRow: number; family: ReportFamily | null };
export type ReportContext = { start: string; end: string; currency: string };
export type NormalizedAuditRow = {
  kind: "metadata" | "metric";
  id: string; sourceId: string; sourceName: string; sourceRow: number; family: ReportFamily;
  product: "SP" | "SB" | "SD"; grain: Grain; campaignId: string; campaign: string;
  adGroupId: string; adGroup: string; entityId: string; asin: string; sku: string;
  target: string; query: string; match: string; placement: string; strategy: string; state: string;
  bid: number | null; dailyBudget: number | null; metrics: Metrics; attribution: string;
  scope: string; identity: string; valid: boolean; context: ReportContext;
};
export type Conflict = { scope: string; campaign: string; sources: {id: string; name: string; rows: number; selectable: boolean; metrics:Metrics; grains:Grain[]}[] };
export type Reconciliation = { accepted: NormalizedAuditRow[]; conflicts: Conflict[]; excludedRows: number; repeatedRows: number; partial: boolean };
export const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const emptyMetrics = (): Metrics => ({spend:null,sales:null,orders:null,clicks:null,impressions:null});
export function validAuditDate(value: string) { const d=new Date(`${value}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value; }
export function validReportContext(value: ReportContext, today: string) { return validAuditDate(value.start)&&validAuditDate(value.end)&&value.start<=value.end&&value.end<=today&&["USD","GBP","EUR","CAD","AUD","JPY"].includes(value.currency); }

export function classifyAuditSheet(name: string, headers: string[]): ReportFamily | null {
  const h=new Set(headers.map(normalizeHeader));
  if (!h.has("spend") || !["campaignid","campaignidinformationalonly","campaignname","campaignnameinformationalonly"].some(k=>h.has(k))) return null;
  if (/sb.*multi.*ad.?group|sponsored.*brand.*multi/i.test(name)) return "sb-multi";
  if (/sponsored.?brand|^sb\b/i.test(name)) return "sb-legacy";
  if (/sponsored.?display|^sd\b/i.test(name)) return "sd";
  if (/sponsored.?product|^sp\b/i.test(name)) return "sp";
  return h.has("product")||h.has("adproduct")||h.has("campaigntype") ? "mixed" : null;
}
export function findAuditHeaders(row: string[]) { const h=row.map(normalizeHeader);return h.includes("spend")&&h.some(k=>["campaignid","campaignidinformationalonly","campaignname","campaignnameinformationalonly"].includes(k)); }
function numeric(value: string): number | null {
  if (!value || ["-","—","--"].includes(value)) return null;
  const clean=value.replace(/[$£€¥,\s%]/g,"");
  return /^\d+(\.\d+)?$/.test(clean)&&Number.isFinite(Number(clean)) ? Number(clean) : null;
}
export function normalizeAuditRow(sheet: SheetManifest, raw: string[], sourceRow: number, context: ReportContext): { row: NormalizedAuditRow | null; issues: Issue[] } {
  if (!sheet.family || !raw.some(v=>v.trim())) return {row:null,issues:[]};
  const fields=new Map(sheet.headers.map((h,i)=>[normalizeHeader(h),raw[i]?.trim()||""]));
  const get=(...keys:string[])=>keys.map(normalizeHeader).map(k=>fields.get(k)).find(v=>v)||"";
  const issues:Issue[]=[];
  const issue=(code:string,message:string)=>issues.push({code,message,severity:"warning",sourceId:sheet.id,row:sourceRow});
  const campaignId=get("Campaign ID","Campaign ID (Informational only)");
  const query=get("Customer Search Term","Search Term","Search Query"), placement=get("Placement");
  const entity=normalizeHeader(get("Entity"));
  const target=get("Keyword Text","Product Targeting Expression","Targeting");
  const productText=get("Product","Ad Product","Campaign Type");
  const product=/^(sd|sponsored.?display)$/i.test(productText)||sheet.family==="sd"?"SD":/^(sb|sponsored.?brands?)$/i.test(productText)||sheet.family.startsWith("sb")?"SB":"SP";
  const grain:Grain=query?"query":placement?"placement":entity==="campaign"?"campaign":entity==="adgroup"?"adgroup":entity==="productad"?"productad":target?"target":"configuration";
  const adGroupId=get("Ad Group ID","Ad Group ID (Informational only)");
  const entityId=grain==="campaign"?campaignId:grain==="adgroup"?adGroupId:get("Keyword ID","Product Targeting ID","Targeting ID","Ad ID","Product Ad ID");
  const metrics=emptyMetrics(); const attributionWindows=new Set<string>();
  const aliases:Record<AuditMetric,string[]>={spend:["Spend"],sales:["Sales","7 Day Total Sales","14 Day Total Sales","14 Day Total Sales (attributed)"],orders:["Orders","7 Day Total Orders","14 Day Total Orders","14 Day Total Orders (attributed)"],clicks:["Clicks"],impressions:["Impressions"]};
  for(const metric of AUDIT_METRICS){
    const values=aliases[metric].filter(key=>get(key)).map(key=>({key,value:numeric(get(key))}));
    if(values.length>1&&new Set(values.map(v=>v.value)).size>1) issue("ambiguous_metric",`${metric} has multiple different reported values.`);
    const value=values[0]; metrics[metric]=value?.value??null;
    if(value&&value.value===null) issue("invalid_metric",`${metric} is not a supported non-negative number.`);
    if(["orders","clicks","impressions"].includes(metric)&&metrics[metric]!==null&&!Number.isSafeInteger(metrics[metric])) {metrics[metric]=null;issue("invalid_count",`${metric} must be a whole number.`);}
    if(value&&/^(7|14) /.test(value.key)) attributionWindows.add(value.key.slice(0,2).trim());
  }
  if(attributionWindows.size>1) issue("mixed_attribution","Sales and orders use different attribution windows.");
  const attribution=attributionWindows.size===1?`${[...attributionWindows][0]}d`:"reported";
  const dateValue=get("Report Date","Date");
  const usDate=dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const explicitDate=usDate?`${usDate[3]}-${usDate[1].padStart(2,"0")}-${usDate[2].padStart(2,"0")}`:dateValue;
  const rowContext=dateValue&&validAuditDate(explicitDate)?{...context,start:explicitDate,end:explicitDate}:context;
  if(dateValue&&(!validAuditDate(explicitDate)||explicitDate<context.start||explicitDate>context.end))issue("invalid_report_date","The daily report date is invalid or outside the selected reporting period.");
  if(!campaignId) issue("missing_campaign_id","Campaign ID is missing; the campaign name is not used as an ID.");
  if(!entity || !["campaign","adgroup","productad","keyword","producttargeting","target","biddingadjustment"].includes(entity)) {
    if(!query&&!placement) issue("unsupported_entity","This entity is retained for review but not included in metrics.");
  }
  if(["adgroup","productad","target","query"].includes(grain)&&!adGroupId) issue("missing_adgroup_id","Ad Group ID is missing.");
  if(["productad","target"].includes(grain)&&!entityId) issue("missing_entity_id","The ad or target identifier is missing.");
  const asin=get("ASIN","Advertised ASIN","ASIN (Informational only)").toUpperCase();
  if(asin&&!/^[A-Z0-9]{10}$/.test(asin)) issue("invalid_asin","Advertised ASIN is invalid.");
  const reportedCurrency=get("Currency");
  if(reportedCurrency&&reportedCurrency.toUpperCase()!==context.currency)issue("currency_mismatch","The row currency differs from the selected report currency.");
  const scope=JSON.stringify([product,campaignId,context.start,context.end,context.currency]);
  const identity=JSON.stringify([grain,campaignId,adGroupId,entityId,query,placement,attribution,rowContext.start,rowContext.end]);
  const blocking=new Set(["missing_campaign_id","missing_adgroup_id","missing_entity_id","unsupported_entity","invalid_asin","mixed_attribution","ambiguous_metric","currency_mismatch","invalid_report_date"]);
  const row:NormalizedAuditRow={kind:Object.values(metrics).some(v=>v!==null)?"metric":"metadata",id:`${sheet.id}:${sourceRow}`,sourceId:sheet.id,sourceName:sheet.name,sourceRow,family:sheet.family,product,grain,campaignId,campaign:get("Campaign Name","Campaign Name (Informational only)")||campaignId,adGroupId,adGroup:get("Ad Group Name","Ad Group Name (Informational only)"),entityId,asin,sku:get("SKU","SKU (Informational only)"),target,query,match:get("Match Type"),placement,strategy:get("Bidding Strategy"),state:get("State","Status"),bid:numeric(get("Bid")),dailyBudget:numeric(get("Campaign Daily Budget","Daily Budget")),metrics,attribution,scope,identity,valid:!issues.some(v=>blocking.has(v.code))&&grain!=="configuration",context:rowContext};
  return {row,issues:issues.map(v=>({...v,scope}))};
}
export function reconcileAuditRows(rows: NormalizedAuditRow[], resolutions: Record<string,string> = {}): Reconciliation {
  const metricRows=rows.filter(r=>r.kind==="metric");
  const scopes=new Map<string,NormalizedAuditRow[]>();
  for(const row of metricRows){const group=scopes.get(row.scope)||[];group.push(row);scopes.set(row.scope,group);}
  const accepted:NormalizedAuditRow[]=[],conflicts:Conflict[]=[];let repeatedRows=0;
  for(const [scope,group] of scopes){
    const sources=new Map<string,NormalizedAuditRow[]>();
    for(const row of group){const list=sources.get(row.sourceId)||[];list.push(row);sources.set(row.sourceId,list);}
    const candidates=[...sources].map(([id,members])=>{
      const unique=new Map<string,NormalizedAuditRow>();let conflict=false;
      for(const row of members){if(!row.valid)continue;const previous=unique.get(row.identity);if(previous){if(JSON.stringify(previous.metrics)!==JSON.stringify(row.metrics))conflict=true;else repeatedRows++;}else unique.set(row.identity,row);}
      const facts=[...unique.values()];return {id,name:members[0].sourceName,rows:facts,selectable:!conflict&&facts.length>0,fingerprint:JSON.stringify(facts.map(r=>[r.identity,r.metrics]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))};
    });
    const chosen=resolutions[scope];
    if(chosen==="exclude")continue;
    if(chosen){const candidate=candidates.find(c=>c.id===chosen&&c.selectable);if(candidate){accepted.push(...candidate.rows);continue;}}
    if(candidates.length===1&&candidates[0].selectable){accepted.push(...candidates[0].rows);continue;}
    const allFacts=candidates.flatMap(c=>c.rows);
    const union=new Map<string,NormalizedAuditRow>();let disagree=false,overlapRepeats=0;
    for(const fact of allFacts){const previous=union.get(fact.identity);if(previous){if(JSON.stringify(previous.metrics)!==JSON.stringify(fact.metrics))disagree=true;else overlapRepeats++;}else union.set(fact.identity,fact);}
    // Compatible breakdowns remain queryable, but canonical totals select one
    // aggregation grain. Different attribution windows require a source choice.
    if(candidates.every(c=>c.selectable)&&!disagree&&new Set(allFacts.map(r=>r.attribution)).size===1){accepted.push(...union.values());repeatedRows+=overlapRepeats;continue;}
    if(candidates.every(c=>c.selectable&&c.fingerprint===candidates[0].fingerprint)){accepted.push(...candidates[0].rows);repeatedRows+=candidates.slice(1).reduce((n,c)=>n+c.rows.length,0);continue;}
    if(candidates.some(c=>c.rows.length)) conflicts.push({scope,campaign:group[0].campaign,sources:candidates.map(c=>({id:c.id,name:c.name,rows:c.rows.length,selectable:c.selectable,metrics:sumAuditMetrics(selectAuditMetricGrain(c.rows)),grains:[...new Set(c.rows.map(r=>r.grain))]}))});
  }
  const excludedRows=Math.max(0,metricRows.length-accepted.length-repeatedRows);
  return {accepted,conflicts,excludedRows,repeatedRows,partial:excludedRows>0||conflicts.length>0||accepted.some(r=>Object.values(r.metrics).some(v=>v===null))};
}
export function selectAuditMetricGrain(rows: NormalizedAuditRow[]): NormalizedAuditRow[] {
  const scopes=new Map<string,NormalizedAuditRow[]>();for(const row of rows){const list=scopes.get(row.scope)||[];list.push(row);scopes.set(row.scope,list);}
  return [...scopes.values()].flatMap(group=>{for(const grain of ["campaign","adgroup","productad","target","query"]){const selected=group.filter(r=>r.grain===grain);if(selected.length)return selected;}return [];});
}
export function sumAuditMetrics(rows: NormalizedAuditRow[]): Metrics {
  const totals=emptyMetrics();for(const key of AUDIT_METRICS){totals[key]=rows.length&&rows.every(r=>r.metrics[key]!==null)?rows.reduce((n,r)=>n+r.metrics[key]!,0):null;}return totals;
}
