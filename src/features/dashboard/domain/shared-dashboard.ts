import { PPC_DASHBOARD_STORAGE_KEY, parsePpcDashboardStore } from "./ppc-dashboard-state";
import { PPC_DASHBOARD_CATALOG_STORAGE_KEY, parseDashboardCatalogStore } from "./ppc-dashboard-catalog";
import { PPC_PERFORMANCE_CACHE_KEY, parsePerformanceCache } from "./ppc-performance-cache";
import { ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY, parseAccountCampaignSnapshotCache } from "./account-campaign-compare";
import { PPC_CAMPAIGN_CSV_CACHE_KEY, parseCampaignCsvImportCache } from "./campaign-comparison-csv";
import { PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY, PPC_OPPORTUNITY_HISTORY_CACHE_KEY, parseUntargetedOpportunityCache } from "./untargeted-sales-opportunities";
import { parseOpportunityHistoryCache } from "./opportunity-history";

export const DASHBOARD_STORES = [
  { key: PPC_DASHBOARD_STORAGE_KEY, label: "Weekly reports, goals and notes" },
  { key: PPC_DASHBOARD_CATALOG_STORAGE_KEY, label: "Products, tags and display order" },
  { key: PPC_PERFORMANCE_CACHE_KEY, label: "Saved weekly performance" },
  { key: ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY, label: "Account campaign CSV imports" },
  { key: PPC_CAMPAIGN_CSV_CACHE_KEY, label: "Product campaign CSV imports" },
  { key: PPC_UNTARGETED_OPPORTUNITIES_CACHE_KEY, label: "Saved search term opportunities" },
  { key: PPC_OPPORTUNITY_HISTORY_CACHE_KEY, label: "Twelve-week search term history" },
] as const;
export type DashboardStoreKey = typeof DASHBOARD_STORES[number]["key"];
export const MAX_SHARED_DASHBOARD_BYTES = 3_500_000;
export type DashboardDocument = {
  version: 1; key: DashboardStoreKey; value: string; savedAt: string; operationId: string;
  actor: string;
};
export type DashboardDocumentResponse = { document: DashboardDocument | null; etag: string | null; canEdit: boolean };
export function isDashboardStoreKey(key: unknown): key is DashboardStoreKey {
  return DASHBOARD_STORES.some(store => store.key === key);
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function emptyDashboardValue(key: DashboardStoreKey) {
  return JSON.stringify(key === PPC_DASHBOARD_CATALOG_STORAGE_KEY
    ? { version: 1, tags: [], customProducts: [], productOverrides: {}, hiddenPipelineProductIds: [], productOrderIds: [] }
    : { version: 1, [key === PPC_DASHBOARD_STORAGE_KEY ? "reports" : "entries"]: {} });
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
  if (!record(left) || !record(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(right, key) && jsonEqual(left[key] as JsonValue, right[key] as JsonValue));
}

function mergeObject(base: Record<string, JsonValue>, local: Record<string, JsonValue>, remote: Record<string, JsonValue>): Record<string, JsonValue> {
  const merged: Record<string, JsonValue> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
    // Deletion records are permanent intent, including during stale outbox recovery.
    if (key === "deletedGoalIds") {
      merged[key] = [...new Set([base[key], local[key], remote[key]].flatMap(value => Array.isArray(value) ? value.filter(item => typeof item === "string") : []))];
      continue;
    }
    const inBase = Object.hasOwn(base, key);
    const inLocal = Object.hasOwn(local, key);
    const inRemote = Object.hasOwn(remote, key);
    if (!inLocal) {
      if (!inBase || inRemote && !jsonEqual(remote[key], base[key])) {
        if (inRemote) merged[key] = remote[key];
      }
      continue;
    }
    if (!inRemote) {
      if (!inBase || !jsonEqual(local[key], base[key])) merged[key] = local[key];
      continue;
    }
    if (!inBase) {
      const emptyBase: JsonValue = Array.isArray(local[key]) && Array.isArray(remote[key]) ? []
        : record(local[key]) && record(remote[key]) ? {} : null;
      merged[key] = jsonEqual(local[key], remote[key]) ? local[key] : mergeJson(emptyBase, local[key], remote[key]);
      continue;
    }
    merged[key] = mergeJson(base[key], local[key], remote[key]);
  }
  return merged;
}

function mergeScalarArray(base: JsonValue[], local: JsonValue[], remote: JsonValue[]) {
  const primitive = (value: JsonValue) => value === null || ["boolean", "number", "string"].includes(typeof value);
  if (![...base, ...local, ...remote].every(primitive)) return local;
  const key = (value: JsonValue) => `${typeof value}:${String(value)}`;
  const baseKeys = new Set(base.map(key));
  const localKeys = new Set(local.map(key));
  const remoteKeys = new Set(remote.map(key));
  const included = new Set<string>();
  for (const itemKey of new Set([...baseKeys, ...remoteKeys, ...localKeys])) {
    const before = baseKeys.has(itemKey);
    const here = localKeys.has(itemKey);
    const there = remoteKeys.has(itemKey);
    if (here === before ? there : there === before ? here : here) included.add(itemKey);
  }
  return [...local, ...remote].filter((value, index, values) => included.has(key(value)) && values.findIndex(item => key(item) === key(value)) === index);
}

function mergeIdArray(base: JsonValue[], local: JsonValue[], remote: JsonValue[]): JsonValue[] | null {
  const all = [...base, ...local, ...remote];
  if (!all.length || !all.every(value => record(value) && typeof value.id === "string")) return null;
  const map = (values: JsonValue[]) => new Map(values.map(value => [(value as { id: string }).id, value]));
  const baseMap = map(base);
  const localMap = map(local);
  const remoteMap = map(remote);
  if (baseMap.size !== base.length || localMap.size !== local.length || remoteMap.size !== remote.length) return null;
  const ids = (values: JsonValue[]) => values.map(value => (value as { id: string }).id);
  const localReordered = !jsonEqual(ids(base), ids(local));
  const order = [...new Set([...(localReordered ? ids(local) : ids(remote)), ...ids(local), ...ids(remote), ...ids(base)])];
  const merged: JsonValue[] = [];
  for (const id of order) {
    const before = baseMap.get(id);
    const here = localMap.get(id);
    const there = remoteMap.get(id);
    if (here === undefined) {
      if (before === undefined || there !== undefined && !jsonEqual(there, before)) {
        if (there !== undefined) merged.push(there);
      }
      continue;
    }
    if (there === undefined) {
      if (before === undefined || !jsonEqual(here, before)) merged.push(here);
      continue;
    }
    merged.push(before === undefined ? mergeJson({} as JsonValue, here, there) : mergeJson(before, here, there));
  }
  return merged;
}

function mergeJson(base: JsonValue, local: JsonValue, remote: JsonValue): JsonValue {
  if (jsonEqual(local, base)) return remote;
  if (jsonEqual(remote, base) || jsonEqual(local, remote)) return local;
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) return mergeIdArray(base, local, remote) ?? mergeScalarArray(base, local, remote);
  if (record(base) && record(local) && record(remote)) return mergeObject(base as Record<string, JsonValue>, local as Record<string, JsonValue>, remote as Record<string, JsonValue>);
  // Both sessions changed the same scalar field. The edit being saved is the latest intent.
  return local;
}

export function mergeDashboardValues(key: DashboardStoreKey, baseRaw: string | null, localRaw: string, remoteRaw: string | null) {
  const base = JSON.parse(validateDashboardValue(key, baseRaw ?? emptyDashboardValue(key))) as JsonValue;
  const local = JSON.parse(validateDashboardValue(key, localRaw)) as JsonValue;
  const remote = JSON.parse(validateDashboardValue(key, remoteRaw ?? emptyDashboardValue(key))) as JsonValue;
  const merged = mergeJson(base, local, remote);
  // Apply permanent deletions even when mergeJson takes an unchanged-value shortcut.
  if (key === PPC_DASHBOARD_STORAGE_KEY && record(merged) && record(merged.reports)) {
    for (const source of [base, local, remote]) {
      if (!record(source) || !record(source.reports)) continue;
      for (const [reportKey, sourceReport] of Object.entries(source.reports)) {
        const target = merged.reports[reportKey];
        if (!record(sourceReport) || !record(target) || !Array.isArray(sourceReport.deletedGoalIds)) continue;
        target.deletedGoalIds = [...new Set([...(Array.isArray(target.deletedGoalIds) ? target.deletedGoalIds : []), ...sourceReport.deletedGoalIds])];
      }
    }
  }
  return validateDashboardValue(key, JSON.stringify(merged));
}

// Use the existing v1 parsers, but reject dropped records instead of silently migrating partial data.
export function validateDashboardValue(key: DashboardStoreKey, raw: string): string {
  if (new TextEncoder().encode(raw).length > MAX_SHARED_DASHBOARD_BYTES) throw new Error("This dashboard dataset exceeds the 3.5 MB sharing limit. Its local copy has been kept.");
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1) throw new Error("Unsupported dashboard data version.");
  let normalized: unknown;
  if (key === PPC_DASHBOARD_CATALOG_STORAGE_KEY) {
    if (!Array.isArray(value.tags) || !Array.isArray(value.customProducts) || !record(value.productOverrides)) throw new Error("Invalid product catalog.");
    const catalog = parseDashboardCatalogStore(raw);
    if (catalog.tags.length !== value.tags.length || catalog.customProducts.length !== value.customProducts.length || Object.keys(catalog.productOverrides).length !== Object.keys(value.productOverrides).length) throw new Error("Some catalog records are invalid. The original data has been kept.");
    normalized = catalog;
  } else {
    const field = key === PPC_DASHBOARD_STORAGE_KEY ? "reports" : "entries";
    if (!record(value[field])) throw new Error("Invalid dashboard records.");
    const entries = key === PPC_DASHBOARD_STORAGE_KEY ? parsePpcDashboardStore(raw).reports
      : key === PPC_PERFORMANCE_CACHE_KEY ? parsePerformanceCache(raw)
      : key === ACCOUNT_CAMPAIGN_SNAPSHOT_STORAGE_KEY ? parseAccountCampaignSnapshotCache(raw)
      : key === PPC_CAMPAIGN_CSV_CACHE_KEY ? parseCampaignCsvImportCache(raw)
      : key === PPC_OPPORTUNITY_HISTORY_CACHE_KEY ? parseOpportunityHistoryCache(raw)
      : parseUntargetedOpportunityCache(raw);
    if (Object.keys(entries).length !== Object.keys(value[field]).length) throw new Error("Some saved dashboard records are invalid. The original data has been kept.");
    normalized = { version: 1, [field]: entries };
  }
  return JSON.stringify(normalized);
}

export function dashboardRecordCount(key: DashboardStoreKey, raw: string): number {
  const value = JSON.parse(validateDashboardValue(key, raw));
  return key === PPC_DASHBOARD_CATALOG_STORAGE_KEY
    ? value.tags.length + value.customProducts.length + Object.keys(value.productOverrides).length + value.hiddenPipelineProductIds.length + (value.productOrderIds?.length ?? 0)
    : Object.keys(value.reports ?? value.entries).length;
}

export function parseDashboardDocument(value: unknown, key: DashboardStoreKey): DashboardDocument {
  if (!record(value) || value.version !== 1 || value.key !== key || typeof value.value !== "string"
    || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))
    || typeof value.operationId !== "string" || typeof value.actor !== "string") throw new Error("The shared dashboard response is invalid.");
  return { version: 1, key, value: validateDashboardValue(key, value.value), savedAt: value.savedAt, operationId: value.operationId, actor: value.actor };
}
