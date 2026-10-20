"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { defaultReadingState, readStorage, writeStorage, type ReadingState } from "./storage";

type Context = { state: ReadingState; ready: boolean; availableDocumentIds: string[] | null; setAvailableDocumentIds(ids: string[]): void; toggleBookmark(id:string):void; toggleComplete(id:string):void; recordView(id:string):void; setTopic(id:string,topic:string):void };
const ReadingContext = createContext<Context | null>(null);
const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
export function ReadingStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaultReadingState);
  const [ready, setReady] = useState(false);
  const [availableDocumentIds, setAvailableDocumentIdsState] = useState<string[] | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setState(readStorage(window.localStorage)); setReady(true); }, 0); return () => window.clearTimeout(timer); }, []);
  const update = useCallback((fn: (state: ReadingState) => ReadingState) => setState(current => { const next = fn(current); writeStorage(next, window.localStorage); return next; }), []);
  const setAvailableDocumentIds = useCallback((ids: string[]) => {
    const next = [...new Set(ids)];
    setAvailableDocumentIdsState(current => current?.length === next.length && current.every((id, index) => id === next[index]) ? current : next);
  }, []);
  const toggleBookmark = useCallback((id:string) => update(s => ({ ...s, bookmarks: s.bookmarks.includes(id) ? s.bookmarks.filter(x => x !== id) : [...s.bookmarks, id] })), [update]);
  const toggleComplete = useCallback((id:string) => update(s => ({ ...s, completion: { ...s.completion, [id]: !s.completion[id] } })), [update]);
  const recordView = useCallback((id:string) => update(s => ({ ...s, recent: [{ id, viewedAt: Date.now() }, ...s.recent.filter(x => x.id !== id)].slice(0, 50) })), [update]);
  const setTopic = useCallback((id:string, topic:string) => update(s => ({ ...s, lastTopic: { ...s.lastTopic, [id]: topic } })), [update]);
  const value = useMemo<Context>(() => ({ state, ready, availableDocumentIds, setAvailableDocumentIds, toggleBookmark, toggleComplete, recordView, setTopic }), [state, ready, availableDocumentIds, setAvailableDocumentIds, toggleBookmark, toggleComplete, recordView, setTopic]);
  return <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>;
}
export function useReadingState() {
  const value = useContext(ReadingContext);
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientHydrationSnapshot, getServerHydrationSnapshot);
  if (!value) throw new Error("ReadingStateProvider missing");
  return { ...value, ready: hydrated && value.ready };
}
