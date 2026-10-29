import type { AuditSheet } from "./ppc-audit";

export type AuditReportPeriod = { start: string; end: string; source: "report metadata" | "daily report dates" | "file name" };
function date(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?:T.*)?$/);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const result = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : us ? `${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}` : null;
  if (!result) return null;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === result ? result : null;
}
const norm = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");
function range(start: string | null, end: string | null, source: AuditReportPeriod["source"], today: string): AuditReportPeriod | null {
  return start && end && start <= end && end <= today ? { start, end, source } : null;
}
function embeddedDates(text: string) {
  return (text.match(/(?<!\d)(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{8}|\d{1,2}\/\d{1,2}\/\d{4})(?!\d)/g) || []).map(date).filter((v): v is string => !!v);
}
export function detectAuditReportPeriod(sheets: AuditSheet[], filename: string, today: string): AuditReportPeriod | null {
  const candidates: AuditReportPeriod[] = [];
  for (const sheet of sheets) {
    const header = sheet.rows.findIndex(row => row.some(c => norm(c) === "spend") && row.some(c => norm(c) === "impressions"));
    // Campaign Start Date / End Date describe lifecycle, never the reporting period.
    const metadata = sheet.rows.slice(0, header < 0 ? 40 : header);
    let start: string | null = null, end: string | null = null;
    for (let rowIndex = 0; rowIndex < metadata.length; rowIndex++) {
      const row = metadata[rowIndex];
      for (let i = 0; i < row.length; i++) {
        const key = norm(row[i]);
        if (["reportstartdate","reportingstartdate","reportingperiodstartdate"].includes(key)) start = date(row[i+1] || "") || date(metadata[rowIndex+1]?.[i] || "");
        if (["reportenddate","reportingenddate","reportingperiodenddate"].includes(key)) end = date(row[i+1] || "") || date(metadata[rowIndex+1]?.[i] || "");
        if (["reportrange","reportrangedate","reportdaterange","reportingperiod","daterange"].includes(key)) {
          const dates = embeddedDates(row.slice(i+1).join(" "));
          if (dates.length === 2) { start = dates[0]; end = dates[1]; }
        }
      }
    }
    const explicit = range(start,end,"report metadata",today);
    if (explicit) candidates.push(explicit);
    if (header >= 0) {
      const column = sheet.rows[header].findIndex(c => ["date","reportdate"].includes(norm(c)));
      if (column >= 0) {
        const dates = sheet.rows.slice(header+1).map(row => date(row[column] || "")).filter((v): v is string => !!v).sort();
        const daily = range(dates[0],dates[dates.length-1],"daily report dates",today);
        if (daily) candidates.push(daily);
      }
    }
  }
  if (candidates.length) return candidates.every(c => c.start === candidates[0].start && c.end === candidates[0].end) ? candidates[0] : null;
  const dates = embeddedDates(filename);
  return dates.length === 2 ? range(dates[0],dates[1],"file name",today) : null;
}
