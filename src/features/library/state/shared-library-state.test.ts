import { describe, expect, it } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createDefaultCategories } from "./category-storage";
import { createSharedLibraryState, isAuthoritativeSharedLibraryResponse, parseSharedLibraryDocumentUpdateResponse, parseSharedLibraryResponse, parseSharedLibraryState } from "./shared-library-state";

describe("shared library state", () => {
  it("rejects malformed snapshots without adding repository seeds", () => {
    expect(parseSharedLibraryState(null)).toBeNull();
    expect(parseSharedLibraryState({ version: 1, documents: "bad", categories: [] })).toBeNull();
    const seed = getPublishedDocuments();
    const parsed = parseSharedLibraryState(createSharedLibraryState([seed[0]]));
    expect(parsed?.documents.map(document => document.id)).toEqual([seed[0].id]);
  });

  it("validates revision and per-record versions", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const response = parseSharedLibraryResponse({
      initialized: true,
      state,
      revision: 7,
      recordVersions: { documents: { [state.documents[0].id]: 3 }, categories: Object.fromEntries(createDefaultCategories().map(category => [category.id, 1])) },
      updatedAt: "2026-07-22T00:00:00.000Z",
      updatedBy: "admin@example.com",
    });
    expect(response?.revision).toBe(7);
    expect(response?.recordVersions.documents[state.documents[0].id]).toBe(3);
    expect(parseSharedLibraryResponse({ initialized: true, state, revision: -1, recordVersions: { documents: {}, categories: {} } })).toBeNull();
    expect(parseSharedLibraryResponse({ state, revision: 0, recordVersions: { documents: {}, categories: {} } })).toBeNull();
  });

  it("parses optional ADMIN deletion attribution and bulk recovery results", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const documentId = state.documents[0].id;
    const response = parseSharedLibraryResponse({
      initialized: true,
      state,
      revision: 8,
      recordVersions: { documents: { [documentId]: 4 }, categories: {} },
      updatedAt: null,
      updatedBy: "admin@example.com",
      restoredCount: 3,
      deletionAudit: {
        documents: {
          [documentId]: {
            source: "user",
            deletedAt: "2026-07-24T00:00:00.000Z",
            reason: "Manual document deletion",
            actor: { name: "Admin User", email: "admin@example.com", role: "ADMIN" },
            initiatedBy: null,
          },
        },
      },
    });
    expect(response?.restoredCount).toBe(3);
    expect(response?.deletionAudit?.documents[documentId].actor?.email).toBe("admin@example.com");
  });

  it("parses an authoritative active document update result", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const document = state.documents[0];
    const response = parseSharedLibraryResponse({
      initialized: true,
      state,
      revision: 9,
      recordVersions: { documents: { [document.id]: 5 }, categories: {} },
      updatedAt: "2026-07-30T00:00:00.000Z",
      updatedBy: "admin@example.com",
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 5 },
      mutationResult: {
        operation: "document.update",
        documentId: document.id,
        document,
        recordVersion: 5,
        lifecycleState: "active",
      },
    });

    expect(response?.mutationResult).toMatchObject({
      documentId: document.id,
      recordVersion: 5,
      lifecycleState: "active",
    });
    expect(parseSharedLibraryResponse({
      initialized: true,
      state,
      revision: 9,
      recordVersions: { documents: { [document.id]: 5 }, categories: {} },
      updatedAt: null,
      updatedBy: null,
      mutationResult: { operation: "document.update", documentId: document.id, document, recordVersion: 5, lifecycleState: "missing" },
    })).toBeNull();
  });

  it("keeps a focused document update confirmation independent of malformed recovery metadata", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const document = state.documents[0];
    const value = {
      initialized: true,
      state,
      revision: 9,
      recordVersions: { documents: { [document.id]: 5 }, categories: {} },
      updatedAt: "2026-07-30T00:00:00.000Z",
      updatedBy: "admin@example.com",
      documentStatus: { status: "active", slug: document.slug, documentId: document.id, recordVersion: 5 },
      mutationResult: {
        operation: "document.update",
        documentId: document.id,
        document,
        recordVersion: 5,
        lifecycleState: "active",
      },
      recordIntegrity: { documents: "malformed optional data" },
    };

    expect(parseSharedLibraryResponse(value)).toBeNull();
    expect(parseSharedLibraryDocumentUpdateResponse(value)?.mutationResult?.documentId).toBe(document.id);
  });

  it("accepts only internally complete authoritative catalog metadata", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const document = state.documents[0];
    const categoryVersions = Object.fromEntries(state.categories.map(category => [category.id, 1]));
    const envelope = {
      initialized: true,
      state,
      revision: 10,
      recordVersions: { documents: { [document.id]: 6 }, categories: categoryVersions },
      updatedAt: null,
      updatedBy: null,
      recordManifest: {
        documents: [{
          id: document.id,
          slug: document.slug,
          recordVersion: 6,
          lifecycleState: "active",
          hidden: document.hidden,
          status: document.status,
        }],
      },
      catalogCompleteness: {
        complete: true,
        scope: "catalog",
        expectedDocumentCount: 1,
        returnedDocumentCount: 1,
        expectedCategoryCount: state.categories.length,
        returnedCategoryCount: state.categories.length,
        activeDocumentCount: 1,
        manifestDocumentCount: 1,
        checksum: "catalog-checksum",
      },
    };
    const parsed = parseSharedLibraryResponse(envelope);
    expect(parsed && isAuthoritativeSharedLibraryResponse(parsed)).toBe(true);
    expect(parseSharedLibraryResponse({
      ...envelope,
      state: { ...state, documents: [] },
    })).toBeNull();
    expect(parseSharedLibraryResponse({
      ...envelope,
      recordManifest: { documents: [{ ...envelope.recordManifest.documents[0], recordVersion: 5 }] },
    })).toBeNull();
  });

  it("accepts a clearly classified incomplete active document with a validated recovery preview", () => {
    const state = createSharedLibraryState(getPublishedDocuments().slice(0, 1));
    const document = state.documents[0];
    const categoryVersions = Object.fromEntries(state.categories.map(category => [category.id, 1]));
    const integrity = {
      status: "incomplete",
      documentId: document.id,
      slug: document.slug,
      title: document.title,
      recordVersion: 6,
      reasonCode: "DOCUMENT_SCHEMA_INVALID",
      hasRecoveryCandidate: true,
      recoveryCandidateVersionId: "version-5",
      recoveryCandidateRecordVersion: 5,
      recoveryCandidateCreatedAt: "2026-07-30T10:00:00.000Z",
    };
    const envelope = {
      initialized: true,
      state,
      revision: 10,
      recordVersions: { documents: { [document.id]: 6 }, categories: categoryVersions },
      updatedAt: null,
      updatedBy: null,
      recordManifest: {
        documents: [{
          id: document.id,
          slug: document.slug,
          recordVersion: 6,
          lifecycleState: "active",
          hidden: document.hidden,
          status: document.status,
        }],
      },
      catalogCompleteness: {
        complete: true,
        scope: "document",
        expectedDocumentCount: 1,
        returnedDocumentCount: 1,
        expectedCategoryCount: state.categories.length,
        returnedCategoryCount: state.categories.length,
        activeDocumentCount: 1,
        manifestDocumentCount: 1,
        checksum: "incomplete-document",
      },
      documentStatus: {
        status: "incomplete",
        slug: document.slug,
        documentId: document.id,
        title: document.title,
        recordVersion: 6,
        reasonCode: "DOCUMENT_SCHEMA_INVALID",
        hasRecoveryCandidate: true,
      },
      recordIntegrity: { documents: { [document.id]: integrity } },
      recoveryPreview: {
        document,
        versionId: "version-5",
        recordVersion: 5,
        createdAt: "2026-07-30T10:00:00.000Z",
        operationType: "document.update",
        actorEmail: "admin@example.com",
      },
    };
    const parsed = parseSharedLibraryResponse(envelope);
    expect(parsed && isAuthoritativeSharedLibraryResponse(parsed)).toBe(true);
    expect(parsed?.documentStatus?.status).toBe("incomplete");
    expect(parsed?.recoveryPreview?.document.id).toBe(document.id);
    expect(parseSharedLibraryResponse({
      ...envelope,
      recoveryPreview: { ...envelope.recoveryPreview, versionId: "wrong-version" },
    })).toBeNull();
  });
});
