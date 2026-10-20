"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category, type DocumentType } from "../domain/types";
import type { ManagedLibraryDocument } from "../state/admin-storage";

export type DocumentDraft = { title: string; description: string; category: Category; type: DocumentType; tags: string; body: string };

const initialDraft = (document?: ManagedLibraryDocument): DocumentDraft => ({
  title: document?.title ?? "",
  description: document?.description ?? "",
  category: document?.category ?? CATEGORIES[0],
  type: document?.type ?? "Guide",
  tags: document?.tags.join(", ") ?? "",
  body: document?.body ?? "## Overview\n\nAdd the topic content here.",
});

type DocumentEditorProps = {
  document?: ManagedLibraryDocument;
  categories?: string[];
  onCancel: () => void;
  onSave: (draft: DocumentDraft) => void;
  onCreateCategory?: (name: string) => boolean;
  onManageCategories?: () => void;
};

export function DocumentEditor({ document, categories = [...CATEGORIES], onCancel, onSave, onCreateCategory, onManageCategories }: DocumentEditorProps) {
  const [draft, setDraft] = useState(() => initialDraft(document));
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const previousCategories = useRef(categories);
  const pendingCategory = useRef("");
  const update = <K extends keyof DocumentDraft>(key: K, value: DocumentDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const categoryOptions = categories.includes(draft.category) ? categories : [draft.category, ...categories];

  useEffect(() => {
    const previous = previousCategories.current;
    previousCategories.current = categories;
    if (!categories.length || categories.includes(draft.category)) {
      if (pendingCategory.current === draft.category) pendingCategory.current = "";
      return;
    }
    if (pendingCategory.current === draft.category) return;
    const renamedCategory = categories.find(category => !previous.includes(category));
    setDraft(current => ({ ...current, category: renamedCategory ?? categories[0] }));
  }, [categories, draft.category]);

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name || !onCreateCategory?.(name)) return;
    pendingCategory.current = name;
    update("category", name);
    setNewCategoryName("");
    setShowCategoryCreator(false);
  };

  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="admin-modal document-editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header><div><span className="eyebrow">ADMIN EDITOR</span><h2 id="editor-title">{document ? "Edit topic" : "Add new topic"}</h2></div><button type="button" onClick={onCancel} aria-label="Close editor"><X /></button></header>
      <form onSubmit={event => { event.preventDefault(); if (draft.title.trim() && draft.description.trim()) onSave(draft); }}>
        <label><span>Topic title</span><input required value={draft.title} onChange={event => update("title", event.target.value)} placeholder="e.g. Search Term Optimization Guide" /></label>
        <label><span>Description</span><textarea required rows={3} value={draft.description} onChange={event => update("description", event.target.value)} placeholder="A concise summary of this topic." /></label>
        <div className="editor-category-control">
          <label><span>Category</span><select value={draft.category} onChange={event => update("category", event.target.value as Category)}>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></label>
          {onCreateCategory && onManageCategories ? <div className="editor-category-actions" aria-label="Category controls">
            <button type="button" onClick={() => setShowCategoryCreator(value => !value)} aria-label="Create category" aria-expanded={showCategoryCreator}><Plus /></button>
            <button type="button" onClick={onManageCategories} aria-label="Edit categories"><Pencil /></button>
          </div> : null}
        </div>
        {showCategoryCreator ? <div className="quick-category-create">
          <label htmlFor="document-new-category"><span>New category</span><input id="document-new-category" value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); createCategory(); } }} placeholder="Enter category name" autoFocus /></label>
          <button className="primary-button" type="button" onClick={createCategory}><Plus /> Create</button>
          <button className="secondary-button" type="button" onClick={() => { setShowCategoryCreator(false); setNewCategoryName(""); }} aria-label="Cancel category creation"><X /></button>
        </div> : null}
        <p className="document-editor-help">Document content is edited inside the document builder after saving.</p>
        <footer><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit">{document ? "Save changes" : "Add topic"}</button></footer>
      </form>
    </section>
  </div>;
}
