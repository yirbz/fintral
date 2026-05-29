"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function PrintInvoicePage() {
  const { id } = useParams() as { id: string };
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const data = await billingApi.getInvoice(id);
        setInvoice(data);
      } catch (err) {
        console.error("Error fetching invoice for print:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchInvoice();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-muted/20">
        <Skeleton className="h-96 w-[80mm] rounded-lg shadow-sm" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <p className="text-sm font-semibold text-rose-500">Factura no encontrada</p>
        <Link href="/billing" className="mt-4">
          <Button size="xs" variant="outline">Volver</Button>
        </Link>
      </div>
    );
  }

  // Parse Metadata
  let metadata: any = {};
  if (invoice.raw_extracted_data) {
    try {
      metadata = JSON.parse(invoice.raw_extracted_data);
    } catch {
      // noop
    }
  }

  const qrUrl = metadata.qr_url || `https://dgii.gov.do/consulta/ecf?rnc=${invoice.currency}&encf=${invoice.invoice_number}`;
  const securityCode = metadata.security_code || "N/A";
  const trackId = metadata.track_id || "N/A";
  const legalStatus = metadata.legal_status || "ACCEPTED";

  // Parse line items
  let lineItems: any[] = [];
  if ((invoice as any).line_items) {
    lineItems = (invoice as any).line_items;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 py-6 print:py-0 flex flex-col items-center">
      {/* Print Controls (hidden on print) */}
      <div className="w-[80mm] mb-4 flex justify-between items-center print:hidden px-2">
        <Link href="/billing" passHref>
          <Button variant="outline" size="xs" className="h-7 text-[11px] gap-1 px-2 rounded-md">
            <ArrowLeft className="size-3" /> Atrás
          </Button>
        </Link>
        <Button
          onClick={handlePrint}
          className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1 px-2 rounded-md"
          size="xs"
        >
          <Printer className="size-3" /> Imprimir
        </Button>
      </div>

      {/* Ticket Wrapper (80mm width standard) */}
      <div className="w-[80mm] bg-white dark:bg-gray-950 text-black dark:text-white p-4 font-mono text-[10px] shadow-md print:shadow-none border border-neutral-200 dark:border-neutral-800 print:border-none leading-tight">
        {/* Header */}
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="font-bold text-xs tracking-wider uppercase">Fintral Facturación</div>
          <div className="font-bold uppercase">{invoice.client?.name ? "EMISOR AUTORIZADO" : "CONSUMIDOR FINAL"}</div>
          <div className="text-[9px] text-neutral-600 dark:text-neutral-400">
            RNC: {invoice.currency === "DOP" ? "132-10912-2" : "132109122"}
          </div>
          <div className="text-[9px] text-neutral-600 dark:text-neutral-400">
            Calle Principal #123, Santo Domingo
          </div>
          <div className="text-[9px] text-neutral-600 dark:text-neutral-400">
            Tel: (809) 555-0199
          </div>
        </div>

        {/* Invoice Metadata */}
        <div className="py-2.5 space-y-0.5 border-b border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="flex justify-between">
            <span>FECHA:</span>
            <span>
              {invoice.invoice_date
                ? new Date(invoice.invoice_date).toLocaleString("es-DO")
                : "N/A"}
            </span>
          </div>
          <div className="flex justify-between font-bold">
            <span>NCF / e-CF:</span>
            <span>{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span>TIPO DOC:</span>
            <span>Comprobante Electrónico (e-CF)</span>
          </div>
          <div className="flex justify-between">
            <span>CONDICION:</span>
            <span className="uppercase">{invoice.payment_condition || "CONTADO"}</span>
          </div>
          <div className="flex justify-between">
            <span>ESTADO DGII:</span>
            <span className="font-bold text-emerald-600">{legalStatus}</span>
          </div>
        </div>

        {/* Client details */}
        <div className="py-2.5 space-y-0.5 border-b border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="font-bold">ADQUIRIENTE:</div>
          <div>{invoice.client?.name || "Consumidor Final"}</div>
          {invoice.client?.tax_id && (
            <div>RNC/CÉDULA: {invoice.client.tax_id}</div>
          )}
        </div>

        {/* Items Table */}
        <div className="py-2 border-b border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="grid grid-cols-12 font-bold mb-1 border-b border-neutral-200 dark:border-neutral-800 pb-1">
            <span className="col-span-6">CONCEPTO</span>
            <span className="col-span-2 text-right">CANT</span>
            <span className="col-span-4 text-right">TOTAL</span>
          </div>
          <div className="space-y-1">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-y-0.5">
                <span className="col-span-12 font-semibold">{item.name}</span>
                <span className="col-span-6 text-neutral-500 text-[9px]">
                  {formatCurrency(item.unit_price)} {item.discount_rate > 0 ? `(-${item.discount_rate}%)` : ""}
                </span>
                <span className="col-span-2 text-right">{item.quantity}</span>
                <span className="col-span-4 text-right font-semibold">
                  {formatCurrency((item.quantity * item.unit_price) * (1 - (item.discount_rate || 0) / 100))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="py-2.5 space-y-1 border-b border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="flex justify-between">
            <span>SUBTOTAL:</span>
            <span>{formatCurrency(invoice.total_amount - invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>ITBIS (18%):</span>
            <span>{formatCurrency(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-xs border-t border-neutral-200 dark:border-neutral-800 pt-1.5">
            <span>TOTAL A PAGAR:</span>
            <span>{formatCurrency(invoice.total_amount)}</span>
          </div>
        </div>

        {/* Security / QR Details */}
        <div className="py-3 text-center space-y-2">
          <div className="flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-2 rounded-xs border border-neutral-200 dark:border-neutral-800">
            <Image
              src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrUrl)}`}
              alt="DGII e-CF QR Verification"
              width={112}
              height={112}
              unoptimized
              className="size-28 border border-neutral-200 dark:border-neutral-800"
            />
            <span className="text-[8px] text-neutral-500 mt-1 uppercase font-semibold">Escanear para verificar en la DGII</span>
          </div>

          <div className="space-y-0.5 text-left text-[8px] text-neutral-600 dark:text-neutral-400">
            <div>CÓDIGO SEGURIDAD: <span className="font-semibold text-neutral-800 dark:text-neutral-200">{securityCode}</span></div>
            <div>ID DE CERTIFICACIÓN (DGII): <span className="font-semibold text-neutral-800 dark:text-neutral-200">{trackId}</span></div>
          </div>
        </div>

        {/* Footer legal text */}
        <div className="text-center text-[7px] text-neutral-500 pt-2 border-t border-dashed border-neutral-300 dark:border-neutral-700 space-y-1">
          <p className="uppercase font-bold flex items-center justify-center gap-1">
            <ShieldCheck className="size-3 text-emerald-500" />
            DOCUMENTO ELECTRÓNICO FIRMADO
          </p>
          <p>Esta es una representación impresa de un Comprobante Fiscal Electrónico (e-CF), emitido conforme a la Ley de Facturación Electrónica de la República Dominicana.</p>
          <p className="font-bold">¡Gracias por preferirnos!</p>
        </div>
      </div>
    </div>
  );
}
