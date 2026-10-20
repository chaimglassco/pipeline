import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createDefaultCategories } from "../state/category-storage";
import { ReadingStateProvider } from "../state/reading-state";
import type { SharedLibraryResponse } from "../state/shared-library-state";
import { Catalog } from "./catalog";

const client = vi.hoisted(() => ({
  fetchSharedLibraryState: vi.fn(),
  hydrateSharedLibraryState: vi.fn(),
  mutateSharedLibrary: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/library",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../state/shared-library-client", async importOriginal => {
  const actual = await importOriginal<typeof import("../state/shared-library-client")>();
  return { ...actual, ...client };
});

const documents = getPublishedDocuments().slice(0, 2);

function response(orderedDocuments = documents, revision = 7): SharedLibraryResponse {
  return {
    initialized: true,
    state: { version: 1, documents: orderedDocuments, categories: createDefaultCategories() },
    revision,
    recordVersions: {
      documents: Object.fromEntries(orderedDocuments.map(document => [document.id, 1])),
      categories: {},
    },
    updatedAt: null,
    updatedBy: null,
  };
}

describe("catalog document reordering", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    client.fetchSharedLibraryState.mockReset();
    client.hydrateSharedLibraryState.mockReset();
    client.mutateSharedLibrary.mockReset();
    client.fetchSharedLibraryState.mockResolvedValue(response());
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response(), source: "server" });
    window.localStorage.clear();
  });

  it("persists the selected order, closes the dialog, and shows a success notification", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    client.mutateSharedLibrary.mockResolvedValue(response([documents[1], documents[0]], 8));
    render(<ReadingStateProvider><Catalog documents={documents} /></ReadingStateProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "REORDER" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "REORDER" }));
    const dialog = screen.getByRole("dialog", { name: "Reorder library documents" });
    fireEvent.click(within(dialog).getByRole("button", { name: `Move ${documents[1].title} up` }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reorder library documents" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Library document order saved successfully.");
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4_000);
    expect(client.mutateSharedLibrary).toHaveBeenCalledWith({
      operation: "documents.reorder",
      documentIds: [documents[1].id, documents[0].id],
      expectedRevision: 7,
    }, { summary: true, integrityPreview: true });
  });

  it("keeps the dialog and selected order available for retry after a save failure", async () => {
    client.mutateSharedLibrary.mockRejectedValue(new Error("cannot save this document order"));
    render(<ReadingStateProvider><Catalog documents={documents} /></ReadingStateProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "REORDER" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "REORDER" }));
    const dialog = screen.getByRole("dialog", { name: "Reorder library documents" });
    fireEvent.click(within(dialog).getByRole("button", { name: `Move ${documents[1].title} up` }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("cannot save this document order");
    expect(within(dialog).getAllByRole("listitem")[0]).toHaveTextContent(documents[1].title);
    expect(within(dialog).getByRole("button", { name: "Save order" })).toBeEnabled();
  });
});
