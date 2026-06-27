"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  amountDop: number;      // pesos (e.g., 2999)
  amountUsd?: number;     // dollars (e.g., 44.99)
  period?: "mes" | "año" | string;
  size?: "lg" | "md" | "sm";
  showUsd?: boolean;
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

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PriceDisplay({
  amountDop,
  amountUsd,
  period,
  size = "md",
  showUsd = true,
  className,
  amountClassName,
}: PriceDisplayProps) {
  // Format DOP: e.g., RD$ 2,999 or RD$ 2,999.50
  const formatDop = (val: number) => {
    const formatter = val % 1 === 0 ? dopIntegerFormatter : dopDecimalFormatter;
    return formatter.format(val).replace("DOP", "RD$"); // Replace default code with RD$
  };

  // Format USD: e.g., $44.99 USD
  const formatUsd = (val: number) => {
    return `${usdFormatter.format(val)} USD`;
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

      {showUsd && amountUsd !== undefined && amountUsd > 0 && (
        <span
          className={cn(
            "text-brand-ink-mute dark:text-slate-400 tabular-nums font-normal",
            isLg ? "text-sm" : isSm ? "text-xs" : "text-xs"
          )}
        >
          ~{formatUsd(amountUsd)} con tarjeta
        </span>
      )}
    </div>
  );
}
