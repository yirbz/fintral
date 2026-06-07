"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getInvoice, listInvoices, updateInvoice, verifyInvoice, hardDeleteInvoice } from "@/lib/api/invoices";
import { getBankAccounts } from "@/lib/api/payments";
import { dgiiService } from "@/lib/services/dgii";
import type { TaxpayerDetails } from "@/lib/services/dgii";
import { useDgiiReferenceOptions, getResolvedOptions } from "@/features/dgii/dgii-reference-options";
import type { Invoice } from "@/lib/types";
import { InvoiceImageViewer } from "./invoice-image-viewer";
import { UploadNav } from "./upload-nav";
import { DatePicker } from "./date-picker";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Banknote,
  Building2,
  BadgeCheck,
  FileWarning,
  Trash2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADMIN_CATEGORY_MAP: Record<string, string> = {
  "01": "Personal",
  "02": "Servicios y Suministros",
  "03": "Alquileres",
  "04": "Mantenimiento y Activos",
  "05": "Dietas y Viajes",
  "06": "Otras Deducciones",
  "07": "Gastos Financieros",
  "08": "Gastos Extraordinarios",
  "09": "Costos de Operacion",
  "10": "Adquisicion de Activos",
  "11": "Seguros",
};

const DGII_REQUIRED_FIELDS: (keyof Invoice)[] = [
  "vendor_tax_id",
  "invoice_number",
  "invoice_date",
  "total_amount",
  "tax_amount",
  "goods_services_type",
  "transaction_type",
  "payment_method",
];

function specificFieldWarning(field: keyof Invoice, formState: Partial<Invoice>): string | null {
  const val = formState[field];
  if (val === undefined || val === null) return null;

  switch (field) {
    case "vendor_tax_id": {
      const cleaned = String(val).replace(/[^0-9]/g, "");
      if (cleaned.length === 0) return "RNC vacío — es obligatorio para facturación fiscal";
      if (cleaned.length !== 9 && cleaned.length !== 11)
        return `RNC incompleto: ${cleaned.length}/${cleaned.length > 11 ? "máx. 11" : "9 o 11"} dígitos`;
      return null;
    }
    case "invoice_number": {
      const s = String(val).trim();
      if (s.length === 0) return "NCF vacío — toda factura debe tener un número de comprobante";
      if (s.length < 8) return `NCF muy corto (${s.length} chars) — debe ser un NCF/e-NCF válido`;
      return null;
    }
    case "invoice_date":
      return !val || val === "" ? "Fecha de emisión vacía — requerida para reportes DGII" : null;
    case "total_amount": {
      const n = Number(val);
      if (n === 0) return "Monto total en cero — debe ser mayor a 0";
      if (n < 0) return "Monto total negativo — revisa el valor";
      return null;
    }
    case "tax_amount": {
      const n = Number(val);
      if (n < 0) return "ITBIS negativo — revisa el valor";
      return null;
    }
    case "goods_services_type": {
      if (!val || val === "") {
        const isIncome = formState.transaction_type === "income";
        return isIncome
          ? "Tipo de ingreso no seleccionado — requerido para DGII 607"
          : "Tipo de gasto no seleccionado — requerido para DGII 606";
      }
      return null;
    }
    case "transaction_type":
      return !val || val === "" ? "Tipo de transacción no seleccionado (Gasto/Ingreso)" : null;
    case "payment_method":
      return !val || val === "" ? "Forma de pago no seleccionada — requerida para DGII 606/607" : null;
    default:
      return null;
  }
}

function getFieldWarning(
  field: keyof Invoice,
  warnings: string[],
  formState: Partial<Invoice>
): string | null {
  for (const [pattern, mappedField] of WARNING_FIELD_MAP) {
    if (mappedField === field) {
      for (const w of warnings) {
        if (pattern.test(w)) {
          const val = formState[field];
          if (val === undefined || val === null || val === "" || val === 0) {
            return w;
          }
        }
      }
    }
  }
  if (DGII_REQUIRED_FIELDS.includes(field)) {
    return specificFieldWarning(field, formState);
  }
  return specificFieldWarning(field, formState);
}

function FieldLabel({ children, warning }: { children: ReactNode; warning?: string | null }) {
  return (
    <Label className="text-xs text-muted-foreground inline-flex items-center gap-1">
      {children}
      {warning && (
        <span title={warning}>
          <AlertTriangle className="size-3 text-amber-500 shrink-0" />
        </span>
      )}
    </Label>
  );
}

interface RevisionDetailPageProps {
  invoiceId: string;
}

function cleanRnc(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Map warning keywords to form fields that resolve them. */
const WARNING_FIELD_MAP: [RegExp, keyof Invoice][] = [
  [/(m[eé]todo de pago|forma de pago|payment\s*method)/i, "payment_status"],
  [/(condici[oó]n de pago|payment\s*condition|pago\s*al\s*(contado|cr[eé]dito))/i, "payment_condition"],
  [/(nombre del proveedor|vendor\s*name|proveedor\s*sin\s*nombre)/i, "vendor_name"],
  [/(n[uú]mero de factura|ncf|invoice\s*number)/i, "invoice_number"],
  [/(total|monto|amount)/i, "total_amount"],
  [/(itbis|tax|impuesto)/i, "tax_amount"],
  [/(rnc|cedula|tax\s*id|identificaci[oó]n\s*fiscal)/i, "vendor_tax_id"],
  [/(categor[ií]a|tipo de gasto|goods)/i, "goods_services_type"],
  [/(fecha de emisi[oó]n|invoice\s*date)/i, "invoice_date"],
  [/(fecha de vencimiento|due\s*date)/i, "due_date"],
  [/(tipo de transacci[oó]n|transaction\s*type|ingreso|gasto|venta|compra)/i, "transaction_type"],
  [/(m[eé]todo de pago|payment\s*method|forma\s*(de\s*)?pago)/i, "payment_method"],
];

function computeActiveWarnings(
  rawWarnings: string[],
  formState: Partial<Invoice>
): { active: string[]; resolved: number } {
  let resolved = 0;
  const active: string[] = [];

  for (const w of rawWarnings) {
    let matched = false;
    for (const [pattern, field] of WARNING_FIELD_MAP) {
      if (pattern.test(w)) {
        const val = formState[field];
        if (val !== undefined && val !== null && val !== "" && val !== 0) {
          resolved++;
          matched = true;
        }
        break;
      }
    }
    if (!matched) active.push(w);
  }

  return { active, resolved };
}

export function RevisionDetailPage({ invoiceId }: RevisionDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [formState, setFormState] = useState<Partial<Invoice>>({});

  // RNC autocomplete state
  const [rncLookup, setRncLookup] = useState<TaxpayerDetails | null>(null);
  const [rncLoading, setRncLoading] = useState(false);
  const rncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRncDropdown, setShowRncDropdown] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
  });

  const draftsQuery = useQuery({
    queryKey: ["invoices", "drafts", "navigation"],
    queryFn: () => listInvoices({ status: "draft" }),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts,
    enabled: !!invoiceQuery.data,
  });

  const draftInvoices = (draftsQuery.data?.invoices ?? []).filter(
    (inv) => inv.status === "draft"
  );

  const invoice = invoiceQuery.data;

  const navIndex = useMemo(
    () => draftInvoices.findIndex((inv) => inv.id === invoiceId),
    [draftInvoices, invoiceId]
  );

  const prevInvoice = navIndex > 0 ? draftInvoices[navIndex - 1] : null;
  const nextInvoice =
    navIndex >= 0 && navIndex < draftInvoices.length - 1
      ? draftInvoices[navIndex + 1]
      : null;

  const dgiiRef = useDgiiReferenceOptions();

  useEffect(() => {
    if (invoice) {
      setFormState({
        vendor_name: invoice.vendor_name ?? "",
        vendor_tax_id: invoice.vendor_tax_id ?? "",
        invoice_number: invoice.invoice_number ?? "",
        invoice_date: invoice.invoice_date?.split("T")[0] ?? "",
        total_amount: invoice.total_amount ?? 0,
        tax_amount: invoice.tax_amount ?? 0,
        currency: invoice.currency ?? "DOP",
        goods_services_type: invoice.goods_services_type ?? "",
        transaction_type: invoice.transaction_type ?? "expense",
        payment_method: invoice.payment_method ?? "",
        payment_condition: invoice.payment_condition ?? "contado",
        payment_status: invoice.payment_status ?? "pending",
        due_date: invoice.due_date?.split("T")[0] ?? "",
        payment_date: invoice.payment_date?.split("T")[0] ?? "",
        bank_account_id: invoice.bank_account_id ?? null,
        description: invoice.description ?? "",
        category: invoice.category ?? "",
      });
    }
  }, [invoice]);

  const auditWarnings = useMemo(() => {
    if (!invoice?.audit_flags || invoice.audit_flags === "[]" || invoice.audit_flags === "null")
      return [];
    try {
      const parsed = JSON.parse(invoice.audit_flags);
      if (Array.isArray(parsed)) return parsed.map((f: unknown) => String(f));
      if (typeof parsed === "object" && parsed !== null) {
        const arr = Array.isArray(parsed.warnings)
          ? parsed.warnings
          : Array.isArray(parsed.flags)
          ? parsed.flags
          : [];
        return arr.map((f: unknown) => String(f));
      }
      return [String(parsed)];
    } catch {
      return [invoice.audit_flags];
    }
  }, [invoice?.audit_flags]);

  const isIncomeCategory = formState.transaction_type === "income";
  const categoryOptions = isIncomeCategory
    ? dgiiRef.options.incomeTypes
    : dgiiRef.options.goodsServicesTypes;
  const categoryLabel = isIncomeCategory ? "Tipo de ingreso (DGII 607)" : "Tipo de gasto (DGII 606)";
  const categoryPlaceholder = isIncomeCategory ? "Seleccionar tipo de ingreso..." : "Seleccionar tipo de gasto...";

  const { active: activeWarnings, resolved: resolvedWarnings } = useMemo(
    () => computeActiveWarnings(auditWarnings, formState),
    [auditWarnings, formState]
  );

  const fieldWarnings = useMemo(() => {
    const map: Partial<Record<keyof Invoice, string | null>> = {};
    for (const [, field] of WARNING_FIELD_MAP) {
      map[field] = getFieldWarning(field, auditWarnings, formState);
    }
    for (const field of DGII_REQUIRED_FIELDS) {
      if (!(field in map)) {
        map[field] = getFieldWarning(field, auditWarnings, formState);
      }
    }
    return map;
  }, [auditWarnings, formState]);

  // RNC autocomplete with debounce
  const handleRncChange = useCallback((value: string) => {
    const cleaned = cleanRnc(value).slice(0, 11);
    setFormState((p) => ({ ...p, vendor_tax_id: cleaned }));

    if (rncTimerRef.current) clearTimeout(rncTimerRef.current);

    if (cleaned.length !== 9 && cleaned.length !== 11) {
      setRncLookup(null);
      setShowRncDropdown(false);
      return;
    }

    rncTimerRef.current = setTimeout(async () => {
      setRncLoading(true);
      try {
        const result = await dgiiService.consultTaxpayer(cleaned);
        setRncLookup(result);
        setShowRncDropdown(!!result);
      } catch {
        setRncLookup(null);
        setShowRncDropdown(false);
      } finally {
        setRncLoading(false);
      }
    }, 500);
  }, []);

  const applyRncLookup = useCallback(() => {
    if (!rncLookup) return;
    setFormState((p) => ({
      ...p,
      vendor_tax_id: rncLookup.rnc,
      vendor_name: rncLookup.name || p.vendor_name,
    }));
    setShowRncDropdown(false);
  }, [rncLookup]);

  if (invoiceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <FileWarning className="size-10 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">Factura no encontrada</p>
        <Link
          href="/dashboard/upload/revisions"
          className="text-xs text-primary hover:underline"
        >
          Volver a revisiones
        </Link>
      </div>
    );
  }

  const conf = invoice.confidence_score ?? 1.0;
  const isLowConfidence = conf < 0.7;

  const navigateTo = (id: string) => {
    router.push(`/dashboard/upload/revisions/${id}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isLocked = !!invoice.original_xml_data || invoice.status === "verified";
      const operationalFields: Record<string, unknown> = {
        category: formState.category,
        payment_condition: formState.payment_condition,
        due_date: formState.due_date || null,
        payment_date: formState.payment_date || null,
        payment_status: formState.payment_status,
        bank_account_id: formState.bank_account_id || null,
        description: formState.description,
        payment_method: formState.payment_method || null,
      };
      const fiscalFields: Record<string, unknown> = {
        vendor_name: formState.vendor_name,
        invoice_number: formState.invoice_number,
        invoice_date: formState.invoice_date || null,
        total_amount: formState.total_amount ? Number(formState.total_amount) : 0,
        tax_amount: formState.tax_amount ? Number(formState.tax_amount) : 0,
        currency: formState.currency || "DOP",
        goods_services_type: formState.goods_services_type,
        vendor_tax_id: formState.vendor_tax_id,
        transaction_type: formState.transaction_type || "expense",
      };
      const payload = isLocked ? operationalFields : { ...operationalFields, ...fiscalFields };
      await updateInvoice(invoice.id, payload);

      if (!invoice.original_xml_data && invoice.status !== "verified") {
        await verifyInvoice(invoice.id);
      }

      toast.success("Factura verificada y guardada");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });

      if (nextInvoice) {
        navigateTo(nextInvoice.id);
      } else {
        router.push("/dashboard/upload/revisions");
      }
    } catch (err) {
      toast.error(
        `Error al guardar: ${err instanceof Error ? err.message : "Error del servidor"}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      await hardDeleteInvoice(invoice.id);
      toast.success("Factura descartada definitivamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      if (nextInvoice) {
        navigateTo(nextInvoice.id);
      } else if (prevInvoice) {
        navigateTo(prevInvoice.id);
      } else {
        router.push("/dashboard/upload/revisions");
      }
    } catch (err) {
      toast.error(`Error al descartar: ${err instanceof Error ? err.message : "Error del servidor"}`);
    } finally {
      setDiscarding(false);
      setShowDiscardDialog(false);
    }
  };

  return (
    <div className="h-dvh max-w-[1440px] mx-auto w-full px-3 sm:px-4 lg:px-6 py-2 overflow-hidden grid grid-rows-[auto_auto_auto_1fr] gap-1.5">
      <UploadNav active="revisions" />

      {/* Top bar: back + title + prev/next */}
      <div className="flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard/upload/revisions"
            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 transition-colors"
            aria-label="Volver a revisiones"
          >
            <ArrowLeft className="size-3.5" />
          </Link>
          <div className="min-w-0 flex items-center gap-1.5">
            <h1 className="text-sm font-medium text-foreground truncate max-w-[260px]">
              {invoice.vendor_name || "Proveedor no detectado"}
            </h1>
            {invoice.is_electronic && (
              <Badge variant="outline" className="text-[9px] py-0 px-1 font-semibold bg-primary/5 text-primary border-primary/10 shrink-0">
                e-CF
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
              {draftInvoices.length > 0 ? `${navIndex + 1}/${draftInvoices.length}` : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {prevInvoice && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 px-2"
              onClick={() => navigateTo(prevInvoice.id)}
            >
              <ChevronLeft className="size-3" />
              Anterior
            </Button>
          )}
          {nextInvoice && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 px-2"
              onClick={() => navigateTo(nextInvoice.id)}
            >
              Siguiente
              <ChevronRight className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* AI confidence + dynamic audit warnings */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
            isLowConfidence
              ? "border-red-500/20 bg-red-500/5"
              : conf <= 0.85
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-emerald-500/20 bg-emerald-500/5"
          )}
        >
          {isLowConfidence ? (
            <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
          ) : conf <= 0.85 ? (
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <BadgeCheck className="size-3.5 text-emerald-500 shrink-0" />
          )}
          <span
            className={cn(
              "text-[11px] font-semibold",
              isLowConfidence ? "text-red-600" : conf <= 0.85 ? "text-amber-700" : "text-emerald-700"
            )}
          >
            {Math.round(conf * 100)}% confianza
          </span>
          <span className="text-[10px] text-muted-foreground">
            {invoice.source_type === "xml_ecf"
              ? "e-CF"
              : invoice.source_type === "image_ocr"
              ? "OCR"
              : invoice.source_type === "pdf_text"
              ? "PDF"
              : invoice.source_type || "documento"}
          </span>
        </div>

        {activeWarnings.length > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 max-w-[400px]">
            <ShieldAlert className="size-3.5 text-red-500 shrink-0" />
            <span className="text-[11px] text-red-600 font-medium whitespace-nowrap">
              {activeWarnings.length} alerta{activeWarnings.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[10px] text-red-500/80 truncate hidden sm:inline">
              {activeWarnings[0]}
            </span>
          </div>
        )}

        {resolvedWarnings > 0 && (
          <Badge variant="outline" className="text-[10px] py-0.5 px-1.5 border-emerald-500/20 text-emerald-600 bg-emerald-500/5">
            {resolvedWarnings} resuelta{resolvedWarnings !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Main grid: image + form */}
      <div className="min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Image viewer */}
        <div className="lg:col-span-5 xl:col-span-4 min-h-0">
          <div className="h-full rounded-xl overflow-hidden border border-border">
            <InvoiceImageViewer
              invoiceId={invoice.id}
              filename={invoice.filename || undefined}
              fileType={invoice.file_type || undefined}
              className="h-full"
            />
          </div>
        </div>

        {/* Form panel */}
        <div className="lg:col-span-7 xl:col-span-8 min-h-0">
          <div className="h-full rounded-xl border border-border/60 bg-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2 border-b border-border/50 bg-muted/15 shrink-0 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Datos extraidos por IA
              </h3>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Vendor */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                  <Building2 className="size-3" />
                  Proveedor
                </h4>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5 space-y-1">
                    <FieldLabel warning={null}>Nombre</FieldLabel>
                    <Input
                      className="h-8 text-xs"
                      value={formState.vendor_name ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, vendor_name: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-3 space-y-1 relative">
                    <FieldLabel warning={fieldWarnings.vendor_tax_id}>RNC / Cedula</FieldLabel>
                    <div className="relative">
                      <Input
                        className={cn(
                          "h-8 text-xs font-mono pr-8",
                          rncLoading && "animate-pulse",
                          fieldWarnings.vendor_tax_id && "border-red-500/60 focus-visible:ring-red-500/40"
                        )}
                        value={formState.vendor_tax_id ?? ""}
                        onChange={(e) => handleRncChange(e.target.value)}
                        onFocus={() => rncLookup && setShowRncDropdown(true)}
                        onBlur={() => setTimeout(() => setShowRncDropdown(false), 200)}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {rncLoading ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : fieldWarnings.vendor_tax_id ? (
                          <AlertTriangle className="size-3.5 text-amber-500" />
                        ) : rncLookup ? (
                          <BadgeCheck className="size-3.5 text-emerald-500" />
                        ) : (
                          <Search className="size-3.5 text-muted-foreground/40" />
                        )}
                      </div>
                    </div>
                    {fieldWarnings.vendor_tax_id && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.vendor_tax_id}</p>
                    )}

                    {/* RNC suggestion dropdown */}
                    {showRncDropdown && rncLookup && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={applyRncLookup}
                        >
                          <div className="flex items-center gap-1.5">
                            <BadgeCheck className="size-3 text-emerald-500 shrink-0" />
                            <span className="text-xs font-medium text-foreground truncate">
                              {rncLookup.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              RNC: {rncLookup.rnc}
                            </span>
                            <span className={cn(
                              "text-[9px] px-1 rounded font-medium",
                              rncLookup.status === "ACTIVO" || rncLookup.status?.toLowerCase().includes("activo")
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-red-500/10 text-red-600"
                            )}>
                              {rncLookup.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Click para autocompletar
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="col-span-4 space-y-1">
                    <FieldLabel warning={fieldWarnings.invoice_number}>NCF</FieldLabel>
                    <Input
                      className={cn(
                        "h-8 text-xs font-mono uppercase",
                        fieldWarnings.invoice_number && "border-red-500/60 focus-visible:ring-red-500/40"
                      )}
                      value={formState.invoice_number ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, invoice_number: e.target.value }))}
                    />
                    {fieldWarnings.invoice_number && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.invoice_number}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Amounts + Dates */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                  <Banknote className="size-3" />
                  Montos y Fechas
                </h4>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.invoice_date}>Emision</FieldLabel>
                    <DatePicker
                      value={formState.invoice_date}
                      onChange={(iso) => setFormState((p) => ({ ...p, invoice_date: iso }))}
                      className={fieldWarnings.invoice_date ? "border-red-500/60 ring-red-500/40" : undefined}
                    />
                    {fieldWarnings.invoice_date && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.invoice_date}</p>
                    )}
                  </div>
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.due_date}>Vencimiento</FieldLabel>
                    <DatePicker
                      value={formState.due_date}
                      onChange={(iso) => setFormState((p) => ({ ...p, due_date: iso }))}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.total_amount}>Total</FieldLabel>
                    <Input
                      type="number"
                      step="0.01"
                      className={cn(
                        "h-8 text-xs font-mono font-medium",
                        fieldWarnings.total_amount && "border-red-500/60 focus-visible:ring-red-500/40"
                      )}
                      value={formState.total_amount ?? 0}
                      onChange={(e) => setFormState((p) => ({ ...p, total_amount: Number(e.target.value) }))}
                    />
                    {fieldWarnings.total_amount && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.total_amount}</p>
                    )}
                  </div>
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.tax_amount}>ITBIS</FieldLabel>
                    <Input
                      type="number"
                      step="0.01"
                      className={cn(
                        "h-8 text-xs font-mono",
                        fieldWarnings.tax_amount && "border-red-500/60 focus-visible:ring-red-500/40"
                      )}
                      value={formState.tax_amount ?? 0}
                      onChange={(e) => setFormState((p) => ({ ...p, tax_amount: Number(e.target.value) }))}
                    />
                    {fieldWarnings.tax_amount && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.tax_amount}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* DGII */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                  <FileText className="size-3" />
                  Clasificacion DGII
                </h4>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 space-y-1">
                    <FieldLabel warning={fieldWarnings.goods_services_type}>{categoryLabel}</FieldLabel>
                    <Select
                      value={formState.goods_services_type ?? ""}
                      onValueChange={(val) =>
                        setFormState((p) => ({
                          ...p,
                          goods_services_type: val,
                          category: isIncomeCategory ? "" : (ADMIN_CATEGORY_MAP[val] ?? p.category),
                        }))
                      }
                    >
                      <SelectTrigger className={cn(
                        "h-8 text-xs",
                        fieldWarnings.goods_services_type && "border-red-500/60 ring-red-500/40"
                      )}>
                        <SelectValue placeholder={categoryPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {getResolvedOptions(categoryOptions, formState.goods_services_type).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldWarnings.goods_services_type && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.goods_services_type}</p>
                    )}
                  </div>
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.transaction_type}>Transaccion</FieldLabel>
                    <Select
                      value={formState.transaction_type ?? "expense"}
                      onValueChange={(val) => setFormState((p) => ({
                        ...p,
                        transaction_type: val,
                        goods_services_type: p.transaction_type && p.transaction_type !== val ? "" : p.goods_services_type,
                        category: "",
                      }))}
                    >
                      <SelectTrigger className={cn(
                        "h-8 text-xs",
                        fieldWarnings.transaction_type && "border-red-500/60 ring-red-500/40"
                      )}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense" className="text-xs">Gasto (Compra)</SelectItem>
                        <SelectItem value="income" className="text-xs">Ingreso (Venta)</SelectItem>
                      </SelectContent>
                    </Select>
                    {fieldWarnings.transaction_type && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.transaction_type}</p>
                    )}
                  </div>
                  <div className="col-span-3 space-y-1">
                    <FieldLabel warning={fieldWarnings.payment_method}>Forma de pago (DGII)</FieldLabel>
                    <Select
                      value={formState.payment_method ?? ""}
                      onValueChange={(val) => setFormState((p) => ({ ...p, payment_method: val }))}
                    >
                      <SelectTrigger className={cn(
                        "h-8 text-xs",
                        fieldWarnings.payment_method && "border-red-500/60 ring-red-500/40"
                      )}>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {getResolvedOptions(dgiiRef.options.paymentMethods, formState.payment_method).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldWarnings.payment_method && (
                      <p className="text-[10px] text-red-500/90 leading-tight">{fieldWarnings.payment_method}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notas</h4>
                <div className="space-y-1">
                  <FieldLabel warning={null}>Descripcion / Referencia</FieldLabel>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[56px]"
                    value={formState.description ?? ""}
                    onChange={(e) => setFormState((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Notas internas o referencia..."
                  />
                </div>
              </div>

              {/* Payment */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pago</h4>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">Condicion</Label>
                    <Select
                      value={formState.payment_condition ?? "contado"}
                      onValueChange={(val) => setFormState((p) => ({ ...p, payment_condition: val }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado" className="text-xs">Contado</SelectItem>
                        <SelectItem value="credito" className="text-xs">Credito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">Estado</Label>
                    <Select
                      value={formState.payment_status ?? "pending"}
                      onValueChange={(val) => setFormState((p) => ({ ...p, payment_status: val }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending" className="text-xs">Pendiente</SelectItem>
                        <SelectItem value="paid" className="text-xs">Pagado</SelectItem>
                        <SelectItem value="overdue" className="text-xs">Vencido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">Fecha pago</Label>
                    <DatePicker
                      value={formState.payment_date}
                      onChange={(iso) => setFormState((p) => ({ ...p, payment_date: iso }))}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">Cuenta bancaria</Label>
                    <Select
                      value={formState.bank_account_id ?? ""}
                      onValueChange={(val) => setFormState((p) => ({ ...p, bank_account_id: val || null }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Asociar..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs italic text-muted-foreground">
                          Ninguna
                        </SelectItem>
                        {bankAccounts.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id} className="text-xs">
                            {bank.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-2 border-t border-border/50 bg-muted/15 shrink-0 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 px-3 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                onClick={() => setShowDiscardDialog(true)}
              >
                <Trash2 className="size-3.5" />
                Descartar
              </Button>
              <Link
                href="/dashboard/upload/revisions"
                className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </Link>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 px-3"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {saving ? "Guardando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Discard confirmation dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Descartar factura</DialogTitle>
            <DialogDescription className="text-xs">
              Esta factura se eliminara definitivamente del sistema. Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowDiscardDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={handleDiscard}
              disabled={discarding}
            >
              {discarding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {discarding ? "Descartando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
