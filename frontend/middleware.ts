import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/billing"];

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hasToken = request.cookies.has("access_token");

  // ── Logout: clear the session cookie client-side and redirect to login ──
  // This runs before the backend rewrite, so it works even when the backend
  // is unreachable (e.g. corrupted session cookie causing Cloudflare 502).
  if (url.pathname === "/logout") {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set("access_token", "", { maxAge: 0, path: "/" });
    return response;
  }

  const isAuthPage =
    url.pathname === "/login" ||
    url.pathname === "/signup" ||
    url.pathname.startsWith("/login/") ||
    url.pathname.startsWith("/signup/");

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
  if (isAuthPage && hasToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
