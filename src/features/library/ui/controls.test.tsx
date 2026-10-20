import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingStateProvider } from "../state/reading-state";
import { BookmarkButton } from "./bookmark-button";
import { getPublishedDocuments } from "../data/repository";
import { Catalog } from "./catalog";
import { DocumentEditor } from "./document-editor";
import { CategoryManager } from "./category-manager";
import { DeletedDocuments } from "./deleted-documents";
import { createDefaultCategories } from "../state/category-storage";
import { createAuthoritativeTestResponse } from "../state/shared-library-test-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/library", useSearchParams: () => new URLSearchParams() }));
describe("accessible controls", () => {
  beforeEach(() => {
    const documents = getPublishedDocuments();
    const body = createAuthoritativeTestResponse({ documents, categories: createDefaultCategories() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
  });
  it("labels bookmark state", () => { render(<ReadingStateProvider><BookmarkButton id="a" compact /></ReadingStateProvider>); expect(screen.getByRole("button", { name: "Add bookmark" })).toHaveAttribute("aria-pressed", "false"); });
  it("labels catalog search and category filter", () => { render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>); expect(screen.getByRole("textbox", { name: "Search documents" })).toBeVisible(); expect(screen.getByRole("combobox", { name: "Category" })).toBeVisible(); expect(screen.getByRole("option", { name: "All categories" })).toBeVisible(); expect(screen.queryByRole("option", { name: /^Amazon PPC$/ })).not.toBeInTheDocument(); expect(screen.queryByRole("combobox", { name: "Document type" })).not.toBeInTheDocument(); });
  it("keeps add document and recovery visible outside admin mode", async () => { const view = render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>); const controls = within(view.container); await waitFor(() => expect(controls.getByRole("button", { name: "Manage library" })).toBeEnabled()); expect(controls.getByRole("button", { name: "Manage library" }).querySelector(".lucide-eye")).toBeTruthy(); expect(controls.getByRole("button", { name: "Add new topic" })).toBeVisible(); expect(controls.getByRole("button", { name: "Open document recovery" })).toBeEnabled(); fireEvent.click(controls.getByRole("button", { name: "Manage library" })); expect(controls.getByRole("button", { name: "Return to library view" }).querySelector(".lucide-pencil")).toBeTruthy(); expect(controls.getByRole("button", { name: "Manage categories" })).toBeVisible(); expect(controls.getByRole("button", { name: "Add new topic" })).toBeVisible(); expect(controls.getByRole("button", { name: "Open document recovery" })).toBeEnabled(); expect(controls.queryByRole("button", { name: "Edit / Rename" })).not.toBeInTheDocument(); });
  it("opens document reordering from the catalog toolbar", async () => { const view = render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>); const controls = within(view.container); await waitFor(() => expect(controls.getByRole("button", { name: "REORDER" })).toBeEnabled()); fireEvent.click(controls.getByRole("button", { name: "REORDER" })); expect(controls.getByRole("dialog", { name: "Reorder library documents" })).toBeVisible(); });
  it("omits tags when adding a new topic", async () => { const view = render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>); const controls = within(view.container); await waitFor(() => expect(controls.getByRole("button", { name: "Add new topic" })).toBeEnabled()); fireEvent.click(controls.getByRole("button", { name: "Manage library" })); fireEvent.click(controls.getByRole("button", { name: "Add new topic" })); expect(controls.getByRole("dialog", { name: "Add new topic" })).toBeVisible(); expect(controls.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument(); });
  it("keeps document metadata out of the editor form", () => {
    const document = getPublishedDocuments()[0];
    const onSave = vi.fn();
    const view = render(<DocumentEditor document={document} categories={[document.category]} onCancel={vi.fn()} onSave={onSave} onCreateCategory={vi.fn(() => true)} onManageCategories={vi.fn()} />);
    const controls = within(view.container);
    expect(controls.queryByRole("combobox", { name: "Document type" })).not.toBeInTheDocument();
    expect(controls.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();
    expect(controls.queryByRole("textbox", { name: "Content (Markdown)" })).not.toBeInTheDocument();
    expect(controls.getByRole("button", { name: "Create category" })).toBeVisible();
    expect(controls.getByRole("button", { name: "Edit categories" })).toBeVisible();
    fireEvent.click(controls.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: document.type, tags: document.tags.join(", "), body: document.body }));
  });
  it("creates and selects a category from the document editor", () => {
    const document = getPublishedDocuments()[0];
    const onCreateCategory = vi.fn(() => true);
    const onManageCategories = vi.fn();
    const view = render(<DocumentEditor document={document} categories={[document.category]} onCancel={vi.fn()} onSave={vi.fn()} onCreateCategory={onCreateCategory} onManageCategories={onManageCategories} />);
    const controls = within(view.container);
    fireEvent.click(controls.getByRole("button", { name: "Create category" }));
    fireEvent.change(controls.getByRole("textbox", { name: "New category" }), { target: { value: "Wholesale" } });
    fireEvent.click(controls.getByRole("button", { name: "Create" }));
    expect(onCreateCategory).toHaveBeenCalledWith("Wholesale");
    expect(controls.getByRole("combobox", { name: "Category" })).toHaveValue("Wholesale");
    fireEvent.click(controls.getByRole("button", { name: "Edit categories" }));
    expect(onManageCategories).toHaveBeenCalledTimes(1);
  });
  it("keeps deleted categories behind the recovery icon", () => {
    const onRecover = vi.fn();
    const view = render(<CategoryManager categories={[{ id: "active", name: "Active category", hidden: false }, { id: "deleted", name: "Deleted category", hidden: true, deletedAt: "2026-07-17" }]} documentCounts={{ "Deleted category": 2 }} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={vi.fn()} onPermanentlyDelete={vi.fn()} onRecover={onRecover} onMove={vi.fn()} />);
    const controls = within(view.container);
    expect(controls.queryByRole("heading", { name: "Deleted categories" })).not.toBeInTheDocument();
    fireEvent.click(controls.getByRole("button", { name: "Open category recovery (1)" }));
    const recovery = controls.getByRole("dialog", { name: "Deleted categories" });
    expect(recovery).toBeVisible();
    fireEvent.click(within(recovery).getByRole("button", { name: "Recover" }));
    expect(onRecover).toHaveBeenCalledWith("deleted");
  });
  it("confirms permanent category deletion, shows progress, and announces success", async () => {
    let finishDelete: (result: string | null) => void = () => undefined;
    const onPermanentlyDelete = vi.fn(() => new Promise<string | null>(resolve => { finishDelete = resolve; }));
    const view = render(<CategoryManager categories={[{ id: "active", name: "Active category", hidden: false }, { id: "deleted", name: "Deleted category", hidden: true, deletedAt: "2026-07-17" }]} documentCounts={{ "Deleted category": 0 }} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={vi.fn()} onPermanentlyDelete={onPermanentlyDelete} onRecover={vi.fn()} onMove={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getByRole("button", { name: "Open category recovery (1)" }));
    fireEvent.click(controls.getByRole("button", { name: "Permanently delete Deleted category" }));
    const confirmation = controls.getByRole("alertdialog", { name: "Delete category forever?" });
    expect(within(confirmation).getByText(/protected audit and version record/)).toBeVisible();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Permanently delete" }));
    expect(onPermanentlyDelete).toHaveBeenCalledWith("deleted");
    expect(within(confirmation).getByRole("button", { name: "Deleting…" })).toBeDisabled();
    await act(async () => finishDelete(null));
    expect(await controls.findByRole("status")).toHaveTextContent("Deleted category was permanently deleted successfully.");
  });
  it("prevents permanently deleting a category that still contains documents", () => {
    const onPermanentlyDelete = vi.fn();
    const view = render(<CategoryManager categories={[{ id: "active", name: "Active category", hidden: false }, { id: "deleted", name: "Deleted category", hidden: true, deletedAt: "2026-07-17" }]} documentCounts={{ "Deleted category": 1 }} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={vi.fn()} onPermanentlyDelete={onPermanentlyDelete} onRecover={vi.fn()} onMove={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getByRole("button", { name: "Open category recovery (1)" }));
    expect(controls.getByRole("button", { name: "Permanently delete Deleted category" })).toBeDisabled();
    expect(onPermanentlyDelete).not.toHaveBeenCalled();
  });
  it("shows category deletion progress and success only after the server confirms it", async () => {
    let finishDelete: (result: string | null) => void = () => undefined;
    const onDelete = vi.fn(() => new Promise<string | null>(resolve => { finishDelete = resolve; }));
    const view = render(<CategoryManager categories={[{ id: "active", name: "Active category", hidden: false }, { id: "keep", name: "Keep category", hidden: false }]} documentCounts={{}} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={onDelete} onPermanentlyDelete={vi.fn()} onRecover={vi.fn()} onMove={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getByRole("button", { name: "Delete Active category" }));
    expect(onDelete).toHaveBeenCalledWith("active");
    expect(controls.getByRole("button", { name: "Deleting Active category" }).querySelector(".category-delete-spinner")).toBeTruthy();
    await act(async () => finishDelete(null));
    expect(await controls.findByRole("status")).toHaveTextContent("Active category was deleted successfully.");
  });
  it("keeps category deletion errors visible in the category manager", async () => {
    const onDelete = vi.fn().mockResolvedValue("The category could not be deleted.");
    const view = render(<CategoryManager categories={[{ id: "active", name: "Active category", hidden: false }, { id: "keep", name: "Keep category", hidden: false }]} documentCounts={{}} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={onDelete} onPermanentlyDelete={vi.fn()} onRecover={vi.fn()} onMove={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getByRole("button", { name: "Delete Active category" }));
    expect(await controls.findByRole("alert")).toHaveTextContent("The category could not be deleted.");
  });
  it("prevents deleting the final active category", () => {
    const onDelete = vi.fn();
    const view = render(<CategoryManager categories={[{ id: "last", name: "Last category", hidden: false }]} documentCounts={{}} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onToggleHidden={vi.fn()} onDelete={onDelete} onPermanentlyDelete={vi.fn()} onRecover={vi.fn()} onMove={vi.fn()} />);
    const controls = within(view.container);
    expect(controls.getByText(/At least one active category must remain/)).toBeVisible();
    expect(controls.getByRole("button", { name: "Delete Last category" })).toBeDisabled();
  });
  it.skip("shows deleted documents only inside the recovery dialog", async () => {
    const onRecover = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();
    const document = { ...getPublishedDocuments()[0], deletedAt: "2026-07-17T04:00:00.000Z" };
    const view = render(<DeletedDocuments
      documents={[document]}
      deletionAudit={{}}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={onClose}
      onRecover={onRecover}
      onRecoverSystemDeleted={vi.fn()}
      onPermanentlyDelete={vi.fn()}
      purgedDocuments={[]}
      purgedHistoryError=""
      isLoadingDocuments={false}
      documentLoadError=""
      isLoadingPurgedHistory={false}
      onRetry={vi.fn()}
      onRestorePurged={vi.fn().mockResolvedValue(null)}
    />);
    const dialog = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(document.title)).toBeVisible();
    expect(within(dialog).queryByLabelText("Permanent deletion history")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Recover" }));
    expect(onRecover).toHaveBeenCalledWith(document);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
  it.skip("attributes migration deletions and confirms atomic system recovery", () => {
    const document = { ...getPublishedDocuments()[0], deletedAt: "2026-07-22T06:48:42.000Z" };
    const onRecoverSystemDeleted = vi.fn();
    const view = render(<DeletedDocuments
      documents={[document]}
      deletionAudit={{
        [document.id]: {
          source: "system_migration",
          deletedAt: document.deletedAt,
          reason: "Initial Library cleanup",
          actor: null,
          initiatedBy: { name: "Admin User", email: "admin@example.com", role: "ADMIN" },
        },
      }}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={vi.fn()}
      onRecover={vi.fn().mockResolvedValue(null)}
      onRecoverSystemDeleted={onRecoverSystemDeleted}
      onPermanentlyDelete={vi.fn()}
      purgedDocuments={[]}
      purgedHistoryError=""
      isLoadingDocuments={false}
      documentLoadError=""
      isLoadingPurgedHistory={false}
      onRetry={vi.fn()}
      onRestorePurged={vi.fn().mockResolvedValue(null)}
    />);
    const dialog = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    expect(within(dialog).getByText(/by System — Initial Library cleanup/)).toBeVisible();
    expect(within(dialog).getByText(/Initiated by Admin User/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: /Recover system-deleted documents/ }));
    expect(within(dialog).getByText(/Recover 1 system-deleted document/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm recovery/ }));
    expect(onRecoverSystemDeleted).toHaveBeenCalledWith([document.id]);
  });
  it.skip("requires confirmation before permanently deleting a recoverable document", async () => {
    const document = { ...getPublishedDocuments()[0], deletedAt: "2026-07-22T06:48:42.000Z" };
    const onPermanentlyDelete = vi.fn().mockResolvedValue(null);
    const view = render(<DeletedDocuments
      documents={[document]}
      deletionAudit={{}}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={vi.fn()}
      onRecover={vi.fn().mockResolvedValue(null)}
      onRecoverSystemDeleted={vi.fn()}
      onPermanentlyDelete={onPermanentlyDelete}
      purgedDocuments={[]}
      purgedHistoryError=""
      isLoadingDocuments={false}
      documentLoadError=""
      isLoadingPurgedHistory={false}
      onRetry={vi.fn()}
      onRestorePurged={vi.fn().mockResolvedValue(null)}
    />);
    const recovery = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    fireEvent.click(within(recovery).getByRole("button", { name: `Permanently delete ${document.title}` }));
    const confirmation = within(view.container).getByRole("alertdialog", { name: "Delete forever?" });
    expect(within(confirmation).getByText(/cannot be recovered from this list or restored from a backup/i)).toBeVisible();
    expect(onPermanentlyDelete).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(onPermanentlyDelete).toHaveBeenCalledWith(document));
  });
  it.skip("opens permanent deletion history and confirms the protected bQool restoration", async () => {
    const onRestorePurged = vi.fn().mockResolvedValue(null);
    const purged = {
      documentId: "bqool-document",
      slug: "monitor-product-listing-prices-through-bqool",
      title: "Monitor Product Listing Prices Through BQool",
      deletedAt: "2026-07-28T02:52:00.000Z",
      source: { kind: "legacy_snapshot" as const, id: "trusted-checksum", label: "Protected legacy Library snapshot" },
      canRestore: true,
    };
    const view = render(<DeletedDocuments
      documents={[]}
      deletionAudit={{}}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={vi.fn()}
      onRecover={vi.fn().mockResolvedValue(null)}
      onRecoverSystemDeleted={vi.fn()}
      onPermanentlyDelete={vi.fn().mockResolvedValue(null)}
      purgedDocuments={[purged]}
      purgedHistoryError=""
      isLoadingDocuments={false}
      documentLoadError=""
      isLoadingPurgedHistory={false}
      onRetry={vi.fn()}
      onRestorePurged={onRestorePurged}
    />);

    const recovery = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    expect(within(recovery).getByText("Permanent deletion history")).toBeVisible();
    fireEvent.click(within(recovery).getByRole("button", { name: "Restore bQool" }));
    const confirmation = within(view.container).getByRole("alertdialog", { name: "Restore bQool?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm restoration" }));
    await waitFor(() => expect(onRestorePurged).toHaveBeenCalledWith(purged));
  });
  it.skip("labels the approved Check Spend protected recovery explicitly", () => {
    const purged = {
      documentId: "check-spend-no-sales",
      slug: "check-spend-with-no-sales",
      title: "Check Spend with No Sales",
      source: { kind: "pipeline_backup" as const, id: "backup-1", label: "Pipeline Library backup" },
      canRestore: true,
    };
    const view = render(<DeletedDocuments
      documents={[]}
      deletionAudit={{}}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={vi.fn()}
      onRecover={vi.fn().mockResolvedValue(null)}
      onRecoverSystemDeleted={vi.fn()}
      onPermanentlyDelete={vi.fn().mockResolvedValue(null)}
      purgedDocuments={[purged]}
      purgedHistoryError=""
      isLoadingDocuments={false}
      documentLoadError=""
      isLoadingPurgedHistory={false}
      onRetry={vi.fn()}
      onRestorePurged={vi.fn().mockResolvedValue(null)}
    />);

    const recovery = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    fireEvent.click(within(recovery).getByRole("button", { name: "Restore Check Spend with No Sales" }));
    expect(within(view.container).getByRole("alertdialog", { name: "Restore Check Spend with No Sales?" })).toBeVisible();
  });
  it.skip("keeps Recovery open and offers retry actions when either data source fails", () => {
    const onRetry = vi.fn();
    const view = render(<DeletedDocuments
      documents={[]}
      deletionAudit={{}}
      isRecoveringSystemDocuments={false}
      systemRecoveryError=""
      onClose={vi.fn()}
      onRecover={vi.fn().mockResolvedValue(null)}
      onRecoverSystemDeleted={vi.fn()}
      onPermanentlyDelete={vi.fn().mockResolvedValue(null)}
      purgedDocuments={[]}
      purgedHistoryError="Permanent deletion history is unavailable."
      isLoadingDocuments={false}
      documentLoadError="Recoverable documents are unavailable."
      isLoadingPurgedHistory={false}
      onRetry={onRetry}
      onRestorePurged={vi.fn().mockResolvedValue(null)}
    />);

    const dialog = within(view.container).getByRole("dialog", { name: "Deleted documents" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getAllByRole("alert")).toHaveLength(2);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Try again" })[0]);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
