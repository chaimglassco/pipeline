import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { DocumentReorderDialog } from "./document-reorder-dialog";

describe("DocumentReorderDialog", () => {
  afterEach(cleanup);
  it("supports dragging documents into a new saved order", async () => {
    const documents = getPublishedDocuments().slice(0, 3);
    const onSave = vi.fn().mockResolvedValue(null);
    render(<DocumentReorderDialog documents={documents} onCancel={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole("dialog", { name: "Reorder library documents" });
    const rows = within(dialog).getAllByRole("listitem");
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: () => documents[0].id };

    fireEvent.dragStart(rows[0], { dataTransfer });
    fireEvent.dragEnter(rows[1], { dataTransfer });
    fireEvent.dragOver(rows[1], { dataTransfer });
    fireEvent.drop(rows[1], { dataTransfer });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith([documents[1].id, documents[0].id, documents[2].id]));
  });

  it("shows immediate progress, blocks duplicates, and preserves the selected order for retry after failure", async () => {
    const documents = getPublishedDocuments().slice(0, 3);
    let finishSave!: (value: string | null) => void;
    const onSave = vi.fn(() => new Promise<string | null>(resolve => { finishSave = resolve; }));
    render(<DocumentReorderDialog documents={documents} onCancel={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole("dialog", { name: "Reorder library documents" });

    fireEvent.click(within(dialog).getByRole("button", { name: `Move ${documents[1].title} up` }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    const savingButton = within(dialog).getByRole("button", { name: "Saving order..." });
    expect(savingButton).toBeDisabled();
    expect(savingButton.querySelector(".spinning-icon")).toBeTruthy();
    fireEvent.click(savingButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => finishSave("The database rejected this order."));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The database rejected this order.");
    expect(within(dialog).getAllByRole("listitem")[0]).toHaveTextContent(documents[1].title);

    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith([documents[1].id, documents[0].id, documents[2].id]);
  });
});
