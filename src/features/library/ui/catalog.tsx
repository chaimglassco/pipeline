"use client";

import { ArrowUpDown, Eye, LoaderCircle, Pencil, Plus, RotateCcw, Search, Settings2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import type { LibraryDocument } from "../domain/types";
import { extractTopics, slugifyHeading } from "../domain/headings";
import { filterDocuments } from "../domain/search";
import { type ManagedLibraryDocument } from "../state/admin-storage";
import { createDefaultCategories, type ManagedCategory } from "../state/category-storage";
import { useReadingState } from "../state/reading-state";
import {
  cacheSharedLibraryResponse,
  createLibraryBackup,
  fetchLibraryBackups,
  fetchLibraryIntegrityIncidents,
  fetchLibrarySnapshot,
  fetchPurgedLibraryDocuments,
  fetchSharedLibraryState,
  hydrateSharedLibraryState,
  initializeSharedLibrary,
  mutateSharedLibrary,
  reconcileSharedLibraryDocumentCaches,
  restorePurgedLibraryDocument,
  SharedLibraryConflictError,
  verifyRestoredIncompleteDocuments,
  verifyRestoredLibraryDocument,
  type LibraryBackup,
  type LibraryIntegrityIncident,
  type PurgedLibraryDocument,
  type LibraryVersion,
  type SharedLibraryMutation,
  type SharedLibraryReadOptions,
} from "../state/shared-library-client";
import { getSharedLibraryRefreshDelay } from "../state/shared-library-retry";
import type { SharedLibraryDocumentIntegrity, SharedLibraryResponse } from "../state/shared-library-state";
import { CategoryManager } from "./category-manager";
import { DeleteDocumentDialog } from "./delete-document-dialog";
import { DeletedDocuments } from "./deleted-documents";
import { DocumentCard } from "./document-card";
import { DocumentEditor, type DocumentDraft } from "./document-editor";
import { DocumentReorderDialog } from "./document-reorder-dialog";
import { useGlasscoSession } from "@/components/glassco-session";

function cachedSnapshotNotice(response: SharedLibraryResponse | null) {
  const timestamp = response?.snapshotAt || response?.updatedAt;
  const when = timestamp ? new Date(timestamp).toLocaleString() : "an earlier session";
  const revision = response ? ` Revision ${response.revision}.` : "";
  return `Shared library is unavailable. Showing the last confirmed copy from ${when} in read-only mode.${revision}`;
}

const CATALOG_READ_OPTIONS: SharedLibraryReadOptions = { summary: true, integrityPreview: true };

export function Catalog({ documents }: { documents: LibraryDocument[] }) {
  const { canAdmin, canEdit } = useGlasscoSession();
  const { setAvailableDocumentIds } = useReadingState();
  const router = useRouter();
  const pathname = usePathname() ?? "/library";
  const params = useSearchParams() ?? new URLSearchParams();
  const paramsString = params.toString();
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferred = useDeferredValue(q);
  const category = params.get("category") ?? "";
  const [managed, setManaged] = useState<ManagedLibraryDocument[]>(() => documents.map(document => ({ ...document })));
  const [categories, setCategories] = useState<ManagedCategory[]>(createDefaultCategories);
  const [manageMode, setManageMode] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showDocumentRecovery, setShowDocumentRecovery] = useState(false);
  const [isLoadingDocumentRecovery, setIsLoadingDocumentRecovery] = useState(false);
  const [documentRecoveryError, setDocumentRecoveryError] = useState("");
  const [isLoadingPurgedHistory, setIsLoadingPurgedHistory] = useState(false);
  const [archivedDocuments, setArchivedDocuments] = useState<ManagedLibraryDocument[]>([]);
  const [archiveRecordVersions, setArchiveRecordVersions] = useState<Record<string, number>>({});
  const [libraryBackups, setLibraryBackups] = useState<LibraryBackup[]>([]);
  const [integrityIncidents, setIntegrityIncidents] = useState<LibraryIntegrityIncident[]>([]);
  const [purgedDocuments, setPurgedDocuments] = useState<PurgedLibraryDocument[]>([]);
  const [purgedHistoryError, setPurgedHistoryError] = useState("");
  const [showDocumentReorder, setShowDocumentReorder] = useState(false);
  const [editor, setEditor] = useState<"new" | null>(null);
  const [notice, setNotice] = useState("");
  const [isCatalogReady, setIsCatalogReady] = useState(false);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [librarySource, setLibrarySource] = useState<"server" | "cache" | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [shared, setShared] = useState<SharedLibraryResponse | null>(null);
  const [incompleteIntegrity, setIncompleteIntegrity] = useState<Record<string, SharedLibraryDocumentIntegrity>>({});
  const sharedRef = useRef<SharedLibraryResponse | null>(null);
  const refreshInFlightRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const [documentToDelete, setDocumentToDelete] = useState<ManagedLibraryDocument | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isRecoveringSystemDocuments, setIsRecoveringSystemDocuments] = useState(false);
  const [systemRecoveryError, setSystemRecoveryError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const successTimerRef = useRef<number | null>(null);
  const lastMutationErrorRef = useRef("");

  useEffect(() => () => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
  }, []);

  const announceSuccess = (message: string) => {
    setSuccessMessage(message);
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => setSuccessMessage(""), 4_000);
  };

  const applySharedResponse = useCallback((response: SharedLibraryResponse, cache = true, reconcile = false) => {
    const removed = reconcile
      ? reconcileSharedLibraryDocumentCaches(sharedRef.current, response, window.localStorage)
      : [];
    sharedRef.current = response;
    setShared(response);
    if (response.recordIntegrity) setIncompleteIntegrity(response.recordIntegrity.documents);
    setManaged(response.state.documents);
    setCategories(response.state.categories);
    setAvailableDocumentIds(response.state.documents
      .filter(document => !document.deletedAt
        && !document.hidden
        && document.status === "published"
        && !response.recordIntegrity?.documents[document.id])
      .map(document => document.id));
    if (cache) cacheSharedLibraryResponse(response, window.localStorage, CATALOG_READ_OPTIONS);
    return removed;
  }, [setAvailableDocumentIds]);

  const refresh = useCallback(async (signal?: AbortSignal, requestedOptions?: SharedLibraryReadOptions) => {
    if (!requestedOptions && (showDocumentRecovery || showDocumentReorder)) return false;
    if (refreshInFlightRef.current) return false;
    refreshInFlightRef.current = true;
    try {
      const requestedReadOptions: SharedLibraryReadOptions = requestedOptions ?? (showDocumentRecovery
        ? { summary: true, recovery: true }
        : CATALOG_READ_OPTIONS);
      const readOptions = requestedReadOptions.summary && !requestedReadOptions.recovery && !requestedReadOptions.archive
        ? { ...requestedReadOptions, integrityPreview: true }
        : requestedReadOptions;
      const response = await fetchSharedLibraryState(signal, readOptions);
      const categoryWasCleared = Boolean(category)
        && !response.state.categories.some(item => !item.deletedAt && !item.hidden && item.name === category);
      if (categoryWasCleared) {
        const next = new URLSearchParams(paramsString);
        next.delete("category");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }
      const removed = applySharedResponse(response, !readOptions.recovery, true);
      consecutiveFailuresRef.current = 0;
      setLibrarySource("server");
      setMutationsEnabled(response.initialized);
      setNotice(!response.initialized
        ? "Library migration pending. The shared catalog is read-only until an administrator completes initialization."
        : categoryWasCleared
          ? "Library updated. The selected category is no longer available, so the filter was cleared."
        : removed.length
          ? `Library updated. ${removed.length === 1 ? `“${removed[0].title}” is` : `${removed.length} documents are`} no longer active.`
          : "");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      consecutiveFailuresRef.current += 1;
      setMutationsEnabled(false);
      const hasConfirmedCopy = sharedRef.current !== null;
      setLibrarySource(hasConfirmedCopy ? "cache" : null);
      setNotice(hasConfirmedCopy
        ? cachedSnapshotNotice(sharedRef.current)
        : "Shared library is unavailable and no confirmed cached copy exists.");
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [applySharedResponse, category, paramsString, pathname, router, showDocumentRecovery, showDocumentReorder]);

  useEffect(() => {
    const controller = new AbortController();
    refreshInFlightRef.current = true;
    void hydrateSharedLibraryState(window.localStorage, controller.signal, CATALOG_READ_OPTIONS).then(({ response, source }) => {
      if (controller.signal.aborted) return;
      applySharedResponse(response, source === "server");
      consecutiveFailuresRef.current = source === "server" ? 0 : 1;
      setLibrarySource(source);
      setMutationsEnabled(source === "server" && response.initialized);
      if (source === "cache") setNotice(cachedSnapshotNotice(response));
      else if (!response.initialized) setNotice("Library migration pending. The shared catalog is read-only until an administrator completes initialization.");
      setIsCatalogReady(true);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setManaged([]);
      setCategories([]);
      setLibrarySource(null);
      consecutiveFailuresRef.current = 1;
      setMutationsEnabled(false);
      setNotice("Shared library is unavailable and no confirmed cached copy exists.");
      setIsCatalogReady(true);
    }).finally(() => {
      refreshInFlightRef.current = false;
    });
    return () => controller.abort();
  }, [applySharedResponse]);

  useEffect(() => {
    if (!isCatalogReady) return;
    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") await refresh();
        if (!cancelled) schedule();
      }, getSharedLibraryRefreshDelay(consecutiveFailuresRef.current));
    };
    schedule();
    const onResume = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("popstate", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("popstate", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [isCatalogReady, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(paramsString);
      if (deferred) next.set("q", deferred); else next.delete("q");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deferred, pathname, router, paramsString]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(paramsString);
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const commitMutation = async (
    mutation: SharedLibraryMutation,
    message: string,
    readOptions: SharedLibraryReadOptions = CATALOG_READ_OPTIONS,
  ) => {
    lastMutationErrorRef.current = "";
    if (!mutationsEnabled) {
      const unavailableMessage = "Shared library is unavailable. Refresh the Library and try again.";
      lastMutationErrorRef.current = unavailableMessage;
      setNotice(unavailableMessage);
      return null;
    }
    try {
      const saved = await mutateSharedLibrary(mutation, readOptions);
      applySharedResponse(saved, !readOptions.recovery, true);
      setNotice(message);
      return saved;
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) {
        applySharedResponse(error.latest);
        lastMutationErrorRef.current = error.message;
        setNotice(error.message);
      } else {
        const errorMessage = error instanceof Error && error.message
          ? error.message
          : "Unable to save to the shared library. No local-only change was kept.";
        lastMutationErrorRef.current = errorMessage;
        setNotice(errorMessage);
      }
      return null;
    }
  };

  const refreshDocumentRecovery = async () => {
    if (!mutationsEnabled || isLoadingDocumentRecovery || isLoadingPurgedHistory) {
      if (!mutationsEnabled) setDocumentRecoveryError("Reconnect to the shared Library before refreshing Recovery.");
      return;
    }
    setDocumentRecoveryError("");
    setPurgedHistoryError("");
    setIsLoadingDocumentRecovery(true);
    setIsLoadingPurgedHistory(true);
    const recoveryRequest = fetchSharedLibraryState(undefined, { summary: true, recovery: true })
      .then(response => {
        applySharedResponse(response, false, true);
        setLibrarySource("server");
        setMutationsEnabled(response.initialized);
        setNotice("");
      })
      .catch(error => {
        setDocumentRecoveryError(error instanceof Error ? error.message : "Recoverable documents could not be loaded.");
      })
      .finally(() => setIsLoadingDocumentRecovery(false));
    const archiveRequest = fetchSharedLibraryState(undefined, { summary: true, archive: true, includeDeletionAudit: true })
      .then(response => {
        setArchivedDocuments(response.state.documents);
        setArchiveRecordVersions(response.recordVersions.documents);
      })
      .catch(error => {
        setPurgedHistoryError(error instanceof Error ? error.message : "Protected archive could not be loaded.");
      });
    const protectedRecoveryRequest = fetchPurgedLibraryDocuments()
      .then(setPurgedDocuments)
      .catch(error => {
        setPurgedHistoryError(error instanceof Error ? error.message : "Protected legacy recovery could not be loaded.");
      });
    const backupsRequest = fetchLibraryBackups().then(setLibraryBackups).catch(error => {
      setPurgedHistoryError(error instanceof Error ? error.message : "Library snapshots could not be loaded.");
    });
    const incidentsRequest = fetchLibraryIntegrityIncidents().then(setIntegrityIncidents).catch(error => {
      setPurgedHistoryError(error instanceof Error ? error.message : "Library integrity incidents could not be loaded.");
    });
    await Promise.allSettled([recoveryRequest, archiveRequest, protectedRecoveryRequest, backupsRequest, incidentsRequest]);
    setIsLoadingPurgedHistory(false);
  };

  const openDocumentRecovery = () => {
    if (!mutationsEnabled) {
      setNotice("Reconnect to the shared Library before opening Recovery.");
      return;
    }
    setShowDocumentRecovery(true);
    setArchivedDocuments([]);
    setPurgedDocuments([]);
    setLibraryBackups([]);
    setIntegrityIncidents([]);
    void refreshDocumentRecovery();
  };

  const closeDocumentRecovery = () => {
    setShowDocumentRecovery(false);
    setSystemRecoveryError("");
    setDocumentRecoveryError("");
    setArchivedDocuments([]);
    setPurgedDocuments([]);
    setLibraryBackups([]);
    setIntegrityIncidents([]);
    setPurgedHistoryError("");
    void refresh(undefined, CATALOG_READ_OPTIONS);
  };

  const requestDocumentDelete = (document: ManagedLibraryDocument) => {
    setDeleteError("");
    setDocumentToDelete(document);
  };

  const confirmDocumentDelete = async () => {
    if (!documentToDelete || isDeletingDocument) return;
    const expectedVersion = sharedRef.current?.recordVersions.documents[documentToDelete.id];
    if (expectedVersion === undefined) {
      setDeleteError("The current document version is unavailable. Close this message and try again.");
      return;
    }
    setIsDeletingDocument(true);
    setDeleteError("");
    const deleted = await commitMutation({ operation: "document.delete", documentId: documentToDelete.id, expectedVersion }, "");
    setIsDeletingDocument(false);
    if (!deleted) {
      setDeleteError(lastMutationErrorRef.current || "The document could not be deleted. Please try again.");
      return;
    }
    const title = documentToDelete.title;
    setDocumentToDelete(null);
    announceSuccess(`${title} was deleted successfully.`);
  };

  const migrateLibrary = async () => {
    if (!canAdmin || librarySource !== "server" || shared?.initialized !== false || isMigrating) return;
    if (!window.confirm("Back up the legacy Library and import the complete catalog? This can only initialize an empty shared Library.")) return;
    setIsMigrating(true);
    setNotice("Backing up and restoring the Library…");
    try {
      const response = await initializeSharedLibrary();
      applySharedResponse(response);
      setLibrarySource("server");
      setMutationsEnabled(response.initialized);
      setNotice("Library backup and complete catalog import finished successfully.");
    } catch (error) {
      setNotice(error instanceof Error ? `Library migration failed: ${error.message}` : "Library migration failed. No changes were applied.");
    } finally {
      setIsMigrating(false);
    }
  };

  const categoryNameExists = (name: string, ignoredId = "") => categories.some(item => item.id !== ignoredId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const createCategory = (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    if (categoryNameExists(normalizedName)) { setNotice("That category name already exists."); return false; }
    void commitMutation({ operation: "category.create", category: { id: `category-${crypto.randomUUID()}`, name: normalizedName, hidden: false } }, "Category created.");
    return true;
  };
  const renameCategory = (id: string, name: string) => {
    if (categoryNameExists(name, id)) { setNotice("That category name already exists."); return; }
    const current = categories.find(item => item.id === id);
    if (!current) return;
    const expectedVersion = sharedRef.current?.recordVersions.categories[id];
    if (expectedVersion === undefined) return;
    void commitMutation({ operation: "category.update", categoryId: id, expectedVersion, category: { ...current, name } }, "Category renamed and assigned documents updated.");
    if (category === current.name) update("category", name);
  };
  const deleteCategory = async (id: string) => {
    const current = categories.find(item => item.id === id);
    if (!current) return "The category is no longer available. Refresh the Library and try again.";
    const expectedVersion = sharedRef.current?.recordVersions.categories[id];
    if (expectedVersion === undefined) return "The current category version is unavailable. Close this window and try again.";
    const response = await commitMutation({ operation: "category.delete", categoryId: id, expectedVersion }, "");
    if (!response) return lastMutationErrorRef.current || "The category could not be deleted. Please try again.";
    if (category === current.name) update("category", "");
    setNotice("");
    return null;
  };
  const permanentlyDeleteCategory = async (id: string) => {
    const current = categories.find(item => item.id === id);
    if (!current?.deletedAt) return "The deleted category is no longer available. Refresh Recovery and try again.";
    const expectedVersion = sharedRef.current?.recordVersions.categories[id];
    if (expectedVersion === undefined) return "The current category version is unavailable. Close this window and try again.";
    const response = await commitMutation({ operation: "category.archive", categoryId: id, expectedVersion }, "");
    if (!response) return lastMutationErrorRef.current || "The category could not be permanently deleted. Please try again.";
    setNotice("");
    return null;
  };
  const toggleCategoryHidden = (id: string) => {
    const current = categories.find(item => item.id === id);
    if (!current) return;
    const expectedVersion = sharedRef.current?.recordVersions.categories[id];
    if (expectedVersion === undefined) return;
    void commitMutation({ operation: "category.update", categoryId: id, expectedVersion, category: { ...current, hidden: !current.hidden } }, current.hidden ? "Category shown in the dropdown." : "Category hidden from the dropdown.");
    if (!current.hidden && category === current.name) update("category", "");
  };

  const clear = () => { setQ(""); router.replace(pathname, { scroll: false }); };
  const saveDraft = (draft: DocumentDraft) => {
    const body = draft.body.trim().startsWith("##") ? draft.body.trim() : `## Overview\n\n${draft.body.trim() || "Add the topic content here."}`;
    const tags = draft.tags.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 12);
    const now = new Date().toISOString();
    const id = `admin-${crypto.randomUUID()}`;
    const slug = `${slugifyHeading(draft.title) || "library-topic"}-${id.slice(-8)}`;
    const document: ManagedLibraryDocument = { id, slug, title: draft.title.trim(), description: draft.description.trim(), category: draft.category, type: draft.type, tags, body, topics: extractTopics(body), readingMinutes: Math.max(1, Math.ceil(body.split(/\s+/).length / 200)), updatedAt: now, status: "published", hidden: false };
    void commitMutation({ operation: "document.create", document }, "Topic added.").then(saved => {
      if (!saved) return;
      setEditor(null);
      if (canAdmin) setManageMode(true);
    });
  };

  const activeCategories = categories.filter(item => !item.deletedAt && !item.archivedAt);
  const filterCategories = activeCategories.filter(item => manageMode || !item.hidden);
  const editorCategories = activeCategories.map(item => item.name);
  const incompleteDocuments = Object.values(incompleteIntegrity);
  const incompleteDocumentIds = new Set(incompleteDocuments.map(document => document.documentId));
  const activeDocuments = managed.filter(document => !document.deletedAt && !incompleteDocumentIds.has(document.id));
  const visibleToReader = activeDocuments.filter(document => !document.hidden);
  const catalogDocuments = manageMode ? activeDocuments : visibleToReader;
  const results = filterDocuments(catalogDocuments, { q: deferred, category });
  const filtered = Boolean(q || category);
  const deleted = managed.filter(document => document.deletedAt);
  const recoveryDocumentCount = (shared?.recoveryDocumentCount ?? deleted.length) + incompleteDocuments.length;
  const documentCounts = managed.reduce<Record<string, number>>((counts, document) => { counts[document.category] = (counts[document.category] ?? 0) + 1; return counts; }, {});
  const saveDocumentOrder = async (order: string[]) => {
    const initialRevision = sharedRef.current?.revision;
    if (initialRevision === undefined) return "The current Library revision is unavailable. Close this window and try again.";
    let response = await commitMutation(
      { operation: "documents.reorder", documentIds: order, expectedRevision: initialRevision },
      "",
    );
    const refreshedRevision = sharedRef.current?.revision;
    if (!response
      && refreshedRevision !== undefined
      && refreshedRevision !== initialRevision
      && lastMutationErrorRef.current.includes("changed in another session")) {
      response = await commitMutation(
        { operation: "documents.reorder", documentIds: order, expectedRevision: refreshedRevision },
        "",
      );
    }
    if (!response) return lastMutationErrorRef.current || "The document order could not be saved. Please try again.";
    setNotice("");
    setShowDocumentReorder(false);
    announceSuccess("Library document order saved successfully.");
    return null;
  };
  const recoverSystemDeletedDocuments = async (documentIds: string[]) => {
    const revision = sharedRef.current?.revision;
    if (revision === undefined || isRecoveringSystemDocuments) return;
    setIsRecoveringSystemDocuments(true);
    setSystemRecoveryError("");
    const response = await commitMutation({
      operation: "documents.restoreSystemDeleted",
      documentIds,
      expectedRevision: revision,
    }, "", { summary: true, recovery: true });
    setIsRecoveringSystemDocuments(false);
    if (!response) {
      setSystemRecoveryError(lastMutationErrorRef.current || "The documents could not be recovered. Please try again.");
      return;
    }
    setSystemRecoveryError("");
    const restoredCount = response.restoredCount ?? documentIds.length;
    announceSuccess(`${restoredCount} system-deleted ${restoredCount === 1 ? "document was" : "documents were"} recovered successfully.`);
    if ((response.recoveryDocumentCount ?? 0) === 0) closeDocumentRecovery();
  };
  const recoverIncompleteDocuments = async (entries: SharedLibraryDocumentIntegrity[]) => {
    const revision = sharedRef.current?.revision;
    if (revision === undefined) return "The current Library revision is unavailable. Refresh Recovery and try again.";
    const recoverable = entries.filter(entry => entry.hasRecoveryCandidate && entry.recoveryCandidateVersionId);
    if (!recoverable.length) return "No valid protected version is available for the selected document.";
    try {
      const records = recoverable.map(entry => ({
        documentId: entry.documentId,
        versionId: String(entry.recoveryCandidateVersionId),
        expectedVersion: entry.recordVersion,
      }));
      const response = await mutateSharedLibrary({
        operation: "documents.restoreIncomplete",
        records,
        expectedRevision: revision,
      }, CATALOG_READ_OPTIONS);
      if (!verifyRestoredIncompleteDocuments(response, records)) {
        return "The recovered documents were not confirmed by the shared Library.";
      }
      applySharedResponse(response, true, true);
      const restoredCount = response.restoredCount ?? records.length;
      announceSuccess(`${restoredCount} incomplete ${restoredCount === 1 ? "document was" : "documents were"} restored successfully.`);
      return null;
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) {
        applySharedResponse(error.latest, true, true);
        return "The Library changed in another session. Recovery was not applied; review the refreshed list and try again.";
      }
      return error instanceof Error ? error.message : "The incomplete documents could not be recovered.";
    }
  };
  const permanentlyDeleteDocument = async (document: ManagedLibraryDocument) => {
    const expectedVersion = sharedRef.current?.recordVersions.documents[document.id];
    if (expectedVersion === undefined) return "The current document version is unavailable. Close this message and try again.";
    const response = await commitMutation({
      operation: "document.archive",
      documentId: document.id,
      expectedVersion,
    }, "", { summary: true, recovery: true });
    if (!response) return lastMutationErrorRef.current || "The document could not be moved to the protected archive. Please try again.";
    announceSuccess(`${document.title} was moved to the protected archive.`);
    void refreshDocumentRecovery();
    return null;
  };
  const archiveIncompleteDocument = async (document: SharedLibraryDocumentIntegrity) => {
    const response = await commitMutation({
      operation: "document.archiveIncomplete",
      documentId: document.documentId,
      expectedVersion: document.recordVersion,
    }, "", { summary: true, recovery: true, integrityPreview: true });
    if (!response) return lastMutationErrorRef.current || "The incomplete document could not be moved to the protected archive. Please try again.";
    announceSuccess(`${document.title} was removed from Needs recovery and moved to the protected archive.`);
    void refreshDocumentRecovery();
    return null;
  };
  const recoverDocument = async (document: ManagedLibraryDocument) => {
    const expectedVersion = sharedRef.current?.recordVersions.documents[document.id];
    if (expectedVersion === undefined) return "The current document version is unavailable. Close recovery and try again.";
    const response = await commitMutation({
      operation: "document.restore",
      documentId: document.id,
      expectedVersion,
    }, "", { summary: true, recovery: true });
    if (!response) {
      try {
        const latest = await fetchSharedLibraryState(undefined, { summary: true, recovery: true });
        applySharedResponse(latest, false, true);
        setLibrarySource("server");
        setMutationsEnabled(latest.initialized);
        const latestDocument = latest.state.documents.find(item => item.id === document.id);
        if (latestDocument && !latestDocument.deletedAt) {
          setNotice("");
          announceSuccess(`${document.title} was recovered successfully.`);
          return null;
        }
      } catch { /* keep the original mutation error */ }
      return lastMutationErrorRef.current || "The document could not be recovered. Please try again.";
    }
    announceSuccess(`${document.title} was recovered successfully.`);
    return null;
  };
  const restoreArchivedDocument = async (document: ManagedLibraryDocument) => {
    const expectedVersion = archiveRecordVersions[document.id];
    if (expectedVersion === undefined) return "The protected archive version is unavailable. Refresh Recovery and try again.";
    const response = await commitMutation({
      operation: "document.restoreArchived",
      documentId: document.id,
      expectedVersion,
    }, "", CATALOG_READ_OPTIONS);
    if (!response) return lastMutationErrorRef.current || "The archived document could not be restored.";
    announceSuccess(`${document.title} was restored from the protected archive.`);
    await refreshDocumentRecovery();
    return null;
  };
  const restorePurgedDocument = async (document: PurgedLibraryDocument) => {
    try {
      const response = await restorePurgedLibraryDocument(document.documentId);
      applySharedResponse(response, true, true);
      setPurgedDocuments(current => current.filter(item => item.documentId !== document.documentId));
      announceSuccess(`${document.title} was restored from its protected recovery copy.`);
      await refreshDocumentRecovery();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "The protected document could not be restored.";
    }
  };
  const restoreVersion = async (version: LibraryVersion) => {
    const expectedVersion = sharedRef.current?.recordVersions.documents[version.recordId]
      ?? archiveRecordVersions[version.recordId];
    if (expectedVersion === undefined) return "The current document version is unavailable.";
    const versionDocument = version.data as Partial<ManagedLibraryDocument>;
    const versionSlug = typeof versionDocument.slug === "string" ? versionDocument.slug.trim() : "";
    if (!versionSlug) return "The selected version does not contain a valid document slug.";
    try {
      const response = await mutateSharedLibrary({
        operation: "record.restoreVersion",
        recordType: "document",
        recordId: version.recordId,
        versionId: version.id,
        expectedVersion,
      }, { slug: versionSlug });
      if (!verifyRestoredLibraryDocument(response, version.recordId, versionSlug, expectedVersion)) {
        return "The selected version was not confirmed by the shared Library.";
      }
      cacheSharedLibraryResponse(response, window.localStorage, { slug: versionSlug });
      announceSuccess("The selected document version was restored successfully.");
      await refreshDocumentRecovery();
      return null;
    } catch (error) {
      if (error instanceof SharedLibraryConflictError) applySharedResponse(error.latest);
      return error instanceof Error ? error.message : "The selected version could not be restored.";
    }
  };
  const createRecoverySnapshot = async () => {
    try {
      const backup = await createLibraryBackup();
      setLibraryBackups(current => [backup, ...current.filter(item => item.id !== backup.id)]);
      announceSuccess("A protected Library snapshot was created successfully.");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "The Library snapshot could not be created.";
    }
  };
  const restoreSnapshotRecords = async (backup: LibraryBackup, recordIds: string[]) => {
    const revision = sharedRef.current?.revision;
    if (revision === undefined) return "The current Library revision is unavailable.";
    try {
      const snapshot = await fetchLibrarySnapshot(backup.id);
      const available = new Set(snapshot.state.documents.map(document => document.id));
      const selected = recordIds.filter(id => available.has(id));
      if (!selected.length) return "Select at least one document from this snapshot.";
      const response = await commitMutation({
        operation: "records.restoreFromSnapshot",
        snapshotId: backup.id,
        recordType: "document",
        recordIds: selected,
        expectedRevision: revision,
      }, "", CATALOG_READ_OPTIONS);
      if (!response) return lastMutationErrorRef.current || "The selected snapshot records could not be restored.";
      announceSuccess(`${selected.length} snapshot ${selected.length === 1 ? "document was" : "documents were"} restored successfully.`);
      await refreshDocumentRecovery();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "The selected snapshot records could not be restored.";
    }
  };
  const acknowledgeIncident = async (incident: LibraryIntegrityIncident) => {
    const revision = sharedRef.current?.revision;
    if (revision === undefined) return "The current Library revision is unavailable.";
    const response = await commitMutation({
      operation: "integrity.acknowledge",
      incidentId: incident.id,
      expectedRevision: revision,
    }, "", CATALOG_READ_OPTIONS);
    if (!response) return lastMutationErrorRef.current || "The integrity incident could not be acknowledged.";
    setIntegrityIncidents(current => current.map(item => item.id === incident.id
      ? { ...item, acknowledgedAt: new Date().toISOString(), acknowledgedBy: "Current administrator" }
      : item));
    announceSuccess("Integrity incident acknowledged.");
    return null;
  };

  return <section className="catalog-panel" aria-label="Library documents">
    <div className="catalog-toolbar">
      <div className="filters">
        <div className="category-filter-control"><label><span className="sr-only">Category</span><select value={category} onChange={event => update("category", event.target.value)}><option value="">All categories</option>{filterCategories.map(item => <option key={item.id} value={item.name}>{item.name}{item.hidden ? " (Hidden)" : ""}</option>)}</select></label>{manageMode ? <button className="manage-categories-button" type="button" onClick={() => setShowCategoryManager(true)} aria-label="Manage categories"><Settings2 /></button> : null}</div>
        <label className="search-input"><span className="sr-only">Search documents</span><input value={q} onChange={event => setQ(event.target.value)} placeholder="Search documentation..."/><Search aria-hidden="true" /></label>
        {filtered && <button className="clear-button" type="button" onClick={clear} aria-label="Clear all filters"><X /></button>}
      </div>
      {canEdit ? <div className="admin-toolbar">{canAdmin ? <button className="document-recovery-trigger" type="button" onClick={() => void openDocumentRecovery()} disabled={!mutationsEnabled || isLoadingDocumentRecovery} aria-label={`Open document recovery${recoveryDocumentCount ? ` (${recoveryDocumentCount})` : ""}`} title={!mutationsEnabled ? "Reconnect to view recovery." : recoveryDocumentCount ? `${recoveryDocumentCount} recoverable ${recoveryDocumentCount === 1 ? "document" : "documents"}` : "View recovery and permanent deletion history."}>{isLoadingDocumentRecovery ? <LoaderCircle className="spinning-icon" /> : <RotateCcw />}</button> : null}{canAdmin ? <><button className="catalog-reorder-button" type="button" onClick={() => setShowDocumentReorder(true)} disabled={!mutationsEnabled || activeDocuments.length < 2} title={!mutationsEnabled ? "Reconnect to reorder." : activeDocuments.length < 2 ? "Add or recover another document to reorder." : "Reorder active documents."}><ArrowUpDown /><span>REORDER</span></button><button className={manageMode ? "active" : ""} type="button" disabled={!mutationsEnabled} onClick={() => { if (manageMode && category && !activeCategories.some(item => item.name === category && !item.hidden)) update("category", ""); if (manageMode) closeDocumentRecovery(); setManageMode(value => !value); setNotice(""); }} aria-label={manageMode ? "Return to library view" : "Manage library"} aria-pressed={manageMode}>{manageMode ? <Pencil /> : <Eye />}</button></> : null}<button className="add-topic-button" type="button" disabled={!mutationsEnabled} onClick={() => setEditor("new")} aria-label="Add new topic"><Plus /></button></div> : null}
    </div>
    {manageMode && <div className="admin-mode-banner"><span>Admin mode</span><p>Edit documents and manage category dropdown options, visibility, order, deletion, and recovery.</p>{activeDocuments.length < 2 ? <p className="admin-mode-reorder-hint">Reorder needs at least 2 active documents. Add or recover another document first.</p> : null}</div>}
    {canAdmin && (shared?.integrityStatus?.unacknowledgedIncidentCount ?? 0) > 0 ? <p className="admin-notice library-integrity-notice" role="alert">Library Protection automatically repaired {shared?.integrityStatus?.unacknowledgedIncidentCount} unexpected {shared?.integrityStatus?.unacknowledgedIncidentCount === 1 ? "change" : "changes"}. Open Recovery → Incidents to review and acknowledge.</p> : null}
    {notice && <p className="admin-notice" role="status">{notice}{librarySource !== "server" && isCatalogReady ? <> <button className="inline-retry-button" type="button" onClick={() => void refresh()}>Try again</button></> : null}</p>}
    {canAdmin && librarySource === "server" && shared?.initialized === false ? <button className="primary-button" type="button" onClick={() => void migrateLibrary()} disabled={isMigrating}>{isMigrating ? "BACKING UP AND IMPORTING…" : "Back up and import complete Library"}</button> : null}
    {isCatalogReady ? <><p className="result-bar" aria-live="polite">{results.length} {results.length === 1 ? "document" : "documents"}</p>
    {results.length ? <div className="document-grid">{results.map(doc => {
      const activeIndex = activeDocuments.findIndex(document => document.id === doc.id);
      const expectedVersion = shared?.recordVersions.documents[doc.id];
      const updateDocument = (updated: ManagedLibraryDocument, message: string) => expectedVersion === undefined ? undefined : void commitMutation({ operation: "document.update", documentId: doc.id, expectedVersion, document: updated }, message);
      const reorder = (direction: -1 | 1) => {
        const next = [...activeDocuments];
        const target = activeIndex + direction;
        if (target < 0 || target >= next.length || sharedRef.current === null) return;
        [next[activeIndex], next[target]] = [next[target], next[activeIndex]];
        void commitMutation({ operation: "documents.reorder", documentIds: next.map(document => document.id), expectedRevision: sharedRef.current.revision }, "Document order updated.");
      };
      const needsRecovery = Boolean(incompleteIntegrity[doc.id]);
      return <DocumentCard key={doc.id} doc={doc} needsRecovery={needsRecovery} admin={manageMode && mutationsEnabled && !needsRecovery ? { onToggleHidden: () => updateDocument({ ...doc, hidden: !doc.hidden, updatedAt: new Date().toISOString() }, doc.hidden ? "Document is visible." : "Document hidden."), onDelete: () => requestDocumentDelete(doc), onMoveUp: () => reorder(-1), onMoveDown: () => reorder(1), canMoveUp: activeIndex > 0, canMoveDown: activeIndex < activeDocuments.length - 1 } : undefined}/>;
    })}</div> : filtered ? <div className="empty-state"><Search aria-hidden="true" /><h2>No documents match</h2><p>Try a broader search or remove the active filters.</p><button className="primary-button" onClick={clear}>Clear all filters</button></div> : <div className="empty-state library-empty-state"><Search aria-hidden="true" /><h2>The Library has no active documents</h2><p>Add a new document, or open Recovery to restore a deleted document or the protected bQool snapshot.</p>{canAdmin && mutationsEnabled ? <div className="library-empty-actions"><button className="primary-button" type="button" onClick={() => setEditor("new")}><Plus /> Add document</button><button className="secondary-button" type="button" onClick={openDocumentRecovery}><RotateCcw /> Open Recovery</button></div> : null}</div>}</> : <div className="skeleton-grid" aria-label="Loading library documents">{[1, 2, 3].map(item => <div className="skeleton" key={item} />)}</div>}
    {canAdmin && showDocumentRecovery ? <DeletedDocuments
      documents={deleted}
      incompleteDocuments={incompleteDocuments}
      deletionAudit={shared?.deletionAudit?.documents ?? {}}
      isRecoveringSystemDocuments={isRecoveringSystemDocuments}
      systemRecoveryError={systemRecoveryError}
      onClose={closeDocumentRecovery}
      onRecover={recoverDocument}
      onRecoverIncomplete={recoverIncompleteDocuments}
      onArchiveIncomplete={archiveIncompleteDocument}
      onRecoverSystemDeleted={documentIds => void recoverSystemDeletedDocuments(documentIds)}
      onPermanentlyDelete={permanentlyDeleteDocument}
      archivedDocuments={archivedDocuments}
      backups={libraryBackups}
      incidents={integrityIncidents}
      activeDocuments={activeDocuments}
      purgedDocuments={purgedDocuments}
      onRestorePurged={restorePurgedDocument}
      purgedHistoryError={purgedHistoryError}
      isLoadingDocuments={isLoadingDocumentRecovery}
      documentLoadError={documentRecoveryError}
      isLoadingPurgedHistory={isLoadingPurgedHistory}
      onRetry={() => void refreshDocumentRecovery()}
      onRestoreArchived={restoreArchivedDocument}
      onRestoreVersion={restoreVersion}
      onCreateSnapshot={createRecoverySnapshot}
      onRestoreSnapshotRecords={restoreSnapshotRecords}
      onAcknowledgeIncident={acknowledgeIncident}
    /> : null}
    {canEdit && editor && mutationsEnabled ? <DocumentEditor key="new" categories={editorCategories} onCancel={() => setEditor(null)} onSave={saveDraft} onCreateCategory={canAdmin ? createCategory : undefined} onManageCategories={canAdmin ? () => setShowCategoryManager(true) : undefined}/> : null}
    {canAdmin && showDocumentReorder ? <DocumentReorderDialog documents={activeDocuments} onCancel={() => setShowDocumentReorder(false)} onSave={saveDocumentOrder} /> : null}
    {canAdmin && showCategoryManager ? <CategoryManager categories={categories} documentCounts={documentCounts} onClose={() => setShowCategoryManager(false)} onCreate={createCategory} onRename={renameCategory} onToggleHidden={toggleCategoryHidden} onDelete={deleteCategory} onPermanentlyDelete={permanentlyDeleteCategory} onRecover={id => { const expectedVersion = sharedRef.current?.recordVersions.categories[id]; if (expectedVersion !== undefined) void commitMutation({ operation: "category.restore", categoryId: id, expectedVersion }, "Category recovered."); }} onMove={(id, direction) => { const active = categories.filter(item => !item.deletedAt); const position = active.findIndex(item => item.id === id); const target = position + direction; if (position < 0 || target < 0 || target >= active.length || !sharedRef.current) return; const ordered = [...active]; [ordered[position], ordered[target]] = [ordered[target], ordered[position]]; void commitMutation({ operation: "categories.reorder", categoryIds: ordered.map(item => item.id), expectedRevision: sharedRef.current.revision }, "Category order updated."); }} /> : null}
    {documentToDelete ? <DeleteDocumentDialog document={documentToDelete} isDeleting={isDeletingDocument} error={deleteError} onCancel={() => { if (isDeletingDocument) return; setDocumentToDelete(null); setDeleteError(""); }} onConfirm={() => void confirmDocumentDelete()} /> : null}
    {successMessage ? <div className="catalog-success-toast" role="status" aria-live="polite">{successMessage}</div> : null}
  </section>;
}
