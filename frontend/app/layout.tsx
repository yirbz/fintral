import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: "#533afd",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.fintral.app"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fintral",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
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
    "Reporte 606",
    "ITBIS",
    "e-CF",
    "Formato 606",
    "Formato 607",
    "Formato 608",
    "Factura electrónica RD",
    "Cumplimiento fiscal RD",
  ],
  authors: [{ name: "Fintral Team" }],
  creator: "Fintral",
  publisher: "Fintral",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "https://www.fintral.app",
  },
  openGraph: {
    type: "website",
    locale: "es_DO",
    url: "https://www.fintral.app",
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
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://www.fintral.app/#organization",
                  name: "Fintral",
                  url: "https://www.fintral.app",
                  logo: "https://www.fintral.app/icons/icon-512.png",
                  sameAs: [
                    "https://x.com/fintral",
                    "https://www.linkedin.com/company/fintral",
                  ],
                  description:
                    "Infraestructura fiscal automatizada para República Dominicana. Facturación electrónica DGII, OCR, ITBIS y cumplimiento fiscal.",
                  areaServed: { "@type": "Country", name: "DO" },
                },
                {
                  "@type": "WebSite",
                  "@id": "https://www.fintral.app/#website",
                  url: "https://www.fintral.app",
                  name: "Fintral",
                  description:
                    "Automatización de facturación electrónica y cumplimiento DGII para empresas en República Dominicana.",
                  publisher: { "@id": "https://www.fintral.app/#organization" },
                  inLanguage: "es-DO",
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": "https://www.fintral.app/#software",
                  name: "Fintral",
                  operatingSystem: "Web",
                  applicationCategory: "BusinessApplication",
                  offers: {
                    "@type": "AggregateOffer",
                    priceCurrency: "DOP",
                    lowPrice: "350",
                    offerCount: "4",
                  },
                  description:
                    "Plataforma todo-en-uno de facturación electrónica DGII, OCR de facturas, ITBIS, NCF y cumplimiento fiscal.",
                  areaServed: { "@type": "Country", name: "DO" },
                },
                {
                  "@type": "FAQPage",
                  "@id": "https://www.fintral.app/#faq",
                  mainEntity: [
                    {
                      "@type": "Question",
                      name: "¿Qué es Fintral?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Fintral es una plataforma que automatiza la facturación electrónica (e-CF), el cumplimiento DGII (Formato 606/607/608), el cálculo de ITBIS y la conciliación de NCF para empresas en República Dominicana.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "¿Cómo funciona el OCR de facturas?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Sube imágenes, PDFs o Excel de facturas. Nuestro pipeline usa visión artificial (OpenCV + Tesseract) para extraer RNC, NCF, fechas, montos e ITBIS automáticamente. Si la confianza es baja, usamos IA (Gemini/OpenAI) como respaldo.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "¿Fintral es compatible con la DGII?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Sí. Fintral está diseñado específicamente para el cumplimiento fiscal de la DGII en República Dominicana, incluyendo e-CF, NCF, Formato 606/607/608 e ITBIS.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "¿Necesito crear una cuenta para usar la facturación?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "No. El portal público de facturación en /billing permite emitir facturas electrónicas DGII sin necesidad de registro. Para funciones avanzadas (OCR, dashboard, reportes), sí necesitas una cuenta.",
                      },
                    },
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

