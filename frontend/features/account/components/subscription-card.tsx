"use client";

import React from "react";
import Link from "next/link";
import { CreditCard, ArrowRightLeft, ExternalLink, Calendar, HelpCircle } from "lucide-react";
import { PlanSummary, SubscriptionSummary } from "@/lib/api/plans";
import { SubscriptionBadge } from "./subscription-badge";
import { PriceDisplay } from "@/components/ui/price-display";
import { Button } from "@/components/ui/button";

interface SubscriptionCardProps {
  plan: PlanSummary | null;
  subscription: SubscriptionSummary | null;
  orgId: string;
  onManagePortal: () => void;
  isPortalLoading: boolean;
}

export function SubscriptionCard({
  plan,
  subscription,
  orgId,
  onManagePortal,
  isPortalLoading,
}: SubscriptionCardProps) {
  if (!subscription || !plan) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
        <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 size-12 mx-auto flex items-center justify-center">
          <HelpCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-brand-ink dark:text-slate-200">
            Sin plan activo
          </h3>
          <p className="text-sm text-brand-ink-mute dark:text-slate-400 max-w-sm mx-auto">
            Aún no tienes una suscripción activa para esta organización.
          </p>
        </div>
        <Button asChild className="h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100">
          <Link href="/dashboard/tienda">
            <span>Ver planes disponibles</span>
            <ArrowRightLeft className="size-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    );
  }

  // Format date helper: "20 de junio, 2026"
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-DO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const isAutomatic = subscription.paddle_collection_mode === "automatic";
  const nextBillingDate = subscription.billing_cycle_end;

  return (
    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:shadow-brand">
      <div className="p-6 sm:p-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-brand-primary dark:text-sky-400 uppercase tracking-widest">
              Plan Actual
            </span>
            <h3 className="text-2xl font-light text-brand-ink dark:text-white">
              {plan.display_name}
            </h3>
          </div>
          <div>
            <SubscriptionBadge status={subscription.status} size="md" />
          </div>
        </div>

        {/* Pricing & Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-brand-hairline dark:border-slate-800/60">
          <div>
            <span className="text-xs text-brand-ink-mute dark:text-slate-400 block mb-1">
              Precio del plan
            </span>
            <PriceDisplay
              amountDop={plan.price_monthly}
              amountUsd={plan.price_monthly ? plan.price_monthly / 60 : undefined} // approximate USD fallback if not set
              period="mes"
              size="lg"
            />
          </div>

          <div className="space-y-4">
            {/* Cycle Details */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 shrink-0">
                <Calendar className="size-4" />
              </div>
              <div>
                <span className="text-xs text-brand-ink-mute dark:text-slate-400 block leading-none mb-1">
                  Próximo cobro
                </span>
                <span className="text-sm font-medium text-brand-ink-secondary dark:text-slate-200">
                  {formatDate(nextBillingDate)}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 shrink-0">
                <CreditCard className="size-4" />
              </div>
              <div>
                <span className="text-xs text-brand-ink-mute dark:text-slate-400 block leading-none mb-1">
                  Método de pago
                </span>
                <span className="text-sm font-medium text-brand-ink-secondary dark:text-slate-200">
                  {isAutomatic ? "Tarjeta de crédito/débito" : "Transferencia bancaria"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3.5 pt-4 border-t border-brand-hairline dark:border-slate-800/60">
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold hover:bg-brand-canvas-soft hover:text-brand-ink transition-all active:scale-[0.98] duration-100"
          >
            <Link href="/dashboard/tienda">
              <ArrowRightLeft className="size-4 mr-2" />
              <span>Cambiar plan</span>
            </Link>
          </Button>

          {isAutomatic && (
            <Button
              onClick={onManagePortal}
              disabled={isPortalLoading}
              className="w-full sm:w-auto h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold bg-brand-ink text-white hover:bg-brand-ink-secondary dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-[0.98] transition-all duration-100"
            >
              <CreditCard className="size-4 mr-2" />
              <span>{isPortalLoading ? "Cargando portal..." : "Gestionar método de pago"}</span>
              <ExternalLink className="size-3.5 ml-1.5 text-slate-400" />
            </Button>
          )}

          {!isAutomatic && (
            <Button
              asChild
              className="w-full sm:w-auto h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
            >
              <Link href="/dashboard/cuenta/estado">
                <span>Pagar estado de cuenta</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
