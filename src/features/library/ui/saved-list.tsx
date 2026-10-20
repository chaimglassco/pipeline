"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LibraryDocument } from "../domain/types";
import { hydrateSharedLibraryState } from "../state/shared-library-client";
import { useReadingState } from "../state/reading-state";
import { DocumentCard } from "./document-card";

type SavedListMode = "bookmarks" | "recent";

function visibleDocuments(documents: LibraryDocument[]) {
  return documents.filter(document => (
    !(document as LibraryDocument & { deletedAt?: string }).deletedAt
    && !document.hidden
    && document.status === "published"
  ));
}

async function loadVisibleSharedDocuments(documents: LibraryDocument[], signal?: AbortSignal) {
  const hydrated = await hydrateSharedLibraryState(window.localStorage, signal, { summary: true });
  return {
    documents: visibleDocuments(hydrated.response.state.documents),
    notice: hydrated.source === "cache"
      ? "Shared Library is unavailable. Showing saved documents from the last confirmed copy."
      : "",
  };
}

export function SavedList({ documents, mode }: { documents: LibraryDocument[]; mode: SavedListMode }) {
  const { state, ready } = useReadingState();
  const [catalog, setCatalog] = useState<LibraryDocument[]>(() => visibleDocuments(documents));
  const [catalogReady, setCatalogReady] = useState(false);
  const [notice, setNotice] = useState("");

  const retryCatalog = async () => {
    try {
      const loaded = await loadVisibleSharedDocuments(documents);
      setCatalog(loaded.documents);
      setNotice(loaded.notice);
    } catch {
      setCatalog(visibleDocuments(documents));
      setNotice("Saved documents could not be refreshed from the shared Library.");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadVisibleSharedDocuments(documents, controller.signal).then(loaded => {
      if (controller.signal.aborted) return;
      setCatalog(loaded.documents);
      setNotice(loaded.notice);
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setCatalog(visibleDocuments(documents));
      setNotice("Saved documents could not be refreshed from the shared Library.");
    }).finally(() => {
      if (!controller.signal.aborted) setCatalogReady(true);
    });
    return () => controller.abort();
  }, [documents]);

  if (!ready || !catalogReady) {
    return <div className="skeleton-grid" aria-label="Loading documents">
      {[1, 2, 3].map(item => <div key={item} className="skeleton" />)}
    </div>;
  }

  const ids = mode === "bookmarks" ? state.bookmarks : state.recent.map(item => item.id);
  const selected = ids
    .map(id => catalog.find(document => document.id === id))
    .filter((document): document is LibraryDocument => Boolean(document));

  return <div>
    {notice ? <p className="admin-notice" role="status">
      {notice} <button className="inline-retry-button" type="button" onClick={() => void retryCatalog()}>Try again</button>
    </p> : null}
    {selected.length ? <div className="document-grid">
      {selected.map(document => <DocumentCard key={document.id} doc={document} />)}
    </div> : <div className="empty-state">
      <span aria-hidden="true">{mode === "bookmarks" ? "◇" : "↻"}</span>
      <h2>{mode === "bookmarks" ? "No bookmarks yet" : "No recent documents"}</h2>
      <p>{mode === "bookmarks"
        ? "Bookmark useful procedures to keep them close at hand."
        : "Documents you open will appear here for quick access."}</p>
      <Link className="primary-button" href="/library">Browse the Library</Link>
    </div>}
  </div>;
}
