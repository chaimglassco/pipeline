import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { loadScaleInsightsProductDetails, parseProductListing } from "./scale-insights-product-details";
import { buildProductExportWorkbook } from "./product-export-workbook";

describe("Scale Insights product details", () => {
  it("reads common listing field names and keeps unknown simple fields as extras", () => {
    const details = parseProductListing("B0DYSBW3X5", {
      ASIN: "B0DYSBW3X5", CountryCode: "US", Title: "Round U Lead Came 3/16", BulletPoints: ["Soft lead", " Two 6 ft strips "],
      ProductDescription: "Came for stained glass.", Price: { Amount: 24.99, CurrencyCode: "USD" },
      Images: ["https://m.media-amazon.com/images/I/a.jpg", { url: "https://m.media-amazon.com/images/I/b.jpg" }, "http://insecure.test/c.jpg"],
      Thumbnail: "https://m.media-amazon.com/images/I/a.jpg", Brand: "Glassco", Rating: 4.7, Nested: { ignored: true },
    });
    expect(details).toEqual({
      asin: "B0DYSBW3X5", found: true, title: "Round U Lead Came 3/16", bullets: ["Soft lead", "Two 6 ft strips"],
      description: "Came for stained glass.", price: "24.99 USD",
      images: ["https://m.media-amazon.com/images/I/a.jpg", "https://m.media-amazon.com/images/I/b.jpg"],
      extra: { Brand: "Glassco", Rating: "4.7" },
    });
  });

  it("splits newline bullets and leaves absent fields empty instead of guessing", () => {
    const details = parseProductListing("B0DCTX18KK", { ASIN: "B0DCTX18KK", Features: "• First\n- Second\n\n", Thumbnail: "https://m.media-amazon.com/images/I/t.jpg" });
    expect(details.bullets).toEqual(["First", "Second"]);
    expect([details.title, details.description, details.price]).toEqual(["", "", ""]);
    expect(details.images).toEqual(["https://m.media-amazon.com/images/I/t.jpg"]);
    expect(parseProductListing("B0D1PHP7HQ", undefined)).toMatchObject({ found: false, bullets: [], images: [] });
  });

  it("batches ASINs, keeps request order and ignores other countries or unrequested ASINs", async () => {
    const asins = Array.from({ length: 25 }, (_, index) => `B0${String(index).padStart(8, "0")}`);
    const call = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      structuredContent: { Country: "US", Products: [
        ...(args.asin_list as string[]).map(asin => ({ ASIN: asin, CountryCode: "US", Title: `Title ${asin}` })),
        { ASIN: "B0OTHER0001", CountryCode: "US", Title: "Not requested" },
        { ASIN: asins[0], CountryCode: "CA", Title: "Wrong market" },
      ] },
    }));
    const fields = vi.fn();
    const details = await loadScaleInsightsProductDetails([...asins].reverse(), call, fields);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0]).toEqual(["get_product_metadata", { asin_list: asins.slice().reverse().slice(0, 20), country: "US" }]);
    expect(details.map(detail => detail.asin)).toEqual([...asins].reverse());
    expect(details.find(detail => detail.asin === asins[0])?.title).toBe(`Title ${asins[0]}`);
    expect(fields).toHaveBeenCalledWith(["ASIN", "CountryCode", "Title"]);
  });
});

describe("Products Excel export", () => {
  it("writes one row per product with bullets, description, price, image links and a status", async () => {
    const found = parseProductListing("B0DYSBW3X5", { ASIN: "B0DYSBW3X5", Title: "Lead Came", BulletPoints: ["One"], Price: "12.50", Images: ["https://m.media-amazon.com/images/I/a.jpg"], Brand: "Glassco" });
    const buffer = await buildProductExportWorkbook([
      { asin: "B0DYSBW3X5", sku: "SKU-1", name: "Round U", details: found },
      { asin: "B0DCTX18KK", sku: "SKU-2", name: "Round H", details: parseProductListing("B0DCTX18KK", undefined) },
      { asin: "", sku: "SKU-3", name: "Draft", details: null },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Products")!;
    const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1);
    expect(header).toEqual(["ASIN", "SKU", "Product name (dashboard)", "Amazon title", "Price", "Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5", "Description", "Main image", "Export status", "Brand"]);
    const cell = (row: number, column: string) => sheet.getRow(row).getCell(header.indexOf(column) + 1).value;
    expect([cell(2, "ASIN"), cell(2, "Amazon title"), cell(2, "Price"), cell(2, "Bullet 1"), cell(2, "Brand")]).toEqual(["B0DYSBW3X5", "Lead Came", "12.50", "One", "Glassco"]);
    expect(cell(2, "Main image")).toEqual({ text: "https://m.media-amazon.com/images/I/a.jpg", hyperlink: "https://m.media-amazon.com/images/I/a.jpg" });
    expect(cell(2, "Export status")).toBe("Not provided by Scale Insights: description");
    expect(cell(3, "Export status")).toBe("Not found in Scale Insights");
    expect(cell(4, "Export status")).toBe("No ASIN");
  });
});
