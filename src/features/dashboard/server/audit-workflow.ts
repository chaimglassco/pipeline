import { FatalError } from "workflow";
import { auditDb, checkpoint, requireImport, AuditRequestError } from "./audit-db";
import { stageAuditWorkbook, stagedRows } from "./audit-reader";
import { normalizeAuditRow, validReportContext, type NormalizedAuditRow } from "../domain/cloud-audit";
import { importReview, saveIssues } from "./audit-service";

async function inspect(id:string,generation:number) {
  "use step";
  const item=await requireImport(id);
  if(item.generation!==generation||item.status==="cancelled")throw new FatalError("Import cancelled or superseded.");
  if(item.manifest.length)return;
  await checkpoint(id,generation,"inspecting");
  try{
    const result=await stageAuditWorkbook(id,generation,item.raw_path,item.filename,async sheet=>{
      await checkpoint(id,generation,"classifying",{sheetsRead:Number(sheet.id.replace("sheet-",""))});
    });
    // A checksum prevents duplicate datasets even when a user selects a renamed file.
    const duplicate=await auditDb()`select id,context from ppc_audit_imports where workspace=${item.workspace} and checksum=${result.checksum} and parser_version=${"cloud-audit-2.0.0"} and id<>${id} and status='preview_ready' order by created_at limit 1`;
    if(duplicate.length&&(!item.context||JSON.stringify(item.context)===JSON.stringify(duplicate[0].context))){
      await checkpoint(id,generation,"preview_ready",{duplicateImport:duplicate[0].id});
      await saveIssues(id,generation,[{code:"duplicate_file",severity:"warning",message:"This file already has a completed import. Review the existing import instead of creating another dataset."}]);
      return;
    }
    const context=item.context??(result.period?{start:result.period.start,end:result.period.end,currency:""}:null);
    await auditDb()`update ppc_audit_imports set manifest=${auditDb().json(result.manifest)},checksum=${result.checksum},context=${context?auditDb().json(context):null},progress=progress || ${auditDb().json({totalRows:result.totalRows,dateSource:result.period?.source??"manual dates required"})} where id=${id} and generation=${generation} and status<>'cancelled'`;
    for(const sheet of result.manifest)if(!sheet.family)await saveIssues(id,generation,[{code:"unsupported_sheet",severity:"warning",sourceId:sheet.id,message:`${sheet.name}: no supported metric header signature. This sheet is excluded.`}]);
  }catch(error){if(error instanceof AuditRequestError)throw new FatalError(error.message);throw error;}
}
async function parse(id:string,generation:number) {
  "use step";
  const item=await requireImport(id);
  if(item.progress.duplicateImport)return false;
  if(!item.context||!validReportContext(item.context,new Date().toISOString().slice(0,10))){await checkpoint(id,generation,"awaiting_period");return false;}
  await checkpoint(id,generation,"parsing");let parsed=0;
  try{
    for(const sheet of item.manifest){
      if(!sheet.family)continue;
      let batch:NormalizedAuditRow[]=[];let issues:Parameters<typeof saveIssues>[2]=[];let batchBytes=0;
      const flush=async()=>{
        await checkpoint(id,generation,"parsing",{parsedRows:parsed});
        if(batch.length)await auditDb()`insert into ppc_audit_rows ${auditDb()(batch.map(row=>({import_id:id,generation,id:row.id,scope:row.scope,source_id:row.sourceId,fact:JSON.stringify(row)})))} on conflict(import_id,generation,id) do update set fact=excluded.fact,scope=excluded.scope`;
        await saveIssues(id,generation,issues);batch=[];issues=[];batchBytes=0;
      };
      for await(const raw of stagedRows(sheet.path)){
        if(raw.number<=sheet.headerRow)continue;
        const result=normalizeAuditRow(sheet,raw.values,raw.number,item.context);
        if(result.row){batch.push(result.row);parsed++;batchBytes+=Buffer.byteLength(JSON.stringify(result.row));}issues.push(...result.issues);
        if(batch.length>=500||issues.length>=500||batchBytes>=1024*1024)await flush();
      }
      await flush();
    }
    await checkpoint(id,generation,"validating",{parsedRows:parsed});
    if(!parsed)throw new AuditRequestError("No supported PPC metric rows were found. Review the sheet diagnostics and export format.");
    return true;
  }catch(error){if(error instanceof AuditRequestError)throw new FatalError(error.message);throw error;}
}
async function preparePreview(id:string,generation:number) {
  "use step";
  await checkpoint(id,generation,"reconciling");
  // All source rows remain in Postgres; acceptance is recalculated from decisions.
  await checkpoint(id,generation,"preview_ready");
  const result=await importReview(id);
  await checkpoint(id,generation,"preview_ready",{acceptedRows:result.coverage.accepted,excludedRows:result.coverage.excluded,conflicts:result.coverage.conflictCount});
}
async function failed(id:string,generation:number,message:string) {
  "use step";
  await auditDb()`update ppc_audit_imports set status='failed',failure=${message.slice(0,500)},updated_at=now() where id=${id} and generation=${generation} and status<>'cancelled'`;
  console.warn("ppc-audit-failed",{importId:id,generation});
}
export async function processAuditImport(id:string,generation:number) {
  "use workflow";
  try{await inspect(id,generation);if(await parse(id,generation))await preparePreview(id,generation);}
  catch(error){await failed(id,generation,FatalError.is(error)?error.message:"Processing could not finish. Retry this import.");}
}
