"use client";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { useReadingState } from "../state/reading-state";

export function LibraryHero() {
  const { state, ready, availableDocumentIds } = useReadingState();
  const available = new Set(availableDocumentIds ?? []);
  const bookmarkCount = ready && availableDocumentIds ? state.bookmarks.filter(id => available.has(id)).length : 0;
  return <section className="library-hero"><div><span>GLASSCO BACK OFFICE LIBRARY</span><h1>Guides, SOPs, and written playbooks.</h1><p>Read the latest Library documents and playbooks published by the Glassco admin team.</p></div><div className="hero-actions"><Link href="/library/bookmarks" aria-label={`${bookmarkCount} bookmarked documents`}><Bookmark /><span>{bookmarkCount}</span></Link></div></section>;
}
