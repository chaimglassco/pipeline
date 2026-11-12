import { randomUUID, timingSafeEqual } from "node:crypto";
import { get, head, del, list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { start, getRun } from "workflow/api";
import { verifyPipelineRequest } from "@/lib/pipeline-auth-server";
import { auditDb, auditWorkspace, cloudAuditsEnabled, requireImport, AuditRequestError } from "@/features/dashboard/server/audit-db";
import { AUDIT_PARSER_VERSION, validReportContext, type ReportContext } from "@/features/dashboard/domain/cloud-audit";
import { auditHistory, auditModule, auditSourceRows, importReview, publishAudit, resolveImport } from "@/features/dashboard/server/audit-service";
import { processAuditImport } from "@/features/dashboard/server/audit-workflow";
import { MAX_AUDIT_FILE } from "@/features/dashboard/server/audit-reader";

export const runtime="nodejs";
export const maxDuration=300;
const headers={"Cache-Control":"no-store"};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
const text=(value:unknown,max=200)=>typeof value==="string"?value.trim().slice(0,max):"";
async function body(request:Request):Promise<Record<string,unknown>> {
  if(Number(request.headers.get("content-length"))>32_768)throw new AuditRequestError("Request is too large.",413);
  const reader=request.body?.getReader();const decoder=new TextDecoder();let value="",bytes=0;
  if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>32_768){await reader.cancel();throw new AuditRequestError("Request is too large.",413);}value+=decoder.decode(chunk.value,{stream:true});}value+=decoder.decode();}finally{reader.releaseLock();}
  try{return JSON.parse(value);}catch{throw new AuditRequestError("Invalid request.");}
}
const page=(value:string|null)=>Math.max(0,Math.min(10000,Number.parseInt(value||"0",10)||0));
async function launch(id:string,revision:number,context?:ReportContext) {
  if(context&&(typeof context!=="object"||!validReportContext(context,new Date().toISOString().slice(0,10))))throw new AuditRequestError("Enter a valid reporting period and currency.");
  const db=auditDb();
  const result=await db`update ppc_audit_imports set generation=generation+1,revision=revision+1,status='queued',failure=null,workflow_id=null,context=coalesce(${context?db.json(context):null},context),updated_at=now()
    where id=${id} and workspace=${auditWorkspace()} and revision=${revision} and status in ('uploading','awaiting_period','failed') and raw_deleted_at is null returning generation`;
  if(!result.length)throw new AuditRequestError("This import is already processing or changed. Refresh its status.",409);
  const generation=result[0].generation;
  try{
    const run=await start(processAuditImport,[id,generation]);
    await db`update ppc_audit_imports set workflow_id=${run.runId} where id=${id} and generation=${generation}`;
  }catch{
    await db`update ppc_audit_imports set status='failed',failure='Could not queue processing. Retry this import.' where id=${id} and generation=${generation} and status='queued'`;
    throw new AuditRequestError("Could not queue processing. Retry this import.",503);
  }
}
async function retention(request:Request) {
  const secret=process.env.CRON_SECRET,token=request.headers.get("authorization")||"";
  const expected=`Bearer ${secret}`;
  if(!secret||Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return json({error:"Unauthorized."},401);
  const expired=await auditDb()`select id,raw_path,manifest from ppc_audit_imports where created_at<now()-interval '30 days' and raw_deleted_at is null and status in ('preview_ready','failed','cancelled','uploading','awaiting_period') limit 100`;
  for(const item of expired){
    let cursor:string|undefined;
    do{const result=await list({prefix:`audits/${item.id}/`,cursor,limit:1000});if(result.blobs.length)await del(result.blobs.map(blob=>blob.url));cursor=result.hasMore?result.cursor:undefined;}while(cursor);
    await auditDb()`update ppc_audit_imports set raw_deleted_at=now() where id=${item.id}`;
  }
  return json({deleted:expired.length});
}
async function handler(request:Request,context:{params:Promise<{path?:string[]}>}) {
  try{
    const parts=(await context.params).path||[];const [id,action]=parts;
    if(id==="maintenance"&&request.method==="GET")return await retention(request);
    const auth=await verifyPipelineRequest(request);if(auth instanceof Response)return auth;
    if(id==="config")return json({enabled:cloudAuditsEnabled(),canEdit:auth.user.role!=="VIEWER",canAdmin:auth.user.role==="ADMIN"});
    if(!cloudAuditsEnabled())return json({error:"Shared audit imports are not enabled yet."},404);
    if(request.method!=="GET"&&auth.user.role==="VIEWER")return json({error:"Editor access is required."},403);
    const url=new URL(request.url);const db=auditDb();
    if(!id&&request.method==="GET")return json(await auditHistory());
    if(!id&&request.method==="POST"){
      const value=await body(request);const filename=text(value.filename,180),key=text(value.idempotencyKey,100);
      if(!/\.(csv|xlsx)$/i.test(filename)||!key||Number(value.size)<=0||Number(value.size)>MAX_AUDIT_FILE)throw new AuditRequestError("Choose a PPC CSV or XLSX file up to 50 MB.");
      const importId=randomUUID(),rawPath=`audits/${importId}/original.${filename.split(".").pop()!.toLowerCase()}`;
      const imports=await db`insert into ppc_audit_imports(id,workspace,owner_email,idempotency_key,name,filename,parser_version,raw_path) values(${importId},${auditWorkspace()},${auth.user.email},${key},${text(value.name)||"Amazon PPC Audit"},${filename},${AUDIT_PARSER_VERSION},${rawPath}) on conflict(workspace,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id,raw_path,status`;
      return json({id:imports[0].id,pathname:imports[0].raw_path,status:imports[0].status},201);
    }
    if(id==="snapshots"&&action){
      if(request.method==="GET"&&url.searchParams.get("sources")==="true")return json(await auditSourceRows(action,page(url.searchParams.get("page")),text(url.searchParams.get("search"),100)));
      if(request.method==="GET")return json(await auditModule(action,url.searchParams.get("module")||"Performance Summary",page(url.searchParams.get("page")),text(url.searchParams.get("search"),100)));
      if(request.method==="POST"){
        const changed=await db.begin(async tx=>{await tx`select pg_advisory_xact_lock(hashtext(${auditWorkspace()}))`;const existing=await tx`select id from ppc_audit_snapshots where id=${action} and workspace=${auditWorkspace()}`;if(!existing.length)throw new AuditRequestError("Audit not found.",404);await tx`update ppc_audit_snapshots set active=false where workspace=${auditWorkspace()} and active`;await tx`update ppc_audit_snapshots set active=true where id=${action}`;return action;});return json({id:changed});
      }
      if(request.method==="DELETE"){
        if(auth.user.role!=="ADMIN")return json({error:"Administrator access is required."},403);
        await db`delete from ppc_audit_snapshots where id=${action} and workspace=${auditWorkspace()}`;return json({deleted:true});
      }
    }
    const item=await requireImport(id);
    if(request.method==="DELETE"&&!action){
      if(auth.user.role!=="ADMIN")return json({error:"Administrator access is required."},403);
      if(!["cancelled","preview_ready","failed","awaiting_period"].includes(item.status))throw new AuditRequestError("Cancel the import before deleting it.",409);
      let cursor:string|undefined;
      do{const artifacts=await list({prefix:`audits/${id}/`,cursor,limit:1000});if(artifacts.blobs.length)await del(artifacts.blobs.map(blob=>blob.url));cursor=artifacts.hasMore?artifacts.cursor:undefined;}while(cursor);
      await db.begin(async tx=>{await tx`select id from ppc_audit_imports where id=${id} for update`;await tx`delete from ppc_audit_snapshots where import_id=${id} and workspace=${auditWorkspace()}`;await tx`delete from ppc_audit_imports where id=${id} and workspace=${auditWorkspace()}`;});
      return json({deleted:true});
    }
    if(request.method==="GET"&&!action)return json(await importReview(id,page(url.searchParams.get("page"))));
    if(action==="upload"&&request.method==="POST"){
      const value=await body(request) as unknown as HandleUploadBody;
      const result=await handleUpload({request,body:value,onBeforeGenerateToken:async pathname=>{
        const current=await requireImport(id);
        if(current.status!=="uploading"||pathname!==current.raw_path)throw new Error("Upload is not available for this import.");
        return {maximumSizeInBytes:MAX_AUDIT_FILE,allowedContentTypes:["text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/octet-stream","application/vnd.ms-excel"],addRandomSuffix:false,allowOverwrite:false,validUntil:Date.now()+15*60*1000,tokenPayload:JSON.stringify({id,workspace:auditWorkspace()})};
      }});return json(result);
    }
    if(action==="raw"&&request.method==="GET"){
      if(auth.user.role==="VIEWER")return json({error:"Editor access is required."},403);
      if(item.raw_deleted_at)throw new AuditRequestError("The original expired after 30 days. Reupload it to reprocess.",410);
      const blob=await get(item.raw_path,{access:"private",useCache:false});if(!blob||blob.statusCode!==200)throw new AuditRequestError("Original file is unavailable.",404);
      return new Response(blob.stream,{headers:{...headers,"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`}});
    }
    const value=await body(request);const revision=Number(value.revision);
    if(!Number.isSafeInteger(revision)||revision<0)throw new AuditRequestError("A current review revision is required.");
    if(["complete","retry","period"].includes(action)&&request.method==="POST"){
      if(item.raw_deleted_at)throw new AuditRequestError("The original expired. Upload the PPC Report again.",410);
      if(item.status==="uploading"){const blob=await head(item.raw_path);if(blob.size>MAX_AUDIT_FILE||!blob.size)throw new AuditRequestError("The upload is empty or exceeds 50 MB.");}
      const report=value.context as ReportContext|undefined;
      await launch(id,revision,report);return json(await importReview(id),202);
    }
    if(action==="review"&&request.method==="POST"){
      await resolveImport(id,revision,text(value.scope,2000),text(value.sourceId,100),auth.user.email);return json(await importReview(id));
    }
    if(action==="cancel"&&request.method==="POST"){
      const changed=await db`update ppc_audit_imports set status='cancelled',generation=generation+1,revision=revision+1,updated_at=now() where id=${id} and revision=${revision} and status not in ('cancelled','preview_ready') returning id`;
      if(!changed.length)throw new AuditRequestError("The import changed. Refresh its status.",409);
      if(item.workflow_id)await getRun(item.workflow_id).cancel().catch(()=>undefined);
      return json(await importReview(id));
    }
    if(action==="publish"&&request.method==="POST")return json({id:await publishAudit(id,revision,auth.user.email)});
    return json({error:"Unknown audit operation."},404);
  }catch(error){
    if(error instanceof AuditRequestError)return json({error:error.message},error.status);
    console.error("ppc-audit-request-failed",{kind:error instanceof Error?error.name:"unknown"});
    return json({error:"The audit service could not finish this request. Please retry."},503);
  }
}
export {handler as GET,handler as POST,handler as DELETE};
