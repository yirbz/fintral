"use client";

import { useRouter } from "next/navigation";
import { XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentFailedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-xl space-y-6 relative overflow-hidden">
        {/* Subtle decorative glowing background */}
        <div className="absolute -top-12 -left-12 size-32 bg-red-500/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -right-12 size-32 bg-amber-500/10 rounded-full blur-2xl" />

        {/* Failed Icon */}
        <div className="flex justify-center">
          <div className="p-4 bg-red-500/10 text-red-500 rounded-full size-16 flex items-center justify-center border border-red-500/20">
            <XCircle className="size-8" />
          </div>
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
            <AlertTriangle className="size-3" /> Transacción Fallida
          </span>
          <h1 className="text-2xl font-light text-slate-900 dark:text-white leading-tight">
            No se pudo completar el pago
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            La transacción fue declinada por la pasarela de pago o el banco emisor. Por favor, verifica los datos de tu tarjeta o intenta con otro método de pago.
          </p>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-6 space-y-3">
          <Button
            onClick={() => router.push("/dashboard/tienda/checkout")}
            className="w-full h-11 rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100 shadow-sm gap-2"
          >
            <RefreshCw className="size-4 shrink-0" />
            <span>Reintentar Pago</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/tienda")}
            className="w-full h-11 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            Volver a la Tienda
          </Button>
        </div>
      </div>
    </div>
  );
}
