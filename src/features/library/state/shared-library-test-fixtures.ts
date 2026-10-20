import type { ManagedLibraryDocument } from "./admin-storage";
import type { ManagedCategory } from "./category-storage";
import type {
  SharedLibraryCatalogCompleteness,
  SharedLibraryDocumentManifestEntry,
  SharedLibraryResponse,
} from "./shared-library-state";

export function createAuthoritativeTestResponse({
  documents,
  categories,
  initialized = true,
  revision = initialized ? 1 : 0,
  scope = "catalog",
  documentVersions = {},
  categoryVersions = {},
}: {
  documents: ManagedLibraryDocument[];
  categories: ManagedCategory[];
  initialized?: boolean;
  revision?: number;
  scope?: SharedLibraryCatalogCompleteness["scope"];
  documentVersions?: Record<string, number>;
  categoryVersions?: Record<string, number>;
}): SharedLibraryResponse {
  const versions = {
    documents: Object.fromEntries(documents.map(document => [
      document.id,
      documentVersions[document.id] ?? 1,
    ])),
    categories: Object.fromEntries(categories.map(category => [
      category.id,
      categoryVersions[category.id] ?? 1,
    ])),
  };
  const manifest: SharedLibraryDocumentManifestEntry[] = documents.map(document => ({
    id: document.id,
    slug: document.slug,
    recordVersion: versions.documents[document.id],
    lifecycleState: document.archivedAt ? "archived" : document.deletedAt ? "deleted" : "active",
    hidden: document.hidden,
    status: document.status,
  }));
  const activeDocumentCount = manifest.filter(entry => entry.lifecycleState === "active").length;
  return {
    initialized,
    state: { version: 1, documents, categories },
    revision,
    recordVersions: versions,
    updatedAt: null,
    updatedBy: null,
    recordManifest: { documents: manifest },
    catalogCompleteness: {
      complete: true,
      scope,
      expectedDocumentCount: documents.length,
      returnedDocumentCount: documents.length,
      expectedCategoryCount: categories.length,
      returnedCategoryCount: categories.length,
      activeDocumentCount,
      manifestDocumentCount: manifest.length,
      checksum: "test-catalog-checksum",
    },
  };
}
