"use client";

import { AlertTriangle, Archive, Clock3, DatabaseBackup, Eye, History, LoaderCircle, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ManagedLibraryDocument } from "../state/admin-storage";
import {
  fetchLibrarySnapshot,
  fetchLibraryVersions,
  type LibraryBackup,
  type LibraryIntegrityIncident,
  type PurgedLibraryDocument,
  type LibraryVersion,
} from "../state/shared-library-client";
import type { LibraryDocumentDeletionAudit, SharedLibraryDocumentIntegrity } from "../state/shared-library-state";

type RecoveryTab = "incomplete" | "deleted" | "archive" | "versions" | "snapshots" | "incidents";

type DeletedDocumentsProps = {
  documents: ManagedLibraryDocument[];
  incompleteDocuments?: SharedLibraryDocumentIntegrity[];
  archivedDocuments?: ManagedLibraryDocument[];
  activeDocuments?: ManagedLibraryDocument[];
  backups?: LibraryBackup[];
  incidents?: LibraryIntegrityIncident[];
  deletionAudit: Record<string, LibraryDocumentDeletionAudit>;
  isRecoveringSystemDocuments: boolean;
  systemRecoveryError: string;
  onClose: () => void;
  onRecover: (document: ManagedLibraryDocument) => Promise<string | null>;
  onRecoverIncomplete?: (documents: SharedLibraryDocumentIntegrity[]) => Promise<string | null>;
  onArchiveIncomplete?: (document: SharedLibraryDocumentIntegrity) => Promise<string | null>;
  onRecoverSystemDeleted: (documentIds: string[]) => void;
  onPermanentlyDelete: (document: ManagedLibraryDocument) => Promise<string | null>;
  onRestoreArchived?: (document: ManagedLibraryDocument) => Promise<string | null>;
  onRestoreVersion?: (version: LibraryVersion) => Promise<string | null>;
  onCreateSnapshot?: () => Promise<string | null>;
  onRestoreSnapshotRecords?: (backup: LibraryBackup, recordIds: string[]) => Promise<string | null>;
  onAcknowledgeIncident?: (incident: LibraryIntegrityIncident) => Promise<string | null>;
  purgedDocuments?: PurgedLibraryDocument[];
  onRestorePurged?: (document: PurgedLibraryDocument) => Promise<string | null>;
  purgedHistoryError: string;
  isLoadingDocuments: boolean;
  documentLoadError: string;
  isLoadingPurgedHistory: boolean;
  onRetry: () => void;
};

function actorLabel(actor: LibraryDocumentDeletionAudit["actor"]) {
  if (!actor) return "";
  return `${actor.name || actor.email}${actor.email && actor.email !== actor.name ? ` (${actor.email})` : ""} · ${actor.role}`;
}

function deletionLabel(document: ManagedLibraryDocument, audit?: LibraryDocumentDeletionAudit) {
  const deletedAt = audit?.deletedAt || document.deletedAt;
  const date = deletedAt ? new Date(deletedAt).toLocaleString() : "recently";
  if (!audit || audit.source === "unknown") return `Deleted ${date} — source unavailable`;
  if (audit.source === "user") return `Deleted ${date} by ${actorLabel(audit.actor) || "an unknown user"}`;
  if (audit.source === "system_migration") return `Deleted ${date} by System — Initial Library cleanup`;
  return `Deleted ${date} by System — Backup restore`;
}

function tabLabel(tab: RecoveryTab, count: number) {
  const labels: Record<RecoveryTab, string> = {
    incomplete: "Needs recovery",
    deleted: "Deleted",
    archive: "Protected archive",
    versions: "Version history",
    snapshots: "Snapshots",
    incidents: "Incidents",
  };
  return `${labels[tab]}${count ? ` (${count})` : ""}`;
}

export function DeletedDocuments(props: DeletedDocumentsProps) {
  const {
    documents,
    incompleteDocuments = [],
    archivedDocuments = [],
    activeDocuments = [],
    backups = [],
    incidents = [],
    deletionAudit,
    isRecoveringSystemDocuments,
    systemRecoveryError,
    onClose,
    onRecover,
    onRecoverIncomplete = async () => "Incomplete-document recovery is unavailable.",
    onArchiveIncomplete = async () => "Incomplete-document removal is unavailable.",
    onRecoverSystemDeleted,
    onPermanentlyDelete,
    onRestoreArchived = async () => "Protected archive recovery is unavailable.",
    onRestoreVersion = async () => "Version recovery is unavailable.",
    onCreateSnapshot = async () => "Snapshot creation is unavailable.",
    onRestoreSnapshotRecords = async () => "Snapshot recovery is unavailable.",
    onAcknowledgeIncident = async () => "Incident acknowledgement is unavailable.",
    purgedDocuments = [],
    onRestorePurged = async () => "Protected legacy recovery is unavailable.",
    purgedHistoryError,
    isLoadingDocuments,
    documentLoadError,
    isLoadingPurgedHistory,
    onRetry,
  } = props;
  const [tab, setTab] = useState<RecoveryTab>(incompleteDocuments.length ? "incomplete" : "deleted");
  const [busyId, setBusyId] = useState("");
  const [rowError, setRowError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<ManagedLibraryDocument | null>(null);
  const [versionRecordId, setVersionRecordId] = useState("");
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [snapshotTarget, setSnapshotTarget] = useState<LibraryBackup | null>(null);
  const [snapshotDocuments, setSnapshotDocuments] = useState<ManagedLibraryDocument[]>([]);
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState<string[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [confirmBulkIncomplete, setConfirmBulkIncomplete] = useState(false);
  const [incompleteArchiveTarget, setIncompleteArchiveTarget] = useState<SharedLibraryDocumentIntegrity | null>(null);
  const versionRequestRef = useRef(0);
  const allDocuments = useMemo(() => {
    const map = new Map<string, ManagedLibraryDocument>();
    [...activeDocuments, ...documents, ...archivedDocuments].forEach(document => map.set(document.id, document));
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [activeDocuments, archivedDocuments, documents]);
  const versionDocumentOptions = useMemo(() => {
    const map = new Map(allDocuments.map(document => [document.id, document.title]));
    incompleteDocuments.forEach(document => map.set(document.documentId, document.title || "Untitled document"));
    return [...map.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [allDocuments, incompleteDocuments]);
  const systemDeletedIds = documents.filter(document => deletionAudit[document.id]?.source === "system_migration").map(document => document.id);
  const recoverableIncompleteDocuments = incompleteDocuments.filter(document => document.hasRecoveryCandidate);
  const unacknowledged = incidents.filter(incident => !incident.acknowledgedAt).length;
  const isBusy = Boolean(busyId) || isRecoveringSystemDocuments || loadingVersions || loadingSnapshot;

  const run = async (id: string, action: () => Promise<string | null>) => {
    if (isBusy) return false;
    setBusyId(id);
    setRowError("");
    const error = await action();
    setBusyId("");
    if (error) {
      setRowError(error);
      return false;
    }
    return true;
  };

  const loadVersions = async (recordId: string) => {
    const request = ++versionRequestRef.current;
    setVersionRecordId(recordId);
    setVersions([]);
    setRowError("");
    if (!recordId) return;
    setLoadingVersions(true);
    try {
      const nextVersions = await fetchLibraryVersions("document", recordId);
      if (versionRequestRef.current === request) setVersions(nextVersions);
    } catch (error) {
      if (versionRequestRef.current === request) setRowError(error instanceof Error ? error.message : "Version history could not be loaded.");
    } finally {
      if (versionRequestRef.current === request) setLoadingVersions(false);
    }
  };

  const loadSnapshot = async (backup: LibraryBackup) => {
    setSnapshotTarget(backup);
    setSnapshotDocuments([]);
    setSelectedSnapshotIds([]);
    setRowError("");
    setLoadingSnapshot(true);
    try {
      const snapshot = await fetchLibrarySnapshot(backup.id);
      setSnapshotDocuments(snapshot.state.documents);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Snapshot contents could not be loaded.");
    } finally {
      setLoadingSnapshot(false);
    }
  };

  return <div className="admin-modal-backdrop document-recovery-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !isBusy) onClose();
  }}>
    <section className="admin-modal document-recovery-modal recovery-center-modal" role="dialog" aria-modal="true" aria-labelledby="deleted-documents-heading">
      <header>
        <div><span className="eyebrow">LIBRARY PROTECTION</span><h2 id="deleted-documents-heading">Recovery Center</h2><p>Recover deleted content, protected archives, prior versions, snapshots, and integrity repairs.</p></div>
        <button type="button" onClick={onClose} disabled={isBusy} aria-label="Close document recovery"><X /></button>
      </header>
      <nav className="recovery-center-tabs" aria-label="Recovery Center sections">
        {([
          ["incomplete", incompleteDocuments.length],
          ["deleted", documents.length],
          ["archive", archivedDocuments.length + purgedDocuments.length],
          ["versions", 0],
          ["snapshots", backups.length],
          ["incidents", unacknowledged],
        ] as Array<[RecoveryTab, number]>).map(([name, count]) => <button key={name} type="button" className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{tabLabel(name, count)}</button>)}
      </nav>
      <div className="document-recovery-content">
        {(isLoadingDocuments || isLoadingPurgedHistory) ? <div className="document-recovery-load-state" role="status"><LoaderCircle className="spinning-icon" /><strong>Loading Recovery Center…</strong></div> : null}
        {(documentLoadError || purgedHistoryError) ? <div className="document-recovery-load-error" role="alert"><p>{documentLoadError || purgedHistoryError}</p><button className="secondary-button" type="button" onClick={onRetry}><RotateCcw /> Try again</button></div> : null}
        {rowError ? <div className="document-recovery-load-error" role="alert"><p>{rowError}</p></div> : null}

        {tab === "incomplete" ? <section className="recovery-center-section">
          {incompleteDocuments.length > 1 ? <div className="recovery-center-heading"><div><strong>{incompleteDocuments.length} incomplete active documents</strong><p>{recoverableIncompleteDocuments.length} can be restored from their newest versions that pass the current validator.</p></div><button className="primary-button" type="button" disabled={isBusy || !recoverableIncompleteDocuments.length} onClick={() => setConfirmBulkIncomplete(true)}><RotateCcw /> Recover all valid versions</button></div> : null}
          <div className="document-recovery-list">{incompleteDocuments.map(document => <article className="document-recovery-row incomplete-document-row" key={document.documentId}>
            <div><strong>{document.title}</strong><small>Active record version {document.recordVersion} is incomplete.</small><small>{document.hasRecoveryCandidate ? `Protected version ${document.recoveryCandidateRecordVersion} passed validation${document.recoveryCandidateCreatedAt ? ` · ${new Date(document.recoveryCandidateCreatedAt).toLocaleString()}` : ""}.` : "No protected version passes the current validator."}</small></div>
            <div className="document-recovery-actions">
              <Link className="secondary-button" href={`/library/${document.slug}`}><Eye /> Preview</Link>
              <button className="secondary-button" type="button" disabled={isBusy || !document.hasRecoveryCandidate} onClick={() => void run(`incomplete-${document.documentId}`, () => onRecoverIncomplete([document]))}>{busyId === `incomplete-${document.documentId}` ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />} Restore</button>
              <button className="document-permanent-delete-button" type="button" disabled={isBusy} aria-label={`Move ${document.title} to protected archive`} title="Move to protected archive" onClick={() => setIncompleteArchiveTarget(document)}><Trash2 /></button>
            </div>
          </article>)}</div>
          {!incompleteDocuments.length ? <p className="document-recovery-empty">There are no incomplete active documents.</p> : null}
        </section> : null}

        {tab === "deleted" && !isLoadingDocuments ? <>
          {systemDeletedIds.length ? <section className="system-recovery-panel"><ShieldAlert /><div><strong>{systemDeletedIds.length} system-deleted {systemDeletedIds.length === 1 ? "document" : "documents"} detected</strong><p>This restores only records attributed to the Initial Library cleanup.</p>{systemRecoveryError ? <p role="alert">{systemRecoveryError}</p> : null}</div><button className="primary-button" type="button" disabled={isBusy} onClick={() => onRecoverSystemDeleted(systemDeletedIds)}>{isRecoveringSystemDocuments ? <><LoaderCircle className="spinning-icon" /> Recovering…</> : <><RotateCcw /> Recover system-deleted</>}</button></section> : null}
          <div className="document-recovery-list">{documents.map(document => <article className="document-recovery-row" key={document.id}>
            <div><strong>{document.title}</strong><small>{deletionLabel(document, deletionAudit[document.id])}</small></div>
            <div className="document-recovery-actions">
              <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void run(`recover-${document.id}`, () => onRecover(document))}>{busyId === `recover-${document.id}` ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />} Recover</button>
              <button className="document-permanent-delete-button" type="button" disabled={isBusy} aria-label={`Move ${document.title} to protected archive`} title="Move to protected archive" onClick={() => setArchiveTarget(document)}><Archive /></button>
            </div>
          </article>)}</div>
          {!documents.length ? <p className="document-recovery-empty">There are no deleted documents.</p> : null}
        </> : null}

        {tab === "archive" ? <div className="document-recovery-list">{archivedDocuments.map(document => <article className="document-recovery-row" key={document.id}>
          <div><strong>{document.title}</strong><small>Protected indefinitely{document.archivedAt ? ` · Archived ${new Date(document.archivedAt).toLocaleString()}` : ""}</small></div>
          <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void run(`archive-${document.id}`, () => onRestoreArchived(document))}>{busyId === `archive-${document.id}` ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />} Restore</button>
        </article>)}
        {purgedDocuments.filter(document => document.canRestore).map(document => <article className="document-recovery-row" key={`legacy-${document.documentId}`}>
          <div><strong>{document.title}</strong><small>{document.source.label} · Protected recovery copy</small></div>
          <button className="secondary-button" type="button" disabled={isBusy} aria-label={`Restore ${document.title}`} onClick={() => void run(`legacy-${document.documentId}`, () => onRestorePurged(document))}>{busyId === `legacy-${document.documentId}` ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />} Restore</button>
        </article>)}
        {!archivedDocuments.length && !purgedDocuments.some(document => document.canRestore) ? <p className="document-recovery-empty">The protected archive is empty.</p> : null}</div> : null}

        {tab === "versions" ? <section className="recovery-center-section">
          <label>Document<select value={versionRecordId} onChange={event => void loadVersions(event.target.value)}><option value="">Choose a document</option>{versionDocumentOptions.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          {loadingVersions ? <div className="document-recovery-load-state"><LoaderCircle className="spinning-icon" /> Loading versions…</div> : null}
          <div className="document-recovery-list">{versions.map(version => <article className="document-recovery-row" key={version.id}><div><strong>{String((version.data as ManagedLibraryDocument).title || "Untitled document")}</strong><small>{new Date(version.createdAt).toLocaleString()} · Version {version.recordVersion} · {version.operationType} · {version.actorEmail || "System"}</small><small>{version.lifecycleState} · Revision {version.catalogRevision}{!version.restorable ? ` · ${version.validationErrorReason || "Does not pass the current validator"}` : ""}</small></div><button className="secondary-button" type="button" disabled={isBusy || !version.restorable} title={!version.restorable ? "This version cannot be restored because it does not pass the current document validator." : "Restore this validated version."} onClick={() => void run(`version-${version.id}`, () => onRestoreVersion(version))}>{busyId === `version-${version.id}` ? <LoaderCircle className="spinning-icon" /> : <History />} Restore version</button></article>)}</div>
          {versionRecordId && !loadingVersions && !versions.length ? <p className="document-recovery-empty">No retained versions were found.</p> : null}
        </section> : null}

        {tab === "snapshots" ? <section className="recovery-center-section">
          <div className="recovery-center-heading"><div><strong>Protected snapshots</strong><p>Snapshots are retained indefinitely and restore only the records you select.</p></div><button className="primary-button" type="button" disabled={isBusy} onClick={() => void run("create-snapshot", onCreateSnapshot)}>{busyId === "create-snapshot" ? <LoaderCircle className="spinning-icon" /> : <DatabaseBackup />} Create snapshot now</button></div>
          <div className="document-recovery-list">{backups.map(backup => <article className="document-recovery-row" key={backup.id}><div><strong>{backup.reason}</strong><small>{new Date(backup.createdAt).toLocaleString()} · Revision {backup.revision} · {backup.snapshotType}</small><small>{backup.createdBy} · {Math.ceil(backup.stateSize / 1024)} KB</small></div><button className="secondary-button" type="button" disabled={isBusy} onClick={() => void loadSnapshot(backup)}><Clock3 /> Browse</button></article>)}</div>
          {!backups.length ? <p className="document-recovery-empty">No snapshots have been created yet.</p> : null}
          {snapshotTarget ? <div className="snapshot-record-picker"><div><strong>{snapshotTarget.reason}</strong><button type="button" onClick={() => setSnapshotTarget(null)} aria-label="Close snapshot contents"><X /></button></div>{loadingSnapshot ? <LoaderCircle className="spinning-icon" /> : snapshotDocuments.map(document => <label key={document.id}><input type="checkbox" checked={selectedSnapshotIds.includes(document.id)} onChange={event => setSelectedSnapshotIds(current => event.target.checked ? [...current, document.id] : current.filter(id => id !== document.id))} /> {document.title}</label>)}<button className="primary-button" type="button" disabled={isBusy || !selectedSnapshotIds.length} onClick={() => void run(`snapshot-${snapshotTarget.id}`, () => onRestoreSnapshotRecords(snapshotTarget, selectedSnapshotIds))}>{busyId === `snapshot-${snapshotTarget.id}` ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />} Restore selected</button></div> : null}
        </section> : null}

        {tab === "incidents" ? <div className="document-recovery-list">{incidents.map(incident => <article className="document-recovery-row" key={incident.id}><div><strong>{incident.incidentType.replaceAll("_", " ")}</strong><small>{new Date(incident.createdAt).toLocaleString()} · {incident.recordType} {incident.recordId}</small><small>{incident.acknowledgedAt ? `Acknowledged by ${incident.acknowledgedBy}` : "Automatically repaired · Review required"}</small></div>{!incident.acknowledgedAt ? <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void run(`incident-${incident.id}`, () => onAcknowledgeIncident(incident))}>{busyId === `incident-${incident.id}` ? <LoaderCircle className="spinning-icon" /> : <ShieldAlert />} Acknowledge</button> : null}</article>)}
        {!incidents.length ? <p className="document-recovery-empty">No integrity incidents have been recorded.</p> : null}</div> : null}
      </div>
    </section>

    {archiveTarget ? <div className="admin-modal-backdrop permanent-delete-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isBusy) setArchiveTarget(null); }}>
      <section className="admin-modal permanent-delete-dialog protected-restore-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-document-heading">
        <header><div><span className="eyebrow">PROTECTED ARCHIVE</span><h2 id="archive-document-heading">Move out of normal Recovery?</h2></div><button type="button" disabled={isBusy} onClick={() => setArchiveTarget(null)} aria-label="Close archive confirmation"><X /></button></header>
        <div className="permanent-delete-dialog__body"><AlertTriangle /><p><strong>“{archiveTarget.title}”</strong> will disappear from the Deleted tab, but its full content and history will remain protected indefinitely and can be restored from the Protected archive tab.</p></div>
        <footer><button className="secondary-button" type="button" disabled={isBusy} onClick={() => setArchiveTarget(null)}>Cancel</button><button className="primary-button" type="button" disabled={isBusy} onClick={() => void run(`archive-confirm-${archiveTarget.id}`, () => onPermanentlyDelete(archiveTarget)).then(success => { if (success) { setArchiveTarget(null); setTab("archive"); } })}>{busyId === `archive-confirm-${archiveTarget.id}` ? <><LoaderCircle className="spinning-icon" /> Archiving…</> : <><Archive /> Move to protected archive</>}</button></footer>
      </section>
    </div> : null}
    {incompleteArchiveTarget ? <div className="admin-modal-backdrop permanent-delete-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isBusy) setIncompleteArchiveTarget(null); }}>
      <section className="admin-modal permanent-delete-dialog protected-restore-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-incomplete-document-heading">
        <header><div><span className="eyebrow">INCOMPLETE DOCUMENT REMOVAL</span><h2 id="archive-incomplete-document-heading">Remove from Needs recovery?</h2></div><button type="button" disabled={isBusy} onClick={() => setIncompleteArchiveTarget(null)} aria-label="Close incomplete document removal"><X /></button></header>
        <div className="permanent-delete-dialog__body"><AlertTriangle /><p><strong>“{incompleteArchiveTarget.title}”</strong> will be removed from the active Library and normal Recovery. Its audit and version history will remain protected for disaster recovery.</p></div>
        <footer><button className="secondary-button" type="button" disabled={isBusy} onClick={() => setIncompleteArchiveTarget(null)}>Cancel</button><button className="primary-button" type="button" disabled={isBusy} onClick={() => void run(`archive-incomplete-${incompleteArchiveTarget.documentId}`, () => onArchiveIncomplete(incompleteArchiveTarget)).then(success => { if (success) { setIncompleteArchiveTarget(null); setTab("archive"); } })}>{busyId === `archive-incomplete-${incompleteArchiveTarget.documentId}` ? <><LoaderCircle className="spinning-icon" /> Removing…</> : <><Trash2 /> Remove document</>}</button></footer>
      </section>
    </div> : null}
    {confirmBulkIncomplete ? <div className="admin-modal-backdrop permanent-delete-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isBusy) setConfirmBulkIncomplete(false); }}>
      <section className="admin-modal permanent-delete-dialog protected-restore-dialog" role="alertdialog" aria-modal="true" aria-labelledby="recover-incomplete-heading">
        <header><div><span className="eyebrow">VALIDATED RECOVERY</span><h2 id="recover-incomplete-heading">Recover {recoverableIncompleteDocuments.length} incomplete documents?</h2></div><button type="button" disabled={isBusy} onClick={() => setConfirmBulkIncomplete(false)} aria-label="Close recovery confirmation"><X /></button></header>
        <div className="permanent-delete-dialog__body"><AlertTriangle /><p>Every selected record must still match this Library revision. The newest protected version that passes the current validator will replace each recoverable active record in one all-or-nothing operation. Records without a valid version will remain unchanged.</p></div>
        <footer><button className="secondary-button" type="button" disabled={isBusy} onClick={() => setConfirmBulkIncomplete(false)}>Cancel</button><button className="primary-button" type="button" disabled={isBusy} onClick={() => void run("bulk-incomplete", () => onRecoverIncomplete(recoverableIncompleteDocuments)).then(success => { if (success) setConfirmBulkIncomplete(false); })}>{busyId === "bulk-incomplete" ? <><LoaderCircle className="spinning-icon" /> Recovering…</> : <><RotateCcw /> Recover all</>}</button></footer>
      </section>
    </div> : null}
  </div>;
}
