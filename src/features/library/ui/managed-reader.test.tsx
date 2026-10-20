import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createBlankContentElement } from "../domain/document-elements";
import type { ManagedLibraryDocument } from "../state/admin-storage";
import { createDefaultCategories } from "../state/category-storage";
import { SharedLibraryRequestError } from "../state/shared-library-client";
import type { SharedLibraryResponse } from "../state/shared-library-state";
import { getLinkableDocumentOptions, ManagedReader } from "./managed-reader";

const client = vi.hoisted(() => ({
  fetchSharedLibraryState: vi.fn(),
  hydrateSharedLibraryState: vi.fn(),
  mutateSharedLibrary: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  get: vi.fn(() => null as string | null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => ({ get: navigation.get }),
}));

vi.mock("../state/shared-library-client", async importOriginal => {
  const actual = await importOriginal<typeof import("../state/shared-library-client")>();
  return { ...actual, ...client };
});

vi.mock("./reader", () => ({
  Reader: ({ doc, mutationsEnabled, onSaveContentElements, documentLinkCatalog }: {
    doc: { title: string; description: string; category: string; contentElements?: unknown[] };
    mutationsEnabled: boolean;
    onSaveContentElements: (elements: unknown[], metadata: { title: string; description: string; category: string }) => Promise<void>;
    documentLinkCatalog?: {
      options: Array<{ title: string }>;
      status: string;
      onRequest: () => void;
    };
  }) =>
    <div data-testid="reader">
      {doc.title}:{mutationsEnabled ? "editable" : "read-only"}
      <button type="button" onClick={() => {
        void onSaveContentElements(doc.contentElements ?? [], {
          title: doc.title,
          description: doc.description,
          category: doc.category,
        }).catch(() => undefined);
      }}>Save formatted document</button>
      <button type="button" onClick={documentLinkCatalog?.onRequest}>Load document links</button>
      <span data-testid="document-link-catalog">{documentLinkCatalog?.status}:{documentLinkCatalog?.options.map(option => option.title).join(",")}</span>
    </div>,
}));

function response(documents: ManagedLibraryDocument[] = getPublishedDocuments().slice(0, 1)): SharedLibraryResponse {
  const manifest = documents.map(document => ({
    id: document.id,
    slug: document.slug,
    recordVersion: 1,
    lifecycleState: "active" as const,
    hidden: document.hidden,
    status: document.status,
  }));
  return {
    initialized: true,
    state: { version: 1, documents, categories: createDefaultCategories() },
    revision: 2,
    recordVersions: { documents: Object.fromEntries(documents.map(document => [document.id, 1])), categories: {} },
    updatedAt: null,
    updatedBy: null,
    recordManifest: { documents: manifest },
    catalogCompleteness: {
      complete: true,
      scope: "document",
      expectedDocumentCount: documents.length,
      returnedDocumentCount: documents.length,
      expectedCategoryCount: createDefaultCategories().length,
      returnedCategoryCount: createDefaultCategories().length,
      activeDocumentCount: documents.length,
      manifestDocumentCount: manifest.length,
      checksum: "reader-test",
    },
    ...(documents[0] ? {
      documentStatus: {
        status: "active" as const,
        slug: documents[0].slug,
        documentId: documents[0].id,
        recordVersion: 1,
      },
    } : {}),
  };
}

describe("document link catalog", () => {
  it("keeps only other active, published, visible, complete documents and sorts them by title", () => {
    const [current, visible, hidden, draft, deleted, archived, incomplete] = getPublishedDocuments().slice(0, 7);
    const catalog = response([
      current,
      { ...visible, title: "Zulu guide" },
      { ...getPublishedDocuments()[7], title: "Alpha guide" },
      { ...hidden, hidden: true },
      { ...draft, status: "draft" },
      { ...deleted, deletedAt: "2026-07-31T00:00:00.000Z" },
      { ...archived, archivedAt: "2026-07-31T00:00:00.000Z" },
      incomplete,
    ]);
    catalog.recordIntegrity = { documents: {
      [incomplete.id]: {
        status: "incomplete",
        documentId: incomplete.id,
        slug: incomplete.slug,
        title: incomplete.title,
        recordVersion: 2,
        reasonCode: "DOCUMENT_SCHEMA_INVALID",
        hasRecoveryCandidate: true,
      },
    } };

    expect(getLinkableDocumentOptions(catalog, current.id).map(option => option.title)).toEqual(["Alpha guide", "Zulu guide"]);
  });
});

describe("managed reader loading states", () => {
  beforeEach(() => {
    client.fetchSharedLibraryState.mockReset();
    client.hydrateSharedLibraryState.mockReset();
    client.mutateSharedLibrary.mockReset();
    navigation.replace.mockReset();
    navigation.get.mockReset();
    navigation.get.mockReturnValue(null);
  });
  afterEach(cleanup);

  it("loads one shared authoritative document-link catalog on demand", async () => {
    const documents = getPublishedDocuments();
    const current = documents[0];
    const target = { ...documents[1], title: "Link target" };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response([current]), source: "server" });
    client.fetchSharedLibraryState.mockResolvedValue(response([current, target]));
    render(<ManagedReader slug={current.slug} />);

    await screen.findByText(`${current.title}:editable`);
    const load = screen.getByRole("button", { name: "Load document links" });
    fireEvent.click(load);
    fireEvent.click(load);

    await waitFor(() => expect(screen.getByTestId("document-link-catalog")).toHaveTextContent("ready:Link target"));
    expect(client.fetchSharedLibraryState).toHaveBeenCalledTimes(1);
    expect(client.fetchSharedLibraryState).toHaveBeenCalledWith(expect.any(AbortSignal), { summary: true, integrityPreview: true });
  });

  it("shows a retryable connection error instead of claiming the document is unavailable", async () => {
    client.hydrateSharedLibraryState.mockRejectedValue(new Error("offline"));
    render(<ManagedReader slug="checking-spend" />);

    expect(await screen.findByRole("heading", { name: "Library connection unavailable" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Document unavailable" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("identifies a malformed historical record as requiring recovery instead of a connection outage", async () => {
    client.hydrateSharedLibraryState.mockRejectedValue(new SharedLibraryRequestError(
      "The Library contains a malformed record.",
      503,
      "LIBRARY_CATALOG_INCOMPLETE",
      "read-library-state-document-snapshot",
    ));
    render(<ManagedReader slug="checking-spend" />);

    expect(await screen.findByRole("heading", { name: "Document recovery required" })).toBeVisible();
    expect(screen.getByText(/prior versions remain protected in Recovery/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Library" })).toBeVisible();
  });

  it("shows Document unavailable only after an authoritative response has no matching document", async () => {
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response([]), source: "server" });
    render(<ManagedReader slug="missing-document" />);

    expect(await screen.findByRole("heading", { name: "Document unavailable" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Library connection unavailable" })).not.toBeInTheDocument();
  });

  it("shows a full cached document read-only during an outage", async () => {
    const document = getPublishedDocuments()[0];
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response([document]), source: "cache" });
    render(<ManagedReader slug={document.slug} />);

    expect(await screen.findByTestId("reader")).toHaveTextContent(`${document.title}:read-only`);
    expect(screen.getByText(/confirmed copy is read-only/i)).toBeVisible();
  });

  it("loads the document after a manual retry succeeds", async () => {
    const document = getPublishedDocuments()[0];
    client.hydrateSharedLibraryState.mockRejectedValue(new Error("offline"));
    client.fetchSharedLibraryState.mockResolvedValue(response([document]));
    render(<ManagedReader slug={document.slug} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`));
  });

  it("explains a deleted stale link and lets an ADMIN recover it", async () => {
    const document = getPublishedDocuments()[0];
    const deletedResponse: SharedLibraryResponse = {
      ...response([]),
      recoveryDocumentCount: 1,
      documentStatus: {
        status: "deleted",
        slug: document.slug,
        documentId: document.id,
        title: document.title,
        deletedAt: "2026-07-28T01:00:00.000Z",
        recordVersion: 4,
        deletionAudit: {
          source: "user",
          deletedAt: "2026-07-28T01:00:00.000Z",
          reason: "Manual document deletion",
          actor: { name: "Admin User", email: "admin@example.com", role: "ADMIN" },
          initiatedBy: null,
        },
      },
    };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: deletedResponse, source: "server" });
    client.mutateSharedLibrary.mockResolvedValue(response([document]));
    render(<ManagedReader slug={document.slug} />);

    expect(await screen.findByRole("heading", { name: `“${document.title}” was deleted` })).toBeVisible();
    expect(screen.getByText(/Deleted .* by Admin User/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Recover document" }));

    await waitFor(() => expect(client.mutateSharedLibrary).toHaveBeenCalledWith({
      operation: "document.restore",
      documentId: document.id,
      expectedVersion: 4,
    }, { slug: document.slug }));
    await waitFor(() => expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`));
  });

  it("keeps an active document visible after a verified formatted-content save", async () => {
    const base = getPublishedDocuments()[0];
    const statement = {
      ...createBlankContentElement("statement", 1),
      text: "Open guide",
      richText: {
        type: "doc" as const,
        content: [{
          type: "paragraph" as const,
          content: [{
            type: "text" as const,
            text: "Open guide",
            marks: [{ type: "link" as const, attrs: { href: "https://example.com/guide" } }],
          }],
        }],
      },
    };
    const document = { ...base, contentElements: [statement] };
    const initial = response([document]);
    const saved: SharedLibraryResponse = {
      ...initial,
      revision: 3,
      recordVersions: { ...initial.recordVersions, documents: { [document.id]: 2 } },
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 2 },
      mutationResult: {
        operation: "document.update",
        documentId: document.id,
        document,
        recordVersion: 2,
        lifecycleState: "active",
      },
    };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: initial, source: "server" });
    client.mutateSharedLibrary.mockResolvedValue(saved);
    render(<ManagedReader slug={document.slug} />);

    fireEvent.click(await screen.findByRole("button", { name: "Save formatted document" }));

    await waitFor(() => expect(client.mutateSharedLibrary).toHaveBeenCalledWith(expect.objectContaining({
      operation: "document.update",
      documentId: document.id,
      expectedVersion: 1,
      updateScope: "content",
      document: expect.objectContaining({ id: document.id, contentElements: [expect.objectContaining({ richText: statement.richText })] }),
    }), { slug: document.slug }));
    expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
    expect(screen.queryByRole("heading", { name: "Document unavailable" })).not.toBeInTheDocument();
  });

  it("keeps editing controls enabled after a transient save-confirmation failure", async () => {
    const document = { ...getPublishedDocuments()[0], contentElements: [createBlankContentElement("statement", 1)] };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response([document]), source: "server" });
    client.mutateSharedLibrary.mockRejectedValue(new SharedLibraryRequestError(
      "Temporary confirmation failure.",
      503,
      "LIBRARY_DATABASE_UNAVAILABLE",
      "read-library-document",
      true,
    ));
    render(<ManagedReader slug={document.slug} />);

    expect(await screen.findByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
    fireEvent.click(screen.getByRole("button", { name: "Save formatted document" }));

    expect(await screen.findByText(/save could not be confirmed/i)).toBeVisible();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
  });

  it("preserves the current document when a save response cannot prove it stayed active", async () => {
    const document = { ...getPublishedDocuments()[0], contentElements: [createBlankContentElement("statement", 1)] };
    const initial = response([document]);
    client.hydrateSharedLibraryState.mockResolvedValue({ response: initial, source: "server" });
    client.mutateSharedLibrary.mockResolvedValue({
      ...response([]),
      revision: 3,
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 2 },
    });
    render(<ManagedReader slug={document.slug} />);

    fireEvent.click(await screen.findByRole("button", { name: "Save formatted document" }));

    expect(await screen.findByText(/save could not be verified/i)).toBeVisible();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
    expect(screen.queryByRole("heading", { name: "Document unavailable" })).not.toBeInTheDocument();
  });

  it("rejects a valid-looking mutation result when the authoritative read omits the saved document", async () => {
    const document = { ...getPublishedDocuments()[0], contentElements: [createBlankContentElement("statement", 1)] };
    const initial = response([document]);
    client.hydrateSharedLibraryState.mockResolvedValue({ response: initial, source: "server" });
    client.mutateSharedLibrary.mockResolvedValue({
      ...response([]),
      revision: 3,
      recordVersions: { documents: { [document.id]: 2 }, categories: {} },
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 2 },
      mutationResult: {
        operation: "document.update",
        documentId: document.id,
        document,
        recordVersion: 2,
        lifecycleState: "active",
      },
    });
    render(<ManagedReader slug={document.slug} />);

    fireEvent.click(await screen.findByRole("button", { name: "Save formatted document" }));

    expect(await screen.findByText(/save could not be verified/i)).toBeVisible();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
    expect(screen.queryByRole("heading", { name: "Document unavailable" })).not.toBeInTheDocument();
  });

  it("rejects a catalog summary placeholder before submitting a formatted-content update", async () => {
    const full = { ...getPublishedDocuments()[0], contentElements: [createBlankContentElement("statement", 1)] };
    const summary = {
      ...full,
      body: "",
      topics: [],
      contentElements: undefined,
    };
    const initial = {
      ...response([summary]),
      catalogCompleteness: {
        ...response([summary]).catalogCompleteness!,
        scope: "catalog" as const,
      },
    };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: initial, source: "server" });
    render(<ManagedReader slug={full.slug} />);

    fireEvent.click(await screen.findByRole("button", { name: "Save formatted document" }));

    expect(await screen.findByText(/full document is not confirmed/i)).toBeVisible();
    expect(client.mutateSharedLibrary).not.toHaveBeenCalled();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${full.title}:editable`);
  });

  it("keeps the last confirmed document read-only when a refresh omits it without an explicit lifecycle", async () => {
    const document = getPublishedDocuments()[0];
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response([document]), source: "server" });
    client.fetchSharedLibraryState.mockResolvedValue({
      ...response([]),
      revision: 3,
      documentStatus: { status: "not_found", slug: document.slug },
    });
    render(<ManagedReader slug={document.slug} />);

    expect(await screen.findByTestId("reader")).toHaveTextContent(`${document.title}:editable`);
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByText(/current editor copy was preserved/i)).toBeVisible());
    expect(screen.getByTestId("reader")).toHaveTextContent(`${document.title}:read-only`);
    expect(screen.queryByRole("heading", { name: "Document unavailable" })).not.toBeInTheDocument();
  });

  it("opens the newest validated protected version read-only and lets an ADMIN restore it", async () => {
    const protectedDocument = getPublishedDocuments()[0];
    const safeSummary = { ...protectedDocument, title: "Untitled document", body: "", topics: [], contentElements: undefined };
    const incomplete = {
      ...response([safeSummary]),
      recordVersions: { documents: { [protectedDocument.id]: 6 }, categories: {} },
      recordManifest: {
        documents: [{
          id: protectedDocument.id,
          slug: protectedDocument.slug,
          recordVersion: 6,
          lifecycleState: "active" as const,
          hidden: false,
          status: "published" as const,
        }],
      },
      documentStatus: {
        status: "incomplete" as const,
        slug: protectedDocument.slug,
        documentId: protectedDocument.id,
        title: protectedDocument.title,
        recordVersion: 6,
        reasonCode: "DOCUMENT_SCHEMA_INVALID" as const,
        hasRecoveryCandidate: true,
      },
      recordIntegrity: {
        documents: {
          [protectedDocument.id]: {
            status: "incomplete" as const,
            documentId: protectedDocument.id,
            slug: protectedDocument.slug,
            title: protectedDocument.title,
            recordVersion: 6,
            reasonCode: "DOCUMENT_SCHEMA_INVALID" as const,
            hasRecoveryCandidate: true,
            recoveryCandidateVersionId: "version-5",
            recoveryCandidateRecordVersion: 5,
            recoveryCandidateCreatedAt: "2026-07-30T10:00:00.000Z",
          },
        },
      },
      recoveryPreview: {
        document: protectedDocument,
        versionId: "version-5",
        recordVersion: 5,
        createdAt: "2026-07-30T10:00:00.000Z",
        operationType: "document.update",
        actorEmail: "admin@example.com",
      },
    };
    const restored = {
      ...response([protectedDocument]),
      revision: 3,
      recordVersions: { documents: { [protectedDocument.id]: 7 }, categories: {} },
      recordManifest: {
        documents: [{
          id: protectedDocument.id,
          slug: protectedDocument.slug,
          recordVersion: 7,
          lifecycleState: "active" as const,
          hidden: false,
          status: "published" as const,
        }],
      },
      documentStatus: {
        status: "active" as const,
        slug: protectedDocument.slug,
        documentId: protectedDocument.id,
        recordVersion: 7,
      },
    };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: incomplete, source: "server" });
    client.mutateSharedLibrary.mockResolvedValue(restored);
    render(<ManagedReader slug={protectedDocument.slug} />);

    expect(await screen.findByText(/Needs recovery/)).toBeVisible();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${protectedDocument.title}:read-only`);
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));

    await waitFor(() => expect(client.mutateSharedLibrary).toHaveBeenCalledWith({
      operation: "documents.restoreIncomplete",
      records: [{
        documentId: protectedDocument.id,
        versionId: "version-5",
        expectedVersion: 6,
      }],
      expectedRevision: 2,
    }, { slug: protectedDocument.slug, integrityPreview: true }));
    expect(await screen.findByText(/was recovered successfully/i)).toBeVisible();
    expect(screen.getByTestId("reader")).toHaveTextContent(`${protectedDocument.title}:editable`);
  });

  it("explains when an incomplete active document has no restorable protected version", async () => {
    const document = getPublishedDocuments()[0];
    const incomplete = {
      ...response([document]),
      recordVersions: { documents: { [document.id]: 4 }, categories: {} },
      recordManifest: {
        documents: [{
          id: document.id,
          slug: document.slug,
          recordVersion: 4,
          lifecycleState: "active" as const,
          hidden: false,
          status: "published" as const,
        }],
      },
      documentStatus: {
        status: "incomplete" as const,
        slug: document.slug,
        documentId: document.id,
        title: document.title,
        recordVersion: 4,
        reasonCode: "DOCUMENT_SCHEMA_INVALID" as const,
        hasRecoveryCandidate: false,
      },
      recordIntegrity: {
        documents: {
          [document.id]: {
            status: "incomplete" as const,
            documentId: document.id,
            slug: document.slug,
            title: document.title,
            recordVersion: 4,
            reasonCode: "DOCUMENT_SCHEMA_INVALID" as const,
            hasRecoveryCandidate: false,
          },
        },
      },
      recoveryPreview: undefined,
    };
    client.hydrateSharedLibraryState.mockResolvedValue({ response: incomplete, source: "server" });
    render(<ManagedReader slug={document.slug} />);

    expect(await screen.findByRole("heading", { name: "Document recovery required" })).toBeVisible();
    expect(screen.getByText(/no protected version passes the current validator/i)).toBeVisible();
    expect(client.mutateSharedLibrary).not.toHaveBeenCalled();
  });
});
