import { slugifyHeading } from "./headings";
import { resolveRichText, richTextFromMarkdown } from "./rich-text";
import type { LibraryContentElement, LibraryContentElementType, LibraryDocument, Topic } from "./types";

const emptyElement = (type: LibraryContentElementType, id: string): LibraryContentElement => ({
  id,
  type,
  eyebrow: "Part 1",
  label: "",
  title: "",
  text: "",
  insightColor: type === "insight" ? "green" : undefined,
  body: [""],
  callout: "",
  items: [""],
  columns: ["Column 1", "Column 2"],
  rows: [["", ""]],
  buttonText: "",
  buttonUrl: type === "button" ? "" : undefined,
  buttonWidth: type === "button" ? "medium" : undefined,
  buttonAlignment: type === "button" ? "center" : undefined,
  imageUrl: "",
  steps: [{ title: "", text: "", imageUrl: "", textStyle: "plain" }],
  alignment: type === "timeline" ? "left" : undefined,
  textAlignment: type === "headline" || type === "description" ? "left" : undefined,
  numberPosition: type === "timeline" ? "left" : undefined,
  nodes: [{ title: "", text: "", description: "" }],
  dropdowns: type === "accordion" ? [{ title: "", text: "" }] : undefined,
  galleryColumns: type === "gallery" ? 1 : undefined,
  images: type === "gallery" ? [{ url: "", alt: "" }] : undefined,
});

export function createBlankContentElement(type: LibraryContentElementType, partNumber: number) {
  const element = emptyElement(type, `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  if (type === "topic") return { ...element, eyebrow: `Part ${partNumber}`, label: `Topic ${partNumber}` };
  if (type === "table") return { ...element, columns: ["", ""], rows: [["", ""]] };
  if (type === "accordion") return { ...element, dropdowns: [{ title: "", text: "" }] };
  if (type === "timeline") return { ...element, alignment: "left" as const, numberPosition: "left" as const, steps: [{ title: "", text: "", imageUrl: "", textStyle: "plain" as const }, { title: "", text: "", imageUrl: "", textStyle: "plain" as const }] };
  if (type === "gallery") return { ...element, galleryColumns: 1 as const, images: [{ url: "", alt: "" }] };
  if (type === "button") return { ...element, buttonText: "", buttonUrl: "", buttonWidth: "medium" as const, buttonAlignment: "center" as const };
  if (type === "flowchart") return { ...element, nodes: [{ title: "", text: "", description: "" }, { title: "", text: "", description: "" }] };
  return element;
}

function cleanMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*|#{1,6}\s+)/gm, "")
    .replace(/^\s*\[[ xX]\]\s*/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/gm, "")
    .trim();
}

function topicElement(id: string, title: string, body: string, partNumber: number): LibraryContentElement {
  const richText = richTextFromMarkdown(body);
  return {
    ...emptyElement("topic", id),
    eyebrow: `Part ${partNumber}`,
    label: title,
    title,
    body: body.split(/\n\s*\n/).map(cleanMarkdown).filter(Boolean),
    richText,
  };
}

function cloneElement(element: LibraryContentElement): LibraryContentElement {
  const next: LibraryContentElement = {
    ...element,
    body: [...element.body],
    items: [...element.items],
    columns: [...element.columns],
    rows: element.rows.map(row => [...row]),
    columnWidths: element.columnWidths ? [...element.columnWidths] : undefined,
    steps: element.steps.map(step => ({
      ...step,
      richText: resolveRichText(step.richText, step.text, step.textStyle ?? "plain"),
    })),
    nodes: element.nodes.map(node => ({
      ...node,
      description: node.description ?? "",
      descriptionRichText: resolveRichText(node.descriptionRichText, node.description ?? ""),
    })),
    dropdowns: element.dropdowns?.map(dropdown => ({
      ...dropdown,
      richText: resolveRichText(dropdown.richText, dropdown.text),
    })),
    images: element.images?.map(image => ({ ...image })),
  };
  if (["topic", "statement", "headline", "description", "quote", "insight", "feature"].includes(element.type)) {
    const fallback = element.type === "topic" ? element.body.join("\n\n") : element.text;
    next.richText = resolveRichText(element.richText, fallback);
  }
  if (element.type === "topic" && (element.callout || element.calloutRichText)) {
    next.calloutRichText = resolveRichText(element.calloutRichText, element.callout ?? "");
  }
  if (["bullets", "checklist", "numbered"].includes(element.type)) {
    next.itemRichText = element.items.map((item, index) => resolveRichText(element.itemRichText?.[index], item));
  }
  return next;
}

export function getInitialContentElements(document: LibraryDocument): LibraryContentElement[] {
  if (document.contentElements?.length) return document.contentElements.map(cloneElement);

  const headings = [...document.body.matchAll(/^##\s+(.+)$/gm)];
  if (!headings.length) {
    return [topicElement("introduction", document.title, document.body, 1)];
  }

  return headings.map((match, index) => {
    const title = cleanMarkdown(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? document.body.length;
    const matchingTopic = document.topics.find(topic => topic.level === 2 && topic.title === title);
    const id = matchingTopic?.id ?? (slugifyHeading(title) || `topic-${index + 1}`);
    return topicElement(id, title, document.body.slice(start, end), index + 1);
  });
}

export function getTopicsFromContentElements(elements: LibraryContentElement[]): Topic[] {
  return elements.filter(element => element.type === "topic").map((element, index) => ({
    id: element.id,
    title: element.label || element.title || `Topic ${index + 1}`,
    level: 2,
  }));
}
