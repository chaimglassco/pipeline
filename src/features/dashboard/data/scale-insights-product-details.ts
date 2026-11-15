import { unwrapScaleInsightsPayload, type ScaleInsightsToolCaller } from "./scale-insights-performance";

// Amazon listing details for the Products export, read from Scale Insights'
// get_product_metadata tool. The tool's full field list is not documented, so
// fields are matched by common names; anything missing stays empty instead of
// being guessed, and unrecognized simple fields are kept as extra columns.

export type ProductListingDetails = {
  asin: string;
  found: boolean;
  title: string;
  bullets: string[];
  description: string;
  price: string;
  images: string[];
  extra: Record<string, string>;
};

const BATCH_SIZE = 20;
const TITLE_KEYS = ["title", "itemname", "producttitle", "productname", "name"];
const BULLET_KEYS = ["bulletpoints", "bulletpoint", "bullets", "features", "featurebullets", "keyfeatures", "aboutthisitem"];
const DESCRIPTION_KEYS = ["description", "productdescription", "longdescription"];
const PRICE_KEYS = ["price", "buyboxprice", "listprice", "saleprice", "currentprice", "ourprice", "landedprice"];
const IMAGE_KEYS = ["images", "imageurls", "imageurl", "mainimage", "mainimageurl", "largeimage", "image", "thumbnail"];
const IDENTITY_KEYS = ["asin", "countrycode", "country", "marketplace"];
const CONSUMED_KEYS = new Set([...TITLE_KEYS, ...BULLET_KEYS, ...DESCRIPTION_KEYS, ...PRICE_KEYS, ...IMAGE_KEYS, ...IDENTITY_KEYS]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  const byKey = new Map(Object.entries(record).map(([key, value]) => [normalizeKey(key), value]));
  for (const key of keys) {
    const value = byKey.get(key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toBullets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => isRecord(item) ? text(pick(item, ["value", "text", "bullet"])) : text(item)).filter(Boolean);
  return text(value).split(/\r?\n+/).map(line => line.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
}

function toPrice(value: unknown): string {
  if (isRecord(value)) {
    const amount = text(pick(value, ["amount", "value", "price", "listingprice"]));
    const currency = text(pick(value, ["currencycode", "currency"]));
    return amount ? `${amount}${currency ? ` ${currency}` : ""}` : "";
  }
  return text(value);
}

function safeImageUrl(value: unknown): string {
  const candidate = isRecord(value) ? text(pick(value, ["url", "link", "src", "large", "hires"])) : text(value);
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function toImages(record: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const byKey = new Map(Object.entries(record).map(([key, value]) => [normalizeKey(key), value]));
  for (const key of IMAGE_KEYS) {
    const value = byKey.get(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      const url = safeImageUrl(item);
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

export function parseProductListing(asin: string, record: Record<string, unknown> | undefined): ProductListingDetails {
  if (!record) return { asin, found: false, title: "", bullets: [], description: "", price: "", images: [], extra: {} };
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (CONSUMED_KEYS.has(normalizeKey(key))) continue;
    const scalar = typeof value === "boolean" ? String(value) : text(value);
    if (scalar) extra[key] = scalar;
  }
  return {
    asin,
    found: true,
    title: text(pick(record, TITLE_KEYS)),
    bullets: toBullets(pick(record, BULLET_KEYS)),
    description: text(pick(record, DESCRIPTION_KEYS)),
    price: toPrice(pick(record, PRICE_KEYS)),
    images: toImages(record),
    extra,
  };
}

export async function loadScaleInsightsProductDetails(
  asins: string[],
  callTool: ScaleInsightsToolCaller,
  onFields?: (fieldNames: string[]) => void,
): Promise<ProductListingDetails[]> {
  const unique = [...new Set(asins)];
  const records = new Map<string, Record<string, unknown>>();
  for (let start = 0; start < unique.length; start += BATCH_SIZE) {
    const batch = unique.slice(start, start + BATCH_SIZE);
    const payload = unwrapScaleInsightsPayload(await callTool("get_product_metadata", { asin_list: batch, country: "US" }));
    const products = Array.isArray(payload.Products) ? payload.Products : [];
    for (const product of products) {
      if (!isRecord(product) || typeof product.ASIN !== "string") continue;
      if (product.CountryCode !== undefined && product.CountryCode !== "US") continue;
      if (batch.includes(product.ASIN)) records.set(product.ASIN, product);
    }
  }
  onFields?.([...new Set([...records.values()].flatMap(record => Object.keys(record)))].sort());
  return asins.map(asin => parseProductListing(asin, records.get(asin)));
}
