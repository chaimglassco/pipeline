import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import BookmarksPage from "@/app/library/bookmarks/page";
import RecentPage from "@/app/library/recent/page";
import { ReadingStateProvider, useReadingState } from "../state/reading-state";
import { STORAGE_KEY } from "../state/storage";
import { LibraryHero } from "./library-hero";

function renderWithReadingState(children: React.ReactNode) {
  return render(<ReadingStateProvider>{children}</ReadingStateProvider>);
}

function CatalogAvailability({ ids }: { ids: string[] }) {
  const { setAvailableDocumentIds } = useReadingState();
  useEffect(() => setAvailableDocumentIds(ids), [ids, setAvailableDocumentIds]);
  return null;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Library navigation refinements", () => {
  it("keeps bookmarks in the hero and removes the recently viewed shortcut", () => {
    renderWithReadingState(<LibraryHero />);
    expect(screen.getByRole("link", { name: /bookmarked documents/ })).toHaveAttribute("href", "/library/bookmarks");
    expect(screen.queryByRole("link", { name: "Recently viewed documents" })).not.toBeInTheDocument();
  });

  it("counts only unique bookmarks that are currently active, visible, and published", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      bookmarks: ["active-document", "deleted-document", "active-document"],
      recent: [],
      lastTopic: {},
      completion: {},
    }));
    renderWithReadingState(<><CatalogAvailability ids={["active-document"]} /><LibraryHero /></>);

    await waitFor(() => expect(screen.getByRole("link", { name: "1 bookmarked documents" })).toBeVisible());
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}").bookmarks).toEqual([
      "active-document",
      "deleted-document",
      "active-document",
    ]);
  });

  it.each([
    ["Bookmarks", BookmarksPage],
    ["Recently viewed", RecentPage],
  ])("adds a Back to Library control to %s", (_name, Page) => {
    renderWithReadingState(<Page />);
    expect(screen.getByRole("link", { name: /Back to Library/ })).toHaveAttribute("href", "/library");
  });
});
