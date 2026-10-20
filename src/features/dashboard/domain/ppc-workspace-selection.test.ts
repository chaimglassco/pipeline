import { describe, expect, it } from "vitest";
import { parsePpcWorkspaceSelection, serializePpcWorkspaceSelection } from "./ppc-workspace-selection";

describe("PPC workspace selection", () => {
  const currentWeek = "2026-09-23";

  it("restores a selected earlier reporting week and product", () => {
    const raw = serializePpcWorkspaceSelection({ productId: "product-2", weekStart: "2026-09-16", selectedMonths: ["2026-09"] });
    expect(parsePpcWorkspaceSelection(raw, currentWeek)).toEqual({ productId: "product-2", weekStart: "2026-09-16", selectedMonths: ["2026-09"] });
  });

  it("rejects an invalid or future selection instead of losing the default view", () => {
    expect(parsePpcWorkspaceSelection('{"version":1,"productId":"p","weekStart":"2026-09-30","selectedMonths":["2026-09"]}', currentWeek)).toBeNull();
    expect(parsePpcWorkspaceSelection('{"version":1,"productId":"p","weekStart":"2026-09-16","selectedMonths":["2026-13"]}', currentWeek)).toBeNull();
  });
});
