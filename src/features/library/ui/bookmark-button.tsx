"use client";
import { Bookmark } from "lucide-react";
import { useReadingState } from "../state/reading-state";

export function BookmarkButton({ id, compact = false }: { id: string; compact?: boolean }) { const { state, ready, toggleBookmark } = useReadingState(); const active = ready && state.bookmarks.includes(id); return <button type="button" className={compact ? "icon-button" : "secondary-button"} aria-label={active ? "Remove bookmark" : "Add bookmark"} aria-pressed={active} onClick={event => { event.preventDefault(); event.stopPropagation(); toggleBookmark(id); }}><Bookmark aria-hidden="true" fill={active ? "currentColor" : "none"} />{compact ? null : <span>{active ? "Bookmarked" : "Bookmark"}</span>}</button>; }
