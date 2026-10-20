import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  readLegacyLibrarySnapshot: vi.fn(),
  verifyPipelineRequest: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/features/library/data/legacy-library-backup", () => ({
  readLegacyLibrarySnapshot: dependencies.readLegacyLibrarySnapshot,
}));
vi.mock("@/lib/pipeline-auth-server", () => ({
  verifyPipelineRequest: dependencies.verifyPipelineRequest,
}));
vi.mock("@vercel/blob", () => ({
  list: dependencies.list,
  get: dependencies.get,
}));

import { GET, POST } from "./route";

const document = {
  id: "bqool-document",
  slug: "monitor-product-listing-prices-through-bqool",
  title: "Monitor Product Listing Prices Through BQool",
  description: "Monitor listing prices.",
  category: "Product Research",
  type: "Guide" as const,
  tags: ["bqool"],
  updatedAt: "2026-07-20T00:00:00.000Z",
  status: "published" as const,
  hidden: false,
  readingMinutes: 3,
  body: "## Monitor prices",
  topics: [{ id: "monitor-prices", title: "Monitor prices", level: 2 }],
};
const checkSpendDocument = {
  ...document,
  id: "check-spend-no-sales",
  slug: "check-spend-with-no-sales",
  title: "Check Spend with No Sales",
  description: "Find spend without attributed sales.",
  body: "## Check spend without sales",
  topics: [{ id: "check-spend", title: "Check spend", level: 2 }],
};
const category = { id: "product-research", name: "Product Research", hidden: false };

function sharedResponse(overrides: Record<string, unknown> = {}) {
  return {
    initialized: true,
    state: { version: 1, documents: [], categories: [category] },
    revision: 9,
    recordVersions: { documents: {}, categories: { [category.id]: 1 } },
    updatedAt: "2026-07-28T00:00:00.000Z",
    updatedBy: "admin@example.com",
    ...overrides,
  };
}

function request(method: "GET" | "POST" = "GET", body?: unknown) {
  return new Request("http://localhost/ppc/api/library/recovery/purged", {
    method,
    headers: { Authorization: "Bearer test-token", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  dependencies.verifyPipelineRequest.mockResolvedValue({ user: { email: "admin@example.com", name: "Admin", role: "ADMIN" } });
  dependencies.readLegacyLibrarySnapshot.mockResolvedValue({
    body: "{}",
    checksum: "trusted-checksum",
    state: { version: 1, documents: [document], categories: [category] },
  });
  dependencies.list.mockResolvedValue({ blobs: [], hasMore: false });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("protected purged-document recovery", () => {
  it("lists the purged bQool snapshot even when normal Recovery is empty", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("backups=1")) return Promise.resolve(Response.json({ backups: [] }));
      if (url.includes("slug=")) return Promise.resolve(Response.json(sharedResponse({
        documentStatus: {
          status: "purged",
          slug: document.slug,
          documentId: document.id,
          title: document.title,
          deletedAt: "2026-07-28T02:52:00.000Z",
        },
      })));
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      documents: [{
        documentId: document.id,
        title: document.title,
        canRestore: true,
        source: { kind: "legacy_snapshot", id: "trusted-checksum" },
      }],
    });
  });

  it("finds the approved Check Spend document in a backup when its live record is missing", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("backups=1")) {
        return Promise.resolve(Response.json({
          backups: [{ id: "backup-with-check-spend", createdAt: "2026-07-27T00:00:00.000Z" }],
        }));
      }
      if (url.includes("backupId=backup-with-check-spend")) {
        return Promise.resolve(Response.json({
          state: { version: 1, documents: [checkSpendDocument], categories: [category] },
        }));
      }
      if (url.includes(encodeURIComponent(document.slug))) {
        return Promise.resolve(Response.json(sharedResponse({
          documentStatus: { status: "active", slug: document.slug, documentId: document.id, title: document.title },
        })));
      }
      if (url.includes(encodeURIComponent(checkSpendDocument.slug))) {
        return Promise.resolve(Response.json(sharedResponse({
          documentStatus: {
            status: "not_found",
            slug: checkSpendDocument.slug,
            documentId: checkSpendDocument.id,
            title: checkSpendDocument.title,
          },
        })));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      documents: [{
        documentId: checkSpendDocument.id,
        title: checkSpendDocument.title,
        canRestore: true,
        source: { kind: "pipeline_backup", id: "backup-with-check-spend" },
      }],
    });
  });

  it("finds the approved Check Spend document in an immutable legacy archive", async () => {
    dependencies.list.mockResolvedValue({
      blobs: [{
        pathname: "glassco/library-backups/library-state-v1-old.json",
        url: "https://blob.example/archive",
        downloadUrl: "https://blob.example/archive?download=1",
        size: 100,
        uploadedAt: new Date("2026-07-26T00:00:00.000Z"),
        etag: "archive-checksum",
      }],
      hasMore: false,
    });
    dependencies.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(JSON.stringify({
        version: 1,
        documents: [checkSpendDocument],
        categories: [category],
      })).body,
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("backups=1")) return Promise.resolve(Response.json({ backups: [] }));
      if (url.includes(encodeURIComponent(document.slug))) {
        return Promise.resolve(Response.json(sharedResponse({
          documentStatus: { status: "active", slug: document.slug, documentId: document.id, title: document.title },
        })));
      }
      if (url.includes(encodeURIComponent(checkSpendDocument.slug))) {
        return Promise.resolve(Response.json(sharedResponse({
          documentStatus: {
            status: "not_found",
            slug: checkSpendDocument.slug,
            documentId: checkSpendDocument.id,
            title: checkSpendDocument.title,
          },
        })));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      documents: [{
        documentId: checkSpendDocument.id,
        title: checkSpendDocument.title,
        canRestore: true,
        source: { kind: "legacy_snapshot", id: "archive-checksum" },
      }],
    });
  });

  it("recreates only the confirmed bQool record with its original ID and slug", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("backups=1")) return Promise.resolve(Response.json({ backups: [] }));
      if (url.includes("slug=")) return Promise.resolve(Response.json(sharedResponse({
        documentStatus: {
          status: "purged",
          slug: document.slug,
          documentId: document.id,
          title: document.title,
          deletedAt: "2026-07-28T02:52:00.000Z",
        },
      })));
      if (url.endsWith("/api/library-state?summary=1") && !init?.method) return Promise.resolve(Response.json(sharedResponse()));
      if (url.endsWith("/api/library-state?summary=1") && init?.method === "PATCH") {
        return Promise.resolve(Response.json(sharedResponse({
          state: { version: 1, documents: [document], categories: [category] },
          revision: 10,
          recordVersions: { documents: { [document.id]: 1 }, categories: { [category.id]: 1 } },
        })));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request("POST", { documentId: document.id }));

    expect(response.status).toBe(200);
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    const payload = JSON.parse(String(createCall?.[1]?.body));
    expect(payload).toMatchObject({
      operation: "document.create",
      document: {
        id: document.id,
        slug: document.slug,
        title: document.title,
        hidden: false,
        status: "published",
      },
    });
    await expect(response.json()).resolves.toMatchObject({ repairedDocumentId: document.id });
  });
});
