"use client";

import { LoaderCircle, Trash2, X } from "lucide-react";
import type { ManagedLibraryDocument } from "../state/admin-storage";

export function DeleteDocumentDialog({ document, isDeleting, error, onCancel, onConfirm }: { document: ManagedLibraryDocument; isDeleting: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="admin-modal-backdrop delete-document-backdrop">
    <section className="admin-modal delete-document-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-document-title" aria-describedby="delete-document-description">
      <header><div><span className="eyebrow">Confirm deletion</span><h2 id="delete-document-title">Delete document?</h2></div><button type="button" onClick={onCancel} disabled={isDeleting} aria-label="Close delete confirmation"><X /></button></header>
      <div className="delete-document-dialog__body">
        <Trash2 aria-hidden="true" />
        <p id="delete-document-description">Are you sure you want to delete <strong>{document.title}</strong>? It will disappear from the active Library and remain available to administrators in recovery.</p>
        {error ? <p className="delete-document-dialog__error" role="alert">{error}</p> : null}
      </div>
      <footer>
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>Cancel</button>
        <button className="delete-document-dialog__confirm" type="button" onClick={onConfirm} disabled={isDeleting}>{isDeleting ? <><LoaderCircle className="delete-document-dialog__spinner" /> Deleting…</> : <><Trash2 /> Delete</>}</button>
      </footer>
    </section>
  </div>;
}
