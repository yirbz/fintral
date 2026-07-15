import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/billing"];

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hasToken = request.cookies.has("access_token");

  // ── Logout: clear the session cookie (host-level) and redirect to login ──
  // The cookie may also exist at domain level (e.g. domain=.fintral.app) — we
  // can't reliably clear that from the edge without knowing the exact domain
  // attributes. Instead, the overlay navigates to /login?expired=1 which makes
  // the auth-page redirect below a no-op (see isForcedLogin check).
  if (url.pathname === "/logout") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("expired", "1");
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set("access_token", "", { maxAge: 0, path: "/" });
    return response;
  }

  const isAuthPage =
    url.pathname === "/login" ||
    url.pathname === "/signup" ||
    url.pathname.startsWith("/login/") ||
    url.pathname.startsWith("/signup/");

  // ── Forced login: skip auth-page redirect when session is known-bad ──
  // This breaks the redirect loop: corrupted session → 502 → overlay →
  // /login?expired=1 → (no redirect) → user sees login and re-authenticates.
  const isForcedLogin = url.searchParams.get("expired") === "1";

  const isProtectedPage = PROTECTED_PREFIXES.some((prefix) =>
    url.pathname === prefix || url.pathname.startsWith(prefix + "/")
  );

  // If trying to access a protected page without a token, redirect to login
  if (isProtectedPage && !hasToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If trying to access an auth page with a token, redirect to dashboard
  // UNLESS this is a forced login (session was corrupted).
  if (isAuthPage && hasToken && !isForcedLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
