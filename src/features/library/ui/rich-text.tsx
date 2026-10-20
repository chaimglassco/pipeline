"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, FileSymlink, Italic, Link2, List, ListChecks, ListOrdered, Pilcrow, UnderlineIcon } from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus";
import { renderJSONContentToReactElement } from "@tiptap/static-renderer/json/react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { normalizeRichTextDocument, normalizeRichTextHref, richTextToPlainText } from "../domain/rich-text";
import type { LibraryDocumentLinkOption, RichTextDocument, RichTextMark, RichTextNode, TextAlignment } from "../domain/types";
import styles from "./rich-text.module.css";

const baseOptions = {
  blockquote: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  link: false,
  strike: false,
  underline: false,
  trailingNode: false,
} as const;

const fullExtensions = [
  StarterKit.configure(baseOptions),
  Underline,
  Link.configure({
    autolink: false,
    defaultProtocol: "https",
    enableClickSelection: false,
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer", class: null },
    isAllowedUri: url => normalizeRichTextHref(url) !== null,
    linkOnPaste: true,
    openOnClick: false,
  }),
  TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"], defaultAlignment: null }),
  TaskList,
  TaskItem.configure({ nested: false, a11y: { checkboxLabel: node => `Task item: ${node.textContent || "empty item"}` } }),
];

const inlineExtensions = [
  StarterKit.configure({ ...baseOptions, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
  Underline,
  Link.configure({
    autolink: false,
    defaultProtocol: "https",
    enableClickSelection: false,
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer", class: null },
    isAllowedUri: url => normalizeRichTextHref(url) !== null,
    linkOnPaste: true,
    openOnClick: false,
  }),
  TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"], defaultAlignment: null }),
];

const renderRichText = renderJSONContentToReactElement<RichTextMark, RichTextNode>({
  nodeMapping: {
    doc: ({ children }) => <>{children}</>,
    paragraph: ({ node, children }) => <p style={node.attrs?.textAlign ? { textAlign: node.attrs.textAlign } : undefined}>{children}</p>,
    text: ({ node }) => node.text ?? "",
    hardBreak: () => <br />,
    bulletList: ({ children }) => <ul>{children}</ul>,
    orderedList: ({ node, children }) => <ol start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>{children}</ol>,
    listItem: ({ children }) => <li>{children}</li>,
    taskList: ({ children }) => <ul data-type="taskList">{children}</ul>,
    taskItem: ({ node, children }) => <li data-type="taskItem" data-checked={Boolean(node.attrs?.checked)}>
      <label><input type="checkbox" checked={Boolean(node.attrs?.checked)} disabled readOnly aria-label="Checklist item" /><span /></label>
      <div>{children}</div>
    </li>,
  },
  markMapping: {
    bold: ({ children }) => <strong>{children}</strong>,
    italic: ({ children }) => <em>{children}</em>,
    underline: ({ children }) => <u>{children}</u>,
    link: ({ mark, children }) => {
      const href = mark.type === "link" ? normalizeRichTextHref(mark.attrs.href) : null;
      return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
    },
  },
});

export function RichTextRenderer({ value, className = "" }: { value: RichTextDocument; className?: string }) {
  return <div className={`${styles.content} ${className}`.trim()}>{renderRichText({ content: value })}</div>;
}

type RichTextEditorProps = {
  value: RichTextDocument;
  onChange: (value: RichTextDocument, plainText: string) => void;
  ariaLabel: string;
  placeholder?: string;
  allowLists?: boolean;
  className?: string;
  defaultTextAlignment?: TextAlignment;
  onTextAlignmentChange?: (alignment: TextAlignment) => void;
};

type ToolbarSurface = "main" | "selection";
type LinkEditorState = { surface: ToolbarSurface; href: string; error: string; canRemove: boolean };
type DocumentLinkEditorState = { surface: ToolbarSurface; query: string; canRemove: boolean };
type SelectionRange = { from: number; to: number };

export type DocumentLinkCatalog = {
  options: LibraryDocumentLinkOption[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  onRequest: () => void;
};

const unavailableDocumentLinkCatalog: DocumentLinkCatalog = {
  options: [],
  status: "ready",
  error: "",
  onRequest: () => undefined,
};
const DocumentLinkCatalogContext = createContext<DocumentLinkCatalog>(unavailableDocumentLinkCatalog);
const libraryDocumentPathPrefix = withPpcBasePath("/library/");

export function DocumentLinkCatalogProvider({ value, children }: { value?: DocumentLinkCatalog; children: ReactNode }) {
  return <DocumentLinkCatalogContext value={value ?? unavailableDocumentLinkCatalog}>{children}</DocumentLinkCatalogContext>;
}

export function getLibraryDocumentHref(slug: string) {
  return normalizeRichTextHref(withPpcBasePath(`/library/${encodeURIComponent(slug)}`));
}

export function isLibraryDocumentHref(value: string) {
  const href = normalizeRichTextHref(value);
  if (!href?.startsWith(libraryDocumentPathPrefix)) return false;
  const slug = href.slice(libraryDocumentPathPrefix.length);
  return Boolean(slug && !slug.includes("/") && !slug.includes("?") && !slug.includes("#"));
}

function LinkEditorPopover({
  value,
  error,
  canRemove,
  onChange,
  onApply,
  onRemove,
  onCancel,
}: {
  value: string;
  error: string;
  canRemove: boolean;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const errorId = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return <form className={styles.linkPopover} aria-label="Edit link" onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
    <label>
      <span>Link URL</span>
      <input autoFocus type="text" inputMode="url" value={value} onChange={event => onChange(event.target.value)} onKeyDown={keyDown} placeholder="https://example.com" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
    </label>
    {error ? <p id={errorId} role="alert">{error}</p> : null}
    <div>
      <button type="button" onClick={onCancel}>Cancel</button>
      {canRemove ? <button className={styles.removeLinkButton} type="button" onClick={onRemove}>Remove link</button> : null}
      <button className={styles.applyLinkButton} type="submit">Apply</button>
    </div>
  </form>;
}

function DocumentLinkPopover({
  query,
  catalog,
  canRemove,
  onQueryChange,
  onSelect,
  onRemove,
  onCancel,
}: {
  query: string;
  catalog: DocumentLinkCatalog;
  canRemove: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (option: LibraryDocumentLinkOption) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const firstResultRef = useRef<HTMLButtonElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => catalog.options.filter(option => (
    !normalizedQuery
    || `${option.title} ${option.category} ${option.description}`.toLocaleLowerCase().includes(normalizedQuery)
  )), [catalog.options, normalizedQuery]);
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      firstResultRef.current?.focus();
    } else if (event.key === "Enter" && filtered[0]) {
      event.preventDefault();
      onSelect(filtered[0]);
    }
  };

  return <div className={styles.documentLinkPopover} role="dialog" aria-label="Link Library document" onMouseDown={event => event.stopPropagation()}>
    <label>
      <span>Search documents</span>
      <input autoFocus type="search" value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={keyDown} placeholder="Search title, category, or description" />
    </label>
    {catalog.status === "loading" || catalog.status === "idle" ? <p className={styles.documentLinkStatus} role="status">Loading Library documents…</p> : null}
    {catalog.status === "error" ? <div className={styles.documentLinkError} role="alert">
      <p>{catalog.error || "Library documents could not be loaded."}</p>
      <button type="button" onClick={catalog.onRequest}>Retry</button>
    </div> : null}
    {catalog.status === "ready" && !catalog.options.length ? <p className={styles.documentLinkStatus}>No other published documents are available.</p> : null}
    {catalog.status === "ready" && catalog.options.length && !filtered.length ? <p className={styles.documentLinkStatus}>No documents match your search.</p> : null}
    {catalog.status === "ready" && filtered.length ? <ul className={styles.documentLinkResults} aria-label="Library documents">
      {filtered.map((option, index) => <li key={option.id}>
        <button ref={index === 0 ? firstResultRef : undefined} type="button" onClick={() => onSelect(option)}>
          <strong>{option.title}</strong>
          <span>{option.category}</span>
        </button>
      </li>)}
    </ul> : null}
    <div className={styles.documentLinkActions}>
      <button type="button" onClick={onCancel}>Cancel</button>
      {canRemove ? <button className={styles.removeLinkButton} type="button" onClick={onRemove}>Remove link</button> : null}
    </div>
  </div>;
}

export function shouldShowSelectionToolbar({ isEditable, from, to }: { isEditable: boolean; from: number; to: number }) {
  return isEditable && from !== to;
}

const bubbleMenuShouldShow: NonNullable<BubbleMenuProps["shouldShow"]> = ({ editor, from, to }) => shouldShowSelectionToolbar({ isEditable: editor.isEditable, from, to });
const bubbleMenuOptions = { strategy: "fixed", placement: "top", offset: 8, flip: true, shift: true } as const;
const appendBubbleMenuToBody = () => document.body;

export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  placeholder = "Start typing…",
  allowLists = true,
  className = "",
  defaultTextAlignment = "left",
  onTextAlignmentChange,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const documentLinkCatalog = useContext(DocumentLinkCatalogContext);
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null);
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [documentLinkEditor, setDocumentLinkEditor] = useState<DocumentLinkEditorState | null>(null);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: allowLists ? fullExtensions : inlineExtensions,
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        role: "textbox",
        "data-placeholder": placeholder,
        class: styles.editable,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const next = normalizeRichTextDocument(currentEditor.getJSON());
      if (next) onChangeRef.current(next, richTextToPlainText(next));
    },
  }, [allowLists]);

  useEffect(() => {
    if (!editor) return;
    const current = normalizeRichTextDocument(editor.getJSON());
    if (JSON.stringify(current) !== JSON.stringify(value)) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor ? {
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      underline: currentEditor.isActive("underline"),
      bulletList: currentEditor.isActive("bulletList"),
      orderedList: currentEditor.isActive("orderedList"),
      taskList: currentEditor.isActive("taskList"),
      link: currentEditor.isActive("link"),
      documentLink: currentEditor.isActive("link") && isLibraryDocumentHref(String(currentEditor.getAttributes("link").href ?? "")),
      selectionEmpty: currentEditor.state.selection.empty,
      textAlignment: currentEditor.isActive({ textAlign: "center" })
        ? "center"
        : currentEditor.isActive({ textAlign: "right" })
          ? "right"
          : currentEditor.isActive({ textAlign: "left" })
            ? "left"
            : null,
    } : null,
  });

  const run = (action: () => void) => {
    if (!editor) return;
    action();
  };
  const toolbarButton = (label: string, pressed: boolean, icon: ReactNode, action: () => void, disabled = false) => (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={!editor || disabled} onMouseDown={event => event.preventDefault()} onClick={() => run(action)}>
      {icon}
    </button>
  );
  const setAlignment = (alignment: TextAlignment) => {
    editor?.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(alignment).run();
    onTextAlignmentChange?.(alignment);
  };
  const restoreSelection = () => {
    if (!editor || !selectedRange) return;
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(selectedRange).run();
  };
  const closeLinkEditors = (restore = true) => {
    if (restore) restoreSelection();
    setSelectedRange(null);
    setLinkEditor(null);
    setDocumentLinkEditor(null);
  };
  const openLinkEditor = (surface: ToolbarSurface) => {
    if (!editor) return;
    if (editor.state.selection.empty && editor.isActive("link")) {
      editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").run();
    }
    const { from, to } = editor.state.selection;
    if (from === to) return;
    setSelectedRange({ from, to });
    const href = normalizeRichTextHref(String(editor.getAttributes("link").href ?? "")) ?? "";
    setDocumentLinkEditor(null);
    setLinkEditor({ surface, href, error: "", canRemove: editor.isActive("link") });
  };
  const openDocumentLinkEditor = (surface: ToolbarSurface) => {
    if (!editor) return;
    const activeDocumentLink = editor.isActive("link") && isLibraryDocumentHref(String(editor.getAttributes("link").href ?? ""));
    if (editor.state.selection.empty && activeDocumentLink) {
      editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").run();
    }
    const { from, to } = editor.state.selection;
    if (from === to) return;
    setSelectedRange({ from, to });
    setLinkEditor(null);
    setDocumentLinkEditor({ surface, query: "", canRemove: activeDocumentLink });
    if (documentLinkCatalog.status === "idle") documentLinkCatalog.onRequest();
  };
  const applyLink = () => {
    if (!editor || !linkEditor || !selectedRange) return;
    const href = normalizeRichTextHref(linkEditor.href);
    if (!href) {
      setLinkEditor(current => current ? { ...current, error: "Enter a valid HTTP, HTTPS, email, or Library link." } : current);
      return;
    }
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(selectedRange).setLink({ href }).run();
    closeLinkEditors(false);
  };
  const applyDocumentLink = (option: LibraryDocumentLinkOption) => {
    if (!editor || !documentLinkEditor || !selectedRange) return;
    const href = getLibraryDocumentHref(option.slug);
    if (!href) return;
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(selectedRange).setLink({ href }).run();
    closeLinkEditors(false);
  };
  const removeLink = () => {
    if (!editor || !selectedRange) return;
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(selectedRange).unsetLink().run();
    closeLinkEditors(false);
  };
  const linkPopover = (surface: ToolbarSurface) => linkEditor?.surface === surface ? <LinkEditorPopover
      value={linkEditor.href}
      error={linkEditor.error}
      canRemove={linkEditor.canRemove}
      onChange={href => setLinkEditor(current => current ? { ...current, href, error: "" } : current)}
      onApply={applyLink}
      onRemove={removeLink}
      onCancel={() => closeLinkEditors()}
    /> : null;
  const documentLinkPopover = (surface: ToolbarSurface) => documentLinkEditor?.surface === surface ? <DocumentLinkPopover
      query={documentLinkEditor.query}
      catalog={documentLinkCatalog}
      canRemove={documentLinkEditor.canRemove}
      onQueryChange={query => setDocumentLinkEditor(current => current ? { ...current, query } : current)}
      onSelect={applyDocumentLink}
      onRemove={removeLink}
      onCancel={() => closeLinkEditors()}
    /> : null;
  const linkControl = (surface: ToolbarSurface) => <div className={styles.linkControl}>
    {toolbarButton("Link", Boolean(active?.link), <Link2 aria-hidden="true" />, () => openLinkEditor(surface), Boolean(active?.selectionEmpty && !active?.link))}
    {toolbarButton("Link document", Boolean(active?.documentLink), <FileSymlink aria-hidden="true" />, () => openDocumentLinkEditor(surface), Boolean(active?.selectionEmpty && !active?.documentLink))}
    {surface === "selection" ? <>{linkPopover(surface)}{documentLinkPopover(surface)}</> : null}
  </div>;
  const formattingButtons = (surface: ToolbarSurface) => <>
    <div className={styles.toolbarGroup} role="group" aria-label="Text styles">
      {toolbarButton("Normal", !(active?.bold || active?.italic || active?.underline), <Pilcrow aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).unsetBold().unsetItalic().unsetUnderline().run())}
      {toolbarButton("Bold", Boolean(active?.bold), <Bold aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run())}
      {toolbarButton("Italic", Boolean(active?.italic), <Italic aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run())}
      {toolbarButton("Underlined", Boolean(active?.underline), <UnderlineIcon aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run())}
    </div>
    <span className={styles.toolbarSeparator} aria-hidden="true" />
    <div className={styles.toolbarGroup} role="group" aria-label="Text alignment">
      {toolbarButton("Align left", (active?.textAlignment ?? defaultTextAlignment) === "left", <AlignLeft aria-hidden="true" />, () => setAlignment("left"))}
      {toolbarButton("Align center", (active?.textAlignment ?? defaultTextAlignment) === "center", <AlignCenter aria-hidden="true" />, () => setAlignment("center"))}
      {toolbarButton("Align right", (active?.textAlignment ?? defaultTextAlignment) === "right", <AlignRight aria-hidden="true" />, () => setAlignment("right"))}
    </div>
    {allowLists ? <>
      <span className={styles.toolbarSeparator} aria-hidden="true" />
      <div className={styles.toolbarGroup} role="group" aria-label="Lists">
        {toolbarButton("Bullets", Boolean(active?.bulletList), <List aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run())}
        {toolbarButton("Checklist", Boolean(active?.taskList), <ListChecks aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run())}
        {toolbarButton("Numbers", Boolean(active?.orderedList), <ListOrdered aria-hidden="true" />, () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run())}
      </div>
    </> : null}
    <span className={styles.toolbarSeparator} aria-hidden="true" />
    <div className={styles.toolbarGroup} role="group" aria-label="Links">{linkControl(surface)}</div>
  </>;

  return <section className={`${styles.composer} ${className}`.trim()}>
    <div className={styles.toolbar} role="toolbar" aria-label={`${ariaLabel} formatting`}>
      {formattingButtons("main")}
    </div>
    {linkEditor?.surface === "main" || documentLinkEditor?.surface === "main" ? <div className={styles.mainLinkPopover}>{linkPopover("main")}{documentLinkPopover("main")}</div> : null}
    {editor ? <BubbleMenu editor={editor} appendTo={appendBubbleMenuToBody} shouldShow={bubbleMenuShouldShow} options={bubbleMenuOptions} className={styles.bubbleToolbar} role="toolbar" aria-label={`${ariaLabel} selection formatting`}>
      {formattingButtons("selection")}
    </BubbleMenu> : null}
    <EditorContent editor={editor} />
  </section>;
}
