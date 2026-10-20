import { parseAuditCsv, type AuditSheet } from "../domain/ppc-audit";

export async function readAuditFile(file: File): Promise<AuditSheet[]> {
  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error("Choose a non-empty report under 50 MB.");
  if (/\.csv$/i.test(file.name)) return [{ name: file.name, rows: parseAuditCsv(await file.text()) }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an Amazon CSV or XLSX report.");
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets: AuditSheet[] = []; let cells = 0;
  workbook.eachSheet(sheet => {
    if (sheet.rowCount > 100001 || sheet.columnCount > 300) throw new Error("Report exceeds the supported sheet dimensions.");
    const rows: string[][] = [];
    sheet.eachRow(row => {
      const values: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = row.getCell(c);
        if (++cells > 5000000) throw new Error("Report exceeds the supported cell count.");
        if (cell.type === 6) throw new Error("Upload an Amazon export containing values, not spreadsheet formulas.");
        values.push(cell.text);
      }
      rows.push(values);
    });
    sheets.push({ name: sheet.name, rows });
  });
  return sheets;
}
