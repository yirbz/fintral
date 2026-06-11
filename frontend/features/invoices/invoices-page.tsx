"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpDown,
  Ban,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  FileImage,
  FileText,
  Filter,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  bulkCancel,
  bulkDelete,
  bulkProcess,
  exportInvoices,
  listInvoices,
  processInvoice,
  pushWebhook,
} from "@/lib/api/invoices";
import { getDgiiCategories, triggerBlobDownload } from "@/lib/api/dgii";
import { getBankAccounts } from "@/lib/api/payments";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { CreateInvoicePayload } from "@/lib/api/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Invoice } from "@/lib/types";
import { createInvoice } from "@/lib/api/invoices";
import { ManualInvoiceDialog } from "@/features/invoices/manual-invoice-dialog";
import { AdvancedInvoiceDialog } from "@/features/invoices/advanced-invoice-dialog";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/lib/utils/date";

const EXPORT_FORMATS = [
  { id: "dgii_606" as const, label: "DGII 606 (Compras)" },
  { id: "csv" as const, label: "CSV" },
  { id: "excel" as const, label: "Excel" },
  { id: "quickbooks_bills" as const, label: "QuickBooks" },
  { id: "xero" as const, label: "Xero" },
  { id: "odoo" as const, label: "Odoo" },
  { id: "contaplus" as const, label: "Contaplus" },
  { id: "json" as const, label: "JSON" },
];

export function InvoicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [transactionType, setTransactionType] = useState("all");
  const [quality, setQuality] = useState(searchParams.get("quality") ?? "all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInitial, setAdvancedInitial] = useState<Partial<CreateInvoicePayload> | undefined>(undefined);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedExportFormat, setSelectedExportFormat] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentCondition, setPaymentCondition] = useState("all");

  const {data: bankAccountsQuery_data} = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts
  });
  const bankAccounts = bankAccountsQuery_data ?? [];
  const bankMap = useMemo(() => {
    const map = new Map<string, string>();
    bankAccounts.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [bankAccounts]);

  const {data: categoriesQuery_data} = useQuery({
    queryKey: ["invoice-categories"],
    queryFn: getDgiiCategories,
    staleTime: 5 * 60 * 1000,
  });

  const {data: invoicesQuery_data, isLoading: invoicesQuery_isLoading} = useQuery({
    queryKey: ["invoices", search, transactionType, quality, dateFrom, dateTo, category, paymentStatus, paymentCondition],
    queryFn: () =>
      listInvoices({
        search: search || undefined,
        transaction_type: transactionType === "all" ? undefined : transactionType || undefined,
        quality: quality === "all" ? undefined : quality,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        category: category === "all" ? undefined : category || undefined,
        payment_status: paymentStatus === "all" ? undefined : paymentStatus || undefined,
        payment_condition: paymentCondition === "all" ? undefined : paymentCondition || undefined,
      })
  });

  const invoices = invoicesQuery_data?.invoices ?? [];
  const allSelected = useMemo(
    () => selectedIds.length > 0 && invoices.length > 0 && selectedIds.length === invoices.length,
    [invoices.length, selectedIds.length]
  );

  const selectedInvoices = useMemo(
    () => invoices.filter((inv) => selectedIds.includes(inv.id)),
    [invoices, selectedIds]
  );

  const hasExpenseSelected = useMemo(
    () => selectedInvoices.some((inv) => inv.transaction_type === "expense"),
    [selectedInvoices]
  );

  const allIncomeSelected = useMemo(
    () => selectedIds.length > 0 && selectedInvoices.every((inv) => inv.transaction_type === "income"),
    [selectedInvoices, selectedIds.length]
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    await queryClient.invalidateQueries({ queryKey: ["statistics"] });
  };

  const processMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      setProcessingIds((prev) => new Set(prev).add(invoiceId));
      try {
        return await processInvoice(invoiceId);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(invoiceId);
          return next;
        });
      }
    },
    onSuccess: (data) => {
      toast.success(data.message || "Factura procesada exitosamente");
      void refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Error al procesar factura");
    }
  });

  const bulkProcessMutation = useMutation({
    mutationFn: async () => {
      const promise = bulkProcess(selectedIds);
      toast.promise(promise, {
        loading: `Procesando ${selectedIds.length} facturas...`,
        success: (data) => data.message || `${selectedIds.length} facturas procesadas`,
        error: (err) => err instanceof Error ? err.message : "Error al procesar",
      });
      return promise;
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const promise = bulkDelete(selectedIds);
      toast.promise(promise, {
        loading: `Moviendo ${selectedIds.length} facturas a la papelera...`,
        success: (data) => data.message || `${selectedIds.length} facturas movidas a la papelera`,
        error: (err) => err instanceof Error ? err.message : "Error al eliminar",
      });
      return promise;
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const bulkCancelMutation = useMutation({
    mutationFn: async () => {
      const promise = bulkCancel(selectedIds);
      toast.promise(promise, {
        loading: `Anulando ${selectedIds.length} facturas...`,
        success: (data) => data.message || `${selectedIds.length} facturas anuladas`,
        error: (err) => err instanceof Error ? err.message : "Error al anular",
      });
      return promise;
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const promise = pushWebhook(selectedIds);
      toast.promise(promise, {
        loading: `Enviando ${selectedIds.length} facturas...`,
        success: (data) => data?.status === "ok" ? "Enviado a integración" : "Enviado",
        error: (err) => err instanceof Error ? err.message : "Error al enviar",
      });
      return promise;
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createInvoice>[0]) => createInvoice(payload),
    onSuccess: async () => {
      toast.success("Factura creada manualmente");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Error al crear factura");
    }
  });

  async function processAllPending() {
    const pending = invoices.filter((invoice) => !invoice.processed);
    if (pending.length === 0) {
      toast.info("No hay facturas pendientes por procesar");
      return;
    }
    toast.info(`Procesando ${pending.length} facturas pendientes...`);
    for (const invoice of pending) {
      await processMutation.mutateAsync(invoice.id);
    }
    toast.success(`${pending.length} facturas procesadas`);
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(invoices.map((invoice) => invoice.id));
  }

  function toggleOne(invoiceId: string) {
    setSelectedIds((prev) => (prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]));
  }

  async function triggerExport() {
    if (!selectedExportFormat || selectedIds.length === 0) return;
    const fmt = selectedExportFormat;
    setExporting(true);
    try {
      const blob = await exportInvoices(fmt, selectedIds);
      const ext = fmt === "excel" ? ".xlsx" : fmt === "json" ? ".json" : fmt === "dgii_606" ? ".xls" : ".csv";
      triggerBlobDownload(blob, `facturas_${fmt}_${new Date().toISOString().slice(0, 10)}${ext}`);
      setSelectedExportFormat(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 pb-10 w-full max-w-7xl mx-auto">
      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Registro de Facturas</CardTitle>
            <p className="text-xs text-muted-foreground">Busca, filtra y procesa en lote.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Input
                className="w-64 rounded-lg border-border bg-muted pl-4 pr-10 text-sm focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/50"
                placeholder="Buscar proveedor o NCF"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Select
              value={transactionType}
              onValueChange={(value) => setTransactionType(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="income">Ingresos (Ventas)</SelectItem>
                  <SelectItem value="expense">Gastos (Compras)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => void processAllPending()}>
              <Play className="size-4" data-icon="inline-start" />
              Procesar pendientes
            </Button>
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="size-4" data-icon="inline-start" />
              Añadir factura
            </Button>
            <Button variant="outline" onClick={() => router.push("/dashboard/invoices/trash")}>
              <Trash2 className="size-4" data-icon="inline-start" />
              Ver Papelera
            </Button>
          </div>
        </CardHeader>

        {/* Extra filters row: date range + category + clear */}
        <div className="border-t border-border/60 px-4 py-2 lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3 text-muted-foreground" />
              <Input
                type="date"
                className="h-7 w-[140px] rounded-md border-border bg-muted px-2 text-xs focus:border-ring focus:bg-background"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="Desde"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                className="h-7 w-[140px] rounded-md border-border bg-muted px-2 text-xs focus:border-ring focus:bg-background"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="Hasta"
              />
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v)}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas</SelectItem>
                {(categoriesQuery_data ?? []).map((cat) => {
                  const expenseLabel = CATEGORY_LABELS[`expense_${cat}`];
                  const incomeLabel = CATEGORY_LABELS[`income_${cat}`];
                  const label = expenseLabel || incomeLabel || cat;
                  return (
                    <SelectItem key={cat} value={cat} className="text-xs">{label}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v)}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue placeholder="Estado Pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos los pagos</SelectItem>
                <SelectItem value="pending" className="text-xs">Pendiente</SelectItem>
                <SelectItem value="paid" className="text-xs">Pagado</SelectItem>
                <SelectItem value="overdue" className="text-xs">Vencido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentCondition} onValueChange={(v) => setPaymentCondition(v)}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue placeholder="Condición Pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas las condiciones</SelectItem>
                <SelectItem value="contado" className="text-xs">Contado</SelectItem>
                <SelectItem value="credito" className="text-xs">Crédito</SelectItem>
              </SelectContent>
            </Select>
            {(dateFrom || dateTo || category !== "all" || search || transactionType !== "all" || quality !== "all" || paymentStatus !== "all" || paymentCondition !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setCategory("all");
                  setSearch("");
                  setTransactionType("all");
                  setQuality("all");
                  setPaymentStatus("all");
                  setPaymentCondition("all");
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="size-3" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Quality / health filter chips */}
        <div className="border-t border-border/60 px-4 py-2 lg:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Filter className="size-3" /> Calidad
            </span>
            {([
              { id: "all",            label: "Todas",              icon: null },
              { id: "pending",        label: "Pendientes",         icon: Loader2,      cls: "text-muted-foreground" },
              { id: "high_confidence",label: "Alta confianza",     icon: CheckCircle2, cls: "text-emerald-600" },
              { id: "low_confidence", label: "Baja confianza",     icon: AlertTriangle, cls: "text-amber-600" },
              { id: "with_warnings",  label: "Con advertencias",   icon: ShieldAlert,  cls: "text-orange-600" },
              { id: "has_duplicates", label: "NCF duplicados",     icon: XCircle,      cls: "text-destructive" },
              ...(transactionType !== "expense"
                ? [{ id: "cancelled" as const, label: "Anuladas", icon: XCircle as React.ElementType, cls: "text-orange-600" }]
                : []),
              { id: "no_ncf",         label: "Sin NCF",            icon: Zap,          cls: "text-violet-600" },
            ] as { id: string; label: string; icon: React.ElementType | null; cls?: string }[]).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuality(q.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150",
                  quality === q.id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/60 bg-muted/50 text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground"
                )}
              >
                {q.icon && <q.icon className={cn("size-3", quality === q.id ? "text-primary-foreground" : q.cls)} />}
                {q.label}
              </button>
            ))}
            {invoicesQuery_data && (
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {invoicesQuery_data.total} resultado{invoicesQuery_data.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </Card>

      {selectedIds.length > 0 ? (
        <div className="sticky top-20 z-10 rounded-lg border bg-background/80 shadow-lg backdrop-blur-sm">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-xs font-medium text-foreground">{selectedIds.length} seleccionadas</span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" onClick={() => bulkProcessMutation.mutate()}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Procesar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => pushMutation.mutate()}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Integración
            </Button>
            {allIncomeSelected && !hasExpenseSelected && (
              <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => bulkCancelMutation.mutate()}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Anular (608)
              </Button>
            )}
            {hasExpenseSelected && (
              <span className="text-[10px] text-muted-foreground italic max-w-[200px] leading-tight">
                Las facturas de compra no pueden anularse
              </span>
            )}
            <Button size="sm" variant="destructive" onClick={() => bulkDeleteMutation.mutate()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Papelera
            </Button>
            <div className="h-4 w-px bg-border" />
            <Select value={selectedExportFormat ?? ""} onValueChange={(v) => setSelectedExportFormat(v)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Exportar..." />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMATS.map((fmt) => (
                  <SelectItem key={fmt.id} value={fmt.id} className="text-xs">
                    {fmt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="default" disabled={!selectedExportFormat || exporting} onClick={triggerExport}>
              {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              {exporting ? "Exportando..." : "Descargar"}
            </Button>
          </CardContent>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table className="min-w-full text-xs">
              <TableHeader className="bg-muted/80">
                <TableRow>
                  <TableHead className="px-4 py-3 text-left">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">NCF</TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Proveedor</TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Categoría</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Importe</TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Vencimiento</TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Pago / Banco</TableHead>
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    <ArrowUpDown className="size-3 inline-block mr-1" />
                    Tipo
                  </TableHead>
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Estado</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesQuery_isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j} className="px-3 py-3">
                          <Skeleton className={cn("h-4 rounded-md", j === 0 ? "size-4" : j === 5 ? "h-4 w-16 ml-auto" : j === 6 ? "h-5 w-16 mx-auto" : j === 7 ? "h-5 w-16 mx-auto" : j === 8 ? "h-5 w-16 ml-auto" : "h-4 w-full")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center">
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="mb-4 rounded-full bg-primary/10 p-4">
                          <FileText className="size-8 text-primary/40" />
                        </div>
                        <p className="mb-4 text-sm text-muted-foreground">No hay facturas para mostrar.</p>
                        <Button size="sm" onClick={() => router.push("/dashboard/upload")}>
                          Subir primera factura
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice, idx) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      selected={selectedIds.includes(invoice.id)}
                      onToggle={() => toggleOne(invoice.id)}
                      onOpen={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                      onProcess={() => processMutation.mutate(invoice.id)}
                      isProcessing={processingIds.has(invoice.id)}
                      isEven={idx % 2 === 1}
                      bankMap={bankMap}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <ManualInvoiceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSave={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
        onOpenAdvanced={(current) => {
          setAdvancedInitial(current);
          setManualOpen(false);
          setTimeout(() => setAdvancedOpen(true), 150);
        }}
      />
      <AdvancedInvoiceDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        onSave={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
        initial={advancedInitial}
        onBackToSimple={() => {
          setAdvancedOpen(false);
          setTimeout(() => setManualOpen(true), 150);
        }}
      />
    </div>
  );
}

function invoiceHealth(invoice: Invoice): "duplicate" | "warning" | "low_confidence" | "high_confidence" | "pending" | "ok" {
  if (!invoice.processed) return "pending";
  const raw = (() => {
    try { return invoice.raw_extracted_data ? JSON.parse(invoice.raw_extracted_data) : {}; }
    catch { return {}; }
  })();
  if (raw.warnings_reviewed === true) {
    const conf = invoice.confidence_score ?? 1;
    if (conf < 0.6) return "low_confidence";
    if (conf >= 0.85) return "high_confidence";
    return "ok";
  }
  const flags: string[] = (() => {
    try { return JSON.parse(invoice.audit_flags ?? "[]") as string[]; }
    catch { return []; }
  })();
  if (flags.some((f) => f.includes("COMPROBANTE DUPLICADO"))) return "duplicate";
  if (flags.length > 0) return "warning";
  const conf = invoice.confidence_score ?? 1;
  if (conf < 0.6) return "low_confidence";
  if (conf >= 0.85) return "high_confidence";
  return "ok";
}

const HEALTH_ROW: Record<string, string> = {
  duplicate:      "border-l-2 border-l-destructive bg-destructive/[0.025]",
  warning:        "border-l-2 border-l-orange-500 bg-orange-500/[0.025]",
  low_confidence: "border-l-2 border-l-amber-500 bg-amber-500/[0.025]",
  high_confidence:"",
  pending:        "border-l-2 border-l-muted-foreground/30",
  ok:             "",
};

const CANCELLED_ROW = "border-l-2 border-l-red-600/50 bg-red-500/[0.04] opacity-70";

const DGII_ROW: Record<string, string> = {
  confirmed_ncf: "ring-1 ring-inset ring-indigo-200/80",
  error: "ring-1 ring-inset ring-red-200/80",
  pending_confirm: "ring-1 ring-inset ring-amber-200/70",
  pending_upload: "ring-1 ring-inset ring-sky-200/70",
};

const TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  income:  { label: "Venta",  cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25" },
  expense: { label: "Compra", cls: "text-blue-600 bg-blue-500/10 border-blue-500/25" },
};

const CATEGORY_LABELS: Record<string, string> = {
  expense_01: "Gastos de Personal (01)",
  expense_02: "Gastos por Trabajos, Suministros y Servicios (02)",
  expense_03: "Arrendamientos (03)",
  expense_04: "Gastos de Activos Fijos (04)",
  expense_05: "Gastos de Representación (05)",
  expense_06: "Otras Deducciones Admitidas (06)",
  expense_07: "Gastos Financieros (07)",
  expense_08: "Gastos Extraordinarios (08)",
  expense_09: "Costos y Gastos de Operación (09)",
  expense_10: "Adquisiciones de Activos (10)",
  expense_11: "Gastos de Seguros (11)",
  income_01: "Ingresos por operaciones (No financieros) (01)",
  income_02: "Ingresos Financieros (02)",
  income_03: "Ingresos Extraordinarios (03)",
  income_04: "Ingresos por Arrendamientos (04)",
  income_05: "Ingresos por Venta de Activo Depreciable (05)",
  income_06: "Otros Ingresos (06)",
};

function categoryLabel(category: string | null, transactionType: string | null): string {
  if (!category) return "PENDIENTE";
  const key = `${transactionType || "expense"}_${category}`;
  return CATEGORY_LABELS[key] || category;
}

function HealthBadge({ invoice }: { invoice: Invoice }) {
  const h = invoiceHealth(invoice);
  const conf = invoice.confidence_score;
  const pct = conf != null ? Math.round(conf * 100) : null;

  if (invoice.cancelled_at) return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-400/50 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600 shadow-xs" title={invoice.cancellation_type ? `Tipo: ${invoice.cancellation_type}` : undefined}>
      <Ban className="size-3" /> Anulada
      {invoice.cancellation_type ? <span className="ml-0.5 text-[9px] text-red-400/70">({invoice.cancellation_type})</span> : null}
    </span>
  );

  if (h === "pending") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Loader2 className="size-2.5 animate-spin" /> Pendiente
    </span>
  );
  if (h === "duplicate") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
      <XCircle className="size-2.5" /> NCF Duplicado
    </span>
  );
  if (h === "warning") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
      <ShieldAlert className="size-2.5" /> Advertencia
    </span>
  );
  if (h === "low_confidence") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="size-2.5" /> {pct != null ? `${pct}%` : "Baja"}
    </span>
  );
  if (h === "high_confidence") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-2.5" /> {pct != null ? `${pct}%` : "Alta"}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <CheckCircle2 className="size-2.5 text-emerald-500" /> {pct != null ? `${pct}%` : "OK"}
    </span>
  );
}

function DgiiStatusBadge({ invoice }: { invoice: Invoice }) {
  const status = invoice.dgii_status;
  if (!status || status.status === "not_applicable") return null;

  const cfg: Record<
    NonNullable<Invoice["dgii_status"]>["status"],
    { icon: React.ElementType; className: string; label: string }
  > = {
    not_applicable: {
      icon: CheckCircle2,
      className: "border-border/50 bg-muted text-muted-foreground",
      label: "Sin formato DGII",
    },
    confirmed_ncf: {
      icon: ShieldCheck,
      className: "border-indigo-300 bg-indigo-50 text-indigo-700",
      label: "Reportado a DGII",
    },
    pending_upload: {
      icon: Clock3,
      className: "border-sky-300 bg-sky-50 text-sky-700",
      label: "Pendiente envío DGII",
    },
    pending_confirm: {
      icon: Clock3,
      className: "border-amber-300 bg-amber-50 text-amber-700",
      label: "Pendiente confirmación DGII",
    },
    error: {
      icon: ShieldX,
      className: "border-red-300 bg-red-50 text-red-700",
      label: "Error DGII",
    },
    excluded: {
      icon: Ban,
      className: "border-slate-300 bg-slate-100 text-slate-700",
      label: "Excluida DGII",
    },
    reported: {
      icon: CheckCircle2,
      className: "border-emerald-300 bg-emerald-50 text-emerald-700",
      label: "Reportada DGII",
    },
    pending_processing: {
      icon: Loader2,
      className: "border-border/60 bg-muted text-muted-foreground",
      label: "Pendiente procesamiento",
    },
    unreported: {
      icon: Clock3,
      className: "border-amber-300 bg-amber-50 text-amber-700",
      label: "Pendiente reporte DGII",
    },
  };

  const item = cfg[status.status];
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        item.className,
      )}
      title={status.label}
    >
      <Icon className={cn("size-2.5", status.status === "pending_processing" && "animate-spin")} />
      {item.label}
    </span>
  );
}

const ECF_TYPE_LABELS: Record<string, { label: string; short: string; cls: string }> = {
  "01": { label: "Crédito Fiscal", short: "Créd. Fiscal", cls: "text-indigo-600 bg-indigo-50 border-indigo-200/60 dark:text-indigo-400 dark:bg-indigo-950/20" },
  "31": { label: "Crédito Fiscal", short: "Créd. Fiscal", cls: "text-indigo-600 bg-indigo-50 border-indigo-200/60 dark:text-indigo-400 dark:bg-indigo-950/20" },
  "02": { label: "Consumo", short: "Consumo", cls: "text-slate-600 bg-slate-50 border-slate-200/60 dark:text-slate-400 dark:bg-slate-900/20" },
  "32": { label: "Consumo", short: "Consumo", cls: "text-slate-600 bg-slate-50 border-slate-200/60 dark:text-slate-400 dark:bg-slate-900/20" },
  "03": { label: "Nota de Débito", short: "Nota Débito", cls: "text-amber-600 bg-amber-50 border-amber-200/60 dark:text-amber-400 dark:bg-amber-950/20" },
  "33": { label: "Nota de Débito", short: "Nota Débito", cls: "text-amber-600 bg-amber-50 border-amber-200/60 dark:text-amber-400 dark:bg-amber-950/20" },
  "04": { label: "Nota de Crédito", short: "Nota Crédito", cls: "text-rose-600 bg-rose-50 border-rose-200/60 dark:text-rose-400 dark:bg-rose-950/20" },
  "34": { label: "Nota de Crédito", short: "Nota Crédito", cls: "text-rose-600 bg-rose-50 border-rose-200/60 dark:text-rose-400 dark:bg-rose-950/20" },
  "11": { label: "Compras", short: "Comp. Compras", cls: "text-teal-600 bg-teal-50 border-teal-200/60 dark:text-teal-400 dark:bg-teal-950/20" },
  "41": { label: "Compras", short: "Comp. Compras", cls: "text-teal-600 bg-teal-50 border-teal-200/60 dark:text-teal-400 dark:bg-teal-950/20" },
  "12": { label: "RUI", short: "RUI", cls: "text-cyan-600 bg-cyan-50 border-cyan-200/60 dark:text-cyan-400 dark:bg-cyan-950/20" },
  "42": { label: "RUI", short: "RUI", cls: "text-cyan-600 bg-cyan-50 border-cyan-200/60 dark:text-cyan-400 dark:bg-cyan-950/20" },
  "13": { label: "Gastos Menores", short: "G. Menores", cls: "text-emerald-600 bg-emerald-50 border-emerald-200/60 dark:text-emerald-400 dark:bg-emerald-950/20" },
  "43": { label: "Gastos Menores", short: "G. Menores", cls: "text-emerald-600 bg-emerald-50 border-emerald-200/60 dark:text-emerald-400 dark:bg-emerald-950/20" },
  "14": { label: "Reg. Especial", short: "Reg. Esp.", cls: "text-purple-600 bg-purple-50 border-purple-200/60 dark:text-purple-400 dark:bg-purple-950/20" },
  "44": { label: "Reg. Especial", short: "Reg. Esp.", cls: "text-purple-600 bg-purple-50 border-purple-200/60 dark:text-purple-400 dark:bg-purple-950/20" },
  "15": { label: "Gubernamental", short: "Gubernam.", cls: "text-blue-600 bg-blue-50 border-blue-200/60 dark:text-blue-400 dark:bg-blue-950/20" },
  "45": { label: "Gubernamental", short: "Gubernam.", cls: "text-blue-600 bg-blue-50 border-blue-200/60 dark:text-blue-400 dark:bg-blue-950/20" },
  "16": { label: "Exportación", short: "Export.", cls: "text-orange-600 bg-orange-50 border-orange-200/60 dark:text-orange-400 dark:bg-orange-950/20" },
  "46": { label: "Exportación", short: "Export.", cls: "text-orange-600 bg-orange-50 border-orange-200/60 dark:text-orange-400 dark:bg-orange-950/20" },
  "17": { label: "Pago Exterior", short: "Pago Ext.", cls: "text-pink-600 bg-pink-50 border-pink-200/60 dark:text-pink-400 dark:bg-pink-950/20" },
  "47": { label: "Pago Exterior", short: "Pago Ext.", cls: "text-pink-600 bg-pink-50 border-pink-200/60 dark:text-pink-400 dark:bg-pink-950/20" },
};

function getInvoiceTypeCode(invoice: Invoice): string | null {
  if (invoice.ecf_type) return invoice.ecf_type;
  const ncf = invoice.invoice_number?.trim().toUpperCase();
  if (ncf && ncf.length >= 3 && (ncf.startsWith("B") || ncf.startsWith("E"))) {
    const code = ncf.slice(1, 3);
    if (/^\d+$/.test(code)) return code;
  }
  return null;
}

function InvoiceRow({
  invoice,
  selected,
  onToggle,
  onOpen,
  onProcess,
  isProcessing,
  isEven,
  bankMap
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onProcess: () => void;
  isProcessing: boolean;
  isEven: boolean;
  bankMap: Map<string, string>;
}) {
  const h = invoiceHealth(invoice);
  const { formatDate, formatCurrency } = useUserPreferences();
  const date = formatDate(invoice.invoice_date);
  const amount = formatCurrency(invoice.total_amount, invoice.currency || "DOP");

  const isCancelled = !!invoice.cancelled_at;
  const typeStyle = invoice.transaction_type ? TYPE_STYLES[invoice.transaction_type] : null;

  return (
    <TableRow
      className={cn(
        "border-b border-border transition-colors duration-150",
        isCancelled ? "hover:bg-red-500/[0.06]" : "hover:bg-primary/5",
        selected ? "bg-primary/5" : isEven ? "bg-muted/30" : "",
        isCancelled ? CANCELLED_ROW : HEALTH_ROW[h] ?? "",
        DGII_ROW[invoice.dgii_status?.status || ""] ?? "",
      )}
    >
      <TableCell className="px-4 py-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className={cn("px-3 py-3", isCancelled ? "text-red-400/50" : "text-muted-foreground")}>{date}</TableCell>
      <TableCell className="px-3 py-3 font-mono text-[11px] font-medium text-foreground">
        <div className="flex flex-col gap-1">
          {invoice.invoice_number ? (
            <span className={cn(isCancelled ? "line-through text-red-500/60" : h === "duplicate" && "text-destructive font-semibold")}>
              {invoice.invoice_number}
            </span>
          ) : (
            <span className="text-muted-foreground/50 italic">sin NCF</span>
          )}
          {(() => {
            const typeCode = getInvoiceTypeCode(invoice);
            const style = typeCode ? ECF_TYPE_LABELS[typeCode] : null;
            if (!style) return null;
            return (
              <span className={cn("inline-flex w-fit items-center rounded-sm border px-1 py-0.5 text-[9px] font-medium tracking-tight", style.cls)}>
                {style.short} ({invoice.invoice_number?.[0] || 'B'}{typeCode})
              </span>
            );
          })()}
        </div>
      </TableCell>
      <TableCell 
        className={cn("px-3 py-3 cursor-pointer max-w-[180px] truncate", isCancelled ? "text-red-500/60 hover:text-red-500" : "text-foreground hover:text-primary")} 
        onClick={onOpen}
        title={invoice.vendor_name || ""}
      >
        {invoice.vendor_name || <span className="italic text-muted-foreground/60">Procesando...</span>}
      </TableCell>

      <TableCell className="px-3 py-3 max-w-[150px] truncate" title={categoryLabel(invoice.category, invoice.transaction_type)}>
        <Badge 
          variant={invoice.category ? "default" : "secondary"} 
          className={cn("max-w-full truncate block text-center", isCancelled && "opacity-50")}
        >
          {categoryLabel(invoice.category, invoice.transaction_type)}
        </Badge>
      </TableCell>
      <TableCell className={cn("px-3 py-3 text-right font-mono tabular-nums font-semibold", isCancelled ? "text-red-500/60 line-through" : "text-foreground")}>{amount}</TableCell>
      <TableCell className="px-3 py-3 text-muted-foreground font-mono text-[11px]">
        {invoice.due_date ? formatDate(invoice.due_date) : "—"}
      </TableCell>
      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-1">
          {invoice.payment_status ? (
            <Badge
              variant="outline"
              className={cn(
                "w-fit text-[9px] font-semibold py-px px-1.5 border",
                invoice.payment_status === "paid" && "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
                invoice.payment_status === "pending" && "bg-amber-500/10 text-amber-700 border-amber-500/20",
                invoice.payment_status === "overdue" && "bg-red-500/10 text-red-700 border-red-500/20"
              )}
            >
              {invoice.payment_status === "paid" && "Pagado"}
              {invoice.payment_status === "pending" && "Pendiente"}
              {invoice.payment_status === "overdue" && "Vencido"}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">—</span>
          )}
          {invoice.bank_account_id && bankMap.has(invoice.bank_account_id) && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-primary/60" />
              {bankMap.get(invoice.bank_account_id)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        {typeStyle ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", typeStyle.cls)}>
            {typeStyle.label}
          </span>
        ) : (
          <span className="text-muted-foreground/50 text-[10px]">—</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <HealthBadge invoice={invoice} />
          <DgiiStatusBadge invoice={invoice} />
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-right">
        {isCancelled ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-red-400/50">
            <Ban className="size-3" /> Inactiva
          </span>
        ) : isProcessing ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground ml-auto" />
        ) : !invoice.processed ? (
          <Button variant="ghost" size="icon-sm" onClick={onProcess} title="Procesar">
            <Play className="size-3.5" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
