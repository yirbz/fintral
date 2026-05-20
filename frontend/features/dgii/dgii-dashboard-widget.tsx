"use client";

import { useEffect, useState } from "react";
import { Calendar, FileText, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDgiiPendingSummary, type DgiiPendingSummary } from "@/lib/api/dgii";
import { cn } from "@/lib/utils";

const FORMAT_CONFIG: Record<string, { label: string; color: string }> = {
  "606": { label: "Compras", color: "bg-blue-500" },
  "607": { label: "Ventas", color: "bg-emerald-500" },
  "608": { label: "Anulaciones", color: "bg-red-500" },
};

export function DgiiDashboardWidget() {
  const [summary, setSummary] = useState<DgiiPendingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDgiiPendingSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3 w-40 rounded-md mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const maxCount = Math.max(...Object.values(summary.by_format), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-3.5 text-primary" />
            DGII — Próximos reportes
          </CardTitle>
          <CardDescription className="text-xs">
            Facturas pendientes de envío
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(FORMAT_CONFIG).map(([fmt, cfg]) => {
          const count = summary.by_format[fmt] ?? 0;
          const pct = (count / maxCount) * 100;
          return (
            <div key={fmt}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {fmt} {cfg.label}
                </span>
                <span className={cn(
                  "text-xs font-semibold tabular-nums",
                  count > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {count}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", cfg.color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {summary.total_pending > 0 && (
          <div className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground border-t border-border">
            <Calendar className="size-3" />
            Vence el{" "}
            {new Date(summary.next_deadline + "T12:00:00").toLocaleDateString("es-DO", {
              day: "numeric",
              month: "long",
            })}
            {summary.past_due_count > 0 && (
              <span className="text-amber-600 font-medium">
                · {summary.past_due_count} vencidas
              </span>
            )}
          </div>
        )}

        <Link href="/dashboard/dgii" className="block pt-1">
          <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
            Ir a DGII
            <ArrowUpRight className="size-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
