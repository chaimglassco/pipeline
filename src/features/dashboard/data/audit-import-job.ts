import { readAuditFile } from "./ppc-audit-files";
import { parseAuditAds, parseAuditBusiness, type AuditAd, type AuditBusiness } from "../domain/ppc-audit";
import { detectAuditReportPeriod, type AuditReportPeriod } from "../domain/audit-report-period";

export type AuditImportRequest = { kind: "ppc" | "business"; file: File; today: string };
export type PpcImportResult = { kind: "ppc"; ads: AuditAd[]; period: AuditReportPeriod | null };
export type BusinessImportResult = { kind: "business"; business: AuditBusiness[] };
export type AuditImportResult = PpcImportResult | BusinessImportResult;
export async function runAuditImportJob(request: AuditImportRequest, progress: (message: string) => void = () => {}): Promise<AuditImportResult> {
  progress(`Reading ${request.kind === "ppc" ? "PPC" : "Business"} report…`);
  const sheets = await readAuditFile(request.file);
  progress("Preparing report metrics…");
  return request.kind === "ppc"
    ? { kind: "ppc", period: detectAuditReportPeriod(sheets, request.file.name, request.today), ads: parseAuditAds(sheets) }
    : { kind: "business", business: parseAuditBusiness(sheets) };
}
