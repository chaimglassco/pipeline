import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { ReadingStateProvider } from "../state/reading-state";
import { SHARED_LIBRARY_CACHE_KEY } from "../state/shared-library-client";
import { createDefaultCategories } from "../state/category-storage";
import { createAuthoritativeTestResponse } from "../state/shared-library-test-fixtures";
import { STORAGE_KEY } from "../state/storage";
import { SavedList } from "./saved-list";

const seedDocuments = getPublishedDocuments();
const sharedDocument = {
  ...seedDocuments[0],
  id: "shared-bookmarked-document",
  slug: "shared-bookmarked-document",
  title: "Shared bookmarked document",
};
const sharedResponse = createAuthoritativeTestResponse({
  documents: [sharedDocument],
  categories: createDefaultCategories(),
  revision: 3,
});

describe("saved Library lists", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      bookmarks: [sharedDocument.id],
      recent: [],
      lastTopic: {},
      completion: {},
    }));
    vi.restoreAllMocks();
  });

  it("resolves bookmarks against the authoritative shared catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(sharedResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReadingStateProvider><SavedList documents={seedDocuments} mode="bookmarks" /></ReadingStateProvider>);

    expect(await screen.findByRole("heading", { name: sharedDocument.title })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No bookmarks yet" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/ppc/api/library?summary=1", expect.any(Object));
  });

  it("uses the last confirmed shared catalog when the server is unavailable", async () => {
    window.localStorage.setItem(SHARED_LIBRARY_CACHE_KEY, JSON.stringify(sharedResponse));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<ReadingStateProvider><SavedList documents={seedDocuments} mode="bookmarks" /></ReadingStateProvider>);

    expect(await screen.findByRole("heading", { name: sharedDocument.title })).toBeVisible();
    await waitFor(() => expect(screen.getByText(/last confirmed copy/)).toBeVisible());
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
