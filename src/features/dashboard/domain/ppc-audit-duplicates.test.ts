import { expect, it } from "vitest";
import type { AuditAd } from "./ppc-audit";
import { duplicateGroups } from "./ppc-audit-duplicates";
const ad = (v: Partial<AuditAd> = {}): AuditAd => ({ entity:"keyword",type:"SP",campaign:"Main",campaignId:"1",adGroup:"Core",adGroupId:"g1",keywordId:"k1",asin:"B012345678",sku:"",target:"lead knife",query:"",match:"Exact",placement:"",strategy:"",state:"enabled",bid:1,bidAvailable:true,targetMetricsAvailable:true,spend:40,sales:200,orders:4,clicks:20,impressions:1000,...v });
it("compares distinct occurrences across ASINs without adding queries or placements",()=>{
 const a=ad(), b=ad({campaignId:"2",keywordId:"k2",asin:"B012345679",spend:60,sales:100,bid:1.5});
 const groups=duplicateGroups([a,b,ad({query:"knife"}),ad({placement:"Top of Search"}),ad({entity:"negativekeyword"}),ad({state:"paused"})]);
 expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({totals:{spend:100,sales:300},gap:40,bidGap:0.5,severity:"High"});expect(groups[0].asins).toHaveLength(2);
});
it("never treats repeated source rows as extra occurrences or additive metrics",()=>{
 expect(duplicateGroups([ad(),ad()])).toHaveLength(0);
 const g=duplicateGroups([ad(),ad(),ad({campaignId:"2"})])[0];expect(g.occurrences).toHaveLength(2);expect(g.available).toBe(false);expect(g.acos).toBeNull();expect(g.severity).toBe("Unavailable");
});
it("separates keyword match types and target natures and excludes missing identities",()=>{
 expect(duplicateGroups([ad(),ad({campaignId:"2",match:"Phrase"}),ad({campaignId:""}),ad({adGroup:"",adGroupId:""})])).toHaveLength(0);
 const product=ad({entity:"producttargeting",target:'asin="B012345678"',keywordId:undefined,targetId:"p1"});
 expect(duplicateGroups([product,{...product,campaignId:"2",targetId:"p2"}])[0].kind).toBe("ASIN Target");
});
it("preserves absent metrics and bids and handles zero sales and custom rules",()=>{
 const g=duplicateGroups([ad({sales:0,bidAvailable:false}),ad({campaignId:"2",sales:0})])[0];expect(g.gap).toBeNull();expect(g.bidGap).toBeNull();expect(g.severity).toBe("Review");
 expect(duplicateGroups([ad(),ad({campaignId:"2"})],{minSpend:100,gap:15,bidGap:0.3})[0].severity).toBe("Monitor");
 expect(duplicateGroups([ad({targetMetricsAvailable:false}),ad({campaignId:"2"})])[0].available).toBe(false);
});
