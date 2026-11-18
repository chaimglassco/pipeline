import { parseSavedAudit, validateSavedAudit, type AuditData } from "../domain/ppc-audit";

// A 30-day bulk file is ~24 MB as JSON, past localStorage's ~5 MB quota, so audits live in IndexedDB.
// localStorage is only the fallback where IndexedDB is missing (old browsers, tests) and the
// place older audits were saved, which load once and then move over.
export const LEGACY_AUDIT_KEY = "glassco.ppcUploadedAudit.v1";
const DB = "glassco-ppc-audit", STORE = "audits", RECORD = "current";

function openDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()!;
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error);
    });
  } finally { db.close(); }
}

/** Saves the audit; resolves false when no browser storage could hold it. */
export async function saveAudit(data: AuditData): Promise<boolean> {
  if (typeof indexedDB !== "undefined") {
    try {
      await run("readwrite", store => store.put(data, RECORD));
      try { localStorage.removeItem(LEGACY_AUDIT_KEY); } catch { /* Storage may be disabled. */ }
      return true;
    } catch { return false; }
  }
  try { localStorage.setItem(LEGACY_AUDIT_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export async function loadAudit(): Promise<AuditData | null> {
  if (typeof indexedDB !== "undefined") {
    try {
      const stored = validateSavedAudit(await run("readonly", store => store.get(RECORD)));
      if (stored) return stored;
    } catch { /* Fall through to an audit saved by an older version. */ }
  }
  let legacy: AuditData | null = null;
  try { legacy = parseSavedAudit(localStorage.getItem(LEGACY_AUDIT_KEY)); } catch { return null; }
  if (legacy && typeof indexedDB !== "undefined") await saveAudit(legacy);
  return legacy;
}

/** Removes the saved audit from every place it may be stored. */
export async function clearAudit(): Promise<void> {
  try { localStorage.removeItem(LEGACY_AUDIT_KEY); } catch { /* Storage may be disabled. */ }
  if (typeof indexedDB !== "undefined") { try { await run("readwrite", store => store.delete(RECORD)); } catch { /* Nothing saved. */ } }
}
