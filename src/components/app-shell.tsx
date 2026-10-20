"use client";

import Image from "next/image";
import Link from "next/link";
import { CircleUserRound, Library, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { GLASSCO_DEFAULT_APP_ROUTES, getPipelineLoginUrl, getPipelineProfileUrl, isPpcDashboardPathname, PIPELINE_HOME, readGlasscoAppRoutes, rememberGlasscoAppRoute } from "@/lib/glassco-apps";
import { clearAndBroadcastGlasscoSession, createBrowserPipelineSessionHandoff, type GlasscoAuthTarget } from "@/lib/pipeline-session";
import { useGlasscoSession } from "./glassco-session";

type PreparedTab = "pipeline" | "ppc" | "ppcDashboard";

function AppTabs({ pathname }: { pathname: string }) {
  const isDashboard = isPpcDashboardPathname(pathname);
  const currentApp: PreparedTab = isDashboard ? "ppcDashboard" : "ppc";

  const prepareTab = (event: MouseEvent<HTMLAnchorElement>, destination: PreparedTab, authTarget: GlasscoAuthTarget) => {
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    rememberGlasscoAppRoute(window.localStorage, currentApp, currentRoute);
    const routes = readGlasscoAppRoutes(window.localStorage);
    createBrowserPipelineSessionHandoff(authTarget);
    event.currentTarget.href = destination === "pipeline"
      ? new URL(routes.pipeline, PIPELINE_HOME).toString()
      : routes[destination];
  };

  return <nav className="glassco-app-tabs" aria-label="Glassco applications">
    <a className="glassco-app-tabs__tab" href={new URL(GLASSCO_DEFAULT_APP_ROUTES.pipeline, PIPELINE_HOME).toString()} target="_blank" rel="noopener noreferrer" onMouseDown={event => prepareTab(event, "pipeline", "pipeline")} onClick={event => prepareTab(event, "pipeline", "pipeline")}>Product Pipeline</a>
    <a className={`glassco-app-tabs__tab${!isDashboard ? " active" : ""}`} href={GLASSCO_DEFAULT_APP_ROUTES.ppc} target="_blank" rel="noopener noreferrer" aria-current={!isDashboard ? "page" : undefined} onMouseDown={event => prepareTab(event, "ppc", "ppc")} onClick={event => prepareTab(event, "ppc", "ppc")}>Team SOP Library</a>
    <a className={`glassco-app-tabs__tab${isDashboard ? " active" : ""}`} href={GLASSCO_DEFAULT_APP_ROUTES.ppcDashboard} target="_blank" rel="noopener noreferrer" aria-current={isDashboard ? "page" : undefined} onMouseDown={event => prepareTab(event, "ppcDashboard", "ppc")} onClick={event => prepareTab(event, "ppcDashboard", "ppc")}>PPC Weekly Goals</a>
  </nav>;
}

function AccountActions() {
  const { user } = useGlasscoSession();
  const profileUrl = getPipelineProfileUrl();
  const avatarUrl = user.avatarUrl || user.avatarDataUrl || "";
  const prepareProfile = (event: MouseEvent<HTMLAnchorElement>) => {
    createBrowserPipelineSessionHandoff("pipeline");
    event.currentTarget.href = profileUrl;
  };
  const logout = () => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    clearAndBroadcastGlasscoSession();
    window.location.replace(getPipelineLoginUrl(returnTo));
  };

  return <div className="account-actions" aria-label="Account actions">
    <span className="account-actions__identity"><strong>{user.name}</strong><span>{user.role}</span></span>
    <a className="account-actions__profile" href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label="Open profile" onMouseDown={prepareProfile} onClick={prepareProfile}>
      {avatarUrl ? <Image src={avatarUrl} alt="" width={36} height={36} unoptimized /> : <CircleUserRound aria-hidden="true" />}
    </a>
    <button type="button" aria-label="Log out" onClick={logout}><LogOut aria-hidden="true" /></button>
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/library";
  const isDashboard = isPpcDashboardPathname(pathname);
  const isLibrary = pathname === "/library" || pathname.startsWith("/library/");
  const section = isDashboard ? "PPC Weekly Goals" : pathname.includes("bookmarks") ? "Bookmarks" : pathname.includes("recent") ? "Recent" : "Team SOP Library";

  useEffect(() => {
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    rememberGlasscoAppRoute(window.localStorage, isDashboard ? "ppcDashboard" : "ppc", route);
  }, [isDashboard, pathname]);

  return <div className={`app-shell${isLibrary ? " app-shell--library" : isDashboard ? " app-shell--dashboard" : ""}`}>
    {!isLibrary && !isDashboard ? <aside className="sidebar">
      <Link className="shell-logo glassco-wordmark" href="/library" aria-label="Glassco Library home">Glassco</Link>
      <nav className="shell-nav" aria-label="Primary navigation"><Link href="/library" className={`shell-nav-link${!isDashboard ? " active" : ""}`} aria-current={!isDashboard ? "page" : undefined}><Library aria-hidden="true" /><span>Library</span></Link></nav>
    </aside> : null}
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb"><span>GLASSCO WORKSPACE</span><i>/</i><strong>{section}</strong></div><AppTabs pathname={pathname} /><div className="topbar-actions"><AccountActions /></div></header>
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
    {!isLibrary && !isDashboard ? <nav className="mobile-nav" aria-label="Mobile navigation"><Link href="/library"><Library/><span>Library</span></Link></nav> : null}
  </div>;
}
