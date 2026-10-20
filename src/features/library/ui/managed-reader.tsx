"use client";
import { LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGlasscoSession } from "@/components/glassco-session";
import { getTopicsFromContentElements } from "../domain/document-elements";
import type { LibraryContentElement, LibraryDocumentLinkOption } from "../domain/types";
import { normalizeManagedLibraryContentUpdate, type ManagedLibraryDocument } from "../state/admin-storage";
import { createDefaultCategories } from "../state/category-storage";
import { cacheSharedLibraryResponse, fetchSharedLibraryState, hydrateSharedLibraryState, invalidateSharedLibraryDocumentCache, mutateSharedLibrary, SharedLibraryConflictError, SharedLibraryIncompleteResponseError, SharedLibraryRequestError, verifyRestoredLibraryDocument } from "../state/shared-library-client";
import { getSharedLibraryRefreshDelay } from "../state/shared-library-retry";
import type { LibraryDocumentDeletionAudit, SharedLibraryDocumentStatus, SharedLibraryResponse } from "../state/shared-library-state";
import type { DocumentMetadataDraft } from "./document-builder";
import { Reader } from "./reader";

export class DocumentSaveVerificationError extends Error {
  constructor(message = "The document save could not be verified. Your changes remain open; please try saving again.") {
    super(message);
    this.name = "DocumentSaveVerificationError";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [
    key,
    stableValue((value as Record<string, unknown>)[key]),
  ]));
}

function sameStructuredContent(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function getLinkableDocumentOptions(response: SharedLibraryResponse, currentDocumentId: string): LibraryDocumentLinkOption[] {
  const manifestById = new Map(response.recordManifest?.documents.map(entry => [entry.id, entry]));
  const incompleteIds = new Set(Object.keys(response.recordIntegrity?.documents ?? {}));
  return response.state.documents
    .filter(document => (
      document.id !== currentDocumentId
      && document.status === "published"
      && !document.hidden
      && !document.deletedAt
      && !document.archivedAt
      && manifestById.get(document.id)?.lifecycleState === "active"
      && !incompleteIds.has(document.id)
    ))
    .map(({ id, slug, title, category, description }) => ({ id, slug, title, category, description }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function verifyDocumentSaveResponse(response: SharedLibraryResponse, submitted: ManagedLibraryDocument, expectedVersion: number): ManagedLibraryDocument {
  const result = response.mutationResult;
  const returned = response.state.documents.find(document => document.id === submitted.id);
  const returnedVersion = response.recordVersions.documents[submitted.id];
  if (!result
    || result.operation !== "document.update"
    || result.documentId !== submitted.id
    || result.document.id !== submitted.id
    || !returned
    || result.document.slug !== submitted.slug
    || result.lifecycleState !== "active"
    || result.recordVersion <= expectedVersion
    || returnedVersion !== result.recordVersion
    || response.documentStatus?.status !== "active"
    || response.documentStatus.documentId !== submitted.id
    || result.document.deletedAt
    || result.document.archivedAt
    || result.document.hidden !== submitted.hidden
    || result.document.status !== submitted.status
    || result.document.title !== submitted.title
    || result.document.description !== submitted.description
    || result.document.category !== submitted.category
    || !sameStructuredContent(result.document.contentElements, submitted.contentElements)
    || returned.slug !== submitted.slug
    || returned.deletedAt
    || returned.archivedAt
    || !sameStructuredContent(returned, result.document)) {
    throw new DocumentSaveVerificationError();
  }
  return returned;
}

export function ManagedReader({ slug }: { slug: string }) {
  const { canAdmin } = useGlasscoSession();
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [document, setDocument] = useState<ManagedLibraryDocument | null | undefined>(undefined);
  const [documentSlug, setDocumentSlug] = useState(slug);
  const [categories, setCategories] = useState(() => createDefaultCategories().map(category => category.name));
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [notice, setNotice] = useState(() => searchParams.get("recovered") === "1"
    ? "The document was recovered successfully."
    : "");
  const [documentStatus, setDocumentStatus] = useState<SharedLibraryDocumentStatus | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [loadError, setLoadError] = useState<{ slug: string; message: string; kind: "connection" | "integrity" } | null>(null);
  const [documentLinkCatalogState, setDocumentLinkCatalogState] = useState<{
    documentId: string;
    options: LibraryDocumentLinkOption[];
    status: "idle" | "loading" | "ready" | "error";
    error: string;
  }>({ documentId: "", options: [], status: "idle", error: "" });
  const sharedRef = useRef<SharedLibraryResponse | null>(null);
  const refreshInFlightRef = useRef(false);
  const documentRef = useRef<ManagedLibraryDocument | null | undefined>(undefined);
  const consecutiveFailuresRef = useRef(0);
  const documentLinkOwnerRef = useRef("");
  const documentLinkRequestRef = useRef<{ documentId: string; controller: AbortController } | null>(null);

  const applyResponse = useCallback((response: SharedLibraryResponse, cache = true, preserveOnMissing = false) => {
    const activeDocument = response.state.documents.find(item => item.slug === slug && !item.deletedAt && !item.hidden) ?? null;
    const nextStatus = response.documentStatus ?? (activeDocument ? { status: "active" as const, slug } : null);
    const nextDocument = nextStatus?.status === "incomplete"
      ? response.recoveryPreview?.document ?? null
      : activeDocument;
    const explicitlyUnavailable = nextStatus?.status === "deleted" || nextStatus?.status === "purged" || nextStatus?.status === "archived";
    const hasConfirmedDocument = Boolean(documentRef.current);
    if (!nextDocument && (preserveOnMissing || hasConfirmedDocument) && !explicitlyUnavailable) {
      setNotice("The latest Library response did not include this active document. The current editor copy was preserved.");
      setMutationsEnabled(false);
      return false;
    }
    sharedRef.current = response;
    setDocumentSlug(slug);
    setDocumentStatus(nextStatus);
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    setLoadError(null);
    setCategories(response.state.categories.filter(category => !category.deletedAt).map(category => category.name));
    if (nextStatus && ["deleted", "purged", "archived"].includes(nextStatus.status)) {
      invalidateSharedLibraryDocumentCache(window.localStorage, slug);
    } else if (cache && nextDocument) {
      cacheSharedLibraryResponse(response, window.localStorage, { slug, integrityPreview: true });
    }
    return true;
  }, [slug]);

  const requestDocumentLinks = useCallback(() => {
    const currentDocumentId = documentRef.current?.id;
    if (!currentDocumentId || documentLinkOwnerRef.current === currentDocumentId || documentLinkRequestRef.current?.documentId === currentDocumentId) return;
    documentLinkRequestRef.current?.controller.abort();
    const controller = new AbortController();
    documentLinkRequestRef.current = { documentId: currentDocumentId, controller };
    setDocumentLinkCatalogState({ documentId: currentDocumentId, options: [], status: "loading", error: "" });
    void fetchSharedLibraryState(controller.signal, { summary: true, integrityPreview: true }).then(response => {
      if (controller.signal.aborted) return;
      documentLinkOwnerRef.current = currentDocumentId;
      setDocumentLinkCatalogState({
        documentId: currentDocumentId,
        options: getLinkableDocumentOptions(response, currentDocumentId),
        status: "ready",
        error: "",
      });
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setDocumentLinkCatalogState({
        documentId: currentDocumentId,
        options: [],
        status: "error",
        error: "Library documents could not be loaded. Try again.",
      });
    }).finally(() => {
      if (documentLinkRequestRef.current?.controller === controller) documentLinkRequestRef.current = null;
    });
  }, []);

  useEffect(() => {
    documentLinkRequestRef.current?.controller.abort();
    documentLinkRequestRef.current = null;
    documentLinkOwnerRef.current = "";
    return () => documentLinkRequestRef.current?.controller.abort();
  }, [slug]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (refreshInFlightRef.current) return false;
    refreshInFlightRef.current = true;
    try {
      const response = await fetchSharedLibraryState(signal, { slug, integrityPreview: true });
      const applied = applyResponse(response);
      if (!applied) return false;
      consecutiveFailuresRef.current = 0;
      setMigrationPending(!response.initialized);
      setRecoveryAvailable(response.initialized);
      setMutationsEnabled(response.initialized && response.documentStatus?.status === "active");
      setNotice(response.initialized ? "" : "Library migration pending. This document is read-only until an administrator completes initialization.");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      consecutiveFailuresRef.current += 1;
      setMutationsEnabled(false);
      setRecoveryAvailable(false);
      if (documentRef.current === undefined) {
        const integrityFailure = error instanceof SharedLibraryIncompleteResponseError
          || (error instanceof SharedLibraryRequestError && error.code === "LIBRARY_CATALOG_INCOMPLETE");
        setLoadError({
          slug,
          kind: integrityFailure ? "integrity" : "connection",
          message: integrityFailure
            ? "This document has an incomplete historical record. Its prior versions remain protected in Recovery."
            : "The shared Library could not load this document.",
        });
      } else {
        const timestamp = sharedRef.current?.snapshotAt || sharedRef.current?.updatedAt;
        const when = timestamp ? new Date(timestamp).toLocaleString() : "an earlier session";
        setNotice(`Shared library is unavailable. This confirmed copy is read-only. Snapshot from ${when}; revision ${sharedRef.current?.revision ?? "unknown"}.`);
      }
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [applyResponse, slug]);

  useEffect(() => {
    const controller = new AbortController();
    documentRef.current = undefined;
    refreshInFlightRef.current = true;
    void hydrateSharedLibraryState(window.localStorage, controller.signal, { slug, integrityPreview: true }).then(({ response, source }) => {
      if (controller.signal.aborted) return;
      applyResponse(response, source === "server");
      consecutiveFailuresRef.current = source === "server" ? 0 : 1;
      setMigrationPending(source === "server" && !response.initialized);
      setRecoveryAvailable(source === "server" && response.initialized);
      setMutationsEnabled(source === "server" && response.initialized && response.documentStatus?.status === "active");
      if (source === "cache") {
        const timestamp = response.snapshotAt || response.updatedAt;
        const when = timestamp ? new Date(timestamp).toLocaleString() : "an earlier session";
        setNotice(`Shared library is unavailable. This confirmed copy is read-only. Snapshot from ${when}; revision ${response.revision}.`);
      }
      else if (!response.initialized) setNotice("Library migration pending. This document is read-only until an administrator completes initialization.");
    }).catch((error) => {
      if (!controller.signal.aborted) {
        documentRef.current = undefined;
        setDocument(undefined);
        const integrityFailure = error instanceof SharedLibraryIncompleteResponseError
          || (error instanceof SharedLibraryRequestError && error.code === "LIBRARY_CATALOG_INCOMPLETE");
        setLoadError({
          slug,
          kind: integrityFailure ? "integrity" : "connection",
          message: integrityFailure
            ? "This document has an incomplete historical record. Its prior versions remain protected in Recovery."
            : "The shared Library could not load this document.",
        });
        consecutiveFailuresRef.current = 1;
        setMutationsEnabled(false);
        setRecoveryAvailable(false);
      }
    }).finally(() => {
      refreshInFlightRef.current = false;
    });
    return () => controller.abort();
  }, [applyResponse, slug]);

  useEffect(() => {
    const currentDocument = document && documentSlug === slug
      ? document
      : document === null && documentSlug === slug
        ? null
        : undefined;
    const currentLoadError = loadError?.slug === slug ? loadError.message : "";
    if (currentDocument === undefined && !currentLoadError) return;
    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (globalThis.document.visibilityState === "visible") await refresh();
        if (!cancelled) schedule();
      }, getSharedLibraryRefreshDelay(consecutiveFailuresRef.current));
    };
    schedule();
    const onResume = () => { if (globalThis.document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("popstate", onResume);
    globalThis.document.addEventListener("visibilitychange", onResume);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("popstate", onResume);
      globalThis.document.removeEventListener("visibilitychange", onResume);
    };
  }, [document, documentSlug, loadError, refresh, slug]);
  const currentDocument = document && documentSlug === slug
    ? document
    : document === null && documentSlug === slug
      ? null
      : undefined;
  const currentLoadError = loadError?.slug === slug ? loadError : null;
  const recoverDeletedDocument = async () => {
    if (!canAdmin || !recoveryAvailable || documentStatus?.status !== "deleted" || !documentStatus.documentId || documentStatus.recordVersion === undefined || isRecovering) return;
    setIsRecovering(true);
    setRecoveryError("");
    try {
      const saved = await mutateSharedLibrary({
        operation: "document.restore",
        documentId: documentStatus.documentId,
        expectedVersion: documentStatus.recordVersion,
      }, { slug });
      applyResponse(saved);
      setRecoveryAvailable(saved.initialized);
      setMutationsEnabled(saved.initialized);
      setNotice(`“${documentStatus.title || "Document"}” was recovered successfully.`);
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) applyResponse(error.latest);
      setRecoveryError(error instanceof Error ? error.message : "The document could not be recovered. Please try again.");
    } finally {
      setIsRecovering(false);
    }
  };
  const recoverIncompleteDocument = async () => {
    const authoritative = sharedRef.current;
    const preview = authoritative?.recoveryPreview;
    if (!canAdmin
      || !recoveryAvailable
      || !authoritative
      || documentStatus?.status !== "incomplete"
      || !documentStatus.documentId
      || documentStatus.recordVersion === undefined
      || !preview
      || isRecovering) return;
    setIsRecovering(true);
    setRecoveryError("");
    try {
      const saved = await mutateSharedLibrary({
        operation: "documents.restoreIncomplete",
        records: [{
          documentId: documentStatus.documentId,
          versionId: preview.versionId,
          expectedVersion: documentStatus.recordVersion,
        }],
        expectedRevision: authoritative.revision,
      }, { slug: preview.document.slug, integrityPreview: true });
      const restored = verifyRestoredLibraryDocument(
        saved,
        documentStatus.documentId,
        preview.document.slug,
        documentStatus.recordVersion,
      );
      if (!restored) throw new DocumentSaveVerificationError("The restored document was not confirmed by the shared Library.");
      invalidateSharedLibraryDocumentCache(window.localStorage, slug);
      invalidateSharedLibraryDocumentCache(window.localStorage, restored.slug);
      cacheSharedLibraryResponse(saved, window.localStorage, { slug: restored.slug, integrityPreview: true });
      if (restored.slug !== slug) {
        router.replace(`/library/${restored.slug}?recovered=1`);
        return;
      }
      applyResponse(saved);
      setRecoveryAvailable(saved.initialized);
      setMutationsEnabled(saved.initialized);
      setNotice(`“${restored.title}” was recovered successfully.`);
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) applyResponse(error.latest);
      setRecoveryError(error instanceof Error ? error.message : "The document could not be recovered. Please try again.");
    } finally {
      setIsRecovering(false);
    }
  };
  if (currentDocument === undefined && currentLoadError) return <div className="empty-state managed-not-found">
    <h1>{currentLoadError.kind === "integrity" ? "Document recovery required" : "Library connection unavailable"}</h1>
    <p>{currentLoadError.message}{currentLoadError.kind === "connection" ? " Check the connection and try again." : ""}</p>
    {currentLoadError.kind === "connection"
      ? <button className="primary-button" type="button" onClick={() => { setLoadError(null); void refresh(); }}>Try again</button>
      : null}
    <Link className={currentLoadError.kind === "connection" ? "secondary-button" : "primary-button"} prefetch={false} href="/library">Return to Library</Link>
  </div>;
  if (currentDocument === undefined) return <div className="reader-loading" aria-label="Loading document"><div className="skeleton wide"/></div>;
  if (currentDocument === null && documentStatus?.status === "deleted") {
    return <DeletedDocumentState status={documentStatus} canRecover={canAdmin && recoveryAvailable && documentStatus.recordVersion !== undefined} isRecovering={isRecovering} error={recoveryError} onRecover={() => void recoverDeletedDocument()} />;
  }
  if (documentStatus?.status === "incomplete" && currentDocument === null) {
    return <div className="empty-state managed-not-found"><h1>Document recovery required</h1><p>This active document is incomplete, and no protected version passes the current validator.</p><p>No data was changed. An administrator can inspect other retained versions in Recovery Center.</p><Link className="primary-button" prefetch={false} href="/library">Return to Library</Link></div>;
  }
  if (currentDocument === null && documentStatus?.status === "purged") {
    return <div className="empty-state managed-not-found"><h1>{documentStatus.title ? `“${documentStatus.title}” was permanently deleted` : "Document permanently deleted"}</h1><p>This document was permanently removed and cannot be recovered.</p><Link className="primary-button" prefetch={false} href="/library">Return to Library</Link></div>;
  }
  if (currentDocument === null) return <div className="empty-state managed-not-found"><h1>{migrationPending ? "Library migration pending" : "Document unavailable"}</h1><p>{migrationPending ? "The shared catalog is read-only until an administrator completes initialization." : "This topic may be hidden or unavailable in the shared library."}</p><Link className="primary-button" prefetch={false} href="/library">Return to Library</Link></div>;
  const saveDocument = async (updated: ManagedLibraryDocument) => {
    const authoritative = sharedRef.current;
    const expectedVersion = authoritative?.recordVersions.documents[updated.id];
    if (!mutationsEnabled || expectedVersion === undefined) throw new Error("Shared library editing is unavailable.");
    if (!authoritative
      || authoritative.catalogCompleteness?.scope !== "document"
      || authoritative.state.documents.length !== 1
      || authoritative.state.documents[0]?.id !== updated.id
      || authoritative.documentStatus?.status !== "active") {
      const error = new DocumentSaveVerificationError("The full document is not confirmed. Your changes remain open and were not submitted.");
      setNotice(error.message);
      throw error;
    }
    const normalized = normalizeManagedLibraryContentUpdate(updated);
    if (!normalized) {
      const error = new DocumentSaveVerificationError("The formatted document is incomplete or contains invalid data. Your changes remain open and were not submitted.");
      setNotice(error.message);
      throw error;
    }
    try {
      const saved = await mutateSharedLibrary({
        operation: "document.update",
        documentId: normalized.id,
        expectedVersion,
        updateScope: "content",
        document: normalized,
      }, { slug });
      const verified = verifyDocumentSaveResponse(saved, normalized, expectedVersion);
      const confirmed: SharedLibraryResponse = {
        ...saved,
        state: { ...saved.state, documents: [verified] },
        recordVersions: {
          ...saved.recordVersions,
          documents: { ...saved.recordVersions.documents, [verified.id]: saved.mutationResult!.recordVersion },
        },
        documentStatus: {
          status: "active",
          slug: verified.slug,
          documentId: verified.id,
          recordVersion: saved.mutationResult!.recordVersion,
          hidden: verified.hidden,
        },
      };
      if (!applyResponse(confirmed, true, true) || verified.id !== normalized.id) {
        throw new DocumentSaveVerificationError();
      }
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) {
        applyResponse(error.latest, true, true);
        setNotice(error.message);
      } else if (error instanceof DocumentSaveVerificationError) {
        setNotice(error.message);
      } else {
        if (error instanceof SharedLibraryRequestError && [401, 403].includes(error.status)) {
          setMutationsEnabled(false);
        }
        setNotice("The shared Library save could not be confirmed. Your editor changes remain open; try saving again.");
      }
      throw error;
    }
  };
  const saveContentElements = async (contentElements: LibraryContentElement[], metadata: DocumentMetadataDraft) => {
    const text = contentElements.flatMap(element => [element.title, element.text, ...element.body, ...element.items, ...element.steps.flatMap(step => [step.title, step.text]), ...element.nodes.flatMap(node => [node.title, node.text]), ...(element.dropdowns ?? []).flatMap(dropdown => [dropdown.title, dropdown.text])]).join(" ");
    const updated: ManagedLibraryDocument = { ...currentDocument, ...metadata, contentElements, topics: getTopicsFromContentElements(contentElements), updatedAt: new Date().toISOString().slice(0, 10), readingMinutes: Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 200)) };
    await saveDocument(updated);
  };
  const saveVideoUrl = async (videoUrl: string) => {
    const updated: ManagedLibraryDocument = { ...currentDocument, videoUrl: videoUrl || undefined };
    await saveDocument(updated);
  };
  const isRecoveryPreview = documentStatus?.status === "incomplete";
  const documentLinkCatalog = documentLinkCatalogState.documentId === currentDocument.id
    ? { options: documentLinkCatalogState.options, status: documentLinkCatalogState.status, error: documentLinkCatalogState.error, onRequest: requestDocumentLinks }
    : { options: [], status: "idle" as const, error: "", onRequest: requestDocumentLinks };
  return <>{notice ? <p className="admin-notice" role="status">{notice}</p> : null}{isRecoveryPreview ? <div className="document-recovery-preview-banner" role="status"><div><strong>Needs recovery — protected preview</strong><p>You are viewing the newest retained version that passes the current document validator. The incomplete active record has not been changed.</p></div>{recoveryError ? <p className="admin-notice" role="alert">{recoveryError}</p> : null}<div>{canAdmin && recoveryAvailable ? <button className="primary-button" type="button" disabled={isRecovering} onClick={() => void recoverIncompleteDocument()}>{isRecovering ? <><LoaderCircle className="spinning-icon" /> Recovering…</> : <><RotateCcw /> Restore this version</>}</button> : null}<Link className="secondary-button" prefetch={false} href="/library">Return to Library</Link></div></div> : null}<Reader doc={currentDocument} categories={categories} onSaveContentElements={saveContentElements} onSaveVideoUrl={saveVideoUrl} documentLinkCatalog={documentLinkCatalog} mutationsEnabled={mutationsEnabled && !isRecoveryPreview}/></>;
}

function auditActor(audit?: LibraryDocumentDeletionAudit) {
  const actor = audit?.actor;
  if (!actor) return "an unknown user";
  const identity = actor.name || actor.email || "an unknown user";
  const email = actor.email && actor.email !== identity ? ` (${actor.email})` : "";
  return `${identity}${email} · ${actor.role}`;
}

function deletedDocumentDescription(status: SharedLibraryDocumentStatus) {
  const audit = status.deletionAudit;
  const deletedAt = audit?.deletedAt || status.deletedAt;
  const date = deletedAt ? new Date(deletedAt).toLocaleString() : "an unknown time";
  if (!audit || audit.source === "unknown") return `Deleted ${date}; deletion source is unavailable.`;
  if (audit.source === "user") return `Deleted ${date} by ${auditActor(audit)}.`;
  if (audit.source === "system_migration") return `Deleted ${date} by System — Initial Library cleanup.`;
  const initiator = audit.initiatedBy ? `, initiated by ${audit.initiatedBy.name || audit.initiatedBy.email}` : "";
  return `Deleted ${date} by System — Backup restore${initiator}.`;
}

function DeletedDocumentState({ status, canRecover, isRecovering, error, onRecover }: {
  status: SharedLibraryDocumentStatus;
  canRecover: boolean;
  isRecovering: boolean;
  error: string;
  onRecover: () => void;
}) {
  return <div className="empty-state managed-not-found">
    <h1>{status.title ? `“${status.title}” was deleted` : "Document deleted"}</h1>
    <p>{deletedDocumentDescription(status)}</p>
    {error ? <p className="admin-notice" role="alert">{error}</p> : null}
    <div className="managed-not-found-actions">
      {canRecover ? <button className="primary-button" type="button" disabled={isRecovering} onClick={onRecover}>{isRecovering ? <><LoaderCircle className="spinning-icon" /> Recovering…</> : <><RotateCcw /> Recover document</>}</button> : null}
      <Link className={canRecover ? "secondary-button" : "primary-button"} prefetch={false} href="/library">Return to Library</Link>
    </div>
  </div>;
}
