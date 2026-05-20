"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Brain, Coins, FileText, Layers, ArrowUpRight, Zap } from "lucide-react";

import { getStatistics } from "@/lib/api/statistics";
import { listInvoices } from "@/lib/api/invoices";
import { useRealtime } from "@/hooks/use-realtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { DgiiDashboardWidget } from "@/features/dgii/dgii-dashboard-widget";

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") });
  const invoices = useQuery({ queryKey: ["invoices", "dashboard"], queryFn: () => listInvoices() });
  const { events, connected } = useRealtime();
  const loading = stats.isLoading || stats.isFetching;

  const data = stats.data;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-5 bottom-0 h-24 w-24 rounded-full bg-primary/8 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="size-4 text-primary" />
              <p className="text-xs font-medium text-primary">Centro de Control</p>
            </div>
            <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">Motor de Procesamiento IA</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Monitoreo operativo en tiempo real</p>
          </div>
          <Badge variant={connected ? "default" : "secondary"} className="gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/50"}`} />
            {connected ? "Activo" : "Sin conexión"}
          </Badge>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Cola pendiente"
              value={String(data?.queue.pending ?? 0)}
              description="Documentos en espera"
              icon={<Layers className="size-4" />}
              color="sky"
            />
            <StatCard
              label="Procesadas hoy"
              value={String(data?.performance.daily_processed ?? 0)}
              description="Últimas 24 horas"
              icon={<Activity className="size-4" />}
              color="emerald"
            />
            <StatCard
              label="Confianza promedio"
              value={`${Math.round((data?.performance.avg_confidence ?? 0) * 100)}%`}
              description="Calidad de extracción"
              icon={<Brain className="size-4" />}
              color="amber"
            />
            <StatCard
              label="Costo promedio"
              value={`$${(data?.costs.avg_cost_per_doc ?? 0).toFixed(4)}`}
              description="Por documento"
              icon={<Coins className="size-4" />}
              color="rose"
            />
          </>
        )}
      </div>

      {/* Activity + Live + DGII */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Actividad reciente</CardTitle>
                <CardDescription className="text-xs">Últimas facturas procesadas</CardDescription>
              </div>
              {!invoices.isLoading && (invoices.data?.invoices ?? []).length > 0 && (
                <Link href="/dashboard/invoices">
                  <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground hover:text-primary">
                    Ver todo
                    <ArrowUpRight className="size-3" />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {invoices.isLoading ? (
              <div className="flex flex-col gap-1.5 py-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-2 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-36 rounded-md" />
                        <Skeleton className="h-3 w-24 rounded-md" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                ))}
              </div>
            ) : (invoices.data?.invoices ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <FileText className="size-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Sin actividad reciente</p>
                <p className="mt-1.5 max-w-[240px] text-xs text-muted-foreground leading-relaxed">
                  Sube tu primera factura para comenzar a ver actividad aquí.
                </p>
                <Link href="/dashboard/upload" className="mt-5">
                  <Button size="sm" className="gap-1.5 shadow-sm">
                    <FileText className="size-3.5" />
                    Subir factura
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col">
                {(invoices.data?.invoices ?? []).slice(0, 8).map((invoice, idx) => (
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    className="group -mx-2 flex items-center justify-between rounded-lg px-3 py-2.5 text-xs transition-colors hover:bg-accent"
                    key={invoice.id}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ring-2 ring-background ${invoice.processed ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <div>
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors">{invoice.vendor_name || "Procesando..."}</p>
                        <p className="text-muted-foreground">{invoice.invoice_number || "Sin NCF"} · #{invoice.id}</p>
                      </div>
                    </div>
                    <Badge variant={invoice.processed ? "default" : "secondary"} className="text-[10px]">
                      {invoice.processed ? "Procesado" : "Pendiente"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-sm font-heading">Actividad en vivo</CardTitle>
              <CardDescription className="text-xs">Eventos del sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="max-h-80 flex flex-col gap-2 overflow-auto pr-1">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Activity className="size-4 text-primary" />
                </div>
                <p className="text-xs font-medium text-foreground">Sin eventos</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Los eventos aparecerán aquí en tiempo real.</p>
              </div>
            ) : null}
            {events.slice(0, 20).map((event, idx) => (
              <div
                className="rounded-lg border border-border/60 bg-accent/40 p-2.5 text-xs transition-all hover:bg-accent hover:border-border hover:shadow-xs"
                key={`${event.timestamp}-${idx}`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <p className="font-medium text-foreground">{event.type}</p>
                </div>
                <p className="mt-1 text-muted-foreground">{event.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <DgiiDashboardWidget />
      </div>
    </div>
  );
}

/* ── Stat Card ── */

const COLOR_MAP: Record<string, { icon: string; bg: string; ring: string }> = {
  sky:     { icon: "text-sky-500",     bg: "bg-sky-500/10",     ring: "ring-sky-500/20" },
  emerald: { icon: "text-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  amber:   { icon: "text-amber-500",   bg: "bg-amber-500/10",   ring: "ring-amber-500/20" },
  rose:    { icon: "text-rose-500",    bg: "bg-rose-500/10",    ring: "ring-rose-500/20" },
};

function StatCard({
  label,
  value,
  description,
  icon,
  color,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.sky;
  return (
    <Card className="group transition-all duration-200 hover:shadow-md hover:border-primary/20">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
            <p className="mt-1.5 font-mono tabular-nums text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={`rounded-xl p-2.5 ring-1 ${c.bg} ${c.ring}`}>
            <div className={c.icon}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
          <Skeleton className="size-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}