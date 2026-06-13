"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Code2, Download, Expand, FileCode2, FileText, Flame, Lock, RotateCcw, Save, Sparkles, Trash2, X, XCircle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { bulkPermanentDelete as permanentDeleteApi, cancelInvoice, deleteInvoice, getInvoice, getOptimizedImage, processInvoice, restoreInvoice, uncancelInvoice, updateInvoice } from "@/lib/api/invoices";
import { getBankAccounts } from "@/lib/api/payments";
import { formatDate, getItbisDetail } from "@/lib/utils/date";
import type { ChildModificatory, Invoice } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DgiiSelect } from "@/components/dgii-select";
import { useReferenceData } from "@/hooks/use-reference-data";
import { toast } from "sonner";
import { Building2, Globe, Landmark, MinusCircle, PlusCircle, Receipt, ShoppingBag, UserCheck, Calendar as LucideCalendar } from "lucide-react";

interface FiscalImpactInfo {
  title: string;
  isr: { status: "apto" | "no_apto" | "retencion"; desc: string };
  itbis: { status: "apto" | "no_apto" | "exento" | "costo"; desc: string };
  retention: string | null;
  desc: string;
  icon: React.ElementType;
}

const FISCAL_IMPACT_MAP: Record<string, FiscalImpactInfo> = {
  "31": {
    title: "Crédito Fiscal (B01/E31)",
    isr: { status: "apto", desc: "Apto para deducir costos/gastos en el ISR." },
    itbis: { status: "apto", desc: "Adelanta 100% del ITBIS facturado como crédito fiscal." },
    retention: null,
    desc: "Factura comercial para transacciones entre contribuyentes registrados en la DGII.",
    icon: FileText,
  },
  "32": {
    title: "Consumo (B02/E32)",
    isr: { status: "no_apto", desc: "No deducible para el Impuesto Sobre la Renta (ISR)." },
    itbis: { status: "no_apto", desc: "No deducible. El ITBIS pagado no genera crédito fiscal." },
    retention: null,
    desc: "Destinado a consumidores finales. Nota: Para transacciones de RD$250,000 o más, es obligatorio registrar la cédula/pasaporte del comprador.",
    icon: ShoppingBag,
  },
  "33": {
    title: "Nota de Débito (B03/E33)",
    isr: { status: "apto", desc: "Aumenta el costo o gasto originalmente reportado." },
    itbis: { status: "apto", desc: "Aumenta el ITBIS originalmente adelantado." },
    retention: null,
    desc: "Utilizado por el emisor para recuperar costos adicionales o recargos posteriores. Requiere NCF Modificado.",
    icon: PlusCircle,
  },
  "34": {
    title: "Nota de Crédito (B04/E34)",
    isr: { status: "apto", desc: "Disminuye el costo o gasto originalmente reportado." },
    itbis: { status: "apto", desc: "Disminuye el ITBIS originalmente adelantado." },
    retention: null,
    desc: "Aplicado para anulaciones, devoluciones o descuentos concedidos. Requiere NCF Modificado.",
    icon: MinusCircle,
  },
  "41": {
    title: "Comprobante de Compras (B11/E41)",
    isr: { status: "apto", desc: "Deducible de ISR (autoemitido por el adquirente)." },
    itbis: { status: "exento", desc: "Sujeto a retención del 100% del ITBIS." },
    retention: "Requiere retención obligatoria del 100% del ITBIS facturado y del ISR (2% para bienes, 10% para servicios).",
    desc: "Comprobante emitido por el comprador para registrar transacciones con personas físicas no registradas como contribuyentes (informales).",
    icon: UserCheck,
  },
  "42": {
    title: "Registro Único de Ingresos (B12/E42)",
    isr: { status: "apto", desc: "Deduce costos consolidados (RUI)." },
    itbis: { status: "exento", desc: "No genera crédito de ITBIS (operaciones exentas)." },
    retention: null,
    desc: "Documento para consolidar transacciones diarias exentas de ITBIS realizadas a consumidores finales.",
    icon: LucideCalendar,
  },
  "43": {
    title: "Gastos Menores (B13/E43)",
    isr: { status: "apto", desc: "Deducible como gasto operativo en el ISR." },
    itbis: { status: "costo", desc: "El ITBIS pagado se lleva directamente al costo (no se adelanta)." },
    retention: null,
    desc: "Emitido para sustentar gastos menores incurridos por empleados de la empresa (caja chica, peajes, dietas).",
    icon: Receipt,
  },
  "44": {
    title: "Regímenes Especiales (B14/E44)",
    isr: { status: "apto", desc: "Deducible de ISR." },
    itbis: { status: "exento", desc: "Exento de ITBIS (tasa 0% por ley especial)." },
    retention: null,
    desc: "Para ventas a clientes amparados por regímenes de exención fiscal (Zonas Francas, turismo). Requiere número de carnet de exención.",
    icon: Sparkles,
  },
  "45": {
    title: "Gubernamental (B15/E45)",
    isr: { status: "apto", desc: "Deducible de ISR." },
    itbis: { status: "apto", desc: "Sujeto a retención del 5% del ISR por parte del Estado." },
    retention: "Sujeto a retención del 5% del ISR al momento de recibir el pago de la institución pública.",
    desc: "Emitido para facturar ventas realizadas al Estado Dominicano e instituciones públicas.",
    icon: Building2,
  },
  "46": {
    title: "Exportaciones (B16/E46)",
    isr: { status: "apto", desc: "Deducible. Tasa cero." },
    itbis: { status: "exento", desc: "ITBIS Tasa 0% (exento)." },
    retention: null,
    desc: "Emitido para facturar mercancías vendidas a clientes fuera de la República Dominicana.",
    icon: Globe,
  },
  "47": {
    title: "Pagos al Exterior (B17/E47)",
    isr: { status: "retencion", desc: "Deducible de ISR tras efectuar retención obligatoria." },
    itbis: { status: "no_apto", desc: "No aplica ITBIS." },
    retention: "Sujeto a retención obligatoria de ISR (tasa del 27% o similar según la naturaleza de la renta).",
    desc: "Comprobante autoemitido por la empresa para registrar gastos por servicios o rentas de proveedores no residentes. El emisor es el RNC del contribuyente.",
    icon: Landmark,
  },
};


const DGII_CATEGORIES: { code: string; label: string }[] = [
  { code: "01", label: "01 Gastos de Personal" },
  { code: "02", label: "02 Gastos por Trabajos, Suministros y Servicios" },
  { code: "03", label: "03 Arrendamientos" },
  { code: "04", label: "04 Gastos de Activos Fijos" },
  { code: "05", label: "05 Gastos de Representación" },
  { code: "06", label: "06 Otras Deducciones Admitidas" },
  { code: "07", label: "07 Gastos Financieros" },
  { code: "08", label: "08 Gastos Extraordinarios" },
  { code: "09", label: "09 Costos y Gastos de Operación" },
  { code: "10", label: "10 Adquisiciones de Activos" },
  { code: "11", label: "11 Gastos de Seguros" },
];

function validCategoryCode(v: string | null | undefined, validCodes: Set<string>): string {
  return v && validCodes.has(v) ? v : "";
}

const OPERATIONAL_METADATA_FIELDS = new Set([
  "category", "description", "due_date", "payment_status", "payment_condition", "payment_date", "bank_account_id", "payment_method", "warnings_reviewed",
] as const);

function normalizePaymentMethod(pm: any): string | null {
  if (pm === null || pm === undefined) return null;
  const str = String(pm).trim();
  if (str === "" || str === "none") return null;
  return str.length === 1 ? `0${str}` : str;
}

function getDirtyFields(original: Invoice, current: Partial<Invoice>): Partial<Invoice> {
  const dirty: Record<string, unknown> = {};
  
  // Normalize original warnings_reviewed and payment_method so we compare correctly
  let origPm = null;
  let origWr = false;
  if (original?.raw_extracted_data) {
    try {
      const raw = JSON.parse(original.raw_extracted_data);
      origPm = normalizePaymentMethod(raw.payment_method);
      origWr = raw.warnings_reviewed === true;
    } catch {}
  }

  const normalizedOriginal = {
    ...original,
    payment_method: origPm,
    warnings_reviewed: origWr,
  } as any;

  for (const key of Object.keys(current) as Array<keyof Invoice>) {
    const orig = normalizedOriginal[key];
    const curr = current[key];
    if (JSON.stringify(orig) !== JSON.stringify(curr)) {
      dirty[key] = curr;
    }
  }
  return dirty;
}


export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {data: query_data, isLoading: query_isLoading, refetch: query_refetch} = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId)
  });
  const [editable, setEditable] = useState<Partial<Invoice>>({});
  const [showFullImage, setShowFullImage] = useState(false);
  const [showXmlCode, setShowXmlCode] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancelType, setCancelType] = useState("01");
  const [imageLoaded, setImageLoaded] = useState(false);
  const {data: image_data, isLoading: image_isLoading} = useQuery({
    queryKey: ["invoice-image", invoiceId],
    queryFn: () => getOptimizedImage(invoiceId),
    enabled: query_data?.file_type === "image"
  });

  const {data: bankAccountsQuery_data} = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts,
  });

  const editableInitRef = useRef(false);
  if (query_data && !editableInitRef.current) {
    editableInitRef.current = true;
    let pm = null;
    let wr = false;
    if (query_data.raw_extracted_data) {
      try {
        const raw = JSON.parse(query_data.raw_extracted_data);
        pm = normalizePaymentMethod(raw.payment_method);
        wr = raw.warnings_reviewed === true;
      } catch {}
    }
    setEditable({
      ...query_data,
      payment_method: pm,
      warnings_reviewed: wr,
    } as any);
  }

  const incomeTypesQuery = useReferenceData("income_types");
  const incomeTypeOptions = useMemo(() =>
    (incomeTypesQuery.data ?? []).map((item) => ({
      value: item.code,
      label: `${item.code} - ${item.label_es}`,
    })),
    [incomeTypesQuery.data]
  );
  const isIncome = editable.transaction_type === "income";

  const saveMutation = useMutation({
    mutationFn: () => {
      const dirty = getDirtyFields(query_data!, editable);
      if (isLocked) {
        const filtered: Record<string, unknown> = {};
        for (const key of Object.keys(dirty)) {
          if ((OPERATIONAL_METADATA_FIELDS as Set<string>).has(key)) {
            filtered[key] = dirty[key as keyof Invoice];
          }
        }
        return updateInvoice(invoiceId, filtered);
      }
      return updateInvoice(invoiceId, dirty);
    },
    onSuccess: () => query_refetch()
  });

  const processMutation = useMutation({
    mutationFn: () => processInvoice(invoiceId),
    onSuccess: () => query_refetch()
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push("/dashboard/invoices");
    }
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreInvoice(invoiceId),
    onSuccess: () => {
      toast.success("Factura restaurada exitosamente");
      void query_refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al restaurar"),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: () => permanentDeleteApi([invoiceId]),
    onSuccess: async (data) => {
      toast.success(`${data.count} factura eliminada permanentemente`);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push("/dashboard/invoices/trash");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al eliminar"),
  });

  const cancelMutation = useMutation({
    mutationFn: (cancellationType: string) => cancelInvoice(invoiceId, cancellationType),
    onSuccess: () => {
      toast.success("Factura anulada exitosamente");
      void query_refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al anular"),
  });

  const uncancelMutation = useMutation({
    mutationFn: () => uncancelInvoice(invoiceId),
    onSuccess: () => {
      toast.success("Anulación revertida");
      void query_refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al revertir anulación"),
  });

  const flags = useMemo(() => {
    if (!query_data?.audit_flags) return [] as string[];
    try {
      const parsed = JSON.parse(query_data.audit_flags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [query_data?.audit_flags]);

  const hasUnsavedChanges = useMemo(() => {
    if (!query_data) return false;
    return Object.keys(getDirtyFields(query_data, editable)).length > 0;
  }, [editable, query_data]);

  const rawData = useMemo(() => {
    if (!query_data?.raw_extracted_data) return null;
    try { return JSON.parse(query_data.raw_extracted_data) as Record<string, unknown>; } catch { return null; }
  }, [query_data?.raw_extracted_data]);

  if (query_isLoading || !query_data) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </CardHeader>
        </Card>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader><Skeleton className="h-4 w-24 rounded-md" /></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={i === 7 ? "md:col-span-2" : ""}>
                    <Skeleton className="mb-1 h-3 w-16 rounded-md" />
                    <Skeleton className="h-7 w-full rounded-md" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader><Skeleton className="h-4 w-28 rounded-md" /></CardHeader>
              <CardContent>
                <Skeleton className="h-40 w-full rounded-md" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><Skeleton className="h-4 w-24 rounded-md" /></CardHeader>
              <CardContent className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-16 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const invoice = query_data!;
  const isTrashed = !!invoice.deleted_at;
  const isLocked = !!invoice.original_xml_data || invoice.status === "verified";
  const discardChanges = () => {
    let pm = null;
    let wr = false;
    if (invoice.raw_extracted_data) {
      try {
        const raw = JSON.parse(invoice.raw_extracted_data);
        pm = normalizePaymentMethod(raw.payment_method);
        wr = raw.warnings_reviewed === true;
      } catch {}
    }
    setEditable({
      ...invoice,
      payment_method: pm,
      warnings_reviewed: wr,
    } as any);
  };
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: editable.currency || invoice.currency || "USD"
  }).format(editable.total_amount ?? invoice.total_amount ?? 0);

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 pb-10 w-full max-w-7xl mx-auto">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href={isTrashed ? "/dashboard/invoices/trash" : "/dashboard/invoices"}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <CardTitle>{editable.vendor_name || invoice.vendor_name || "Documento sin procesar"}</CardTitle>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isTrashed ? (
              <>
                <Badge variant="destructive">En papelera</Badge>
                <Button size="sm" variant="outline" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
                  <RotateCcw className="size-3.5" data-icon="inline-start" />
                  Restaurar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => permanentDeleteMutation.mutate()} disabled={permanentDeleteMutation.isPending}>
                  <Flame className="size-3.5" data-icon="inline-start" />
                  Eliminar permanentemente
                </Button>
              </>
            ) : (
              <>
                <Badge variant={invoice.processed ? "default" : "secondary"}>
                  {invoice.processed ? "Procesado" : "Borrador"}
                </Badge>
                {invoice.source_type === "xml" || invoice.source_type === "ecf" ? (
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/5">
                    <FileCode2 className="size-3 mr-1" />
                    e-CF{invoice.ecf_type ? ` ${invoice.ecf_type}` : ""}
                  </Badge>
                ) : null}
                {invoice.cancelled_at ? (
                  <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-600">
                    <XCircle className="size-3 mr-1" />
                    Anulada
                  </Badge>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => processMutation.mutate()} disabled={invoice.processed}>
                  <Sparkles className="size-3.5" data-icon="inline-start" />
                  Analizar
                </Button>
                {hasUnsavedChanges ? (
                  <>
                    <Button size="sm" variant="default" onClick={() => saveMutation.mutate()}>
                      <Save className="size-3.5" data-icon="inline-start" />
                      Guardar cambios
                    </Button>
                    <Button size="sm" variant="ghost" onClick={discardChanges}>
                      <X className="size-3.5" data-icon="inline-start" />
                      Descartar
                    </Button>
                  </>
                ) : null}
                {invoice.cancelled_at ? (
                  <Button size="sm" variant="outline" onClick={() => uncancelMutation.mutate()} disabled={uncancelMutation.isPending}>
                    <Ban className="size-3.5" data-icon="inline-start" />
                    Desanular
                  </Button>
                ) : invoice.transaction_type === "income" ? (
                  <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setCancelDialogOpen(true)}>
                    <XCircle className="size-3.5" data-icon="inline-start" />
                    Anular
                  </Button>
                ) : null}
                <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="size-3.5" data-icon="inline-start" />
                  Eliminar
                </Button>
              </>
            )}
          </div>
        </CardHeader>
      </Card>

      {isTrashed ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-xs text-destructive">
              Esta factura está en la papelera. No se puede modificar hasta que sea restaurada.
              {invoice.deleted_at ? ` Eliminada el ${new Date(invoice.deleted_at).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}.` : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {invoice.cancelled_at ? (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-center gap-3 py-3">
            <XCircle className="size-4 text-orange-600 shrink-0" />
            <div className="text-xs text-orange-900">
              <span className="font-semibold">Factura anulada</span>
              <span className="text-orange-700">
                {" — "}Tipo: {invoice.cancellation_type || "01"} ·{" "}
                {new Date(invoice.cancelled_at).toLocaleDateString("es-DO", {
                  day: "numeric", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {flags.length > 0 && !editable.warnings_reviewed ? (
        <Card className="border-amber-500/20 bg-amber-500/[0.04] dark:bg-amber-500/[0.02]">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold text-[11px] uppercase tracking-wider">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Alertas del Auditor Fiscal (DGII)
              </div>
              <Button
                size="xs"
                variant="outline"
                className="text-[10px] h-6 border-amber-500/30 text-amber-700 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-400 dark:bg-amber-500/5 dark:hover:bg-amber-500/10"
                onClick={() => setEditable((prev) => ({ ...prev, warnings_reviewed: true }))}
              >
                <CheckCircle2 className="size-3 mr-1" />
                Marcar como revisadas
              </Button>
            </div>
            <div className="grid gap-2">
              {flags.map((flag, idx) => {
                const isCritical = flag.includes("RNC") || flag.includes("retención") || flag.includes("inválido") || flag.includes("debe coincidir");
                return (
                  <div key={idx} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs leading-relaxed transition-all hover:translate-x-0.5 ${
                    isCritical 
                      ? "border-destructive/20 bg-destructive/5 text-destructive dark:text-red-400"
                      : "border-amber-500/10 bg-amber-500/[0.02] text-amber-950 dark:text-amber-300"
                  }`}>
                    {isCritical ? (
                      <Ban className="size-4 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <Sparkles className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span className="text-[11px] leading-relaxed">{flag}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : flags.length > 0 && editable.warnings_reviewed ? (
        <Card className="border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02]">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Advertencias de auditoría revisadas y aceptadas como correctas.</span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              className="text-[10px] h-6 text-muted-foreground hover:text-foreground"
              onClick={() => setEditable((prev) => ({ ...prev, warnings_reviewed: false }))}
            >
              Reabrir advertencias
            </Button>
          </CardContent>
        </Card>
      ) : null}


      {isLocked ? (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex items-start gap-3 py-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Datos fiscales bloqueados</span>
              {" — "}
              {invoice.original_xml_data
                ? "Esta factura electrónica (e-CF) está respaldada por un XML firmado digitalmente. Los valores extraídos del comprobante son inmutables."
                : "Esta factura ya fue verificada. Los datos fiscales están bloqueados para preservar la integridad del reporte."}
              {" "}Puedes modificar la categoría, descripción y metadatos operativos.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">

          {/* ── Fiscal Core ── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Datos fiscales</CardTitle>
                {isLocked ? (
                  <Badge variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/[0.04]">
                    <Lock className="size-2.5 mr-1" />
                    Inmutable
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field
                label="Proveedor"
                locked={isLocked}
              >
                <Input
                  value={editable.vendor_name ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, vendor_name: event.target.value }))}
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>
              <Field
                label="RNC / Cédula"
                locked={isLocked}
              >
                <Input
                  value={editable.vendor_tax_id ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, vendor_tax_id: event.target.value }))}
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>
              <Field
                label="NCF"
                locked={isLocked}
              >
                <Input
                  value={editable.invoice_number ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_number: event.target.value }))}
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>
              <Field
                label="Fecha"
                locked={isLocked}
              >
                <Input
                  type="date"
                  value={editable.invoice_date ? (editable.invoice_date as string).split("T")[0] : ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_date: event.target.value }))}
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>
              <Field
                label="Moneda"
                locked={isLocked}
              >
                <Select
                  value={(editable.currency ?? "USD") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, currency: value }))}
                  disabled={isTrashed || isLocked}
                >
                  <SelectTrigger className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="DOP">DOP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="MXN">MXN</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Tipo transacción"
                locked={isLocked}
              >
                <Select
                  value={(editable.transaction_type ?? "expense") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, transaction_type: value }))}
                  disabled={isTrashed || isLocked}
                >
                  <SelectTrigger className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="expense">Gasto</SelectItem>
                      <SelectItem value="income">Ingreso</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Total"
                locked={isLocked}
              >
                <Input
                  type="number"
                  value={Number(editable.total_amount ?? 0)}
                  onChange={(event) =>
                    setEditable((prev) => ({ ...prev, total_amount: Number(event.target.value) || 0 }))
                  }
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>
               <Field
                 label={isIncome ? "ITBIS Cobrado" : "Total ITBIS"}
                 locked={isLocked}
               >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={Number(editable.tax_amount ?? 0)}
                    onChange={(event) =>
                      setEditable((prev) => ({ ...prev, tax_amount: Number(event.target.value) || 0 }))
                    }
                    disabled={isTrashed || isLocked}
                    className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                  />
                  <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                    {getItbisDetail(invoice).rate}
                  </span>
                </div>
              </Field>
              {/* RNC Comprador - only for e-CF types that require buyer RNC (not 41/43, not income) */}
              {!isIncome && editable.ecf_type && ["31", "44", "45"].includes(editable.ecf_type) && (
                <Field
                  label="RNC Comprador"
                  locked={isLocked}
                >
                  <Input
                    value={editable.rnc_comprador ?? ""}
                    onChange={(event) => setEditable((prev) => ({ ...prev, rnc_comprador: event.target.value }))}
                    disabled={isTrashed || isLocked}
                    className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                  />
                </Field>
              )}
              <Field
                label="Tipo Comprobante (e-CF / NCF)"
                locked={isLocked}
              >
                <Select
                  value={editable.ecf_type || "none"}
                  onValueChange={(val) => setEditable((prev) => ({ ...prev, ecf_type: val === "none" ? "" : val }))}
                  disabled={isTrashed || isLocked}
                >
                  <SelectTrigger className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguno (No dominicano)</SelectItem>
                    <SelectItem value="31">Crédito Fiscal (B01/E31)</SelectItem>
                    <SelectItem value="32">Consumo (B02/E32)</SelectItem>
                    <SelectItem value="33">Nota de Débito (B03/E33)</SelectItem>
                    <SelectItem value="34">Nota de Crédito (B04/E34)</SelectItem>
                    <SelectItem value="41">Compras (B11/E41)</SelectItem>
                    <SelectItem value="42">Registro Único de Ingresos (B12/E42)</SelectItem>
                    <SelectItem value="43">Gastos Menores (B13/E43)</SelectItem>
                    <SelectItem value="44">Regímenes Especiales (B14/E44)</SelectItem>
                    <SelectItem value="45">Gubernamental (B15/E45)</SelectItem>
                    <SelectItem value="46">Exportación (B16/E46)</SelectItem>
                    <SelectItem value="47">Pago al Exterior (B17/E47)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

               <Field
                 label={isIncome ? "Tipo bienes (DGII 607)" : "Tipo bienes (DGII 606)"}
                 locked={isLocked}
               >
                 <DgiiSelect
                   domain="goods_services_types"
                   value={(editable.goods_services_type || "none") as string}
                   onChange={(value) => setEditable((prev) => ({ ...prev, goods_services_type: value === "none" ? "" : value }))}
                   disabled={isTrashed || isLocked}
                 />
               </Field>
              <Field label="País" locked={isLocked}>
                <Select
                  value={(editable.vendor_country || "DO") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, vendor_country: value }))}
                  disabled={isTrashed || isLocked}
                >
                  <SelectTrigger className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="DO">República Dominicana</SelectItem>
                      <SelectItem value="US">Estados Unidos</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                      <SelectItem value="ES">España</SelectItem>
                      <SelectItem value="CO">Colombia</SelectItem>
                      <SelectItem value="PA">Panamá</SelectItem>
                      <SelectItem value="PR">Puerto Rico</SelectItem>
                      <SelectItem value="CR">Costa Rica</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dirección fiscal" className="md:col-span-2" locked={isLocked}>
                <Input
                  value={editable.vendor_fiscal_address ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, vendor_fiscal_address: event.target.value }))}
                  disabled={isTrashed || isLocked}
                  className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                />
              </Field>

              {/* Emisor extra fields — read-only, from XML raw data */}
              {(invoice.source_type === "xml" || invoice.source_type === "ecf") && rawData && (
                <>
                  <div className="md:col-span-2 -mb-1 mt-1">
                    <div className="h-px bg-border/50" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-2 block">Datos del emisor (XML)</span>
                  </div>
                  {rawData.fecha_emision ? (
                    <Field label="Fecha de emisión">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.fecha_emision as string}</div>
                    </Field>
                  ) : null}
                  {rawData.fecha_vencimiento_secuencia ? (
                    <Field label="Vencimiento de secuencia NCF">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.fecha_vencimiento_secuencia as string}</div>
                    </Field>
                  ) : null}
                  {rawData.nombre_comercial ? (
                    <Field label="Nombre comercial">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.nombre_comercial as string}</div>
                    </Field>
                  ) : null}
                  {rawData.correo_emisor ? (
                    <Field label="Correo electrónico">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.correo_emisor as string}</div>
                    </Field>
                  ) : null}
                  {rawData.sucursal ? (
                    <Field label="Sucursal">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.sucursal as string}</div>
                    </Field>
                  ) : null}
                  {(rawData.municipio_emisor || rawData.provincia_emisor) ? (
                    <Field label="Ubicación">
                      <div className="flex h-9 items-center text-xs text-muted-foreground">
                        {[rawData.municipio_emisor as string, rawData.provincia_emisor as string].filter(Boolean).join(", ")}
                      </div>
                    </Field>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Card de Impacto Fiscal ── */}
          {(() => {
            const selectedEcf = editable.ecf_type;
            const impact = selectedEcf ? FISCAL_IMPACT_MAP[selectedEcf] : null;
            if (!impact) return null;
            const ImpactIcon = impact.icon;
            return (
              <Card className="border-indigo-500/10 bg-indigo-500/[0.02] dark:bg-indigo-500/[0.01]">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <ImpactIcon className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold text-foreground">
                      Impacto Fiscal: {impact.title}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      {impact.desc}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3 pt-0 text-xs">
                  {/* ISR Deductibility */}
                  <div className={`p-3 rounded-lg border flex flex-col gap-1 ${
                    impact.isr.status === "apto"
                      ? "border-emerald-500/20 bg-emerald-500/[0.02] text-emerald-950 dark:text-emerald-300"
                      : impact.isr.status === "retencion"
                      ? "border-amber-500/20 bg-amber-500/[0.02] text-amber-950 dark:text-amber-300"
                      : "border-red-500/20 bg-red-500/[0.02] text-red-950 dark:text-red-300"
                  }`}>
                    <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
                      <span className={`w-2.5 h-2.5 rounded-full flex items-center justify-center shrink-0 ${
                        impact.isr.status === "apto"
                          ? "bg-emerald-500"
                          : impact.isr.status === "retencion"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`} />
                      Deducible ISR
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      {impact.isr.desc}
                    </p>
                  </div>

                  {/* ITBIS Credit */}
                  <div className={`p-3 rounded-lg border flex flex-col gap-1 ${
                    impact.itbis.status === "apto"
                      ? "border-emerald-500/20 bg-emerald-500/[0.02] text-emerald-950 dark:text-emerald-300"
                      : impact.itbis.status === "costo"
                      ? "border-blue-500/20 bg-blue-500/[0.02] text-blue-950 dark:text-blue-300"
                      : impact.itbis.status === "exento"
                      ? "border-orange-500/20 bg-orange-500/[0.02] text-orange-950 dark:text-orange-300"
                      : "border-red-500/20 bg-red-500/[0.02] text-red-950 dark:text-red-300"
                  }`}>
                    <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
                      <span className={`w-2.5 h-2.5 rounded-full flex items-center justify-center shrink-0 ${
                        impact.itbis.status === "apto"
                          ? "bg-emerald-500"
                          : impact.itbis.status === "costo"
                          ? "bg-blue-500"
                          : impact.itbis.status === "exento"
                          ? "bg-orange-500"
                          : "bg-red-500"
                      }`} />
                      Crédito ITBIS
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      {impact.itbis.desc}
                    </p>
                  </div>

                  {/* Retenciones */}
                  <div className={`p-3 rounded-lg border flex flex-col gap-1 ${
                    impact.retention
                      ? "border-amber-500/30 bg-amber-500/[0.04] text-amber-950 dark:text-amber-300"
                      : "border-border bg-muted/20 text-muted-foreground"
                  }`}>
                    <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
                      <span className={`w-2.5 h-2.5 rounded-full flex items-center justify-center shrink-0 ${
                        impact.retention ? "bg-amber-500" : "bg-muted-foreground/30"
                      }`} />
                      Retenciones
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      {impact.retention || "No requiere retención de ITBIS/ISR obligatoria en la transacción."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Comprador (e-CF 31/44/45 only) ── */}
          {(invoice.source_type === "xml" || invoice.source_type === "ecf") && !isIncome && editable.ecf_type && ["31", "44", "45"].includes(editable.ecf_type) && rawData && (
            <Card className="border-indigo-500/5">
              <CardHeader>
                <CardTitle>Comprador</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Field label="RNC Comprador">
                  <Input
                    value={editable.rnc_comprador ?? ""}
                    onChange={(event) => setEditable((prev) => ({ ...prev, rnc_comprador: event.target.value }))}
                    disabled={isTrashed || isLocked}
                    className={isLocked ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
                  />
                </Field>
                {rawData.razon_social_comprador ? (
                  <Field label="Razón social">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.razon_social_comprador as string}</div>
                  </Field>
                ) : null}
                {rawData.direccion_comprador ? (
                  <Field label="Dirección" className="md:col-span-2">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.direccion_comprador as string}</div>
                  </Field>
                ) : null}
                {rawData.correo_comprador ? (
                  <Field label="Correo">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.correo_comprador as string}</div>
                  </Field>
                ) : null}
                {(rawData.municipio_comprador || rawData.provincia_comprador) ? (
                  <Field label="Ubicación">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">
                      {[rawData.municipio_comprador as string, rawData.provincia_comprador as string].filter(Boolean).join(", ")}
                    </div>
                  </Field>
                ) : null}
                {rawData.contacto_comprador ? (
                  <Field label="Contacto">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.contacto_comprador as string}</div>
                  </Field>
                ) : null}
                {rawData.numero_orden_compra ? (
                  <Field label="Orden de compra #">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.numero_orden_compra as string}</div>
                  </Field>
                ) : null}
                {rawData.identificador_extranjero ? (
                  <Field label="Id. Extranjero">
                    <div className="flex h-9 items-center text-xs text-muted-foreground">{rawData.identificador_extranjero as string}</div>
                  </Field>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* ── Desglose Fiscal (from XML Totales) ── */}
          {(invoice.source_type === "xml" || invoice.source_type === "ecf") && rawData && (
            <Card>
              <CardHeader>
                <CardTitle>Desglose fiscal</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {rawData.monto_gravado_total != null ? (
                  <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monto gravado</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.monto_gravado_total as number)}
                    </p>
                  </div>
                ) : null}
                {rawData.monto_exento != null ? (
                  <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monto exento</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.monto_exento as number)}
                    </p>
                  </div>
                ) : null}
                {rawData.total_itbis_retenido != null ? (
                  <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">ITBIS retenido</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.total_itbis_retenido as number)}
                    </p>
                  </div>
                ) : null}
                {rawData.total_isr_retencion != null ? (
                  <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">ISR retenido</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.total_isr_retencion as number)}
                    </p>
                  </div>
                ) : null}
                {rawData.total_itbis_percepcion != null ? (
                  <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">ITBIS percepción</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.total_itbis_percepcion as number)}
                    </p>
                  </div>
                ) : null}
                {rawData.total_isr_percepcion != null ? (
                  <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">ISR percepción</span>
                    <p className="font-mono tabular-nums text-sm">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP" }).format(rawData.total_isr_percepcion as number)}
                    </p>
                  </div>
                ) : null}

                {/* Per-bracket ITBIS breakdown — only if detailed data exists */}
                {(rawData.total_itbis1 != null || rawData.total_itbis2 != null || rawData.total_itbis3 != null) ? (
                  <div className="md:col-span-3 space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Desglose ITBIS por tasa</span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {rawData.total_itbis1 != null ? (
                        <div className="flex items-center justify-between rounded-md border border-border/40 bg-background px-3 py-2">
                          <span className="text-xs text-muted-foreground">Tasa {String(rawData.itbis1 ?? "?")}%</span>
                          <span className="font-mono tabular-nums text-xs font-medium">
                            {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP", maximumFractionDigits: 2 }).format(rawData.total_itbis1 as number)}
                          </span>
                        </div>
                      ) : null}
                      {rawData.total_itbis2 != null ? (
                        <div className="flex items-center justify-between rounded-md border border-border/40 bg-background px-3 py-2">
                          <span className="text-xs text-muted-foreground">Tasa {String(rawData.itbis2 ?? "?")}%</span>
                          <span className="font-mono tabular-nums text-xs font-medium">
                            {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP", maximumFractionDigits: 2 }).format(rawData.total_itbis2 as number)}
                          </span>
                        </div>
                      ) : null}
                      {rawData.total_itbis3 != null ? (
                        <div className="flex items-center justify-between rounded-md border border-border/40 bg-background px-3 py-2">
                          <span className="text-xs text-muted-foreground">Tasa {String(rawData.itbis3 ?? "?")}%</span>
                          <span className="font-mono tabular-nums text-xs font-medium">
                            {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "DOP", maximumFractionDigits: 2 }).format(rawData.total_itbis3 as number)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}



          {invoice.line_items.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Líneas de productos/servicios</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                <table className="min-w-full text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Descripción</th>
                      <th className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Cant.</th>
                      <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Unitario</th>
                      <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.line_items.map((item, idx) => (
                      <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/30" key={`${item.description}-${idx}`}>
                        <td className="px-4 py-2.5 text-foreground">{item.description}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{item.unit_price}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium">{item.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documento fuente</CardTitle>
              <div className="flex items-center gap-1">
                {invoice.file_type === "xml" ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowXmlCode((v) => !v)}
                  >
                    <Code2 className="size-3.5" />
                  </Button>
                ) : null}
                {invoice.file_url ? (
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a href={invoice.file_url} target="_blank" rel="noreferrer">
                      <Download className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                {invoice.file_type === "image" && image_data?.optimized_image ? (
                  <Button variant="ghost" size="icon-xs" onClick={() => setShowFullImage(true)}>
                    <Expand className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoice.file_type === "xml" && showXmlCode && invoice.original_xml_data ? (
                <pre className="max-h-96 overflow-auto rounded-b-md border-t bg-[#0d1117] p-4 text-[11px] leading-relaxed text-[#e6edf3] font-mono">
                  {formatXml(invoice.original_xml_data)}
                </pre>
              ) : invoice.file_type === "xml" ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <FileCode2 className="size-10" />
                  <span className="text-xs">Comprobante e-CF</span>
                  {invoice.ecf_type ? (
                    <Badge variant="outline" className="text-[10px]">
                      Tipo {invoice.ecf_type}
                    </Badge>
                  ) : null}
                  {invoice.source_type === "xml" || invoice.source_type === "ecf" ? (
                    <p className="text-[10px] text-muted-foreground/60">
                      Haz clic en <Code2 className="size-3 inline" /> para ver el XML crudo
                    </p>
                  ) : null}
                </div>
              ) : invoice.file_type === "image" ? (
                image_isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Skeleton className="h-48 w-full rounded-b-md" />
                  </div>
                ) : image_data?.optimized_image ? (
                  <div className="relative">
                    {!imageLoaded ? (
                      <div className="flex items-center justify-center py-12 absolute inset-0 z-10">
                        <Skeleton className="h-48 w-full rounded-b-md" />
                      </div>
                    ) : null}
                    <button type="button" className="contents" onClick={() => setShowFullImage(true)}>
                    <Image
                      alt="Factura"
                      className={`max-h-72 w-full cursor-zoom-in rounded-b-md border-t object-contain transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                      src={image_data.optimized_image}
                      width={0}
                      height={0}
                      sizes="100vw"
                      unoptimized
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageLoaded(true)}
                    />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                    <FileText className="size-10" />
                    <span className="text-xs">Vista previa no disponible</span>
                    {invoice.file_url ? (
                      <a href={invoice.file_url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-primary">
                        Abrir documento original
                      </a>
                    ) : null}
                  </div>
                )
              ) : invoice.file_type === "pdf" && invoice.file_url ? (
                <div className="relative">
                  {!imageLoaded ? (
                    <div className="flex items-start justify-center pt-4 absolute inset-0 z-10">
                      <Skeleton className="h-40 w-[90%] rounded-md" />
                    </div>
                  ) : null}
                  <iframe
                    src={invoice.file_url}
                    className={`w-full max-h-72 rounded-b-md border-t transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                    style={{ minHeight: "280px" }}
                    title="Visor de PDF"
                    onLoad={() => setImageLoaded(true)}
                    sandbox=""
                  />
                  <a
                    href={invoice.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`absolute inset-0 ${imageLoaded ? "z-30" : "z-0"}`}
                    aria-label="Abrir PDF"
                  />
                </div>
              ) : invoice.file_url ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <FileText className="size-10" />
                  <a href={invoice.file_url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-primary">
                    Abrir documento original
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <FileText className="size-10" />
                  <span className="text-xs">Sin documento adjunto</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen financiero</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">
                  {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "USD" }).format((editable.total_amount ?? 0) - (editable.tax_amount ?? 0))}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">ITBIS <span className="text-[10px]">{getItbisDetail(invoice).rate}</span></span>
                <span className="font-mono tabular-nums">
                  {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "USD" }).format(editable.tax_amount ?? 0)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between py-1">
                <span className="font-medium text-foreground">Total</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">{amount}</span>
              </div>
              {invoice.child_modificatories && invoice.child_modificatories.length > 0 && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Ajustes aplicados</span>
                    <span className="font-mono tabular-nums text-xs text-muted-foreground">
                      {invoice.child_modificatories.reduce((sum: number, adj: ChildModificatory) => {
                        const sign = adj.ecf_type === "34" ? -1 : adj.ecf_type === "33" ? 1 : 0;
                        return sum + sign * Math.abs(adj.total_amount || 0);
                      }, 0) > 0 ? "+" : ""}
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: invoice.currency || "DOP" }).format(
                        invoice.child_modificatories.reduce((sum: number, adj: ChildModificatory) => {
                          const sign = adj.ecf_type === "34" ? -1 : adj.ecf_type === "33" ? 1 : 0;
                          return sum + sign * Math.abs(adj.total_amount || 0);
                        }, 0)
                      )}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between py-1">
                    <span className="font-medium text-foreground">Balance actual</span>
                    <span className="font-mono tabular-nums font-semibold text-foreground">
                      {new Intl.NumberFormat("es-DO", { style: "currency", currency: invoice.currency || "DOP" }).format(
                        (invoice.total_amount || 0) + invoice.child_modificatories.reduce((sum: number, adj: ChildModificatory) => {
                          const sign = adj.ecf_type === "34" ? -1 : adj.ecf_type === "33" ? 1 : 0;
                          return sum + sign * Math.abs(adj.total_amount || 0);
                        }, 0)
                      )}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Ajustes Aplicados (Notas de Crédito/Débito) ── */}
          {invoice.child_modificatories && invoice.child_modificatories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ajustes aplicados</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {invoice.child_modificatories.map((adj: ChildModificatory) => {
                  const isCredit = adj.ecf_type === "34" || (adj.invoice_number || "").startsWith("B04");
                  return (
                    <div key={adj.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2">
                        {isCredit ? (
                          <MinusCircle className="size-4 text-red-500 shrink-0" />
                        ) : (
                          <PlusCircle className="size-4 text-amber-500 shrink-0" />
                        )}
                        <div>
                          <span className="font-medium text-foreground">
                            {isCredit ? "Nota de Crédito" : "Nota de Débito"}
                          </span>
                          <span className="text-muted-foreground ml-1.5">
                            {adj.invoice_number}
                          </span>
                          {adj.modification_reason && (
                            <span className="text-muted-foreground/60 ml-1.5 text-[10px]">
                              · Razón {adj.modification_reason}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {adj.invoice_date && (
                          <span className="text-muted-foreground text-[10px]">
                            {new Date(adj.invoice_date + "T12:00:00").toLocaleDateString("es-DO", { day: "numeric", month: "short" })}
                          </span>
                        )}
                        <span className={`font-mono tabular-nums font-medium ${isCredit ? "text-red-600" : "text-amber-600"}`}>
                          {isCredit ? "-" : "+"}
                          {new Intl.NumberFormat("es-DO", { style: "currency", currency: invoice.currency || "DOP" }).format(Math.abs(adj.total_amount || 0))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ── Metadatos Operativos ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Metadatos operativos</CardTitle>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">
                  Editable
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-xs">
              {/* Categoría DGII */}
              <Field label={isIncome ? "Tipo de ingreso DGII" : "Categoría DGII"}>
                <Select
                  value={validCategoryCode(
                    editable.category,
                    isIncome
                      ? new Set(incomeTypeOptions.map((o) => o.value))
                      : new Set(DGII_CATEGORIES.map((c) => c.code))
                  )}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, category: value }))}
                  disabled={isTrashed}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={isIncome ? "Sin tipo de ingreso" : "Sin categoría"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {isIncome
                        ? incomeTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))
                        : DGII_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.code} value={cat.code}>
                              {cat.label}
                            </SelectItem>
                          ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {/* Condición de pago */}
              <Field label="Condición de pago">
                <Select
                  value={editable.payment_condition || "contado"}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, payment_condition: value }))}
                  disabled={isTrashed}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar condición" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contado">Contado</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Forma de pago (DGII) */}
              <Field label="Forma de pago (DGII)">
                <Select
                  value={editable.payment_method || "none"}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, payment_method: value === "none" ? null : value }))}
                  disabled={isTrashed}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No especificada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No especificada / Pendiente</SelectItem>
                    <SelectItem value="01">01 - Efectivo</SelectItem>
                    <SelectItem value="02">02 - Cheque / Transferencia / Depósito</SelectItem>
                    <SelectItem value="03">03 - Tarjeta de Crédito / Débito</SelectItem>
                    <SelectItem value="04">04 - Compra a Crédito</SelectItem>
                    <SelectItem value="05">05 - Permuta</SelectItem>
                    <SelectItem value="06">06 - Notas de Crédito / Bonos</SelectItem>
                    <SelectItem value="07">07 - Mixto / Otras Formas de Pago</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Estado de pago */}
              <Field label="Estado de pago">
                <Select
                  value={editable.payment_status || "pending"}
                  onValueChange={(value) => {
                    setEditable((prev) => {
                      const next = { ...prev, payment_status: value };
                      if (value !== "paid") {
                        next.payment_date = null;
                      } else if (!next.payment_date) {
                        next.payment_date = new Date().toISOString();
                      }
                      return next;
                    });
                  }}
                  disabled={isTrashed}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="paid">Pagado</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Cuenta Bancaria */}
              <Field label="Cuenta bancaria asociada">
                <Select
                  value={editable.bank_account_id || "none"}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, bank_account_id: value === "none" ? null : value }))}
                  disabled={isTrashed}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No asociada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No asociada / Ninguna</SelectItem>
                    {bankAccountsQuery_data?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(acc.balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Fecha de vencimiento (solo si es crédito) */}
              {editable.payment_condition === "credito" && (
                <Field label="Fecha de vencimiento">
                  <Input
                    type="date"
                    value={editable.due_date ? editable.due_date.split("T")[0] : ""}
                    onChange={(event) => setEditable((prev) => ({ ...prev, due_date: event.target.value || null }))}
                    disabled={isTrashed}
                    className="h-8 text-xs"
                  />
                </Field>
              )}

              {/* Fecha de pago (solo si está pagado) */}
              {editable.payment_status === "paid" && (
                <Field label="Fecha de pago">
                  <Input
                    type="date"
                    value={editable.payment_date ? editable.payment_date.split("T")[0] : ""}
                    onChange={(event) => setEditable((prev) => ({ ...prev, payment_date: event.target.value || null }))}
                    disabled={isTrashed}
                    className="h-8 text-xs"
                  />
                </Field>
              )}

              {/* Descripción */}
              <Field label="Descripción interna / Notas">
                <Textarea
                  value={editable.description ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, description: event.target.value }))}
                  disabled={isTrashed}
                  className="text-xs min-h-[60px] resize-y"
                  placeholder="Notas operativas internas sobre este comprobante..."
                />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Cancel Dialog ────────────────────────────────────────────── */}
      {cancelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setCancelDialogOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" role="presentation" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Anular factura</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Esto marcará la factura como anulada. Aparecerá en el formulario 608 de la DGII como factura anulada.
            </p>
            <div className="mb-4">
              <label htmlFor="cancel-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de anulación
              </label>
              <select
                id="cancel-type"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                value={cancelType}
                onChange={(e) => setCancelType(e.target.value)}
              >
                <option value="01">01 - Deterioro</option>
                <option value="02">02 - Errores de impresión</option>
                <option value="03">03 - Impresión defectuosa</option>
                <option value="04">04 - Corrección información</option>
                <option value="05">05 - Cambio de productos</option>
                <option value="06">06 - Devolución de productos</option>
                <option value="07">07 - Omisión de productos</option>
                <option value="08">08 - Errores en secuencia NCF</option>
                <option value="09">09 - Por cese de operaciones</option>
                <option value="10">10 - Pérdida o hurto</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => {
                cancelMutation.mutate(cancelType);
                setCancelDialogOpen(false);
              }} disabled={cancelMutation.isPending}>
                <XCircle className="size-3.5 mr-1" />
                Anular factura
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setDeleteDialogOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" role="presentation" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2">Mover a la papelera</h3>
            <p className="text-xs text-muted-foreground mb-4">
              La factura se moverá a la papelera. Podrás restaurarla o eliminarla permanentemente desde allí.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => {
                deleteMutation.mutate();
                setDeleteDialogOpen(false);
              }}>
                <Trash2 className="size-3.5 mr-1" />
                Mover a papelera
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFullImage && image_data?.optimized_image ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          role="presentation"
          onClick={() => setShowFullImage(false)}
        >
          <Image alt="Factura completa" className="max-h-full max-w-full rounded-md" src={image_data.optimized_image} width={0} height={0} sizes="100vw" unoptimized />
        </div>
      ) : null}
    </div>
  );
}

function formatXml(xml: string): string {
  let formatted = "";
  let indent = 0;
  const lines = xml.replace(/>\s*</g, ">\n<").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("</")) indent -= 1;
    formatted += "  ".repeat(Math.max(0, indent)) + trimmed + "\n";
    if (trimmed.startsWith("<") && !trimmed.startsWith("</") && !trimmed.endsWith("/>")) indent += 1;
  }
  return formatted.trimEnd();
}

function Field({
  label,
  className,
  locked,
  children
}: {
  label: string;
  className?: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {locked ? <Lock className="size-2.5 shrink-0 text-primary/60" /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}
