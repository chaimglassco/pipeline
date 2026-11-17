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

  it("merges terms across products, drops covered terms and ASIN targets, and ranks by orders", () => {
    const result = discoverProductTerms([
      { productName: "Lead Came", terms: [row("lead came 3/16", 9), row("Zinc  Came", 2), row("b0dysbw3x5", 7), row("lead came 1/4 h channel", 1, 40)] },
      { productName: "Plastic Fids", terms: [row("zinc came", 3)] },
    ], catalog);
    expect(result.map(candidate => candidate.term)).toEqual(["zinc came", "lead came 1/4 h channel"]);
    expect(result[0]).toMatchObject({ orders: 5, foundVia: ["Lead Came", "Plastic Fids"] });
  });
});
