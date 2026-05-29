import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // Check if hostname starts with 'factura.'
  const isBillingSubdomain = hostname.startsWith("factura.");

  if (isBillingSubdomain) {
    // Prevent infinite loop if already rewritten to /billing
    if (url.pathname.startsWith("/billing")) {
      return NextResponse.next();
    }

    // Skip API, static assets, internal next paths, and static files
    if (
      url.pathname.startsWith("/_next") ||
      url.pathname.startsWith("/api") ||
      url.pathname.startsWith("/static") ||
      url.pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    // Rewrite URL to /billing/...
    url.pathname = `/billing${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
