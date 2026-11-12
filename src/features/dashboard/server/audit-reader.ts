import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { get, put } from "@vercel/blob";
import { classifyAuditSheet, findAuditHeaders, type SheetManifest } from "../domain/cloud-audit";
import { detectAuditReportPeriod } from "../domain/audit-report-period";
import { AuditRequestError } from "./audit-db";

export const MAX_AUDIT_FILE = 50 * 1024 * 1024;
export const AUDIT_LIMITS = { rows: 500_000, sheetRows: 100_000, columns: 300, cells: 5_000_000, expandedBytes: 250*1024*1024, entries: 1000, cellChars: 32_768 };
export async function inspectZip(path: string) {
  await new Promise<void>((resolve,reject)=>yauzl.open(path,{lazyEntries:true,autoClose:true},(error,zip)=>{
    if(error||!zip) {reject(new AuditRequestError("The XLSX archive could not be read."));return;}
    let bytes=0,entries=0; let stopped=false;
    const fail=(message:string)=>{if(stopped)return;stopped=true;zip.close();reject(new AuditRequestError(message));};
    zip.on("error",()=>fail("The XLSX archive is damaged."));
    zip.on("entry",entry=>{
      bytes+=entry.uncompressedSize;entries++;
      if(bytes>AUDIT_LIMITS.expandedBytes||entries>AUDIT_LIMITS.entries||(/sharedStrings\.xml$|styles\.xml$/i.test(entry.fileName)&&entry.uncompressedSize>32*1024*1024)||entry.fileName.includes("..")||entry.fileName.startsWith("/")||(entry.generalPurposeBitFlag&1)) {fail("The workbook exceeds safe archive limits or contains encrypted entries.");return;}
      zip.readEntry();
    });
    zip.on("end",()=>{if(!stopped)resolve();});zip.readEntry();
  }));
}
// Incremental CSV decoder: quoted fields can span chunks and physical lines.
export async function* csvRows(stream: AsyncIterable<Buffer | string>): AsyncGenerator<string[]> {
  let field="",row:string[]=[],quoted=false,pendingQuote=false,skipLf=false;
  const decoder=new TextDecoder();
  for await(const chunk of stream){
    const text=typeof chunk==="string"?chunk:decoder.decode(chunk,{stream:true});
    for(const char of text){
      if(skipLf){skipLf=false;if(char==="\n")continue;}
      if(pendingQuote){pendingQuote=false;if(char==='"'){field+='"';continue;}quoted=false;if(![",","\n","\r"].includes(char))throw new AuditRequestError("The CSV has malformed quoted values.");}
      if(quoted){if(char==='"')pendingQuote=true;else field+=char;}
      else if(char==='"'){if(field)throw new AuditRequestError("The CSV has malformed quoted values.");quoted=true;}
      else if(char===","){row.push(field);field="";}
      else if(char==="\n"||char==="\r"){row.push(field);yield row;row=[];field="";skipLf=char==="\r";}
      else field+=char;
      if(field.length>AUDIT_LIMITS.cellChars||row.length>AUDIT_LIMITS.columns)throw new AuditRequestError("The report exceeds cell or column limits.");
    }
  }
  if(quoted&&!pendingQuote)throw new AuditRequestError("The CSV has an unfinished quoted value.");
  if(field||row.length){row.push(field);yield row;}
}
function cellText(value: ExcelJS.CellValue): string {
  if(value===null||value===undefined)return "";
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==="object"){
    if("formula" in value||"sharedFormula" in value)throw new AuditRequestError("Export values rather than spreadsheet formulas before importing.");
    if("richText" in value)return value.richText.map(v=>v.text).join("");
    if("text" in value)return String(value.text);
    throw new AuditRequestError("The workbook contains unsupported cell values.");
  }
  return String(value);
}
export async function stageAuditWorkbook(id: string, generation: number, rawPath: string, filename: string, onSheet: (manifest: SheetManifest)=>Promise<void>) {
  const directory=await mkdtemp(join(tmpdir(),"ppc-audit-"));const input=join(directory,"input");
  const hash=createHash("sha256");let bytes=0,totalRows=0,cells=0,stagedBytes=0;
  const metadata:{name:string;rows:string[][]}[]=[];const manifest:SheetManifest[]=[];
  try{
    const blob=await get(rawPath,{access:"private",useCache:false});
    if(!blob||blob.statusCode!==200)throw new AuditRequestError("Original file is unavailable. Upload it again.");
    const rawStream=blob.stream;
    async function* bounded(){for await(const chunk of Readable.fromWeb(rawStream as import("node:stream/web").ReadableStream<Uint8Array>)){bytes+=chunk.length;if(bytes>MAX_AUDIT_FILE)throw new AuditRequestError("PPC files must be 50 MB or smaller.");hash.update(chunk);yield chunk;}}
    await pipeline(Readable.from(bounded()),createWriteStream(input));
    if(!(await stat(input)).size)throw new AuditRequestError("The file is empty.");
    if(/\.xlsx$/i.test(filename))await inspectZip(input);
    const consume=async(name:string,rows:AsyncIterable<{number:number;values:string[]}>)=>{
      const sheet:SheetManifest={id:`sheet-${manifest.length+1}`,name,path:`audits/${id}/stage-${generation}/sheet-${manifest.length+1}.ndjson`,rows:0,headers:[],headerRow:0,family:null};
      const output=join(directory,`${sheet.id}.ndjson`),writer=createWriteStream(output);
      const preamble:string[][]=[];
      try{
        for await(const item of rows){
          const values=item.values;
          if(process.memoryUsage().rss>768*1024*1024)throw new AuditRequestError("The workbook exceeds the processing memory limit. Export a smaller reporting period.");
          if(++totalRows>AUDIT_LIMITS.rows||++sheet.rows>AUDIT_LIMITS.sheetRows||(cells+=values.length)>AUDIT_LIMITS.cells||values.length>AUDIT_LIMITS.columns||values.some(v=>v.length>AUDIT_LIMITS.cellChars))throw new AuditRequestError("The report exceeds safe processing limits. Export a smaller reporting period.");
          if(preamble.length<50)preamble.push(values);
          if(!sheet.headerRow&&findAuditHeaders(values)){sheet.headerRow=item.number;sheet.headers=values;sheet.family=classifyAuditSheet(name,values);}
          const encoded=JSON.stringify({number:item.number,values})+"\n";
          stagedBytes+=Buffer.byteLength(encoded);
          if(stagedBytes>AUDIT_LIMITS.expandedBytes||Buffer.byteLength(encoded)>1024*1024)throw new AuditRequestError("The expanded report exceeds safe processing limits. Export a smaller period.");
          if(!writer.write(encoded))await once(writer,"drain");
        }
        writer.end();await once(writer,"finish");
      }catch(error){writer.destroy();throw error;}
      await put(sheet.path,createReadStream(output),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/x-ndjson"});
      metadata.push({name,rows:preamble});manifest.push(sheet);await onSheet(sheet);
    };
    if(/\.csv$/i.test(filename)){
      async function* rows(){let number=0;for await(const values of csvRows(createReadStream(input)))yield {number:++number,values};}
      await consume(filename,rows());
    }else if(/\.xlsx$/i.test(filename)){
      const workbook=new ExcelJS.stream.xlsx.WorkbookReader(input,{sharedStrings:"cache",hyperlinks:"ignore",styles:"cache",worksheets:"emit"});
      for await(const worksheet of workbook){
        async function* rows(){for await(const row of worksheet){const values=Array.isArray(row.values)?row.values.slice(1).map(v=>cellText(v)):[];yield {number:row.number,values};}}
        await consume((worksheet as unknown as {name:string}).name,rows());
      }
    }else throw new AuditRequestError("Choose an English PPC CSV or XLSX export.");
    return {checksum:hash.digest("hex"),manifest,period:detectAuditReportPeriod(metadata,filename,new Date().toISOString().slice(0,10)),totalRows};
  } finally {await rm(directory,{recursive:true,force:true});}
}
export async function* stagedRows(path: string): AsyncGenerator<{number:number;values:string[]}> {
  const blob=await get(path,{access:"private",useCache:false});if(!blob||blob.statusCode!==200)throw new AuditRequestError("Processing source expired. Upload the PPC Report again.");
  const lines=createInterface({input:Readable.fromWeb(blob.stream as import("node:stream/web").ReadableStream<Uint8Array>),crlfDelay:Infinity});
  for await(const line of lines)if(line)yield JSON.parse(line);
}
