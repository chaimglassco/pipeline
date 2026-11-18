import { expect, it } from "vitest";
import { auditSearchTermHighAcos, auditSearchTermWaste, describeWasteRules, parseAuditWasteRules, validateSavedAudit, type AuditAd, type AuditData } from "./ppc-audit";

const row = (query: string, spend: number, clicks: number, orders: number, sales: number, target = ""): AuditAd => ({ entity: query ? "searchterm" : "keyword", type: "Sponsored Products", campaign: "C", campaignId: "1", adGroup: "G", asin: "", sku: "", target, query, match: "Broad", placement: "", strategy: "", state: "", bid: 0, spend, sales, orders, clicks, impressions: 100 });
// lead came: no sale · glass cutter: small no sale · solder: sold at 60% ACOS · grozing pliers: sold at 90% ACOS · keyword: never counted.
const rows = [row("lead came", 12, 11, 0, 0), row("glass cutter", 2, 1, 0, 0), row("solder", 9, 12, 1, 15), row("grozing pliers", 18, 6, 1, 20), row("", 30, 40, 0, 0, "lead came")];
const names = (list: AuditAd[]) => list.map(r => r.query);

it("ANDs the fields inside a rule and skips blank ones", () => {
  expect(auditSearchTermWaste(rows, { groups: [] })).toEqual([]);
  expect(auditSearchTermWaste(rows, { groups: [{}], highAcos: 40 })).toEqual([]);
  expect(names(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0 }] }))).toEqual(["lead came", "glass cutter"]);
  expect(names(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0, minSpend: 5 }] }))).toEqual(["lead came"]);
  // The keyword row with $30 and no orders never counts: waste is search terms only.
  expect(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0, minClicks: 0 }] }).some(r => !r.query)).toBe(false);
});

it("ORs the rules, and an ACOS rule only matches terms that sold", () => {
  expect(names(auditSearchTermWaste(rows, { groups: [{ minAcos: 80 }] }))).toEqual(["grozing pliers"]);
  expect(names(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0, minSpend: 5 }, { minAcos: 80 }] }))).toEqual(["lead came", "grozing pliers"]);
});

it("checks AND links before OR", () => {
  // (no orders AND spend >= 10) OR ACOS >= 80%
  expect(names(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0 }, { minSpend: 10, join: "and" }, { minAcos: 80 }] }))).toEqual(["lead came", "grozing pliers"]);
  // no orders OR (spend >= 10 AND ACOS >= 80%)
  expect(names(auditSearchTermWaste(rows, { groups: [{ maxOrders: 0 }, { minSpend: 10 }, { minAcos: 80, join: "and" }] }))).toEqual(["lead came", "glass cutter", "grozing pliers"]);
  expect(describeWasteRules({ groups: [{ maxOrders: 0 }, { minSpend: 10 }, { minAcos: 80, join: "and" }] })).toBe("Orders ≤ 0 OR (Spend ≥ $10 AND ACOS ≥ 80%)");
});

it("flags High ACOS on sold terms that are not already waste", () => {
  expect(names(auditSearchTermHighAcos(rows, { groups: [], highAcos: 40 }))).toEqual(["solder", "grozing pliers"]);
  expect(names(auditSearchTermHighAcos(rows, { groups: [{ minAcos: 80 }], highAcos: 40 }))).toEqual(["solder"]);
});

it("parses the settings form, drops blank rules and names the rule with a bad value", () => {
  const blank = { maxOrders: "", minClicks: "", minSpend: "", minAcos: "", join: "or" as const };
  expect(parseAuditWasteRules({ groups: [{ ...blank, maxOrders: "0", minSpend: "5" }, blank, { ...blank, minAcos: "80" }], highAcos: "40" })).toEqual({ groups: [{ maxOrders: 0, minSpend: 5 }, { minAcos: 80 }], highAcos: 40 });
  expect(parseAuditWasteRules({ groups: [blank, { ...blank, minClicks: "2.5" }], highAcos: "" })).toBe("Rule 2 · Clicks at least: enter a whole number of 0 or more, or leave it blank.");
  expect(describeWasteRules({ groups: [{ maxOrders: 0, minSpend: 5 }, { minAcos: 80 }] })).toBe("(Orders ≤ 0 AND Spend ≥ $5) OR ACOS ≥ 80%");
  expect(describeWasteRules({ groups: [{ maxOrders: 0 }] })).toBe("Orders ≤ 0");
  // Only AND is stored; a leading AND has nothing before it and is dropped.
  expect(parseAuditWasteRules({ groups: [{ ...blank, join: "and", maxOrders: "0" }, { ...blank, join: "and", minClicks: "5" }], highAcos: "" })).toEqual({ groups: [{ maxOrders: 0 }, { minClicks: 5, join: "and" }] });
});

it("keeps saved rules, converts the earlier single-rule shape and rejects bad ones", () => {
  const audit: AuditData = { version: 1, name: "A", start: "", end: "", currency: "USD", importedAt: "2026-11-18T00:00:00Z", files: ["bulk.xlsx"], ads: rows, business: [] };
  expect(validateSavedAudit(audit)).not.toBeNull();
  expect(validateSavedAudit({ ...audit, wasteRules: { groups: [{ maxOrders: 0 }, { minAcos: 80 }], highAcos: 40 } })?.wasteRules).toEqual({ groups: [{ maxOrders: 0 }, { minAcos: 80 }], highAcos: 40 });
  expect(validateSavedAudit({ ...audit, wasteRules: { maxOrders: 0, minSpend: 5, highAcos: 40 } as never })?.wasteRules).toEqual({ groups: [{ maxOrders: 0, minSpend: 5 }], highAcos: 40 });
  expect(validateSavedAudit({ ...audit, wasteRules: { groups: [{ minClicks: -1 }] } })).toBeNull();
  expect(validateSavedAudit({ ...audit, wasteRules: { groups: [{ maxOrders: 0 }, { minAcos: 80, join: "xor" }] } as never })).toBeNull();
  expect(validateSavedAudit({ ...audit, wasteRules: { groups: [{ other: 1 }] } as never })).toBeNull();
});
