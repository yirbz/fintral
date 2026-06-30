"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CartBreakdownItem } from "@/lib/api/plans";

interface CartSummaryProps {
  total: number;
  currency: string;
  months: number;
  discount: number;
  monthlyTotal: number;
  breakdown?: CartBreakdownItem[];
}

export function CartSummary({
  total,
  currency = "DOP",
  months,
  discount,
  monthlyTotal,
  breakdown,
}: CartSummaryProps) {
  const formatAmount = (val: number, curr: string) => {
    return val.toLocaleString("es-DO", {
      style: "currency",
      currency: curr || "DOP",
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    });
  };

  const proratedItems = breakdown?.filter((i) => i.prorated) ?? [];

  return (
    <div className="space-y-3.5 bg-brand-canvas-soft/30 dark:bg-slate-900/30 p-4.5 rounded-xl border border-brand-hairline dark:border-slate-800/80">
      {/* Subtotal before discounts */}
      {discount > 0 && (
        <div className="flex items-center justify-between text-xs text-brand-ink-mute dark:text-slate-400">
          <span>Subtotal</span>
          <span className="font-mono tabular-nums">
            {formatAmount(total / (1 - discount), currency)}
          </span>
        </div>
      )}

      {/* Discount info */}
      {discount > 0 && (
        <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <span>Descuento por duración ({Math.round(discount * 100)}%)</span>
          <span className="font-mono tabular-nums">
            -{formatAmount((total / (1 - discount)) * discount, currency)}
          </span>
        </div>
      )}

      {/* Adjusted-period items */}
      {proratedItems.length > 0 && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-ink-mute">
            <span>Ajuste del período</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 text-brand-ink-mute/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
                  Corresponde a los días restantes de tu ciclo de facturación actual.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {proratedItems.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-brand-ink-secondary dark:text-slate-300">
                  {item.label}
                  {item.quantity > 1 && <span className="text-brand-ink-mute ml-1">×{item.quantity}</span>}
                </span>
                <span className="font-mono tabular-nums text-brand-ink-secondary dark:text-slate-300">
                  {formatAmount(item.total, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-brand-ink-mute dark:text-slate-500 pl-0.5">
                <span>
                  {item.days_remaining} de {item.cycle_days} días del período
                </span>
                <span className="text-amber-600 dark:text-amber-400">ajustado</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Commitment months detail */}
      {months > 1 && (
        <div className="flex items-center justify-between text-[11px] text-brand-ink-mute dark:text-slate-400">
          <span>Compromiso de {months} meses</span>
          <span className="font-mono tabular-nums">
            {formatAmount(monthlyTotal, currency)}/mes
          </span>
        </div>
      )}

      <Separator className="bg-brand-hairline dark:bg-slate-800" />

      {/* Final Total */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-brand-ink dark:text-white">Total</span>
          <span className="font-mono font-bold text-brand-primary dark:text-sky-400 text-base tabular-nums">
            {formatAmount(total, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
