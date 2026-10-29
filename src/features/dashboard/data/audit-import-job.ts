import { readAuditFile } from "./ppc-audit-files";
import { parseAuditAds, parseAuditBusiness, type AuditAd, type AuditBusiness } from "../domain/ppc-audit";
import { detectAuditReportPeriod, type AuditReportPeriod } from "../domain/audit-report-period";

export type AuditImportRequest = { kind: "ppc" | "business"; file: File; today: string };
export type PpcImportResult = { kind: "ppc"; ads: AuditAd[]; period: AuditReportPeriod | null; repeatedRows?: number };
export type BusinessImportResult = { kind: "business"; business: AuditBusiness[] };
export type AuditImportResult = PpcImportResult | BusinessImportResult;
export async function runAuditImportJob(request: AuditImportRequest, progress: (message: string) => void = () => {}): Promise<AuditImportResult> {
  progress(`Reading ${request.kind === "ppc" ? "PPC" : "Business"} report…`);
  const sheets = await readAuditFile(request.file);
  progress("Preparing report metrics…");
  if (request.kind === "ppc") {
    let repeatedRows = 0;
    const ads = parseAuditAds(sheets, () => { repeatedRows++; });
    return { kind: "ppc", period: detectAuditReportPeriod(sheets, request.file.name, request.today), ads, repeatedRows };
  }
  return { kind: "business", business: parseAuditBusiness(sheets) };
}
