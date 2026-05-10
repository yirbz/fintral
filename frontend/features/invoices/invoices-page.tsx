"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Play, Plus, Search, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: ["invoices", search, transactionType],
    queryFn: () =>
      listInvoices({
        search: search || undefined,
        transaction_type: transactionType === "all" ? undefined : transactionType || undefined
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
    mutationFn: (invoiceId: string) => processInvoice(invoiceId),
    onSuccess: refresh
  });

  const bulkProcessMutation = useMutation({
    mutationFn: () => bulkProcess(selectedIds),
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => bulkDelete(selectedIds),
    onSuccess: async () => {
      setSelectedIds([]);
      await refresh();
    }
  });

  const pushMutation = useMutation({
    mutationFn: () => pushWebhook(selectedIds),
    onSuccess: () => setSelectedIds([])
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createInvoice>[0]) => createInvoice(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    }
  });

  async function processAllPending() {
    const pending = invoices.filter((invoice) => !invoice.processed);
    for (const invoice of pending) {
      await processMutation.mutateAsync(invoice.id);
    }
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
              Manual
            </Button>
          </div>
        </CardHeader>
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
              Borrar
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
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice, idx) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    selected={selectedIds.includes(invoice.id)}
                    onToggle={() => toggleOne(invoice.id)}
                    onOpen={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                    isEven={idx % 2 === 1}
                  />
                ))}
              </TableBody>
            </Table>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 rounded-full bg-primary/10 p-4">
                  <FileText className="size-8 text-primary/40" />
                </div>
                <p className="mb-4 text-sm text-muted-foreground">No hay facturas para mostrar.</p>
                <Button size="sm" onClick={() => router.push("/dashboard/upload")}>
                  Subir primera factura
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <ManualInvoiceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSave={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}

function InvoiceRow({
  invoice,
  selected,
  onToggle,
  onOpen,
  isEven
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  isEven: boolean;
}) {
  const date = invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("es-DO") : "-";
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: invoice.currency || "USD",
    maximumFractionDigits: 2
  }).format(invoice.total_amount ?? 0);

  return (
    <TableRow
      className={`border-b border-border transition-colors duration-150 ${
        selected ? "bg-primary/5 border-l-2 border-l-primary" : isEven ? "bg-muted/30" : ""
      } hover:bg-primary/5`}
    >
      <TableCell className="px-4 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
        />
      </TableCell>
      <TableCell className="px-3 py-3 text-muted-foreground">{date}</TableCell>
      <TableCell className="px-3 py-3 font-medium text-foreground">{invoice.invoice_number || "---"}</TableCell>
      <TableCell className="px-3 py-3 cursor-pointer text-foreground hover:text-primary" onClick={onOpen}>
        {invoice.vendor_name || "Procesando..."}
      </TableCell>
      <TableCell className="px-3 py-3">
        <Badge variant={invoice.category ? "default" : "secondary"}>{invoice.category || "PENDIENTE"}</Badge>
      </TableCell>
      <TableCell className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-foreground">{amount}</TableCell>
      <TableCell className="px-3 py-3 text-center">
        <Badge variant={invoice.processed ? "default" : "secondary"}>
          {invoice.processed ? "Procesado" : "Pendiente"}
        </Badge>
      </TableCell>
    </TableRow>
  );
}