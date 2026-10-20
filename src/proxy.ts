import { NextResponse, type NextRequest } from "next/server";

const legacyHost = "glasscoppc.vercel.app";
const canonicalOrigin = "https://glasscopipeline.vercel.app";

export function proxy(request: NextRequest) {
  const requestHost = request.nextUrl.hostname.toLowerCase();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().split(":")[0]?.toLowerCase();
  const isDirectLegacyVisit = requestHost === legacyHost && (!forwardedHost || forwardedHost === legacyHost);
  if (!isDirectLegacyVisit) return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const canonicalPath = pathname === "/" ? "/ppc/library" : pathname.startsWith("/ppc") ? pathname : `/ppc${pathname}`;
  const destination = new URL(canonicalPath, canonicalOrigin);
  destination.search = request.nextUrl.search;
  return NextResponse.redirect(destination, 308);
}
