"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";

interface CartSummaryProps {
  total: number;
  currency: string;
  months: number;
  discount: number;
  monthlyTotal: number;
}

export function CartSummary({
  total,
  currency = "DOP",
  months,
  discount,
  monthlyTotal,
}: CartSummaryProps) {
  const formatAmount = (val: number, curr: string) => {
    return val.toLocaleString("es-DO", {
      style: "currency",
      currency: curr || "DOP",
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    });
  };

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
