"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Printer, FileCode, CheckCircle2, Clock, XCircle, AlertCircle, Save, Zap, Layers } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { billingApi } from "@/lib/api/billing";

interface PageClientProps {
  id: string;
}

const CONSUMIDOR_FINAL_RNC = "132109122";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);
}

const formatRnc = (rnc?: string) => {
  if (!rnc) return "";
  const clean = rnc.replace(/[^0-9]/g, "");
  if (clean.length === 9) {
    return `${clean.substring(0, 3)}-${clean.substring(3, 8)}-${clean.substring(8)}`;
  }
  if (clean.length === 11) {
    return `${clean.substring(0, 3)}-${clean.substring(3, 10)}-${clean.substring(10)}`;
  }
  return rnc;
};

export default function InvoiceDetailPageClient({ id }: PageClientProps) {
  const router = useRouter();

  const { data: invoice, isLoading: isInvoiceLoading, error } = useQuery({
    queryKey: ["billing-invoice-detail", id],
    queryFn: () => billingApi.getInvoice(id),
  });

  const { data: org, isLoading: isOrgLoading } = useQuery({
    queryKey: ["billing-organization-detail"],
    queryFn: () => billingApi.getOrganization().catch(() => null),
  });

  const parsedRaw = useMemo(() => {
    if (!invoice?.raw_extracted_data) return null;
    try {
      return JSON.parse(invoice.raw_extracted_data);
    } catch {
      return null;
    }
  }, [invoice]);

  const items = useMemo(() => {
    if (invoice?.line_items && invoice.line_items.length > 0) {
      return invoice.line_items;
    }
    if (parsedRaw?.items && parsedRaw.items.length > 0) {
      return parsedRaw.items.map((item: any, idx: number) => ({
        line: idx + 1,
        name: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_rate: item.discount_rate ?? 0,
        tax_rate: item.tax_rate ?? 18,
        total: item.quantity * item.unit_price * (1 - (item.discount_rate ?? 0) / 100),
      }));
    }
    return [];
  }, [invoice, parsedRaw]);

  if (isInvoiceLoading) {
    return (
      <div className="flex-1 p-4 md:p-8 pt-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b pb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <Card>
          <CardContent className="p-8 space-y-6">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex-1 p-4 md:p-8 pt-6 max-w-4xl mx-auto text-center space-y-4">
        <AlertCircle className="size-12 mx-auto text-destructive" />
        <h2 className="text-lg font-bold">Error al cargar la factura</h2>
        <p className="text-muted-foreground text-sm">
          No se pudo encontrar el comprobante solicitado o no tiene permisos de acceso.
        </p>
        <Link href="/billing/invoices">
          <Button variant="outline" className="gap-2 mt-4">
            <ArrowLeft className="size-4" /> Volver a Facturas
          </Button>
        </Link>
      </div>
    );
  }

  const isQuick = parsedRaw?.mode === "quick";
  const editUrl = isQuick ? `/billing/quick?draftId=${invoice.id}` : `/billing/emit?draftId=${invoice.id}`;

  const buyerName = invoice.client?.name || parsedRaw?.buyer_name || "Consumidor Final";
  const buyerRnc = invoice.rnc_comprador || invoice.client?.tax_id || parsedRaw?.buyer_rnc || CONSUMIDOR_FINAL_RNC;
  const buyerAddress = invoice.client?.address || parsedRaw?.buyer_address || "";

  // Compute subtotal, discount, tax
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  items.forEach((item: any) => {
    const gross = item.quantity * item.unit_price;
    const disc = gross * ((item.discount_rate ?? 0) / 100);
    const net = gross - disc;
    const tax = net * ((item.tax_rate ?? 18) / 100);
    subtotal += gross;
    totalDiscount += disc;
    totalTax += tax;
  });

  const grandTotal = invoice.total_amount || (subtotal - totalDiscount + totalTax);

  const getEcfTypeName = (type: string) => {
    switch (type) {
      case "31": return "Factura de Crédito Fiscal (E31)";
      case "32": return "Consumo (E32)";
      case "33": return "Nota de Débito (E33)";
      case "34": return "Nota de Crédito (E34)";
      case "41": return "Compras (E41)";
      case "43": return "Gastos Menores (E43)";
      case "44": return "Regímenes Especiales (E44)";
      case "45": return "Gubernamentales (E45)";
      default: return `Comprobante e-CF Tipo ${type}`;
    }
  };

  const paymentConditionName = invoice.payment_condition === "credito" ? "Crédito" : "Contado";

  const getPaymentMethodName = (method?: number) => {
    switch (method) {
      case 1: return "Efectivo";
      case 2: return "Cheque / Transferencia";
      case 3: return "Tarjeta de Crédito/Débito";
      case 4: return "Crédito DGII";
      case 5: return "Permuta";
      case 6: return "Nota de Crédito";
      case 7: return "Mixto";
      default: return "No especificado";
    }
  };

  const issuerName = org?.name || "Fintral Contable";
  const issuerRnc = org?.tax_id || "132109122";
  const issuerAddress = org?.fiscal_address || "Santo Domingo, República Dominicana";
  const issuerPhone = org?.phone || "(809) 555-0199";

  return (
    <div className="flex-1 p-4 md:p-8 pt-6 space-y-6 max-w-4xl mx-auto">
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Link href="/billing/invoices">
            <Button variant="ghost" size="icon" title="Volver a Facturas">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Detalle de Comprobante</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">ID: {invoice.id}</p>
              <Badge variant="outline" className={`gap-1 text-[10px] font-normal ${isQuick ? "border-amber-300 text-amber-700" : "border-sky-300 text-sky-700"}`}>
                {isQuick ? <><Zap className="size-3" /> Rápida</> : <><Layers className="size-3" /> Detallada</>}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === "draft" && isQuick && (
            <Link href={editUrl}>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-md">
                <Zap className="size-3.5" /> Continuar edición rápida
              </Button>
            </Link>
          )}
          {invoice.status === "draft" && !isQuick && (
            <Link href={editUrl}>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-md">
                <Play className="size-3.5 fill-current" /> Continuar edición detallada
              </Button>
            </Link>
          )}
          {invoice.status === "verified" && isQuick && (
            <Link href={`/billing/invoices/${invoice.id}/print`} target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Printer className="size-3.5" /> Ticket
              </Button>
            </Link>
          )}
          {invoice.status === "verified" && !isQuick && (
            <>
              <Link href={`/billing/invoices/${invoice.id}/print`} target="_blank">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Printer className="size-3.5" /> Ticket
                </Button>
              </Link>
              {invoice.processed_url && (
                <a href={invoice.processed_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Printer className="size-3.5" /> A4 PDF
                  </Button>
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {isQuick ? (
        /* ── THERMAL TICKET FORMAT (quick mode POS) ── */
        <div className="flex justify-center bg-zinc-100 p-6 sm:p-10 rounded-xl border border-zinc-200 shadow-inner">
          <div className="relative w-[80mm] bg-white text-zinc-900 border border-zinc-300 p-4 font-mono text-[10px] leading-relaxed shadow-lg">
            {invoice.status === "draft" && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-red-500/20 text-red-500/20 text-3xl font-extrabold tracking-wider uppercase rotate-12 pointer-events-none select-none px-4 py-1.5 rounded">
                Borrador
              </div>
            )}
            
            {/* Ticket Header */}
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-zinc-300">
              <div className="text-xs font-bold tracking-wider uppercase">{issuerName}</div>
              <div className="text-[9px]">RNC: {formatRnc(issuerRnc)}</div>
              <div className="text-[8px] text-zinc-500">{issuerAddress}</div>
              {issuerPhone && <div className="text-[8px] text-zinc-500">Tel: {issuerPhone}</div>}
            </div>

            {/* Ticket Metadata */}
            <div className="py-2 border-b border-dashed border-zinc-300 space-y-0.5 text-[9px]">
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span>
                  {invoice.invoice_date
                    ? new Date(invoice.invoice_date).toLocaleString("es-DO")
                    : new Date().toLocaleString("es-DO")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>COMPROBANTE:</span>
                <span className="font-bold">{invoice.invoice_number || "E-CF BORRADOR"}</span>
              </div>
              <div className="flex justify-between">
                <span>TIPO:</span>
                <span>{getEcfTypeName(invoice.ecf_type || "32")}</span>
              </div>
              <div className="flex justify-between">
                <span>CONDICIÓN:</span>
                <span>{paymentConditionName.toUpperCase()}</span>
              </div>
            </div>

            {/* Ticket Buyer */}
            <div className="py-2 border-b border-dashed border-zinc-300 space-y-0.5 text-[9px]">
              <div className="font-bold">ADQUIRIENTE:</div>
              <div>{buyerName}</div>
              <div>RNC/CÉDULA: {buyerRnc}</div>
              {buyerAddress && <div>DIRECCIÓN: {buyerAddress}</div>}
            </div>

            {/* Ticket Items */}
            <div className="py-2 border-b border-dashed border-zinc-300">
              <div className="flex font-bold border-b border-zinc-200 pb-1 mb-1 text-[9px]">
                <span className="w-[45%]">CONCEPTO</span>
                <span className="w-[15%] text-right">CANT</span>
                <span className="w-[20%] text-right">PRECIO</span>
                <span className="w-[20%] text-right">TOTAL</span>
              </div>
              <div className="space-y-1 text-[9px]">
                {items.map((item: any, idx: number) => {
                  const discountRate = item.discount_rate ?? 0;
                  const lineTotal = item.total || (item.quantity * item.unit_price * (1 - discountRate / 100));
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="font-semibold">{item.name}</div>
                      <div className="flex text-zinc-500 text-[8.5px]">
                        <span className="w-[45%]">{discountRate > 0 ? `Desc: -${discountRate}%` : ""}</span>
                        <span className="w-[15%] text-right">{item.quantity}</span>
                        <span className="w-[20%] text-right">{formatCurrency(item.unit_price)}</span>
                        <span className="w-[20%] text-right font-semibold text-zinc-900">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ticket Totals */}
            <div className="py-2 border-b border-dashed border-zinc-300 space-y-1 text-[9px]">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>DESCUENTO:</span>
                  <span>-{formatCurrency(totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>ITBIS:</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-zinc-200">
                <span>TOTAL A PAGAR:</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {/* Ticket Footer */}
            <div className="pt-3 text-center text-[7.5px] text-zinc-400 space-y-1">
              <p className="font-bold text-zinc-500">TICKET DE VENTA FISCAL TÉRMICO</p>
              <p>Representación gráfica digital. Autorizado por la DGII.</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── STANDARD A4 SHEET FORMAT (detailed mode) ── */
        <div className="relative bg-white text-zinc-900 border shadow-2xl rounded-xl overflow-hidden p-6 sm:p-10 font-sans leading-relaxed">
          {invoice.status === "draft" && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-dashed border-red-500/30 text-red-500/30 text-5xl font-extrabold tracking-widest uppercase rotate-12 pointer-events-none select-none px-6 py-3 rounded">
              Borrador
            </div>
          )}

          <div className="space-y-8">
            {/* Header Row */}
            <div className="flex flex-col gap-6 md:flex-row md:justify-between border-b pb-6">
              <div className="space-y-2">
                <h3 className="text-xl font-extrabold tracking-tight text-sky-950 uppercase">
                  {issuerName}
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm">
                  RNC: {formatRnc(issuerRnc)}
                  <br />
                  Dirección Fiscal: {issuerAddress}
                  <br />
                  Teléfono: {issuerPhone}
                </p>
              </div>
              <div className="bg-zinc-50 border p-4 rounded-lg space-y-1.5 text-right min-w-[280px]">
                <div className="text-xs font-semibold text-zinc-500">
                  {invoice.is_electronic ? "COMPROBANTE ELECTRÓNICO (e-CF)" : "COMPROBANTE FISCAL"}
                </div>
                <div className="text-sm font-bold text-sky-950">
                  {getEcfTypeName(invoice.ecf_type || "32")}
                </div>
                <div className="text-lg font-mono font-bold text-zinc-900">
                  {invoice.invoice_number ? invoice.invoice_number : "E-CF BORRADOR"}
                </div>
                <div className="text-xs text-zinc-500 mt-2">
                  Estado:{" "}
                  <span className="font-semibold capitalize">
                    {invoice.status === "draft"
                      ? "Borrador"
                      : invoice.status === "verified"
                      ? "Emitido / Aprobado"
                      : invoice.status === "pending"
                      ? "Procesando"
                      : "Rechazado"}
                  </span>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs border-b pb-6">
              <div className="space-y-1.5">
                <h4 className="font-bold text-sky-950 uppercase border-b pb-1">Adquiriente / Cliente</h4>
                <div>
                  <span className="font-semibold text-zinc-500">Nombre / Razón Social: </span>
                  <span className="text-zinc-800">{buyerName}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-500">RNC / Cédula: </span>
                  <span className="text-zinc-800 font-mono">{buyerRnc}</span>
                </div>
                {buyerAddress && (
                  <div>
                    <span className="font-semibold text-zinc-500">Dirección: </span>
                    <span className="text-zinc-800">{buyerAddress}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <h4 className="font-bold text-sky-950 uppercase border-b pb-1">Información de Pago</h4>
                <div>
                  <span className="font-semibold text-zinc-500">Fecha de Emisión: </span>
                  <span className="text-zinc-800">
                    {invoice.invoice_date
                      ? new Date(invoice.invoice_date).toLocaleDateString("es-DO")
                      : new Date().toLocaleDateString("es-DO")}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-500">Término de Pago: </span>
                  <span className="text-zinc-800">{paymentConditionName}</span>
                </div>
                {parsedRaw?.payment_method && (
                  <div>
                    <span className="font-semibold text-zinc-500">Método de Pago: </span>
                    <span className="text-zinc-800">
                      {getPaymentMethodName(parsedRaw.payment_method)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-sky-950 uppercase tracking-wider">Detalle del Comprobante</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-zinc-50">
                    <TableRow>
                      <TableHead className="w-12 text-center text-xs text-zinc-500">Línea</TableHead>
                      <TableHead className="text-xs text-zinc-500">Descripción del Artículo</TableHead>
                      <TableHead className="w-20 text-right text-xs text-zinc-500">Cant.</TableHead>
                      <TableHead className="w-28 text-right text-xs text-zinc-500">Precio Unit.</TableHead>
                      <TableHead className="w-20 text-right text-xs text-zinc-500">Desc.</TableHead>
                      <TableHead className="w-24 text-right text-xs text-zinc-500">ITBIS</TableHead>
                      <TableHead className="w-32 text-right text-xs text-zinc-500">Total Línea</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any, idx: number) => {
                      const discountRate = item.discount_rate ?? 0;
                      const taxRate = item.tax_rate ?? 18;
                      const lineTotal = item.total || (item.quantity * item.unit_price * (1 - discountRate / 100));
                      return (
                        <TableRow key={idx} className="border-b last:border-0 hover:bg-zinc-50/50">
                          <TableCell className="text-center font-mono text-zinc-500 text-xs py-2.5">
                            {item.line || idx + 1}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-zinc-800 py-2.5">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono py-2.5">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono py-2.5">
                            {formatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono py-2.5 text-zinc-500">
                            {discountRate > 0 ? `${discountRate}%` : "0%"}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono py-2.5 text-zinc-500">
                            {taxRate > 0 ? `${taxRate}%` : "Exento"}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold py-2.5 text-zinc-950">
                            {formatCurrency(lineTotal)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary block */}
            <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-6 border-t pt-6">
              <div className="text-xs text-zinc-500 space-y-1">
                <span className="font-bold text-sky-950 uppercase">Notas del comprobante:</span>
                <p className="italic bg-zinc-50 p-3 border rounded-md max-w-md mt-1">
                  {(invoice as any).notes || parsedRaw?.notes || "Sin observaciones adicionales."}
                </p>
              </div>
              <div className="w-full sm:w-80 space-y-1.5 text-xs text-zinc-600">
                <div className="flex justify-between border-b pb-1.5">
                  <span>Subtotal Bruto:</span>
                  <span className="font-mono">{formatCurrency(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-600 border-b pb-1.5">
                    <span>Descuento Otorgado:</span>
                    <span className="font-mono">-{formatCurrency(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-b pb-1.5">
                  <span>ITBIS Liquidado:</span>
                  <span className="font-mono">{formatCurrency(totalTax)}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-zinc-900 pt-1">
                  <span className="uppercase text-sky-950">Total General:</span>
                  <span className="font-mono text-base text-sky-950">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Footer certification */}
            <div className="text-[10px] text-zinc-400 text-center border-t pt-6 font-mono">
              ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN COMPROBANTE FISCAL DIGITAL (e-CF).
              <br />
              Certificado y Timbrado por la Dirección General de Impuestos Internos (DGII).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
