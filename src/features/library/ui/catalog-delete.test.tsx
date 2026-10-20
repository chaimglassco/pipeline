import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createDefaultCategories } from "../state/category-storage";
import { ReadingStateProvider } from "../state/reading-state";
import type { SharedLibraryResponse } from "../state/shared-library-state";
import { Catalog } from "./catalog";

const client = vi.hoisted(() => ({ fetchSharedLibraryState: vi.fn(), hydrateSharedLibraryState: vi.fn(), mutateSharedLibrary: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/library", useSearchParams: () => new URLSearchParams() }));
vi.mock("../state/shared-library-client", async importOriginal => {
  const actual = await importOriginal<typeof import("../state/shared-library-client")>();
  return { ...actual, ...client };
});

const [document, secondDocument] = getPublishedDocuments();

function response(deletedAt?: string, singleDocument = false): SharedLibraryResponse {
  return {
    initialized: true,
    state: {
      version: 1,
      documents: [
        { ...document, ...(deletedAt ? { deletedAt } : {}) },
        ...(singleDocument ? [] : [secondDocument]),
      ],
      categories: createDefaultCategories(),
    },
    revision: deletedAt ? 2 : 1,
    recordVersions: {
      documents: {
        [document.id]: deletedAt ? 2 : 1,
        ...(singleDocument ? {} : { [secondDocument.id]: 1 }),
      },
      categories: {},
    },
    updatedAt: null,
    updatedBy: null,
  };
}

function renderCatalog() {
  return render(<ReadingStateProvider><Catalog documents={[document]} /></ReadingStateProvider>);
}

async function enterAdminMode() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Manage library" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Manage library" }));
}

function deleteButtonFor(title: string) {
  const card = screen.getByRole("heading", { name: title }).closest("article");
  if (!card) throw new Error(`Document card for ${title} was not found.`);
  return within(card).getByRole("button", { name: "Delete" });
}

describe("catalog document deletion", () => {
  beforeEach(() => {
    client.fetchSharedLibraryState.mockReset();
    client.hydrateSharedLibraryState.mockReset();
    client.mutateSharedLibrary.mockReset();
    client.fetchSharedLibraryState.mockResolvedValue(response());
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response(), source: "server" });
    window.localStorage.clear();
  });

  it("requires confirmation, shows progress, prevents duplicate requests, and announces success", async () => {
    let resolveDelete!: (value: SharedLibraryResponse) => void;
    client.mutateSharedLibrary.mockReturnValue(new Promise(resolve => { resolveDelete = resolve; }));
    renderCatalog();
    await enterAdminMode();

    fireEvent.click(deleteButtonFor(document.title));
    const firstDialog = screen.getByRole("dialog", { name: "Delete document?" });
    expect(within(firstDialog).getByText(document.title)).toBeVisible();
    expect(client.mutateSharedLibrary).not.toHaveBeenCalled();
    fireEvent.click(within(firstDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Delete document?" })).not.toBeInTheDocument();

    fireEvent.click(deleteButtonFor(document.title));
    const dialog = screen.getByRole("dialog", { name: "Delete document?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(within(dialog).getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: document.title })).toBeVisible();
    expect(client.mutateSharedLibrary).toHaveBeenCalledTimes(1);

    await act(async () => resolveDelete(response("2026-07-22T12:00:00.000Z")));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete document?" })).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: document.title })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`${document.title} was deleted successfully.`);
    expect(client.mutateSharedLibrary).toHaveBeenCalledWith({ operation: "document.delete", documentId: document.id, expectedVersion: 1 }, { summary: true, integrityPreview: true });
  });

  it("keeps the document available, shows the server error, and permits a real retry", async () => {
    client.mutateSharedLibrary
      .mockRejectedValueOnce(new Error("The shared Library database did not respond in time. Please retry."))
      .mockResolvedValueOnce(response("2026-07-22T12:00:00.000Z"));
    renderCatalog();
    await enterAdminMode();

    fireEvent.click(deleteButtonFor(document.title));
    const dialog = screen.getByRole("dialog", { name: "Delete document?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("The shared Library database did not respond in time. Please retry."));
    expect(screen.getByRole("heading", { name: document.title })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete document?" })).not.toBeInTheDocument());
    expect(client.mutateSharedLibrary).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: document.title })).not.toBeInTheDocument();
  });

  it("allows deleting the final active document and offers add and Recovery actions", async () => {
    client.fetchSharedLibraryState.mockResolvedValue(response(undefined, true));
    client.hydrateSharedLibraryState.mockResolvedValue({ response: response(undefined, true), source: "server" });
    client.mutateSharedLibrary.mockResolvedValue(response("2026-07-22T12:00:00.000Z", true));
    renderCatalog();
    await enterAdminMode();

    const deleteButton = deleteButtonFor(document.title);
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete document?" })).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "The Library has no active documents" })).toBeVisible());
    const emptyState = screen.getByRole("heading", { name: "The Library has no active documents" }).closest<HTMLElement>(".library-empty-state");
    if (!emptyState) throw new Error("Library empty state was not found.");
    expect(within(emptyState).getByRole("button", { name: "Add document" })).toBeEnabled();
    expect(within(emptyState).getByRole("button", { name: "Open Recovery" })).toBeEnabled();
    expect(client.mutateSharedLibrary).toHaveBeenCalledWith(
      { operation: "document.delete", documentId: document.id, expectedVersion: 1 },
      { summary: true, integrityPreview: true },
    );
  });
});
