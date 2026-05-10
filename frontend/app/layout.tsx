import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Providers } from "@/app/providers";
import { cn } from "@/lib/utils";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Fintral — Financial infrastructure",
  description: "AI-powered invoice processing for Dominican Republic fiscal compliance (DGII)"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn(figtree.variable, geistMono.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}