import { describe,it,expect,vi } from "vitest";
import { csvRows,inspectZip } from "./audit-reader";
import { mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
vi.mock("@vercel/blob",()=>({get:vi.fn(),put:vi.fn()}));
describe("bounded report readers",()=>{
  it("decodes quoted rows and UTF-8 across arbitrary chunk boundaries",async()=>{const text='Name,Value\r\n"multi\nline","a""b"\r\nCafé,0';const buffer=Buffer.from(text);async function* chunks(){for(const byte of buffer)yield Buffer.from([byte]);}const rows=[];for await(const row of csvRows(chunks()))rows.push(row);expect(rows).toEqual([["Name","Value"],["multi\nline",'a"b'],["Café","0"]]);});
  it("rejects malformed quotes and overlarge cells",async()=>{async function* malformed(){yield '"unfinished';}await expect(async()=>{for await(const _ of csvRows(malformed()))void _;}).rejects.toThrow("unfinished");async function* huge(){yield "a".repeat(32769);}await expect(async()=>{for await(const _ of csvRows(huge()))void _;}).rejects.toThrow("limits");});
  it("checks the archive before workbook parsing",async()=>{const dir=await mkdtemp(join(tmpdir(),"audit-zip-test-"));try{const path=join(dir,"valid.xlsx");const workbook=new ExcelJS.Workbook();workbook.addWorksheet("Sponsored Products Campaigns").addRow(["Entity","Spend"]);await workbook.xlsx.writeFile(path);await expect(inspectZip(path)).resolves.toBeUndefined();await writeFile(path,"not an archive");await expect(inspectZip(path)).rejects.toThrow("could not be read");}finally{await rm(dir,{recursive:true,force:true});}});
});
