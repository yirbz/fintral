"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, LogOut, Clock, Store, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyUserSubscription } from "@/lib/api/plans";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  initialExpired?: boolean;
  initialGraceHours?: number | null;
}

function formatRemaining(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function SubscriptionRequiredOverlay({ initialExpired, initialGraceHours }: Props) {
  const [active, setActive] = useState(false);
  const [graceHours, setGraceHours] = useState<number | null>(initialGraceHours ?? null);
  const [isExpired, setIsExpired] = useState(initialExpired ?? false);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await getMyUserSubscription();
      if (res.has_active_subscription) {
        setGraceHours(null);
        setIsExpired(false);
        setActive(false);
        window.dispatchEvent(new CustomEvent("billing:resolved"));
        toast.success("¡Suscripción activa! Gracias por tu pago.");
      } else {
        if (res.subscription?.grace_hours) {
          setGraceHours(res.subscription.grace_hours);
          setIsExpired(false);
        } else {
          setGraceHours(null);
          setIsExpired(true);
        }
        toast.info("Aún no se detecta tu pago activo. Si pagaste por transferencia, el equipo lo validará pronto.");
      }
    } catch {
      toast.error("No se pudo verificar el estado de la suscripción");
    } finally {
      setChecking(false);
    }
  };

  const handleEvent = useCallback(async (e: Event) => {
    setActive(true);
    const detail = (e as CustomEvent).detail;
    if (detail?.grace_hours !== undefined && detail?.grace_hours !== null) {
      setGraceHours(detail.grace_hours);
      setIsExpired(false);
    } else {
      try {
        const res = await getMyUserSubscription();
        if (res.subscription?.grace_hours) {
          setGraceHours(res.subscription.grace_hours);
          setIsExpired(false);
        } else {
          setGraceHours(null);
          setIsExpired(true);
        }
      } catch {
        setIsExpired(true);
      }
    }
  }, []);

  useEffect(() => {
    if (initialExpired) {
      setActive(true);
      setIsExpired(true);
    }
    if (initialGraceHours && initialGraceHours > 0) {
      setActive(true);
      setGraceHours(initialGraceHours);
      setIsExpired(false);
    }
  }, [initialExpired, initialGraceHours]);

  useEffect(() => {
    window.addEventListener("billing:required", handleEvent);
    return () => window.removeEventListener("billing:required", handleEvent);
  }, [handleEvent]);

  const goToTienda = () => {
    setActive(false);
    window.location.href = "/dashboard/tienda";
  };

  if (!active) return null;

  // ── Grace period: red banner with countdown ──
  if (graceHours && graceHours > 0) {
    return (
      <div className="sticky top-0 z-40 w-full bg-red-600 text-white shadow-lg">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="size-4 shrink-0" />
            <p className="truncate text-sm font-medium">
              Tu suscripción ha vencido. Tu cuenta será suspendida en un periodo de{" "}
              <strong>{formatRemaining(graceHours)}</strong>. Renueva tu plan de suscripción para seguir usando el Hub sin interrupciones.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={checkStatus}
              disabled={checking}
              size="sm"
              className="h-8 gap-1.5 rounded-lg border border-red-500 bg-red-700 text-white text-xs font-semibold hover:bg-red-800 disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
              Verificar estado
            </Button>
            <Button
              onClick={goToTienda}
              size="sm"
              className="h-8 gap-1.5 rounded-lg bg-white text-red-700 text-xs font-semibold hover:bg-red-50 shadow-xs"
            >
              <Store className="size-3.5" />
                  Actualizar método de pago
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActive(false);
                window.location.href = "/logout";
              }}
              className="h-8 text-xs text-red-100 hover:text-white hover:bg-red-700"
            >
              <LogOut className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Expired: orange banner ──
  return (
    <div className="sticky top-0 z-40 w-full bg-orange-600 text-white shadow-lg">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className="size-4 shrink-0" />
          <p className="truncate text-sm font-medium">
            Tu suscripción ha vencido. Para seguir usando el Hub de Contabilidad, elige un plan y actualiza tu método de pago.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            onClick={checkStatus}
            disabled={checking}
            size="sm"
            className="h-8 gap-1.5 rounded-lg border border-orange-500 bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
            Verificar estado
          </Button>
          <Button
            onClick={goToTienda}
            size="sm"
            className="h-8 gap-1.5 rounded-lg bg-white text-orange-700 text-xs font-semibold hover:bg-orange-50 shadow-xs"
          >
            <Store className="size-3.5" />
            Actualizar método de pago
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActive(false);
              window.location.href = "/logout";
            }}
            className="h-8 text-xs text-orange-100 hover:text-white hover:bg-orange-700"
          >
            <LogOut className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
