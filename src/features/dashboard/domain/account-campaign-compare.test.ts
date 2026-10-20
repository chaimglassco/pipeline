import { describe, expect, it } from "vitest";
import {
  accountCampaignSnapshotKey,
  compareAccountCampaignSnapshots,
  createAccountCampaignSnapshot,
  defaultAccountComparisonEnd,
  filterAccountCampaignRows,
  getAccountComparisonPeriods,
  parseAccountCampaignSnapshotCache,
  withAccountCampaignSnapshots,
} from "./account-campaign-compare";

const header = "Type,Campaign,Orders,Sales,Spent,CampaignId\r\n";

function snapshot(period: { startDate: string; endDate: string }, rows: string, fileName: string) {
  return createAccountCampaignSnapshot({ country: "US", granularity: "day", period, csvText: `${header}${rows}`, fileName, importedAt: "2026-09-21T00:00:00.000Z" });
}

describe("account campaign comparison", () => {
  it("builds completed adjacent day, Wednesday-Tuesday, and calendar-month periods", () => {
    expect(defaultAccountComparisonEnd("day", "2026-09-21")).toBe("2026-09-20");
    expect(getAccountComparisonPeriods("day", "2026-09-20")).toEqual({ previous: { startDate: "2026-09-19", endDate: "2026-09-19" }, current: { startDate: "2026-09-20", endDate: "2026-09-20" } });
    expect(getAccountComparisonPeriods("week", "2026-09-15")).toEqual({ previous: { startDate: "2026-09-02", endDate: "2026-09-08" }, current: { startDate: "2026-09-09", endDate: "2026-09-15" } });
    expect(getAccountComparisonPeriods("month", "2026-08-31")).toEqual({ previous: { startDate: "2026-07-01", endDate: "2026-07-31" }, current: { startDate: "2026-08-01", endDate: "2026-08-31" } });
  });

  it("joins account campaigns, zero-fills missing rows, and assigns every Spend movement", () => {
    const previous = snapshot({ startDate: "2026-09-19", endDate: "2026-09-19" }, [
      "SP Manual,Increased,1,10,10,1",
      "SP Manual,Stopped,1,10,5,2",
      "SP Manual,Decreased,1,10,20,3",
      "SP Manual,Unchanged,1,10,7,4",
    ].join("\r\n"), "previous.csv");
    const current = snapshot({ startDate: "2026-09-20", endDate: "2026-09-20" }, [
      "SP Manual,Increased,1,20,15,1",
      "SP Manual,New,1,10,4,5",
      "SP Manual,Decreased,1,5,8,3",
      "SP Manual,Unchanged,1,10,7,4",
    ].join("\r\n"), "current.csv");
    const rows = compareAccountCampaignSnapshots(previous, current);
    expect(rows.find(row => row.campaignId === "2")?.movement).toBe("stopped");
    expect(rows.find(row => row.campaignId === "5")?.movement).toBe("new");
    expect(rows.find(row => row.campaignId === "1")?.spendChange).toBe(5);
    expect(rows.find(row => row.campaignId === "1")?.outcome).toBe("good-spend-up-sales-up");
    expect(rows.find(row => row.campaignId === "5")?.outcome).toBe("bad-new-spend-inefficient");
    expect(rows.find(row => row.campaignId === "3")?.outcome).toBe("bad-spend-down-sales-down");
    expect(filterAccountCampaignRows(rows, "good-spend-up-sales-up").map(row => row.campaignId)).toEqual(["1"]);
    expect(filterAccountCampaignRows(rows, "bad-new-spend-inefficient").map(row => row.campaignId)).toEqual(["5"]);
    expect(filterAccountCampaignRows(rows, "bad-spend-down-sales-down").map(row => row.campaignId).sort()).toEqual(["2", "3"]);
    expect(filterAccountCampaignRows(rows, "all")).toHaveLength(5);
  });

  it("rejects identity conflicts and validates period snapshots in browser storage", () => {
    const previous = snapshot({ startDate: "2026-09-19", endDate: "2026-09-19" }, "SP Manual,Same,1,10,2,1", "previous.csv");
    const conflict = snapshot({ startDate: "2026-09-20", endDate: "2026-09-20" }, "SP Manual,Renamed,1,10,2,1", "current.csv");
    expect(() => compareAccountCampaignSnapshots(previous, conflict)).toThrow("different names or types");
    const cache = withAccountCampaignSnapshots({}, [previous, conflict]);
    expect(accountCampaignSnapshotKey("us", "day", previous.period)).toBe("US:day:2026-09-19:2026-09-19");
    expect(parseAccountCampaignSnapshotCache(JSON.stringify({ version: 1, entries: cache }))).toEqual(cache);
    expect(parseAccountCampaignSnapshotCache(JSON.stringify({ version: 1, entries: { bad: { version: 2 } } }))).toEqual({});
  });
});
