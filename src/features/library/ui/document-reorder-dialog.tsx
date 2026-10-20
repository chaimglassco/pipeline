"use client";

import { ChevronDown, ChevronUp, GripVertical, LoaderCircle, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { ManagedLibraryDocument } from "../state/admin-storage";

export function DocumentReorderDialog({ documents, onCancel, onSave }: {
  documents: ManagedLibraryDocument[];
  onCancel: () => void;
  onSave: (order: string[]) => Promise<string | null>;
}) {
  const [order, setOrder] = useState(() => documents.map(document => document.id));
  const [draggedId, setDraggedId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const documentsById = new Map(documents.map(document => [document.id, document]));
  const orderedDocuments = order.map(id => documentsById.get(id)).filter((document): document is ManagedLibraryDocument => Boolean(document));

  const move = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    setOrder(current => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const moveBy = (id: string, direction: -1 | 1) => {
    setOrder(current => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const startDrag = (event: DragEvent<HTMLLIElement>, id: string) => {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const finishDrop = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    move(draggedId || event.dataTransfer.getData("text/plain"), targetId);
    setDraggedId("");
    setDropTargetId("");
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const error = await onSave(order);
      if (error) setSaveError(error);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The document order could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) onCancel(); }}>
    <section className="admin-modal document-reorder-modal" role="dialog" aria-modal="true" aria-labelledby="document-reorder-title">
      <header><div><span className="eyebrow">LIBRARY ADMIN</span><h2 id="document-reorder-title">Reorder library documents</h2><p>Drag the documents into the order you want, then save.</p></div><button type="button" onClick={onCancel} disabled={isSaving} aria-label="Close reorder documents"><X /></button></header>
      <ol className="document-reorder-list">
        {orderedDocuments.map((document, index) => <li
          className={`${draggedId === document.id ? "dragging" : ""}${dropTargetId === document.id && draggedId !== document.id ? " drop-target" : ""}`}
          key={document.id}
          draggable={!isSaving}
          onDragStart={event => startDrag(event, document.id)}
          onDragEnter={() => setDropTargetId(document.id)}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={event => finishDrop(event, document.id)}
          onDragEnd={() => { setDraggedId(""); setDropTargetId(""); }}
        >
          <span className="document-reorder-handle" title={`Drag ${document.title}`}><GripVertical aria-hidden="true" /></span>
          <span className="document-reorder-position">{index + 1}</span>
          <div><strong>{document.title}</strong><small>{document.type} · {document.category}{document.hidden ? " · Hidden" : ""}</small></div>
          <div className="document-reorder-actions">
            <button type="button" onClick={() => moveBy(document.id, -1)} disabled={isSaving || index === 0} aria-label={`Move ${document.title} up`}><ChevronUp /></button>
            <button type="button" onClick={() => moveBy(document.id, 1)} disabled={isSaving || index === orderedDocuments.length - 1} aria-label={`Move ${document.title} down`}><ChevronDown /></button>
          </div>
        </li>)}
      </ol>
      {saveError ? <p className="document-reorder-error" role="alert">{saveError}</p> : null}
      <footer><button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>Cancel</button><button className="primary-button" type="button" onClick={() => void save()} disabled={isSaving}>{isSaving ? <><LoaderCircle className="spinning-icon" /> Saving order...</> : "Save order"}</button></footer>
    </section>
  </div>;
}
