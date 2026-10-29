import { expect, it } from "vitest";
import { detectAuditReportPeriod as detect } from "./audit-report-period";
const today = "2026-10-29";
it("detects explicit report metadata in rows or columns", () => {
  expect(detect([{name:"Metadata",rows:[["Report Start Date","10/01/2026"],["Report End Date","10/28/2026"]]}],"bulk.xlsx",today)).toMatchObject({start:"2026-10-01",end:"2026-10-28",source:"report metadata"});
  expect(detect([{name:"Metadata",rows:[["Report Start Date","Report End Date"],["2026-10-01","2026-10-28"]]}],"bulk.xlsx",today)).toMatchObject({start:"2026-10-01",end:"2026-10-28"});
  expect(detect([{name:"Info",rows:[["Reporting Period","2026-10-01 to 2026-10-28"]]}],"bulk.xlsx",today)).toMatchObject({start:"2026-10-01",end:"2026-10-28"});
});
it("detects ISO or compact date pairs in export filenames", () => {
  for (const name of ["bulk-20261001-20261028.xlsx","bulk_2026-10-01_2026-10-28.csv"]) expect(detect([],name,today)).toMatchObject({start:"2026-10-01",end:"2026-10-28",source:"file name"});
});
it("uses daily report dates but never campaign lifecycle dates", () => {
  expect(detect([{name:"SP",rows:[["Date","Spend","Impressions"],["10/02/2026","1","10"],["10/01/2026","2","20"]]}],"report.csv",today)).toMatchObject({start:"2026-10-01",end:"2026-10-02",source:"daily report dates"});
  expect(detect([{name:"SP",rows:[["Start Date","End Date","Spend","Impressions"],["2026-01-01","2026-10-28","1","10"]]}],"Bulk - 30 Days.xlsx",today)).toBeNull();
});
it("requires valid, nonfuture, unambiguous reporting dates", () => {
  for (const name of ["Bulk - 30 Days.xlsx","bulk_2026-02-30_2026-03-01.xlsx","bulk_20261028_20261001.xlsx","bulk_20261001_20261101.xlsx","bulk_20260901_20260930_20261001.xlsx"]) expect(detect([],name,today)).toBeNull();
  expect(detect([{name:"A",rows:[["Report Start Date","2026-10-01"],["Report End Date","2026-10-28"]]},{name:"B",rows:[["Report Start Date","2026-10-02"],["Report End Date","2026-10-28"]]}],"bulk.xlsx",today)).toBeNull();
});
