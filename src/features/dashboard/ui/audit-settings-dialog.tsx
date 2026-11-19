"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { describeWasteGroup, EMPTY_WASTE_GROUP_TEXT, parseAuditWasteRules, WASTE_GROUP_FIELDS, wasteRuleText, type AuditWasteRuleText, type AuditWasteRules, type WasteGroupText } from "../domain/ppc-audit";
import s from "./ppc-audit-workspace.module.css";

const TABS = ["Wasted Ad Spend", "High ACOS", "Low ACOS"] as const;

/** Written form of a rule still being edited; falls back to a prompt while it is blank or has a typo. */
function groupLabel(text: WasteGroupText) {
  const parsed = parseAuditWasteRules({ groups: [{ ...text, join: "or" }], highAcos: "" });
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
  const setGroup = <K extends keyof WasteGroupText>(index: number, field: K, value: WasteGroupText[K]) => { setText({ ...text, groups: text.groups.map((g, i) => i === index ? { ...g, [field]: value } : g) }); setError(""); };
  // Min and max fields of an ACOS range; either may be left blank.
  const range = (fields: [keyof AuditWasteRuleText, string, string][]) => <div className={s.acosRange}>{fields.map(([key, label, hint]) =>
    <label key={key}>{label}<input inputMode="decimal" placeholder={hint} value={(text[key] as string | undefined) ?? ""} onChange={e => { setText({ ...text, [key]: e.target.value }); setError(""); }} /></label>)}</div>;
  const addGroup = () => { setText({ ...text, groups: [...text.groups, { ...EMPTY_WASTE_GROUP_TEXT }] }); setOpen([...open, text.groups.length]); };
  const removeGroup = (index: number) => { setText({ ...text, groups: text.groups.filter((_, i) => i !== index) }); setOpen(open.filter(i => i !== index).map(i => i > index ? i - 1 : i)); setError(""); };
  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAuditWasteRules(text);
    if (typeof parsed !== "string") { onSave(parsed); return; }
    setError(parsed);
    // Show the field with the problem: its tab, and its rule expanded.
    const rule = parsed.match(/^Rule (\d+)/);
    if (rule) { setTab("Wasted Ad Spend"); setOpen([...new Set([...open, Number(rule[1]) - 1])]); } else setTab(parsed.startsWith("Low ACOS") ? "Low ACOS" : "High ACOS");
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
              <p>Inside a rule, every filled field must match; blank fields are skipped. Choose AND or OR between rules; AND is checked first. ACOS only applies to terms that sold.</p>
              {text.groups.map((group, index) => {
                const expanded = open.includes(index);
                return <div key={index}>
                  {index ? <div className={s.joinSwitch} role="radiogroup" aria-label={`Join rule ${index + 1} to rule ${index}`}>{(["and", "or"] as const).map(join => <button key={join} type="button" role="radio" aria-checked={group.join === join} onClick={() => setGroup(index, "join", join)}>{join.toUpperCase()}</button>)}</div> : null}
                  <section className={s.ruleCard} aria-label={`Rule ${index + 1}`}>
                    <div className={s.ruleHead}>
                      <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? open.filter(i => i !== index) : [...open, index])}>{expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}<strong>Rule {index + 1}</strong> <span>{groupLabel(group)}</span></button>
                      {text.groups.length > 1 ? <button type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => removeGroup(index)}><Trash2 size={14} aria-hidden="true" /></button> : null}
                    </div>
                    {expanded ? <div className={s.ruleFields}>{WASTE_GROUP_FIELDS.map(field => <label key={field.key}>{field.label}<input inputMode="decimal" placeholder={field.hint} value={group[field.key]} onChange={e => setGroup(index, field.key, e.target.value)} /></label>)}</div> : null}
                  </section>
                </div>;
              })}
              <button type="button" className={s.addRule} onClick={addGroup}><Plus size={14} aria-hidden="true" />Add rule</button>
            </> : tab === "Low ACOS" ? <>
              <p>ASINs that sold through ads with an ACOS from the minimum up to below the maximum are listed under the Low ACOS tab of the Performance Summary, lowest ACOS first. Leave either end blank to leave it open.</p>
              {range([["lowAcosMin", "Min ACOS (%)", "e.g. 0"], ["lowAcos", "Max ACOS (%)", "e.g. 15"]])}
            </> : <>
              <p>Search terms that sold with an ACOS above the minimum and up to the maximum are flagged as High ACOS. Leave either end blank to leave it open. They are kept apart from wasted spend, and terms already counted as waste are not flagged again.</p>
              {range([["highAcos", "Min ACOS (%)", "e.g. 40"], ["highAcosMax", "Max ACOS (%)", "e.g. 100"]])}
            </>}
            {error ? <p role="alert" className={s.note}>{error}</p> : null}
          </div>
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className={s.primary} type="submit">Save Settings</button></footer>
      </form>
    </div>
  </div>;
}
