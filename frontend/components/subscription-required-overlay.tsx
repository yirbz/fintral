"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, LogOut, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyUserSubscription } from "@/lib/api/plans";

export default function SubscriptionRequiredOverlay() {
  const [active, setActive] = useState(false);
  const [graceHours, setGraceHours] = useState<number | null>(null);
  const router = useRouter();

  const handleEvent = useCallback(async (e: Event) => {
    setActive(true);
    const detail = (e as CustomEvent).detail;
    if (detail?.grace_hours) {
      setGraceHours(detail.grace_hours);
    } else {
      try {
        const res = await getMyUserSubscription();
        if (res.subscription?.grace_hours) {
          setGraceHours(res.subscription.grace_hours);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    window.addEventListener("billing:required", handleEvent);
    return () => window.removeEventListener("billing:required", handleEvent);
  }, [handleEvent]);

  if (!active) return null;

  if (graceHours && graceHours > 0) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
            <Clock className="size-6 text-amber-500" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Pago Pendiente
            </h2>
            <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground mt-1">
              No pudimos procesar el cobro de tu mensualidad. Tienes{" "}
              <strong className="text-foreground">{graceHours}h</strong> de
              gracia para actualizar tu método de pago antes de perder el acceso.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2.5 w-full">
            <Button
              onClick={() => {
                setActive(false);
                window.location.href = "/dashboard/cuenta";
              }}
              className="w-full h-10 rounded-xl text-sm font-medium"
            >
              <CreditCard className="mr-2 size-4" />
              Actualizar método de pago
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <AlertTriangle className="size-6 text-red-500" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Suscripción Vencida
          </h2>
          <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground mt-1">
            No pudimos procesar el cobro de tu mensualidad. Para seguir usando
            el Hub de Contabilidad, actualiza tu método de pago o liquida tus
            facturas pendientes.
          </p>
          <p className="text-xs text-muted-foreground/70 font-medium mt-2">
            Fintral Factura sigue siendo 100% gratuito.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2.5 w-full">
          <Button
            onClick={() => {
              setActive(false);
              window.location.href = "/dashboard/cuenta";
            }}
            className="w-full h-10 rounded-xl text-sm font-medium"
          >
            <CreditCard className="mr-2 size-4" />
            Actualizar método de pago
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
