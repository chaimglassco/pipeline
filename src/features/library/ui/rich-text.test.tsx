import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { richTextFromMarkdown } from "../domain/rich-text";
import type { RichTextDocument } from "../domain/types";
import { DocumentLinkCatalogProvider, getLibraryDocumentHref, RichTextEditor, RichTextRenderer, shouldShowSelectionToolbar } from "./rich-text";

function selectText(element: HTMLElement, start: number, end: number) {
  const paragraph = element.querySelector("p");
  const text = paragraph ? document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode() : null;
  if (!text) throw new Error("Editable text was not rendered.");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  element.focus();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  fireEvent.mouseUp(element);
}

afterEach(cleanup);

describe("RichTextEditor", () => {
  it("shows the full accessible toolbar and toggles list formatting visually", () => {
    const onChange = vi.fn();
    const view = render(<RichTextEditor ariaLabel="Body" value={richTextFromMarkdown("First item")} onChange={onChange} />);
    const toolbar = view.getByRole("toolbar", { name: "Body formatting" });
    expect(within(toolbar).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Normal", "Bold", "Italic", "Underlined", "Align left", "Align center", "Align right", "Bullets", "Checklist", "Numbers", "Link", "Link document"]);
    expect(within(toolbar).getAllByRole("button").every(button => button.textContent === "")).toBe(true);
    expect(within(toolbar).getAllByRole("group").map(group => group.getAttribute("aria-label"))).toEqual(["Text styles", "Text alignment", "Lists", "Links"]);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Bold" }));
    expect(within(toolbar).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(toolbar).getByRole("button", { name: "Normal" }));
    expect(within(toolbar).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(toolbar).getByRole("button", { name: "Checklist" }));
    expect(view.getByRole("textbox", { name: "Body" }).querySelector('ul[data-type="taskList"]')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "doc" }), "First item");
    const checkbox = view.getByRole("textbox", { name: "Body" }).querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox as HTMLInputElement);
    const savedDocument = onChange.mock.calls.at(-1)?.[0];
    expect(savedDocument.content[0].content[0].attrs.checked).toBe(true);
  });

  it("limits standalone row composers to inline styles", () => {
    const view = render(<RichTextEditor ariaLabel="Bullet row" allowLists={false} value={richTextFromMarkdown("Text")} onChange={vi.fn()} />);
    const toolbar = view.getByRole("toolbar", { name: "Bullet row formatting" });
    expect(within(toolbar).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Normal", "Bold", "Italic", "Underlined", "Align left", "Align center", "Align right", "Link", "Link document"]);
    expect(within(toolbar).queryByRole("group", { name: "Lists" })).not.toBeInTheDocument();
  });

  it("preserves the active editor selection when formatting controls receive mouse down", () => {
    const view = render(<RichTextEditor ariaLabel="Selection body" value={richTextFromMarkdown("Selected text")} onChange={vi.fn()} />);
    const bold = within(view.getByRole("toolbar", { name: "Selection body formatting" })).getByRole("button", { name: "Bold" });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    bold.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("shows the selection toolbar only for a non-empty selection in an editable composer", () => {
    expect(shouldShowSelectionToolbar({ isEditable: true, from: 2, to: 8 })).toBe(true);
    expect(shouldShowSelectionToolbar({ isEditable: true, from: 4, to: 4 })).toBe(false);
    expect(shouldShowSelectionToolbar({ isEditable: false, from: 2, to: 8 })).toBe(false);
  });

  it("emits validated ordered-list JSON when Numbers is selected", () => {
    const onChange = vi.fn();
    const view = render(<RichTextEditor ariaLabel="Numbered body" value={richTextFromMarkdown("First item")} onChange={onChange} />);
    fireEvent.click(within(view.getByRole("toolbar", { name: "Numbered body formatting" })).getByRole("button", { name: "Numbers" }));
    expect(view.getByRole("textbox", { name: "Numbered body" }).querySelector("ol")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      content: [expect.objectContaining({ type: "orderedList", attrs: { start: 1 } })],
    }), "First item");
  });

  it("stores paragraph alignment and reports the legacy-compatible alignment value", () => {
    const onChange = vi.fn();
    const onTextAlignmentChange = vi.fn();
    const view = render(<RichTextEditor ariaLabel="Aligned body" value={richTextFromMarkdown("Text")} onChange={onChange} onTextAlignmentChange={onTextAlignmentChange} />);
    fireEvent.click(within(view.getByRole("toolbar", { name: "Aligned body formatting" })).getByRole("button", { name: "Align center" }));
    expect(onTextAlignmentChange).toHaveBeenCalledWith("center");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ content: [expect.objectContaining({ attrs: { textAlign: "center" } })] });
  });

  it("adds a safe link to the selected text through the compact URL popup", async () => {
    const onChange = vi.fn();
    const view = render(<RichTextEditor ariaLabel="Linked body" value={richTextFromMarkdown("Selected text")} onChange={onChange} />);
    const editor = view.getByRole("textbox", { name: "Linked body" });
    selectText(editor, 0, 8);
    const linkButton = within(view.getByRole("toolbar", { name: "Linked body formatting" })).getByRole("button", { name: "Link" });
    await waitFor(() => expect(linkButton).toBeEnabled());
    fireEvent.click(linkButton);
    fireEvent.change(view.getByRole("textbox", { name: "Link URL" }), { target: { value: "example.com/help" } });
    fireEvent.click(view.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      content: [expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ marks: [{ type: "link", attrs: { href: "https://example.com/help" } }] })]) })],
    }));
  });

  it("searches Library documents and applies the selected internal link to the preserved selection", async () => {
    const onChange = vi.fn();
    const options = [
      { id: "library-a", slug: "campaign-structure", title: "Campaign Structure", category: "Campaigns", description: "Naming rules" },
      { id: "library-b", slug: "budget-control", title: "Budget Control", category: "Budgets", description: "Daily spend limits" },
    ];
    const view = render(<DocumentLinkCatalogProvider value={{ options, status: "ready", error: "", onRequest: vi.fn() }}>
      <RichTextEditor ariaLabel="Document linked body" value={richTextFromMarkdown("Selected text")} onChange={onChange} />
    </DocumentLinkCatalogProvider>);
    const editor = view.getByRole("textbox", { name: "Document linked body" });
    selectText(editor, 0, 8);
    const documentLinkButton = within(view.getByRole("toolbar", { name: "Document linked body formatting" })).getByRole("button", { name: "Link document" });
    await waitFor(() => expect(documentLinkButton).toBeEnabled());
    fireEvent.click(documentLinkButton);
    const dialog = view.getByRole("dialog", { name: "Link Library document" });
    const search = within(dialog).getByRole("searchbox", { name: "Search documents" });
    fireEvent.change(search, { target: { value: "missing document" } });
    expect(within(dialog).getByText("No documents match your search.")).toBeVisible();
    fireEvent.change(search, { target: { value: "spend limits" } });
    expect(within(dialog).getByRole("button", { name: /Budget Control/ })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Campaign Structure/ })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      content: [expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({
        marks: [{ type: "link", attrs: { href: "/ppc/library/budget-control" } }],
      })]) })],
    }));
  });

  it("loads document choices on demand, supports retry, and removes an existing document link", async () => {
    const onRequest = vi.fn();
    const linkedValue: RichTextDocument = { type: "doc", content: [{
      type: "paragraph",
      content: [{ type: "text", text: "Selected text", marks: [{ type: "link", attrs: { href: "/ppc/library/budget-control" } }] }],
    }] };
    const onChange = vi.fn();
    const view = render(<DocumentLinkCatalogProvider value={{ options: [], status: "idle", error: "", onRequest }}>
      <RichTextEditor ariaLabel="Existing document link" value={linkedValue} onChange={onChange} />
    </DocumentLinkCatalogProvider>);
    const editor = view.getByRole("textbox", { name: "Existing document link" });
    selectText(editor, 0, 8);
    const documentLinkButton = within(view.getByRole("toolbar", { name: "Existing document link formatting" })).getByRole("button", { name: "Link document" });
    await waitFor(() => expect(documentLinkButton).toBeEnabled());
    fireEvent.click(documentLinkButton);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(view.getByRole("status")).toHaveTextContent("Loading Library documents");
    fireEvent.click(view.getByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(onChange.mock.calls.at(-1)?.[0].content[0].content[0].marks).toBeUndefined());

    const retry = vi.fn();
    view.rerender(<DocumentLinkCatalogProvider value={{ options: [], status: "error", error: "Catalog unavailable.", onRequest: retry }}>
      <RichTextEditor ariaLabel="Existing document link" value={richTextFromMarkdown("Selected text")} onChange={onChange} />
    </DocumentLinkCatalogProvider>);
    selectText(view.getByRole("textbox", { name: "Existing document link" }), 0, 8);
    const retryDocumentLinkButton = within(view.getByRole("toolbar", { name: "Existing document link formatting" })).getByRole("button", { name: "Link document" });
    await waitFor(() => expect(retryDocumentLinkButton).toBeEnabled());
    fireEvent.click(retryDocumentLinkButton);
    expect(view.getByRole("alert")).toHaveTextContent("Catalog unavailable.");
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("reports an empty document catalog and restores the selection when Escape cancels", async () => {
    const view = render(<DocumentLinkCatalogProvider value={{ options: [], status: "ready", error: "", onRequest: vi.fn() }}>
      <RichTextEditor ariaLabel="Empty document catalog" value={richTextFromMarkdown("Selected text")} onChange={vi.fn()} />
    </DocumentLinkCatalogProvider>);
    const editor = view.getByRole("textbox", { name: "Empty document catalog" });
    selectText(editor, 0, 8);
    const documentLinkButton = within(view.getByRole("toolbar", { name: "Empty document catalog formatting" })).getByRole("button", { name: "Link document" });
    await waitFor(() => expect(documentLinkButton).toBeEnabled());
    fireEvent.click(documentLinkButton);
    expect(view.getByText("No other published documents are available.")).toBeVisible();
    fireEvent.keyDown(view.getByRole("searchbox", { name: "Search documents" }), { key: "Escape" });
    expect(view.queryByRole("dialog", { name: "Link Library document" })).not.toBeInTheDocument();
    expect(documentLinkButton).toBeEnabled();
  });

  it("sanitizes pasted HTML through the allowlisted editor schema", async () => {
    const view = render(<RichTextEditor ariaLabel="Paste body" value={richTextFromMarkdown("")} onChange={vi.fn()} />);
    const editor = view.getByRole("textbox", { name: "Paste body" });
    fireEvent.paste(editor, { clipboardData: {
      types: ["text/html", "text/plain"],
      getData: (type: string) => type === "text/html" ? '<h1 style="color:red"><a href="https://example.com"><strong>Allowed text</strong></a><img src="bad.png"></h1>' : "Allowed text",
    } });
    await waitFor(() => expect(editor).toHaveTextContent("Allowed text"));
    expect(editor.querySelector("strong")).toBeInTheDocument();
    expect(editor.querySelector("a")).toHaveAttribute("href", "https://example.com");
    expect(editor.querySelector("a")).toHaveAttribute("target", "_blank");
    expect(editor.querySelector("h1, img")).not.toBeInTheDocument();
  });
});

describe("RichTextRenderer", () => {
  it("renders formatting and disabled reader checkboxes through the static renderer", () => {
    const view = render(<RichTextRenderer value={richTextFromMarkdown("**Important**\n\n- [x] Done")} />);
    expect(view.getByText("Important").tagName).toBe("STRONG");
    expect(view.getByRole("checkbox", { name: "Checklist item" })).toBeChecked();
    expect(view.getByRole("checkbox", { name: "Checklist item" })).toBeDisabled();
  });

  it("keeps semantic unordered and ordered lists in reader output", () => {
    const view = render(<RichTextRenderer value={richTextFromMarkdown("- Bullet item\n\n1. Numbered item")} />);
    expect(view.getByText("Bullet item").closest("ul")).toBeInTheDocument();
    expect(view.getByText("Numbered item").closest("ol")).toBeInTheDocument();
  });

  it("renders safe links in a new tab and keeps paragraph alignment", () => {
    const value: RichTextDocument = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Glassco", marks: [{ type: "link", attrs: { href: "glassco.com" } }] }] }] };
    const view = render(<RichTextRenderer value={value} />);
    expect(view.getByText("Glassco").closest("p")).toHaveStyle({ textAlign: "right" });
    expect(view.getByRole("link", { name: "Glassco" })).toHaveAttribute("href", "https://glassco.com");
    expect(view.getByRole("link", { name: "Glassco" })).toHaveAttribute("target", "_blank");
  });

  it("builds and renders Library document links in a protected new tab", () => {
    expect(getLibraryDocumentHref("budget-control")).toBe("/ppc/library/budget-control");
    const value: RichTextDocument = { type: "doc", content: [{ type: "paragraph", content: [{
      type: "text",
      text: "Budget guide",
      marks: [{ type: "link", attrs: { href: "/ppc/library/budget-control" } }],
    }] }] };
    const view = render(<RichTextRenderer value={value} />);
    expect(view.getByRole("link", { name: "Budget guide" })).toHaveAttribute("href", "/ppc/library/budget-control");
    expect(view.getByRole("link", { name: "Budget guide" })).toHaveAttribute("target", "_blank");
    expect(view.getByRole("link", { name: "Budget guide" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});
