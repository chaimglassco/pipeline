import { afterEach, expect, it, vi } from "vitest";
import { importAuditReport } from "./audit-import-client";
class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.latest = this; }
}
afterEach(() => vi.unstubAllGlobals());
const request = () => ({kind:"ppc" as const,file:new File(["report"],"bulk.csv"),today:"2026-10-29"});
it("uses a background worker and reports progress before returning parsed data", async()=>{
  vi.stubGlobal("Worker",FakeWorker); const progress=vi.fn();
  const pending=importAuditReport(request(),undefined,progress), worker=FakeWorker.latest;
  worker.onmessage?.({data:{progress:"Reading PPC report…"}} as MessageEvent);
  expect(progress).toHaveBeenCalledWith("Reading PPC report…"); expect(worker.terminate).not.toHaveBeenCalled();
  const result={kind:"ppc",ads:[],period:null}; worker.onmessage?.({data:{result}} as MessageEvent);
  await expect(pending).resolves.toEqual(result); expect(worker.terminate).toHaveBeenCalledOnce();
});
it("terminates processing when cancelled", async()=>{
  vi.stubGlobal("Worker",FakeWorker); const controller=new AbortController();
  const pending=importAuditReport(request(),controller.signal); controller.abort();
  await expect(pending).rejects.toMatchObject({name:"AbortError"}); expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});
it("returns actionable import errors and releases the worker", async()=>{
  vi.stubGlobal("Worker",FakeWorker); const pending=importAuditReport(request());
  FakeWorker.latest.onmessage?.({data:{error:"Missing Sales column"}} as MessageEvent);
  await expect(pending).rejects.toThrow("Missing Sales column"); expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});
it("rejects worker crashes rather than leaving upload controls busy", async()=>{
  vi.stubGlobal("Worker",FakeWorker); const pending=importAuditReport(request()); FakeWorker.latest.onerror?.();
  await expect(pending).rejects.toThrow("Report processing failed"); expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});
