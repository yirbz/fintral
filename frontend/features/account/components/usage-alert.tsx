"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface UsageAlertItem {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface UsageAlertProps {
  items: UsageAlertItem[];
}

export function UsageAlert({ items }: UsageAlertProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4.5 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-sm font-semibold leading-none">Límites de consumo altos</h4>
          <p className="text-xs text-amber-800 dark:text-amber-400">
            Has superado el 85% de capacidad en:{" "}
            <span className="font-semibold">
              {items.map((item) => item.label).join(", ")}
            </span>
            . Adquiere más capacidad para evitar interrupciones en tus operaciones.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/tienda"
        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors shrink-0 group"
      >
        <span>Ir a la tienda</span>
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
