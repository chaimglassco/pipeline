import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createDefaultCategories } from "../state/category-storage";
import { ReadingStateProvider } from "../state/reading-state";
import { createAuthoritativeTestResponse } from "../state/shared-library-test-fixtures";
import { Catalog } from "./catalog";

const session = vi.hoisted(() => ({ role: "USER" as "ADMIN" | "USER" | "VIEWER" }));
vi.mock("@/components/glassco-session", () => ({
  useGlasscoSession: () => ({
    user: { email: "test@glassco.test", name: "Test", role: session.role },
    canAdmin: session.role === "ADMIN",
    canEdit: session.role === "ADMIN" || session.role === "USER",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/library", useSearchParams: () => new URLSearchParams() }));

describe("catalog permissions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    const documents = getPublishedDocuments();
    const payload = createAuthoritativeTestResponse({ documents, categories: createDefaultCategories() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
  });

  it("allows USER creation without administrator controls", async () => {
    session.role = "USER";
    render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add new topic" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Manage library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "REORDER" })).not.toBeInTheDocument();
  });

  it("keeps VIEWER read-only", async () => {
    session.role = "VIEWER";
    const view = render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>);
    const controls = within(view.container);
    await waitFor(() => expect(controls.queryByLabelText("Loading library documents")).not.toBeInTheDocument());
    expect(controls.queryByRole("button", { name: "Add new topic" })).not.toBeInTheDocument();
    expect(controls.queryByRole("button", { name: "Manage library" })).not.toBeInTheDocument();
  });

  it.each(["USER", "VIEWER"] as const)("does not expose migration to %s", async role => {
    session.role = role;
    const payload = createAuthoritativeTestResponse({ documents: [], categories: [], initialized: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const view = render(<ReadingStateProvider><Catalog documents={getPublishedDocuments()} /></ReadingStateProvider>);
    const controls = within(view.container);
    await waitFor(() => expect(controls.getByText(/Library migration pending/)).toBeVisible());
    expect(controls.queryByRole("button", { name: "Back up and restore Library" })).not.toBeInTheDocument();
  });
});
