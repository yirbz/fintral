"use client";

import React from "react";
import Image from "next/image";
import type { EmitLineItem } from "@/lib/api/billing";

interface DetailedInvoicePreviewProps {
  organization: {
    name?: string;
    tax_id?: string;
    phone?: string;
    address?: string;
    logo_url?: string;
  } | null;
  ecfType: number | null;
  customer: {
    name: string;
    rnc: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  items: EmitLineItem[];
  notes?: string;
  totals: {
    subtotal: number;
    discountTotal: number;
    taxableAmount: number;
    itbis18: number;
    itbis16: number;
    itbis0: number;
    itbisTotal: number;
    exemptAmount: number;
    totalAmount: number;
  };
  previewNcf: string;
  isElectronic: boolean;
}

const ECF_NAMES: Record<number, string> = {
  1: "Factura de Crédito Fiscal",
  2: "Factura de Consumo",
  3: "Nota de Débito",
  4: "Nota de Crédito",
  14: "Registro Único de Ingresos",
  15: "Registro de Gastos Menores",
  31: "Factura de Crédito Fiscal Electrónica",
  32: "Factura de Consumo Electrónica",
  33: "Nota de Débito Electrónica",
  34: "Nota de Crédito Electrónica",
  43: "Comprobante de Gastos Menores Electrónico",
  44: "Comprobante Especial de Regímenes Especiales",
  45: "Comprobante Gubernamental Electrónico",
};

export function DetailedInvoicePreview({
  organization,
  ecfType,
  customer,
  items,
  notes,
  totals,
  previewNcf,
  isElectronic,
}: DetailedInvoicePreviewProps) {
  const orgName = organization?.name || "Multipagos Expresos S.A";
  const orgRnc = organization?.tax_id || "130001693";
  const orgAddress = organization?.address || "Av. Nuñez de Caceres #11, Edif Equinox, 1er. Nivel, 10100, Santo Domingo";
  const orgPhone = organization?.phone || "829-375-8414";

  const isExemptType = ecfType !== null && (ecfType === 43 || ecfType === 44);
  const ecfName = ecfType ? ECF_NAMES[ecfType] || "Factura de Consumo Electrónica" : "Factura de Consumo Electrónica";

  const formattedDate = new Date().toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const formattedDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const validItems = items.filter((item) => item.description.trim() || item.unit_price > 0);

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

  const getDocTypeString = () => {
    if (ecfType === 31) return "Factura de Crédito Fiscal Electrónica";
    if (ecfType === 32) return "Factura de Consumo Electrónica";
    return ecfName;
  };

  // Mocking security code and signature timestamp for realism
  const securityCode = "OvAcAQ";
  const signatureTimestamp = `${formattedDate} 08:07:16`;

  return (
    <div className="w-full bg-white border border-neutral-300 shadow-2xl p-8 sm:p-10 text-black flex flex-col justify-between font-sans text-[10px] leading-relaxed select-none overflow-hidden min-h-[850px]">
      
      {/* ── 1. HEADER SECTION (Emitter Info on Left, Logo on Right) ── */}
      <div className="flex justify-between items-start gap-4 pb-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-neutral-900 tracking-tight leading-tight">
            {orgName}
          </h2>
          <div className="text-[9.5px] text-neutral-700 leading-snug space-y-0.5">
            <p><span className="font-semibold">RNC:</span> {orgRnc}</p>
            <p className="max-w-[420px]"><span className="font-semibold">Dirección:</span> {orgAddress}</p>
            {orgPhone && <p><span className="font-semibold">Teléfono:</span> {orgPhone}</p>}
          </div>
        </div>

        {/* Emitter Logo */}
        <div className="w-[110px] h-[45px] shrink-0 border border-neutral-200 rounded flex items-center justify-center bg-neutral-50 text-[9px] font-bold text-neutral-400 uppercase tracking-widest relative select-none">
          {organization?.logo_url ? (
            <img
              src={organization.logo_url}
              alt="Logo"
              className="w-full h-full object-contain rounded"
            />
          ) : (
            "Logo"
          )}
        </div>
      </div>

      {/* ── 2. METADATA SECTION (Client Rounded Box Left, Invoice Details Right) ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 pb-4">
        {/* Client Box (7 cols) */}
        {/* Client Box (7 cols) */}
        <div className="md:col-span-7 border border-neutral-300 bg-neutral-50/50 rounded p-3 space-y-1 text-[9.5px]">
          <div className="grid grid-cols-[85px_1fr] gap-x-2 border-b border-neutral-200/50 pb-1">
            <span className="font-bold text-neutral-500">Cliente:</span>
            <span className="font-medium text-neutral-900 truncate">
              {customer.name || (ecfType === 32 || ecfType === 2 ? "Consumidor Final" : "Cliente Particular")}
            </span>
          </div>
          <div className="grid grid-cols-[85px_1fr] gap-x-2 border-b border-neutral-200/50 pb-1">
            <span className="font-bold text-neutral-500">RNC/Ced:</span>
            <span className="font-mono text-neutral-900">
              {customer.rnc ? formatRnc(customer.rnc) : (ecfType === 32 || ecfType === 2) ? "132-10912-2" : "—"}
            </span>
          </div>
          <div className="grid grid-cols-[85px_1fr] gap-x-2 border-b border-neutral-200/50 pb-1">
            <span className="font-bold text-neutral-500">Dirección:</span>
            <span className="text-neutral-700 truncate">{customer.address || "—"}</span>
          </div>
          <div className="grid grid-cols-[85px_1fr] gap-x-2 border-b border-neutral-200/50 pb-1">
            <span className="font-bold text-neutral-500">Teléfono:</span>
            <span className="text-neutral-700">{customer.phone || "—"}</span>
          </div>
          <div className="grid grid-cols-[85px_1fr] gap-x-2">
            <span className="font-bold text-neutral-500">Contacto:</span>
            <span className="text-neutral-700 truncate">{customer.email || "—"}</span>
          </div>
        </div>

        {/* Invoice Details Block (5 cols) */}
        <div className="md:col-span-5 text-[9.5px] space-y-1 pl-0 md:pl-4 flex flex-col justify-center">
          <div className="font-bold text-neutral-900 text-[10px] pb-1 uppercase border-b border-neutral-200">
            {getDocTypeString()}
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-2">
            <span className="text-neutral-500">Fecha de Factura:</span>
            <span className="font-medium text-neutral-900">{formattedDate}</span>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-2">
            <span className="text-neutral-500">Fecha Vencimiento:</span>
            <span className="font-medium text-neutral-900">{formattedDueDate}</span>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-2">
            <span className="text-neutral-500">{isElectronic ? "e-NCF:" : "NCF:"}</span>
            <span className="font-mono font-bold text-neutral-900">
              {ecfType ? previewNcf : isElectronic ? "E-CF BORRADOR" : "NCF BORRADOR"}
            </span>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-2">
            <span className="text-neutral-500">Orden No:</span>
            <span className="font-mono text-neutral-900">Y0XP15N</span>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-2">
            <span className="text-neutral-500">Condición:</span>
            <span className="font-medium text-neutral-900 font-semibold">{totals.exemptAmount === totals.totalAmount ? "Exenta" : "Contado"}</span>
          </div>
        </div>
      </div>

      {/* ── 3. NOTES BAR (Event-like Full Width Box) ── */}
      {notes && notes.trim() && (
        <div className="w-full border border-neutral-300 bg-neutral-100 py-1.5 px-3 rounded text-[9.5px] font-semibold text-neutral-800 my-2">
          Notas / Evento: {notes.trim()}
        </div>
      )}

      {/* ── 4. ITEMS TABLE (Grey Shaded Header, Simple Grid Lines) ── */}
      <div className="flex-1 mt-4 overflow-x-auto min-h-[180px]">
        <table className="w-full text-left border-collapse text-[9.5px]">
          <thead>
            <tr className="bg-neutral-100 border-t border-b border-neutral-300 text-neutral-700 font-bold uppercase text-[8.5px]">
              <th className="py-2 px-2 text-center w-8">#</th>
              <th className="py-2 px-2">Concepto / Artículo</th>
              <th className="py-2 px-2 text-right w-16">Cantidad</th>
              <th className="py-2 px-2 text-right w-24">Precio</th>
              <th className="py-2 px-2 text-right w-16">Descuento</th>
              <th className="py-2 px-2 text-right w-16">ITBIS</th>
              <th className="py-2 px-2 text-right w-28">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {validItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-400 italic bg-white">
                  No hay artículos o servicios agregados en el formulario.
                </td>
              </tr>
            ) : (
              validItems.map((item, index) => {
                const gross = item.quantity * item.unit_price;
                const discAmt = gross * ((item.discount_rate ?? 0) / 100);
                const net = gross - discAmt;
                const taxRate = isExemptType ? 0 : (item.tax_rate ?? 18);
                const taxAmt = net * (taxRate / 100);
                const lineTotal = net + taxAmt;

                return (
                  <tr key={index} className="bg-white hover:bg-neutral-50/50 transition-colors">
                    <td className="py-2.5 px-2 text-center font-mono text-neutral-400">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-neutral-900">
                      {item.description || "Línea sin especificar"}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                      RD$ {item.unit_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-neutral-500">
                      {item.discount_rate ? `${item.discount_rate}%` : "0%"}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-neutral-500">
                      {isExemptType ? "Exento" : `${taxRate}%`}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums text-neutral-900">
                      RD$ {lineTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 5. TOTALS & DGII CERTIFICATION AREA (QR Code Left, Totals Right) ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-6 border-t border-neutral-300 mt-6">
        
        {/* QR & Security Metadata (Left) */}
        {isElectronic ? (
          <div className="flex items-start gap-4">
            <div className="w-[100px] h-[100px] shrink-0 border border-neutral-300 p-1 flex items-center justify-center bg-white">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                  `https://dgii.gov.do/verificarecf/?rnc=${orgRnc}&ncf=${previewNcf}&monto=${totals.totalAmount}&fecha=${formattedDate}`
                )}`}
                alt="QR DGII"
                width={90}
                height={90}
                className="object-contain"
              />
            </div>
            <div className="text-[8px] text-neutral-500 space-y-1 self-end pb-1 font-mono">
              <div>Codigo de Seguridad: <span className="font-bold text-black">{securityCode}</span></div>
              <div>Fecha Firma Digital: <span className="font-bold text-black">{signatureTimestamp}</span></div>
            </div>
          </div>
        ) : (
          <div className="text-[8px] text-neutral-500 max-w-[220px] space-y-1 self-end pb-1">
            <div className="font-bold text-neutral-700 uppercase tracking-wider text-[8.5px]">Comprobante Fiscal Tradicional</div>
            <p className="leading-snug">Este documento representa una factura física impresa con validez fiscal de acuerdo con las normativas generales vigentes de la DGII.</p>
          </div>
        )}

        {/* Totals Breakdown (Right) */}
        <div className="w-full sm:w-[260px] text-[10px] space-y-1.5 self-end">
          <div className="flex justify-between items-center text-neutral-700">
            <span>Sub total exento:</span>
            <span className="font-mono tabular-nums">RD$ {totals.exemptAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-neutral-700">
            <span>Desc:</span>
            <span className="font-mono text-neutral-500 tabular-nums">RD$ {totals.discountTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-neutral-700">
            <span>Sub total gravado:</span>
            <span className="font-mono tabular-nums">RD$ {totals.taxableAmount.toFixed(2)}</span>
          </div>
          
          {!isExemptType && (
            <div className="space-y-1 text-neutral-500 border-b border-neutral-200 pb-1.5">
              {totals.itbis18 > 0 && (
                <div className="flex justify-between items-center text-[9px]">
                  <span>ITBIS 18%:</span>
                  <span className="font-mono tabular-nums">RD$ {totals.itbis18.toFixed(2)}</span>
                </div>
              )}
              {totals.itbis16 > 0 && (
                <div className="flex justify-between items-center text-[9px]">
                  <span>ITBIS 16%:</span>
                  <span className="font-mono tabular-nums text-neutral-900">{totals.itbis16.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center font-bold text-neutral-950 text-[11px] pt-1.5 border-t border-neutral-400">
            <span>Total a pagar:</span>
            <span className="font-mono text-sm tabular-nums">
              RD$ {new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totals.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* ── 6. DOCUMENT FOOTER (Page number & Disclaimer) ── */}
      <div className="pt-8 border-t border-neutral-100 flex justify-between items-center text-neutral-400 text-[8px] tracking-wide">
        <p className="max-w-[450px] uppercase text-left leading-normal">
          {isElectronic
            ? "Representación gráfica de un Comprobante Fiscal Electrónico (e-CF) emitido según Ley de Facturación Electrónica de la RD."
            : "Representación gráfica de un Comprobante Fiscal tradicional (NCF) emitido de acuerdo a la normativa general de la DGII."}
        </p>
        <span className="font-medium shrink-0">Pagina No. 1 de 1</span>
      </div>
      
    </div>
  );
}
