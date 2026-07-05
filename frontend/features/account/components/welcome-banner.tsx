"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WelcomeBannerProps {
  planName?: string;
}

export function WelcomeBanner({ planName = "Profesional" }: WelcomeBannerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [bannerType, setBannerType] = useState<"success" | "transfer" | null>(null);

  useEffect(() => {
    const bienvenido = searchParams.get("bienvenido");
    const comprobante = searchParams.get("comprobante");

    if (bienvenido === "true") {
      setBannerType("success");
      setIsVisible(true);
    } else if (comprobante === "enviado") {
      setBannerType("transfer");
      setIsVisible(true);
    }
  }, [searchParams]);

  const handleDismiss = () => {
    setIsVisible(false);
    // Remove query params from URL without reloading
    const params = new URLSearchParams(window.location.search);
    params.delete("bienvenido");
    params.delete("comprobante");
    const newRelativePathQuery = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    router.replace(newRelativePathQuery);
  };

  if (!isVisible || !bannerType) return null;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 p-4 rounded-xl border transition-all duration-300 animate-in fade-in slide-in-from-top-4",
        bannerType === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300"
          : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-300"
      )}
    >
      {bannerType === "success" ? (
        <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <Info className="size-5 text-brand-primary dark:text-sky-400 shrink-0 mt-0.5" />
      )}

      <div className="space-y-1 pr-6 flex-1">
        <h4 className="text-sm font-semibold leading-none">
          {bannerType === "success" ? "¡Listo! Tu plan ya está activo" : "Comprobante de pago recibido"}
        </h4>
        <p className="text-xs opacity-90">
          {bannerType === "success"
            ? `¡Bienvenido! Tu plan ${planName} se ha activado de forma inmediata. Ya puedes hacer uso de todas tus herramientas.`
            : "Hemos recibido tu comprobante de transferencia bancaria de forma correcta. Nuestro equipo lo validará en menos de 24 horas laborables y activará tus servicios."}
        </p>
      </div>

      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-current opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
