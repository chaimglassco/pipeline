import { createCampaignComparisonRow, parseCampaignWeeklyComparison, type CampaignPeriodMetrics, type CampaignWeeklyComparison } from "./campaign-weekly-comparison";

export const PPC_CAMPAIGN_CSV_CACHE_KEY = "glassco.ppcCampaignCsvComparison.v1";

export type CampaignCsvImport = {
  comparison: CampaignWeeklyComparison;
  previousFileName: string;
  currentFileName: string;
  importedAt: string;
};

export type CampaignCsvImportCache = Record<string, CampaignCsvImport>;

type CsvCampaign = {
  campaignId: string;
  campaignName: string;
  sponsoredType: number;
  metrics: CampaignPeriodMetrics;
};

type CsvPeriod = { startDate: string; endDate: string };

const REQUIRED_HEADERS = ["type", "campaign", "orders", "sales", "spent", "campaignid"] as const;
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(value.replace(/\r$/, ""));
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function numberValue(value: string, field: string, rowNumber: number, integer = false) {
  const normalized = value.trim().replace(/[$,%\s]/g, "");
  if (!normalized) return 0;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    throw new Error(`Row ${rowNumber} has an invalid ${field}.`);
  }
  return number;
}

function sponsoredType(value: string, rowNumber: number) {
  const normalized = value.trim().toUpperCase();
  if (normalized.startsWith("SP")) return 0;
  if (normalized.startsWith("SB")) return 1;
  if (normalized.startsWith("SD")) return 2;
  throw new Error(`Row ${rowNumber} has an unsupported campaign Type: ${value || "blank"}.`);
}

function mergeCampaign(target: Map<string, CsvCampaign>, campaign: CsvCampaign, rowNumber: number) {
  const existing = target.get(campaign.campaignId);
  if (!existing) {
    target.set(campaign.campaignId, campaign);
    return;
  }
  if (existing.campaignName !== campaign.campaignName || existing.sponsoredType !== campaign.sponsoredType) {
    throw new Error(`Row ${rowNumber} conflicts with another row for CampaignId ${campaign.campaignId}.`);
  }
  target.set(campaign.campaignId, {
    ...existing,
    metrics: {
      spend: existing.metrics.spend + campaign.metrics.spend,
      sales: existing.metrics.sales + campaign.metrics.sales,
      orders: existing.metrics.orders + campaign.metrics.orders,
    },
  });
}

export function parseScaleInsightsCampaignCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV has no campaign rows.");
  const headers = rows[0].map(normalizedHeader);
  const duplicateHeader = headers.find((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeader) throw new Error("The CSV contains duplicate column headers.");
  const headerIndexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter(header => headerIndexes[header] == null);
  if (missing.length) throw new Error(`The CSV is missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);

  const campaigns = new Map<string, CsvCampaign>();
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const field = (header: string) => (cells[headerIndexes[header]] ?? "").trim();
    const campaignId = field("campaignid");
    const campaignName = field("campaign");
    if (!campaignId || !/^[A-Za-z0-9_-]+$/.test(campaignId)) throw new Error(`Row ${rowNumber} has an invalid CampaignId.`);
    if (!campaignName) throw new Error(`Row ${rowNumber} has no Campaign name.`);
    mergeCampaign(campaigns, {
      campaignId,
      campaignName,
      sponsoredType: sponsoredType(field("type"), rowNumber),
      metrics: {
        spend: numberValue(field("spent"), "Spent", rowNumber),
        sales: numberValue(field("sales"), "Sales", rowNumber),
        orders: numberValue(field("orders"), "Orders", rowNumber, true),
      },
    }, rowNumber);
  });
  return campaigns;
}

function currencyForCountry(country: string) {
  return ({ US: "USD", CA: "CAD", MX: "MXN", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", JP: "JPY", SG: "SGD", AU: "AUD" } as Record<string, string>)[country] ?? "USD";
}

type CampaignComparisonInput = {
  asin: string;
  country: string;
  previousPeriod: CsvPeriod;
  currentPeriod: CsvPeriod;
};

function createCampaignComparisonFromMaps(input: CampaignComparisonInput, previous: Map<string, CsvCampaign>, current: Map<string, CsvCampaign>) {
  const keys = new Set([...previous.keys(), ...current.keys()]);
  const zero: CampaignPeriodMetrics = { spend: 0, sales: 0, orders: 0 };
  return {
    asin: input.asin.trim().toUpperCase(),
    country: input.country.trim().toUpperCase(),
    currency: currencyForCountry(input.country.trim().toUpperCase()),
    dataState: "Final" as const,
    previousPeriod: input.previousPeriod,
    currentPeriod: input.currentPeriod,
    freshness: { previousDataAsOf: "", currentDataAsOf: "" },
    campaigns: [...keys].map(campaignId => {
      const previousCampaign = previous.get(campaignId);
      const currentCampaign = current.get(campaignId);
      const identity = currentCampaign ?? previousCampaign;
      if (!identity) throw new Error(`Campaign ${campaignId} has no identity.`);
      if (previousCampaign && currentCampaign && (previousCampaign.campaignName !== currentCampaign.campaignName || previousCampaign.sponsoredType !== currentCampaign.sponsoredType)) {
        throw new Error(`CampaignId ${campaignId} has different names or types between the two files.`);
      }
      return createCampaignComparisonRow({
        campaignId,
        campaignName: identity.campaignName,
        sponsoredType: identity.sponsoredType,
        previousActive: Boolean(previousCampaign),
        currentActive: Boolean(currentCampaign),
        previous: previousCampaign?.metrics ?? zero,
        current: currentCampaign?.metrics ?? zero,
      });
    }).toSorted((first, second) => first.campaignName.localeCompare(second.campaignName)),
    warnings: ["Scale Insights campaign CSVs do not contain the selected report dates. Confirm that each file matches the labeled week before importing."],
  } satisfies CampaignWeeklyComparison;
}

export function createCampaignComparisonFromCsv(input: CampaignComparisonInput & { previousText: string; currentText: string }) {
  return createCampaignComparisonFromMaps(input, parseScaleInsightsCampaignCsv(input.previousText), parseScaleInsightsCampaignCsv(input.currentText));
}

export function createCampaignComparisonFromPreviousComparison(input: CampaignComparisonInput & { previousComparison: CampaignWeeklyComparison; currentText: string }) {
  const asin = input.asin.trim().toUpperCase();
  const country = input.country.trim().toUpperCase();
  const source = input.previousComparison;
  if (source.asin !== asin || source.country !== country || source.currentPeriod.startDate !== input.previousPeriod.startDate || source.currentPeriod.endDate !== input.previousPeriod.endDate) {
    throw new Error("The saved previous-week campaign data does not match this product or reporting period.");
  }
  const previous = new Map(source.campaigns.flatMap((campaign): Array<[string, CsvCampaign]> => campaign.currentActive ? [[campaign.campaignId, {
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    sponsoredType: campaign.sponsoredType,
    metrics: campaign.current,
  }]] : []));
  return createCampaignComparisonFromMaps(input, previous, parseScaleInsightsCampaignCsv(input.currentText));
}

export function campaignCsvCacheKey(country: string, asin: string, weekStart: string) {
  return `${country.trim().toUpperCase()}:${asin.trim().toUpperCase()}:${weekStart}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseImport(value: unknown): CampaignCsvImport | null {
  if (!isRecord(value)) return null;
  const comparison = parseCampaignWeeklyComparison(value.comparison);
  const previousFileName = clean(value.previousFileName);
  const currentFileName = clean(value.currentFileName);
  const importedAt = clean(value.importedAt);
  if (!comparison || !previousFileName || !currentFileName || !isIsoDate(importedAt.slice(0, 10)) || Number.isNaN(Date.parse(importedAt))) return null;
  return { comparison, previousFileName, currentFileName, importedAt };
}

export function parseCampaignCsvImportCache(value: string | null): CampaignCsvImportCache {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.entries)) return {};
  return Object.fromEntries(Object.entries(parsed.entries).flatMap(([key, candidate]) => {
    const entry = parseImport(candidate);
    if (!entry || key !== campaignCsvCacheKey(entry.comparison.country, entry.comparison.asin, entry.comparison.currentPeriod.startDate)) return [];
    return [[key, entry]];
  }));
}

export function withCampaignCsvImport(cache: CampaignCsvImportCache, entry: CampaignCsvImport, maximumEntries = 50) {
  const key = campaignCsvCacheKey(entry.comparison.country, entry.comparison.asin, entry.comparison.currentPeriod.startDate);
  const entries = [...Object.entries(cache).filter(([entryKey]) => entryKey !== key), [key, entry] as const];
  return Object.fromEntries(entries.slice(-Math.max(1, maximumEntries))) as CampaignCsvImportCache;
}

export function inferCsvPeriodFromFileName(fileName: string, referenceYear: number): CsvPeriod | null {
  const base = fileName.replace(/\.csv$/i, "").replace(/\./g, " ");
  const match = base.match(/\b([A-Za-z]+)\s+(\d{1,2})\s*-\s*(?:([A-Za-z]+)\s+)?(\d{1,2})\b/);
  if (!match) return null;
  const startMonth = MONTHS[match[1].toLowerCase()];
  const endMonth = match[3] ? MONTHS[match[3].toLowerCase()] : startMonth;
  if (!startMonth || !endMonth) return null;
  const startDate = new Date(Date.UTC(referenceYear, startMonth - 1, Number(match[2])));
  let endYear = referenceYear;
  if (endMonth < startMonth) endYear += 1;
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, Number(match[4])));
  if (startDate.getUTCMonth() !== startMonth - 1 || endDate.getUTCMonth() !== endMonth - 1 || startDate > endDate) return null;
  return { startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) };
}
