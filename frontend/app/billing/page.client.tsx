"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusCircle,
  FileText,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Printer,
  Send,
  Loader2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { VerificationBanner } from "@/components/billing/verification-banner";

export default function BillingDashboard() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [transmittingId, setTransmittingId] = useState<string | null>(null);
  const [isEcfAuthorized, setIsEcfAuthorized] = useState<boolean>(true);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getInvoices();
      setInvoices(data);
    } catch (err: any) {
      toast.error("Error al cargar facturas: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const status = await billingApi.getVerificationStatus();
      setIsEcfAuthorized(status.is_ecf_authorized);
    } catch (err) {
      console.error("Error checking verification status:", err);
      setIsEcfAuthorized(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchVerificationStatus();
  }, []);

  const handleTransmit = async (id: string) => {
    try {
      setTransmittingId(id);
      toast.info("Emitiendo y certificando factura ante la DGII...");
      const result = await billingApi.transmitInvoice(id);
      toast.success(`Factura emitida con éxito. NCF: ${result.invoice.invoice_number}`);
      fetchInvoices();
    } catch (err: any) {
      toast.error("Error al emitir factura: " + (err.message || "Error desconocido"));
    } finally {
      setTransmittingId(null);
    }
  };

  // Calculations
  const totalInvoiced = invoices
    .filter((inv) => inv.status === "verified")
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const totalTax = invoices
    .filter((inv) => inv.status === "verified")
    .reduce((sum, inv) => sum + inv.tax_amount, 0);

  const draftCount = invoices.filter((inv) => inv.status === "draft").length;
  const verifiedCount = invoices.filter((inv) => inv.status === "verified").length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 flex items-center gap-1 w-fit text-[11px] h-5 px-2">
            <CheckCircle2 className="size-3" /> Aprobado DGII
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
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Fintral Factura
          </h2>
          <p className="text-sm text-muted-foreground">
            Emisión de facturas y comprobantes fiscales con certificación de la DGII en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/billing/emit" passHref>
            <Button className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3">
              <Zap className="size-3.5" />
              Nueva e-CF
            </Button>
          </Link>
          <Link href="/billing/quick" passHref>
            <Button variant="outline" className="h-8 rounded-md border-border text-foreground hover:bg-muted text-xs gap-1.5 px-3">
              <PlusCircle className="size-3.5" />
              Rápida (clásico)
            </Button>
          </Link>
        </div>
      </div>

      {!isEcfAuthorized && <VerificationBanner />}

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/50 bg-card/50 backdrop-blur-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Facturado (Aprobado)
            </CardTitle>
            <DollarSign className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl font-bold text-foreground">
                {formatCurrency(totalInvoiced)}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Ingresos sincronizados con el Hub
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/50 backdrop-blur-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              ITBIS Recaudado
            </CardTitle>
            <TrendingUp className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl font-bold text-foreground">
                {formatCurrency(totalTax)}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Para reporte fiscal del Formato 607
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/50 backdrop-blur-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Facturas Emitidas
            </CardTitle>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-xl font-bold text-foreground">{verifiedCount}</div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Aprobadas por la DGII
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card/50 backdrop-blur-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Borradores Pendientes
            </CardTitle>
            <Clock className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-xl font-bold text-foreground">{draftCount}</div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Pendientes de emisión
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices Table */}
      <Card className="border border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Facturas Recientes</CardTitle>
          <CardDescription className="text-xs">
            Lista de las últimas facturas creadas y su estado de certificación fiscal.
          </CardDescription>
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
              <Link href="/billing/quick" passHref className="mt-3">
                <Button size="xs" variant="outline" className="h-7 text-[11px]">
                  Crear mi primera factura
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Número / NCF</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs">Estado Fiscal</TableHead>
                    <TableHead className="text-xs text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs font-semibold py-3">
                        {invoice.invoice_number || (
                          <span className="text-muted-foreground italic text-[11px]">Borrador</span>
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
                      <TableCell className="py-3">{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right pr-6 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {invoice.status === "draft" && (
                            <Button
                              onClick={() => handleTransmit(invoice.id)}
                              disabled={transmittingId === invoice.id}
                              className="h-7 text-[11px] bg-emerald-600 text-white hover:bg-emerald-600/90 rounded-md px-2"
                              size="xs"
                            >
                              {transmittingId === invoice.id ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : (
                                <Send className="size-3 mr-1" />
                              )}
                              Emitir
                            </Button>
                          )}
                          {invoice.status === "verified" && (
                            <Link href={`/billing/invoices/${invoice.id}/print`} passHref target="_blank">
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
    </div>
  );
}
