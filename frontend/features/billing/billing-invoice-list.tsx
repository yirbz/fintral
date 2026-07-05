"use client";

import Link from "next/link";
import {
  FileText,
  Send,
  Printer,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillingInvoice } from "@/lib/api/billing";

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

interface InvoiceListProps {
  invoices: BillingInvoice[];
  loading: boolean;
  isEcfAuthorized: boolean;
}

export function InvoiceList({
  invoices,
  loading,
  isEcfAuthorized,
}: InvoiceListProps) {
  return (
    <Card className="border border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              {isEcfAuthorized ? "Comprobantes Electrónicos" : "Facturas"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isEcfAuthorized
                ? "Facturas timbradas ante la DGII y su estado fiscal"
                : "Lista de facturas registradas en el sistema"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Link href={isEcfAuthorized ? "/billing/emit" : "/billing/quick"} passHref>
              <Button size="sm" className="h-7 text-[11px] gap-1">
                <FileText className="size-3" />
                Nueva
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <FileText className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              No hay facturas emitidas en esta organización.
            </p>
            <Link
              href={isEcfAuthorized ? "/billing/emit" : "/billing/quick"}
              passHref
              className="mt-3"
            >
              <Button size="xs" variant="outline" className="h-7 text-[11px]">
                Crear{" "}
                {isEcfAuthorized ? "primera e-CF" : "primera factura"}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">NCF / Número</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs text-right pr-6">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
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
                        ? new Date(invoice.invoice_date).toLocaleDateString(
                            "es-DO"
                          )
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
                        {/* Emitir / Timbrado */}
                        {invoice.status === "draft" && (
                          (() => {
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
                          })()
                        )}

                        {/* Ticket / Print */}
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
        )}
      </CardContent>
    </Card>
  );
}
