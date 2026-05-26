"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react"
import Link from "next/link"

import { getStatistics } from "@/lib/api/statistics"
import { listInvoices } from "@/lib/api/invoices"
import { useRealtime } from "@/hooks/use-realtime"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { DgiiDashboardWidget } from "@/features/dgii/dgii-dashboard-widget"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils/date"
import type { StatisticsPayload } from "@/lib/types"

function formatAmount(amount: number | null, currency = "DOP") {
  return formatCurrency(amount, currency)
}

/* ────────────────────────────────────────────
   Page
──────────────────────────────────────────── */
export default function Page() {
  const stats = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") })
  const invoices = useQuery({ queryKey: ["invoices", "dashboard"], queryFn: () => listInvoices() })
  const { events, connected } = useRealtime()
  const loading = stats.isLoading || stats.isFetching
  const data: StatisticsPayload | undefined = stats.data

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute right-16 bottom-0 h-20 w-20 rounded-full bg-primary/8 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Panel principal
              </p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Resumen de actividad
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Actividad de los últimos 30 días
            </p>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {loading ? <SectionCardsSkeleton /> : <SectionCards stats={data} />}

      {/* ── Volume chart (real data) ── */}
      {loading ? (
        <div className="rounded-xl border bg-card p-5 h-64 flex flex-col justify-between shadow-xs animate-pulse">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
          <div className="flex items-end gap-3 h-36 pt-4">
            {Array.from({ length: 12 }).map((_, i) => {
              const h = [24, 40, 16, 32, 48, 60, 44, 28, 52, 64, 36, 48][i];
              return (
                <Skeleton 
                  key={i} 
                  className="flex-1 rounded-t-sm" 
                  style={{ height: `${h}%` }} 
                />
              );
            })}
          </div>
        </div>
      ) : (
        <ChartAreaInteractive volumeHistory={data?.charts?.volume_history ?? []} />
      )}

      {/* ── Main grid: invoices + updates ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">

        {/* Recent invoices — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-xs flex flex-col">
          <div className="flex items-start justify-between p-5 pb-4 border-b border-border/60">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Facturas recientes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Documentos registrados recientemente
              </p>
            </div>
            {!invoices.isLoading && (invoices.data?.invoices ?? []).length > 0 && (
              <Link href="/dashboard/invoices">
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground hover:text-primary">
                  Ver todas
                  <ArrowUpRight className="size-3" />
                </Button>
              </Link>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {invoices.isLoading ? (
              <div className="flex flex-col divide-y divide-border/40">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-2 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-36 rounded" />
                        <Skeleton className="h-3 w-24 rounded" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                ))}
              </div>
            ) : (invoices.data?.invoices ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <FileText className="size-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Sin facturas aún</p>
                <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground leading-relaxed">
                  Sube tu primer documento para comenzar.
                </p>
                <Link href="/dashboard/upload" className="mt-4">
                  <Button size="sm" className="gap-1.5">
                    <FileText className="size-3.5" />
                    Subir factura
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {(invoices.data?.invoices ?? []).slice(0, 8).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/dashboard/invoices/${inv.id}`}
                    className="group flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full ring-2 ring-background",
                          inv.processed ? "bg-emerald-500" : "bg-amber-400"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {inv.vendor_name || "Procesando..."}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {inv.invoice_number || "Sin NCF"}
                          {inv.invoice_date && (
                            <> · {new Date(inv.invoice_date + "T12:00:00").toLocaleDateString("es-DO", { day: "numeric", month: "short" })}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {inv.total_amount !== null && (
                        <span className="text-xs tabular-nums font-medium text-foreground">
                          {formatAmount(inv.total_amount, inv.currency)}
                        </span>
                      )}
                      <Badge
                        variant={inv.processed ? "outline" : "secondary"}
                        className="text-[10px] h-5"
                      >
                        {inv.processed ? "Registrada" : "Pendiente"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live updates feed — 1/3 */}
        <div className="rounded-xl border bg-card shadow-xs flex flex-col">
          <div className="flex items-center gap-2 p-5 pb-4 border-b border-border/60">
            <Activity className="size-3.5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Actualizaciones</h2>
              <p className="text-xs text-muted-foreground">Cambios en tiempo real</p>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-1.5 max-h-72">
            {!connected && events.length === 0 ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-background/50 px-3 py-2 animate-pulse">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-2.5 w-40 rounded" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8">
                  <Activity className="size-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">Sin actualizaciones recientes.</p>
              </div>
            ) : (
              events.slice(0, 20).map((event, idx) => (
                <div
                  key={`${event.timestamp}-${idx}`}
                  className="rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                    <p className="font-medium text-foreground truncate">{event.type}</p>
                  </div>
                  <p className="text-muted-foreground leading-relaxed truncate">{event.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom row: AI summary + Audit alerts + DGII ── */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <AutoProcessingSummary stats={data} loading={loading} />
        <AuditHealth stats={data} loading={loading} />
        <DgiiDashboardWidget />
      </div>

      {/* ── Categories ── */}
      {loading ? (
        <CategoryStripSkeleton />
      ) : (
        (data?.categories ?? []).length > 0 && (
          <CategoryStrip categories={data!.categories} />
        )
      )}
    </div>

  )
}

/* ────────────────────────────────────────────
   Automatic Processing Summary
   (No model names, no technical details)
──────────────────────────────────────────── */
function AutoProcessingSummary({
  stats,
  loading,
}: {
  stats: StatisticsPayload | undefined
  loading: boolean
}) {
  // Total AI-processed = sum of all model requests — without exposing model names
  const totalAiDocs = (stats?.costs?.model_breakdown ?? []).reduce(
    (sum, m) => sum + m.requests,
    0
  )
  const totalProcessed = stats?.queue?.processed_total ?? 0
  const aiPct = totalProcessed > 0 ? Math.round((totalAiDocs / totalProcessed) * 100) : 0
  const avgConfidence = stats?.performance?.avg_confidence ?? 0

  return (
    <div className="rounded-xl border bg-card shadow-xs flex flex-col">
      <div className="flex items-center gap-2 p-5 pb-4 border-b border-border/60">
        <Sparkles className="size-3.5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Procesamiento automático</h2>
          <p className="text-xs text-muted-foreground">Facturas gestionadas con IA</p>
        </div>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-24 rounded" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-3xl font-light tabular-nums text-foreground">{totalAiDocs}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                facturas procesadas automáticamente
              </p>
            </div>

            {/* Automation rate bar */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nivel de automatización
                </span>
                <span className="text-[10px] tabular-nums font-medium text-foreground">{aiPct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${aiPct}%` }}
                />
              </div>
            </div>

            {/* Precision */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Precisión promedio</span>
              <span className="text-sm tabular-nums font-semibold text-foreground">
                {Math.round(avgConfidence * 100)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   Audit Health — active invoices only
   Uses a dedicated query to exclude trashed
   and cancelled invoices from the count.
──────────────────────────────────────────── */
function AuditHealth({
  stats,
  loading: statsLoading,
}: {
  stats: StatisticsPayload | undefined
  loading: boolean
}) {
  // Fetch only active flagged invoices (trashed/cancelled invoices live
  // at /invoices/trash, so the default /invoices endpoint excludes them)
  const flaggedQuery = useQuery({
    queryKey: ["invoices", "flagged-active"],
    queryFn: () => listInvoices({ quality: "with_warnings" }),
    staleTime: 60_000,
  })

  const loading = statsLoading || flaggedQuery.isLoading

  // Active flagged count from the dedicated query
  const alerts = flaggedQuery.data?.total ?? 0
  // Clean = total processed minus active flagged
  const totalProcessed = stats?.queue?.processed_total ?? 0
  const clean = Math.max(0, totalProcessed - alerts)
  const total = alerts + clean
  const cleanPct = total > 0 ? Math.round((clean / total) * 100) : 0
  const alertPct = total > 0 ? Math.round((alerts / total) * 100) : 0

  return (
    <div className="rounded-xl border bg-card shadow-xs flex flex-col">
      <div className="flex items-center gap-2 p-5 pb-4 border-b border-border/60">
        <ShieldAlert className="size-3.5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Alertas en facturas</h2>
          <p className="text-xs text-muted-foreground">Solo facturas activas</p>
        </div>
      </div>
      <div className="flex-1 p-5 flex flex-col justify-between gap-4">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full rounded-full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
        ) : (
          <>
            {/* Split bar */}
            <div className="space-y-2">
              <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${cleanPct}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${alertPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className="tabular-nums">{cleanPct}% sin alertas</span>
                <span className="tabular-nums">{alertPct}% con alertas</span>
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Sin alertas
                  </span>
                </div>
                <p className="text-2xl font-light tabular-nums text-foreground">{clean}</p>
              </div>
              <div className="rounded-lg bg-amber-400/8 border border-amber-400/15 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldAlert className="size-3.5 text-amber-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                    Con alerta
                  </span>
                </div>
                <p className="text-2xl font-light tabular-nums text-foreground">{alerts}</p>
              </div>
            </div>

            {alerts > 0 && (
              <Link href="/dashboard/invoices?quality=with_warnings">
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                  Revisar facturas con alertas
                  <ArrowUpRight className="size-3" />
                </Button>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   Category Strip
──────────────────────────────────────────── */
function CategoryStrip({
  categories,
}: {
  categories: StatisticsPayload["categories"]
}) {
  const top = [...categories].sort((a, b) => b.count - a.count).slice(0, 6)
  const totalCount = top.reduce((s, c) => s + c.count, 0)

  return (
    <div className="rounded-xl border bg-card shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="size-3.5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Categorías</h2>
        <span className="text-xs text-muted-foreground ml-auto">{totalCount} facturas</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {top.map((cat) => {
          const pct = totalCount > 0 ? Math.round((cat.count / totalCount) * 100) : 0
          return (
            <div
              key={cat.category}
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs hover:bg-accent/50 transition-colors"
            >
              <span className="font-medium text-foreground">{cat.category || "Sin categoría"}</span>
              <span className="tabular-nums text-muted-foreground">{cat.count}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="tabular-nums text-primary font-medium">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   Skeletons
──────────────────────────────────────────── */
function SectionCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <Skeleton className="h-2.5 w-24 rounded" />
              <Skeleton className="h-8 w-14 rounded" />
              <Skeleton className="h-2.5 w-28 rounded" />
            </div>
            <Skeleton className="size-10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CategoryStripSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="size-3.5 text-primary/50" />
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-3 w-16 rounded ml-auto" />
      </div>
      <div className="flex flex-wrap gap-2 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
          >
            <Skeleton className="h-3.5 w-16 rounded" />
            <Skeleton className="h-3.5 w-6 rounded" />
            <span className="text-muted-foreground/30">·</span>
            <Skeleton className="h-3.5 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

