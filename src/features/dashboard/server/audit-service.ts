import { randomUUID, createHash } from "node:crypto";
import type postgres from "postgres";
import { auditDb, auditWorkspace, requireImport, AuditRequestError } from "./audit-db";
import { reconcileAuditRows, type NormalizedAuditRow, type Issue } from "../domain/cloud-audit";
import { AUDIT_MODULES } from "../domain/ppc-audit";

export async function saveIssues(id:string,generation:number,issues:Issue[]) {
  if(!issues.length)return;
  await auditDb()`insert into ppc_audit_issues ${auditDb()(issues.map(issue=>({import_id:id,generation,issue_key:createHash("sha256").update(JSON.stringify(issue)).digest("hex"),issue:JSON.stringify(issue)})))} on conflict do nothing`;
}
export async function resolveImport(id:string,revision:number,scope:string,source:string,editor:string) {
  const item=await requireImport(id);if(item.status!=="preview_ready")throw new AuditRequestError("Wait for processing to finish.",409);
  const facts=await auditDb()`select fact from ppc_audit_rows where import_id=${id} and generation=${item.generation} and scope=${scope} limit 50001`;
  if(facts.length>50000)throw new AuditRequestError("This overlap is too large to review. Export a smaller reporting period.");
  const result=reconcileAuditRows(facts.map(r=>r.fact as NormalizedAuditRow));
  if(!result.conflicts.some(c=>c.scope===scope&&(source==="exclude"||c.sources.some(s=>s.id===source&&s.selectable))))throw new AuditRequestError("Choose a complete available source for this overlap.");
  await auditDb().begin(async tx=>{
    const changed=await tx`update ppc_audit_imports set revision=revision+1,updated_at=now() where id=${id} and workspace=${auditWorkspace()} and revision=${revision} and status='preview_ready' returning revision`;
    if(!changed.length)throw new AuditRequestError("This review changed in another session. Refresh and try again.",409);
    await tx`insert into ppc_audit_resolutions(import_id,scope,source_id,editor,revision) values(${id},${scope},${source},${editor},${revision+1}) on conflict(import_id,scope) do update set source_id=excluded.source_id,editor=excluded.editor,revision=excluded.revision,created_at=now()`;
  });
}
export async function* reconciledScopes(id:string,generation:number,db:postgres.ISql=auditDb()) {
  const choices=await db`select scope,source_id from ppc_audit_resolutions where import_id=${id}`;
  const resolutions=Object.fromEntries(choices.map(v=>[v.scope,v.source_id]));let after="";
  for(;;){
    const scopes=await db`select distinct scope from ppc_audit_rows where import_id=${id} and generation=${generation} and scope>${after} order by scope limit 50`;
    if(!scopes.length)return;
    for(const {scope} of scopes){
      const facts=await db`select fact from ppc_audit_rows where import_id=${id} and generation=${generation} and scope=${scope} order by id limit 50001`;
      if(facts.length>50000){yield {accepted:[],conflicts:[],excludedRows:facts.length,repeatedRows:0,partial:true};continue;}
      yield reconcileAuditRows(facts.map(v=>v.fact as NormalizedAuditRow),resolutions);
    }
    after=scopes[scopes.length-1].scope;
  }
}
export async function importReview(id:string,conflictPage=0) {
  const item=await requireImport(id);let accepted=0,excluded=0,repeated=0,conflictCount=0,partial=false;
  const conflicts=[];
  if(item.status==="preview_ready")for await(const group of reconciledScopes(id,item.generation)){
    accepted+=group.accepted.length;excluded+=group.excludedRows;repeated+=group.repeatedRows;partial ||= group.partial||group.accepted.some(r=>Object.values(r.metrics).some(v=>v===null));
    for(const conflict of group.conflicts){if(conflictCount>=conflictPage*20&&conflicts.length<20)conflicts.push(conflict);conflictCount++;}
  }
  const issues=await auditDb()`select issue from ppc_audit_issues where import_id=${id} and generation=${item.generation} order by id limit 100`;
  // Storage paths and ownership are deliberately absent from the browser response.
  return {id:item.id,name:item.name,filename:item.filename,status:item.status,generation:item.generation,revision:item.revision,context:item.context,manifest:item.manifest.map(({path:_,...sheet})=>sheet),progress:item.progress,failure:item.failure,rawAvailable:!item.raw_deleted_at,issues:issues.map(v=>v.issue),coverage:{accepted,excluded,repeated,conflictCount,partial},conflicts,conflictPage};
}
export async function publishAudit(id:string,revision:number,editor:string) {
  const item=await requireImport(id);if(item.status!=="preview_ready"||!item.context)throw new AuditRequestError("The import is not ready to use.",409);
  const snapshotId=randomUUID();
  return auditDb().begin(async tx=>{
    const locked=await tx`select revision,generation,status from ppc_audit_imports where id=${id} and workspace=${auditWorkspace()} for update`;
    if(locked[0]?.revision!==revision||locked[0]?.generation!==item.generation||locked[0]?.status!=="preview_ready")throw new AuditRequestError("The review changed. Refresh before using this audit.",409);
    const existing=await tx`select id from ppc_audit_snapshots where import_id=${id} and generation=${item.generation} and revision=${revision}`;
    // Serialize activation across imports as well as repeated clicks.
    await tx`select pg_advisory_xact_lock(hashtext(${auditWorkspace()}))`;
    await tx`update ppc_audit_snapshots set active=false where workspace=${auditWorkspace()} and active`;
    if(existing.length){await tx`update ppc_audit_snapshots set active=true where id=${existing[0].id}`;return existing[0].id as string;}
    await tx`insert into ppc_audit_snapshots(id,workspace,import_id,generation,revision,name,context,coverage,created_by,active) values(${snapshotId},${auditWorkspace()},${id},${item.generation},${revision},${item.name},${tx.json(item.context)},'{}',${editor},true)`;
    let accepted=0,excluded=0,repeated=0,conflicts=0,partial=false;
    for await(const group of reconciledScopes(id,item.generation,tx)){
      accepted+=group.accepted.length;excluded+=group.excludedRows;repeated+=group.repeatedRows;conflicts+=group.conflicts.length;
      partial ||= group.partial||group.accepted.some(r=>Object.values(r.metrics).some(v=>v===null));
      for(let offset=0;offset<group.accepted.length;offset+=500){
        const batch=group.accepted.slice(offset,offset+500).map(row=>({snapshot_id:snapshotId,row_id:row.id,scope:row.scope,source_id:row.sourceId,fact:JSON.stringify(row)}));
        await tx`insert into ppc_audit_snapshot_rows ${tx(batch)}`;
      }
    }
    if(!accepted)throw new AuditRequestError("No accepted metric rows are available yet.");
    await tx`update ppc_audit_snapshots set coverage=${tx.json({accepted,excluded,repeated,conflicts,partial})} where id=${snapshotId}`;
    return snapshotId;
  });
}
export async function auditHistory() {
  const [imports,snapshots]=await Promise.all([
    auditDb()`select id,name,filename,status,created_at from ppc_audit_imports where workspace=${auditWorkspace()} order by created_at desc limit 50`,
    auditDb()`select id,import_id,name,context,coverage,active,created_at from ppc_audit_snapshots where workspace=${auditWorkspace()} order by created_at desc limit 100`,
  ]);return {imports,snapshots};
}
export async function auditSourceRows(id:string,page:number,search:string) {
  const snapshots=await auditDb()`select import_id,generation from ppc_audit_snapshots where id=${id} and workspace=${auditWorkspace()}`;
  if(!snapshots.length)throw new AuditRequestError("Audit not found.",404);
  const item=snapshots[0];
  const rows=await auditDb()`select r.id,r.source_id,r.fact->>'sourceName' source_name,r.fact->>'sourceRow' source_row,r.fact->>'campaignId' campaign_id,r.fact->>'campaign' campaign,r.fact->>'family' family,r.fact->>'grain' grain,r.fact->'context' period,r.fact->>'attribution' attribution,r.fact->'metrics' metrics,
    case when exists(select 1 from ppc_audit_snapshot_rows s where s.snapshot_id=${id} and s.row_id=r.id) then 'Accepted'
    when exists(select 1 from ppc_audit_snapshot_rows s where s.snapshot_id=${id} and md5(s.fact->>'identity')=md5(r.fact->>'identity') and s.fact->>'identity'=r.fact->>'identity' and s.fact->'metrics'=r.fact->'metrics') then 'Identical source reference' else 'Excluded or metadata only' end acceptance
    from ppc_audit_rows r where r.import_id=${item.import_id} and r.generation=${item.generation} and (r.fact->>'campaign' ilike ${`%${search}%`} or r.fact->>'sourceName' ilike ${`%${search}%`}) order by r.id limit 50 offset ${page*50}`;
  return {snapshotId:id,page,pageSize:50,rows};
}
export async function auditModule(id:string,module:string,page:number,search:string) {
  if(!(AUDIT_MODULES as readonly string[]).includes(module))throw new AuditRequestError("Unknown audit module.");
  const snapshots=await auditDb()`select id,name,context,coverage from ppc_audit_snapshots where id=${id} and workspace=${auditWorkspace()}`;
  const snapshot=snapshots[0];if(!snapshot)throw new AuditRequestError("Audit not found.",404);
  // Only allowlisted SQL fragments enter this query. User filters stay parameters.
  const config:Record<string,{grain:string;label:string;having?:string}>={
    "Performance Summary":{grain:"canonical",label:"concat(fact->>'campaign',' · ',fact->>'campaignId')"},
    "Wasted Ad Spend":{grain:"target,query",label:"coalesce(nullif(fact->>'query',''),fact->>'target')",having:"sum(spend)>0 and bool_and(orders is not null) and sum(orders)=0"},
    "Opportunities":{grain:"target,query",label:"coalesce(nullif(fact->>'query',''),fact->>'target')",having:"bool_and(orders is not null) and sum(orders)>0"},
    "Advertised ASIN":{grain:"productad",label:"nullif(fact->>'asin','')"},
    "Campaigns":{grain:"canonical",label:"concat(fact->>'campaign',' · ',fact->>'campaignId')"},
    "Campaign Type":{grain:"canonical",label:"fact->>'product'"},
    "Placement":{grain:"placement",label:"fact->>'placement'"},
    "Keyword Target":{grain:"target",label:"case when fact->>'match'<>'' then fact->>'target' end"},
    "Product Target":{grain:"target",label:"case when fact->>'match'='' then fact->>'target' end"},
    "Search Terms":{grain:"query",label:"fact->>'query'"},
    "Match Type":{grain:"target",label:"nullif(fact->>'match','')"},
    "Brand Terms":{grain:"query",label:"fact->>'query'"},
    "Duplicated Targets":{grain:"target",label:"fact->>'target'",having:"count(distinct fact->>'campaignId')>1"},
    "Bidding Strategy":{grain:"canonical",label:"nullif(fact->>'strategy','')"},
  };
  const rule=config[module];const db=auditDb();
  const grain=rule.grain==="canonical"?"rank=best_rank":rule.grain==="target,query"?"fact->>'grain'=case when exists(select 1 from facts breakdown where breakdown.scope=facts.scope and breakdown.fact->>'grain'='query') then 'query' else 'target' end":`fact->>'grain' in (${rule.grain.split(",").map(v=>`'${v}'`).join(",")})`;
  const base=`with ranked as (select *,case fact->>'grain' when 'campaign' then 1 when 'adgroup' then 2 when 'productad' then 3 when 'target' then 4 when 'query' then 5 else 9 end rank from ppc_audit_snapshot_rows where snapshot_id=$1),
    facts as (select *,min(rank) over(partition by scope) best_rank from ranked),
    chosen as (select *,${rule.label} label,(fact->'metrics'->>'spend')::numeric spend,(fact->'metrics'->>'sales')::numeric sales,(fact->'metrics'->>'orders')::numeric orders,(fact->'metrics'->>'clicks')::numeric clicks,(fact->'metrics'->>'impressions')::numeric impressions from facts where ${grain}),
    groups as (select label,count(*)::int rows,case when bool_and(spend is not null) then sum(spend) end spend,case when bool_and(sales is not null) then sum(sales) end sales,case when bool_and(orders is not null) then sum(orders) end orders,case when bool_and(clicks is not null) then sum(clicks) end clicks,case when bool_and(impressions is not null) then sum(impressions) end impressions from chosen where label is not null and label<>'' and label ilike $2 group by label ${rule.having?`having ${rule.having}`:""})`;
  const [rows,count]=await Promise.all([
    db.unsafe(`${base} select * from groups order by label limit 50 offset $3`,[id,`%${search}%`,page*50]),
    db.unsafe(`${base} select count(*)::int total from groups`,[id,`%${search}%`]),
  ]);
  const totals=await db`with ranked as (select scope,fact,case fact->>'grain' when 'campaign' then 1 when 'adgroup' then 2 when 'productad' then 3 when 'target' then 4 when 'query' then 5 else 9 end rank from ppc_audit_snapshot_rows where snapshot_id=${id}), chosen as(select *,min(rank) over(partition by scope) best from ranked) select
    case when bool_and(fact->'metrics'->>'spend' is not null) then sum((fact->'metrics'->>'spend')::numeric) end spend,
    case when bool_and(fact->'metrics'->>'sales' is not null) then sum((fact->'metrics'->>'sales')::numeric) end sales,
    case when bool_and(fact->'metrics'->>'orders' is not null) then sum((fact->'metrics'->>'orders')::numeric) end orders,
    case when bool_and(fact->'metrics'->>'clicks' is not null) then sum((fact->'metrics'->>'clicks')::numeric) end clicks,
    case when bool_and(fact->'metrics'->>'impressions' is not null) then sum((fact->'metrics'->>'impressions')::numeric) end impressions from chosen where rank=best and rank<9`;
  const metrics=totals[0];const partial=!!snapshot.coverage.partial;
  const ratio=(a:unknown,b:unknown,multiplier:number)=>!partial&&a!==null&&b!==null&&Number(b)>0?Number(a)/Number(b)*multiplier:null;
  return {snapshot,module,page,pageSize:50,total:count[0].total,rows,metrics,ratios:{acos:ratio(metrics.spend,metrics.sales,100),cpc:ratio(metrics.spend,metrics.clicks,1),conversion:ratio(metrics.orders,metrics.clicks,100)},note:module==="Brand Terms"?"Search queries shown. Brand classification requires a configured brand dictionary.":null};
}
