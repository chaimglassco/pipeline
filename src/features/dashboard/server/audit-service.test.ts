import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from "vitest";
import { auditTestSql } from "@/test/audit-postgres";
import { normalizeAuditRow,type SheetManifest } from "../domain/cloud-audit";
import { AUDIT_MODULES } from "../domain/ppc-audit";
import { auditModule,importReview,publishAudit,resolveImport } from "./audit-service";
import { requireImport,checkpoint } from "./audit-db";

const state=vi.hoisted(()=>({sql:null as unknown}));
vi.mock("postgres",()=>({default:()=>state.sql}));
const db=new PGlite();const context={start:"2026-09-01",end:"2026-09-30",currency:"USD"};
const headers=["Entity","Campaign ID","Campaign Name","Ad Group ID","Keyword ID","Keyword Text","Spend","Sales","Orders","Clicks","Impressions"];
const source=(id:string):SheetManifest=>({id,name:id,path:"private",rows:3,headers,headerRow:1,family:"sb-legacy"});
const fact=(id:string,spend="10",entity="Campaign",campaign="123",row=2)=>normalizeAuditRow(source(id),[entity,campaign,"Same name","group","keyword-id",entity==="Keyword"?"lead came":"",spend,"100","2","5","1000"],row,context).row!;
beforeAll(async()=>{
  state.sql=auditTestSql(db);
  vi.stubEnv("DATABASE_URL","postgres://audit-test.invalid/local");
  await db.exec("create role anon; create role authenticated;");
  await db.exec(await readFile("supabase/schema/007_ppc_cloud_audits.sql","utf8"));
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec("truncate ppc_audit_imports cascade");});
async function seed(rows=[fact("a")]) {
  const id=randomUUID();await db.query("insert into ppc_audit_imports(id,workspace,owner_email,idempotency_key,name,filename,status,generation,parser_version,raw_path,context) values($1,'glassco','editor@example.com',$3,'Test Audit','bulk.xlsx','preview_ready',1,'v2','private',$2)",[id,JSON.stringify(context),id]);
  for(const row of rows)await db.query("insert into ppc_audit_rows(import_id,generation,id,scope,source_id,fact) values($1,1,$2,$3,$4,$5)",[id,row.id,row.scope,row.sourceId,JSON.stringify(row)]);
  return id;
}
describe("PostgreSQL audit service",()=>{
  it("applies the additive schema and rejects cross-workspace access",async()=>{const id=await seed();await expect(requireImport(id,"another-team")).rejects.toThrow("not found");expect((await requireImport(id)).workspace).toBe("glassco");});
  it("publishes once and queries all fourteen modules from the same immutable snapshot",async()=>{const id=await seed([fact("a"),fact("a","10","Keyword","123",3)]);const snapshot=await publishAudit(id,0,"editor");expect(await publishAudit(id,0,"editor")).toBe(snapshot);for(const auditModuleName of AUDIT_MODULES){const result=await auditModule(snapshot,auditModuleName,0,"");expect(result.snapshot.id).toBe(snapshot);expect(Number(result.metrics.spend)).toBe(10);}const stored=await db.query("select count(*)::int total from ppc_audit_snapshots");expect(stored.rows).toEqual([{total:1}]);});
  it("prevents stale decisions and publishes selected complete source",async()=>{const a=fact("a"),id=await seed([a,fact("b","20")]);expect((await importReview(id)).coverage.conflictCount).toBe(1);await resolveImport(id,0,a.scope,"b","editor");await expect(resolveImport(id,0,a.scope,"a","editor")).rejects.toThrow("another session");await expect(publishAudit(id,0,"editor")).rejects.toThrow("review changed");const snapshot=await publishAudit(id,1,"editor");const data=await auditModule(snapshot,"Performance Summary",0,"");expect(Number(data.metrics.spend)).toBe(20);});
  it("excludes ambiguous scopes and suppresses ratios on partial snapshots",async()=>{const id=await seed([fact("a"),fact("b","20"),fact("c","5","Campaign","other")]);const snapshot=await publishAudit(id,0,"editor");const data=await auditModule(snapshot,"Performance Summary",0,"");expect(Number(data.metrics.spend)).toBe(5);expect(data.ratios.acos).toBeNull();expect(data.snapshot.coverage.partial).toBe(true);});
  it("does not combine target and query grains in opportunity totals",async()=>{const target=fact("a","10","Keyword"),query={...target,id:"a:3",grain:"query" as const,query:"search text",identity:"query"};const id=await seed([target,query]);const snapshot=await publishAudit(id,0,"editor");const data=await auditModule(snapshot,"Opportunities",0,"");expect(data.total).toBe(1);expect(Number(data.rows[0].spend)).toBe(10);});
  it("keeps a previously selected snapshot active if a new publish fails",async()=>{const first=await publishAudit(await seed(),0,"editor");const bad=await seed([fact("a"),fact("b","20")]);await expect(publishAudit(bad,0,"editor")).rejects.toThrow("No accepted");const active=await db.query("select id from ppc_audit_snapshots where active");expect(active.rows).toEqual([{id:first}]);});
  it("fences late jobs after cancellation",async()=>{const id=await seed();await db.query("update ppc_audit_imports set status='cancelled',generation=2 where id=$1",[id]);await expect(checkpoint(id,1,"preview_ready")).rejects.toThrow("cancelled");await expect(publishAudit(id,0,"editor")).rejects.toThrow("not ready");});
  it("keeps blank metrics null in SQL sums and ratios",async()=>{const row=fact("a");row.metrics.sales=null;const snapshot=await publishAudit(await seed([row]),0,"editor");const data=await auditModule(snapshot,"Campaigns",0,"");expect(data.metrics.sales).toBeNull();expect(data.ratios.acos).toBeNull();});
});
