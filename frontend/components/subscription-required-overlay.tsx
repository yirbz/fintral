"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

function FintralLogo() {
  return (
    <div className="flex flex-col gap-[5px] items-center">
      <div className="h-[3.5px] w-7 rounded-sm bg-indigo-500" />
      <div className="h-[3.5px] w-5 rounded-sm bg-indigo-400" />
      <div className="h-[3.5px] w-[11px] rounded-sm bg-indigo-300/60" />
    </div>
  );
}

export default function SubscriptionRequiredOverlay() {
  const [active, setActive] = useState(false);
  const router = useRouter();

  const handleEvent = useCallback(() => {
    setActive(true);
  }, []);

  useEffect(() => {
    window.addEventListener("billing:required", handleEvent);
    return () => window.removeEventListener("billing:required", handleEvent);
  }, [handleEvent]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
          <Sparkles className="size-6 text-indigo-500 animate-pulse" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2.5 mb-2">
            <FintralLogo />
            <span className="text-sm font-medium tracking-tight text-foreground/60">Fintral</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Suscripción Requerida
          </h2>
          <p className="max-w-[32ch] text-sm leading-relaxed text-muted-foreground mt-1">
            El período de prueba de 7 días ha finalizado. Para seguir usando el Hub de Contabilidad y sus integraciones, por favor activa tu suscripción.
          </p>
          <p className="text-xs text-indigo-500/80 font-medium mt-2">
            💡 Nota: Fintral Factura sigue siendo 100% gratuito.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2.5 w-full">
          <Button
            onClick={() => {
              setActive(false);
              window.location.href = "/plans";
            }}
            className="w-full h-10 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <CreditCard className="mr-2 size-4" />
            Ver Planes de Suscripción
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setActive(false);
              window.location.href = "/logout";
            }}
            className="w-full h-8 text-xs text-muted-foreground gap-1.5 hover:bg-muted"
          >
            <LogOut className="size-3" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
