import { parseScaleInsightsCampaignCsv } from "./campaign-comparison-csv";
import { classifyCampaignOutcome, createCampaignComparisonRow, getCampaignAcos, type CampaignOutcomeCategoryId } from "./campaign-weekly-comparison";
import { addDaysIso } from "./ppc-dashboard-state";

export const ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY = "glassco.ppcCampaignAccountSnapshots.v1";

export type AccountComparisonGranularity = "day" | "week" | "month";
export type SpendMovement = "all" | "increased" | "new" | "decreased" | "stopped" | "unchanged";
export type AccountCampaignFilter = "all" | CampaignOutcomeCategoryId;
export type AccountComparisonPeriod = { startDate: string; endDate: string };
export type AccountCampaignMetrics = { spend: number; sales: number; orders: number };
export type AccountCampaignSnapshotRow = {
  campaignId: string;
  campaignName: string;
  sponsoredType: number;
  metrics: AccountCampaignMetrics;
};
export type AccountCampaignSnapshot = {
  country: string;
  currency: string;
  granularity: AccountComparisonGranularity;
  period: AccountComparisonPeriod;
  campaigns: AccountCampaignSnapshotRow[];
  fileName: string;
  importedAt: string;
};
export type AccountCampaignSnapshotCache = Record<string, AccountCampaignSnapshot>;
export type AccountCampaignComparisonRow = {
  campaignId: string;
  campaignName: string;
  sponsoredType: number;
  previous: AccountCampaignMetrics;
  current: AccountCampaignMetrics;
  spendChange: number;
  spendChangePercentage: number | null;
  salesChange: number;
  salesChangePercentage: number | null;
  ordersChange: number;
  currentAcos: number | null;
  movement: Exclude<SpendMovement, "all">;
  outcome: CampaignOutcomeCategoryId;
};

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return toIsoDate(new Date(Date.UTC(year, monthIndex + 1, 0, 12)));
}

export function defaultAccountComparisonEnd(granularity: AccountComparisonGranularity, todayIso: string) {
  const today = parseIsoDate(todayIso);
  if (!today) throw new Error("A valid current date is required.");
  if (granularity === "day") return addDaysIso(todayIso, -1);
  if (granularity === "month") return lastDayOfMonth(today.getUTCFullYear(), today.getUTCMonth() - 1);
  const day = today.getUTCDay();
  const daysSinceTuesday = (day - 2 + 7) % 7;
  return addDaysIso(todayIso, -(daysSinceTuesday === 0 ? 7 : daysSinceTuesday));
}

export function normalizeAccountComparisonEnd(granularity: AccountComparisonGranularity, value: string) {
  const date = parseIsoDate(value);
  if (!date) throw new Error("Choose a valid completed period.");
  if (granularity === "day") return value;
  if (granularity === "month") return lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth());
  return addDaysIso(value, -((date.getUTCDay() - 2 + 7) % 7));
}

export function getAccountComparisonPeriods(granularity: AccountComparisonGranularity, currentEnd: string) {
  const normalizedEnd = normalizeAccountComparisonEnd(granularity, currentEnd);
  if (granularity === "day") {
    return {
      previous: { startDate: addDaysIso(normalizedEnd, -1), endDate: addDaysIso(normalizedEnd, -1) },
      current: { startDate: normalizedEnd, endDate: normalizedEnd },
    };
  }
  if (granularity === "week") {
    return {
      previous: { startDate: addDaysIso(normalizedEnd, -13), endDate: addDaysIso(normalizedEnd, -7) },
      current: { startDate: addDaysIso(normalizedEnd, -6), endDate: normalizedEnd },
    };
  }
  const current = parseIsoDate(normalizedEnd)!;
  const currentStart = toIsoDate(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 12)));
  const previousEnd = addDaysIso(currentStart, -1);
  const previous = parseIsoDate(previousEnd)!;
  return {
    previous: { startDate: toIsoDate(new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth(), 1, 12))), endDate: previousEnd },
    current: { startDate: currentStart, endDate: normalizedEnd },
  };
}

export function accountCampaignSnapshotKey(country: string, granularity: AccountComparisonGranularity, period: AccountComparisonPeriod) {
  return `${country.trim().toUpperCase()}:${granularity}:${period.startDate}:${period.endDate}`;
}

function currencyForCountry(country: string) {
  return ({ US: "USD", CA: "CAD", MX: "MXN", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", JP: "JPY", SG: "SGD", AU: "AUD" } as Record<string, string>)[country] ?? "USD";
}

export function createAccountCampaignSnapshot(input: {
  country: string;
  granularity: AccountComparisonGranularity;
  period: AccountComparisonPeriod;
  csvText: string;
  fileName: string;
  importedAt?: string;
}): AccountCampaignSnapshot {
  const country = input.country.trim().toUpperCase();
  const fileName = input.fileName.trim();
  if (!/^[A-Z]{2}$/.test(country) || !fileName || !parseIsoDate(input.period.startDate) || !parseIsoDate(input.period.endDate) || input.period.startDate > input.period.endDate) {
    throw new Error("The campaign snapshot details are invalid.");
  }
  const campaigns = [...parseScaleInsightsCampaignCsv(input.csvText).values()].map(campaign => ({
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    sponsoredType: campaign.sponsoredType,
    metrics: { ...campaign.metrics },
  }));
  return {
    country,
    currency: currencyForCountry(country),
    granularity: input.granularity,
    period: input.period,
    campaigns,
    fileName,
    importedAt: input.importedAt ?? new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseSnapshot(value: unknown): AccountCampaignSnapshot | null {
  if (!isRecord(value) || !isRecord(value.period) || !Array.isArray(value.campaigns)) return null;
  const country = typeof value.country === "string" ? value.country.trim().toUpperCase() : "";
  const currency = typeof value.currency === "string" ? value.currency.trim().toUpperCase() : "";
  const granularity = value.granularity === "day" || value.granularity === "week" || value.granularity === "month" ? value.granularity : null;
  const startDate = typeof value.period.startDate === "string" ? value.period.startDate : "";
  const endDate = typeof value.period.endDate === "string" ? value.period.endDate : "";
  const fileName = typeof value.fileName === "string" ? value.fileName.trim() : "";
  const importedAt = typeof value.importedAt === "string" ? value.importedAt : "";
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z]{3}$/.test(currency) || !granularity || !parseIsoDate(startDate) || !parseIsoDate(endDate) || startDate > endDate || !fileName || Number.isNaN(Date.parse(importedAt))) return null;
  const campaigns: AccountCampaignSnapshotRow[] = [];
  for (const candidate of value.campaigns) {
    if (!isRecord(candidate) || !isRecord(candidate.metrics)) return null;
    const campaignId = typeof candidate.campaignId === "string" ? candidate.campaignId.trim() : "";
    const campaignName = typeof candidate.campaignName === "string" ? candidate.campaignName.trim() : "";
    const sponsoredType = nonNegativeNumber(candidate.sponsoredType);
    const spend = nonNegativeNumber(candidate.metrics.spend);
    const sales = nonNegativeNumber(candidate.metrics.sales);
    const orders = nonNegativeNumber(candidate.metrics.orders);
    if (!campaignId || !campaignName || sponsoredType == null || !Number.isInteger(sponsoredType) || spend == null || sales == null || orders == null || !Number.isInteger(orders)) return null;
    campaigns.push({ campaignId, campaignName, sponsoredType, metrics: { spend, sales, orders } });
  }
  return { country, currency, granularity, period: { startDate, endDate }, campaigns, fileName, importedAt };
}

export function parseAccountCampaignSnapshotCache(raw: string | null): AccountCampaignSnapshotCache {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) return {};
    return Object.fromEntries(Object.entries(value.entries).flatMap(([key, candidate]) => {
      const snapshot = parseSnapshot(candidate);
      return snapshot && key === accountCampaignSnapshotKey(snapshot.country, snapshot.granularity, snapshot.period) ? [[key, snapshot]] : [];
    }));
  } catch {
    return {};
  }
}

export function withAccountCampaignSnapshots(cache: AccountCampaignSnapshotCache, snapshots: AccountCampaignSnapshot[], maximumEntries = 100) {
  const replacements = new Map(snapshots.map(snapshot => [accountCampaignSnapshotKey(snapshot.country, snapshot.granularity, snapshot.period), snapshot]));
  const entries = [...Object.entries(cache).filter(([key]) => !replacements.has(key)), ...replacements.entries()];
  return Object.fromEntries(entries.slice(-Math.max(1, maximumEntries))) as AccountCampaignSnapshotCache;
}

function movementFor(previousSpend: number, currentSpend: number): Exclude<SpendMovement, "all"> {
  if (previousSpend === 0 && currentSpend > 0) return "new";
  if (previousSpend > 0 && currentSpend === 0) return "stopped";
  if (currentSpend > previousSpend) return "increased";
  if (currentSpend < previousSpend) return "decreased";
  return "unchanged";
}

export function compareAccountCampaignSnapshots(previous: AccountCampaignSnapshot, current: AccountCampaignSnapshot) {
  if (previous.country !== current.country || previous.currency !== current.currency || previous.granularity !== current.granularity) {
    throw new Error("The saved campaign exports are not compatible.");
  }
  const previousRows = new Map(previous.campaigns.map(campaign => [campaign.campaignId, campaign]));
  const currentRows = new Map(current.campaigns.map(campaign => [campaign.campaignId, campaign]));
  const zero: AccountCampaignMetrics = { spend: 0, sales: 0, orders: 0 };
  return [...new Set([...previousRows.keys(), ...currentRows.keys()])].map(campaignId => {
    const before = previousRows.get(campaignId);
    const after = currentRows.get(campaignId);
    const identity = after ?? before!;
    if (before && after && (before.campaignName !== after.campaignName || before.sponsoredType !== after.sponsoredType)) {
      throw new Error(`CampaignId ${campaignId} has different names or types between the two files.`);
    }
    const previousMetrics = before?.metrics ?? zero;
    const currentMetrics = after?.metrics ?? zero;
    const classifiedRow = createCampaignComparisonRow({
      campaignId,
      campaignName: identity.campaignName,
      sponsoredType: identity.sponsoredType,
      previousActive: Boolean(before),
      currentActive: Boolean(after),
      previous: previousMetrics,
      current: currentMetrics,
    });
    const spendChange = classifiedRow.delta.spend.absolute;
    return {
      campaignId,
      campaignName: identity.campaignName,
      sponsoredType: identity.sponsoredType,
      previous: previousMetrics,
      current: currentMetrics,
      spendChange,
      spendChangePercentage: classifiedRow.delta.spend.percentage,
      salesChange: classifiedRow.delta.sales.absolute,
      salesChangePercentage: classifiedRow.delta.sales.percentage,
      ordersChange: classifiedRow.delta.orders.absolute,
      currentAcos: getCampaignAcos(currentMetrics),
      movement: movementFor(previousMetrics.spend, currentMetrics.spend),
      outcome: classifyCampaignOutcome(classifiedRow),
    } satisfies AccountCampaignComparisonRow;
  });
}

export function filterAccountCampaignRows(rows: AccountCampaignComparisonRow[], filter: AccountCampaignFilter) {
  return filter === "all" ? rows : rows.filter(row => row.outcome === filter);
}
