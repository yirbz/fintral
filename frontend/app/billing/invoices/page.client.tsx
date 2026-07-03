"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  FileText,
  Printer,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  X,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Zap,
} from "lucide-react";
import { archiveInvoice } from "@/lib/api/invoices";

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "verified", label: "Emitida / Aprobada" },
  { value: "pending", label: "Procesando" },
  { value: "rejected", label: "Rechazada" },
] as const;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);

function StatusBadge({ status, isEcf }: { status: string; isEcf: boolean }) {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <CheckCircle2 className="size-3" />
          {isEcf ? "Aprobado DGII" : "Emitida"}
        </Badge>
      );
    case "draft":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <Clock className="size-3" /> Borrador
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <Loader2 className="size-3 animate-spin" /> Procesando
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
          <AlertCircle className="size-3" /> Rechazado
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function InvoicesPageClient() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [isEcfAuthorized, setIsEcfAuthorized] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"date" | "total" | "ncf">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [invData, statusData] = await Promise.all([
        billingApi.getInvoices(),
        billingApi.getVerificationStatus(),
      ]);
      setInvoices(invData);
      setIsEcfAuthorized(statusData.is_ecf_authorized);
    } catch (err: any) {
      toast.error("Error al cargar facturas: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDiscard = async (id: string) => {
    if (!confirm("¿Está seguro de que desea descartar este borrador? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      setDiscardingId(id);
      await archiveInvoice(id);
      toast.success("Borrador descartado correctamente.");
      fetchData();
    } catch (err: any) {
      toast.error("Error al descartar borrador: " + (err.message || "Error desconocido"));
    } finally {
      setDiscardingId(null);
    }
  };

  // ─── Filtering & Sorting ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...invoices];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((inv) => inv.status === statusFilter);
    }

    // Text search (NCF or client name)
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (inv) =>
          (inv.invoice_number || "").toLowerCase().includes(q) ||
          (inv.client?.name || "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        const da = a.invoice_date ? new Date(a.invoice_date).getTime() : 0;
        const db = b.invoice_date ? new Date(b.invoice_date).getTime() : 0;
        cmp = da - db;
      } else if (sortField === "total") {
        cmp = a.total_amount - b.total_amount;
      } else {
        cmp = (a.invoice_number || "").localeCompare(b.invoice_number || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [invoices, statusFilter, search, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: "date" | "total" | "ncf") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter]);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Facturas
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEcfAuthorized
              ? "Comprobantes fiscales electrónicos y su estado ante la DGII"
              : "Todas las facturas registradas en el sistema"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/billing/quick" passHref>
            <Button variant="outline" className="h-8 rounded-md text-xs gap-1.5 px-3">
              <Zap className="size-3.5 text-emerald-600" />
              Factura Rápida (POS)
            </Button>
          </Link>
          <Link href="/billing/emit" passHref>
            <Button className="h-8 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 px-3">
              <FileText className="size-3.5" />
              Factura Detallada (A4)
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por NCF o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 pr-8 text-sm border-border/60"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[170px] text-xs border-border/60">
              <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Results count ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {loading ? "Cargando..." : `${filtered.length} factura(s)`}
          {statusFilter !== "all" && ` · ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label.toLowerCase()}`}
          {search && ` · buscando "${search}"`}
        </p>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FileText className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {search || statusFilter !== "all"
                ? "No se encontraron facturas con esos filtros."
                : "No hay facturas registradas."}
            </p>
            {(search || statusFilter !== "all") && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="mt-2 text-xs"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="text-xs cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("ncf")}
                    >
                      <span className="flex items-center gap-1">
                        NCF / Número
                        {sortField === "ncf" && (
                          <ArrowUpDown className="size-3" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead
                      className="text-xs cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("date")}
                    >
                      <span className="flex items-center gap-1">
                        Fecha
                        {sortField === "date" && (
                          <ArrowUpDown className="size-3" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-xs text-right cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("total")}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Total
                        {sortField === "total" && (
                          <ArrowUpDown className="size-3" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs text-right pr-6">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs font-semibold py-3">
                        {invoice.invoice_number || (
                          <span className="text-muted-foreground italic text-[11px]">
                            Borrador
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-3">
                        {invoice.client?.name || "Consumidor Final"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">
                        {invoice.invoice_date
                          ? new Date(invoice.invoice_date).toLocaleDateString("es-DO")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-right py-3">
                        {formatCurrency(invoice.total_amount)}
                      </TableCell>
                      <TableCell className="py-3">
                        <StatusBadge
                          status={invoice.status}
                          isEcf={isEcfAuthorized && !!invoice.is_electronic}
                        />
                      </TableCell>
                      <TableCell className="text-right pr-6 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View detail */}
                          <Link
                            href={`/billing/invoices/${invoice.id}`}
                            passHref
                          >
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 w-7 p-0"
                              title="Ver detalle"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                          </Link>

                          {/* Emitir (drafts only) */}
                          {invoice.status === "draft" && (
                            <>
                              {(() => {
                                let raw: any = null;
                                try { raw = JSON.parse(invoice.raw_extracted_data || "null"); } catch {}
                                const isQuick = raw?.mode === "quick";
                                const editUrl = isQuick
                                  ? `/billing/quick?draftId=${invoice.id}`
                                  : `/billing/emit?invoiceId=${invoice.id}`;
                                return (
                                  <Link href={editUrl} passHref>
                                    <Button
                                      className={`h-7 text-[11px] px-2 rounded-md ${
                                        isEcfAuthorized
                                          ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                                          : "border-border/80 text-foreground hover:bg-muted"
                                      }`}
                                      size="xs"
                                      variant={isEcfAuthorized ? "default" : "outline"}
                                    >
                                      <Edit3 className="size-3 mr-1" />
                                      {isEcfAuthorized ? "Editar y Timbrar" : "Editar y Emitir"}
                                    </Button>
                                  </Link>
                                );
                              })()}

                              <Button
                                onClick={() => handleDiscard(invoice.id)}
                                disabled={discardingId === invoice.id}
                                variant="ghost"
                                size="xs"
                                className="h-7 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md px-2"
                              >
                                {discardingId === invoice.id ? (
                                  <Loader2 className="size-3 animate-spin mr-1" />
                                ) : (
                                  <Trash2 className="size-3 mr-1" />
                                )}
                                Descartar
                              </Button>
                            </>
                          )}

                          {/* Print ticket */}
                          {invoice.status === "verified" && (
                            <Link
                              href={`/billing/invoices/${invoice.id}/print`}
                              passHref
                              target="_blank"
                            >
                              <Button
                                variant="outline"
                                className="h-7 text-[11px] border-border/80 text-foreground hover:bg-muted rounded-md px-2"
                                size="xs"
                              >
                                <Printer className="size-3 mr-1" />
                                Ticket
                              </Button>
                            </Link>
                          )}

                          {/* Re-editar (físico) */}
                          {invoice.status === "verified" && !invoice.is_electronic && (
                            <Link href={`/billing/emit?invoiceId=${invoice.id}&action=reemit`} passHref>
                              <Button
                                variant="outline"
                                size="xs"
                                className="h-7 text-[11px] border-amber-500/30 text-amber-600 hover:bg-amber-50 rounded-md px-2"
                              >
                                <RefreshCw className="size-3 mr-1" />
                                Re-editar
                              </Button>
                            </Link>
                          )}

                          {/* Corregir (e-CF) */}
                          {invoice.status === "verified" && invoice.is_electronic && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 text-[11px] text-muted-foreground hover:text-foreground rounded-md px-2"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  invoiceId: invoice.id,
                                  action: "correct",
                                });
                                window.location.href = `/billing/emit?${params}`;
                              }}
                            >
                              <Edit3 className="size-3 mr-1" />
                              Corregir (NC)
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
                <p className="text-[11px] text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 w-7 p-0"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 w-7 p-0"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
