"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  Check,
  Calendar,
  AlertCircle,
  Clock,
  ArrowUpRight,
  UserCheck,
  FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";

import { getCxcSummary, markInvoicePaid, getBankAccounts } from "@/lib/api/payments";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportPreviewDialog } from "@/components/report-preview-dialog";
import type { Invoice } from "@/lib/types";

export default function CxcPage() {
  const queryClient = useQueryClient();
  const { formatDate, formatCurrency } = useUserPreferences();
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Queries
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["cxc-summary"],
    queryFn: getCxcSummary,
    refetchOnWindowFocus: true
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts
  });

  // State for selected bank accounts
  const [selectedBanks, setSelectedBanks] = useState<Record<string, string>>({});

  // Mutations
  const collectInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, paymentDate, bankAccountId }: { invoiceId: string; paymentDate?: string; bankAccountId?: string }) =>
      markInvoicePaid(invoiceId, paymentDate, bankAccountId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cxc-summary"] });
      queryClient.invalidateQueries({ queryKey: ["cxp-summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Ingreso ${data.invoice.invoice_number || ""} marcado como cobrado`);
    },
    onError: (err) => {
      toast.error(`Error al liquidar cobro: ${err instanceof Error ? err.message : "Error desconocido"}`);
    }
  });

  const handleMarkAsCollected = (invoiceId: string, bankAccountId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    collectInvoiceMutation.mutate({ invoiceId, paymentDate: todayStr, bankAccountId });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertCircle className="size-10 text-destructive animate-bounce" />
        <p className="text-sm font-medium">Error al cargar cuentas por cobrar</p>
        <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Error del servidor"}</p>
      </div>
    );
  }

  const invoices = summary?.recent_invoices ?? [];

  // Group Invoices by time horizon
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groups: { [key: string]: { label: string; invoices: Invoice[]; color: string } } = {
    overdue: { label: "Vencidas (Venta a Crédito Atrasada)", invoices: [], color: "bg-red-500/10 text-red-500 border-red-500/20" },
    next30: { label: "Por Cobrar: 0 - 30 días", invoices: [], color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
    next60: { label: "Por Cobrar: 31 - 60 días", invoices: [], color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
    next90: { label: "Por Cobrar: 61 - 90 días", invoices: [], color: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
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

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5">
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Cuentas por cobrar
              </p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Cartera & CXC
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestiona el crédito otorgado a tus clientes, plazos de cobro y flujo de entrada.
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Pendiente de Cobro</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-foreground mt-1">
              {formatCurrency(summary?.total_outstanding)}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">Facturas de ventas a crédito por cobrar</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-red-500">Cartera Vencida</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-red-600 mt-1">
              {formatCurrency(summary?.total_overdue)}
            </h3>
            <p className="text-[10px] text-red-500/80 mt-1">Facturas con plazo de cobro superado</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">Cobros Previstos Semana</p>
            <h3 className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(summary?.weekly_receivables)}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">Vencimientos previstos próximos 7 días</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Facturas por cobrar agrupadas
          </CardTitle>
          <CardDescription className="text-[11px]">
            Facturas de ventas a crédito activas agrupadas según su fecha límite de pago del cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Check className="size-8 mx-auto text-emerald-500 mb-2" />
              No tienes facturas pendientes de cobro. ¡Flujo saneado!
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
                          <th className="py-2">Cliente</th>
                          <th className="py-2">NCF</th>
                          <th className="py-2">F. Factura</th>
                          <th className="py-2">Vence</th>
                          <th className="py-2 text-right">Monto</th>
                          <th className="py-2">Depositar en</th>
                          <th className="py-2 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {group.invoices.map((inv) => {
                          const activeBankId = selectedBanks[inv.id] || bankAccounts?.[0]?.id || "";
                          return (
                            <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 font-medium pr-2 max-w-[150px] truncate">
                                {inv.vendor_name || "Cliente General"}
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
                                  {bankAccounts?.map((bank) => (
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
                                  onClick={() => handleMarkAsCollected(inv.id, activeBankId)}
                                  className="h-6 text-[10px] px-2 font-medium hover:bg-emerald-500 hover:text-white hover:border-emerald-600 transition-colors"
                                >
                                  Marcar Cobrado
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

      <ReportPreviewDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reportType="ar"
      />
    </div>
  );
}
