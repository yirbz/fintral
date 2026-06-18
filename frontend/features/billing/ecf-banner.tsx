"use client";

import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  FileText,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EcfBannerProps {
  isEcfAuthorized: boolean;
  certificationStatus?: string;
  isCertificationCompleted?: boolean;
}

export function EcfBanner({
  isEcfAuthorized,
  certificationStatus = "none",
  isCertificationCompleted = false,
}: EcfBannerProps) {
  if (isEcfAuthorized) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-emerald-500/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <ShieldCheck className="size-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-medium text-emerald-400">
                Emisor Electrónico Certificado
              </p>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px] h-4 px-1.5">
                e-CF
              </Badge>
            </div>
            <p className="text-xs text-emerald-400/70">
              Tus comprobantes se timbran automáticamente ante la DGII vía
              Alanube. Facturas bajo DOP$250,000 se aprueban al instante.
            </p>
          </div>
          <Link href="/billing/emit" passHref>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-emerald-500 text-white hover:bg-emerald-500/90 shrink-0"
            >
              <Zap className="size-3.5" />
              Nueva e-CF
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Not authorized — show onboarding or info
  if (!isCertificationCompleted && certificationStatus === "none") {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-amber-500/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <AlertTriangle className="size-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-400 mb-0.5">
              Facturación Tradicional
            </p>
            <p className="text-xs text-amber-400/70">
              Emites facturas con NCF físicos (no electrónicos).{" "}
              <Link
                href="/billing/settings"
                className="underline underline-offset-2 hover:text-amber-300"
              >
                Activar certificación electrónica
              </Link>{" "}
              para timbrar ante la DGII automáticamente.
            </p>
          </div>
          <Link href="/billing/quick" passHref>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 shrink-0"
            >
              <FileText className="size-3.5" />
              Nueva factura
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // In certification process
  return (
    <div className="rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/5 to-sky-500/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
          <Zap className="size-4 text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-sky-400 mb-0.5">
            Certificación electrónica en progreso
          </p>
          <p className="text-xs text-sky-400/70">
            Estás completando el proceso para ser emisor electrónico.
          </p>
        </div>
        <Link href="/billing/settings" passHref>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 shrink-0"
          >
            Continuar
            <ArrowRight className="size-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
