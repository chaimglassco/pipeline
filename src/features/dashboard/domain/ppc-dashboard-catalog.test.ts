import { describe, expect, it } from "vitest";
import { mergeDashboardProducts, orderDashboardProductsByTag, parseDashboardCatalogStore, reorderVisibleProducts } from "./ppc-dashboard-catalog";

describe("PPC dashboard catalog", () => {
  it("groups the All Tags catalog in the requested tag order while preserving order inside each group", () => {
    const tags = [
      { id: "kiln", name: "Kiln Paper" }, { id: "lead", name: "Lead Came" }, { id: "shard", name: "Shard Catcher" },
      { id: "comp", name: "Complementary" }, { id: "board", name: "Homasote Board" },
    ];
    const products = [
      ["unknown", ""], ["kiln-1", "kiln"], ["lead-1", "lead"], ["comp-1", "comp"],
      ["lead-2", "lead"], ["board-1", "board"], ["shard-1", "shard"],
    ].map(([id, tagId]) => ({ id, name: id, asin: "", sku: "", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId, imageDataUrl: "" }));

    expect(orderDashboardProductsByTag(products, tags).map(product => product.id)).toEqual([
      "lead-1", "lead-2", "comp-1", "board-1", "shard-1", "kiln-1", "unknown",
    ]);
  });

  it("reorders filtered products without shifting unrelated product slots", () => {
    expect(reorderVisibleProducts(["a", "x", "b", "y", "c"], ["a", "b", "c"], "c", "a")).toEqual(["c", "x", "a", "y", "b"]);
    expect(reorderVisibleProducts(["a", "b"], ["a", "b"], "missing", "a")).toEqual(["a", "b"]);
  });

  it("restores a validated saved order while retaining new products", () => {
    const catalog = parseDashboardCatalogStore(JSON.stringify({ version: 1, productOrderIds: ["b", "a", "b", null, 42] }));
    const products = ["a", "b", "c"].map(id => ({ id, name: id, asin: "", sku: "", stageId: "launch", status: "Active" as const }));
    expect(catalog.productOrderIds).toEqual(["b", "a"]);
    expect(mergeDashboardProducts(products, catalog).map(product => product.id)).toEqual(["b", "a", "c"]);
  });
  it("fails closed and removes malformed, duplicate, and orphaned values", () => {
    const parsed = parseDashboardCatalogStore(JSON.stringify({
      version: 1,
      tags: [{ id: "tag-a", name: "Launch" }, { id: "tag-b", name: "launch" }, { id: "", name: "Invalid" }],
      customProducts: [
        { id: "custom-1", name: "Cleaner", asin: "b012345678", sku: "SKU-1", tagId: "tag-a", imageDataUrl: "javascript:alert(1)" },
        { id: "custom-1", name: "Duplicate" },
      ],
      productOverrides: {
        "pipeline-1": { name: "Renamed", asin: "b000000001", sku: "P-1", tagId: "missing", imageDataUrl: "" },
      },
      hiddenPipelineProductIds: ["pipeline-hidden", "pipeline-hidden", "", 42],
    }));

    expect(parsed.tags).toEqual([{ id: "tag-a", name: "Launch" }]);
    expect(parsed.customProducts).toHaveLength(1);
    expect(parsed.customProducts[0]).toMatchObject({ asin: "B012345678", tagId: "tag-a", imageDataUrl: "" });
    expect(parsed.productOverrides["pipeline-1"].tagId).toBe("");
    expect(parsed.hiddenPipelineProductIds).toEqual(["pipeline-hidden"]);
  });

  it("applies local overrides without changing the Pipeline source object", () => {
    const pipeline = [{ id: "pipeline-1", name: "Original", asin: "A", sku: "S", stageId: "research", status: "Active" as const }];
    const merged = mergeDashboardProducts(pipeline, {
      version: 1,
      tags: [{ id: "tag-launch", name: "Launch" }],
      customProducts: [],
      productOverrides: { "pipeline-1": { name: "Dashboard Name", asin: "B", sku: "T", tagId: "tag-launch", imageDataUrl: "" } },
      hiddenPipelineProductIds: [],
    });

    expect(merged[0]).toMatchObject({ name: "Dashboard Name", tagId: "tag-launch", source: "pipeline" });
    expect(pipeline[0].name).toBe("Original");
  });

  it("filters locally hidden Pipeline products without changing the source list", () => {
    const pipeline = [
      { id: "pipeline-1", name: "Keep", asin: "A", sku: "S", stageId: "research", status: "Active" as const },
      { id: "pipeline-2", name: "Hide", asin: "B", sku: "T", stageId: "launch", status: "Active" as const },
    ];
    const merged = mergeDashboardProducts(pipeline, {
      version: 1,
      tags: [],
      customProducts: [],
      productOverrides: {},
      hiddenPipelineProductIds: ["pipeline-2"],
    });

    expect(merged.map(product => product.id)).toEqual(["pipeline-1"]);
    expect(pipeline).toHaveLength(2);
  });
});
