import { DOCUMENT_TYPES, type LibraryContentElement, type LibraryDocument } from "../domain/types";
import { normalizeRichTextDocument } from "../domain/rich-text";

export type ManagedLibraryDocument = LibraryDocument & { deletedAt?: string; archivedAt?: string };
export type AdminLibraryState = { version: 1; documents: ManagedLibraryDocument[] };

function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === "string"); }
function isNumberArray(value: unknown) { return Array.isArray(value) && value.every(item => typeof item === "number" && Number.isFinite(item) && item > 0); }
function isTextPairArray(value: unknown) { return Array.isArray(value) && value.every(item => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).title === "string" && typeof (item as Record<string, unknown>).text === "string"); }
function isDiagnosticFlowNodeArray(value: unknown) { return Array.isArray(value) && value.every(item => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).title === "string" && typeof (item as Record<string, unknown>).text === "string" && ((item as Record<string, unknown>).description === undefined || typeof (item as Record<string, unknown>).description === "string")); }
function isRoadmapStepArray(value: unknown) { return Array.isArray(value) && value.every(item => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).title === "string" && typeof (item as Record<string, unknown>).text === "string" && ((item as Record<string, unknown>).imageUrl === undefined || typeof (item as Record<string, unknown>).imageUrl === "string") && ((item as Record<string, unknown>).textStyle === undefined || ["plain", "bullets", "checklist", "numbered"].includes(String((item as Record<string, unknown>).textStyle)))); }
function isGalleryImageArray(value: unknown) { return Array.isArray(value) && value.every(item => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string" && typeof (item as Record<string, unknown>).alt === "string"); }
function isContentElement(value: unknown): value is LibraryContentElement {
  if (!value || typeof value !== "object") return false;
  const element = value as Record<string, unknown>;
  const types = ["topic", "statement", "headline", "description", "quote", "bullets", "checklist", "numbered", "insight", "table", "accordion", "feature", "code", "timeline", "flowchart", "gallery", "button"];
  const textFields = ["id", "eyebrow", "label", "title", "text", "buttonText", "imageUrl"];
  return types.includes(String(element.type)) && textFields.every(field => typeof element[field] === "string") &&
    isStringArray(element.body) && isStringArray(element.items) && isStringArray(element.columns) &&
    Array.isArray(element.rows) && element.rows.every(isStringArray) &&
    (element.columnWidths === undefined || isNumberArray(element.columnWidths)) &&
    isRoadmapStepArray(element.steps) && isDiagnosticFlowNodeArray(element.nodes) &&
    (element.alignment === undefined || ["left", "center", "right"].includes(String(element.alignment))) &&
    (element.textAlignment === undefined || ["left", "center", "right"].includes(String(element.textAlignment))) &&
    (element.numberPosition === undefined || ["left", "center", "right"].includes(String(element.numberPosition))) &&
    (element.galleryColumns === undefined || [1, 2, 3, 4].includes(Number(element.galleryColumns))) &&
    (element.buttonUrl === undefined || typeof element.buttonUrl === "string") &&
    (element.buttonWidth === undefined || ["full", "large", "medium", "small"].includes(String(element.buttonWidth))) &&
    (element.buttonAlignment === undefined || ["left", "center", "right"].includes(String(element.buttonAlignment))) &&
    (element.insightColor === undefined || ["green", "blue", "red"].includes(String(element.insightColor))) &&
    (element.images === undefined || isGalleryImageArray(element.images)) &&
    (element.dropdowns === undefined || isTextPairArray(element.dropdowns));
}

function isDocument(value: unknown): value is ManagedLibraryDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return typeof doc.id === "string" && typeof doc.slug === "string" && typeof doc.title === "string" &&
    typeof doc.description === "string" && typeof doc.body === "string" && typeof doc.updatedAt === "string" &&
    typeof doc.category === "string" && DOCUMENT_TYPES.includes(doc.type as never) &&
    Array.isArray(doc.tags) && Array.isArray(doc.topics) && typeof doc.hidden === "boolean" &&
    (doc.deletedAt === undefined || typeof doc.deletedAt === "string") &&
    (doc.archivedAt === undefined || typeof doc.archivedAt === "string") &&
    (doc.videoUrl === undefined || typeof doc.videoUrl === "string") &&
    (doc.contentElements === undefined || (Array.isArray(doc.contentElements) && doc.contentElements.every(isContentElement)));
}

function sanitizeRichText(document: ManagedLibraryDocument): ManagedLibraryDocument {
  if (!document.contentElements) return document;
  return {
    ...document,
    contentElements: document.contentElements.map(element => {
      const next = { ...element };
      const richText = normalizeRichTextDocument(next.richText);
      const calloutRichText = normalizeRichTextDocument(next.calloutRichText);
      if (richText) next.richText = richText;
      else delete next.richText;
      if (calloutRichText) next.calloutRichText = calloutRichText;
      else delete next.calloutRichText;
      const itemRichText = next.itemRichText?.map(normalizeRichTextDocument);
      if (itemRichText?.every((item): item is NonNullable<typeof item> => Boolean(item))) next.itemRichText = itemRichText;
      else delete next.itemRichText;
      next.steps = next.steps.map(step => {
        const stepRichText = normalizeRichTextDocument(step.richText) ?? undefined;
        return { ...step, richText: stepRichText };
      });
      next.nodes = next.nodes.map(node => {
        const descriptionRichText = normalizeRichTextDocument(node.descriptionRichText) ?? undefined;
        return { ...node, description: node.description ?? "", descriptionRichText };
      });
      next.dropdowns = next.dropdowns?.map(dropdown => {
        const dropdownRichText = normalizeRichTextDocument(dropdown.richText) ?? undefined;
        return { ...dropdown, richText: dropdownRichText };
      });
      return next;
    }),
  };
}

export function normalizeManagedLibraryDocument(document: ManagedLibraryDocument): ManagedLibraryDocument | null {
  return isDocument(document) ? sanitizeRichText(document) : null;
}

export function normalizeManagedLibraryContentUpdate(document: ManagedLibraryDocument): ManagedLibraryDocument | null {
  const normalized = normalizeManagedLibraryDocument(document);
  return normalized && Array.isArray(normalized.contentElements) ? normalized : null;
}

export function parseAdminLibraryState(raw: string | null): AdminLibraryState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const state = value as Record<string, unknown>;
    if (state.version !== 1 || !Array.isArray(state.documents)) return null;
    const documents = state.documents.map(item => normalizeManagedLibraryDocument(item as ManagedLibraryDocument));
    if (documents.some(document => !document)) return null;
    return { version: 1, documents: documents as ManagedLibraryDocument[] };
  } catch {
    return null;
  }
}

export function moveDocument(documents: ManagedLibraryDocument[], id: string, direction: -1 | 1) {
  const active = documents.filter(document => !document.deletedAt); const position = active.findIndex(document => document.id === id); const targetPosition = position + direction;
  if (position < 0 || targetPosition < 0 || targetPosition >= active.length) return documents;
  const index = documents.findIndex(document => document.id === id); const target = documents.findIndex(document => document.id === active[targetPosition].id);
  const next = [...documents]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
