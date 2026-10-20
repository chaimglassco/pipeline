import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const dashboardCss = readFileSync(join(process.cwd(), "src", "features", "dashboard", "ui", "ppc-performance-dashboard.module.css"), "utf8");
const portfolioCss = readFileSync(join(process.cwd(), "src", "features", "dashboard", "ui", "product-portfolio-panel.module.css"), "utf8");
const reportingPeriodsCss = readFileSync(join(process.cwd(), "src", "features", "dashboard", "ui", "ppc-reporting-periods.module.css"), "utf8");

describe("application navigation style contract", () => {
  it("uses three independent rounded cards with hover and visible focus states", () => {
    expect(css).toContain(".glassco-app-tabs{display:inline-flex;min-width:0;max-width:min(700px,calc(100vw - 600px));align-items:center;gap:12px;padding:6px;overflow-x:auto");
    expect(css).toContain("border:1px solid var(--line);border-radius:13px");
    expect(css).toContain("box-shadow:0 8px 20px rgba(15,23,42,.08)");
    expect(css).toContain(".glassco-app-tabs__tab.active{border-color:var(--blue-dark);background:var(--blue-dark);color:#fff}");
    expect(css).toContain(".glassco-app-tabs__tab:not(.active):hover{background:var(--blue-soft);color:var(--blue-dark)}");
    expect(css).toContain(".glassco-app-tabs__tab:focus-visible{outline:3px solid #f5ad2b;outline-offset:2px}");
  });

  it("compacts and horizontally scrolls the cards on narrow screens", () => {
    expect(css).toContain("@media(max-width:760px){.topbar{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:\"tabs tabs\" \"breadcrumb actions\"");
    expect(css).toContain(".glassco-app-tabs{grid-area:tabs;width:100%;max-width:100%;gap:7px;padding-inline:2px}");
    expect(css).toContain(".account-actions__identity{display:none}");
    expect(css).toContain("scrollbar-width:none");
  });

  it("removes the redundant shell column from Library and PPC Dashboard", () => {
    expect(css).toContain(".app-shell--library,.app-shell--dashboard{display:block}");
    expect(css).toContain(".app-shell--library .app-main,.app-shell--dashboard .app-main{grid-column:1;width:100%}");
  });

  it("lays out the responsive three-panel PPC performance workspace below the shared top bar", () => {
    expect(dashboardCss).toContain(".dashboard{height:calc(100vh - 74px);display:grid;grid-template-columns:300px 340px minmax(620px,1fr)");
    expect(dashboardCss).toContain("@media(max-width:760px){.dashboard{height:auto;min-height:calc(100vh - 108px);display:block");
  });

  it("isolates the reference product and reporting-period surfaces", () => {
    expect(dashboardCss).toContain(".dashboard{column-gap:0;row-gap:12px}");
    expect(reportingPeriodsCss).toContain("position: relative");
    expect(reportingPeriodsCss).toContain("width: 28px");
    expect(reportingPeriodsCss).toContain("background: #fff");
    expect(reportingPeriodsCss).toContain("border: 2px solid #000");
    expect(portfolioCss).toContain("border-right: 1px solid #e4e4e7");
    expect(portfolioCss).toContain("background: #000");
    expect(portfolioCss).toContain("min-height: 60px");
  });
});
