"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, LoaderCircle, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ManagedCategory } from "../state/category-storage";

type CategoryManagerProps = {
  categories: ManagedCategory[];
  documentCounts: Record<string, number>;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => Promise<string | null>;
  onPermanentlyDelete: (id: string) => Promise<string | null>;
  onRecover: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

export function CategoryManager({ categories, documentCounts, onClose, onCreate, onRename, onToggleHidden, onDelete, onPermanentlyDelete, onRecover, onMove }: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ManagedCategory | null>(null);
  const [permanentlyDeletingCategoryId, setPermanentlyDeletingCategoryId] = useState("");
  const [permanentDeleteError, setPermanentDeleteError] = useState("");
  const [recoveryFeedback, setRecoveryFeedback] = useState("");
  const active = categories.filter(category => !category.deletedAt && !category.archivedAt);
  const deleted = categories.filter(category => category.deletedAt && !category.archivedAt);
  const isLastActiveCategory = active.length <= 1;

  const startRename = (category: ManagedCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const submitRename = (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    onRename(id, name);
    setEditingId("");
    setEditingName("");
  };

  const deleteCategory = async (category: ManagedCategory) => {
    if (deletingCategoryId) return;
    setDeletingCategoryId(category.id);
    setDeleteFeedback(null);
    try {
      const error = await onDelete(category.id);
      setDeleteFeedback(error
        ? { kind: "error", message: error }
        : { kind: "success", message: `${category.name} was deleted successfully.` });
    } catch {
      setDeleteFeedback({ kind: "error", message: "The category could not be deleted. Please try again." });
    } finally {
      setDeletingCategoryId("");
    }
  };

  const permanentlyDeleteCategory = async () => {
    const category = permanentDeleteTarget;
    if (!category || permanentlyDeletingCategoryId) return;
    setPermanentlyDeletingCategoryId(category.id);
    setPermanentDeleteError("");
    setRecoveryFeedback("");
    try {
      const error = await onPermanentlyDelete(category.id);
      if (error) {
        setPermanentDeleteError(error);
        return;
      }
      setPermanentDeleteTarget(null);
      setRecoveryFeedback(`${category.name} was permanently deleted successfully.`);
    } catch {
      setPermanentDeleteError("The category could not be permanently deleted. Please try again.");
    } finally {
      setPermanentlyDeletingCategoryId("");
    }
  };

  return <><div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="admin-modal category-manager" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <header><div><span className="eyebrow">LIBRARY ADMIN</span><h2 id="category-manager-title">Manage categories</h2></div><button type="button" onClick={onClose} aria-label="Close category manager"><X /></button></header>
      <div className="category-manager-body">
        {deleteFeedback ? <p className={`category-delete-feedback ${deleteFeedback.kind}`} role={deleteFeedback.kind === "error" ? "alert" : "status"}>{deleteFeedback.message}</p> : null}
        <form className="category-create" onSubmit={event => { event.preventDefault(); const name = newName.trim(); if (!name) return; onCreate(name); setNewName(""); }}>
          <label htmlFor="new-category-name">Create category</label>
          <div><input id="new-category-name" value={newName} onChange={event => setNewName(event.target.value)} placeholder="New category name" /><button className="category-recovery-trigger" type="button" onClick={() => setShowRecovery(true)} disabled={!deleted.length} aria-label={`Open category recovery${deleted.length ? ` (${deleted.length})` : ""}`} title={deleted.length ? `${deleted.length} deleted ${deleted.length === 1 ? "category" : "categories"}` : "No deleted categories"}><RotateCcw /></button><button className="primary-button" type="submit"><Plus /> Create</button></div>
        </form>

        <section className="category-list" aria-labelledby="active-categories-heading">
          <header><div><span className="eyebrow">ACTIVE</span><h3 id="active-categories-heading">Dropdown categories</h3></div><span>{active.length}</span></header>
          {isLastActiveCategory ? <p className="category-delete-safeguard">At least one active category must remain. Create or recover another category before deleting this one.</p> : null}
          {active.map((category, index) => <article className={category.hidden ? "category-row hidden" : "category-row"} key={category.id}>
            <div className="category-order"><button type="button" onClick={() => onMove(category.id, -1)} disabled={index === 0} aria-label={`Move ${category.name} up`}><ChevronUp /></button><button type="button" onClick={() => onMove(category.id, 1)} disabled={index === active.length - 1} aria-label={`Move ${category.name} down`}><ChevronDown /></button></div>
            <div className="category-copy">{editingId === category.id ? <form onSubmit={event => { event.preventDefault(); submitRename(category.id); }}><input value={editingName} onChange={event => setEditingName(event.target.value)} aria-label={`Rename ${category.name}`} autoFocus /><button type="submit" aria-label={`Save ${category.name} name`}><Save /></button><button type="button" onClick={() => setEditingId("")} aria-label="Cancel rename"><X /></button></form> : <><strong>{category.name}</strong><small>{documentCounts[category.name] ?? 0} {(documentCounts[category.name] ?? 0) === 1 ? "document" : "documents"}{category.hidden ? " · Hidden from dropdown" : ""}</small></>}</div>
            <div className="category-actions"><button type="button" onClick={() => startRename(category)} disabled={Boolean(deletingCategoryId)} aria-label={`Rename ${category.name}`}><Pencil /></button><button type="button" onClick={() => onToggleHidden(category.id)} disabled={Boolean(deletingCategoryId)} aria-label={category.hidden ? `Show ${category.name}` : `Hide ${category.name}`}>{category.hidden ? <Eye /> : <EyeOff />}</button><button className="danger" type="button" onClick={() => void deleteCategory(category)} disabled={Boolean(deletingCategoryId) || isLastActiveCategory} title={isLastActiveCategory ? "At least one active category must remain." : undefined} aria-label={deletingCategoryId === category.id ? `Deleting ${category.name}` : `Delete ${category.name}`}>{deletingCategoryId === category.id ? <LoaderCircle className="category-delete-spinner" /> : <Trash2 />}</button></div>
          </article>)}
        </section>

      </div>
    </section>
  </div>
  {showRecovery ? <div className="admin-modal-backdrop category-recovery-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowRecovery(false); }}>
    <section className="admin-modal category-recovery-modal" role="dialog" aria-modal="true" aria-labelledby="deleted-categories-heading">
      <header><div><span className="eyebrow">RECOVERY</span><h2 id="deleted-categories-heading">Deleted categories</h2></div><button type="button" onClick={() => setShowRecovery(false)} aria-label="Close category recovery"><X /></button></header>
      <div className="category-recovery-body">
        {recoveryFeedback ? <p className="category-delete-feedback success" role="status">{recoveryFeedback}</p> : null}
        <section className="category-list category-recovery-list">
          {deleted.map(category => {
            const documentCount = documentCounts[category.name] ?? 0;
            return <article className="category-row" key={category.id}>
              <div className="category-copy"><strong>{category.name}</strong><small>{documentCount} {documentCount === 1 ? "document" : "documents"}</small></div>
              <div className="category-recovery-actions">
                <button className="secondary-button" type="button" disabled={Boolean(permanentlyDeletingCategoryId)} onClick={() => { onRecover(category.id); if (deleted.length === 1) setShowRecovery(false); }}><RotateCcw /> Recover</button>
                <button className="category-permanent-delete-button" type="button" disabled={Boolean(permanentlyDeletingCategoryId) || documentCount > 0} aria-label={`Permanently delete ${category.name}`} title={documentCount > 0 ? "Move all documents out of this category before permanently deleting it." : "Permanently delete category"} onClick={() => { setPermanentDeleteError(""); setPermanentDeleteTarget(category); }}><Trash2 /></button>
              </div>
            </article>;
          })}
          {!deleted.length ? <p className="category-recovery-empty">There are no deleted categories.</p> : null}
        </section>
      </div>
    </section>
  </div> : null}
  {permanentDeleteTarget ? <div className="admin-modal-backdrop permanent-delete-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !permanentlyDeletingCategoryId) setPermanentDeleteTarget(null); }}>
    <section className="admin-modal permanent-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="permanent-category-delete-heading" aria-describedby="permanent-category-delete-description">
      <header><div><span className="eyebrow">PERMANENT CATEGORY DELETION</span><h2 id="permanent-category-delete-heading">Delete category forever?</h2></div><button type="button" disabled={Boolean(permanentlyDeletingCategoryId)} onClick={() => setPermanentDeleteTarget(null)} aria-label="Close permanent category deletion"><X /></button></header>
      <div className="permanent-delete-dialog__body">
        <AlertTriangle />
        <p id="permanent-category-delete-description">Permanently delete <strong>“{permanentDeleteTarget.name}”</strong>? It will be removed from category Recovery and cannot be recovered there. A protected audit and version record will remain for disaster recovery.</p>
        {permanentDeleteError ? <p className="permanent-delete-dialog__error" role="alert">{permanentDeleteError}</p> : null}
      </div>
      <footer><button className="secondary-button" type="button" disabled={Boolean(permanentlyDeletingCategoryId)} onClick={() => setPermanentDeleteTarget(null)}>Cancel</button><button className="permanent-delete-dialog__confirm" type="button" disabled={Boolean(permanentlyDeletingCategoryId)} onClick={() => void permanentlyDeleteCategory()}>{permanentlyDeletingCategoryId ? <><LoaderCircle className="spinning-icon" /> Deleting…</> : <><Trash2 /> Permanently delete</>}</button></footer>
    </section>
  </div> : null}</>;
}
