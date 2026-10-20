export type GlasscoAppId = "pipeline" | "ppc" | "ppcDashboard";

export const PPC_BASE_PATH = "/ppc";
export const PIPELINE_HOME = process.env.NEXT_PUBLIC_PIPELINE_ORIGIN?.replace(/\/$/, "") || "https://glasscopipeline.vercel.app";
export const GLASSCO_APP_ROUTES_STORAGE_KEY = "glassco.appRoutes.v1";
export const GLASSCO_DEFAULT_APP_ROUTES: Record<GlasscoAppId, string> = {
  pipeline: "/",
  ppc: "/ppc/library",
  ppcDashboard: "/ppc/dashboard",
};

export function withPpcBasePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === PPC_BASE_PATH || normalized.startsWith(`${PPC_BASE_PATH}/`) ? normalized : `${PPC_BASE_PATH}${normalized}`;
}

function parseSameOriginRoute(value: unknown): URL | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value, "https://glassco.invalid");
    return parsed.origin === "https://glassco.invalid" ? parsed : null;
  } catch {
    return null;
  }
}

export function isValidPipelineRoute(value: unknown): value is string {
  const parsed = parseSameOriginRoute(value);
  return Boolean(parsed && !parsed.pathname.startsWith(PPC_BASE_PATH));
}

export function isValidSopLibraryRoute(value: unknown): value is string {
  const parsed = parseSameOriginRoute(value);
  return Boolean(parsed && (parsed.pathname === "/ppc/library" || parsed.pathname.startsWith("/ppc/library/")));
}

export function isValidPpcDashboardRoute(value: unknown): value is string {
  const parsed = parseSameOriginRoute(value);
  return Boolean(parsed && parsed.pathname === "/ppc/dashboard");
}

export function isPpcDashboardPathname(pathname: string) {
  return pathname === "/dashboard" || pathname === "/ppc/dashboard";
}

export function getSafeGlasscoReturnRoute(value: unknown): string | null {
  return isValidSopLibraryRoute(value) || isValidPpcDashboardRoute(value) ? value : null;
}

export function getPipelineLoginUrl(returnTo: unknown): string {
  const url = new URL(PIPELINE_HOME);
  const safeReturnTo = getSafeGlasscoReturnRoute(returnTo);
  if (safeReturnTo) url.searchParams.set("returnTo", safeReturnTo);
  return url.toString();
}

export function getPipelineProfileUrl(): string {
  const url = new URL(PIPELINE_HOME);
  url.searchParams.set("open", "profile");
  return url.toString();
}

export function readGlasscoAppRoutes(storage: Storage): Record<GlasscoAppId, string> {
  const fallback = { ...GLASSCO_DEFAULT_APP_ROUTES };
  try {
    const raw = storage.getItem(GLASSCO_APP_ROUTES_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const candidate = parsed as Record<string, unknown>;
    return {
      pipeline: isValidPipelineRoute(candidate.pipeline) ? candidate.pipeline : fallback.pipeline,
      ppc: isValidSopLibraryRoute(candidate.ppc) ? candidate.ppc : fallback.ppc,
      ppcDashboard: isValidPpcDashboardRoute(candidate.ppcDashboard) ? candidate.ppcDashboard : fallback.ppcDashboard,
    };
  } catch {
    return fallback;
  }
}

export function rememberGlasscoAppRoute(storage: Storage, app: GlasscoAppId, route: string) {
  const routes = readGlasscoAppRoutes(storage);
  if (app === "pipeline" && isValidPipelineRoute(route)) routes.pipeline = route;
  if (app === "ppc" && isValidSopLibraryRoute(route)) routes.ppc = route;
  if (app === "ppcDashboard" && isValidPpcDashboardRoute(route)) routes.ppcDashboard = route;
  storage.setItem(GLASSCO_APP_ROUTES_STORAGE_KEY, JSON.stringify(routes));
  return routes;
}
