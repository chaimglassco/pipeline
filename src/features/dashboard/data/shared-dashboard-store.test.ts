import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import { createWeeklyPpcReport, PPC_DASHBOARD_STORAGE_KEY, reportKey } from "../domain/ppc-dashboard-state";
import type { DashboardDocument } from "../domain/shared-dashboard";
import { DashboardConflict, readDashboardDocument, saveDashboardDocument } from "./shared-dashboard-store";

vi.mock("@vercel/blob", () => ({ get: vi.fn(), head: vi.fn(), put: vi.fn(), BlobPreconditionFailedError: class extends Error {} }));

const key = PPC_DASHBOARD_STORAGE_KEY;
const current: DashboardDocument = {
  version: 1, key, value: JSON.stringify({ version: 1, reports: {} }),
  savedAt: "2026-09-24T00:00:00.000Z", operationId: "prior-operation", actor: "editor-a",
};

describe("shared dashboard Blob saves", () => {
  it("rejects a stale goal resurrection even when the writer has the current ETag", async () => {
    const report = createWeeklyPpcReport("product-1", "2026-09-02");
    const reportId = reportKey(report.productId, report.weekStart);
    const goal = { id: "deleted-goal", title: "PPC Sales", target: "", actual: "", status: "On Track" };
    const deleted = { ...current, value: JSON.stringify({ version: 1, reports: { [reportId]: { ...report, deletedGoalIds: [goal.id] } } }) };
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(deleted))); controller.close(); } });
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream } as Awaited<ReturnType<typeof get>>);
    const stale = { ...current, operationId: "stale-save", value: JSON.stringify({ version: 1, reports: { [reportId]: { ...report, goals: [goal] } } }) };
    await expect(saveDashboardDocument(stale, "etag-1")).rejects.toMatchObject({ reason: "stale_etag" });
    expect(put).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(current)));
      controller.close();
    } });
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream, blob: { etag: "etag-1" } } as Awaited<ReturnType<typeof get>>);
    vi.mocked(head).mockResolvedValue({ etag: "etag-1" } as Awaited<ReturnType<typeof head>>);
    vi.mocked(put).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("uses the current ETag for a conditional write and retains a before-write copy", async () => {
    const next = { ...current, operationId: "next-operation", value: JSON.stringify({ version: 1, reports: { report: {} } }) };
    vi.mocked(put).mockResolvedValue({ etag: "etag-2" } as Awaited<ReturnType<typeof put>>);
    await expect(saveDashboardDocument(next, "etag-1")).resolves.toMatchObject({ document: next, etag: "etag-2" });
    expect(put).toHaveBeenCalledTimes(2);
    expect(vi.mocked(put).mock.calls[1][2]).toMatchObject({ access: "private", allowOverwrite: true, ifMatch: "etag-1" });
  });

  it("uses the Blob metadata ETag when private content GET reports another tag", async () => {
    vi.mocked(head).mockResolvedValue({ etag: "canonical-etag" } as Awaited<ReturnType<typeof head>>);
    const loaded = await readDashboardDocument(key);
    expect(loaded).toMatchObject({ document: current, etag: "canonical-etag" });
    const next = { ...current, operationId: "next-operation", value: JSON.stringify({ version: 1, reports: { report: {} } }) };
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream: new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(current))); controller.close();
    } }), blob: { etag: "representation-etag" } } as Awaited<ReturnType<typeof get>>);
    vi.mocked(put).mockResolvedValue({ etag: "next-canonical-etag" } as Awaited<ReturnType<typeof put>>);
    await expect(saveDashboardDocument(next, "canonical-etag")).resolves.toMatchObject({ etag: "next-canonical-etag" });
    expect(vi.mocked(put).mock.calls[1][2]).toMatchObject({ ifMatch: "canonical-etag" });
  });

  it("accepts a desired value that another tab already saved without writing again", async () => {
    const sameValue = { ...current, operationId: "another-operation" };
    await expect(saveDashboardDocument(sameValue, "old-etag")).resolves.toMatchObject({ document: current, etag: "etag-1" });
    expect(put).not.toHaveBeenCalled();
  });

  it("identifies a stale ETag without overwriting another editor", async () => {
    const next = { ...current, operationId: "next-operation", value: JSON.stringify({ version: 1, reports: { report: {} } }) };
    await expect(saveDashboardDocument(next, "old-etag")).rejects.toMatchObject({ reason: "stale_etag" } satisfies Partial<DashboardConflict>);
    expect(put).not.toHaveBeenCalled();
  });

  it("checks authoritative metadata when a conditional Blob write is rejected", async () => {
    const next = { ...current, operationId: "next-operation", value: JSON.stringify({ version: 1, reports: { report: {} } }) };
    vi.mocked(put).mockResolvedValueOnce({ etag: "backup-etag" } as Awaited<ReturnType<typeof put>>)
      .mockRejectedValueOnce(new BlobPreconditionFailedError());
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(saveDashboardDocument(next, "etag-1")).rejects.toMatchObject({ reason: "write_precondition" } satisfies Partial<DashboardConflict>);
    expect(head).toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith("[dashboard/state] Blob precondition detail", expect.objectContaining({
      metadataMatchesRead: true, metadataMatchesExpected: true,
    }));
  });
});
