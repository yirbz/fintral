"use client";

import { useState, useCallback, useMemo } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateDgiiFields,
  DgiiFormat,
  DgiiPreviewInvoice,
} from "@/lib/api/dgii";
import {
  getOptionLabel,
  getResolvedOptions,
  useDgiiReferenceOptions,
  type DgiiReferenceOptions,
  type SelectOption,
} from "@/features/dgii/dgii-reference-options";

// ── Column definitions per DGII format ─────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  short: string; // abbreviated for narrow cols
  width: number; // min-width in px
  type: "text" | "number" | "select" | "date" | "readonly";
  options?: SelectOption[];
  getValue: (inv: DgiiPreviewInvoice) => string | number | null;
}

// Helper to extract raw field
const raw = (inv: DgiiPreviewInvoice, key: string) => {
  const v = inv.dgii_fields?.[key as keyof typeof inv.dgii_fields];
  return v != null ? String(v) : "";
};

const deriveIdType = (rnc: string) => {
  const digits = rnc.replace(/\D/g, "");
  if (digits.length === 9) return "1"; // RNC
  if (digits.length === 11) return "2"; // Cédula
  return "3"; // Pasaporte
};

const statusValue = (inv: DgiiPreviewInvoice) => {
  if (inv.reporting_state === "blocked_confirmed_ncf") return "BLOCK";
  return inv.macro_status === "OK" ? "OK" : "ERROR";
};

function getColumns(format: DgiiFormat, referenceOptions: DgiiReferenceOptions): ColDef[] {
  switch (format) {
    case "dgii_606":
      return [
        { key: "_status", label: "Estatus", short: "Est.", width: 52, type: "readonly",
          getValue: statusValue },
        { key: "vendor_tax_id", label: "RNC / Cédula", short: "RNC", width: 100, type: "text",
          getValue: inv => inv.vendor_tax_id },
        { key: "_tipo_id", label: "Tipo Id", short: "TId", width: 44, type: "readonly",
          getValue: inv => deriveIdType(inv.vendor_tax_id) },
        { key: "goods_services_type", label: "Tipo Bienes y Servicios", short: "T.B/S", width: 140, type: "select", options: referenceOptions.goodsServicesTypes,
          getValue: inv => inv.goods_services_type },
        { key: "invoice_number", label: "NCF", short: "NCF", width: 120, type: "text",
          getValue: inv => inv.invoice_number },
        { key: "ncf_modified", label: "NCF Modificado", short: "NCF Mod", width: 120, type: "text",
          getValue: inv => raw(inv, "ncf_modified") },
        { key: "invoice_date", label: "Fecha Comprobante", short: "F.Comp", width: 90, type: "date",
          getValue: inv => inv.invoice_date },
        { key: "payment_date", label: "Fecha Pago", short: "F.Pago", width: 90, type: "date",
          getValue: inv => raw(inv, "payment_date") },
        { key: "_monto_servicios", label: "Monto Facturado Servicios", short: "M.Serv", width: 85, type: "readonly",
          getValue: inv => {
            const gs = inv.goods_services_type;
            if (gs && !["04","09","10"].includes(gs)) {
              const base = (inv.total_amount || 0) - (inv.tax_amount || 0);
              return base.toFixed(2);
            }
            return "";
          }},
        { key: "_monto_bienes", label: "Monto Facturado Bienes", short: "M.Bien", width: 85, type: "readonly",
          getValue: inv => {
            const gs = inv.goods_services_type;
            if (gs && ["04","09","10"].includes(gs)) {
              const base = (inv.total_amount || 0) - (inv.tax_amount || 0);
              return base.toFixed(2);
            }
            return "";
          }},
        { key: "_total_facturado", label: "Total Monto Facturado", short: "Total", width: 90, type: "readonly",
          getValue: inv => {
            const base = (inv.total_amount || 0) - (inv.tax_amount || 0);
            return base.toFixed(2);
          }},
        { key: "tax_amount", label: "ITBIS Facturado", short: "ITBIS", width: 80, type: "number",
          getValue: inv => inv.tax_amount ?? 0 },
        { key: "itbis_retenido", label: "ITBIS Retenido", short: "ITBIS Ret", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_retenido") },
        { key: "itbis_proporcionalidad", label: "ITBIS sujeto a Proporcionalidad", short: "ITBIS Prop", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_proporcionalidad") },
        { key: "itbis_llevado_costo", label: "ITBIS llevado al Costo", short: "ITBIS Cost", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_llevado_costo") },
        { key: "_itbis_adelantar", label: "ITBIS por Adelantar", short: "ITBIS Adel", width: 80, type: "readonly",
          getValue: inv => {
            const itbis = inv.tax_amount || 0;
            const ret = Number(raw(inv, "itbis_retenido")) || 0;
            const prop = Number(raw(inv, "itbis_proporcionalidad")) || 0;
            const cost = Number(raw(inv, "itbis_llevado_costo")) || 0;
            const adel = itbis - ret - prop - cost;
            return adel.toFixed(2);
          }},
        { key: "itbis_percibido", label: "ITBIS Percibido en compras", short: "ITBIS Perc", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_percibido") },
        { key: "isr_retention_type", label: "Tipo Retención en ISR", short: "T.Ret ISR", width: 150, type: "select", options: referenceOptions.isrRetentionTypes,
          getValue: inv => raw(inv, "isr_retention_type") },
        { key: "isr_retention_amount", label: "Monto Retención Renta", short: "M.Ret Renta", width: 85, type: "number",
          getValue: inv => raw(inv, "isr_retention_amount") },
        { key: "isr_percibido", label: "ISR Percibido en compras", short: "ISR Perc", width: 80, type: "number",
          getValue: inv => raw(inv, "isr_percibido") },
        { key: "isc_amount", label: "Impuesto Selectivo al Consumo", short: "ISC", width: 70, type: "number",
          getValue: inv => raw(inv, "isc_amount") },
        { key: "other_taxes", label: "Otros Impuesto/Tasas", short: "Otros", width: 70, type: "number",
          getValue: inv => raw(inv, "other_taxes") },
        { key: "legal_tip", label: "Monto Propina Legal", short: "Propina", width: 70, type: "number",
          getValue: inv => raw(inv, "legal_tip") },
        { key: "payment_method", label: "Forma de Pago", short: "F.Pago", width: 170, type: "select", options: referenceOptions.paymentMethods,
          getValue: inv => raw(inv, "payment_method") },
      ];
    case "dgii_607":
      return [
        { key: "_status", label: "Estatus", short: "Est.", width: 52, type: "readonly",
          getValue: statusValue },
        { key: "vendor_tax_id", label: "RNC / Cédula o Pasaporte", short: "RNC", width: 100, type: "text",
          getValue: inv => inv.vendor_tax_id },
        { key: "_tipo_id", label: "Tipo Identificación", short: "TId", width: 44, type: "readonly",
          getValue: inv => deriveIdType(inv.vendor_tax_id) },
        { key: "invoice_number", label: "NCF", short: "NCF", width: 120, type: "text",
          getValue: inv => inv.invoice_number },
        { key: "ncf_modified", label: "NCF Modificado", short: "NCF Mod", width: 120, type: "text",
          getValue: inv => raw(inv, "ncf_modified") },
        { key: "tipo_ingreso", label: "Tipo de Ingreso", short: "T.Ingr", width: 170, type: "select", options: referenceOptions.incomeTypes,
          getValue: inv => raw(inv, "tipo_ingreso") },
        { key: "invoice_date", label: "Fecha Comprobante", short: "F.Comp", width: 90, type: "date",
          getValue: inv => inv.invoice_date },
        { key: "payment_date", label: "Fecha de Retención", short: "F.Ret", width: 90, type: "date",
          getValue: inv => raw(inv, "payment_date") },
        { key: "_total_facturado", label: "Monto Facturado", short: "Monto", width: 90, type: "readonly",
          getValue: inv => {
            const base = (inv.total_amount || 0) - (inv.tax_amount || 0);
            return base.toFixed(2);
          }},
        { key: "tax_amount", label: "ITBIS Facturado", short: "ITBIS", width: 80, type: "number",
          getValue: inv => inv.tax_amount ?? 0 },
        { key: "itbis_retenido", label: "ITBIS Retenido por Terceros", short: "ITBIS Ret", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_retenido") },
        { key: "itbis_percibido", label: "ITBIS Percibido", short: "ITBIS Perc", width: 80, type: "number",
          getValue: inv => raw(inv, "itbis_percibido") },
        { key: "retencion_renta_terceros", label: "Retención Renta por Terceros", short: "Ret.Renta", width: 85, type: "number",
          getValue: inv => raw(inv, "retencion_renta_terceros") },
        { key: "isr_percibido", label: "ISR Percibido", short: "ISR Perc", width: 80, type: "number",
          getValue: inv => raw(inv, "isr_percibido") },
        { key: "isc_amount", label: "Impuesto Selectivo al Consumo", short: "ISC", width: 70, type: "number",
          getValue: inv => raw(inv, "isc_amount") },
        { key: "other_taxes", label: "Otros Impuestos/Tasas", short: "Otros", width: 70, type: "number",
          getValue: inv => raw(inv, "other_taxes") },
        { key: "legal_tip", label: "Monto Propina Legal", short: "Propina", width: 70, type: "number",
          getValue: inv => raw(inv, "legal_tip") },
        { key: "_efectivo", label: "Efectivo", short: "Efect.", width: 80, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "01" ? String(inv.total_amount || "") : "";
          }},
        { key: "_cheque", label: "Cheque/Trans./Depósito", short: "Cheque", width: 80, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "02" ? String(inv.total_amount || "") : "";
          }},
        { key: "_tarjeta", label: "Tarjeta Débito/Crédito", short: "Tarjeta", width: 80, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "03" ? String(inv.total_amount || "") : "";
          }},
        { key: "_credito", label: "Venta a Crédito", short: "Crédito", width: 80, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "04" ? String(inv.total_amount || "") : "";
          }},
        { key: "_bonos", label: "Bonos o Certificados", short: "Bonos", width: 70, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "06" ? String(inv.total_amount || "") : "";
          }},
        { key: "_permuta", label: "Permuta", short: "Permuta", width: 70, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "05" ? String(inv.total_amount || "") : "";
          }},
        { key: "_otras", label: "Otras Formas de Ventas", short: "Otras", width: 70, type: "readonly",
          getValue: inv => {
            const pm = raw(inv, "payment_method");
            return pm === "07" ? String(inv.total_amount || "") : "";
          }},
      ];
    case "dgii_608":
      return [
        { key: "_status", label: "Estatus", short: "Est.", width: 52, type: "readonly",
          getValue: statusValue },
        { key: "invoice_number", label: "Número Comprobante Fiscal", short: "NCF", width: 140, type: "text",
          getValue: inv => inv.invoice_number },
        { key: "invoice_date", label: "Fecha Comprobante", short: "Fecha", width: 100, type: "date",
          getValue: inv => inv.invoice_date },
        { key: "cancellation_type", label: "Tipo de Anulación", short: "T.Anul", width: 160, type: "select", options: referenceOptions.cancellationTypes,
          getValue: inv => raw(inv, "cancellation_type") },
      ];
    default:
      return getColumns("dgii_606", referenceOptions);
  }
}

// ── Editable Cell ──────────────────────────────────────────────────────

function SpreadsheetCell({ col, value, isEditing, onChange, onCommit, onStartEdit }: {
  col: ColDef;
  value: string;
  isEditing: boolean;
  onChange: (v: string) => void;
  onCommit: (nextValue?: string) => void;
  onStartEdit: () => void;
}) {
  if (col.key === "_status") {
    return (
      <div className={cn(
        "flex items-center justify-center h-full text-[10px] font-bold tracking-wide",
        value === "OK" && "text-emerald-700 bg-emerald-50",
        value === "ERROR" && "text-red-600 bg-red-50",
        value === "BLOCK" && "text-indigo-700 bg-indigo-50",
      )}>
        {value === "OK" && <CheckCircle2 className="size-3 mr-0.5" />}
        {value === "ERROR" && <XCircle className="size-3 mr-0.5" />}
        {value === "BLOCK" && <ShieldCheck className="size-3 mr-0.5" />}
        {value}
      </div>
    );
  }

  if (col.type === "readonly") {
    return (
      <div className="px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground truncate" title={value}>
        {value || ""}
      </div>
    );
  }

  if (isEditing) {
    if (col.type === "select") {
      const resolvedOptions = getResolvedOptions(col.options, value);
      return (
        <select
          className="w-full h-full px-1.5 py-0 text-[11px] border-0 bg-primary/5 outline-none ring-1 ring-primary/30 rounded-none"
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value;
            onChange(nextValue);
            onCommit(nextValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCommit(value);
          }}
          autoFocus
        >
          <option value="">— Sin valor —</option>
          {resolvedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
        className="w-full h-full px-1.5 py-0 text-[11px] font-mono border-0 bg-primary/5 outline-none ring-1 ring-primary/30 rounded-none"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => onCommit()}
        onKeyDown={e => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCommit(); }}
        autoFocus
      />
    );
  }

  const isEmpty = !value && value !== "0";
  const isRequired = ["vendor_tax_id", "invoice_number", "invoice_date", "total_amount", "goods_services_type"].includes(col.key);

  return (
    <div
      className={cn(
        "px-1.5 py-0.5 text-[11px] truncate cursor-text h-full flex items-center",
        "hover:bg-primary/[0.04] transition-colors",
        isEmpty && isRequired && "bg-red-50/50",
        col.type !== "select" && "font-mono",
        col.type === "select" && "font-medium",
        col.type === "number" && "text-right justify-end tabular-nums",
      )}
      title={value || (isRequired ? "⚠ Campo requerido" : "Click para editar")}
      onClick={onStartEdit}
    >
      {isEmpty ? (
        <span className={cn("text-[10px]", isRequired ? "text-red-300" : "text-muted-foreground/30")}>
          {isRequired ? "—" : ""}
        </span>
      ) : value}
    </div>
  );
}

// ── Main Spreadsheet Component ─────────────────────────────────────────

interface DgiiSpreadsheetViewProps {
  invoices: DgiiPreviewInvoice[];
  format: DgiiFormat;
  onRefresh: () => Promise<void>;
}

export function DgiiSpreadsheetView({ invoices, format, onRefresh }: DgiiSpreadsheetViewProps) {
  const { options: referenceOptions } = useDgiiReferenceOptions();
  const columns = useMemo(() => getColumns(format, referenceOptions), [format, referenceOptions]);
  const [editCell, setEditCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // invoice id being saved

  const startEdit = useCallback((rowIdx: number, col: ColDef, currentValue: string) => {
    if (col.type === "readonly") return;
    setEditCell({ row: rowIdx, col: col.key });
    setEditValue(currentValue);
  }, []);

  const commitEdit = useCallback(async (overrideValue?: string) => {
    if (!editCell) return;
    const inv = invoices[editCell.row];
    if (!inv) { setEditCell(null); return; }

    const col = columns.find(c => c.key === editCell.col);
    if (!col) { setEditCell(null); return; }

    const nextValue = overrideValue ?? editValue;

    // Check if value actually changed
    const original = String(col.getValue(inv) ?? "");
    if (nextValue === original) {
      setEditCell(null);
      return;
    }

    setSaving(inv.id);
    try {
      await updateDgiiFields(inv.id, { [editCell.col]: nextValue || null });
      await onRefresh();
    } catch {
      // Silent fail — user will see data didn't change
    } finally {
      setSaving(null);
      setEditCell(null);
    }
  }, [editCell, editValue, invoices, columns, onRefresh]);

  // Count stats
  const blockedCount = invoices.filter(i => i.reporting_state === "blocked_confirmed_ncf").length;
  const reportableInvoices = invoices.filter(i => i.reporting_state !== "blocked_confirmed_ncf");
  const okCount = reportableInvoices.filter(i => i.macro_status === "OK").length;
  const errCount = reportableInvoices.length - okCount;

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground font-medium">{invoices.length} registros</span>
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="size-3" /> {okCount} OK
          </span>
          {errCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3" /> {errCount} con errores
            </span>
          )}
          {blockedCount > 0 && (
            <span className="flex items-center gap-1 text-indigo-700">
              <ShieldCheck className="size-3" /> {blockedCount} bloqueadas (NCF confirmado)
            </span>
          )}
          {saving && (
            <span className="flex items-center gap-1 text-primary animate-pulse">
              <Loader2 className="size-3 animate-spin" /> Guardando...
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Click en cualquier celda para editar · Enter o seleccionar para guardar
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="border border-border rounded-md overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-max min-w-full border-collapse">
            {/* Header */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#4472C4] text-white">
                <th className="px-1.5 py-1.5 text-[9px] font-bold text-center border-r border-[#3b63a8] w-8 sticky left-0 bg-[#4472C4] z-20">
                  #
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="px-1 py-1.5 text-[9px] font-bold text-center border-r border-[#3b63a8] whitespace-nowrap"
                    style={{ minWidth: col.width }}
                    title={col.label}
                  >
                    {col.short}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {invoices.map((inv, rowIdx) => {
                const isBlocked = inv.reporting_state === "blocked_confirmed_ncf";
                const isError = !isBlocked && inv.macro_status !== "OK";
                return (
                  <tr
                    key={inv.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-blue-50/30 transition-colors",
                      rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                      isError && "bg-red-50/20",
                      isBlocked && "bg-indigo-50/40",
                    )}
                  >
                    {/* Row number */}
                    <td className="px-1.5 py-0 text-[10px] text-center text-muted-foreground border-r border-border/30 sticky left-0 bg-inherit z-[5] font-mono">
                      {rowIdx + 1}
                    </td>
                    {/* Data cells */}
                    {columns.map(col => {
                      const rawValue = String(col.getValue(inv) ?? "");
                      const displayValue = col.type === "select"
                        ? getOptionLabel(col.options, rawValue)
                        : rawValue;
                      const isEditing = editCell?.row === rowIdx && editCell?.col === col.key;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "p-0 border-r border-border/20 h-7",
                            saving === inv.id && "opacity-50 pointer-events-none",
                          )}
                          style={{ minWidth: col.width }}
                        >
                          <SpreadsheetCell
                            col={col}
                            value={isEditing ? editValue : displayValue}
                            isEditing={isEditing}
                            onChange={setEditValue}
                            onCommit={commitEdit}
                            onStartEdit={() => startEdit(rowIdx, col, rawValue)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer with warnings */}
      {errCount > 0 && (
        <div className="flex items-start gap-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>{errCount}</strong> factura(s) tienen errores de validación.
            Corrija los campos marcados en rojo antes de generar el TXT.
            La DGII rechazará archivos con datos inválidos.
          </span>
        </div>
      )}
    </div>
  );
}
