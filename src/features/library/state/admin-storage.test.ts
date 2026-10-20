import { describe, expect, it } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createBlankContentElement } from "../domain/document-elements";
import { moveDocument, parseAdminLibraryState } from "./admin-storage";

describe("admin library storage", () => {
  const seed = getPublishedDocuments().slice(0, 2);
  it("rejects missing or malformed state", () => { expect(parseAdminLibraryState("bad")).toBeNull(); expect(parseAdminLibraryState(null)).toBeNull(); });
  it("moves records without mutating input", () => { const moved = moveDocument(seed, seed[1].id, -1); expect(moved.map(document => document.id)).toEqual([seed[1].id, seed[0].id]); expect(seed[0].id).not.toBe(moved[0].id); });
  it("accepts new Button fields while retaining legacy elements without them", () => {
    const button = { ...createBlankContentElement("button", 1), buttonText: "Open", buttonUrl: "/library", buttonWidth: "large" as const, buttonAlignment: "right" as const };
    const legacy = createBlankContentElement("feature", 1);
    const value = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [legacy, button] }] });
    expect(parseAdminLibraryState(value)?.documents[0].contentElements).toHaveLength(2);
  });
  it("accepts supported Insight colors and rejects unsupported values", () => {
    const insight = { ...createBlankContentElement("insight", 1), insightColor: "red" as const };
    const valid = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [insight] }] });
    const invalid = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [{ ...insight, insightColor: "purple" }] }] });
    expect(parseAdminLibraryState(valid)?.documents[0].contentElements?.[0].insightColor).toBe("red");
    expect(parseAdminLibraryState(invalid)).toBeNull();
  });
  it("keeps a valid document but drops malformed rich text so legacy text can be used", () => {
    const statement = { ...createBlankContentElement("statement", 1), text: "Legacy fallback", richText: { type: "doc", content: [{ type: "script", text: "bad" }] } };
    const value = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [statement] }] });
    const parsed = parseAdminLibraryState(value)?.documents[0].contentElements?.[0];
    expect(parsed?.text).toBe("Legacy fallback");
    expect(parsed?.richText).toBeUndefined();
  });
  it("canonicalizes editor-only link attributes without dropping the document", () => {
    const statement = {
      ...createBlankContentElement("statement", 1),
      text: "Open guide",
      richText: {
        type: "doc",
        content: [{
          type: "paragraph",
          attrs: { textAlign: null },
          content: [{
            type: "text",
            text: "Open guide",
            marks: [{ type: "link", attrs: { href: "example.com/guide", target: "_blank", rel: "noopener noreferrer", class: null } }],
          }],
        }],
      },
    };
    const value = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [statement] }] });
    const parsed = parseAdminLibraryState(value)?.documents[0].contentElements?.[0].richText;
    expect(parsed).toMatchObject({
      content: [{ content: [{ marks: [{ type: "link", attrs: { href: "https://example.com/guide" } }] }] }],
    });
  });
  it("accepts aligned text elements and sanitizes diagnostic-flow description rich text", () => {
    const headline = { ...createBlankContentElement("headline", 1), text: "Headline", textAlignment: "right" as const };
    const flow = { ...createBlankContentElement("flowchart", 1), nodes: [{ title: "Step", text: "Next", description: "Legacy description", descriptionRichText: { type: "doc", content: [{ type: "script", text: "bad" }] } }] };
    const valid = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [headline, flow] }] });
    const parsed = parseAdminLibraryState(valid)?.documents[0].contentElements;
    expect(parsed?.[0]).toMatchObject({ type: "headline", textAlignment: "right" });
    expect(parsed?.[1].nodes[0]).toMatchObject({ description: "Legacy description", descriptionRichText: undefined });

    const invalid = JSON.stringify({ version: 1, documents: [{ ...seed[0], contentElements: [{ ...headline, textAlignment: "justify" }] }] });
    expect(parseAdminLibraryState(invalid)).toBeNull();
  });

  it("rejects the entire catalog instead of silently dropping one malformed document", () => {
    const invalid = { ...seed[1], hidden: "false" };
    expect(parseAdminLibraryState(JSON.stringify({ version: 1, documents: [seed[0], invalid] }))).toBeNull();
  });
});
