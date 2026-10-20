import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { DeletedDocuments } from "./deleted-documents";

function props() {
  return {
    documents: [],
    archivedDocuments: [],
    activeDocuments: getPublishedDocuments(),
    backups: [],
    incidents: [],
    deletionAudit: {},
    isRecoveringSystemDocuments: false,
    systemRecoveryError: "",
    onClose: vi.fn(),
    onRecover: vi.fn().mockResolvedValue(null),
    onRecoverSystemDeleted: vi.fn(),
    onPermanentlyDelete: vi.fn().mockResolvedValue(null),
    onRestoreArchived: vi.fn().mockResolvedValue(null),
    onRestoreVersion: vi.fn().mockResolvedValue(null),
    onCreateSnapshot: vi.fn().mockResolvedValue(null),
    onRestoreSnapshotRecords: vi.fn().mockResolvedValue(null),
    onAcknowledgeIncident: vi.fn().mockResolvedValue(null),
    purgedHistoryError: "",
    isLoadingDocuments: false,
    documentLoadError: "",
    isLoadingPurgedHistory: false,
    onRetry: vi.fn(),
  };
}

describe("Library Recovery Center", () => {
  it("shows all five recovery sections", () => {
    const view = render(<DeletedDocuments {...props()} />);
    const dialog = within(view.container).getByRole("dialog", { name: "Recovery Center" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Deleted" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Protected archive" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Version history" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Snapshots" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Incidents" })).toBeVisible();
  });

  it("requires confirmation and explains indefinite protection before archiving", async () => {
    const document = { ...getPublishedDocuments()[0], deletedAt: "2026-07-22T06:48:42.000Z" };
    const callbacks = props();
    const view = render(<DeletedDocuments {...callbacks} documents={[document]} />);
    const dialog = within(view.container).getByRole("dialog", { name: "Recovery Center" });
    fireEvent.click(within(dialog).getByRole("button", { name: `Move ${document.title} to protected archive` }));
    const confirmation = within(view.container).getByRole("alertdialog", { name: "Move out of normal Recovery?" });
    expect(within(confirmation).getByText(/full content and history will remain protected indefinitely/i)).toBeVisible();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Move to protected archive" }));
    await waitFor(() => expect(callbacks.onPermanentlyDelete).toHaveBeenCalledWith(document));
  });

  it("keeps incomplete active documents available in version history", () => {
    const document = getPublishedDocuments()[0];
    const view = render(<DeletedDocuments
      {...props()}
      activeDocuments={[]}
      incompleteDocuments={[{
        status: "incomplete",
        documentId: document.id,
        slug: document.slug,
        title: "TEST 1",
        recordVersion: 2,
        reasonCode: "DOCUMENT_SCHEMA_INVALID",
        hasRecoveryCandidate: true,
        recoveryCandidateVersionId: "version-1",
        recoveryCandidateRecordVersion: 1,
        recoveryCandidateCreatedAt: "2026-07-31T03:24:00.947Z",
      }]}
    />);
    const dialog = within(view.container).getByRole("dialog", { name: "Recovery Center" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Version history" }));

    expect(within(dialog).getByRole("option", { name: "TEST 1" })).toHaveValue(document.id);
  });
});
