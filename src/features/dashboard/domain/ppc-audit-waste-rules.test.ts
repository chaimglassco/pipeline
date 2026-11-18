import { expect, it } from "vitest";
import { auditSearchTermHighAcos, auditSearchTermWaste, validateSavedAudit, type AuditAd, type AuditData } from "./ppc-audit";

const row = (query: string, spend: number, clicks: number, orders: number, sales: number, target = ""): AuditAd => ({ entity: query ? "searchterm" : "keyword", type: "Sponsored Products", campaign: "C", campaignId: "1", adGroup: "G", asin: "", sku: "", target, query, match: "Broad", placement: "", strategy: "", state: "", bid: 0, spend, sales, orders, clicks, impressions: 100 });
const rows = [row("lead came", 12, 11, 0, 0), row("glass cutter", 2, 1, 0, 0), row("solder", 9, 12, 1, 15), row("", 30, 40, 0, 0, "lead came")];

it("counts search terms that pass every filled rule and skips blank ones", () => {
  expect(auditSearchTermWaste(rows, {})).toEqual([]);
  expect(auditSearchTermWaste(rows, { highAcos: 40 })).toEqual([]);
  expect(auditSearchTermWaste(rows, { maxOrders: 0 }).map(r => r.query)).toEqual(["lead came", "glass cutter"]);
  expect(auditSearchTermWaste(rows, { maxOrders: 0, minClicks: 10 }).map(r => r.query)).toEqual(["lead came"]);
  expect(auditSearchTermWaste(rows, { minSpend: 5 }).map(r => r.query)).toEqual(["lead came", "solder"]);
  // The keyword row with $30 and no orders never counts: waste is search terms only.
  expect(auditSearchTermWaste(rows, { maxOrders: 0, minClicks: 0 }).some(r => !r.query)).toBe(false);
});

it("flags High ACOS only on search terms that sold", () => {
  expect(auditSearchTermHighAcos(rows, { highAcos: 40 }).map(r => r.query)).toEqual(["solder"]);
  expect(auditSearchTermHighAcos(rows, { maxOrders: 0 })).toEqual([]);
});

it("keeps saved rules and rejects bad ones", () => {
  const audit: AuditData = { version: 1, name: "A", start: "", end: "", currency: "USD", importedAt: "2026-11-18T00:00:00Z", files: ["bulk.xlsx"], ads: rows, business: [] };
  expect(validateSavedAudit(audit)).not.toBeNull();
  expect(validateSavedAudit({ ...audit, wasteRules: { maxOrders: 0, highAcos: 40 } })?.wasteRules).toEqual({ maxOrders: 0, highAcos: 40 });
  expect(validateSavedAudit({ ...audit, wasteRules: { minClicks: -1 } })).toBeNull();
  expect(validateSavedAudit({ ...audit, wasteRules: { other: 1 } })).toBeNull();
});
