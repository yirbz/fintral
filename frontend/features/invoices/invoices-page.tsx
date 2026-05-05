"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, Send, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Invoice } from "@/lib/types";

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
  const [transactionType, setTransactionType] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const invoicesQuery = useQuery({
    queryKey: ["invoices", search, transactionType],
    queryFn: () =>
      listInvoices({
        search: search || undefined,
        transaction_type: transactionType || undefined
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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Registro de Facturas</CardTitle>
            <p className="text-xs text-muted-foreground">Busca, filtra y procesa en lote.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              placeholder="Buscar proveedor o NCF"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              className="w-44"
              value={transactionType}
              onChange={(event) => setTransactionType(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Gastos</option>
            </Select>
            <Button variant="secondary" onClick={() => void processAllPending()}>
              <Play className="mr-2 h-4 w-4" />
              Procesar pendientes
            </Button>
          </div>
        </CardHeader>
      </Card>

      {selectedIds.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <p className="text-xs font-semibold">{selectedIds.length} seleccionadas</p>
            <Button size="sm" variant="secondary" onClick={() => bulkProcessMutation.mutate()}>
              <Play className="mr-1 h-3 w-3" />
              Procesar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => pushMutation.mutate()}>
              <Send className="mr-1 h-3 w-3" />
              Webhook
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkDeleteMutation.mutate()}
              className="text-rose-700"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Borrar
            </Button>
            {EXPORT_FORMATS.map((format) => (
              <Button key={format} size="sm" variant="outline" onClick={() => triggerExport(format)}>
                <Download className="mr-1 h-3 w-3" />
                {format}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="px-2 py-3 text-left">Fecha</th>
                  <th className="px-2 py-3 text-left">NCF</th>
                  <th className="px-2 py-3 text-left">Proveedor</th>
                  <th className="px-2 py-3 text-left">Categoría</th>
                  <th className="px-2 py-3 text-right">Importe</th>
                  <th className="px-2 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    selected={selectedIds.includes(invoice.id)}
                    onToggle={() => toggleOne(invoice.id)}
                    onOpen={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                  />
                ))}
              </tbody>
            </table>
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No hay facturas para mostrar.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InvoiceRow({
  invoice,
  selected,
  onToggle,
  onOpen
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const date = invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("es-DO") : "-";
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: invoice.currency || "USD",
    maximumFractionDigits: 2
  }).format(invoice.total_amount ?? 0);

  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-2 py-3">{date}</td>
      <td className="px-2 py-3 font-semibold">{invoice.invoice_number || "---"}</td>
      <td className="px-2 py-3 cursor-pointer text-foreground" onClick={onOpen}>
        {invoice.vendor_name || "Procesando..."}
      </td>
      <td className="px-2 py-3">{invoice.category || "PENDIENTE"}</td>
      <td className="px-2 py-3 text-right font-semibold">{amount}</td>
      <td className="px-2 py-3 text-center">
        <Badge variant={invoice.processed ? "success" : "warning"}>
          {invoice.processed ? "Procesado" : "Pendiente"}
        </Badge>
      </td>
    </tr>
  );
}
