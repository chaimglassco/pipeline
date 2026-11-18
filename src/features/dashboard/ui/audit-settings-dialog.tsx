"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { AUDIT_WASTE_RULE_FIELDS, parseAuditWasteRules, wasteRuleText, type AuditWasteRules } from "../domain/ppc-audit";
import s from "./ppc-audit-workspace.module.css";

const TABS = [
  { name: "Wasted Ad Spend", keys: ["maxOrders", "minClicks", "minSpend"], intro: "A search term counts as wasted when it meets every filled rule. Leave a rule blank to skip it." },
  { name: "High ACOS", keys: ["highAcos"], intro: "Search terms that sold, but above this ACOS, are flagged as High ACOS. They are not added to wasted spend." },
] as const;

/** Audit settings opened from the gear button: the search-term rules both waste pages use. */
export function AuditSettingsDialog({ rules, onSave, onClose }: { rules: AuditWasteRules | undefined; onSave: (rules: AuditWasteRules) => void; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["name"]>("Wasted Ad Spend");
  const [text, setText] = useState(() => wasteRuleText(rules));
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus(); return () => previous?.focus(); }, []);
  const current = TABS.find(t => t.name === tab)!;
  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAuditWasteRules(text);
    if (typeof parsed === "string") { setError(parsed); setTab(TABS.find(t => (t.keys as readonly string[]).some(key => parsed.startsWith(AUDIT_WASTE_RULE_FIELDS.find(f => f.key === key)!.label)))!.name); return; }
    onSave(parsed);
  }
  return <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} className={`${s.dialog} ${s.settings}`} role="dialog" aria-modal="true" aria-labelledby="audit-settings-title" onKeyDown={e => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)") ?? []);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <form onSubmit={save}>
        <header className={s.settingsHeader}><h2 id="audit-settings-title">Audit Settings</h2><button type="button" aria-label="Close settings" onClick={onClose}><X size={16} aria-hidden="true" /></button></header>
        <div className={s.settingsBody}>
          <div role="tablist" aria-orientation="vertical" aria-label="Settings sections" className={s.settingsTabs}>{TABS.map(t => <button key={t.name} type="button" role="tab" id={`settings-tab-${t.keys[0]}`} aria-selected={t.name === tab} aria-controls="settings-panel" onClick={() => setTab(t.name)}>{t.name}</button>)}</div>
          <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${current.keys[0]}`} className={s.settingsPanel}>
            <p>{current.intro}</p>
            {AUDIT_WASTE_RULE_FIELDS.filter(f => (current.keys as readonly string[]).includes(f.key)).map(field => <label key={field.key}>{field.label}<input inputMode="decimal" placeholder={field.hint} value={text[field.key]} onChange={e => { setText({ ...text, [field.key]: e.target.value }); setError(""); }} /></label>)}
            {error ? <p role="alert" className={s.note}>{error}</p> : null}
          </div>
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className={s.primary} type="submit">Save Settings</button></footer>
      </form>
    </div>
  </div>;
}
