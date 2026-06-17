import { headers } from "next/headers";

export default async function manifest() {
  const h = await headers();
  const hostname = h.get("host") || "";
  const isBilling = hostname.startsWith("factura.");

  if (isBilling) {
    return {
      name: "Fintral Factura — Facturación Electrónica",
      short_name: "Fintral Factura",
      description: "Emite y gestiona facturas electrónicas con cumplimiento DGII",
      start_url: "/",
      display: "standalone" as const,
      orientation: "any" as const,
      background_color: "#09090b",
      theme_color: "#0ea5e9",
      categories: ["business", "finance"],
      scope: "/",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/icon-maskable-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
  }

  return {
    name: "Fintral — Infraestructura Fiscal Automatizada para RD",
    short_name: "Fintral",
    description: "Plataforma de facturación electrónica y contabilidad",
    start_url: "/login",
    display: "standalone" as const,
    orientation: "any" as const,
    background_color: "#0a0a0f",
    theme_color: "#533afd",
    categories: ["business", "finance"],
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
