"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  ExternalLink,
  Loader2,
  Calendar,
  DollarSign,
  Percent
} from "lucide-react";

import { getStatistics } from "@/lib/api/statistics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const PERIODS = ["7d", "30d", "90d"] as const;

const CHART_COLORS = [
  "oklch(0.53 0.24 265)", // Indigo (Fintral Primary)
  "oklch(0.62 0.17 220)", // Blue
  "oklch(0.72 0.14 190)", // Cyan
  "oklch(0.65 0.20 140)", // Emerald
  "oklch(0.58 0.21 29)",  // Rose/Red
  "oklch(0.68 0.18 55)",  // Amber/Orange
];

const DGII_CATEGORY_LABELS: Record<string, string> = {
  "01": "Gastos de Personal",
  "02": "Gastos por Trabajos, Suministros y Servicios",
  "03": "Arrendamientos",
  "04": "Gastos de Activos Fijos",
  "05": "Gastos de Representación",
  "06": "Gastos Financieros",
  "07": "Gastos de Seguros",
  "08": "Gastos por Pérdidas Extraordinarias",
  "09": "Compras que Forman Parte del Costo de Venta",
  "10": "Adquisiciones de Activos Fijos",
  "11": "Gastos de Seguros (auxiliar)",
};

const INCOME_CATEGORY_LABELS: Record<string, string> = {
  "01": "Ingresos por Operaciones",
  "02": "Ingresos Financieros",
  "03": "Ingresos Extraordinarios",
  "04": "Ingresos por Arrendamientos",
  "05": "Ingresos por Venta de Activo Depreciable",
  "06": "Otros Ingresos",
};

function getCategoryLabel(code: string): string {
  const clean = code.replace(/^(expense|income)_/, "");
  return DGII_CATEGORY_LABELS[clean] || INCOME_CATEGORY_LABELS[clean] || code;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background/95 p-2.5 shadow-md backdrop-blur-sm text-xs space-y-1">
        <p className="font-semibold text-muted-foreground">{label}</p>
        {payload.map((item: any, idx: number) => (
          <p key={idx} className="font-medium text-foreground" style={{ color: item.color || item.fill }}>
            {item.name}: {typeof item.value === "number" && item.value > 100
              ? new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 }).format(item.value)
              : item.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function currencyFormatter(val: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    maximumFractionDigits: 0
  }).format(val);
}

export function ReportsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d");
  const {data: query_data, isLoading: query_isLoading} = useQuery({
    queryKey: ["statistics", period],
    queryFn: () => getStatistics(period)
  });

  const loading = query_isLoading;

  // Destructure financial metrics
  const incomeAmount = query_data?.totals?.income?.amount ?? 0;
  const incomeCount = query_data?.totals?.income?.count ?? 0;
  const expenseAmount = query_data?.totals?.expense?.amount ?? 0;
  const expenseCount = query_data?.totals?.expense?.count ?? 0;
  const netAmount = query_data?.totals?.net ?? 0;

  // Auditor metric calculations
  const processedTotal = query_data?.queue?.processed_total ?? 0;
  const cleanCount = query_data?.audit?.clean_count ?? 0;
  const alertsCount = query_data?.audit?.alerts_count ?? 0;
  const healthScore = processedTotal > 0 ? Math.round((cleanCount / processedTotal) * 100) : 100;

  const pieData = useMemo(() => {
    const labels = query_data?.audit.distribution.labels ?? [];
    const data = query_data?.audit.distribution.data ?? [];
    return labels.map((label, index) => ({ name: label, value: data[index] ?? 0 }));
  }, [query_data?.audit.distribution.data, query_data?.audit.distribution.labels]);

  const categories = useMemo(() => query_data?.categories ?? [], [query_data?.categories]);
  const totalExpense = useMemo(() => {
    return categories.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0);
  }, [categories]);

  const recentAlerts = useMemo(() => query_data?.audit?.recent_alerts ?? [], [query_data?.audit?.recent_alerts]);

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10 w-full max-w-7xl mx-auto">
      {/* Header */}
      <Card className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/8 blur-3xl" />
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-5">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Activity className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Auditoría Financiera</p>
            </div>
            <CardTitle className="text-lg">Analítica de Salud & Cumplimiento</CardTitle>
            <p className="text-xs text-muted-foreground">Flujo de caja, desglose contable y control de advertencias fiscales.</p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shrink-0">
            {PERIODS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={period === key ? "default" : "ghost"}
                onClick={() => setPeriod(key)}
                className="h-7 text-xs px-3"
              >
                {key === "7d" ? "7 Días" : key === "30d" ? "30 Días" : "90 Días"}
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Income Card */}
        <Card className="relative overflow-hidden transition-all hover:shadow-sm">
          <div className="absolute right-4 top-4 rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="size-4" />
          </div>
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ingresos del Periodo</p>
            <h3 className="mt-2 text-base font-bold text-foreground font-mono">
              {loading ? <Skeleton className="h-5 w-28 rounded-md" /> : currencyFormatter(incomeAmount)}
            </h3>
            <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{incomeCount}</span> facturas emitidas
            </p>
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card className="relative overflow-hidden transition-all hover:shadow-sm">
          <div className="absolute right-4 top-4 rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
            <TrendingDown className="size-4" />
          </div>
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gastos del Periodo</p>
            <h3 className="mt-2 text-base font-bold text-foreground font-mono">
              {loading ? <Skeleton className="h-5 w-28 rounded-md" /> : currencyFormatter(expenseAmount)}
            </h3>
            <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="font-semibold text-blue-600 dark:text-blue-400">{expenseCount}</span> facturas recibidas
            </p>
          </CardContent>
        </Card>

        {/* Net Flow Card */}
        <Card className="relative overflow-hidden transition-all hover:shadow-sm">
          <div className="absolute right-4 top-4 rounded-full bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
            <DollarSign className="size-4" />
          </div>
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Flujo Neto de Caja</p>
            <h3 className={`mt-2 text-base font-bold font-mono ${netAmount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {loading ? <Skeleton className="h-5 w-28 rounded-md" /> : currencyFormatter(netAmount)}
            </h3>
            <p className="mt-1 text-[10px] text-muted-foreground">Beneficio neto del periodo</p>
          </CardContent>
        </Card>

        {/* Health Score Card */}
        <Card className="relative overflow-hidden transition-all hover:shadow-sm">
          <div className={`absolute right-4 top-4 rounded-full p-2 ${
            healthScore >= 90 ? "bg-emerald-500/10 text-emerald-600" : healthScore >= 75 ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-destructive"
          }`}>
            <Percent className="size-4" />
          </div>
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Salud Fiscal (DGII)</p>
            <h3 className={`mt-2 text-base font-bold font-mono ${
              healthScore >= 90 ? "text-emerald-600 dark:text-emerald-400" : healthScore >= 75 ? "text-amber-500" : "text-destructive"
            }`}>
              {loading ? <Skeleton className="h-5 w-20 rounded-md" /> : `${healthScore}%`}
            </h3>
            <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
              <span className={`font-semibold ${alertsCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}`}>
                {alertsCount}
              </span> advertencias pendientes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main charts section */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* volume trend line chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Volumen de Extracción Diario</CardTitle>
            <p className="text-[11px] text-muted-foreground">Tendencia de carga y extracción digital en el periodo seleccionado.</p>
          </CardHeader>
          <CardContent className="h-64 pt-2">
            {loading ? (
              <div className="flex h-full items-end justify-center gap-2 pb-6">
                {Array.from({ length: 15 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{ height: `${20 + Math.random() * 60}%` }}
                  />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={query_data?.charts.volume_history ?? []}>
                  <XAxis dataKey="date" fontSize={9} stroke="#888888" tickLine={false} />
                  <YAxis fontSize={9} stroke="#888888" tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="count" stroke="oklch(0.53 0.24 265)" name="Facturas Procesadas" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* alert breakdown pie chart */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Distribución de Advertencias</CardTitle>
            <p className="text-[11px] text-muted-foreground">Fallas detectadas según reglas fiscales de la DGII.</p>
          </CardHeader>
          <CardContent className="h-64 pt-2">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="size-40 rounded-full" />
              </div>
            ) : pieData.length === 0 ? (
              <div className="flex flex-col h-full items-center justify-center text-center text-muted-foreground p-4">
                <ShieldAlert className="size-8 text-emerald-500 mb-2 opacity-50" />
                <p className="text-xs font-semibold text-foreground">Sin observaciones fiscales</p>
                <p className="text-[10px] max-w-[20ch] mt-1">Los comprobantes del periodo están libres de inconsistencias tributarias.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={70} innerRadius={40}>
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Categories and Recent Alerts Split Section */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Categories Distribution */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Desglose de Gastos (DGII)</CardTitle>
            <p className="text-[11px] text-muted-foreground">Gastos consolidados por tipo de egreso oficial.</p>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4 max-h-[350px] pr-1 pb-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-28 rounded-md" />
                    <Skeleton className="h-3 w-12 rounded-md" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-md" />
                </div>
              ))
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <p className="text-xs">No hay egresos clasificados en este periodo.</p>
              </div>
            ) : (
              categories.map((cat, idx) => {
                const label = getCategoryLabel(cat.category);
                const percent = totalExpense > 0 ? Math.round((cat.total / totalExpense) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-start text-[11px]">
                      <span className="font-medium text-foreground truncate max-w-[180px]" title={`${cat.category} - ${label}`}>
                        {cat.category} - {label}
                      </span>
                      <span className="font-semibold text-muted-foreground shrink-0 font-mono">
                        {currencyFormatter(cat.total)} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-primary h-1.5 rounded-full transition-all duration-500" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Audit Alerts Detail List */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-sm font-semibold">Alertas de Auditoría Activas</CardTitle>
              <p className="text-[11px] text-muted-foreground">Últimos documentos que presentan inconsistencias frente a la DGII.</p>
            </div>
            {alertsCount > 0 ? (
              <Badge variant="destructive" className="text-[9px] animate-pulse">
                {alertsCount} Alertas
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 max-h-[350px] pr-1 pb-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))
            ) : recentAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <ShieldAlert className="size-8 text-emerald-500 mb-2 opacity-40" />
                <p className="text-xs font-semibold text-foreground">¡Todo en orden!</p>
                <p className="text-[10px] mt-0.5">No hay advertencias activas para este periodo.</p>
              </div>
            ) : (
              recentAlerts.map((alert: any) => {
                const alertFlags = (() => {
                  try {
                    return JSON.parse(alert.audit_flags ?? "[]") as string[];
                  } catch {
                    return [];
                  }
                })();
                return (
                  <div key={alert.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-muted/20 transition-all">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-xs text-foreground truncate max-w-[140px]">
                          {alert.vendor_name || "Proveedor no identificado"}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono leading-none py-0.5 px-1 bg-muted/40">
                          {alert.invoice_number || "SIN NCF"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {currencyFormatter(alert.total_amount || 0)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 mt-1">
                        {alertFlags.map((flag, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-1.5 text-[10px] text-destructive dark:text-red-400 leading-normal">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1 shrink-0" />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Link href={`/dashboard/invoices/${alert.id}`} className="shrink-0">
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary">
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Stats Column chart */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-semibold">Tendencia de Carga Mensual</CardTitle>
          <p className="text-[11px] text-muted-foreground">Volumen total consolidado mes a mes en el último año.</p>
        </CardHeader>
        <CardContent className="h-60 pt-2">
          {loading ? (
            <div className="flex h-full items-end justify-center gap-3 pb-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{ height: `${30 + Math.random() * 50}%` }}
                />
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={query_data?.monthly_stats ?? []}>
                <XAxis dataKey="month" fontSize={9} stroke="#888888" tickLine={false} />
                <YAxis fontSize={9} stroke="#888888" tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="count" name="Volumen Mensual" fill="oklch(0.53 0.24 265)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
