import { describe, expect, it } from "vitest";
import { importWeeklyPerformanceCsv } from "./weekly-csv-import";

const ads = { name: "ProductStats.csv", text: `Type,ASIN,Title,SKU,ShortName,Impressions,Clicks,Orders,Units,Sales,Conversion %,Spent,Cost Per Click,Clickthrough Rate %,ACOS %,ROAS
Products,B0FKD2VVCY,"Whiting Powder, 16 oz",Whiting,,10600,109,30,30,535.70,27.52,73.32,0.67,1.03,13.69,7.31
Display,B0FKD2VVCY,"Whiting Powder, 16 oz",Whiting,,1027,3,,,,,3.64,1.21,0.29,,
Products,B0OTHER001,Not ours,X,,5,1,,,,,0.10,0.10,1,,
Products,B0ADSONLY1,Ads only,Y,,50,2,,,,,1.10,0.55,4,,` };
const business = { name: "BusinessReport.csv", text: `﻿(Parent) ASIN,(Child) ASIN,Title,Sessions - Total,Units Ordered,Ordered Product Sales,Total Order Items
B0HMP4HMKH,B0FKD2VVCY,"Whiting Powder, 16 oz",208,62,"$1,036.39",62
B0SALESONL,B0SALESONL,Organic only,40,3,$59.97,3` };

describe("weekly CSV import", () => {
  it("adds ad-type rows per ASIN, joins Business Report totals, and imports only catalog ASINs", () => {
    const { snapshots, missing } = importWeeklyPerformanceCsv([business, ads], ["B0FKD2VVCY", "b0adsonly1", "B0SALESONL", "B0NOTHERE1"], "2026-11-11");
    expect(missing).toEqual(["B0NOTHERE1"]);
    expect(snapshots.map(s => s.asin)).toEqual(["B0FKD2VVCY", "B0ADSONLY1", "B0SALESONL"]);
    expect(snapshots[0]).toMatchObject({ startDate: "2026-11-11", endDate: "2026-11-17", metricsRevision: 4 });
    expect(snapshots[0].metrics).toMatchObject({ spend: 76.96, ppcSales: 535.7, ppcOrders: 30, ppcClicks: 112, ppcImpressions: 11627, totalSales: 1036.39, totalOrders: 62, totalUnits: 62, totalSessions: 208, acos: 14.37 });
    expect(snapshots[1].metrics).toMatchObject({ spend: 1.1, totalSales: 0 });
    expect(snapshots[2].metrics).toMatchObject({ spend: 0, totalSales: 59.97, totalOrders: 3 });
  });

  it("requires both exports and rejects malformed numbers", () => {
    expect(() => importWeeklyPerformanceCsv([ads], ["B0FKD2VVCY"], "2026-11-11")).toThrow("Upload both files");
    const broken = { ...ads, text: ads.text.replace("73.32", "abc") };
    expect(() => importWeeklyPerformanceCsv([broken, business], ["B0FKD2VVCY"], "2026-11-11")).toThrow("ProductStats.csv, row 2: invalid spent.");
  });
});
