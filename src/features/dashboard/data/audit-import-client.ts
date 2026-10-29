import type { AuditImportRequest, AuditImportResult } from "./audit-import-job";

export function importAuditReport(request: AuditImportRequest, signal?: AbortSignal, progress: (message: string) => void = () => {}): Promise<AuditImportResult> {
  if (signal?.aborted) return Promise.reject(new DOMException("Import cancelled", "AbortError"));
  // Tests and non-browser renderers do not have a Worker implementation.
  if (typeof Worker === "undefined") return import("./audit-import-job").then(({runAuditImportJob}) => runAuditImportJob(request, progress));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./audit-import.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Import cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ progress?: string; result?: AuditImportResult; error?: string }>) => {
      if (event.data.progress) { progress(event.data.progress); return; }
      cleanup();
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error || "Could not read this report."));
    };
    worker.onerror = () => { cleanup(); reject(new Error("Report processing failed. Try a fresh export or a smaller report.")); };
    try { worker.postMessage(request); } catch (error) { cleanup(); reject(error); }
  });
}
