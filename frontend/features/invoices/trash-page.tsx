"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ChevronLeft, ChevronRight, FileText, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { bulkRestore, listTrashedInvoices, restoreInvoice } from "@/lib/api/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
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
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TrashPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(10);
  const [skip, setSkip] = useState(0);


  const {data: trashQuery_data, isLoading: trashQuery_isLoading} = useQuery({
    queryKey: ["invoices", "trash", skip, limit],
    queryFn: () => listTrashedInvoices(skip, limit),
  });

  const total = trashQuery_data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  const invoices = useMemo(() => {
    if (!search) return trashQuery_data?.invoices ?? [];
    const q = search.toLowerCase();
    return (trashQuery_data?.invoices ?? []).filter(
      (inv) =>
        (inv.vendor_name ?? "").toLowerCase().includes(q) ||
        (inv.invoice_number ?? "").toLowerCase().includes(q) ||
        (inv.vendor_tax_id ?? "").toLowerCase().includes(q)
    );
  }, [trashQuery_data?.invoices, search]);

  const allSelected = useMemo(
    () => selectedIds.length > 0 && invoices.length > 0 && selectedIds.length === invoices.length,
    [invoices.length, selectedIds.length],
  );

  const refresh = async () => {
    queryClient.removeQueries({ queryKey: ["invoice"] });
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const openDetail = (invoiceId: string) => {
    router.push(`/dashboard/invoices/${invoiceId}`);
  };

  const restoreSingleMutation = useMutation({
    mutationFn: (id: string) => restoreInvoice(id),
    onSuccess: () => {
      toast.success("Factura restaurada exitosamente");
      setSelectedIds([]);
      void refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al restaurar"),
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: () => bulkRestore(selectedIds),
    onSuccess: async (data) => {
      toast.success(`${data.count} facturas restauradas`);
      setSelectedIds([]);
      await refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al restaurar"),
  });

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(invoices.map((inv) => inv.id));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function goToPage(page: number) {
    setSkip((page - 1) * limit);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <CardTitle className="text-lg">Archivo</CardTitle>
              <p className="text-xs text-muted-foreground">
                Facturas archivadas. Puedes restaurarlas cuando quieras.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/invoices")}>
              <ArchiveRestore className="size-4" data-icon="inline-start" />
              Volver a facturas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 border-t pt-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar proveedor, NCF o número..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSkip(0);
              }}
              className="pl-8 h-7"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mostrar:</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => {
                setLimit(Number(v));
                setSkip(0);
              }}
            >
              <SelectTrigger className="h-7 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {currentPage} / {totalPages || 1}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedIds.length > 0 ? (
        <div className="sticky top-20 z-10 rounded-lg border bg-background/80 shadow-lg backdrop-blur-sm">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-xs font-medium text-foreground">{selectedIds.length} seleccionadas</span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" onClick={() => bulkRestoreMutation.mutate()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restaurar
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
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Proveedor
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    NCF
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Importe
                  </TableHead>
                  <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Eliminada hace
                  </TableHead>

                  <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trashQuery_isLoading ? (
                  Array.from({ length: limit }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j} className="px-3 py-3">
                          <Skeleton className={cn("h-4 rounded-md", j === 0 ? "size-4" : j === 4 ? "h-4 w-20 mx-auto" : j === 5 ? "h-4 w-24 mx-auto" : j === 6 ? "h-6 w-16 ml-auto" : "h-4 w-full")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="mb-4 rounded-full bg-muted p-4">
                          <Trash2 className="size-8 text-muted-foreground/40" />
                        </div>
                        <p className="mb-1 text-sm text-muted-foreground">
                          {search ? "No se encontraron resultados" : "El archivo está vacío"}
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                          {search ? "Intenta con otros términos" : "Las facturas archivadas aparecerán aquí."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TrashRow
                      key={invoice.id}
                      invoice={invoice}
                      selected={selectedIds.includes(invoice.id)}
                      onToggle={() => toggleOne(invoice.id)}
                      onRestore={() => restoreSingleMutation.mutate(invoice.id)}
                      onViewDetail={() => openDetail(invoice.id)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrashRow({
  invoice,
  selected,
  onToggle,
  onRestore,
  onViewDetail,
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onViewDetail: () => void;
}) {
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: invoice.currency || "USD",
    maximumFractionDigits: 2,
  }).format(invoice.total_amount ?? 0);

  const deletedAt = invoice.deleted_at
    ? new Date(invoice.deleted_at).toLocaleDateString("es-DO", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return (
    <TableRow
      className={`border-b border-border transition-colors duration-150 ${selected ? "bg-primary/5 border-l-2 border-l-primary" : ""} hover:bg-primary/5`}
    >
      <TableCell className="px-4 py-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="px-3 py-3 text-foreground">
        {invoice.vendor_name || "---"}
      </TableCell>
      <TableCell className="px-3 py-3 font-medium text-muted-foreground">
        {invoice.invoice_number || "---"}
      </TableCell>
      <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-foreground">
        {amount}
      </TableCell>
      <TableCell className="px-3 py-3 text-center text-muted-foreground">
        {deletedAt}
      </TableCell>
      <TableCell className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onViewDetail} title="Ver detalles">
            <FileText className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRestore} title="Restaurar">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
