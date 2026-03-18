import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieConfig, verifySession } from "@/lib/auth/session";
import { isSingleUserModeEnabled } from "@/lib/auth/single-user-mode";

const protectedPathPrefixes = ["/dashboard", "/practice", "/analytics", "/session", "/api/dashboard", "/api/session", "/api/questions", "/api/analytics"];
const extendedProtectedPrefixes = [
  ...protectedPathPrefixes,
  "/generate",
  "/settings",
  "/onboarding",
  "/admin",
  "/api/generation",
  "/api/mastery",
  "/api/user",
];
const adminOnlyPrefixes = ["/admin", "/api/generation/drafts", "/api/mastery/recompute"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = extendedProtectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  if (isSingleUserModeEnabled()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(sessionCookieConfig.name)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const session = await verifySession(token);
  if (!session) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));

    response.cookies.delete(sessionCookieConfig.name);
    return response;
  }

  if (adminOnlyPrefixes.some((prefix) => pathname.startsWith(prefix)) && session.role !== "ADMIN") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
