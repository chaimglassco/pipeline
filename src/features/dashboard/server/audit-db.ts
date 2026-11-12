import postgres from "postgres";
import type { ImportStage, ReportContext, SheetManifest } from "../domain/cloud-audit";

let connection: ReturnType<typeof postgres> | undefined;
export function auditDb() {
  const url = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_URL;
  if (!url) throw new Error("Audit database is not configured.");
  return connection ??= postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15 });
}
export const auditWorkspace = () => process.env.PPC_AUDIT_WORKSPACE_ID || "glassco";
export const cloudAuditsEnabled = () => process.env.PPC_CLOUD_AUDITS_ENABLED === "true";
export type CloudImport = {
  id: string; workspace: string; owner_email: string; name: string; filename: string;
  status: ImportStage; generation: number; revision: number; raw_path: string;
  raw_deleted_at: string | null; checksum: string | null; workflow_id: string | null;
  context: ReportContext | null; manifest: SheetManifest[];
  progress: Record<string, number | string | boolean>; failure: string | null;
};
export class AuditRequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function requireImport(id: string, workspace = auditWorkspace()): Promise<CloudImport> {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AuditRequestError("Import not found.",404);
  const rows = await auditDb()<CloudImport[]>`select * from ppc_audit_imports where id=${id} and workspace=${workspace}`;
  if (!rows[0]) throw new AuditRequestError("Import not found.",404);
  return rows[0];
}
export async function checkpoint(id: string, generation: number, stage: ImportStage, progress: Record<string, number | string | boolean> = {}) {
  const rows = await auditDb()`update ppc_audit_imports set status=${stage},progress=progress || ${auditDb().json(progress)},updated_at=now()
    where id=${id} and generation=${generation} and status not in ('cancelled','failed') returning id`;
  if (!rows.length) throw new AuditRequestError("Import was cancelled or superseded.",409);
  console.info("ppc-audit-stage", { importId:id,generation,stage,...progress });
}
