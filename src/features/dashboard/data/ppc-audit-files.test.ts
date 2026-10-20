import { expect, it } from "vitest";
import { Workbook } from "exceljs";
import { readAuditFile } from "./ppc-audit-files";
it("reads XLSX sheets including blank cells and rejects formulas", async () => {
  const workbook = new Workbook(); const sheet = workbook.addWorksheet("Report");
  sheet.addRow(["ASIN", "Blank", "Spend"]); sheet.addRow(["B012345678", null, 20]);
  const bytes = await workbook.xlsx.writeBuffer();
  const file = { name: "report.xlsx", size: bytes.byteLength, arrayBuffer: async () => bytes } as File;
  expect((await readAuditFile(file))[0].rows[1]).toEqual(["B012345678", "", "20"]);
  sheet.getCell("C2").value = { formula: "1+1", result: 2 };
  const formulas = await workbook.xlsx.writeBuffer();
  await expect(readAuditFile({ ...file, arrayBuffer: async () => formulas } as File)).rejects.toThrow("formulas");
});
it("rejects unsupported and oversized files", async () => {
  await expect(readAuditFile({ name: "report.xls", size: 1 } as File)).rejects.toThrow("CSV or XLSX");
  await expect(readAuditFile({ name: "report.csv", size: 60 * 1024 * 1024 } as File)).rejects.toThrow("50 MB");
});
