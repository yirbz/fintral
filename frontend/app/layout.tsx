import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Providers } from "@/app/providers";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

const geistMono = GeistMono;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://fintral.do"),
  title: {
    default: "Fintral — Infraestructura fiscal automatizada para RD",
    template: "%s | Fintral"
  },
  description:
    "Convierte facturas físicas, PDFs y comprobantes en datos estructurados al instante. Visión artificial para extraer y validar contra la DGII.",
  keywords: [
    "DGII",
    "Facturación",
    "República Dominicana",
    "NCF",
    "e-NCF",
    "Automatización",
    "Fintech",
    "Contabilidad",
    "Reporte 606"
  ],
  authors: [{ name: "Fintral Team" }],
  creator: "Fintral",
  publisher: "Fintral",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "es_DO",
    url: "https://fintral.do",
    title: "Fintral — Infraestructura fiscal automatizada para RD",
    description: "Visión artificial para extraer facturas y validar NCFs contra la DGII.",
    siteName: "Fintral"
  },
  twitter: {
    card: "summary_large_image",
    title: "Fintral — Infraestructura fiscal automatizada para RD",
    description: "Visión artificial para extraer facturas y validar NCFs contra la DGII.",
    creator: "@fintral"
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn(inter.variable, geistMono.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
