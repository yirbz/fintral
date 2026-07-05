"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/store/cart-context";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const { clearCart } = useCart();

  useEffect(() => {
    // Clear cart only on successful checkout landing
    clearCart();
  }, [clearCart]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-xl space-y-6 relative overflow-hidden">
        {/* Subtle decorative glowing background */}
        <div className="absolute -top-12 -left-12 size-32 bg-emerald-500/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -right-12 size-32 bg-brand-primary/10 rounded-full blur-2xl" />

        {/* Pulsing Success Icon */}
        <div className="flex justify-center relative">
          <div className="absolute size-16 bg-emerald-500/20 rounded-full animate-ping opacity-75" />
          <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-full size-16 flex items-center justify-center relative border border-emerald-500/20">
            <CheckCircle2 className="size-8" />
          </div>
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <ShieldCheck className="size-3" /> Pago Completado
          </span>
          <h1 className="text-2xl font-light text-slate-900 dark:text-white leading-tight">
            ¡Gracias por tu compra!
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            Tu pago ha sido procesado de forma segura y tus recursos han sido asignados correctamente a tu cuenta.
          </p>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-6 space-y-3">
          <Button
            onClick={() => { window.location.href = "/dashboard"; }}
            className="w-full h-11 rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100 shadow-sm gap-2"
          >
            <span>Ir al Panel de Control</span>
            <ArrowRight className="size-4" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => { window.location.href = "/dashboard/settings/organization"; }}
            className="w-full h-11 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            Ver detalles de mi suscripción
          </Button>
        </div>
      </div>
    </div>
  );
}
