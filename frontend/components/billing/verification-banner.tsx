"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, XCircle, FileHeart } from "lucide-react";
import { billingApi, VerificationStatus } from "@/lib/api/billing";

export function VerificationBanner() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const data = await billingApi.getVerificationStatus();
        setStatus(data);
      } catch (err) {
        console.error("Error fetching verification status in banner:", err);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  if (loading || !status || status.is_ecf_authorized || status.certification_status === "certified") {
    return null;
  }

  const { certification_status } = status;

  let title = "Modo Factura Física (Límite DGII)";
  let description = "Tu organización aún no está certificada como emisor electrónico. Solo podrás registrar y emitir comprobantes físicos (prefijo B) y no electrónicos (e-CF).";
  let buttonText = "Certificar Empresa";
  let Icon = AlertTriangle;
  let bgClass = "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500";
  let buttonClass = "bg-amber-500 hover:bg-amber-600";

  if (certification_status === "company_registered") {
    title = "Registro de Empresa Completado";
    description = "Empresa registrada en Alanube. Sube tu certificado digital (.p12/.pfx) para continuar.";
    buttonText = "Subir Certificado";
    Icon = FileHeart;
    bgClass = "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400";
    buttonClass = "bg-indigo-500 hover:bg-indigo-600";
  } else if (certification_status === "certificate_uploaded") {
    title = "Certificado Digital Cargado";
    description = "Certificado digital cargado. Inicia las pruebas de certificación automáticas ante la DGII.";
    buttonText = "Iniciar Pruebas";
    Icon = CheckCircle2;
    bgClass = "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    buttonClass = "bg-emerald-500 hover:bg-emerald-600";
  } else if (certification_status === "set_test_running") {
    title = "Pruebas de Certificación en Progreso";
    description = "La DGII está validando los documentos de prueba enviados. Te notificaremos cuando terminen.";
    buttonText = "Ver Estado";
    Icon = Clock;
    bgClass = "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400";
    buttonClass = "bg-blue-500 hover:bg-blue-600";
  } else if (certification_status === "set_test_rejected") {
    title = "Pruebas no Aprobadas";
    description = "El set de pruebas automáticas no fue aprobado por la DGII. Revisa los detalles e intenta de nuevo.";
    buttonText = "Reintentar Pruebas";
    Icon = XCircle;
    bgClass = "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400";
    buttonClass = "bg-red-500 hover:bg-red-600";
  }

  return (
    <div className={`mx-4 md:mx-8 mt-4 p-3 border rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs ${bgClass}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="size-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <Link href="/billing/settings?tab=dgii" className="shrink-0">
        <button type="button" className={`flex items-center gap-1 text-white font-medium px-3 h-7 rounded text-[11px] transition-colors ${buttonClass}`}>
          {buttonText}
          <ArrowRight className="size-3" />
        </button>
      </Link>
    </div>
  );
}
