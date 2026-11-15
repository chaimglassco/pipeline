import ExcelJS from "exceljs";
import type { ProductListingDetails } from "./scale-insights-product-details";

export type ProductExportRow = { asin: string; sku: string; name: string; details: ProductListingDetails | null };

const MIN_BULLETS = 5;

function statusFor(row: ProductExportRow) {
  if (!row.asin) return "No ASIN";
  if (!row.details?.found) return "Not found in Scale Insights";
  const missing = [
    !row.details.title && "title",
    !row.details.bullets.length && "bullets",
    !row.details.description && "description",
    !row.details.price && "price",
    !row.details.images.length && "images",
  ].filter(Boolean);
  return missing.length ? `Not provided by Scale Insights: ${missing.join(", ")}` : "Complete";
}

/** Builds the Products export as an .xlsx buffer: one row per product. Image cells are clickable links. */
export async function buildProductExportWorkbook(rows: ProductExportRow[], exportedAt = new Date()): Promise<Buffer> {
  const bulletCount = Math.max(MIN_BULLETS, ...rows.map(row => row.details?.bullets.length ?? 0));
  const imageCount = Math.max(1, ...rows.map(row => row.details?.images.length ?? 0));
  const extraKeys = [...new Set(rows.flatMap(row => Object.keys(row.details?.extra ?? {})))].sort();

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "ASIN", key: "asin", width: 14 },
    { header: "SKU", key: "sku", width: 28 },
    { header: "Product name (dashboard)", key: "name", width: 32 },
    { header: "Amazon title", key: "title", width: 60 },
    { header: "Price", key: "price", width: 12 },
    ...Array.from({ length: bulletCount }, (_, index) => ({ header: `Bullet ${index + 1}`, key: `bullet${index + 1}`, width: 50 })),
    { header: "Description", key: "description", width: 70 },
    ...Array.from({ length: imageCount }, (_, index) => ({ header: index === 0 ? "Main image" : `Image ${index + 1}`, key: `image${index + 1}`, width: 45 })),
    { header: "Export status", key: "status", width: 40 },
    ...extraKeys.map(key => ({ header: key, key: `extra:${key}`, width: 20 })),
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const details = row.details;
    const values: Record<string, ExcelJS.CellValue> = {
      asin: row.asin,
      sku: row.sku,
      name: row.name,
      title: details?.title ?? "",
      price: details?.price ?? "",
      description: details?.description ?? "",
      status: statusFor(row),
    };
    details?.bullets.forEach((bullet, index) => { values[`bullet${index + 1}`] = bullet; });
    details?.images.forEach((url, index) => { values[`image${index + 1}`] = { text: url, hyperlink: url }; });
    for (const key of extraKeys) values[`extra:${key}`] = details?.extra[key] ?? "";
    const added = sheet.addRow(values);
    added.alignment = { vertical: "top", wrapText: true };
    details?.images.forEach((_, index) => { added.getCell(`image${index + 1}`).font = { color: { argb: "FF0563C1" }, underline: true }; });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
