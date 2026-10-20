"use client";

import { Bot, ChevronDown, Send, Sparkles, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { addDaysIso, formatWeekRange, formatWeeklyGoalTarget, weeklyGoalLabel, type DashboardProduct, type GoalDataState, type WeeklyPpcReport } from "../domain/ppc-dashboard-state";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { withPpcBasePath } from "@/lib/glassco-apps";
import styles from "./product-performance-chat.module.css";

export type PerformanceChatPeriod = { weekStart: string; dataState: GoalDataState | null; report: WeeklyPpcReport };

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };
type ChatError = { message: string; authorizationUrl?: string };

const STARTERS = ["Summarize this week", "Why did ACOS change?", "What should I prioritize next?"];

function messageId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trustedAuthorizationUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "vercel.com" || url.hostname.endsWith(".vercel.com")) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function ProductPerformanceChat({ product, activeWeekStart, periods }: { product: DashboardProduct; activeWeekStart: string; periods: PerformanceChatPeriod[] }) {
  const scopeKey = `${product.id}:${activeWeekStart}`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [loadingScope, setLoadingScope] = useState("");
  const [errors, setErrors] = useState<Record<string, ChatError | undefined>>({});
  const messages = threads[scopeKey] ?? [];
  const loading = loadingScope === scopeKey;
  const activePeriod = periods.find(period => period.weekStart === activeWeekStart) ?? periods[0];

  const ask = async (suggestedQuestion?: string) => {
    const question = (suggestedQuestion ?? draft).trim().slice(0, 1_200);
    if (!question || loading || !activePeriod) return;
    const capturedScope = scopeKey;
    const priorMessages = messages.slice(-8);
    const userMessage: ChatMessage = { id: messageId(), role: "user", text: question };
    setDraft("");
    setErrors(current => ({ ...current, [capturedScope]: undefined }));
    setThreads(current => ({ ...current, [capturedScope]: [...(current[capturedScope] ?? []), userMessage] }));
    setLoadingScope(capturedScope);

    try {
      const response = await fetch(withPpcBasePath("/api/dashboard/ai-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getPipelineAuthorizationHeader() },
        cache: "no-store",
        body: JSON.stringify({
          question,
          history: priorMessages.map(message => ({ role: message.role, text: message.text })),
          context: {
            product: { name: product.name, asin: product.asin, sku: product.sku },
            activeWeekStart,
            targetAcos: activePeriod.report.targetAcos,
            weeklyBudget: activePeriod.report.weeklyBudget,
            notes: activePeriod.report.notes,
            carryForward: activePeriod.report.previousWeekResult,
            goals: activePeriod.report.goals.map(goal => ({ goal: goal.metric ? weeklyGoalLabel(goal.metric) : goal.title, target: formatWeeklyGoalTarget(goal), status: goal.status })),
            actions: activePeriod.report.actions.map(action => ({ action: action.title, priority: action.priority, completed: action.done })),
            periods: periods.slice(0, 60).map(period => ({
              weekStart: period.weekStart,
              weekEnd: addDaysIso(period.weekStart, 6),
              dataState: period.dataState ?? "Saved/manual",
              metrics: {
                spend: period.report.spend,
                ppcSales: period.report.ppcSales,
                organicSales: period.report.organicSales,
                totalSales: period.report.totalSales,
                ppcOrders: period.report.ppcOrders,
                organicOrders: period.report.organicOrders,
                totalOrders: period.report.totalOrders,
                acos: period.report.acos,
                tacos: period.report.tacos,
              },
            })),
          },
        }),
      });
      const value: unknown = await response.json();
      const answer = value && typeof value === "object" && typeof (value as { answer?: unknown }).answer === "string" ? (value as { answer: string }).answer.trim() : "";
      if (!response.ok || !answer) {
        const error = value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string" ? (value as { error: string }).error : "The AI assistant could not answer right now.";
        const authorizationUrl = value && typeof value === "object" ? trustedAuthorizationUrl((value as { authorizationUrl?: unknown }).authorizationUrl) : undefined;
        setErrors(current => ({ ...current, [capturedScope]: { message: error, authorizationUrl } }));
        return;
      }
      setThreads(current => ({ ...current, [capturedScope]: [...(current[capturedScope] ?? []), { id: messageId(), role: "assistant", text: answer }] }));
    } catch (error) {
      setErrors(current => ({ ...current, [capturedScope]: { message: error instanceof Error ? error.message : "The AI assistant could not answer right now." } }));
    } finally {
      setLoadingScope(current => current === capturedScope ? "" : current);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask();
  };

  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void ask();
  };

  return <div className={styles.chatWidget}>
    {open ? <section className={styles.chatPanel} role="dialog" aria-label="AI product performance assistant">
      <header><span className={styles.chatIcon}><Bot aria-hidden="true" /></span><div><strong>Performance AI</strong><small>{product.name} · {formatWeekRange(activeWeekStart)}</small></div><button type="button" aria-label="Minimize AI performance assistant" onClick={() => setOpen(false)}><ChevronDown aria-hidden="true" /></button><button type="button" aria-label="Close AI performance assistant" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></header>
      <div className={styles.chatMessages} aria-live="polite">
        {!messages.length ? <div className={styles.chatWelcome}><Sparkles aria-hidden="true" /><strong>Ask about this product&apos;s performance</strong><p>I can combine the selected reporting weeks with live, ASIN-scoped Scale Insights data.</p><div>{STARTERS.map(starter => <button type="button" key={starter} onClick={() => void ask(starter)}>{starter}</button>)}</div></div> : messages.map(message => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}><small>{message.role === "user" ? "You" : "Performance AI"}</small><p>{message.text}</p></article>)}
        {loading ? <article className={styles.assistantMessage}><small>Performance AI</small><p className={styles.thinking}>Analyzing dashboard and Scale Insights data…</p></article> : null}
      </div>
      {errors[scopeKey] ? <p className={styles.chatError} role="alert">{errors[scopeKey]?.message}{errors[scopeKey]?.authorizationUrl ? <> <a href={errors[scopeKey]?.authorizationUrl}>Connect Scale Insights</a></> : null}</p> : null}
      <form onSubmit={submit}><textarea aria-label="Ask about product performance" value={draft} maxLength={1_200} rows={2} placeholder="Ask about sales, spend, orders, ACOS, TACOS, goals…" onChange={event => setDraft(event.target.value)} onKeyDown={sendOnEnter} disabled={loading} /><button type="submit" aria-label="Send performance question" disabled={!draft.trim() || loading}><Send aria-hidden="true" /></button></form>
      <footer>Read-only Scale Insights access for this ASIN and the visible reporting periods.</footer>
    </section> : null}
    {!open ? <button type="button" className={styles.chatLauncher} aria-label="Open AI performance assistant" onClick={() => setOpen(true)}><Bot aria-hidden="true" /><span><strong>Ask Performance AI</strong><small>{product.asin || product.name}</small></span></button> : null}
  </div>;
}
