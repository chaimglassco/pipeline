import { verifyPipelineRequest, getPipelineOrigin } from "@/lib/pipeline-auth-server";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { withScaleInsightsToolSession, ScaleInsightsAuthorizationRequiredError } from "@/features/dashboard/data/scale-insights-server";
import { loadScaleInsightsProductDetails } from "@/features/dashboard/data/scale-insights-product-details";
import { buildProductExportWorkbook, type ProductExportRow } from "@/features/dashboard/data/product-export-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store, max-age=0" };
const MAX_PRODUCTS = 500;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

type RequestedProduct = { asin: string; sku: string; name: string };

function parseProducts(body: unknown): RequestedProduct[] | null {
  const list = typeof body === "object" && body !== null ? (body as { products?: unknown }).products : undefined;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PRODUCTS) return null;
  const products: RequestedProduct[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const { asin, sku, name } = item as Record<string, unknown>;
    const cleanAsin = typeof asin === "string" ? asin.trim().toUpperCase() : "";
    if (cleanAsin && !ASIN_PATTERN.test(cleanAsin)) return null;
    products.push({ asin: cleanAsin, sku: typeof sku === "string" ? sku.slice(0, 200) : "", name: typeof name === "string" ? name.slice(0, 300) : "" });
  }
  return products;
}

export async function POST(request: Request) {
  const verified = await verifyPipelineRequest(request);
  if (verified instanceof Response) return verified;
  if (!verified.user.id) return Response.json({ error: "Sign in through Product Pipeline to continue." }, { status: 401, headers });

  const products = parseProducts(await request.json().catch(() => null));
  if (!products) return Response.json({ error: `Send between 1 and ${MAX_PRODUCTS} products with valid ASINs.` }, { status: 400, headers });

  const asins = products.map(product => product.asin).filter(Boolean);
  try {
    const details = asins.length ? await withScaleInsightsToolSession(
      { userId: verified.user.id, issuer: getPipelineOrigin(), callbackUrl: new URL(withPpcBasePath("/dashboard"), request.url).toString() },
      ({ definitions, callTool }) => {
        if (!definitions.some(tool => tool.name === "get_product_metadata")) throw new Error("Scale Insights did not advertise product metadata access.");
        // Field names only (never values), so the real Scale Insights listing schema can be reviewed in logs.
        return loadScaleInsightsProductDetails(asins, callTool, fieldNames => console.info(JSON.stringify({ route: "/api/dashboard/product-export", event: "product_metadata_fields", products: asins.length, fieldNames })));
      },
    ) : [];
    const byAsin = new Map(details.map(detail => [detail.asin, detail]));
    const rows: ProductExportRow[] = products.map(product => ({ ...product, details: product.asin ? byAsin.get(product.asin) ?? null : null }));
    const file = await buildProductExportWorkbook(rows);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(file), {
      headers: {
        ...headers,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="amazon-product-details-${date}.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof ScaleInsightsAuthorizationRequiredError
      ? "Connect Scale Insights from the dashboard first, then export again."
      : "Could not retrieve Amazon product details from Scale Insights. Please try again.";
    console.warn(JSON.stringify({ route: "/api/dashboard/product-export", event: "export_failed", kind: error instanceof Error ? error.name : "unknown" }));
    return Response.json({ error: message }, { status: 502, headers });
  }
}
