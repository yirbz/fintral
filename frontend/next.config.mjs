

import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: {},
  httpAgentOptions: {
    keepAlive: true,
  },
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 120_000,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      { source: "/openapi.json", destination: `${backend}/openapi.json` },
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/token", destination: `${backend}/token` },
      { source: "/logout", destination: `${backend}/logout` },
      { source: "/auth/google", destination: `${backend}/auth/google` },
      { source: "/upload", destination: `${backend}/upload` },
      { source: "/process/:path*", destination: `${backend}/process/:path*` },
      { source: "/invoices/:path*", destination: `${backend}/invoices/:path*` },
      { source: "/invoice/:path*", destination: `${backend}/invoice/:path*` },
      { source: "/statistics", destination: `${backend}/statistics` },
      { source: "/categories", destination: `${backend}/categories` },
      { source: "/export/:path*", destination: `${backend}/export/:path*` },
      { source: "/evolution/:path*", destination: `${backend}/evolution/:path*` },
      { source: "/websocket/:path*", destination: `${backend}/websocket/:path*` },
      { source: "/pending-uploads/:path*", destination: `${backend}/pending-uploads/:path*` }
    ];
  }
};

export default withSerwist(nextConfig);

