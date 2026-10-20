"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getTopicsFromContentElements } from "../domain/document-elements";
import type { Category, LibraryContentElement, LibraryDocument } from "../domain/types";
import { useReadingState } from "../state/reading-state";
import { BookmarkButton } from "./bookmark-button";
import { DocumentBuilder, type DocumentMetadataDraft } from "./document-builder";
import { useGlasscoSession } from "@/components/glassco-session";
import type { DocumentLinkCatalog } from "./rich-text";

type ReaderProps = {
  doc: LibraryDocument;
  categories: Category[];
  onSaveContentElements: (elements: LibraryContentElement[], metadata: DocumentMetadataDraft) => Promise<void> | void;
  onSaveVideoUrl: (url: string) => Promise<void> | void;
  documentLinkCatalog?: DocumentLinkCatalog;
  mutationsEnabled?: boolean;
};

export function Reader({ doc, categories, onSaveContentElements, onSaveVideoUrl, documentLinkCatalog, mutationsEnabled = true }: ReaderProps) {
  const { canEdit } = useGlasscoSession();
  const { state, ready, recordView, setTopic, toggleComplete } = useReadingState();
  const readerTopics = useMemo(() => doc.contentElements?.length ? getTopicsFromContentElements(doc.contentElements) : doc.topics, [doc.contentElements, doc.topics]);
  const [active, setActive] = useState(readerTopics.find(topic => topic.level === 2)?.id ?? "");
  const resolvedActive = readerTopics.some(topic => topic.id === active) ? active : (readerTopics.find(topic => topic.level === 2)?.id ?? "");
  const activeTopicRef = useRef(resolvedActive);
  const ignoreScrollUntilRef = useRef(0);

  useEffect(() => { recordView(doc.id); }, [doc.id, recordView]);
  useEffect(() => { activeTopicRef.current = resolvedActive; }, [resolvedActive]);

  useEffect(() => {
    const targets = readerTopics
      .filter(topic => topic.level === 2)
      .map(topic => ({ id: topic.id, element: document.getElementById(topic.id) }))
      .filter((target): target is { id: string; element: HTMLElement } => Boolean(target.element));

    if (!targets.length) return;

    let frame = 0;
    const updateActiveTopic = () => {
      if (window.performance.now() < ignoreScrollUntilRef.current) return;

      const atPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const readingLine = Math.min(window.innerHeight * 0.32, 240);
      let next = targets[0];

      if (atPageBottom) {
        next = targets[targets.length - 1];
      } else {
        for (const target of targets) {
          if (target.element.getBoundingClientRect().top > readingLine) break;
          next = target;
        }
      }

      if (next.id === activeTopicRef.current) return;
      activeTopicRef.current = next.id;
      setActive(next.id);
      setTopic(doc.id, next.id);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveTopic);
    };

    updateActiveTopic();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [doc.id, readerTopics, setTopic]);

  const complete = ready && state.completion[doc.id];
  const go = (id: string) => {
    ignoreScrollUntilRef.current = window.performance.now() + 800;
    activeTopicRef.current = id;
    setActive(id);
    setTopic(doc.id, id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (id) history.replaceState(null, "", `#${id}`);
  };

  const preserveTopicDuringModeChange = (id: string) => {
    if (!id) return;
    ignoreScrollUntilRef.current = window.performance.now() + 1_200;
    activeTopicRef.current = id;
    setActive(id);
    setTopic(doc.id, id);
    history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
      ignoreScrollUntilRef.current = window.performance.now() + 400;
    }));
  };

  return <>
    <div className="reader-top">
      <Link prefetch={false} href="/library">← Back to Library</Link>
      <div><BookmarkButton id={doc.id} /><button className={complete ? "primary-button complete" : "secondary-button"} aria-pressed={complete} onClick={() => toggleComplete(doc.id)}>{complete ? "✓ Completed" : "Mark complete"}</button></div>
    </div>
    <DocumentBuilder
      key={`${doc.id}:${doc.updatedAt}:${doc.contentElements?.length ?? "legacy"}`}
      doc={doc}
      categories={categories}
      activeTopicId={resolvedActive}
      onTopicChange={go}
      onModeTransition={preserveTopicDuringModeChange}
      onSave={onSaveContentElements}
      onSaveVideoUrl={onSaveVideoUrl}
      documentLinkCatalog={documentLinkCatalog}
      canEdit={canEdit && mutationsEnabled}
    />
  </>;
}
