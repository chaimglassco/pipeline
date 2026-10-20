import { describe, expect, it } from "vitest";
import { createDefaultCategories, moveCategory, parseCategoryState } from "./category-storage";

describe("admin category storage", () => {
  it("rejects empty or malformed serialized categories", () => {
    expect(parseCategoryState(null)).toBeNull();
    expect(parseCategoryState("bad")).toBeNull();
  });

  it("reorders active categories without mutating the input", () => {
    const categories = createDefaultCategories().slice(0, 3);
    const moved = moveCategory(categories, categories[1].id, -1);
    expect(moved[0].id).toBe(categories[1].id);
    expect(categories[0].id).not.toBe(moved[0].id);
  });

  it("rejects the entire response instead of silently dropping a malformed category", () => {
    const categories = createDefaultCategories().slice(0, 2);
    expect(parseCategoryState(JSON.stringify({
      version: 1,
      categories: [categories[0], { ...categories[1], hidden: "false" }],
    }))).toBeNull();
  });
});
