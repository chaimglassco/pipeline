"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { describeWasteGroup, EMPTY_WASTE_GROUP_TEXT, parseAuditWasteRules, WASTE_GROUP_FIELDS, wasteRuleText, type AuditWasteRules, type WasteGroupText } from "../domain/ppc-audit";
import s from "./ppc-audit-workspace.module.css";

const TABS = ["Wasted Ad Spend", "High ACOS"] as const;

/** Written form of a rule still being edited; falls back to a prompt while it is blank or has a typo. */
function groupLabel(text: WasteGroupText) {
  const parsed = parseAuditWasteRules({ groups: [text], highAcos: "" });
  return typeof parsed === "string" ? "Check the values in this rule" : parsed.groups[0] ? describeWasteGroup(parsed.groups[0]) : "Empty rule · fill at least one field";
}

/** Audit settings opened from the gear button: the search-term rules both waste pages use. */
export function AuditSettingsDialog({ rules, onSave, onClose }: { rules: AuditWasteRules | undefined; onSave: (rules: AuditWasteRules) => void; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Wasted Ad Spend");
  const [text, setText] = useState(() => wasteRuleText(rules));
  // Saved rules open collapsed; a fresh audit opens its first rule ready to fill.
  const [open, setOpen] = useState<number[]>(() => rules?.groups.length ? [] : [0]);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus(); return () => previous?.focus(); }, []);
  const setGroup = (index: number, field: keyof WasteGroupText, value: string) => { setText({ ...text, groups: text.groups.map((g, i) => i === index ? { ...g, [field]: value } : g) }); setError(""); };
  const addGroup = () => { setText({ ...text, groups: [...text.groups, { ...EMPTY_WASTE_GROUP_TEXT }] }); setOpen([...open, text.groups.length]); };
  const removeGroup = (index: number) => { setText({ ...text, groups: text.groups.filter((_, i) => i !== index) }); setOpen(open.filter(i => i !== index).map(i => i > index ? i - 1 : i)); setError(""); };
  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAuditWasteRules(text);
    if (typeof parsed !== "string") { onSave(parsed); return; }
    setError(parsed);
    // Show the field with the problem: its tab, and its rule expanded.
    const rule = parsed.match(/^Rule (\d+)/);
    if (rule) { setTab("Wasted Ad Spend"); setOpen([...new Set([...open, Number(rule[1]) - 1])]); } else setTab("High ACOS");
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
          <div role="tablist" aria-orientation="vertical" aria-label="Settings sections" className={s.settingsTabs}>{TABS.map(name => <button key={name} type="button" role="tab" id={`settings-tab-${name}`} aria-selected={name === tab} aria-controls="settings-panel" onClick={() => setTab(name)}>{name}</button>)}</div>
          <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`} className={s.settingsPanel}>
            {tab === "Wasted Ad Spend" ? <>
              <p>A search term is wasted when it matches any rule below. Inside a rule, every filled field must match; blank fields are skipped. ACOS only applies to terms that sold.</p>
              {text.groups.map((group, index) => {
                const expanded = open.includes(index);
                return <div key={index}>
                  {index ? <div className={s.orDivider}>OR</div> : null}
                  <section className={s.ruleCard} aria-label={`Rule ${index + 1}`}>
                    <div className={s.ruleHead}>
                      <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? open.filter(i => i !== index) : [...open, index])}>{expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}<strong>Rule {index + 1}</strong> <span>{groupLabel(group)}</span></button>
                      {text.groups.length > 1 ? <button type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => removeGroup(index)}><Trash2 size={14} aria-hidden="true" /></button> : null}
                    </div>
                    {expanded ? <div className={s.ruleFields}>{WASTE_GROUP_FIELDS.map(field => <label key={field.key}>{field.label}<input inputMode="decimal" placeholder={field.hint} value={group[field.key]} onChange={e => setGroup(index, field.key, e.target.value)} /></label>)}</div> : null}
                  </section>
                </div>;
              })}
              <button type="button" className={s.addRule} onClick={addGroup}><Plus size={14} aria-hidden="true" />Add OR rule</button>
            </> : <>
              <p>Search terms that sold above this ACOS are flagged as High ACOS. They are kept apart from wasted spend, and terms already counted as waste are not flagged again.</p>
              <label>High ACOS above (%)<input inputMode="decimal" placeholder="e.g. 40" value={text.highAcos} onChange={e => { setText({ ...text, highAcos: e.target.value }); setError(""); }} /></label>
            </>}
            {error ? <p role="alert" className={s.note}>{error}</p> : null}
          </div>
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className={s.primary} type="submit">Save Settings</button></footer>
      </form>
    </div>
  </div>;
}
