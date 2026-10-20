import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { GLASSCO_APP_ROUTES_STORAGE_KEY } from "@/lib/glassco-apps";
import { GLASSCO_AUTH_HANDOFF_STORAGE_KEY, PIPELINE_SESSION_STORAGE_KEY } from "@/lib/pipeline-session";

const navigation = vi.hoisted(() => ({ pathname: "/library/example" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("Glassco application tabs", () => {
  afterEach(cleanup);

  beforeEach(() => {
    navigation.pathname = "/library/example";
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(PIPELINE_SESSION_STORAGE_KEY, JSON.stringify({ token: "token", email: "admin@glassco.test", name: "Admin", role: "ADMIN" }));
    window.history.replaceState({}, "", "/ppc/library/example?mode=read#topic");
  });

  it("renders three real new-tab links, remembers destinations, and marks Team SOP Library current", () => {
    window.localStorage.setItem(GLASSCO_APP_ROUTES_STORAGE_KEY, JSON.stringify({
      pipeline: "/products?stage=shipping#timeline",
      ppc: "/ppc/library/previous",
      ppcDashboard: "/ppc/dashboard?range=30d",
    }));

    render(<AppShell><div>Library content</div></AppShell>);
    const tabs = within(screen.getByRole("navigation", { name: "Glassco applications" }));
    const pipeline = tabs.getByRole("link", { name: "Product Pipeline" });
    const library = tabs.getByRole("link", { name: "Team SOP Library" });
    const dashboard = tabs.getByRole("link", { name: "PPC Weekly Goals" });

    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.getByText("Test admin")).toBeVisible();
    expect(screen.getByText("ADMIN")).toBeVisible();
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();

    fireEvent.click(pipeline);
    expect(pipeline).toHaveAttribute("href", "https://glasscopipeline.vercel.app/products?stage=shipping#timeline");
    expect(JSON.parse(window.localStorage.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY) || "null").targetApp).toBe("pipeline");

    fireEvent.click(library);
    expect(library).toHaveAttribute("href", "/ppc/library/example?mode=read#topic");
    expect(library).toHaveAttribute("aria-current", "page");

    fireEvent.click(dashboard);
    expect(dashboard).toHaveAttribute("href", "/ppc/dashboard?range=30d");
    expect(JSON.parse(window.localStorage.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY) || "null").targetApp).toBe("ppc");

    const profile = screen.getByRole("link", { name: "Open profile" });
    fireEvent.click(profile);
    expect(profile).toHaveAttribute("href", "https://glasscopipeline.vercel.app/?open=profile");
    expect(JSON.parse(window.localStorage.getItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY) || "null").targetApp).toBe("pipeline");

    for (const tab of [pipeline, library, dashboard]) {
      expect(tab).toHaveAttribute("target", "_blank");
      expect(tab).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("marks PPC Weekly Goals current without activating the Library navigation", () => {
    navigation.pathname = "/dashboard";
    window.history.replaceState({}, "", "/ppc/dashboard");
    render(<AppShell><div>Dashboard content</div></AppShell>);

    expect(screen.getByRole("link", { name: "PPC Weekly Goals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Team SOP Library" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});
