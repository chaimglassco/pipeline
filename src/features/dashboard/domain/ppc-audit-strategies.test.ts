import { expect,it } from "vitest";
import type {AuditAd} from "./ppc-audit";
import {BIDDING_STRATEGIES,biddingStrategy,strategyAnalysis} from "./ppc-audit-strategies";
const ad=(v:Partial<AuditAd>={}):AuditAd=>({entity:"campaign",type:"SP",campaign:"Core",campaignId:"1",adGroup:"",asin:"",sku:"",target:"",query:"",match:"",placement:"",strategy:"Dynamic bids - down only",state:"enabled",bid:0,spend:100,sales:500,orders:10,clicks:100,impressions:10000,...v});
it("normalizes reported strategy names and separates absent, unsupported and conflicting settings",()=>{
 expect(biddingStrategy("Dynamic bids - down only")).toBe(BIDDING_STRATEGIES[0]);expect(biddingStrategy("Dynamic bids – up and down")).toBe(BIDDING_STRATEGIES[1]);expect(biddingStrategy("Fixed bids")).toBe(BIDDING_STRATEGIES[2]);expect(biddingStrategy("")).toBe("Not supplied");expect(biddingStrategy("Rule-based bidding")).toBe("Other: Rule-based bidding");
 const d=strategyAnalysis([ad(),ad({entity:"keyword",target:"knife",strategy:"Fixed bids"}),ad({campaignId:"2",strategy:""})]);expect(d.campaigns[0].strategy).toBe("Conflicting strategies");expect(d.campaigns.find(c=>c.id.includes('2'))?.strategy).toBe("Not supplied");
});
it("uses parent totals once and weighted strategy shares instead of adding lower grains",()=>{
 const d=strategyAnalysis([ad(),ad({entity:"keyword",target:"knife",adGroup:"Core",match:"Exact",strategy:"",spend:60,sales:300}),ad({campaignId:"2",strategy:"Fixed bids",spend:50,sales:100,orders:2,clicks:20})]);
 expect(d.portfolio.totals).toMatchObject({spend:150,sales:600,orders:12,clicks:120});expect(d.portfolio.acos).toBe(25);expect(d.groups[0].spendShare).toBeCloseTo(66.6667);expect(d.groups[0].salesShare).toBeCloseTo(83.3333);expect(d.best?.name).toBe(BIDDING_STRATEGIES[0]);
});
it("does not allocate campaign metrics to ASIN, match or placement filters",()=>{
 const rows=[ad(),ad({entity:"productad",asin:"B012345678",strategy:"",spend:40,sales:100,orders:2}),ad({entity:"keyword",target:"knife",match:"Exact",strategy:"",spend:20,sales:50,orders:1})];
 expect(strategyAnalysis(rows,{asin:"B012345678"}).portfolio.totals.spend).toBe(40);expect(strategyAnalysis(rows,{match:"Exact"}).portfolio.totals.spend).toBe(20);expect(strategyAnalysis(rows,{placement:"Top of Search"}).campaigns).toHaveLength(0);expect(strategyAnalysis(rows,{asin:"B099999999"}).campaigns).toHaveLength(0);
});
it("compares explicit placement evidence separately and handles missing placement data",()=>{
 const d=strategyAnalysis([ad(),ad({entity:"biddingadjustment",strategy:"",placement:"Top of Search (First Page)",placementMetricsAvailable:true,spend:30,sales:200,orders:5}),ad({entity:"biddingadjustment",strategy:"",placement:"Product Pages",placementMetricsAvailable:false,spend:0,sales:0,orders:0,clicks:0,impressions:0})]);
 expect(d.portfolio.totals.spend).toBe(100);expect(d.placements.find(p=>p.name==="Top of Search")).toMatchObject({available:true,totals:{spend:30},acos:15});expect(d.placements.find(p=>p.name==="Product Pages")?.available).toBe(false);expect(d.campaigns[0].bestPlacement).toBe("Top of Search");
});
it("marks duplicate and blank evidence unavailable without counting it twice",()=>{
 const d=strategyAnalysis([ad(),ad(),ad({campaignId:"2",strategy:"Fixed bids"})]);expect(d.portfolio.available).toBe(false);expect(d.portfolio.acos).toBeNull();expect(d.groups[0].available).toBe(false);expect(d.groups[2].spendShare).toBeNull();
 const z=strategyAnalysis([ad({entity:"keyword",target:"knife",spend:0,sales:0,orders:0,clicks:0,impressions:0,targetMetricsAvailable:false})]);expect(z.campaigns[0].available).toBe(false);
});
it("retains precision, bounds flagged spend and respects filters and review rules",()=>{
 const rows=[ad({spend:100.25,sales:500.75}),ad({entity:"keyword",target:"knife",match:"Broad",spend:40,sales:0,orders:0,clicks:20,targetMetricsAvailable:true,strategy:""}),ad({campaignId:"2",type:"SB",strategy:"Fixed bids",spend:5,sales:10})];
 const d=strategyAnalysis(rows,{type:"SP"},{acos:15,cvr:8,minSpend:10});expect(d.campaigns).toHaveLength(1);expect(d.portfolio.totals.spend).toBe(100.25);expect(d.campaigns[0].waste).toBe(40);expect(d.groups[0].status).toBe("High ACOS");expect(strategyAnalysis(rows,{minSpend:10}).campaigns).toHaveLength(1);expect(strategyAnalysis(rows,{strategy:"Fixed bids"}).campaigns).toHaveLength(1);
 expect(strategyAnalysis(rows,{search:"nomatch"}).campaigns).toHaveLength(0);
});
it("never invents match or placement evidence from campaign rows",()=>{const d=strategyAnalysis([ad()]);expect(d.matches).toHaveLength(0);expect(d.placements).toHaveLength(0);expect(d.campaigns[0].dailyBudget).toBeNull();});
it("preserves unavailable waste and rejects ambiguous placement copies",()=>{
 const child=ad({entity:"keyword",target:"knife",strategy:"",targetMetricsAvailable:false,spend:0,sales:0,orders:0,clicks:0,impressions:0});expect(strategyAnalysis([ad(),child]).campaigns[0].waste).toBeNull();
 const placement=ad({entity:"biddingadjustment",strategy:"",placement:"Top of Search",placementMetricsAvailable:true,spend:20,sales:100});const d=strategyAnalysis([ad(),placement,placement]);expect(d.placements[0].available).toBe(false);expect(d.campaigns[0].bestPlacement).toBe("—");
});

it("prefers aggregate campaign totals over contextual ASIN copies",()=>{const d=strategyAnalysis([ad(),ad({asin:"B012345678",spend:40,sales:200})]);expect(d.portfolio.totals.spend).toBe(100);expect(strategyAnalysis([ad(),ad({asin:"B012345678",spend:40,sales:200})],{asin:"B012345678"}).portfolio.totals.spend).toBe(40);});
