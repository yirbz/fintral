"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Calendar,
  AlertCircle,
  TrendingDown,
  ArrowUpRight,
  FileSpreadsheet
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { getCxpSummary, markInvoicePaid } from "@/lib/api/payments";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ReportPreviewDialog } from "@/components/report-preview-dialog";
import type { Invoice } from "@/lib/types";

export default function CxpPage() {
  const queryClient = useQueryClient();
  const { formatDate, formatCurrency } = useUserPreferences();
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Queries
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["cxp-summary"],
    queryFn: getCxpSummary,
    refetchOnWindowFocus: true
  });

  // State for selected bank accounts
  const [selectedBanks, setSelectedBanks] = useState<Record<string, string>>({});

  // Mutations
  const payInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, paymentDate, bankAccountId }: { invoiceId: string; paymentDate?: string; bankAccountId?: string }) =>
      markInvoicePaid(invoiceId, paymentDate, bankAccountId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cxp-summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Factura ${data.invoice.invoice_number || ""} marcada como pagada`);
    },
    onError: (err) => {
      toast.error(`Error al liquidar pago: ${err instanceof Error ? err.message : "Error desconocido"}`);
    }
  });

  const handleMarkAsPaid = (invoiceId: string, bankAccountId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    payInvoiceMutation.mutate({ invoiceId, paymentDate: todayStr, bankAccountId });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-muted rounded"></div>
            <div className="h-96 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertCircle className="size-10 text-destructive animate-bounce" />
        <p className="text-sm font-medium">Error al cargar cuentas por pagar</p>
        <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Error del servidor"}</p>
      </div>
    );
  }

  const invoices = summary?.recent_invoices ?? [];

  // Group Invoices by time horizon
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groups: { [key: string]: { label: string; invoices: Invoice[]; color: string } } = {
    overdue: { label: "Vencidas (Acción Inmediata)", invoices: [], color: "bg-red-500/10 text-red-500 border-red-500/20" },
    next30: { label: "Por Vencer: 0 - 30 días", invoices: [], color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
    next60: { label: "Por Vencer: 31 - 60 días", invoices: [], color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
    next90: { label: "Por Vencer: 61 - 90 días", invoices: [], color: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
    longer: { label: "A Largo Plazo: 90+ días", invoices: [], color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    noDue: { label: "Sin fecha de vencimiento", invoices: [], color: "bg-gray-500/10 text-gray-700 border-gray-500/20" }
  };

  invoices.forEach((inv) => {
    if (!inv.due_date) {
      groups.noDue.invoices.push(inv);
      return;
    }
    const due = new Date(inv.due_date);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      groups.overdue.invoices.push(inv);
    } else if (diffDays <= 30) {
      groups.next30.invoices.push(inv);
    } else if (diffDays <= 60) {
      groups.next60.invoices.push(inv);
    } else if (diffDays <= 90) {
      groups.next90.invoices.push(inv);
    } else {
      groups.longer.invoices.push(inv);
    }
  });

  const activeGroups = Object.entries(groups).filter(([_, group]) => group.invoices.length > 0);

  // Cash vs Obligations summary
  const cashBalance = summary?.cash_balance ?? 0;
  const totalOutstanding = summary?.total_outstanding ?? 0;
  const isHealthy = cashBalance >= totalOutstanding;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5">
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Cuentas por pagar
              </p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Tesorería & CXP
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestiona tus deudas comerciales, plazos de proveedores e inventario multibanco.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsReportOpen(true)}
              className="h-8 text-xs gap-1.5 font-medium border-primary/20 hover:border-primary hover:bg-primary/5 text-primary"
            >
              <FileSpreadsheet className="size-3.5" />
              Vista Previa & Exportar
            </Button>
          </div>
        </div>
      </div>

      {/* Resumen Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Pendiente</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-foreground mt-1">
              {formatCurrency(summary?.total_outstanding)}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">Facturas de compras a crédito vigentes</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-red-500">Total Vencido</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-red-600 mt-1">
              {formatCurrency(summary?.total_overdue)}
            </h3>
            <p className="text-[10px] text-red-500/80 mt-1">Facturas que superaron fecha límite</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-600">Compromisos Semana</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-amber-700 mt-1">
              {formatCurrency(summary?.weekly_commitments)}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">Vencimientos en los próximos 7 días</p>
          </CardContent>
        </Card>

        <Card className={`shadow-sm border-border ${isHealthy ? "bg-emerald-500/[0.04]" : "bg-red-500/[0.04]"}`}>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Caja vs Compromisos</p>
            <h3 className={`text-lg font-bold font-mono tabular-nums mt-1 ${isHealthy ? "text-emerald-700" : "text-red-700"}`}>
              {formatCurrency(cashBalance - totalOutstanding)}
            </h3>
            <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-red-500"}`} />
              {isHealthy ? "Suficiente cobertura de caja" : "Caja disponible insuficiente"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Invoices */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="p-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Facturas por pagar agrupadas
              </CardTitle>
              <CardDescription className="text-[11px]">
                Listado de cuentas por pagar vigentes agrupadas según su fecha de vencimiento.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Check className="size-8 mx-auto text-emerald-500 mb-2" />
                  No tienes facturas pendientes de pago. ¡Todo al día!
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeGroups.map(([key, group]) => (
                    <div key={key} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <Badge className={`text-[10px] font-semibold py-0.5 px-2 border ${group.color}`} variant="outline">
                          {group.label}
                        </Badge>
                        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                          {group.invoices.length} {group.invoices.length === 1 ? "factura" : "facturas"} • {formatCurrency(group.invoices.reduce((sum, i) => sum + (i.total_amount ?? 0), 0))}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-[10px] text-muted-foreground border-b border-border font-semibold uppercase tracking-wider">
                              <th className="py-2">Proveedor</th>
                              <th className="py-2">NCF</th>
                              <th className="py-2">F. Factura</th>
                              <th className="py-2">Vence</th>
                              <th className="py-2 text-right">Monto</th>
                              <th className="py-2">Cuenta Banco</th>
                              <th className="py-2 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {group.invoices.map((inv) => {
                              const activeBankId = selectedBanks[inv.id] || summary?.bank_balances?.[0]?.id || "";
                              return (
                                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="py-2.5 font-medium pr-2 max-w-[120px] truncate">
                                    {inv.vendor_name || "Desconocido"}
                                  </td>
                                  <td className="py-2.5 font-mono text-[11px] tabular-nums pr-2">
                                    {inv.invoice_number || "S/N"}
                                  </td>
                                  <td className="py-2.5 text-muted-foreground pr-2">
                                    {formatDate(inv.invoice_date)}
                                  </td>
                                  <td className="py-2.5 text-muted-foreground pr-2 font-mono text-[11px]">
                                    {inv.due_date ? formatDate(inv.due_date) : "N/A"}
                                  </td>
                                  <td className="py-2.5 font-mono font-semibold tabular-nums text-right text-foreground pr-4">
                                    {formatCurrency(inv.total_amount, inv.currency)}
                                  </td>
                                  <td className="py-2.5 pr-2">
                                    <select
                                      value={activeBankId}
                                      onChange={(e) => setSelectedBanks({ ...selectedBanks, [inv.id]: e.target.value })}
                                      className="h-6 text-[10px] bg-background border border-input rounded px-1.5 py-0.5 max-w-[120px] focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      {summary?.bank_balances?.map((bank) => (
                                        <option key={bank.id} value={bank.id}>
                                          {bank.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2.5 text-right">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleMarkAsPaid(inv.id, activeBankId)}
                                      className="h-6 text-[10px] px-2 font-medium hover:bg-emerald-500 hover:text-white hover:border-emerald-600 transition-colors"
                                    >
                                      Marcar Pagado
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right / Multibank Widget */}
        <div className="space-y-6">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  Saldos Multibanco
                </CardTitle>
                <CardDescription className="text-[10px] mt-0.5">
                  Balances actuales de tus cuentas de banco conciliadas.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" asChild className="h-6 text-[10px] px-2">
                <Link href="/dashboard/accounts">Gestionar</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-3">
                <div className="space-y-2">
                  {summary?.bank_balances && summary.bank_balances.length > 0 ? (
                    summary.bank_balances.map((bank, index) => (
                      <div key={index} className="flex justify-between items-center text-xs py-1">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                          {bank.name}
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatCurrency(bank.balance)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-muted-foreground text-center py-2">
                      No hay saldos registrados.
                    </p>
                  )}
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="font-semibold text-foreground">Total en Bancos</span>
                  <span className="font-mono font-bold text-foreground text-sm tabular-nums">
                    {formatCurrency(cashBalance)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ReportPreviewDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportType="ap"
      />
    </div>
  );
}
