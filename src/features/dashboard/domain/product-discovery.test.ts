import { describe, expect, it } from "vitest";
import { discoverProductTerms, isCoveredByCatalog } from "./product-discovery";

const catalog = ["Lead Came Round U - 3/16 - 2 Pack", "Plastic Fids Set"];
const row = (term: string, orders: number, clicks = 10) => ({ term, sales: orders * 20, orders, spend: 5, impressions: 100, clicks });

describe("product discovery", () => {
  it("treats a term as covered only when one product name contains all its words", () => {
    expect(isCoveredByCatalog("lead came 3/16", catalog)).toBe(true);
    expect(isCoveredByCatalog("plastic fid", catalog)).toBe(true);
    expect(isCoveredByCatalog("lead came 1/4 h channel", catalog)).toBe(false);
    expect(isCoveredByCatalog("zinc came", catalog)).toBe(false);
  });

  it("drops terms we already sell (any order, or covered by a product name) and ASIN targets, and ranks by clicks", () => {
    const result = discoverProductTerms([
      { productName: "Lead Came", terms: [row("lead came 3/16", 0), row("lead came for stained glass", 38), row("Zinc  Came", 0, 12), row("b0dysbw3x5", 0), row("lead came 1/4 h channel", 0, 40), row("copper foil", 0, 5)] },
      { productName: "Plastic Fids", terms: [row("zinc came", 0, 8), row("copper foil", 1)] },
    ], catalog);
    expect(result.map(candidate => candidate.term)).toEqual(["lead came 1/4 h channel", "zinc came"]);
    expect(result[1]).toMatchObject({ clicks: 20, orders: 0, foundVia: ["Lead Came", "Plastic Fids"] });
  });
});
