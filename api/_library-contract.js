const LIBRARY_STATE_VERSION = 1;
const DOCUMENT_IMMUTABLE_FIELDS = Object.freeze(["id", "slug"]);
const DOCUMENT_TYPES = new Set(["Guide", "SOP", "Checklist", "Template", "Playbook"]);
const DOCUMENT_STATUSES = new Set(["published", "draft"]);
const CONTENT_ELEMENT_TYPES = new Set(["topic", "statement", "headline", "description", "quote", "bullets", "checklist", "numbered", "insight", "table", "accordion", "feature", "code", "timeline", "flowchart", "gallery", "button"]);

const LIBRARY_OPERATION_PERMISSIONS = Object.freeze({
  "catalog.initialize": new Set(["ADMIN"]),
  "document.create": new Set(["ADMIN", "USER"]),
  "document.update": new Set(["ADMIN", "USER"]),
  "document.delete": new Set(["ADMIN"]),
  "document.restore": new Set(["ADMIN"]),
  "document.archive": new Set(["ADMIN"]),
  "document.restoreArchived": new Set(["ADMIN"]),
  "document.purge": new Set(["ADMIN"]),
  "record.restoreVersion": new Set(["ADMIN"]),
  "records.restoreFromSnapshot": new Set(["ADMIN"]),
  "integrity.acknowledge": new Set(["ADMIN"]),
  "documents.restoreSystemDeleted": new Set(["ADMIN"]),
  "documents.reorder": new Set(["ADMIN"]),
  "category.create": new Set(["ADMIN"]),
  "category.update": new Set(["ADMIN"]),
  "category.delete": new Set(["ADMIN"]),
  "category.restore": new Set(["ADMIN"]),
  "categories.reorder": new Set(["ADMIN"]),
});

function normalizeLibraryRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "VIEWER" ? normalized : "USER";
}

function isLibraryInitialized(revision) {
  const value = Number(revision);
  return Number.isSafeInteger(value) && value > 0;
}

function getDocumentProtectedFields(role) {
  return normalizeLibraryRole(role) === "ADMIN"
    ? [...DOCUMENT_IMMUTABLE_FIELDS]
    : [...DOCUMENT_IMMUTABLE_FIELDS, "hidden", "status"];
}

function sanitizeDocumentForCreate(document, role) {
  const sanitized = { ...document };
  delete sanitized.deletedAt;
  delete sanitized.archivedAt;
  if (normalizeLibraryRole(role) !== "ADMIN") {
    sanitized.hidden = false;
    sanitized.status = "published";
  }
  return sanitized;
}

function applyDocumentUpdatePolicy(currentDocument, incomingDocument, role) {
  const next = { ...incomingDocument };
  delete next.deletedAt;
  delete next.archivedAt;
  for (const field of getDocumentProtectedFields(role)) next[field] = currentDocument[field];
  return next;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveNumberArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0);
}

function isTextPairArray(value) {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item)
    && typeof item.title === "string" && typeof item.text === "string");
}

function isContentElement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const textFields = ["id", "eyebrow", "label", "title", "text", "buttonText", "imageUrl"];
  if (!CONTENT_ELEMENT_TYPES.has(String(value.type)) || !textFields.every((field) => typeof value[field] === "string")) return false;
  if (!isStringArray(value.body) || !isStringArray(value.items) || !isStringArray(value.columns)) return false;
  if (!Array.isArray(value.rows) || !value.rows.every(isStringArray)) return false;
  if (value.columnWidths !== undefined && !isPositiveNumberArray(value.columnWidths)) return false;
  if (!Array.isArray(value.steps) || !value.steps.every((step) => step && typeof step === "object" && !Array.isArray(step)
    && typeof step.title === "string" && typeof step.text === "string"
    && (step.imageUrl === undefined || typeof step.imageUrl === "string")
    && (step.textStyle === undefined || ["plain", "bullets", "checklist", "numbered"].includes(String(step.textStyle))))) return false;
  if (!Array.isArray(value.nodes) || !value.nodes.every((node) => node && typeof node === "object" && !Array.isArray(node)
    && typeof node.title === "string" && typeof node.text === "string"
    && (node.description === undefined || typeof node.description === "string"))) return false;
  if (value.alignment !== undefined && !["left", "center", "right"].includes(String(value.alignment))) return false;
  if (value.textAlignment !== undefined && !["left", "center", "right"].includes(String(value.textAlignment))) return false;
  if (value.numberPosition !== undefined && !["left", "center", "right"].includes(String(value.numberPosition))) return false;
  if (value.galleryColumns !== undefined && ![1, 2, 3, 4].includes(Number(value.galleryColumns))) return false;
  if (value.buttonUrl !== undefined && typeof value.buttonUrl !== "string") return false;
  if (value.buttonWidth !== undefined && !["full", "large", "medium", "small"].includes(String(value.buttonWidth))) return false;
  if (value.buttonAlignment !== undefined && !["left", "center", "right"].includes(String(value.buttonAlignment))) return false;
  if (value.insightColor !== undefined && !["green", "blue", "red"].includes(String(value.insightColor))) return false;
  if (value.images !== undefined && (!Array.isArray(value.images) || !value.images.every((image) => image && typeof image === "object" && !Array.isArray(image)
    && typeof image.url === "string" && typeof image.alt === "string"))) return false;
  if (value.dropdowns !== undefined && !isTextPairArray(value.dropdowns)) return false;
  return true;
}

function normalizeLibraryDocument(value) {
  const document = { ...requireObject(value, "Library document") };
  document.id = requireId(document.id, "Document id");
  document.slug = requireId(document.slug, "Document slug");
  for (const field of ["title", "description", "body", "updatedAt", "category"]) {
    if (typeof document[field] !== "string") throw validationError(`Document ${field} must be a string.`);
  }
  if (!DOCUMENT_TYPES.has(document.type)) throw validationError("Document type is invalid.");
  if (!DOCUMENT_STATUSES.has(document.status)) throw validationError("Document status is invalid.");
  if (!isStringArray(document.tags)) throw validationError("Document tags must be a string array.");
  if (!Array.isArray(document.topics) || !document.topics.every((topic) => topic && typeof topic === "object" && !Array.isArray(topic)
    && typeof topic.id === "string" && typeof topic.title === "string" && typeof topic.level === "number" && Number.isFinite(topic.level))) {
    throw validationError("Document topics are invalid.");
  }
  if (typeof document.hidden !== "boolean") throw validationError("Document hidden must be a boolean.");
  if (typeof document.readingMinutes !== "number" || !Number.isFinite(document.readingMinutes) || document.readingMinutes < 0) {
    throw validationError("Document readingMinutes must be a non-negative number.");
  }
  if (document.videoUrl !== undefined && typeof document.videoUrl !== "string") throw validationError("Document videoUrl must be a string.");
  if (document.deletedAt !== undefined && (typeof document.deletedAt !== "string" || !Number.isFinite(Date.parse(document.deletedAt)))) {
    throw validationError("Document deletedAt must be a valid date string.");
  }
  if (document.archivedAt !== undefined && (typeof document.archivedAt !== "string" || !Number.isFinite(Date.parse(document.archivedAt)))) {
    throw validationError("Document archivedAt must be a valid date string.");
  }
  if (document.contentElements !== undefined && (!Array.isArray(document.contentElements) || !document.contentElements.every(isContentElement))) {
    throw validationError("Document contentElements are invalid.");
  }
  return document;
}

function normalizeLibraryCategory(value) {
  const category = { ...requireObject(value, "Library category") };
  category.id = requireId(category.id, "Category id");
  category.name = requireId(category.name, "Category name");
  if (typeof category.hidden !== "boolean") throw validationError("Category hidden must be a boolean.");
  if (category.deletedAt !== undefined && (typeof category.deletedAt !== "string" || !Number.isFinite(Date.parse(category.deletedAt)))) {
    throw validationError("Category deletedAt must be a valid date string.");
  }
  if (category.archivedAt !== undefined && (typeof category.archivedAt !== "string" || !Number.isFinite(Date.parse(category.archivedAt)))) {
    throw validationError("Category archivedAt must be a valid date string.");
  }
  return category;
}

function requireLibraryOperationPermission(role, operationType) {
  const allowedRoles = LIBRARY_OPERATION_PERMISSIONS[operationType];
  if (!allowedRoles) {
    const error = new Error("Unknown library operation.");
    error.statusCode = 400;
    throw error;
  }
  if (!allowedRoles.has(normalizeLibraryRole(role))) {
    const error = new Error(operationType.startsWith("document.") && normalizeLibraryRole(role) === "VIEWER"
      ? "Viewer access is read-only."
      : "Admin access required for this library operation.");
    error.statusCode = 403;
    throw error;
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function requireId(value, label) {
  const id = String(value || "").trim();
  if (!id) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function requireVersion(value, label) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    const error = new Error(`${label} must be a non-negative integer.`);
    error.statusCode = 400;
    throw error;
  }
  return version;
}

function normalizeIdList(value, label) {
  if (!Array.isArray(value)) {
    const error = new Error(`${label} must be an array.`);
    error.statusCode = 400;
    throw error;
  }
  const ids = value.map((entry) => requireId(entry, `${label} entry`));
  if (new Set(ids).size !== ids.length) {
    const error = new Error(`${label} cannot contain duplicate ids.`);
    error.statusCode = 400;
    throw error;
  }
  return ids;
}

function normalizeLibraryState(value) {
  const state = requireObject(value, "Library state");
  if (Number(state.version) !== LIBRARY_STATE_VERSION || !Array.isArray(state.documents) || !Array.isArray(state.categories)) {
    const error = new Error("Library state must use version 1 with documents and categories arrays.");
    error.statusCode = 400;
    throw error;
  }
  const documents = state.documents.map(normalizeLibraryDocument);
  const categories = state.categories.map(normalizeLibraryCategory);
  if (new Set(documents.map(({ id }) => id)).size !== documents.length) {
    const error = new Error("Library state contains duplicate document ids.");
    error.statusCode = 400;
    throw error;
  }
  if (new Set(documents.map(({ slug }) => slug)).size !== documents.length) {
    const error = new Error("Library state contains duplicate document slugs.");
    error.statusCode = 400;
    throw error;
  }
  if (new Set(categories.map(({ id }) => id)).size !== categories.length) {
    const error = new Error("Library state contains duplicate category ids.");
    error.statusCode = 400;
    throw error;
  }
  return { version: LIBRARY_STATE_VERSION, documents, categories };
}

function normalizeLibraryOperation(value) {
  const operation = { ...requireObject(value, "Library operation") };
  operation.type = requireId(operation.type, "Library operation type");
  switch (operation.type) {
    case "catalog.initialize":
      return { type: operation.type, state: normalizeLibraryState(operation.state), expectedRevision: requireVersion(operation.expectedRevision, "Expected revision") };
    case "document.create": {
      const document = normalizeLibraryDocument(operation.document);
      return { type: operation.type, document };
    }
    case "document.update": {
      const document = normalizeLibraryDocument(operation.document);
      const documentId = requireId(operation.documentId, "Document id");
      if (document.id !== documentId) {
        const error = new Error("Document id cannot be changed.");
        error.statusCode = 400;
        throw error;
      }
      return { type: operation.type, documentId, expectedVersion: requireVersion(operation.expectedVersion, "Expected document version"), document };
    }
    case "document.delete":
    case "document.restore":
    case "document.archive":
    case "document.restoreArchived":
    case "document.purge":
      return { type: operation.type, documentId: requireId(operation.documentId, "Document id"), expectedVersion: requireVersion(operation.expectedVersion, "Expected document version") };
    case "record.restoreVersion":
      return {
        type: operation.type,
        recordType: ["document", "category"].includes(String(operation.recordType)) ? String(operation.recordType) : (() => { throw validationError("Record type must be document or category."); })(),
        recordId: requireId(operation.recordId, "Record id"),
        versionId: requireId(operation.versionId, "Version id"),
        expectedVersion: requireVersion(operation.expectedVersion, "Expected record version"),
      };
    case "records.restoreFromSnapshot": {
      const recordType = ["document", "category"].includes(String(operation.recordType)) ? String(operation.recordType) : (() => { throw validationError("Record type must be document or category."); })();
      const recordIds = normalizeIdList(operation.recordIds, "Record ids");
      if (!recordIds.length) throw validationError("At least one record is required.");
      return {
        type: operation.type,
        snapshotId: requireId(operation.snapshotId, "Snapshot id"),
        recordType,
        recordIds,
        expectedRevision: requireVersion(operation.expectedRevision, "Expected revision"),
      };
    }
    case "integrity.acknowledge":
      return {
        type: operation.type,
        incidentId: requireId(operation.incidentId, "Incident id"),
        expectedRevision: requireVersion(operation.expectedRevision, "Expected revision"),
      };
    case "documents.restoreSystemDeleted": {
      const documentIds = normalizeIdList(operation.documentIds, "Document ids");
      if (!documentIds.length) throw validationError("At least one system-deleted document is required.");
      return {
        type: operation.type,
        documentIds,
        expectedRevision: requireVersion(operation.expectedRevision, "Expected revision"),
      };
    }
    case "documents.reorder":
      return { type: operation.type, documentIds: normalizeIdList(operation.documentIds, "Document ids"), expectedRevision: requireVersion(operation.expectedRevision, "Expected revision") };
    case "category.create": {
      const category = normalizeLibraryCategory(operation.category);
      return { type: operation.type, category };
    }
    case "category.update": {
      const category = normalizeLibraryCategory(operation.category);
      const categoryId = requireId(operation.categoryId, "Category id");
      if (category.id !== categoryId) {
        const error = new Error("Category id cannot be changed.");
        error.statusCode = 400;
        throw error;
      }
      return { type: operation.type, categoryId, expectedVersion: requireVersion(operation.expectedVersion, "Expected category version"), category };
    }
    case "category.delete":
    case "category.restore":
      return { type: operation.type, categoryId: requireId(operation.categoryId, "Category id"), expectedVersion: requireVersion(operation.expectedVersion, "Expected category version") };
    case "categories.reorder":
      return { type: operation.type, categoryIds: normalizeIdList(operation.categoryIds, "Category ids"), expectedRevision: requireVersion(operation.expectedRevision, "Expected revision") };
    default:
      requireLibraryOperationPermission("ADMIN", operation.type);
      return operation;
  }
}

function normalizeLibraryMutationBody(value) {
  const body = requireObject(value, "Library mutation body");
  if (typeof body.operation === "string") {
    return normalizeLibraryOperation({ ...body, type: body.operation });
  }
  return normalizeLibraryOperation(body.operation);
}

module.exports = {
  DOCUMENT_IMMUTABLE_FIELDS,
  LIBRARY_STATE_VERSION,
  applyDocumentUpdatePolicy,
  getDocumentProtectedFields,
  isLibraryInitialized,
  normalizeLibraryMutationBody,
  normalizeLibraryOperation,
  normalizeLibraryRole,
  normalizeLibraryCategory,
  normalizeLibraryDocument,
  normalizeLibraryState,
  requireLibraryOperationPermission,
  sanitizeDocumentForCreate,
};
