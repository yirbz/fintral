"use client";

import React from "react";
import { Check, ShoppingCart, ArrowUpRight, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanSummary } from "@/lib/api/plans";
import { PriceDisplay } from "@/components/ui/price-display";
import { Button } from "@/components/ui/button";
import { discountedPrice } from "./duration-selector";

interface PlanCardProps {
  plan: PlanSummary;
  currentPlan?: PlanSummary | null;
  onAddToCart: () => void;
  inCart: boolean;
  commitMonths: number;
}

export function PlanCard({
  plan,
  currentPlan,
  onAddToCart,
  inCart,
  commitMonths,
}: PlanCardProps) {
  const isCurrent = currentPlan?.id === plan.id;
  const isFeatured = plan.name.toLowerCase() === "profesional";
  
  // Clean up keys for display
  const features = plan.features
    ? Object.entries(plan.features)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/_/g, " "))
    : [];

  const rawMonthlyPrice = plan.price_monthly;
  const activeMonthlyPriceDop = discountedPrice(rawMonthlyPrice, commitMonths);
  const activeTotalPriceDop = activeMonthlyPriceDop * commitMonths;

  // Check if this plan is an upgrade/downgrade compared to current plan
  const isUpgrade = currentPlan && plan.price_monthly > currentPlan.price_monthly;
  const isDowngrade = currentPlan && plan.price_monthly < currentPlan.price_monthly;
  const currentPlanName = currentPlan?.display_name;

  // Set CTA text and state
  let ctaText = "Elegir este plan";
  if (isCurrent) {
    ctaText = "Tu plan actual";
  } else if (inCart) {
    ctaText = "En el carrito";
  } else if (isUpgrade) {
    ctaText = "Mejorar plan";
  } else if (currentPlan) {
    ctaText = "Cambiar plan";
  }

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border p-6 sm:p-7 transition-all duration-300",
        isFeatured
          ? "border-brand-primary bg-brand-ink text-white dark:border-sky-500/50 shadow-brand-lg plan-card-featured"
          : "border-brand-hairline bg-white hover:border-brand-primary/30 hover:shadow-elevated dark:border-slate-800 dark:bg-slate-900 plan-card",
        isCurrent && "ring-1 ring-brand-primary/20 dark:ring-sky-500/20"
      )}
    >
      {/* Featured Badge */}
      {isFeatured && (
        <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[10px] font-bold bg-brand-primary text-white tracking-widest uppercase shadow-md">
          ★ Más popular
        </span>
      )}

      {/* Current Plan Indicator */}
      {isCurrent && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
          Tu plan actual ✓
        </span>
      )}

      {/* Upgrade/Downgrade badges with proration info */}
      {isUpgrade && currentPlanName && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
          Mejorar
        </span>
      )}
      {isDowngrade && currentPlanName && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-full">
          Cambiar
        </span>
      )}

      {/* Plan Header */}
      <div className="space-y-4">
        <div>
          <h3 className={cn("text-lg font-medium", isFeatured ? "text-white" : "text-brand-ink dark:text-white")}>
            {plan.display_name}
          </h3>
          <p className={cn("text-xs mt-1.5 line-clamp-2 min-h-[32px]", isFeatured ? "text-slate-300" : "text-brand-ink-mute dark:text-slate-400")}>
            {plan.description}
          </p>
        </div>

        {/* Pricing Area */}
        <div className="py-2 border-t border-b border-dashed border-brand-hairline/60 dark:border-slate-800/60">
          {plan.is_enterprise ? (
            <span className={cn("text-xl font-light", isFeatured ? "text-white" : "text-brand-ink dark:text-white")}>
              Personalizado
            </span>
          ) : (
            <PriceDisplay
              amountDop={activeMonthlyPriceDop}
              period="mes"
              size="lg"
              className={isFeatured ? "text-white" : ""}
              amountClassName={isFeatured ? "text-white" : undefined}
            />
          )}

          {commitMonths > 1 && !plan.is_enterprise && (
            <div className="text-[10px] text-brand-ink-mute dark:text-slate-400 mt-1">
              Cobro único de <span className="font-semibold tabular-nums">RD$ {Math.round(activeTotalPriceDop).toLocaleString("es-DO")}</span> por {commitMonths} meses
            </div>
          )}
        </div>

        {/* Proration info between pricing and features */}
        {isUpgrade && currentPlanName && (
          <div className="mt-2 space-y-1 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-2 text-center">
            <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300">Actualizar plan</p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              Crédito del ciclo actual se aplicará automáticamente
            </p>
          </div>
        )}
        {isDowngrade && currentPlanName && (
          <div className="mt-2 space-y-1 rounded-lg bg-sky-50 dark:bg-sky-950/20 p-2 text-center">
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-300">Cambiar a este plan</p>
            <p className="text-[10px] text-sky-700 dark:text-sky-400">
              El cambio aplicará al siguiente ciclo de facturación
            </p>
          </div>
        )}

        {/* Features List */}
        <div className="space-y-2.5 pt-2">
          {features.slice(0, 7).map((feature) => (
            <div key={feature} className="flex items-start gap-2.5 text-xs">
              <Check className={cn("size-4 shrink-0 mt-0.5", isFeatured ? "text-sky-400" : "text-brand-primary dark:text-sky-500")} />
              <span className={cn("capitalize", isFeatured ? "text-slate-200" : "text-brand-ink-secondary dark:text-slate-300")}>
                {feature}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Plan footer details & CTA */}
      <div className="mt-8 space-y-3">
        <div className={cn("text-[10px]", isFeatured ? "text-slate-400" : "text-brand-ink-mute dark:text-slate-400")}>
          {plan.is_enterprise
            ? "Límites adaptados a tu negocio"
            : `${plan.limits?.max_ecf_monthly?.toLocaleString("es-DO") || 0} facturas/mes · ${plan.limits?.max_users || 0} usuarios`}
        </div>

        {plan.is_enterprise ? (
          <Button
            asChild
            variant="outline"
            className={cn(
              "w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm gap-1.5 active:scale-[0.98] transition-all duration-100 font-semibold",
              isFeatured ? "border-slate-700 hover:bg-slate-800 hover:text-white text-white" : ""
            )}
          >
            <a href="mailto:support@fintral.app?subject=Quiero%20información%20del%20plan%20Enterprise">
              <span>Contactar ventas</span>
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button
            onClick={onAddToCart}
            disabled={isCurrent}
            className={cn(
              "w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm gap-1.5 active:scale-[0.98] transition-all duration-100 font-semibold",
              isCurrent && "opacity-50 cursor-not-allowed",
              inCart
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : isFeatured
                ? "bg-white text-brand-ink hover:bg-slate-100"
                : "bg-brand-primary text-white hover:bg-brand-primary-deep"
            )}
          >
            {inCart && <Check className="size-4" />}
            {!inCart && !isCurrent && <ShoppingCart className="size-3.5" />}
            <span>{ctaText}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
