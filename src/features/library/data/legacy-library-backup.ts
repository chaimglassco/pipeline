import { get, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { parseSharedLibraryState, type SharedLibraryState } from "../state/shared-library-state";

const LEGACY_STATE_PATH = "glassco/library-state-v1.json";
const LEGACY_BACKUP_DIRECTORY = "glassco/library-backups";

export class LegacyLibraryBackupError extends Error {
  constructor(public readonly code: "BLOB_NOT_CONFIGURED" | "LEGACY_SNAPSHOT_MISSING" | "LEGACY_SNAPSHOT_INVALID", message: string) {
    super(message);
    this.name = "LegacyLibraryBackupError";
  }
}

export type LegacyLibrarySnapshot = {
  body: string;
  checksum: string;
  state: SharedLibraryState;
};

export type LegacyLibraryBackup = {
  pathname: string;
  checksum: string;
  size: number;
  documentCount: number;
  created: boolean;
};

export type LegacyCatalogImportReport = {
  documentCount: number;
  categoryCount: number;
  activeDocumentCount: number;
  deletedDocumentCount: number;
};

function assertBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new LegacyLibraryBackupError("BLOB_NOT_CONFIGURED", "The legacy Library Blob store is not configured.");
  }
}

function checksum(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export async function readLegacyLibrarySnapshot(): Promise<LegacyLibrarySnapshot> {
  assertBlobConfigured();
  const result = await get(LEGACY_STATE_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) {
    throw new LegacyLibraryBackupError("LEGACY_SNAPSHOT_MISSING", "The legacy Library snapshot does not exist.");
  }
  const body = await new Response(result.stream).text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new LegacyLibraryBackupError("LEGACY_SNAPSHOT_INVALID", "The legacy Library snapshot is not valid JSON.");
  }
  const state = parseSharedLibraryState(parsed);
  if (!state) {
    throw new LegacyLibraryBackupError("LEGACY_SNAPSHOT_INVALID", "The legacy Library snapshot failed schema validation.");
  }
  return { body, checksum: checksum(body), state };
}

export async function ensureLegacyLibraryBackup(snapshot?: LegacyLibrarySnapshot): Promise<LegacyLibraryBackup> {
  const source = snapshot ?? await readLegacyLibrarySnapshot();
  const pathname = `${LEGACY_BACKUP_DIRECTORY}/library-state-v1-${source.checksum}.json`;
  const existing = await get(pathname, { access: "private", useCache: false });
  if (existing?.statusCode === 200) {
    return {
      pathname,
      checksum: source.checksum,
      size: Buffer.byteLength(source.body),
      documentCount: source.state.documents.length,
      created: false,
    };
  }
  let created = true;
  try {
    await put(pathname, source.body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    const concurrent = await get(pathname, { access: "private", useCache: false });
    if (concurrent?.statusCode !== 200) throw error;
    created = false;
  }
  return {
    pathname,
    checksum: source.checksum,
    size: Buffer.byteLength(source.body),
    documentCount: source.state.documents.length,
    created,
  };
}

export function prepareLegacyCatalogImport(state: SharedLibraryState): { state: SharedLibraryState; report: LegacyCatalogImportReport } {
  const documents = state.documents.map(document => ({ ...document }));
  const categories = state.categories.map(category => ({ ...category }));
  return {
    state: { version: 1, documents, categories },
    report: {
      documentCount: documents.length,
      categoryCount: categories.length,
      activeDocumentCount: documents.filter(document => !document.deletedAt).length,
      deletedDocumentCount: documents.filter(document => Boolean(document.deletedAt)).length,
    },
  };
}
