import { describe, expect, it } from "vitest";
import { createBlankContentElement, getInitialContentElements, getTopicsFromContentElements } from "./document-elements";
import type { LibraryDocument } from "./types";

const document = {
  id: "test", slug: "test", title: "Test", description: "Test", category: "Account Auditing", type: "Guide", tags: [], updatedAt: "2026-07-15", status: "published", hidden: false, readingMinutes: 1,
  body: "## First topic\n\nFirst paragraph.\n\n## Second topic\n\nSecond paragraph.",
  topics: [{ id: "first-topic", title: "First topic", level: 2 }, { id: "second-topic", title: "Second topic", level: 2 }],
} satisfies LibraryDocument;

describe("document content elements", () => {
  it("converts legacy markdown headings into editable topic elements", () => {
    const elements = getInitialContentElements(document);
    expect(elements.map(element => element.id)).toEqual(["first-topic", "second-topic"]);
    expect(elements[0].body).toEqual(["First paragraph."]);
  });

  it("creates the supplied defaults for complex elements", () => {
    expect(createBlankContentElement("checklist", 1).items).toEqual([""]);
    expect(createBlankContentElement("insight", 1).insightColor).toBe("green");
    expect(createBlankContentElement("table", 1).rows).toEqual([["", ""]]);
    expect(createBlankContentElement("accordion", 1).dropdowns).toEqual([{ title: "", text: "" }]);
    expect(createBlankContentElement("timeline", 1)).toMatchObject({ alignment: "left", steps: [{ imageUrl: "", textStyle: "plain" }, { imageUrl: "", textStyle: "plain" }] });
    expect(createBlankContentElement("gallery", 1)).toMatchObject({ galleryColumns: 1, images: [{ url: "", alt: "" }] });
    expect(createBlankContentElement("button", 1)).toMatchObject({ buttonText: "", buttonUrl: "", buttonWidth: "medium", buttonAlignment: "center" });
    expect(createBlankContentElement("headline", 1)).toMatchObject({ textAlignment: "left" });
    expect(createBlankContentElement("description", 1)).toMatchObject({ textAlignment: "left" });
    expect(createBlankContentElement("flowchart", 1).nodes).toEqual([
      { title: "", text: "", description: "" },
      { title: "", text: "", description: "" },
    ]);
  });

  it("derives numbered reader topics from topic blocks only", () => {
    const elements = [...getInitialContentElements(document), createBlankContentElement("quote", 3)];
    expect(getTopicsFromContentElements(elements).map(topic => topic.title)).toEqual(["First topic", "Second topic"]);
  });

  it("preserves saved dropdown groups and table column widths", () => {
    const accordion = { ...createBlankContentElement("accordion", 1), dropdowns: [{ title: "First", text: "One" }, { title: "Second", text: "Two" }] };
    const table = { ...createBlankContentElement("table", 1), columnWidths: [180, 320] };
    const structured = { ...document, contentElements: [accordion, table] };
    const elements = getInitialContentElements(structured);
    expect(elements[0].dropdowns).toHaveLength(2);
    expect(elements[1].columnWidths).toEqual([180, 320]);
  });

  it("hydrates legacy diagnostic-flow nodes with empty rich-text descriptions", () => {
    const flow = { ...createBlankContentElement("flowchart", 1), nodes: [{ title: "Legacy step", text: "Continue" }] };
    const [hydrated] = getInitialContentElements({ ...document, contentElements: [flow] });
    expect(hydrated.nodes[0]).toMatchObject({ title: "Legacy step", text: "Continue", description: "", descriptionRichText: { type: "doc" } });
  });
});
