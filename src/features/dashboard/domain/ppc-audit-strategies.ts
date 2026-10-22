import { auditCampaignLevel, auditTargetLevel, auditTotals, auditRate, type AuditAd } from "./ppc-audit";
import { campaignPerformance } from "./ppc-audit-campaigns";
import { canonicalCampaignType } from "./ppc-audit-campaign-types";
import { placementEvidence, placementName, placementFlaggedSpend } from "./ppc-audit-placements";
import { DEFAULT_WASTE_RULES, wasteFindings, type WasteRules } from "./ppc-audit-waste";
export const BIDDING_STRATEGIES = ["Dynamic bids – down only", "Dynamic bids – up and down", "Fixed bids"];
export const DEFAULT_STRATEGY_RULES = { acos: 20, cvr: 8, minSpend: 10 };
export type StrategyRules = typeof DEFAULT_STRATEGY_RULES;
export type StrategyScope = { asin?: string; campaign?: string; type?: string; strategy?: string; match?: string; placement?: string; search?: string; minSpend?: number };
export function biddingStrategy(value: string) {
  const text = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["dynamicbidsdownonly", "dynamicdownonly", "downonly"].includes(text)) return BIDDING_STRATEGIES[0];
  if (["dynamicbidsupanddown", "dynamicupanddown", "upanddown"].includes(text)) return BIDDING_STRATEGIES[1];
  if (["fixedbids", "fixedbid", "fixed"].includes(text)) return BIDDING_STRATEGIES[2];
  return value.trim() ? `Other: ${value.trim()}` : "Not supplied";
}
const identity = (r: AuditAd) => JSON.stringify([r.type,r.campaignId,r.entity,r.adGroupId||r.adGroup,r.asin,r.sku,r.keywordId||r.targetId||r.target,r.query,r.match,r.placement]);
function unique(rows: AuditAd[]) { return new Set(rows.map(identity)).size === rows.length; }
function measured(r: AuditAd) { return r.placement ? r.placementMetricsAvailable ?? [r.spend,r.sales,r.orders,r.clicks,r.impressions].some(v=>v>0) : r.targetMetricsAvailable ?? [r.spend,r.sales,r.orders,r.clicks,r.impressions].some(v=>v>0); }
function evidence(rows: AuditAd[], placement = false) {
  const chosen = placement ? placementEvidence(rows) : rows.some(r=>r.query || r.target) ? auditTargetLevel(rows) : auditCampaignLevel(rows);
  return chosen.length && unique(chosen) && chosen.every(measured) ? chosen : [];
}
function campaignEvidence(rows: AuditAd[]) {
  const chosen=auditCampaignLevel(rows);
  if(chosen.some(r=>r.entity==="campaign")) { const aggregate=chosen.filter(r=>!r.asin&&!r.sku&&!r.adGroup&&!r.target&&!r.query); return aggregate.length?aggregate:chosen; }
  if(chosen.some(r=>r.entity==="adgroup")) {
    const groups=new Map<string,AuditAd[]>();for(const row of chosen){const key=row.adGroupId||row.adGroup;const group=groups.get(key);if(group)group.push(row);else groups.set(key,[row]);}
    return [...groups.values()].flatMap(group=>{const aggregate=group.filter(r=>!r.asin&&!r.sku);return aggregate.length?aggregate:group;});
  }
  return chosen;
}
const sumTotals = (rows: ReturnType<typeof auditTotals>[]) => rows.reduce((sum,row)=>({spend:sum.spend+row.spend,sales:sum.sales+row.sales,orders:sum.orders+row.orders,clicks:sum.clicks+row.clicks,impressions:sum.impressions+row.impressions}),auditTotals([]));
function summary(rows: AuditAd[], wasteRules: WasteRules, rules: StrategyRules) {
  const available = rows.length>0 && rows.every(measured) && unique(rows); const totals=auditTotals(available?rows:[]);
  const acos=available?auditRate(totals.spend,totals.sales):null, cvr=available?auditRate(totals.orders,totals.clicks):null;
  const waste=available?placementFlaggedSpend(rows,wasteRules):null;
  return { available,totals,acos,cvr,waste,ctr:available?auditRate(totals.clicks,totals.impressions):null,cpc:available&&totals.clicks?totals.spend/totals.clicks:null,roas:available&&totals.spend?totals.sales/totals.spend:null,status:!available?"Performance Unavailable":totals.spend<rules.minSpend?"Low Volume":acos!==null&&acos>rules.acos?"High ACOS":cvr!==null&&cvr<rules.cvr?"Low CVR":totals.orders===0?"No Orders":"Healthy" };
}
export function strategyAnalysis(ads: AuditAd[], scope: StrategyScope = {}, rules: StrategyRules = DEFAULT_STRATEGY_RULES, wasteRules: WasteRules = DEFAULT_WASTE_RULES) {
  const campaigns=campaignPerformance(ads).flatMap(c=>{
    const names=[...new Set(c.raw.map(r=>r.strategy).filter(v=>v.trim()).map(biddingStrategy))];const strategy=names.length>1?"Conflicting strategies":names[0]||"Not supplied";
    if(scope.campaign&&scope.campaign!==c.id || scope.type&&scope.type!==canonicalCampaignType(c.type) || scope.strategy&&scope.strategy!==strategy)return [];
    if(scope.search&&![c.name,...c.asins,...c.raw.flatMap(r=>[r.target,r.query,r.adGroup,r.sku])].some(v=>v.toLowerCase().includes(scope.search!.toLowerCase().trim())))return [];
    const raw=c.raw.filter(r=>(!scope.asin||(r.asin||"Unmapped")===scope.asin)&&(!scope.match||r.match===scope.match)&&(!scope.placement||placementName(r.placement)===scope.placement));
    if(!raw.length)return [];
    const selected=scope.placement?evidence(raw,true):scope.asin||scope.match?evidence(raw.filter(r=>!r.placement)):campaignEvidence(raw.filter(r=>!r.placement));
    const perf=summary(selected,wasteRules,rules);
    // Target/query waste is separate from parent totals; never add the hierarchy levels.
    const nonPlacement=raw.filter(r=>!r.placement);const targetBasis=auditTargetLevel(nonPlacement);const wasteBasis=targetBasis.length?targetBasis:campaignEvidence(nonPlacement);const findings=wasteFindings(nonPlacement,wasteRules);const wasteRows=findings.map(f=>f.row);
    const reportedWaste=scope.placement?perf.waste:unique(wasteRows)&&unique(wasteBasis)&&wasteBasis.every(measured)?findings.reduce((n,f)=>n+f.row.spend,0):null;
    const waste=perf.available&&reportedWaste!==null&&reportedWaste<=perf.totals.spend?reportedWaste:null;
    if(scope.minSpend&&(!perf.available||perf.totals.spend<scope.minSpend))return [];
    const placementRows=raw.filter(r=>r.placement);
    const placements=[...new Set(placementRows.map(r=>placementName(r.placement)))].map(name=>({name,...summary(evidence(placementRows.filter(r=>placementName(r.placement)===name),true),wasteRules,rules)}));
    const matches=[...new Set(raw.filter(r=>!r.placement&&r.match&&(r.target||r.query)).map(r=>r.match))].map(name=>({name,...summary(evidence(raw.filter(r=>!r.placement&&r.match===name)),wasteRules,rules)}));
    const best=placements.filter(p=>p.available&&p.totals.sales>0).sort((a,b)=>b.totals.sales-a.totals.sales)[0];
    return [{id:c.id,campaignId:c.raw[0].campaignId,name:c.name,type:canonicalCampaignType(c.type),strategy,asins:[...new Set(raw.map(r=>r.asin).filter(Boolean))],dailyBudget:c.dailyBudget,state:c.state,raw,evidence:perf.available?selected:[],...perf,status:perf.status==="Healthy"&&waste!==null&&waste>0?"Wasted Spend Review":perf.status,waste,placements,matches,bestPlacement:best?.name||"—"}];
  });
  const aggregate=(members:typeof campaigns)=>{
    const base=summary(members.flatMap(c=>c.evidence),wasteRules,rules);const available=members.length>0&&members.every(c=>c.available)&&base.available;
    const waste=available&&members.every(c=>c.waste!==null)?members.reduce((n,c)=>n+(c.waste||0),0):null;
    return {...base,available,status:!available?"Performance Unavailable":base.status==="Healthy"&&waste!==null&&waste>0?"Wasted Spend Review":base.status,acos:available?base.acos:null,cpc:available?base.cpc:null,cvr:available?base.cvr:null,ctr:available?base.ctr:null,roas:available?base.roas:null,waste, campaigns:members};
  };
  const portfolio=aggregate(campaigns);
  const names=[...new Set([...BIDDING_STRATEGIES,...campaigns.map(c=>c.strategy)])];
  const groups=names.map(name=>{const perf=aggregate(campaigns.filter(c=>c.strategy===name));const spendShare=perf.available&&portfolio.available?auditRate(perf.totals.spend,portfolio.totals.spend):null,salesShare=perf.available&&portfolio.available?auditRate(perf.totals.sales,portfolio.totals.sales):null;return {name,...perf,spendShare,salesShare,delta:spendShare!==null&&salesShare!==null?salesShare-spendShare:null};});
  const placements=groups.flatMap(g=>[...new Set(g.campaigns.flatMap(c=>c.placements.map(p=>p.name)))].map(name=>{const parts=g.campaigns.flatMap(c=>c.placements.filter(p=>p.name===name));const available=parts.length>0&&parts.every(p=>p.available);const totals=sumTotals(parts.filter(p=>p.available).map(p=>p.totals));return {name,strategy:g.name,available,totals,acos:available?auditRate(totals.spend,totals.sales):null};}));
  const types=[...new Set(campaigns.map(c=>c.type))].map(name=>({name,...aggregate(campaigns.filter(c=>c.type===name)),strategies:groups.map(g=>({name:g.name,...aggregate(g.campaigns.filter(c=>c.type===name))}))}));
  const matches=[...new Set(campaigns.flatMap(c=>c.matches.map(m=>m.name)))].map(name=>({name,strategies:groups.map(g=>{const parts=g.campaigns.flatMap(c=>c.matches.filter(m=>m.name===name));const available=parts.length>0&&parts.every(p=>p.available),totals=sumTotals(parts.filter(p=>p.available).map(p=>p.totals));return {name:g.name,available,totals,acos:available?auditRate(totals.spend,totals.sales):null};})}));
  const best=groups.filter(g=>g.available&&g.totals.spend>=rules.minSpend&&g.totals.orders>0&&g.acos!==null&&BIDDING_STRATEGIES.includes(g.name)).sort((a,b)=>a.acos!-b.acos!)[0];
  return {campaigns,portfolio,groups,placements,types,matches,best};
}
export type StrategyCampaign = ReturnType<typeof strategyAnalysis>["campaigns"][number];
