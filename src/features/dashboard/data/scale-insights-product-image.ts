import { unwrapScaleInsightsPayload, ScaleInsightsDataError, type ScaleInsightsToolCaller } from "./scale-insights-performance";
import { MAX_DASHBOARD_PRODUCT_IMAGE_BYTES } from "../domain/ppc-dashboard-catalog";

export async function loadScaleInsightsProductImage(asin: string, callTool: ScaleInsightsToolCaller, fetchImage: typeof fetch = fetch) {
  const payload = unwrapScaleInsightsPayload(await callTool("get_product_metadata", { asin_list: [asin], country: "US" }));
  const products = Array.isArray(payload.Products) ? payload.Products : [];
  const product = products.find(value => value && typeof value === "object" && value.ASIN === asin && value.CountryCode === "US");
  if (payload.Country !== "US" || !product || typeof product.Thumbnail !== "string") {
    throw new ScaleInsightsDataError("no_data", "No listing image was found for this ASIN. You can upload an image manually.");
  }
  const url = new URL(product.Thumbnail);
  if (url.protocol !== "https:" || url.hostname !== "m.media-amazon.com" || url.port || url.username || url.password || !url.pathname.startsWith("/images/I/")) {
    throw new ScaleInsightsDataError("invalid_response", "The listing image source is unsupported. You can upload an image manually.");
  }
  const response = await fetchImage(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!response.ok || !contentType || !/^image\/(jpeg|png|webp|gif)$/.test(contentType) || !response.body) {
    throw new Error("Listing image is unavailable.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DASHBOARD_PRODUCT_IMAGE_BYTES) throw new Error("Listing image exceeds the upload limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!size) throw new Error("Listing image is empty.");
  return { asin, imageDataUrl: `data:${contentType};base64,${Buffer.concat(chunks).toString("base64")}` };
}
