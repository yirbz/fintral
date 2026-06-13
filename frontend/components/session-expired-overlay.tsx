"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogIn, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function FintralLogo() {
  return (
    <div className="flex flex-col gap-[5px] items-center">
      <div className="h-[3.5px] w-7 rounded-sm bg-sky-400" />
      <div className="h-[3.5px] w-5 rounded-sm bg-sky-300" />
      <div className="h-[3.5px] w-[11px] rounded-sm bg-sky-200/60" />
    </div>
  );
}

export default function SessionExpiredOverlay() {
  const [expired, setExpired] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const router = useRouter();

  const handleEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setLastPath(detail?.path ?? null);
    setExpired(true);
  }, []);

  useEffect(() => {
    window.addEventListener("auth:unauthorized", handleEvent);
    return () => window.removeEventListener("auth:unauthorized", handleEvent);
  }, [handleEvent]);

  if (!expired) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
          <AlertTriangle className="size-6 text-amber-500" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2.5 mb-2">
            <FintralLogo />
            <span className="text-sm font-medium tracking-tight text-foreground/60">Fintral</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Sesión expirada
          </h2>
          <p className="max-w-[28ch] text-sm leading-relaxed text-muted-foreground">
            Tu sesión ha expirado. Inicia sesión nuevamente para continuar.
          </p>
          {lastPath && (
            <p className="text-[11px] text-muted-foreground/50 font-mono truncate max-w-full mt-1">
              {lastPath}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-2.5 w-full">
          <Button
            onClick={() => { window.location.href = "/login"; }}
            className="w-full h-10 rounded-xl text-sm font-medium"
          >
            <LogIn className="mr-2 size-4" />
            Ir a iniciar sesión
          </Button>
          <Button
            variant="ghost"
            onClick={() => { window.location.reload(); }}
            size="sm"
            className="h-8 text-xs text-muted-foreground gap-1.5"
          >
            <RefreshCw className="size-3" />
            Intentar de nuevo
          </Button>
        </div>
      </div>
    </div>
  );
}
