import type { DashboardProduct } from "./ppc-dashboard-state";

type WorkspaceProduct = { id?: unknown; name?: unknown; asin?: unknown; sku?: unknown; stageId?: unknown };

export function normalizeDashboardProducts(value: unknown): DashboardProduct[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const state = (value as Record<string, unknown>).state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const products = (state as Record<string, unknown>).userProducts;
  if (!Array.isArray(products)) return [];
  const seen = new Set<string>();
  return products.flatMap((candidate): DashboardProduct[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const product = candidate as WorkspaceProduct;
    const id = String(product.id ?? "").trim();
    const name = String(product.name ?? "").trim();
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name,
      asin: String(product.asin ?? "").trim(),
      sku: String(product.sku ?? "").trim(),
      stageId: String(product.stageId ?? "product-research").trim() || "product-research",
      status: "Active",
    }];
  });
}

