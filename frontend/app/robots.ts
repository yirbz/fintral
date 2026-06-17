import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/token",
          "/logout",
          "/_next/",
          "/pending-uploads/",
          "/dashboard/",
          "/billing/",
          "/admin/",
        ],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/docs", "/plans"],
        disallow: ["/api/", "/_next/", "/dashboard/", "/billing/", "/admin/"],
      },
      {
        userAgent: "CCBot",
        allow: ["/", "/docs", "/plans"],
        disallow: ["/api/", "/_next/", "/dashboard/", "/billing/", "/admin/"],
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/docs", "/plans"],
        disallow: ["/api/", "/_next/", "/dashboard/", "/billing/", "/admin/"],
      },
    ],
    sitemap: "https://www.fintral.app/sitemap.xml",
  };
}
