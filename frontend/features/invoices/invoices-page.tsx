"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileImage, FileText, Filter, Loader2, Play, Plus, Search, Send, ShieldAlert, Trash2, XCircle, Zap } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  bulkDelete,
  bulkProcess,
  exportUrl,
  listInvoices,
  processInvoice,
  pushWebhook
} from "@/lib/api/invoices";
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
import type { CreateInvoicePayload } from "@/lib/api/invoices";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EXPORT_FORMATS = [
  "csv",
  "excel",
  "quickbooks_bills",
  "xero",
  "odoo",
  "contaplus",
  "json",
  "dgii_606"
] as const;

export function InvoicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [transactionType, setTransactionType] = useState("all");
  const [quality, setQuality] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedInitial, setAdvancedInitial] = useState<Partial<CreateInvoicePayload> | undefined>(undefined);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const invoicesQuery = useQuery({
    queryKey: ["invoices", search, transactionType, quality],
    queryFn: () =>
      listInvoices({
        search: search || undefined,
        transaction_type: transactionType === "all" ? undefined : transactionType || undefined,
        quality: quality === "all" ? undefined : quality,
      })
  });

  const invoices = invoicesQuery.data?.invoices ?? [];
  const allSelected = useMemo(
    () => selectedIds.length > 0 && invoices.length > 0 && selectedIds.length === invoices.length,
    [invoices.length, selectedIds.length]
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

  const pushMutation = useMutation({
    mutationFn: async () => {
      const promise = pushWebhook(selectedIds);
      toast.promise(promise, {
        loading: `Enviando ${selectedIds.length} facturas...`,
        success: (data) => data?.status === "ok" ? "Webhook enviado exitosamente" : "Webhook enviado",
        error: (err) => err instanceof Error ? err.message : "Error al enviar webhook",
      });
      return promise;
    },
    onSuccess: () => setSelectedIds([])
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

  function triggerExport(format: (typeof EXPORT_FORMATS)[number]) {
    if (selectedIds.length === 0) return;
    window.location.href = exportUrl(format, selectedIds);
  }

  return (
    <div className="flex flex-col gap-4">
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
                  <SelectItem value="income">Ingresos</SelectItem>
                  <SelectItem value="expense">Gastos</SelectItem>
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
              { id: "no_ncf",         label: "Sin NCF",            icon: Zap,          cls: "text-violet-600" },
            ] as { id: string; label: string; icon: React.ElementType | null; cls?: string }[]).map((q) => (
              <button
                key={q.id}
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
            {invoicesQuery.data && (
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {invoicesQuery.data.total} resultado{invoicesQuery.data.total !== 1 ? "s" : ""}
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
              Webhook
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkDeleteMutation.mutate()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Papelera
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex flex-wrap gap-1.5">
              {EXPORT_FORMATS.map((format) => (
                <Button key={format} size="sm" variant="outline" className="text-xs" onClick={() => triggerExport(format)}>
                  {format}
                </Button>
              ))}
            </div>
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
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Tipo</TableHead>
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Estado</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j} className="px-3 py-3">
                          <Skeleton className={cn("h-4 rounded-md", j === 0 ? "size-4" : j === 5 ? "h-4 w-16 ml-auto" : j === 6 ? "h-5 w-16 mx-auto" : j === 7 ? "h-5 w-16 mx-auto" : j === 8 ? "h-5 w-16 ml-auto" : "h-4 w-full")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center">
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

function HealthBadge({ invoice }: { invoice: Invoice }) {
  const h = invoiceHealth(invoice);
  const conf = invoice.confidence_score;
  const pct = conf != null ? Math.round(conf * 100) : null;

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
  // ok
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <CheckCircle2 className="size-2.5 text-emerald-500" /> {pct != null ? `${pct}%` : "OK"}
    </span>
  );
}

function InvoiceRow({
  invoice,
  selected,
  onToggle,
  onOpen,
  onProcess,
  isProcessing,
  isEven
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onProcess: () => void;
  isProcessing: boolean;
  isEven: boolean;
}) {
  const h = invoiceHealth(invoice);
  const date = invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("es-DO") : "-";
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: invoice.currency || "USD",
    maximumFractionDigits: 2
  }).format(invoice.total_amount ?? 0);

  return (
    <TableRow
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-primary/5",
        selected ? "bg-primary/5" : isEven ? "bg-muted/30" : "",
        HEALTH_ROW[h] ?? "",
      )}
    >
      <TableCell className="px-4 py-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="px-3 py-3 text-muted-foreground">{date}</TableCell>
      <TableCell className="px-3 py-3 font-mono text-[11px] font-medium text-foreground">
        {invoice.invoice_number
          ? <span className={cn(h === "duplicate" && "text-destructive font-semibold")}>{invoice.invoice_number}</span>
          : <span className="text-muted-foreground/50 italic">sin NCF</span>}
      </TableCell>
      <TableCell className="px-3 py-3 cursor-pointer text-foreground hover:text-primary" onClick={onOpen}>
        {invoice.vendor_name || <span className="italic text-muted-foreground/60">Procesando...</span>}
      </TableCell>
      <TableCell className="px-3 py-3">
        <Badge variant={invoice.category ? "default" : "secondary"}>{invoice.category || "PENDIENTE"}</Badge>
      </TableCell>
      <TableCell className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-foreground">{amount}</TableCell>
      <TableCell className="px-3 py-3 text-center">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {invoice.file_type === "image" ? <FileImage className="size-3.5" /> : <FileText className="size-3.5" />}
          <span className="text-[11px]">{invoice.file_type === "image" ? "IMG" : invoice.file_type?.toUpperCase() ?? "PDF"}</span>
        </span>
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        <HealthBadge invoice={invoice} />
      </TableCell>
      <TableCell className="px-3 py-3 text-right">
        {isProcessing ? (
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
