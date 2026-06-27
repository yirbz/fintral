"use client";

import React from "react";
import { Plus, Check, Loader2, Sparkles, HardDrive, Building2, Users, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface AddonItem {
  type: "ecf_blocks" | "ai" | "storage" | "entity_slot" | "user_slot" | string;
  label: string;
  description: string;
  priceUsd: number;
  priceDop: number;
  isPrepay: boolean;
  quantityLabel?: string;
  currentCount?: number;
}

interface AddonCardProps {
  addon: AddonItem;
  onAction: () => void;
  isLoading: boolean;
  inCart?: boolean;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  ecf_blocks: FileText,
  ai: Sparkles,
  storage: HardDrive,
  entity_slot: Building2,
  user_slot: Users,
};

export function AddonCard({
  addon,
  onAction,
  isLoading,
  inCart = false,
}: AddonCardProps) {
  const Icon = iconMap[addon.type] || FileText;

  return (
    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-6 shadow-xs hover:border-brand-primary/30 hover:shadow-brand transition-all duration-200 flex flex-col justify-between">
      <div className="space-y-3">
        {/* Icon & Label */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-secondary dark:text-slate-300">
            <Icon className="size-4.5" />
          </div>
          <h4 className="text-sm font-semibold text-brand-ink dark:text-white leading-none">
            {addon.label}
          </h4>
        </div>

        {/* Description */}
        <p className="text-xs text-brand-ink-mute dark:text-slate-400 leading-normal min-h-[32px]">
          {addon.description}
        </p>

        {/* Pricing */}
        <div className="pt-1.5 flex flex-col gap-0.5">
          <span className="text-lg font-light text-brand-ink dark:text-white tabular-nums">
            ${addon.priceUsd.toFixed(2)} USD
          </span>
          <span className="text-xs text-brand-ink-mute dark:text-slate-400 font-normal">
            Equivale a ~RD$ {Math.round(addon.priceDop).toLocaleString("es-DO")}{addon.isPrepay ? "" : "/mes"}
          </span>
        </div>

        {/* Current quantity info if post-pay */}
        {addon.currentCount !== undefined && addon.currentCount > 0 && (
          <span className="inline-block text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium leading-none">
            Tienes {addon.currentCount}
          </span>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {/* Helper info tag */}
        <span className="block text-[10px] text-brand-ink-mute dark:text-slate-400 leading-none">
          {addon.isPrepay 
            ? "Añadir para pagar hoy" 
            : "Pago diferido (cargado al mes)"
          }
        </span>

        {addon.isPrepay ? (
          <Button
            onClick={onAction}
            className={cn(
              "w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm gap-1.5 active:scale-[0.98] transition-all duration-100 font-semibold",
              inCart
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-brand-primary text-white hover:bg-brand-primary-deep"
            )}
          >
            {inCart ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            <span>{inCart ? "En el carrito" : "Añadir al carrito"}</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={onAction}
            disabled={isLoading}
            className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm gap-1.5 active:scale-[0.98] transition-all duration-100 font-semibold hover:bg-brand-canvas-soft dark:hover:bg-slate-800"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            <span>{isLoading ? "Activando..." : "Comprar 1 bloque"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
