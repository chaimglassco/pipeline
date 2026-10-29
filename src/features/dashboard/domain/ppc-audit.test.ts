import { describe, expect, it, vi } from "vitest";
import { auditCampaignLevel, auditDuplicates, auditRate, auditTargetLevel, auditTotals, mapAuditAsins, parseAuditAds, parseAuditBusiness, parseAuditCsv, parseSavedAudit } from "./ppc-audit";
const headers = ["Product", "Entity", "Campaign ID", "Campaign Name", "Ad Group Name", "ASIN", "Keyword Text", "Match Type", "Spend", "Sales", "Orders", "Clicks", "Impressions"];
const campaign = ["Sponsored Products", "Campaign", "1", "Main", "", "", "", "", "20", "100", "4", "10", "1000"];
const keyword = ["Sponsored Products", "Keyword", "1", "Main", "Group", "B012345678", "lead came", "Exact", "20", "100", "4", "10", "1000"];
const sheet = (rows: string[][]) => [{ name: "Sponsored Products Campaigns", rows: [headers, ...rows] }];
describe("uploaded PPC audit", () => {
  it("parses quoted CSVs without executing spreadsheet text", () => {
    expect(parseAuditCsv('A,B\r\n"hello, world","a""b"\r\n')).toEqual([["A", "B"], ["hello, world", 'a"b']]);
    expect(() => parseAuditCsv('"unclosed')).toThrow("unclosed");
  });
  it("avoids summing campaign and keyword copies of the same spend", () => {
    const ads = parseAuditAds(sheet([campaign, keyword]));
    expect(auditTotals(auditCampaignLevel(ads))).toMatchObject({ spend: 20, sales: 100, orders: 4 });
    expect(auditTargetLevel(ads)).toHaveLength(1);
  });
  it("does not double count queries and parent targets in risk findings", () => {
    const ads = parseAuditAds(sheet([campaign, keyword]));
    const query = { ...ads[1], query: "lead came search", entity: "searchterm", target: "" };
    expect(auditTargetLevel([...ads, query])).toEqual([query]);
  });
  it("rejects overlapping imports, missing metrics and invalid numbers", () => {
    expect(parseAuditAds(sheet([keyword, keyword]))).toHaveLength(1);
    const conflicting = [...keyword]; conflicting[8] = "25";
    expect(() => parseAuditAds(sheet([keyword, conflicting]))).toThrow("Conflicting");
    expect(() => parseAuditAds([{ name: "test", rows: [["Spend", "Clicks", "Impressions"], ["1", "2", "3"]] }])).toThrow("Missing");
    const invalid = [...keyword]; invalid[8] = "not a number";
    expect(() => parseAuditAds(sheet([invalid]))).toThrow("Invalid number");
  });
  it("uses child ASIN business sales and rejects duplicate child rows", () => {
    const business = [{ name: "business", rows: [["(Child) ASIN", "Ordered Product Sales", "Total Order Items", "Units Ordered", "Sessions - Total"], ["B012345678", "$500.00", "10", "12", "200"]] }];
    expect(parseAuditBusiness(business)).toEqual([{ asin: "B012345678", sales: 500, orders: 10, units: 12, sessions: 200 }]);
    business[0].rows.push(business[0].rows[1]);
    expect(() => parseAuditBusiness(business)).toThrow("one row");
  });
  it("requires the same match type and product scope for duplicate candidates", () => {
    const rows = parseAuditAds(sheet([keyword]));
    expect(auditDuplicates([rows[0], { ...rows[0], campaign: "Other" }])).toHaveLength(1);
    expect(auditDuplicates([rows[0], { ...rows[0], match: "Broad" }])).toHaveLength(0);
    expect(auditDuplicates([rows[0], { ...rows[0], asin: "B012345679" }])).toHaveLength(0);
  });
  it("preserves zeros, undefined ratios and rejects corrupt persisted data", () => {
    expect(auditRate(0, 100)).toBe(0);
    expect(auditRate(20, 0)).toBeNull();
    expect(parseSavedAudit('{"version":1}')).toBeNull();
  });
  it("maps a target only when its ad group has one product", () => {
    const row = parseAuditAds(sheet([keyword]))[0];
    const target = { ...row, asin: "" };
    const product = { ...row, entity: "productad", target: "" };
    expect(mapAuditAsins([product, target], [])[1].asin).toBe("B012345678");
    expect(mapAuditAsins([product, { ...product, asin: "B012345679" }, target], [])[2].asin).toBe("");
  });
});

it("skips identical campaign rows across sheets without inflating totals",()=>{
  const repeated=vi.fn();
  const sheets=sheet([campaign,campaign]);
  const rows=parseAuditAds([...sheets,{...sheets[0],name:"Copy"}],repeated);
  expect(rows).toHaveLength(1);expect(repeated).toHaveBeenCalledTimes(3);
  expect(auditTotals(auditCampaignLevel(rows))).toMatchObject({spend:20,sales:100,orders:4});
});
it("uses informational campaign IDs rather than merging campaigns with the same name",()=>{
  const columns=[...headers];columns[2]="Campaign ID (Informational only)";
  const second=[...campaign];second[2]="2";
  const rows=parseAuditAds([{name:"Sponsored Brands",rows:[columns,campaign,second]}]);
  expect(rows.map(r=>r.campaignId)).toEqual(["1","2"]);
  expect(auditTotals(auditCampaignLevel(rows)).spend).toBe(40);
});
it("does not discard different source segments with equal parsed metrics",()=>{
  expect(()=>parseAuditAds([{name:"Sponsored Brands",rows:[[...headers,"Creative ID"],[...campaign,"creative-1"],[...campaign,"creative-2"]]}])).toThrow("Conflicting");
});
