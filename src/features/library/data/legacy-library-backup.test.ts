import { describe, expect, it, vi } from "vitest";
import type { SharedLibraryState } from "../state/shared-library-state";

vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));

import { prepareLegacyCatalogImport } from "./legacy-library-backup";

describe("legacy Library import", () => {
  it("preserves the complete catalog without creating new tombstones", () => {
    const source = {
      version: 1,
      documents: [
        { id: "active", slug: "active", title: "Active document" },
        { id: "also-active", slug: "also-active", title: "Another active document" },
        { id: "deleted", slug: "deleted", title: "Previously deleted", deletedAt: "2025-01-01T00:00:00.000Z" },
      ],
      categories: [{ id: "guide", name: "Guide", hidden: false }],
    } as unknown as SharedLibraryState;

    const result = prepareLegacyCatalogImport(source);

    expect(result.state).toEqual(source);
    expect(result.state).not.toBe(source);
    expect(result.state.documents.every((document, index) => document !== source.documents[index])).toBe(true);
    expect(result.report).toEqual({
      documentCount: 3,
      categoryCount: 1,
      activeDocumentCount: 2,
      deletedDocumentCount: 1,
    });
  });
});
