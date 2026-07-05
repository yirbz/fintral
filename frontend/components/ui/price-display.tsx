"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  amountDop: number;
  period?: "mes" | "año" | string;
  size?: "lg" | "md" | "sm";
  className?: string;
  amountClassName?: string;
}

const dopIntegerFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dopDecimalFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PriceDisplay({
  amountDop,
  period,
  size = "md",
  className,
  amountClassName,
}: PriceDisplayProps) {
  const formatDop = (val: number) => {
    const formatter = val % 1 === 0 ? dopIntegerFormatter : dopDecimalFormatter;
    return formatter.format(val).replace("DOP", "RD$");
  };

  const isLg = size === "lg";
  const isSm = size === "sm";

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-light tracking-tight tabular-nums",
            amountClassName || "text-brand-ink dark:text-white",
            isLg ? "text-3xl font-normal" : isSm ? "text-base font-semibold" : "text-xl font-medium"
          )}
        >
          {formatDop(amountDop)}
        </span>
        {period && (
          <span className="text-sm text-brand-ink-mute dark:text-slate-400 font-normal">
            /{period}
          </span>
        )}
      </div>
    </div>
  );
}
