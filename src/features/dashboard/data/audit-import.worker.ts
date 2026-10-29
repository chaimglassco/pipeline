import { runAuditImportJob, type AuditImportRequest } from "./audit-import-job";

const scope = self as unknown as { onmessage: ((event: MessageEvent<AuditImportRequest>) => void) | null; postMessage: (value: unknown) => void };
scope.onmessage = async event => {
  try {
    const result = await runAuditImportJob(event.data, progress => scope.postMessage({ progress }));
    scope.postMessage({ result });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : "Could not read this report." });
  }
};
