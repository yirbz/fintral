"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const COMMIT_OPTIONS = [
  { months: 1, label: "1 mes", discount: 0, isBest: false },
  { months: 3, label: "3 meses", discount: 3, isBest: false },
  { months: 6, label: "6 meses", discount: 5, isBest: false },
  { months: 12, label: "12 meses", discount: 10, isBest: true },
] as const;

interface DurationSelectorProps {
  value: number;
  onChange: (months: number) => void;
  className?: string;
}

export function DurationSelector({
  value,
  onChange,
  className,
}: DurationSelectorProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <label className="text-xs font-semibold uppercase tracking-wider text-brand-ink-mute dark:text-slate-400">
        Duración del plan
      </label>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COMMIT_OPTIONS.map((opt) => {
          const isActive = value === opt.months;
          
          return (
            <button
              key={opt.months}
              type="button"
              onClick={() => onChange(opt.months)}
              className={cn(
                "relative flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all duration-200 active:scale-97 select-none",
                isActive
                  ? "border-brand-primary bg-sky-50/50 text-brand-ink dark:border-sky-500/50 dark:bg-sky-950/20 dark:text-white ring-1 ring-brand-primary/20"
                  : "border-brand-hairline bg-white hover:border-brand-primary/30 hover:bg-brand-canvas-soft/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50 text-brand-ink-secondary dark:text-slate-300"
              )}
            >
              {/* "Mejor precio" Tag */}
              {opt.isBest && (
                <span className="absolute -top-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-white shadow-sm tracking-wide">
                  Mejor precio 🏷️
                </span>
              )}

              <span className="text-sm font-semibold">{opt.label}</span>
              
              {opt.discount > 0 ? (
                <span
                  className={cn(
                    "text-[10px] mt-1.5 px-1.5 py-0.5 rounded-md font-medium tracking-wide",
                    isActive
                      ? "bg-brand-primary/15 text-brand-primary dark:bg-sky-500/15 dark:text-sky-400"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  )}
                >
                  Ahorra {opt.discount}%
                </span>
              ) : (
                <span className="text-[10px] mt-1.5 px-1.5 py-0.5 rounded-md font-medium text-brand-ink-mute dark:text-slate-500">
                  Sin compromiso
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function discountedPrice(price: number, months: number): number {
  const tier = COMMIT_OPTIONS.find((o) => o.months === months);
  return price * (1 - (tier?.discount ?? 0) / 100);
}
