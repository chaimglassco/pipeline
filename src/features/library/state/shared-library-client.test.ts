import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createDefaultCategories } from "./category-storage";
import { fetchSharedLibraryState, getSharedLibraryCacheKey, hydrateSharedLibraryState, initializeSharedLibrary, mutateSharedLibrary, reconcileSharedLibraryDocumentCaches, SHARED_LIBRARY_CACHE_KEY, SHARED_LIBRARY_REQUEST_TIMEOUT_MS, SharedLibraryIncompleteResponseError, SharedLibraryRequestError, SharedLibraryTimeoutError, verifyRestoredIncompleteDocuments, verifyRestoredLibraryDocument } from "./shared-library-client";

const documents = getPublishedDocuments().slice(0, 1);
const categories = createDefaultCategories();
const response = {
  initialized: true,
  state: { version: 1 as const, documents, categories },
  revision: 2,
  recordVersions: {
    documents: { [documents[0].id]: 1 },
    categories: Object.fromEntries(categories.map(category => [category.id, 1])),
  },
  updatedAt: null,
  updatedBy: null,
  recordManifest: {
    documents: [{
      id: documents[0].id,
      slug: documents[0].slug,
      recordVersion: 1,
      lifecycleState: "active" as const,
      hidden: documents[0].hidden,
      status: documents[0].status,
    }],
  },
  catalogCompleteness: {
    complete: true as const,
    scope: "catalog" as const,
    expectedDocumentCount: 1,
    returnedDocumentCount: 1,
    expectedCategoryCount: categories.length,
    returnedCategoryCount: categories.length,
    activeDocumentCount: 1,
    manifestDocumentCount: 1,
    checksum: "catalog-checksum",
  },
};

describe("shared library client", () => {
  beforeEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("uses only the last server-confirmed cache when the server is unavailable", async () => {
    window.localStorage.setItem(SHARED_LIBRARY_CACHE_KEY, JSON.stringify(response));
    window.localStorage.setItem("glassco-library-admin-state", JSON.stringify({ version: 1, documents: [{ ...response.state.documents[0], id: "stale-local" }] }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const hydrated = await hydrateSharedLibraryState(window.localStorage);
    expect(hydrated.source).toBe("cache");
    expect(hydrated.response.state.documents.map(document => document.id)).not.toContain("stale-local");
  });

  it("never uploads local storage during hydration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await hydrateSharedLibraryState(window.localStorage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).not.toMatchObject({ method: "PATCH" });
  });

  it("sends scoped mutations with PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await mutateSharedLibrary({ operation: "document.create", document: response.state.documents[0] });
    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"operation":"document.create"') }));
  });

  it("accepts a focused document update confirmation when optional recovery metadata is malformed", async () => {
    const document = response.state.documents[0];
    const updated = {
      ...response,
      revision: 3,
      recordVersions: { ...response.recordVersions, documents: { [document.id]: 2 } },
      recordManifest: {
        documents: [{ ...response.recordManifest.documents[0], recordVersion: 2 }],
      },
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 2 },
      mutationResult: {
        operation: "document.update",
        documentId: document.id,
        document,
        recordVersion: 2,
        lifecycleState: "active",
      },
      recordIntegrity: { documents: "malformed optional data" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 })));

    await expect(mutateSharedLibrary({
      operation: "document.update",
      documentId: document.id,
      expectedVersion: 1,
      updateScope: "content",
      document: { ...document, contentElements: [] },
    }, { slug: document.slug })).resolves.toMatchObject({
      mutationResult: { documentId: document.id, recordVersion: 2 },
    });
  });

  it("preserves structured retry details from a failed shared Library request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "The shared Library database did not respond in time. Please retry.",
      code: "LIBRARY_DATABASE_TIMEOUT",
      stage: "read-library-state",
      retryable: true,
      requestId: "req-structured",
    }), { status: 503, headers: { "X-Request-ID": "req-structured" } })));

    await expect(mutateSharedLibrary({ operation: "document.create", document: response.state.documents[0] }))
      .rejects.toMatchObject({
        name: "SharedLibraryRequestError",
        status: 503,
        code: "LIBRARY_DATABASE_TIMEOUT",
        stage: "read-library-state",
        retryable: true,
        requestId: "req-structured",
      } satisfies Partial<SharedLibraryRequestError>);
  });

  it("reports the HTTP status and request reference for a non-JSON proxy failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Gateway failure", {
      status: 500,
      headers: { "X-Request-ID": "req-proxy" },
    })));

    await expect(mutateSharedLibrary({ operation: "document.create", document: response.state.documents[0] }))
      .rejects.toThrow("Shared library request failed (HTTP 500). Reference: req-proxy.");
  });

  it("validates fetched response envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })));
    await expect(fetchSharedLibraryState()).resolves.toMatchObject({ revision: 2 });
  });

  it("rejects an incomplete successful response so hydration preserves the confirmed cache", async () => {
    window.localStorage.setItem(SHARED_LIBRARY_CACHE_KEY, JSON.stringify(response));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...response,
      state: { ...response.state, documents: [] },
    }), { status: 200 })));

    await expect(fetchSharedLibraryState()).rejects.toBeInstanceOf(SharedLibraryIncompleteResponseError);
    const hydrated = await hydrateSharedLibraryState(window.localStorage);
    expect(hydrated.source).toBe("cache");
    expect(hydrated.response.state.documents[0].id).toBe(response.state.documents[0].id);
  });

  it("requests compact catalog summaries without mixing them with document caches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSharedLibraryState(undefined, { summary: true });

    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library?summary=1", expect.any(Object));
    expect(getSharedLibraryCacheKey({ slug: "checking-spend" })).toBe(`${SHARED_LIBRARY_CACHE_KEY}:document:checking-spend`);
  });

  it("requests only the full document opened by the reader", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSharedLibraryState(undefined, { slug: "checking-spend" });

    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library?slug=checking-spend", expect.any(Object));
  });

  it("opts into structured incomplete-document previews without changing the cache identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSharedLibraryState(undefined, { slug: "checking-spend", integrityPreview: true });

    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library?slug=checking-spend&integrityPreview=1", expect.any(Object));
    expect(getSharedLibraryCacheKey({ slug: "checking-spend", integrityPreview: true })).toBe(`${SHARED_LIBRARY_CACHE_KEY}:document:checking-spend`);
  });

  it("confirms a restored version only from a newer document-scoped active response", () => {
    const document = response.state.documents[0];
    const restored = {
      ...response,
      revision: 3,
      recordVersions: { ...response.recordVersions, documents: { [document.id]: 2 } },
      recordManifest: {
        documents: [{ ...response.recordManifest.documents[0], recordVersion: 2 }],
      },
      catalogCompleteness: {
        ...response.catalogCompleteness,
        scope: "document" as const,
      },
      documentStatus: {
        status: "active" as const,
        slug: document.slug,
        documentId: document.id,
        recordVersion: 2,
      },
    };

    expect(verifyRestoredLibraryDocument(restored, document.id, document.slug, 1)?.id).toBe(document.id);
    expect(verifyRestoredLibraryDocument({ ...restored, catalogCompleteness: { ...restored.catalogCompleteness, scope: "catalog" } }, document.id, document.slug, 1)).toBeNull();
    expect(verifyRestoredLibraryDocument(restored, document.id, document.slug, 2)).toBeNull();
  });

  it("confirms an atomic incomplete-document recovery only when every record advanced and cleared its integrity marker", () => {
    const document = response.state.documents[0];
    const restored = {
      ...response,
      restoredCount: 1,
      recordVersions: { ...response.recordVersions, documents: { [document.id]: 2 } },
      recordManifest: {
        documents: [{ ...response.recordManifest.documents[0], recordVersion: 2 }],
      },
      recordIntegrity: { documents: {} },
    };
    const records = [{ documentId: document.id, expectedVersion: 1 }];

    expect(verifyRestoredIncompleteDocuments(restored, records)).toBe(true);
    expect(verifyRestoredIncompleteDocuments({ ...restored, restoredCount: 0 }, records)).toBe(false);
    expect(verifyRestoredIncompleteDocuments({
      ...restored,
      recordIntegrity: {
        documents: {
          [document.id]: {
            status: "incomplete",
            documentId: document.id,
            slug: document.slug,
            title: document.title,
            recordVersion: 2,
            reasonCode: "DOCUMENT_SCHEMA_INVALID",
            hasRecoveryCandidate: false,
          },
        },
      },
    }, records)).toBe(false);
  });

  it("loads tombstones and deletion attribution only for an explicit recovery request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSharedLibraryState(undefined, { summary: true, recovery: true });

    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library?summary=1&recovery=1", expect.any(Object));
  });

  it("invalidates stale document caches only when the lifecycle manifest explicitly removes a document", () => {
    const removeItem = vi.fn();
    const next = {
      ...response,
      revision: 3,
      state: { ...response.state, documents: [] },
      recordVersions: { ...response.recordVersions, documents: {} },
      recordManifest: {
        documents: [{ ...response.recordManifest.documents[0], lifecycleState: "deleted" as const, recordVersion: 2 }],
      },
      catalogCompleteness: {
        ...response.catalogCompleteness,
        expectedDocumentCount: 0,
        returnedDocumentCount: 0,
        activeDocumentCount: 0,
      },
    };

    const removed = reconcileSharedLibraryDocumentCaches(response, next, { removeItem });

    expect(removed.map(document => document.id)).toEqual([response.state.documents[0].id]);
    expect(removeItem).toHaveBeenCalledWith(getSharedLibraryCacheKey({ slug: response.state.documents[0].slug }));
  });

  it("preserves reader caches when a partial response merely omits an active document", () => {
    const removeItem = vi.fn();
    const incomplete = {
      ...response,
      revision: 3,
      state: { ...response.state, documents: [] },
      recordVersions: { ...response.recordVersions, documents: {} },
      recordManifest: { documents: [] },
    };

    const removed = reconcileSharedLibraryDocumentCaches(response, incomplete, { removeItem });

    expect(removed).toEqual([]);
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("invalidates a reader cache when the authoritative record version changes", () => {
    const removeItem = vi.fn();
    const document = response.state.documents[0];
    const next = {
      ...response,
      revision: 3,
      recordVersions: {
        ...response.recordVersions,
        documents: { ...response.recordVersions.documents, [document.id]: 2 },
      },
      recordManifest: {
        documents: [{ ...response.recordManifest.documents[0], recordVersion: 2 }],
      },
    };

    reconcileSharedLibraryDocumentCaches(response, next, { removeItem });

    expect(removeItem).toHaveBeenCalledWith(getSharedLibraryCacheKey({ slug: response.state.documents[0].slug }));
  });

  it("aborts a hung shared-state request instead of leaving hydration pending forever", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchSharedLibraryState();
    const rejection = expect(request).rejects.toBeInstanceOf(SharedLibraryTimeoutError);
    await vi.advanceTimersByTimeAsync(SHARED_LIBRARY_REQUEST_TIMEOUT_MS);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated migration action without exposing a token in the URL", async () => {
    window.localStorage.setItem("launchflow.authSession.v1", JSON.stringify({ token: "secret-token", email: "admin@example.com", role: "ADMIN" }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await initializeSharedLibrary();
    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library/migration", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
      body: JSON.stringify({ action: "initialize-catalog" }),
    }));
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("secret-token");
  });
});
