import { describe, expect, it, vi } from "vitest";
import { loadScaleInsightsProductImage } from "./scale-insights-product-image";

const asin = "B0FG4H5C6W";
const payload = (url = "https://m.media-amazon.com/images/I/51Li4sY51QL._SL75_.jpg", productAsin = asin) => ({ Country: "US", Products: [{ ASIN: productAsin, CountryCode: "US", Thumbnail: url }] });

describe("Scale Insights listing image", () => {
  it("uses the exact ASIN metadata and returns a bounded image in the existing storage format", async () => {
    const call = vi.fn().mockResolvedValue(payload());
    const download = vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { "Content-Type": "image/jpeg" } }));
    expect(await loadScaleInsightsProductImage(asin, call, download)).toEqual({ asin, imageDataUrl: "data:image/jpeg;base64,/9j/" });
    expect(call).toHaveBeenCalledWith("get_product_metadata", { asin_list: [asin], country: "US" });
    expect(download).toHaveBeenCalledWith(new URL(payload().Products[0].Thumbnail), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });

  it("rejects a different ASIN and untrusted URLs before downloading", async () => {
    const download = vi.fn();
    for (const value of [payload(undefined, "B000000000"), payload("https://localhost/images/I/a.jpg"), payload("https://m.media-amazon.com.evil.test/images/I/a.jpg"), payload("http://m.media-amazon.com/images/I/a.jpg")]) {
      await expect(loadScaleInsightsProductImage(asin, vi.fn().mockResolvedValue(value), download)).rejects.toThrow();
    }
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects non-images and oversized image streams", async () => {
    for (const response of [new Response("<html>", { headers: { "Content-Type": "text/html" } }), new Response(new Uint8Array(900_001), { headers: { "Content-Type": "image/jpeg" } })]) {
      await expect(loadScaleInsightsProductImage(asin, vi.fn().mockResolvedValue(payload()), vi.fn().mockResolvedValue(response))).rejects.toThrow();
    }
  });
});
