"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowDown, ArrowUp, ExternalLink, Eye, GripVertical, List as ListIcon, LoaderCircle, Pencil, Play, Plus, Save, Trash2, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { createBlankContentElement, getInitialContentElements, getTopicsFromContentElements } from "../domain/document-elements";
import { resolveRichText, richTextToParagraphs, richTextToRoadmapStyle } from "../domain/rich-text";
import type { ButtonAlignment, ButtonWidth, Category, InsightColor, LibraryContentElement, LibraryContentElementType, LibraryDocument, RoadmapAlignment, RoadmapNumberPosition, RoadmapStep, Topic } from "../domain/types";
import { getVideoPresentation, normalizeVideoUrl } from "../domain/video-links";
import { Markdown } from "./markdown";
import { DocumentLinkCatalogProvider, RichTextEditor, RichTextRenderer, type DocumentLinkCatalog } from "./rich-text";
import styles from "./document-builder.module.css";

const ELEMENT_OPTIONS: Array<{ type: LibraryContentElementType; label: string }> = [
  { type: "topic", label: "Add Topic" },
  { type: "statement", label: "Centered Statement" },
  { type: "headline", label: "Headline" },
  { type: "description", label: "Description" },
  { type: "quote", label: "Blue Callout" },
  { type: "bullets", label: "Bullets" },
  { type: "insight", label: "Key Insight" },
  { type: "table", label: "Editable Table" },
  { type: "accordion", label: "Dropdown" },
  { type: "feature", label: "Feature Card" },
  { type: "gallery", label: "Image Gallery" },
  { type: "button", label: "Button" },
  { type: "code", label: "Blue Text Block" },
  { type: "timeline", label: "Roadmap" },
  { type: "flowchart", label: "Diagnostic Flow" },
];

type BulletsStyle = Extract<LibraryContentElementType, "bullets" | "checklist" | "numbered">;

function isBulletsStyle(type: LibraryContentElementType): type is BulletsStyle {
  return type === "bullets" || type === "checklist" || type === "numbered";
}

type DocumentBuilderProps = {
  doc: LibraryDocument;
  categories?: Category[];
  activeTopicId: string;
  onTopicChange: (id: string) => void;
  onModeTransition?: (id: string) => void;
  onSave: (elements: LibraryContentElement[], metadata: DocumentMetadataDraft) => Promise<void> | void;
  onSaveVideoUrl: (url: string) => Promise<void> | void;
  documentLinkCatalog?: DocumentLinkCatalog;
  canEdit?: boolean;
};

export type DocumentMetadataDraft = Pick<LibraryDocument, "title" | "description" | "category">;

export function DocumentBuilder({ doc, categories = [doc.category], activeTopicId, onTopicChange, onModeTransition = () => undefined, onSave, onSaveVideoUrl, documentLinkCatalog, canEdit = false }: DocumentBuilderProps) {
  const [elements, setElements] = useState(() => getInitialContentElements(doc));
  const [metadata, setMetadata] = useState<DocumentMetadataDraft>(() => ({ title: doc.title, description: doc.description, category: doc.category }));
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [useStructuredPreview, setUseStructuredPreview] = useState(Boolean(doc.contentElements));
  const [isReorderOpen, setIsReorderOpen] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [insertMenuIndex, setInsertMenuIndex] = useState<number | null>(null);

  const structuredTopics = getTopicsFromContentElements(elements);
  const topics = useStructuredPreview || isEditMode ? structuredTopics : doc.topics;
  const categoryOptions = categories.includes(metadata.category) ? categories : [metadata.category, ...categories];

  const normalizedMetadata = () => ({ title: metadata.title.trim(), description: metadata.description.trim(), category: metadata.category.trim() });

  const updateElement = (id: string, updates: Partial<LibraryContentElement>) => {
    setElements(current => current.map(element => element.id === id ? { ...element, ...updates } : element));
  };

  const addElement = (type: LibraryContentElementType, insertionIndex = elements.length) => {
    const next = createBlankContentElement(type, structuredTopics.length + 1);
    setElements(current => {
      const safeIndex = Math.max(0, Math.min(insertionIndex, current.length));
      let topicNumber = 0;
      return [...current.slice(0, safeIndex), next, ...current.slice(safeIndex)].map(element => element.type === "topic" ? { ...element, eyebrow: `Part ${++topicNumber}` } : element);
    });
    setInsertMenuIndex(null);
    if (type === "topic") window.requestAnimationFrame(() => onTopicChange(next.id));
  };

  const deleteElement = (id: string) => {
    setElements(current => current.filter(element => element.id !== id));
    if (activeTopicId === id) onTopicChange(structuredTopics.find(topic => topic.id !== id)?.id ?? "");
  };

  const openReorder = () => {
    setInsertMenuIndex(null);
    setReorderIds(elements.map(element => element.id));
    setIsReorderOpen(true);
  };

  const moveReorderItem = (fromIndex: number, toIndex: number) => {
    setReorderIds(current => {
      if (toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const saveReorder = async () => {
    const byId = new Map(elements.map(element => [element.id, element]));
    let partNumber = 0;
    const next = reorderIds
      .map(id => byId.get(id))
      .filter((element): element is LibraryContentElement => Boolean(element))
      .map(element => element.type === "topic" ? { ...element, eyebrow: `Part ${++partNumber}` } : element);

    setIsSaving(true);
    try {
      const nextMetadata = normalizedMetadata();
      if (!nextMetadata.title || !nextMetadata.category) throw new Error("Document title and category are required.");
      await onSave(next, nextMetadata);
      setElements(next);
      setUseStructuredPreview(true);
      setIsReorderOpen(false);
      setNotice("Element order saved.");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save the element order.");
    } finally {
      setIsSaving(false);
    }
  };

  const enterEditMode = () => {
    setNotice("");
    setIsEditMode(true);
    onModeTransition(activeTopicId);
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const nextMetadata = normalizedMetadata();
      if (!nextMetadata.title || !nextMetadata.category) throw new Error("Document title and category are required.");
      await onSave(elements, nextMetadata);
      setMetadata(nextMetadata);
      setUseStructuredPreview(true);
      setIsEditMode(false);
      setInsertMenuIndex(null);
      onModeTransition(activeTopicId);
      setNotice("Changes saved. Preview updated.");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save document changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return <DocumentLinkCatalogProvider value={documentLinkCatalog}>
    <details className="mobile-topics">
      <summary>On this page · {topics.filter(topic => topic.level === 2).length} topics</summary>
      <TopicLinks topics={topics} active={activeTopicId} onSelect={onTopicChange} />
    </details>
    <div className="reader-layout" style={{ gridTemplateColumns: "minmax(230px, 270px) minmax(0, 1fr)", gap: 14 }}>
      <aside className={`topic-sidebar ${styles.sidebar}`}>
        <div className={styles.sidebarContent}>
          <strong>ON THIS PAGE</strong>
          <TopicLinks topics={topics} active={activeTopicId} onSelect={onTopicChange} onDelete={isEditMode ? deleteElement : undefined} />
        </div>
        {canEdit ? <BuilderControls isEditMode={isEditMode} isSaving={isSaving} notice={notice} onEnterEditMode={enterEditMode} onSaveChanges={() => void saveChanges()} /> : null}
      </aside>
      <article className={`prose ${styles.document}`}>
        <DocumentHeader doc={doc} metadata={metadata} categories={categoryOptions} isEditMode={isEditMode} onMetadataChange={updates => setMetadata(current => ({ ...current, ...updates }))} onSaveVideoUrl={onSaveVideoUrl} />
        {isEditMode ? (
          <div className={styles.reorderBar} aria-label="Document element controls">
            <button
              className={styles.reorderButton}
              type="button"
              onClick={openReorder}
              disabled={elements.length < 2}
              title={elements.length < 2 ? "Add at least two elements to reorder them" : "Reorder document elements"}
            >
              <ListIcon aria-hidden="true" />
              REORDER
            </button>
          </div>
        ) : null}
        {isEditMode || useStructuredPreview ? <div className={`${styles.blocks} ${isEditMode ? styles.editBlocks : ""}`}>{elements.map((element, index) => isEditMode
          ? <div className={styles.editElementGroup} key={element.id}>
            <ElementEditor element={element} onUpdate={updates => updateElement(element.id, updates)} onDelete={() => deleteElement(element.id)} onPreviewImage={setPreviewImage} />
            <ElementAddMenu
              inline
              isOpen={insertMenuIndex === index + 1}
              ariaLabel={`Add element after ${getElementSummary(element, index).title}`}
              onToggle={() => setInsertMenuIndex(current => current === index + 1 ? null : index + 1)}
              onAdd={type => addElement(type, index + 1)}
            />
          </div>
          : <ElementPreview key={element.id} element={element} onPreviewImage={setPreviewImage} />)}</div>
          : <Markdown body={doc.body} topics={doc.topics} onTopic={onTopicChange} />}
      </article>
    </div>
    {canEdit ? <div className={styles.mobileControls}><BuilderControls isEditMode={isEditMode} isSaving={isSaving} notice={notice} onEnterEditMode={enterEditMode} onSaveChanges={() => void saveChanges()} /></div> : null}
    {previewImage ? <div className={styles.imageModal} role="dialog" aria-modal="true" aria-label="Image preview">
      <div><button type="button" onClick={() => setPreviewImage("")} aria-label="Close image preview"><X /></button><AuthenticatedImage url={previewImage} alt="Document feature preview" /></div>
    </div> : null}
    {isReorderOpen ? <ReorderDialog elements={elements} order={reorderIds} isSaving={isSaving} onMove={moveReorderItem} onCancel={() => setIsReorderOpen(false)} onSave={() => void saveReorder()} /> : null}
  </DocumentLinkCatalogProvider>;
}

function getElementSummary(element: LibraryContentElement, index: number) {
  const typeLabel = isBulletsStyle(element.type) ? "Bullets" : ELEMENT_OPTIONS.find(option => option.type === element.type)?.label ?? element.type;
  if (element.type === "topic") return { typeLabel, title: previewText(element.title || element.label, `Topic ${index + 1}`) };
  if (element.type === "statement" || element.type === "headline" || element.type === "description" || element.type === "quote" || element.type === "code") return { typeLabel, title: previewText(element.text, `Untitled ${typeLabel}`) };
  if (isBulletsStyle(element.type)) return { typeLabel, title: previewText(element.items.find(Boolean) ?? "", `Untitled ${typeLabel}`) };
  if (element.type === "table") return { typeLabel, title: previewText(element.columns.filter(Boolean).join(" / "), "Untitled table") };
  if (element.type === "accordion") return { typeLabel, title: previewText(element.dropdowns?.[0]?.title || element.title, "Untitled dropdown") };
  if (element.type === "gallery") return { typeLabel, title: previewText(element.images?.find(image => image.alt)?.alt ?? "", "Untitled image gallery") };
  if (element.type === "timeline") return { typeLabel, title: previewText(element.title, "Untitled roadmap") };
  if (element.type === "flowchart") return { typeLabel, title: previewText(element.nodes[0]?.title ?? "", "Untitled diagnostic flow") };
  return { typeLabel, title: previewText(element.title, `Untitled ${typeLabel}`) };
}

function ReorderDialog({ elements, order, isSaving, onMove, onCancel, onSave }: { elements: LibraryContentElement[]; order: string[]; isSaving: boolean; onMove: (fromIndex: number, toIndex: number) => void; onCancel: () => void; onSave: () => void }) {
  const [draggedId, setDraggedId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const byId = new Map(elements.map(element => [element.id, element]));
  const ordered = order.map(id => byId.get(id)).filter((element): element is LibraryContentElement => Boolean(element));
  const startDrag = (event: ReactDragEvent<HTMLLIElement>, id: string) => {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };
  const drop = (event: ReactDragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = draggedId || event.dataTransfer.getData("text/plain");
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) onMove(sourceIndex, targetIndex);
    setDraggedId("");
    setDropTargetId("");
  };
  return <div className={styles.reorderBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) onCancel(); }}>
    <section className={styles.reorderDialog} role="dialog" aria-modal="true" aria-labelledby="reorder-title">
      <header><div><span>DOCUMENT ELEMENTS</span><h2 id="reorder-title">Reorder elements</h2><p>Drag items into position, or use the arrows. Topic part numbers update automatically.</p></div><button type="button" onClick={onCancel} disabled={isSaving} aria-label="Close reorder elements"><X /></button></header>
      <ol className={styles.reorderList}>{ordered.map((element, index) => {
        const summary = getElementSummary(element, index);
        return <li
          className={`${draggedId === element.id ? styles.dragging : ""} ${dropTargetId === element.id && draggedId !== element.id ? styles.dropTarget : ""}`}
          key={element.id}
          draggable={!isSaving}
          onDragStart={event => startDrag(event, element.id)}
          onDragEnter={() => setDropTargetId(element.id)}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={event => drop(event, element.id)}
          onDragEnd={() => { setDraggedId(""); setDropTargetId(""); }}
        >
          <span className={styles.reorderHandle} title={`Drag ${summary.title}`}><GripVertical aria-hidden="true" /></span>
          <span className={styles.reorderIndex}>{index + 1}</span>
          <div className={styles.reorderCopy}><span>{summary.typeLabel}</span><strong title={summary.title}>{summary.title}</strong></div>
          <div className={styles.reorderActions}>
            <button type="button" onClick={() => onMove(index, index - 1)} disabled={isSaving || index === 0} aria-label={`Move ${summary.title} up`}><ArrowUp /></button>
            <button type="button" onClick={() => onMove(index, index + 1)} disabled={isSaving || index === ordered.length - 1} aria-label={`Move ${summary.title} down`}><ArrowDown /></button>
          </div>
        </li>;
      })}</ol>
      <footer><button className={styles.reorderCancel} type="button" onClick={onCancel} disabled={isSaving}>Cancel</button><button className={styles.reorderSave} type="button" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving..." : "Save order"}</button></footer>
    </section>
  </div>;
}

function setTopicTooltip(button: HTMLButtonElement, value: string) {
  const title = button.querySelector<HTMLElement>(".topic-title");
  if (title && title.scrollWidth > title.clientWidth + 1) {
    button.dataset.tooltip = value;
    button.title = value;
  } else {
    delete button.dataset.tooltip;
    button.removeAttribute("title");
  }
}

function TopicLinks({ topics, active, onSelect, onDelete }: { topics: Topic[]; active: string; onSelect: (id: string) => void; onDelete?: (id: string) => void }) {
  let part = 0;
  return <nav aria-label="Topics">{topics.map(topic => {
    const number = topic.level === 2 ? ++part : null;
    return <div className={styles.topicRow} key={topic.id}>
      <button className={`${topic.level === 3 ? "nested " : ""}${active === topic.id ? "active" : ""}`} aria-current={active === topic.id ? "location" : undefined} onMouseEnter={event => setTopicTooltip(event.currentTarget, topic.title)} onFocus={event => setTopicTooltip(event.currentTarget, topic.title)} onClick={() => onSelect(topic.id)}>
        {number ? <span className="topic-number" aria-hidden="true">{number}</span> : <span className="topic-branch" aria-hidden="true">–</span>}
        <span className="topic-title">{topic.title}</span>
      </button>
      {onDelete && topic.level === 2 ? <button className={styles.topicDelete} type="button" aria-label={`Delete ${topic.title}`} onClick={() => onDelete(topic.id)}><Trash2 /></button> : null}
    </div>;
  })}</nav>;
}

function ElementAddMenu({ isOpen, onToggle, onAdd, ariaLabel, inline = false }: { isOpen: boolean; onToggle: () => void; onAdd: (type: LibraryContentElementType) => void; ariaLabel: string; inline?: boolean }) {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPlacement, setMenuPlacement] = useState<"up" | "down">("up");
  const [menuMaxHeight, setMenuMaxHeight] = useState(420);

  const toggleAddMenu = () => {
    if (!isOpen && addButtonRef.current) {
      const rect = addButtonRef.current.getBoundingClientRect();
      const desiredHeight = Math.min(520, ELEMENT_OPTIONS.length * 36 + 16);
      const spaceAbove = Math.max(0, rect.top - 12);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
      const shouldOpenDown = spaceAbove < desiredHeight && spaceBelow >= 160;
      const placement = shouldOpenDown ? "down" : "up";
      const availableSpace = placement === "down" ? spaceBelow : spaceAbove;
      setMenuPlacement(placement);
      setMenuMaxHeight(Math.max(140, Math.min(desiredHeight, availableSpace - 8)));
    }
    onToggle();
  };

  return <div className={`${styles.addWrap} ${inline ? styles.inlineAddWrap : ""}`}>
    <button ref={addButtonRef} className={inline ? styles.inlineAddButton : styles.addButton} type="button" onClick={toggleAddMenu} aria-expanded={isOpen} aria-label={ariaLabel}><Plus /></button>
    {isOpen ? <div className={`${styles.addMenu} ${menuPlacement === "down" ? styles.addMenuDown : styles.addMenuUp}`} style={{ maxHeight: menuMaxHeight }}>{ELEMENT_OPTIONS.map(option => <button key={option.type} type="button" onClick={() => onAdd(option.type)}><Plus />{option.label}</button>)}</div> : null}
  </div>;
}

function BuilderControls({ isEditMode, isSaving, notice, onEnterEditMode, onSaveChanges }: { isEditMode: boolean; isSaving: boolean; notice: string; onEnterEditMode: () => void; onSaveChanges: () => void }) {
  return <div className={styles.controls}>
    {notice ? <p role="status">{notice}</p> : null}
    <div>
      <button className={`${styles.modeButton} ${isEditMode ? styles.editing : ""}`} type="button" onClick={isEditMode ? undefined : onEnterEditMode} disabled={isEditMode || isSaving} aria-pressed={isEditMode} aria-label={isEditMode ? "Edit mode active" : "Switch to edit mode"}>
        {isEditMode ? <Pencil /> : <Eye />}
      </button>
      {isEditMode ? <button className={styles.saveButton} type="button" onClick={onSaveChanges} disabled={isSaving}>{isSaving ? <LoaderCircle className={styles.spinner} /> : <Save />}<span>{isSaving ? "Saving..." : "Save changes"}</span></button> : null}
    </div>
  </div>;
}

function DocumentHeader({ doc, metadata, categories, isEditMode, onMetadataChange, onSaveVideoUrl }: { doc: LibraryDocument; metadata: DocumentMetadataDraft; categories: Category[]; isEditMode: boolean; onMetadataChange: (updates: Partial<DocumentMetadataDraft>) => void; onSaveVideoUrl: (url: string) => Promise<void> | void }) {
  return <header className={`reader-header ${styles.documentHeader} ${isEditMode ? styles.editingHeader : ""}`}>
    <div className={styles.headerCopy}>
      {isEditMode ? <div className={styles.metadataEditor}>
        <label><span>Category</span><select aria-label="Document category" value={metadata.category} onChange={event => onMetadataChange({ category: event.target.value })}>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
        <label><span>Document title</span><textarea className={styles.metadataTitle} aria-label="Document title" value={metadata.title} onChange={event => onMetadataChange({ title: event.target.value })} rows={2} required /></label>
        <label><span>Description</span><textarea aria-label="Document description" value={metadata.description} onChange={event => onMetadataChange({ description: event.target.value })} rows={3} /></label>
      </div> : <>
        <div className="eyebrow">{metadata.category} · {doc.type}</div>
        <h1>{metadata.title}</h1>
        <p>{metadata.description}</p>
      </>}
      <div className="reader-meta"><span>Updated {new Date(doc.updatedAt).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</span><span>{doc.readingMinutes} min read</span></div>
    </div>
    <DocumentVideo doc={doc} isEditMode={isEditMode} onSaveVideoUrl={onSaveVideoUrl} />
  </header>;
}

function DocumentVideo({ doc, isEditMode, onSaveVideoUrl }: { doc: LibraryDocument; isEditMode: boolean; onSaveVideoUrl: (url: string) => Promise<void> | void }) {
  const videoUrl = normalizeVideoUrl(doc.videoUrl ?? "");
  const video = getVideoPresentation(videoUrl);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(videoUrl);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const saveVideo = async () => {
    const normalizedUrl = normalizeVideoUrl(draft);
    if (!normalizedUrl) {
      setError("Enter a valid YouTube, Google Drive, or HTTPS video link.");
      return;
    }
    setIsSaving(true);
    try {
      await onSaveVideoUrl(normalizedUrl);
      setDraft(normalizedUrl);
      setError("");
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the video link.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeVideo = async () => {
    setIsSaving(true);
    try {
      await onSaveVideoUrl("");
      setDraft("");
      setError("");
      setIsEditing(false);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove the video link.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!video && !isEditMode) return null;

  return <section className={styles.videoSection} aria-label="Video tutorial">
      {isEditing && isEditMode ? <form className={styles.videoForm} onSubmit={event => { event.preventDefault(); void saveVideo(); }}>
        <label htmlFor={`video-url-${doc.id}`}>Video tutorial link</label>
        <input id={`video-url-${doc.id}`} type="url" value={draft} onChange={event => setDraft(event.target.value)} placeholder="YouTube, Google Drive, or direct video URL" autoFocus />
        {error ? <p role="alert">{error}</p> : null}
        <div><button type="submit" disabled={isSaving || !draft.trim()}>{isSaving ? "Saving…" : "Save link"}</button><button type="button" onClick={() => { setDraft(videoUrl); setError(""); setIsEditing(false); }}>Cancel</button>{videoUrl ? <button type="button" onClick={() => void removeVideo()} disabled={isSaving}>Remove</button> : null}</div>
      </form> : video ? <div className={styles.videoPlayerWrap}>
        <div className={`${styles.videoPlayer} ${video.kind === "google-drive" ? styles.googleDrivePlayer : ""}`}>
          {video.embedUrl ? <iframe src={video.embedUrl} title={`${doc.title} video tutorial`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            : video.kind === "direct" ? <video src={video.url} controls preload="metadata">Your browser does not support the video player.</video>
              : <a href={video.url} target="_blank" rel="noopener noreferrer" aria-label="Open video tutorial">
                <span className={styles.genericThumbnail}><Video aria-hidden="true" />Video tutorial</span>
                <span className={styles.playBadge} aria-hidden="true"><Play /></span>
              </a>}
          {video.kind === "google-drive" ? <a className={styles.videoExternalLink} href={video.url} target="_blank" rel="noopener noreferrer" aria-label="Open video tutorial in a new tab"><ExternalLink aria-hidden="true" /></a> : null}
        </div>
        {isEditMode ? <button className={styles.videoEditButton} type="button" onClick={() => setIsEditing(true)} aria-label="Edit video tutorial link"><Pencil /></button> : null}
      </div> : <button className={styles.addVideoButton} type="button" onClick={() => setIsEditing(true)}><Video aria-hidden="true" />Add a Video Link</button>}
  </section>;
}

function previewText(value: string, fallback = "") { return value.trim() || fallback; }

function ElementPreview({ element, onPreviewImage }: { element: LibraryContentElement; onPreviewImage: (url: string) => void }) {
  if (element.type === "topic") return <section id={element.id} className={styles.topicBlock}>
    <p className={styles.eyebrow}>{element.eyebrow}</p><h2>{previewText(element.title, "Header Topic Title")}</h2><span className={styles.rule} />
    <RichTextRenderer value={resolveRichText(element.richText, element.body.join("\n\n"))} className={styles.topicBody} />
    {element.callout || element.calloutRichText ? <div className={styles.quote}><RichTextRenderer value={resolveRichText(element.calloutRichText, element.callout ?? "")} /></div> : null}
  </section>;
  if (element.type === "statement") return <section className={styles.statement}><RichTextRenderer value={resolveRichText(element.richText, element.text)} /></section>;
  if (element.type === "headline") return <section className={styles.headline} data-text-alignment={element.textAlignment ?? "left"} role="heading" aria-level={2}><RichTextRenderer value={resolveRichText(element.richText, element.text)} /></section>;
  if (element.type === "description") return <section className={styles.description} data-text-alignment={element.textAlignment ?? "left"}><RichTextRenderer value={resolveRichText(element.richText, element.text)} /></section>;
  if (element.type === "quote") return <section className={styles.quote}><RichTextRenderer value={resolveRichText(element.richText, element.text)} /></section>;
  if (element.type === "bullets") return <ul className={`${styles.list} ${styles.bulletList}`}>{element.items.map((item, index) => item || element.itemRichText?.[index] ? <li key={index}><RichTextRenderer value={resolveRichText(element.itemRichText?.[index], item)} /></li> : null)}</ul>;
  if (element.type === "checklist") return <ul className={styles.checklist}>{element.items.map((item, index) => item || element.itemRichText?.[index] ? <li key={index}><input type="checkbox" disabled aria-label={item || `Checklist item ${index + 1}`} /><RichTextRenderer value={resolveRichText(element.itemRichText?.[index], item)} /></li> : null)}</ul>;
  if (element.type === "numbered") return <ol className={`${styles.list} ${styles.numberedList}`}>{element.items.map((item, index) => item || element.itemRichText?.[index] ? <li key={index}><RichTextRenderer value={resolveRichText(element.itemRichText?.[index], item)} /></li> : null)}</ol>;
  if (element.type === "insight") return <section className={styles.insight} data-insight-color={element.insightColor ?? "green"}><strong>{previewText(element.title, "Key Insight")}</strong><RichTextRenderer value={resolveRichText(element.richText, element.text)} /></section>;
  if (element.type === "table") return <ElementTable element={element} />;
  if (element.type === "accordion") return <section className={styles.accordionList}>{getDropdowns(element).map((dropdown, index) => <details className={styles.accordion} key={index}><summary>{previewText(dropdown.title, "Dropdown title")}</summary><RichTextRenderer value={resolveRichText(dropdown.richText, dropdown.text)} /></details>)}</section>;
  if (element.type === "feature") return <section className={styles.feature}><div><span>{element.label}</span><h3>{previewText(element.title, "Feature title")}</h3><RichTextRenderer value={resolveRichText(element.richText, element.text)} className={styles.featureText} />{element.buttonText ? <button type="button">{element.buttonText}</button> : null}</div><button className={styles.imageButton} type="button" onClick={() => element.imageUrl && onPreviewImage(element.imageUrl)}>{element.imageUrl ? <AuthenticatedImage url={element.imageUrl} alt={`${previewText(element.title, "Feature")} image`} /> : "Image preview"}</button></section>;
  if (element.type === "gallery") return <ImageGalleryPreview element={element} onPreviewImage={onPreviewImage} />;
  if (element.type === "button") {
    const width = element.buttonWidth ?? "medium";
    const alignment = element.buttonAlignment ?? "center";
    const validLink = isValidButtonUrl(element.buttonUrl ?? "");
    return <section className={styles.buttonBlock} data-button-width={width} data-button-alignment={alignment}>{validLink ? <a href={element.buttonUrl} target="_blank" rel="noopener noreferrer">{previewText(element.buttonText, "Button")}</a> : <span aria-disabled="true">{previewText(element.buttonText, "Button")}</span>}</section>;
  }
  if (element.type === "code") return <section className={styles.code}><span>{element.label}</span><pre>{previewText(element.text)}</pre></section>;
  if (element.type === "timeline") return <RoadmapPreview element={element} onPreviewImage={onPreviewImage} />;
  return <section className={styles.flow}>{element.nodes.map((node, index) => <div key={index}><strong>{previewText(node.title, "Flow box title")}</strong>{node.description || node.descriptionRichText ? <RichTextRenderer className={styles.flowDescription} value={resolveRichText(node.descriptionRichText, node.description ?? "")} /> : null}{node.text ? <span>{node.text}</span> : null}</div>)}</section>;
}

function isValidButtonUrl(value: string) {
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ImageGalleryPreview({ element, onPreviewImage }: { element: LibraryContentElement; onPreviewImage: (url: string) => void }) {
  const columns = element.galleryColumns ?? 1;
  const images = (element.images ?? []).filter(image => image.url.trim());
  return <section className={styles.gallery} data-gallery-columns={columns} aria-label="Image gallery">
    {images.map((image, index) => <button className={styles.galleryImage} type="button" key={index} onClick={event => {
      const displayedImage = event.currentTarget.querySelector("img");
      onPreviewImage(displayedImage?.currentSrc || displayedImage?.src || image.url);
    }} aria-label={`Preview ${previewText(image.alt, `gallery image ${index + 1}`)}`}>
      <AuthenticatedImage url={image.url} alt={previewText(image.alt, `Gallery image ${index + 1}`)} />
    </button>)}
  </section>;
}

function RoadmapPreview({ element, onPreviewImage }: { element: LibraryContentElement; onPreviewImage: (url: string) => void }) {
  const alignment = element.alignment ?? "left";
  const numberPosition = element.numberPosition ?? "left";
  return <section className={styles.timeline} data-alignment={alignment} data-number-position={numberPosition}>
    <h3>{previewText(element.title, "Roadmap title")}</h3>
    {element.steps.map((step, index) => <div key={index}>
      <span>{index + 1}</span>
      <div>
        <strong>{previewText(step.title, "Step title")}</strong>
        <RoadmapStepText step={step} />
        {step.imageUrl ? <button className={styles.roadmapImage} type="button" onClick={() => onPreviewImage(step.imageUrl ?? "")} aria-label={`Preview ${previewText(step.title, `step ${index + 1}`)} image`}><AuthenticatedImage url={step.imageUrl} alt={`${previewText(step.title, `Step ${index + 1}`)} roadmap image`} /></button> : null}
      </div>
    </div>)}
  </section>;
}

function RoadmapStepText({ step }: { step: RoadmapStep }) {
  return <RichTextRenderer value={resolveRichText(step.richText, step.text, step.textStyle ?? "plain")} />;
}

function ElementTable({ element }: { element: LibraryContentElement }) {
  const columnWidths = element.columnWidths?.length === element.columns.length ? element.columnWidths : undefined;
  return <div className={styles.tableWrap}><table className={columnWidths ? styles.sizedTable : undefined} style={columnWidths ? { minWidth: columnWidths.reduce((total, width) => total + width, 0) } : undefined}>{columnWidths ? <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup> : null}<thead><tr>{element.columns.map((column, index) => <th key={index}>{previewText(column, `Column ${index + 1}`)}</th>)}</tr></thead><tbody>{element.rows.map((row, rowIndex) => <tr key={rowIndex}>{element.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ""}</td>)}</tr>)}</tbody></table></div>;
}

function isSharedLibraryImage(url: string) {
  return url.includes("/api/library/images?");
}

function AuthenticatedImage({ url, alt }: { url: string; alt: string }) {
  if (!isSharedLibraryImage(url)) return <img src={url} alt={alt} />;
  return <PrivateLibraryImage key={url} url={url} alt={alt} />;
}

function PrivateLibraryImage({ url, alt }: { url: string; alt: string }) {
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    void fetch(url, { headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Image request failed."); return response.blob(); })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      })
      .catch(fetchError => { if (!controller.signal.aborted && fetchError instanceof Error && fetchError.name !== "AbortError") setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  if (error) return <span className={styles.imageLoadState} role="status">Image preview unavailable</span>;
  if (!resolvedUrl) return <span className={styles.imageLoadState} role="status">Loading image…</span>;
  return <img src={resolvedUrl} alt={alt} />;
}

function SharedImageUpload({ value, label, onChange, onPreview, previewClassName }: { value: string; label: string; onChange: (url: string) => void; onPreview: (url: string) => void; previewClassName?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) { setError("Use a PNG, JPEG, GIF, or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Image must be 2 MB or smaller."); return; }
    setIsUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(withPpcBasePath("/api/library/images"), { method: "POST", headers: getPipelineAuthorizationHeader(), body });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || typeof (result as Record<string, unknown>).url !== "string") {
        throw new Error(result && typeof result === "object" && typeof (result as Record<string, unknown>).error === "string" ? String((result as Record<string, unknown>).error) : "Image upload failed.");
      }
      onChange(String((result as Record<string, unknown>).url));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
  };
  return <div className={styles.sharedImageUpload}>
    <div className={styles.sharedImageActions}>
      <label aria-disabled={isUploading}>{isUploading ? "Uploading…" : value ? "Replace image" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={isUploading} onChange={event => void upload(event.target.files?.[0])} aria-label={label} /></label>
      {value ? <button type="button" onClick={() => onChange("")}>Remove image</button> : null}
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {value ? <button className={previewClassName ?? styles.sharedImagePreview} type="button" onClick={() => onPreview(value)} aria-label={`Preview ${label.replace(/^Upload /, "")}`}><AuthenticatedImage url={value} alt={`${label.replace(/^Upload /, "")} preview`} /></button> : <div className={styles.sharedImagePlaceholder}>No image uploaded</div>}
  </div>;
}

function ElementEditor({ element, onUpdate, onDelete, onPreviewImage }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void; onDelete: () => void; onPreviewImage: (url: string) => void }) {
  const updateItem = (index: number, richText: NonNullable<LibraryContentElement["richText"]>, value: string) => onUpdate({
    items: element.items.map((item, itemIndex) => itemIndex === index ? value : item),
    itemRichText: element.items.map((item, itemIndex) => itemIndex === index ? richText : resolveRichText(element.itemRichText?.[itemIndex], item)),
  });
  const updateNode = (index: number, key: "title" | "text", value: string) => onUpdate({ nodes: element.nodes.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) });
  const updateNodeDescription = (index: number, descriptionRichText: NonNullable<LibraryContentElement["richText"]>, description: string) => onUpdate({ nodes: element.nodes.map((item, itemIndex) => itemIndex === index ? { ...item, description, descriptionRichText } : item) });
  const editor = (() => {
    if (element.type === "topic") return <section id={element.id} className={styles.topicBlock}><p className={styles.eyebrow}>{element.eyebrow}</p><input className={styles.topicTitleInput} value={element.title} onChange={event => onUpdate({ title: event.target.value, label: event.target.value || element.label })} placeholder="Header topic title" /><span className={styles.rule} /><RichTextEditor ariaLabel="Topic content" value={resolveRichText(element.richText, element.body.join("\n\n"))} onChange={(richText) => onUpdate({ richText, body: richTextToParagraphs(richText) })} placeholder="Topic content..." /><RichTextEditor ariaLabel="Topic callout" value={resolveRichText(element.calloutRichText, element.callout ?? "")} onChange={(calloutRichText, callout) => onUpdate({ calloutRichText, callout })} placeholder="Optional topic callout" /></section>;
    if (element.type === "statement") return <RichTextEditor className={styles.statementEditor} ariaLabel="Centered statement" value={resolveRichText(element.richText, element.text)} onChange={(richText, text) => onUpdate({ richText, text })} placeholder="Centered statement text..." />;
    if (element.type === "headline" || element.type === "description") return <TextElementEditor element={element} onUpdate={onUpdate} />;
    if (element.type === "quote") return <div className={styles.quote}><RichTextEditor ariaLabel="Blue callout" value={resolveRichText(element.richText, element.text)} onChange={(richText, text) => onUpdate({ richText, text })} placeholder="Blue callout text..." /></div>;
    if (isBulletsStyle(element.type)) {
      const placeholder = element.type === "numbered" ? "Numbered text..." : element.type === "checklist" ? "Checklist item..." : "Bullet text...";
      const addLabel = element.type === "numbered" ? "number" : element.type === "checklist" ? "checklist item" : "bullet";
      return <div className={`${styles.itemEditor} ${element.type === "checklist" ? styles.checklistEditor : ""}`}><BulletsStyleTabs value={element.type} onChange={type => onUpdate({ type })} />{element.items.map((item, index) => <div className={styles.richListItem} key={index}>{element.type === "checklist" ? <input type="checkbox" disabled aria-hidden="true" /> : <span>{element.type === "numbered" ? `${index + 1}.` : "•"}</span>}<RichTextEditor ariaLabel={`${placeholder} ${index + 1}`} allowLists={false} value={resolveRichText(element.itemRichText?.[index], item)} onChange={(richText, plainText) => updateItem(index, richText, plainText)} placeholder={placeholder} /></div>)}<button type="button" onClick={() => onUpdate({ items: [...element.items, ""], itemRichText: [...(element.itemRichText ?? element.items.map(item => resolveRichText(undefined, item))), resolveRichText(undefined, "")] })}>Add {addLabel}</button></div>;
    }
    if (element.type === "insight") return <section className={`${styles.insight} ${styles.insightEditor}`} data-insight-color={element.insightColor ?? "green"}><InsightColorTabs value={element.insightColor ?? "green"} onChange={insightColor => onUpdate({ insightColor })} /><input className={styles.input} value={element.title} onChange={event => onUpdate({ title: event.target.value })} placeholder="Key Insight" /><RichTextEditor ariaLabel="Key insight content" value={resolveRichText(element.richText, element.text)} onChange={(richText, text) => onUpdate({ richText, text })} placeholder="Insight content..." /></section>;
    if (element.type === "table") return <TableEditor element={element} onUpdate={onUpdate} />;
    if (element.type === "accordion") return <AccordionEditor element={element} onUpdate={onUpdate} />;
    if (element.type === "feature") return <section className={styles.featureEditor}><div><input className={styles.input} value={element.label} onChange={event => onUpdate({ label: event.target.value })} placeholder="Feature label" /><input className={styles.input} value={element.title} onChange={event => onUpdate({ title: event.target.value })} placeholder="Feature title" /><RichTextEditor ariaLabel="Feature card content" value={resolveRichText(element.richText, element.text)} onChange={(richText, text) => onUpdate({ richText, text })} placeholder="Feature text..." /><input className={styles.input} value={element.buttonText} onChange={event => onUpdate({ buttonText: event.target.value })} placeholder="Button text" /></div><SharedImageUpload value={element.imageUrl} label="Upload feature card image" onChange={imageUrl => onUpdate({ imageUrl })} onPreview={onPreviewImage} previewClassName={styles.imageButton} /></section>;
    if (element.type === "gallery") return <ImageGalleryEditor element={element} onUpdate={onUpdate} onPreviewImage={onPreviewImage} />;
    if (element.type === "code") return <section className={styles.code}><input value={element.label} onChange={event => onUpdate({ label: event.target.value })} placeholder="Block label" /><textarea value={element.text} onChange={event => onUpdate({ text: event.target.value })} placeholder="Blue text block content..." /></section>;
    if (element.type === "timeline") return <RoadmapEditor element={element} onUpdate={onUpdate} onPreviewImage={onPreviewImage} />;
    if (element.type === "button") return <ButtonEditor element={element} onUpdate={onUpdate} />;
    return <section className={styles.flowEditor}>{element.nodes.map((node, index) => <div key={index}><input className={styles.flowTitleInput} value={node.title} onChange={event => updateNode(index, "title", event.target.value)} placeholder="Flow box title" /><RichTextEditor ariaLabel={`Flow step ${index + 1} description`} value={resolveRichText(node.descriptionRichText, node.description ?? "")} onChange={(richText, description) => updateNodeDescription(index, richText, description)} placeholder="Flow step description..." /><input className={styles.flowConnectorInput} value={node.text} onChange={event => updateNode(index, "text", event.target.value)} placeholder="Connector text" /></div>)}<button type="button" onClick={() => onUpdate({ nodes: [...element.nodes, { title: "", text: "", description: "" }] })}>Add flow step</button></section>;
  })();
  return <div className={styles.editorShell}><button className={styles.deleteBlock} type="button" onClick={onDelete} aria-label={`Delete ${element.type} block`}><Trash2 /></button>{editor}</div>;
}

function TextElementEditor({ element, onUpdate }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void }) {
  const alignment = element.textAlignment ?? "left";
  const isHeadline = element.type === "headline";
  return <section className={`${styles.textElementEditor} ${isHeadline ? styles.headlineEditor : styles.descriptionEditor}`} data-text-alignment={alignment}>
    <RichTextEditor ariaLabel={isHeadline ? "Headline" : "Description"} allowLists={!isHeadline} value={resolveRichText(element.richText, element.text)} onChange={(richText, text) => onUpdate({ richText, text })} defaultTextAlignment={alignment} onTextAlignmentChange={textAlignment => onUpdate({ textAlignment })} placeholder={isHeadline ? "Headline text..." : "Description text..."} />
  </section>;
}

function BulletsStyleTabs({ value, onChange }: { value: BulletsStyle; onChange: (style: BulletsStyle) => void }) {
  const options: Array<{ value: BulletsStyle; label: string }> = [
    { value: "bullets", label: "Bullets" },
    { value: "checklist", label: "Checklist" },
    { value: "numbered", label: "Numbers" },
  ];
  return <div className={styles.bulletsStyleTabs} role="group" aria-label="Bullets style">
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function InsightColorTabs({ value, onChange }: { value: InsightColor; onChange: (color: InsightColor) => void }) {
  const colors: Array<{ value: InsightColor; label: string }> = [{ value: "green", label: "Green" }, { value: "blue", label: "Blue" }, { value: "red", label: "Red" }];
  return <div className={styles.insightColorTabs} role="group" aria-label="Insight color">
    {colors.map(color => <button key={color.value} type="button" data-color={color.value} aria-pressed={value === color.value} onClick={() => onChange(color.value)}>{color.label}</button>)}
  </div>;
}

function ImageGalleryEditor({ element, onUpdate, onPreviewImage }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void; onPreviewImage: (url: string) => void }) {
  const columns = element.galleryColumns ?? 1;
  const images = element.images?.length ? element.images : [{ url: "", alt: "" }];
  const layouts: Array<{ columns: 1 | 2 | 3 | 4; label: string }> = [{ columns: 1, label: "1 Whole image" }, { columns: 2, label: "2 Grid" }, { columns: 3, label: "3 Grid" }, { columns: 4, label: "4 Grid" }];
  const saveImages = (next: Array<{ url: string; alt: string }>) => onUpdate({ images: next });
  const updateImage = (index: number, field: "url" | "alt", value: string) => saveImages(images.map((image, imageIndex) => imageIndex === index ? { ...image, [field]: value } : image));
  const selectLayout = (nextColumns: 1 | 2 | 3 | 4) => {
    const missing = Math.max(0, nextColumns - images.length);
    onUpdate({ galleryColumns: nextColumns, images: [...images, ...Array.from({ length: missing }, () => ({ url: "", alt: "" }))] });
  };
  const removeImage = (index: number) => {
    const remaining = images.filter((_, imageIndex) => imageIndex !== index);
    const missing = Math.max(0, columns - remaining.length);
    saveImages([...remaining, ...Array.from({ length: missing }, () => ({ url: "", alt: "" }))]);
  };

  return <section className={styles.galleryEditor}>
    <fieldset className={styles.galleryLayout}>
      <legend>Gallery layout</legend>
      <div>{layouts.map(layout => <button key={layout.columns} type="button" aria-pressed={columns === layout.columns} onClick={() => selectLayout(layout.columns)}>{layout.label}</button>)}</div>
    </fieldset>
    <div className={styles.galleryEditorList} data-gallery-columns={columns}>{images.map((image, index) => <div className={styles.galleryEditorItem} key={index}>
      <input className={styles.input} value={image.alt} onChange={event => updateImage(index, "alt", event.target.value)} placeholder="Image description" aria-label={`Gallery image ${index + 1} description`} />
      <SharedImageUpload value={image.url} label={`Upload gallery image ${index + 1}`} onChange={url => updateImage(index, "url", url)} onPreview={onPreviewImage} previewClassName={styles.galleryEditorPreview} />
      {images.length > 1 ? <button className={styles.removeGalleryImage} type="button" onClick={() => removeImage(index)} aria-label={`Remove gallery image ${index + 1}`}><Trash2 /></button> : null}
    </div>)}</div>
    <button className={styles.addGalleryImage} type="button" onClick={() => saveImages([...images, { url: "", alt: "" }])}><Plus />Add image</button>
  </section>;
}

function ButtonEditor({ element, onUpdate }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void }) {
  const width = element.buttonWidth ?? "medium";
  const alignment = element.buttonAlignment ?? "center";
  const link = element.buttonUrl ?? "";
  const showLinkError = Boolean(link.trim()) && !isValidButtonUrl(link);
  const widths: Array<{ value: ButtonWidth; label: string }> = [{ value: "full", label: "Full" }, { value: "large", label: "Large" }, { value: "medium", label: "Medium" }, { value: "small", label: "Small" }];
  const alignments: Array<{ value: ButtonAlignment; label: string }> = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
  return <section className={styles.buttonEditor}>
    <label>Button text<input className={styles.input} value={element.buttonText} onChange={event => onUpdate({ buttonText: event.target.value })} placeholder="Button label" /></label>
    <label>Link<input className={styles.input} value={link} onChange={event => onUpdate({ buttonUrl: event.target.value })} placeholder="https://example.com or /library" aria-invalid={showLinkError} /></label>
    {showLinkError ? <p role="alert">Enter an HTTP, HTTPS, or internal / link.</p> : null}
    <fieldset><legend>Button width</legend><div>{widths.map(option => <button key={option.value} type="button" aria-pressed={width === option.value} onClick={() => onUpdate({ buttonWidth: option.value })}>{option.label}</button>)}</div></fieldset>
    <fieldset><legend>Button alignment</legend><div>{alignments.map(option => <button key={option.value} type="button" aria-pressed={alignment === option.value} onClick={() => onUpdate({ buttonAlignment: option.value })}>{option.label}</button>)}</div></fieldset>
    <div className={styles.buttonBlock} data-button-width={width} data-button-alignment={alignment}><span>{previewText(element.buttonText, "Button preview")}</span></div>
  </section>;
}

function RoadmapEditor({ element, onUpdate, onPreviewImage }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void; onPreviewImage: (url: string) => void }) {
  const alignment = element.alignment ?? "left";
  const numberPosition = element.numberPosition ?? "left";
  const stepsRef = useRef(element.steps);
  useEffect(() => { stepsRef.current = element.steps; }, [element.steps]);
  const updateStep = (index: number, updates: Partial<RoadmapStep>) => {
    const steps = stepsRef.current.map((step, stepIndex) => stepIndex === index ? { ...step, ...updates } : step);
    stepsRef.current = steps;
    onUpdate({ steps });
  };
  const alignments: Array<{ value: RoadmapAlignment; label: string }> = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
  const numberPositions: Array<{ value: RoadmapNumberPosition; label: string }> = [{ value: "left", label: "Left number" }, { value: "center", label: "Center number" }, { value: "right", label: "Right number" }];

  return <section className={styles.timelineEditor} data-alignment={alignment} data-number-position={numberPosition}>
    <input className={styles.input} value={element.title} onChange={event => onUpdate({ title: event.target.value })} placeholder="Roadmap title" />
    <section className={styles.roadmapSettings}>
      <fieldset className={styles.roadmapAlignment}>
        <legend>Roadmap alignment</legend>
        <div>{alignments.map(option => <button key={option.value} type="button" aria-pressed={alignment === option.value} onClick={() => onUpdate({ alignment: option.value })}>{option.label}</button>)}</div>
      </fieldset>
      <fieldset className={styles.roadmapAlignment}>
        <legend>Step number position</legend>
        <div>{numberPositions.map(option => <button key={option.value} type="button" aria-pressed={numberPosition === option.value} onClick={() => onUpdate({ numberPosition: option.value })}>{option.label}</button>)}</div>
      </fieldset>
    </section>
    {element.steps.map((step, index) => <div key={index}>
      <span>{index + 1}</span>
      <div>
        <input className={`${styles.input} ${styles.roadmapStepTitleInput}`} value={step.title} onChange={event => updateStep(index, { title: event.target.value })} placeholder="Step title" aria-label={`Step ${index + 1} title`} />
        <RichTextEditor ariaLabel={`Step ${index + 1} subtext`} value={resolveRichText(step.richText, step.text, step.textStyle ?? "plain")} onChange={(richText, text) => updateStep(index, { richText, text, textStyle: richTextToRoadmapStyle(richText) })} placeholder="Step subtext" />
        <SharedImageUpload value={step.imageUrl ?? ""} label={`Upload step ${index + 1} image`} onChange={imageUrl => updateStep(index, { imageUrl })} onPreview={onPreviewImage} previewClassName={styles.roadmapImage} />
      </div>
    </div>)}
    <button type="button" onClick={() => onUpdate({ steps: [...element.steps, { title: "", text: "", imageUrl: "", textStyle: "plain" }] })}>Add step</button>
  </section>;
}

function getDropdowns(element: LibraryContentElement) {
  return element.dropdowns?.length ? element.dropdowns : [{ title: element.title, text: element.text, richText: element.richText }];
}

function AccordionEditor({ element, onUpdate }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void }) {
  const dropdowns = getDropdowns(element);
  const saveDropdowns = (next: NonNullable<LibraryContentElement["dropdowns"]>) => onUpdate({ dropdowns: next, title: next[0]?.title ?? "", text: next[0]?.text ?? "", richText: next[0]?.richText });
  const updateDropdownTitle = (index: number, value: string) => saveDropdowns(dropdowns.map((dropdown, dropdownIndex) => dropdownIndex === index ? { ...dropdown, title: value } : dropdown));
  const updateDropdownText = (index: number, richText: NonNullable<LibraryContentElement["richText"]>, text: string) => saveDropdowns(dropdowns.map((dropdown, dropdownIndex) => dropdownIndex === index ? { ...dropdown, richText, text } : dropdown));
  return <section className={styles.accordionEditor}>
    {dropdowns.map((dropdown, index) => <div className={styles.accordionEditorItem} key={index}>
      <input className={styles.input} value={dropdown.title} onChange={event => updateDropdownTitle(index, event.target.value)} placeholder="Dropdown title..." />
      <RichTextEditor ariaLabel={`Dropdown ${index + 1} content`} value={resolveRichText(dropdown.richText, dropdown.text)} onChange={(richText, text) => updateDropdownText(index, richText, text)} placeholder="Dropdown content..." />
      {dropdowns.length > 1 ? <button className={styles.removeDropdown} type="button" onClick={() => saveDropdowns(dropdowns.filter((_, dropdownIndex) => dropdownIndex !== index))} aria-label={`Remove dropdown ${index + 1}`}><Trash2 /></button> : null}
    </div>)}
    <button className={styles.addDropdown} type="button" onClick={() => saveDropdowns([...dropdowns, { title: "", text: "" }])}><Plus />Add another dropdown</button>
  </section>;
}

function TableEditor({ element, onUpdate }: { element: LibraryContentElement; onUpdate: (updates: Partial<LibraryContentElement>) => void }) {
  const updateColumn = (index: number, value: string) => onUpdate({ columns: element.columns.map((column, columnIndex) => columnIndex === index ? value : column) });
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => onUpdate({ rows: element.rows.map((row, nextRowIndex) => nextRowIndex === rowIndex ? row.map((cell, nextColumnIndex) => nextColumnIndex === columnIndex ? value : cell) : row) });
  const columnWidths = element.columnWidths?.length === element.columns.length ? element.columnWidths : undefined;
  const startColumnResize = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const table = event.currentTarget.closest("table");
    if (!table) return;
    const startX = event.clientX;
    const startWidths = Array.from(table.querySelectorAll("th"), header => header.getBoundingClientRect().width);
    const minimumWidth = 100;
    const onMove = (moveEvent: PointerEvent) => {
      const next = [...startWidths];
      let delta = moveEvent.clientX - startX;
      if (index < next.length - 1) {
        delta = Math.max(minimumWidth - next[index], Math.min(delta, next[index + 1] - minimumWidth));
        next[index] += delta;
        next[index + 1] -= delta;
      } else {
        next[index] = Math.max(minimumWidth, next[index] + delta);
      }
      onUpdate({ columnWidths: next.map(width => Math.round(width)) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };
  const addColumn = () => onUpdate({ columns: [...element.columns, ""], rows: element.rows.map(row => [...row, ""]), columnWidths: columnWidths ? [...columnWidths, 150] : undefined });
  const deleteColumn = (index: number) => {
    if (element.columns.length <= 1) return;
    onUpdate({
      columns: element.columns.filter((_, columnIndex) => columnIndex !== index),
      rows: element.rows.map(row => row.filter((_, columnIndex) => columnIndex !== index)),
      columnWidths: columnWidths?.filter((_, columnIndex) => columnIndex !== index),
    });
  };
  const deleteRow = (index: number) => {
    if (element.rows.length <= 1) return;
    onUpdate({ rows: element.rows.filter((_, rowIndex) => rowIndex !== index) });
  };
  return <div className={styles.tableEditor}><div className={styles.tableWrap}><table className={columnWidths ? styles.sizedTable : undefined} style={columnWidths ? { minWidth: columnWidths.reduce((total, width) => total + width, 0) } : undefined}>{columnWidths ? <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}<col className={styles.tableActionColumn} /></colgroup> : null}<thead><tr>{element.columns.map((column, index) => <th key={index}><input className={styles.input} value={column} onChange={event => updateColumn(index, event.target.value)} placeholder="Column" /><button className={styles.deleteTableColumn} type="button" onClick={() => deleteColumn(index)} disabled={element.columns.length <= 1} aria-label={`Delete column ${index + 1}`} title={element.columns.length <= 1 ? "A table must keep at least one column" : `Delete column ${index + 1}`}><Trash2 /></button><button className={styles.columnResize} type="button" onPointerDown={event => startColumnResize(index, event)} aria-label={`Resize column ${index + 1}`} /></th>)}<th className={styles.tableActionHeader} aria-label="Row actions" /></tr></thead><tbody>{element.rows.map((row, rowIndex) => <tr key={rowIndex}>{element.columns.map((_, columnIndex) => <td key={columnIndex}><textarea className={styles.area} value={row[columnIndex] ?? ""} onChange={event => updateCell(rowIndex, columnIndex, event.target.value)} placeholder="Cell text" /></td>)}<td className={styles.tableRowAction}><button type="button" onClick={() => deleteRow(rowIndex)} disabled={element.rows.length <= 1} aria-label={`Delete row ${rowIndex + 1}`} title={element.rows.length <= 1 ? "A table must keep at least one row" : `Delete row ${rowIndex + 1}`}><Trash2 /></button></td></tr>)}</tbody></table></div><div><button type="button" onClick={addColumn}>Add column</button><button type="button" onClick={() => onUpdate({ rows: [...element.rows, element.columns.map(() => "")] })}>Add row</button></div></div>;
}
