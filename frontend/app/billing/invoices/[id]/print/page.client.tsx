"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { billingApi, BillingInvoice } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);
};

const Divider = () => (
  <div className="border-t border-dashed border-neutral-300 dark:border-neutral-700 my-2.5" />
);

const MetaRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex justify-between text-[9px]">
    <span>{label}</span>
    <span className={bold ? "font-bold" : ""}>{value}</span>
  </div>
);

export default function PrintInvoicePage() {
  const { id } = useParams() as { id: string };
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [verStatus, setVerStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBillingSubdomain, setIsBillingSubdomain] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsBillingSubdomain(window.location.hostname.startsWith("factura."));
    }
    const fetchInvoiceData = async () => {
      try {
        setLoading(true);
        const [invoiceData, orgData, verStatusData] = await Promise.all([
          billingApi.getInvoice(id),
          billingApi.getOrganization().catch(() => null),
          billingApi.getVerificationStatus().catch(() => null),
        ]);
        setInvoice(invoiceData);
        setOrg(orgData);
        setVerStatus(verStatusData);
      } catch (err) {
        console.error("Error fetching invoice for print:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchInvoiceData();
  }, [id]);

  useEffect(() => {
    if (!loading && invoice) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auto") === "true") {
        const timer = setTimeout(() => {
          window.print();
          if (window.self !== window.top) {
            window.parent.postMessage({ type: "printed", invoiceId: id }, "*");
          }
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, invoice, id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-neutral-100">
        <Skeleton className="h-96 w-[80mm] rounded-none shadow-sm" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <p className="text-sm font-semibold text-rose-500">Factura no encontrada</p>
        <Link href={isBillingSubdomain ? "/" : "/billing"} className="mt-4">
          <Button size="xs" variant="outline">Volver</Button>
        </Link>
      </div>
    );
  }

  let metadata: any = {};
  if (invoice.raw_extracted_data) {
    try {
      metadata = JSON.parse(invoice.raw_extracted_data);
    } catch {
      // noop
    }
  }

  const isEcfAuthorized = org?.is_ecf_authorized ?? verStatus?.is_ecf_authorized ?? false;
  const invoiceIsElectronic = invoice.is_electronic && (invoice.invoice_number?.startsWith("E") ?? false);
  const showElectronicBadge = invoiceIsElectronic && isEcfAuthorized;
  const showQR = invoiceIsElectronic && isEcfAuthorized;

  const getDocTypeName = () => {
    const code = invoice.ecf_type || (invoice.invoice_number ? invoice.invoice_number.substring(0, 3) : "");
    const cleanCode = code.replace(/[^0-9]/g, "");
    const typeNum = parseInt(cleanCode);

    if (typeNum === 1 || typeNum === 31) return "Factura de Crédito Fiscal";
    if (typeNum === 2 || typeNum === 32) return "Factura de Consumo";
    if (typeNum === 3 || typeNum === 33) return "Nota de Débito";
    if (typeNum === 4 || typeNum === 34) return "Nota de Crédito";
    if (typeNum === 41) return "Registro de Compras";
    if (typeNum === 43) return "Gastos Menores";
    if (typeNum === 44) return "Regímenes Especiales";
    if (typeNum === 45) return "Comprobante Gubernamental";
    if (typeNum === 46) return "Comprobante para Exportación";
    if (typeNum === 47) return "Pagos al Exterior";

    return "Factura";
  };

  const issuerRnc = org?.tax_id || verStatus?.tax_id || "";
  const cleanIssuerRnc = issuerRnc.replace(/[^0-9]/g, "");

  const securityCode = metadata.security_code || "N/A";
  const trackId = metadata.track_id || "N/A";
  const legalStatus = metadata.legal_status || "";

  let lineItems: any[] = [];
  if ((invoice as any).line_items) {
    lineItems = (invoice as any).line_items;
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 py-6 print:py-0 flex flex-col items-center print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0;
            padding: 0;
            width: 80mm;
            font-family: 'Courier New', 'Courier', monospace;
          }
          html, body {
            overflow: visible !important;
            height: auto !important;
          }
          img.qr-code {
            image-rendering: pixelated;
            -ms-interpolation-mode: nearest-neighbor;
          }
        }
        @media screen {
          body { background: white; }
        }
      `}} />

      {/* Print Controls */}
      <div className="w-[80mm] mb-4 flex justify-between items-center print:hidden px-1">
        <Link href={isBillingSubdomain ? "/" : "/billing"} passHref>
          <Button variant="outline" size="xs" className="h-7 text-[11px] gap-1 px-2 rounded">
            <ArrowLeft className="size-3" /> Atrás
          </Button>
        </Link>
        <Button
          onClick={handlePrint}
          className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1 px-2 rounded"
          size="xs"
        >
          <Printer className="size-3" /> Imprimir
        </Button>
      </div>

      {/* ── THERMAL TICKET (80mm) ── */}
      <div className="w-[80mm] bg-white text-black p-3 font-mono text-[9.5px] shadow print:shadow-none leading-[1.15]">

        {/* ── Header ── */}
        <div className="text-center space-y-0.5 pb-2">
          <div className="text-[11px] font-bold tracking-wider uppercase leading-tight">
            {org?.name || verStatus?.name || "Fintral Facturación"}
          </div>
          {showElectronicBadge && (
            <div className="text-[8px] font-bold tracking-widest text-neutral-600 uppercase">
              EMISOR ELECTRÓNICO AUTORIZADO
            </div>
          )}
          <div className="text-[8.5px] text-neutral-600">
            RNC: {formatRnc(issuerRnc || "132109122")}
          </div>
          <div className="text-[8px] text-neutral-500">
            {org?.fiscal_address || verStatus?.fiscal_address || "Santo Domingo, RD"}
          </div>
          {org?.phone && (
            <div className="text-[8px] text-neutral-500">
              Tel: {org.phone}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Metadata ── */}
        <div className="space-y-0.5">
          <MetaRow label="FECHA:" value={
            invoice.invoice_date
              ? new Date(invoice.invoice_date).toLocaleDateString("es-DO", {
                  year: "numeric", month: "2-digit", day: "2-digit",
                  hour: "2-digit", minute: "2-digit"
                })
              : "N/A"
          } />
          <MetaRow label="NCF/e-CF:" value={invoice.invoice_number || "N/A"} bold />
          <MetaRow label="TIPO:" value={getDocTypeName()} />
          <MetaRow label="CONDICIÓN:" value={(invoice.payment_condition || "CONTADO").toUpperCase()} />
          {showElectronicBadge && legalStatus && (
            <MetaRow label="ESTADO DGII:" value={legalStatus} bold />
          )}
        </div>

        <Divider />

        {/* ── Buyer ── */}
        <div className="space-y-0.5">
          <div className="text-[9px] font-bold uppercase">ADQUIRIENTE:</div>
          <div className="text-[9px]">
            {invoice.client?.name || metadata.buyer_name || "Consumidor Final"}
          </div>
          {(invoice.client?.tax_id || metadata.buyer_rnc) && (
            <div className="text-[8.5px] text-neutral-600">
              RNC/CÉDULA: {invoice.client?.tax_id || metadata.buyer_rnc}
            </div>
          )}
        </div>

        <Divider />

        {/* ── Items ── */}
        <div className="mb-1">
          <div className="flex text-[9px] font-bold border-b border-neutral-300 pb-0.5 mb-1">
            <span className="w-[36%]">CONCEPTO</span>
            <span className="w-[16%] text-right">CANT</span>
            <span className="w-[20%] text-right">P/UNIT</span>
            <span className="w-[28%] text-right">TOTAL</span>
          </div>
          {lineItems.map((item: any, idx: number) => {
            const lineTotal = (item.quantity * item.unit_price) * (1 - (item.discount_rate || 0) / 100);
            return (
              <div key={idx} className="mb-1.5">
                <div className="text-[9px] font-semibold truncate">{item.name}</div>
                <div className="flex text-[8.5px] text-neutral-600">
                  <span className="w-[36%]">
                    {item.discount_rate > 0 && `(-${item.discount_rate}%)`}
                  </span>
                  <span className="w-[16%] text-right">{item.quantity}</span>
                  <span className="w-[20%] text-right">{formatCurrency(item.unit_price)}</span>
                  <span className="w-[28%] text-right font-semibold text-black">
                    {formatCurrency(lineTotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <Divider />

        {/* ── Totals ── */}
        <div className="space-y-0.5">
          <MetaRow label="SUBTOTAL:" value={formatCurrency(invoice.total_amount - invoice.tax_amount)} />
          <MetaRow label="ITBIS:" value={formatCurrency(invoice.tax_amount)} />
          <div className="border-t border-neutral-400 pt-0.5 mt-0.5" />
          <div className="flex justify-between text-[10px] font-bold">
            <span>TOTAL A PAGAR:</span>
            <span>{formatCurrency(invoice.total_amount)}</span>
          </div>
        </div>

        {/* ── QR & Security (e-CF only) ── */}
        {showQR && (
          <>
            <Divider />
            <div className="text-center space-y-1.5">
              <div className="inline-flex flex-col items-center border border-neutral-300 p-2">
                <Image
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                    metadata.document_stamp_url || metadata.qr_url || ""
                  )}`}
                  alt="QR DGII"
                  width={100}
                  height={100}
                  unoptimized
                  className="qr-code"
                />
                <span className="text-[7px] text-neutral-500 mt-0.5 uppercase">
                  Escanear para verificar en la DGII
                </span>
              </div>
              <div className="text-left text-[7.5px] text-neutral-600 space-y-0.5">
                <div>CÓDIGO DE SEGURIDAD: <span className="font-semibold text-black">{securityCode}</span></div>
                <div>TRACK ID: <span className="font-semibold text-black">{trackId}</span></div>
              </div>
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <Divider />
        <div className="text-center text-[7px] text-neutral-500 space-y-0.5">
          {showElectronicBadge ? (
            <>
              <p className="text-[8px] font-bold uppercase tracking-wider">
                DOCUMENTO ELECTRÓNICO FIRMADO
              </p>
              <p>
                Esta es una representación impresa de un Comprobante Fiscal
                Electrónico (e-CF) emitido conforme a la Ley de Facturación
                Electrónica de la República Dominicana.
              </p>
            </>
          ) : (
            <>
              <p className="text-[8px] font-bold uppercase tracking-wider">
                COMPROBANTE FÍSICO
              </p>
              <p>
                Esta es una representación impresa de un comprobante fiscal
                físico (NCF) registrado conforme a la normativa de la DGII.
              </p>
            </>
          )}
          <p className="text-[8px] font-bold text-neutral-700 pt-1">
            ¡Gracias por preferirnos!
          </p>
        </div>

      </div>
    </div>
  );
}
