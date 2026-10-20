import { Suspense } from "react";
import { getPublishedDocuments } from "@/features/library/data/repository";
import { Catalog } from "@/features/library/ui/catalog";
import { LibraryHero } from "@/features/library/ui/library-hero";

export default function LibraryPage() { const docs = getPublishedDocuments(); return <div className="page library-page"><LibraryHero />{docs.length ? <Suspense fallback={<div className="catalog-panel skeleton-grid" aria-label="Loading catalog" />}><Catalog documents={docs} /></Suspense> : <div className="catalog-panel empty-state"><h2>The Library is empty</h2><p>Published documents will appear here.</p></div>}</div>; }
