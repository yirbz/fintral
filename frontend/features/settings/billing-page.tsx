"use client";

import { useQuery } from "@tanstack/react-query";
import { getStatistics } from "@/lib/api/statistics";
import type { StatisticsPayload } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function LimitRow({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground min-w-[4rem] text-right">
        {unit}{used.toFixed(1)} / {unit}{limit}
      </span>
    </div>
  );
}

export function BillingPage() {
  const statsQuery = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") });
  const stats = statsQuery.data as StatisticsPayload | undefined;

  if (statsQuery.isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-4 w-24 rounded-md" /><Skeleton className="h-3 w-56 rounded-md" /></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-20 rounded-lg" />))}</div>
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Facturación</CardTitle>
        <CardDescription className="text-xs">Plan actual, uso y límites del período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="default" className="mb-2">Plan Pro</Badge>
              <p className="text-sm font-heading font-semibold">Procesamiento IA + WhatsApp</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Incluye OpenAI, Evolution API, exportaciones DGII y soporte prioritario.</p>
            </div>
            <Button variant="outline" size="sm" disabled>Cambiar plan</Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Facturas procesadas</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">{stats?.queue.processed_total ?? 0}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">este período</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Cola pendiente</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">{stats?.queue.pending ?? 0}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">por procesar</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Costo IA</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">${stats?.costs.total_cost.toFixed(2) ?? "0.00"}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">total acumulado</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-foreground mb-3">Límites del plan</p>
          <div className="flex flex-col gap-2">
            <LimitRow label="Documentos / mes" used={stats?.queue.processed_total ?? 0} limit={500} />
            <LimitRow label="Costo IA / día" used={stats?.costs.total_cost ?? 0} limit={10} unit="$" />
            <LimitRow label="API requests / hora" used={stats?.queue.pending ?? 0} limit={100} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
