"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, Sparkles, Scan, HardDrive, Code, AlertTriangle } from "lucide-react";
import { UsageSummary } from "@/lib/api/plans";
import { UsageAlert } from "./usage-alert";

interface UsageMetersProps {
  usage: UsageSummary | null;
}

interface MetricItem {
  key: string;
  label: string;
  used: number;
  limit: number;
  icon: React.ComponentType<any>;
  unit: string;
}

export function UsageMeters({ usage }: UsageMetersProps) {
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({});

  const metrics: MetricItem[] = usage
    ? [
        {
          key: "ecf",
          label: "Documentos e-CF",
          used: usage.ecf.used,
          limit: usage.ecf.limit,
          icon: FileText,
          unit: "documentos",
        },
        {
          key: "ai_queries",
          label: "Consultas de IA",
          used: usage.ai_queries.used,
          limit: usage.ai_queries.limit,
          icon: Sparkles,
          unit: "consultas",
        },
        {
          key: "ocr_docs",
          label: "Lectura OCR",
          used: usage.ocr_docs.used,
          limit: usage.ocr_docs.limit,
          icon: Scan,
          unit: "documentos",
        },
        {
          key: "storage_mb",
          label: "Almacenamiento",
          used: usage.storage_mb.used,
          limit: usage.storage_mb.limit,
          icon: HardDrive,
          unit: "MB",
        },
        {
          key: "api_calls",
          label: "Llamadas de API",
          used: usage.api_calls.used,
          limit: usage.api_calls.limit,
          icon: Code,
          unit: "llamadas",
        },
      ]
    : [];

  useEffect(() => {
    if (!usage) return;
    // Trigger animation after mount
    const timer = setTimeout(() => {
      const initial: Record<string, number> = {};
      const keys = ["ecf", "ai_queries", "ocr_docs", "storage_mb", "api_calls"] as const;
      keys.forEach((key) => {
        const item = usage[key];
        const pct = item.limit > 0 ? (item.used / item.limit) * 100 : 0;
        initial[key] = Math.min(pct, 100);
      });
      setAnimatedValues(initial);
    }, 100);
    return () => clearTimeout(timer);
  }, [usage]);

  if (!usage || metrics.length === 0) {
    return (
      <div className="text-center py-6 text-brand-ink-mute dark:text-slate-400 text-sm">
        No hay datos de consumo disponibles.
      </div>
    );
  }

  // Find any metrics exceeding 85% limit
  const criticalMetrics = metrics.filter((m) => m.limit > 0 && (m.used / m.limit) >= 0.85);

  return (
    <div className="space-y-6">
      {criticalMetrics.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <UsageAlert items={criticalMetrics} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {metrics.map((item) => {
          const Icon = item.icon;
          const percentage = item.limit > 0 ? (item.used / item.limit) * 100 : 0;
          const formattedPct = Math.round(percentage);
          const currentPct = animatedValues[item.key] || 0;

          // Determine progress bar color based on percentage
          let barColorClass = "bg-brand-primary"; // 0-60%
          let textThemeClass = "text-sky-600 dark:text-sky-400";
          if (percentage > 85) {
            barColorClass = "bg-red-500"; // 85-100%
            textThemeClass = "text-red-600 dark:text-red-400 font-semibold animate-pulse";
          } else if (percentage > 60) {
            barColorClass = "bg-amber-500"; // 60-85%
            textThemeClass = "text-amber-600 dark:text-amber-400 font-medium";
          }

          return (
            <div
              key={item.key}
              className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-xl p-5 shadow-xs hover:shadow-brand transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-secondary dark:text-slate-300">
                    <Icon className="size-4.5" />
                  </div>
                  <span className="text-sm font-medium text-brand-ink dark:text-slate-200">
                    {item.label}
                  </span>
                </div>
                <span className={cn("text-xs tabular-nums", textThemeClass)}>
                  {formattedPct}%
                </span>
              </div>

              {/* Progress Bar Container */}
              <div className="relative w-full h-2 bg-brand-canvas-soft dark:bg-slate-800 rounded-full overflow-hidden mb-3.5">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    barColorClass
                  )}
                  style={{ width: `${currentPct}%` }}
                />
              </div>

              {/* Resource Count details */}
              <div className="flex items-baseline justify-between text-xs text-brand-ink-mute dark:text-slate-400">
                <span>Consumido</span>
                <span className="font-medium text-brand-ink-secondary dark:text-slate-300 tabular-nums">
                  {item.used.toLocaleString("es-DO")} /{" "}
                  {item.limit === -1 || item.limit === 99999999
                    ? "Ilimitado"
                    : `${item.limit.toLocaleString("es-DO")} ${item.unit}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
