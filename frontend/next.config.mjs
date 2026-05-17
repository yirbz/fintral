/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/token", destination: `${backend}/token` },
      { source: "/logout", destination: `${backend}/logout` },
      { source: "/upload", destination: `${backend}/upload` },
      { source: "/process/:path*", destination: `${backend}/process/:path*` },
      { source: "/invoices/:path*", destination: `${backend}/invoices/:path*` },
      { source: "/invoice/:path*", destination: `${backend}/invoice/:path*` },
      { source: "/statistics", destination: `${backend}/statistics` },
      { source: "/categories", destination: `${backend}/categories` },
      { source: "/export/:path*", destination: `${backend}/export/:path*` },
      { source: "/evolution/:path*", destination: `${backend}/evolution/:path*` },
      { source: "/websocket/:path*", destination: `${backend}/websocket/:path*` }
    ];
  }
};

export default nextConfig;
