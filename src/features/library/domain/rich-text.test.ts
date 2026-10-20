import { describe, expect, it } from "vitest";
import { isRichTextDocument, normalizeRichTextHref, richTextFromMarkdown, richTextFromPlainText, richTextToPlainText, richTextToRoadmapStyle } from "./rich-text";

describe("library rich text", () => {
  it("converts supported legacy Markdown into the persisted document model", () => {
    const document = richTextFromMarkdown("Purpose with **bold** and *italic*.\n\n- First\n- Second\n\n- [x] Complete");
    expect(document.content.map(node => node.type)).toEqual(["paragraph", "bulletList", "taskList"]);
    expect(document.content[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "bold", marks: [{ type: "bold" }] }),
      expect.objectContaining({ text: "italic", marks: [{ type: "italic" }] }),
    ]));
    expect(document.content[2].content?.[0].attrs).toEqual({ checked: true });
    expect(richTextToPlainText(document)).toBe("Purpose with bold and italic.\nFirst\nSecond\nComplete");
  });

  it("preserves legacy line breaks and derives the roadmap fallback style", () => {
    const plain = richTextFromPlainText("First row\nSecond row");
    const numbered = richTextFromPlainText("First\nSecond", "numbered");
    expect(plain.content).toHaveLength(2);
    expect(richTextToRoadmapStyle(numbered)).toBe("numbered");
  });

  it("rejects unsupported nodes, marks, attributes, and extra properties", () => {
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Safe", marks: [{ type: "bold" }] }] }] })).toBe(true);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Linked", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] }] })).toBe(true);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "heading", content: [] }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "No", marks: [{ type: "link" }] }] }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "justify" } }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "No", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "paragraph", evil: true }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "bulletList", content: [{ type: "paragraph" }] }] })).toBe(false);
    expect(isRichTextDocument({ type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", content: [{ type: "paragraph" }] }] }] })).toBe(false);
  });

  it("normalizes supported links and rejects unsafe schemes", () => {
    expect(normalizeRichTextHref("example.com/help")).toBe("https://example.com/help");
    expect(normalizeRichTextHref("/library/example")).toBe("/library/example");
    expect(normalizeRichTextHref("team@example.com")).toBe("mailto:team@example.com");
    expect(normalizeRichTextHref("mailto:team@example.com")).toBe("mailto:team@example.com");
    expect(normalizeRichTextHref("javascript:alert(1)")).toBeNull();
    expect(richTextFromMarkdown("[Guide](example.com/guide)").content[0].content?.[0]).toMatchObject({ marks: [{ type: "link", attrs: { href: "https://example.com/guide" } }] });
  });
});
