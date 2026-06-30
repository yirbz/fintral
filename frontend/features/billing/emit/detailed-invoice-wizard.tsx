"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calculator,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  User,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  billingApi,
  type EmitLineItem,
  type EmitResult,
  type PaymentSplit,
} from "@/lib/api/billing";
import { ConfirmEmissionDialog } from "./confirm-emission-dialog";
import { CustomerSearch } from "./customer-search";
import { ProductSearch } from "./product-search";
import { NcfSelector } from "./ncf-selector";
import { LineItemTable } from "./line-item-table";
import { DetailedInvoicePreview } from "./detailed-invoice-preview";

const INCOME_TYPES: { value: string; label: string }[] = [
  { value: "01", label: "Ingresos por operaciones" },
  { value: "02", label: "Ingresos Financieros" },
  { value: "03", label: "Ingresos Extraordinarios" },
  { value: "04", label: "Ingresos por Arrendamientos" },
  { value: "05", label: "Venta de Activo Depreciable" },
  { value: "06", label: "Otros Ingresos" },
];

const MODIFICATION_CODES = [
  { value: 1, label: "Cancelación total" },
  { value: 2, label: "Corrección de texto" },
  { value: 3, label: "Corrección de monto" },
  { value: 4, label: "Reemplazo NCF contingencia" },
];

const PAYMENT_METHODS = [
  { value: 1, label: "Efectivo" },
  { value: 2, label: "Cheque / Transferencia" },
  { value: 3, label: "Tarjeta crédito/débito" },
  { value: 4, label: "Crédito" },
  { value: 6, label: "Permuta" },
  { value: 7, label: "Nota de crédito" },
  { value: 8, label: "Mixto" },
];

const CONSUMIDOR_FINAL_TYPES = new Set([32]);
const EXEMPT_TYPES = new Set([43, 44]);
const REFERENCE_REQUIRED_TYPES = new Set([33, 34]);

interface DetailedInvoiceWizardProps {
  onSuccess?: (result: EmitResult) => void;
  sourceInvoiceId?: string;
  sourceAction?: string;
}

function fmt(n: number) {
  return n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DetailedInvoiceWizard({ onSuccess, sourceInvoiceId, sourceAction }: DetailedInvoiceWizardProps) {
  const router = useRouter();
  const [ecfType, setEcfType] = useState<number | null>(null);
  const [incomeType, setIncomeType] = useState("01");
  const [paymentType, setPaymentType] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<number | undefined>(undefined);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [showSplitPayment, setShowSplitPayment] = useState(false);

  const [customer, setCustomer] = useState<{
    id?: string;
    name: string;
    rnc: string;
    address?: string;
    phone?: string;
    email?: string;
  }>({ name: "", rnc: "" });

  const [items, setItems] = useState<EmitLineItem[]>([
    { description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18, good_service_indicator: 1 },
  ]);
  const [notes, setNotes] = useState("");

  const [referenceEcf, setReferenceEcf] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [modificationCode, setModificationCode] = useState<number | undefined>(3);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");

  const { data: organization } = useQuery({
    queryKey: ["active-organization"],
    queryFn: () => billingApi.getOrganization().catch(() => null),
  });

  const { data: typesData } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: billingApi.getInvoiceTypes,
  });

  const isCorrectionFlow = !!(sourceInvoiceId && sourceAction);
  const isDraftContinuation = !!(sourceInvoiceId && !sourceAction);
  const isCorrectEcfFlow = sourceAction === "correct";
  const isReemitFlow = sourceAction === "reemit";

  const { data: sourceInvoice, isLoading: isSourceLoading } = useQuery({
    queryKey: ["billing-invoice", sourceInvoiceId],
    queryFn: () => billingApi.getInvoice(sourceInvoiceId!),
    enabled: isCorrectionFlow || isDraftContinuation,
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!sourceInvoice || initialized) return;
    setInitialized(true);

    // Redirect quick-mode invoices to /billing/quick
    const rawData = sourceInvoice.raw_extracted_data
      ? (JSON.parse(sourceInvoice.raw_extracted_data) as Record<string, any>)
      : null;
    if (rawData?.mode === "quick" && !sourceAction) {
      router.replace(`/billing/quick?draftId=${sourceInvoiceId}`);
      return;
    }

    if (sourceAction === "credit_note") {
      setEcfType(34);
      setModificationCode(3);
    } else if (sourceAction === "debit_note") {
      setEcfType(33);
      setModificationCode(3);
    } else if (isDraftContinuation) {
      if (sourceInvoice.ecf_type) {
        setEcfType(parseInt(sourceInvoice.ecf_type));
      }
    } else if (isCorrectEcfFlow) {
      if (sourceInvoice.ecf_type) {
        setEcfType(parseInt(sourceInvoice.ecf_type));
      }
    }

    if (sourceInvoice.invoice_number && isCorrectionFlow) {
      setReferenceEcf(sourceInvoice.invoice_number);
    }
    if (sourceInvoice.invoice_date && isCorrectionFlow) {
      setReferenceDate(sourceInvoice.invoice_date);
    }

    if (isDraftContinuation && rawData) {
      if (rawData.payment_type) setPaymentType(rawData.payment_type);
      if (rawData.payment_method) setPaymentMethod(rawData.payment_method);
      if (rawData.notes) setNotes(rawData.notes);
      if (rawData.reference_ecf) setReferenceEcf(rawData.reference_ecf);
      if (rawData.reference_date) setReferenceDate(rawData.reference_date);
    }
    if (isReemitFlow && rawData) {
      if (rawData.payment_type) setPaymentType(rawData.payment_type);
      if (rawData.payment_method) setPaymentMethod(rawData.payment_method);
      if (rawData.notes) setNotes(rawData.notes);
    }

    const buyerName = rawData?.buyer_name || sourceInvoice.client?.name || "";
    const buyerAddress = rawData?.buyer_address || sourceInvoice.client?.address || "";
    const buyerRnc = sourceInvoice.rnc_comprador || sourceInvoice.client?.tax_id || "";
    const clientId = rawData?.client_id || sourceInvoice.client?.id || undefined;

    setCustomer({
      id: clientId,
      name: buyerName,
      rnc: buyerRnc,
      address: buyerAddress || undefined,
    });

    if (sourceInvoice.line_items && sourceInvoice.line_items.length > 0) {
      setItems(
        sourceInvoice.line_items
          .filter((li: any) => li.name)
          .map((li: any) => ({
            description: li.name,
            quantity: li.quantity,
            unit_price: li.unit_price,
            discount_rate: li.discount_rate ?? 0,
            tax_rate: li.tax_rate ?? 18,
            good_service_indicator: 1,
            product_id: li.product_id || undefined,
          }))
      );
    }
  }, [sourceInvoice, sourceAction, isDraftContinuation, isCorrectionFlow, isCorrectEcfFlow, isReemitFlow, initialized, router, sourceInvoiceId]);

  const isConsumerFinal = ecfType !== null && CONSUMIDOR_FINAL_TYPES.has(ecfType);
  const isExemptType = ecfType !== null && EXEMPT_TYPES.has(ecfType);
  const needsReference = ecfType !== null && REFERENCE_REQUIRED_TYPES.has(ecfType);
  const showBuyerSection = ecfType !== null && ecfType !== 43;

  const itemTotals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let itbis18 = 0;
    let itbis16 = 0;
    let itbis0 = 0;
    let exempt = 0;

    for (const item of items) {
      const gross = item.quantity * item.unit_price;
      const disc = gross * ((item.discount_rate ?? 0) / 100);
      const net = gross - disc;
      const rate = item.tax_rate ?? 18;

      subtotal += gross;
      discountTotal += disc;

      if (isExemptType) {
        exempt += net;
      } else if (rate >= 18) {
        itbis18 += net * 0.18;
      } else if (rate >= 16) {
        itbis16 += net * 0.16;
      } else {
        itbis0 += 0;
      }
    }

    const itbisTotal = itbis18 + itbis16 + itbis0;
    const totalAmount = subtotal - discountTotal + itbisTotal;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      taxableAmount: Math.round((subtotal - discountTotal) * 100) / 100,
      itbis18: Math.round(itbis18 * 100) / 100,
      itbis16: Math.round(itbis16 * 100) / 100,
      itbis0: Math.round(itbis0 * 100) / 100,
      itbisTotal: Math.round(itbisTotal * 100) / 100,
      exemptAmount: Math.round(exempt * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  }, [items, isExemptType]);

  const isSplitTotalValid = useMemo(() => {
    if (!showSplitPayment) return true;
    const splitTotal = paymentSplits.reduce((s, p) => s + p.payment_amount, 0);
    return Math.abs(splitTotal - itemTotals.totalAmount) < 0.01;
  }, [showSplitPayment, paymentSplits, itemTotals.totalAmount]);

  const isElectronic = useMemo(() => {
    if (!ecfType) return false;
    const type = typesData?.find((t: any) => t.ecf_type === ecfType);
    if (!type) return false;
    return type.code.startsWith("E") || type.ecf_type >= 31;
  }, [ecfType, typesData]);

  const previewNcf = useMemo(() => {
    if (!ecfType) return "NCF PENDIENTE";
    const type = typesData?.find((t: any) => t.ecf_type === ecfType);
    if (!type) return "NCF PENDIENTE";
    const code = type.code; // e.g. "E31" or "B01"
    const prefix = code[0] || "B";
    const typeStr = code.slice(1); // "31" or "01"
    const nextSeq = (type.sequence_current ?? 0) + 1;
    const seqLength = prefix === "E" ? 10 : 8;
    const seqStr = nextSeq.toString().padStart(seqLength, "0");
    return `${prefix}${typeStr}${seqStr}`;
  }, [ecfType, typesData]);

  const emitButtonLabel = isCorrectEcfFlow
    ? "Corregir y emitir NC"
    : isReemitFlow
    ? "Re-emitir factura"
    : isDraftContinuation
    ? "Actualizar y emitir"
    : "Emitir y timbrar factura";

  const canEmit = useMemo(() => {
    if (ecfType === null) return false;
    if (items.length === 0) return false;
    if (!items.some((i) => i.description.trim() && i.unit_price > 0)) return false;
    if (showBuyerSection && !customer.name.trim()) return false;
    if (showBuyerSection && !customer.rnc.replace(/[^0-9]/g, "")?.length) return false;
    if (needsReference && !referenceEcf.trim()) return false;
    if (showSplitPayment && !isSplitTotalValid) return false;
    return true;
  }, [ecfType, items, showBuyerSection, customer, needsReference, referenceEcf, showSplitPayment, isSplitTotalValid]);

  const emitMutation = useMutation({
    mutationFn: (data: Parameters<typeof billingApi.emitInvoice>[0]) =>
      billingApi.emitInvoice(data),
    onSuccess: (result) => {
      if (result.status === "verified") {
        toast.success("Factura emitida exitosamente", {
          description: "Comprobante electrónico timbrado por la DGII.",
        });
        resetForm();
        onSuccess?.(result);
      } else if (result.status === "pending") {
        toast.info("Factura enviada a la DGII", {
          description: "Será procesada de forma asíncrona.",
        });
        onSuccess?.(result);
      } else {
        toast.error(result.error_message || "Error al emitir la factura");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error de conexión con el servidor");
    },
  });

  const resetForm = () => {
    setEcfType(null);
    setIncomeType("01");
    setPaymentType(1);
    setPaymentMethod(undefined);
    setPaymentSplits([]);
    setShowSplitPayment(false);
    setCustomer({ name: "", rnc: "" });
    setItems([{ description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18, good_service_indicator: 1 }]);
    setNotes("");
    setReferenceEcf("");
    setReferenceDate("");
    setModificationCode(3);
  };

  const handleEmitClick = () => {
    if (!canEmit || !ecfType) return;

    const cleanRnc = customer.rnc.replace(/[^0-9]/g, "");
    if (showBuyerSection && cleanRnc.length !== 9 && cleanRnc.length !== 11) {
      toast.error("El RNC/Cédula debe tener 9 u 11 dígitos");
      return;
    }

    if (itemTotals.totalAmount >= 250_000 || (showBuyerSection && !customer.id)) {
      setConfirmOpen(true);
      return;
    }

    doEmit(cleanRnc);
  };

  const doEmit = useCallback(
    (cleanRnc: string) => {
      if (!ecfType) return;
      setConfirmOpen(false);

      const payloadSplits = showSplitPayment && paymentSplits.length > 0
        ? paymentSplits
        : undefined;

      const payload: Parameters<typeof billingApi.emitInvoice>[0] = {
        mode: "detailed",
        ecf_type: ecfType,
        income_type: incomeType,
        payment_type: paymentType,
        payment_method: payloadSplits ? undefined : (paymentMethod ?? 1),
        payment_splits: payloadSplits,
        items: items.map((item) => ({
          ...item,
          discount_rate: item.discount_rate ?? 0,
          tax_rate: item.tax_rate ?? 18,
          good_service_indicator: item.good_service_indicator ?? 1,
        })),
        notes: notes.trim() || undefined,
        invoice_id: sourceInvoiceId ?? undefined,
        is_correction: isCorrectEcfFlow,
      };

      if (showBuyerSection) {
        payload.buyer_name = customer.name.trim();
        payload.buyer_rnc = cleanRnc;
        payload.buyer_address = customer.address?.trim() || undefined;
        payload.buyer_phone = customer.phone?.trim() || undefined;
        payload.buyer_email = customer.email?.trim() || undefined;
        if (customer.id) payload.client_id = customer.id;
      } else {
        payload.buyer_name = "Consumidor Final";
        payload.buyer_rnc = "132109122";
      }

      if (needsReference && referenceEcf) {
        payload.reference_ecf = referenceEcf.trim();
        payload.reference_date = referenceDate || undefined;
        payload.modification_code = modificationCode;
      }

      emitMutation.mutate(payload);
    },
    [
      ecfType, incomeType, paymentType, paymentMethod, paymentSplits,
      showSplitPayment, items, notes, showBuyerSection, customer,
      needsReference, referenceEcf, referenceDate, modificationCode, emitMutation,
      isDraftContinuation, sourceInvoiceId, isCorrectEcfFlow,
    ]
  );

  const handleSaveDraft = async () => {
    try {
      const cleanRnc = customer.rnc.replace(/[^0-9]/g, "");
      const billingPayload = {
        client_id: customer.id || undefined,
        ecf_type: ecfType || 31,
        payment_type: paymentType,
        payment_method: paymentMethod || 1,
        notes: notes.trim() || undefined,
        reference_ecf: needsReference && referenceEcf ? referenceEcf.trim() : undefined,
        reference_date: needsReference && referenceDate ? referenceDate : undefined,
        mode: "detailed" as const,
        items: items.filter(i => i.description.trim()).map((item) => ({
          product_id: (item as any).product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_rate: item.discount_rate ?? 0,
        })),
        buyer_name: showBuyerSection ? customer.name.trim() : undefined,
        buyer_rnc: showBuyerSection ? cleanRnc : undefined,
        buyer_address: showBuyerSection ? customer.address?.trim() : undefined,
      };

      let invoice;
      if (sourceInvoiceId && isDraftContinuation) {
        invoice = await billingApi.updateInvoice(sourceInvoiceId, billingPayload);
      } else {
        invoice = await billingApi.createInvoice(billingPayload);
        const url = new URL(window.location.href);
        url.searchParams.set("draftId", invoice.id);
        window.history.replaceState(null, "", url.toString());
      }
      toast.success("Borrador guardado correctamente.");
    } catch (err: any) {
      toast.error("Error al guardar borrador: " + (err.message || "Error desconocido"));
    }
  };

  const handleConfirmEmit = () => {
    const cleanRnc = customer.rnc.replace(/[^0-9]/g, "");
    doEmit(cleanRnc);
  };

  const addSplitPayment = () => {
    if (paymentSplits.length >= 5) return;
    setPaymentSplits([...paymentSplits, { payment_method: 1, payment_amount: 0 }]);
  };

  const updateSplitPayment = (index: number, field: keyof PaymentSplit, value: number) => {
    setPaymentSplits(
      paymentSplits.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeSplitPayment = (index: number) => {
    setPaymentSplits(paymentSplits.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18, good_service_indicator: 1 }]);
  };

  const addItemFromProduct = (product: { id: string; name: string; price: number; tax_rate: number }) => {
    setItems([
      ...items,
      {
        description: product.name,
        quantity: 1,
        unit_price: product.price,
        discount_rate: 0,
        tax_rate: product.tax_rate,
        good_service_indicator: 1,
      },
    ]);
  };

  return (
    <div className="h-full flex flex-col gap-0">
      {/* Mobile Tab Switcher */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "form" | "preview")}
        className="w-full lg:hidden shrink-0 mb-4"
      >
        <TabsList className="w-full grid grid-cols-2 h-10">
          <TabsTrigger
            value="form"
            className="text-sm data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
          >
            Formulario
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="text-sm data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium"
          >
            Vista Previa (A4)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 lg:gap-6">
        {/* ── Form Column ── */}
        <div className={cn(
          "flex-1 min-h-0 overflow-y-auto space-y-5 pb-6 pr-0 lg:pr-2",
          activeTab !== "form" && "hidden lg:block"
        )}>
          {isCorrectionFlow && isSourceLoading && (
            <div className="space-y-5 animate-pulse mb-5">
              <div className="h-10 bg-muted rounded-lg w-48" />
              <div className="h-[180px] bg-muted rounded-lg" />
              <div className="h-[180px] bg-muted rounded-lg" />
              <div className="h-[100px] bg-muted rounded-lg" />
              <div className="h-[100px] bg-muted rounded-lg" />
            </div>
          )}
          {/* Section: Tipo de comprobante */}
          <Section icon={FileText} title="Tipo de comprobante">
            <NcfSelector value={ecfType} onChange={setEcfType} />
            <Field label="Tipo de ingreso">
              <Select value={incomeType} onValueChange={setIncomeType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOME_TYPES.map((it) => (
                    <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          {/* Section: Comprador */}
          {showBuyerSection && (
            <Section icon={User} title={isConsumerFinal ? "Comprador (opcional)" : "Comprador"}>
              <CustomerSearch value={customer} onChange={setCustomer} />
              {customer.name && !customer.id && (
                <p className="text-xs text-muted-foreground">
                  El comprador se registrará automáticamente al emitir la factura.
                </p>
              )}
            </Section>
          )}

          {/* Section: Productos / Servicios */}
          <Section icon={ShoppingCart} title="Productos / Servicios">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ProductSearch onSelect={addItemFromProduct} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                className="h-8 text-xs shrink-0 border-emerald-600/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-600"
              >
                <Plus className="size-3 mr-1" /> Item manual
              </Button>
            </div>
            <div className="border rounded-lg p-3">
              <LineItemTable items={items} onChange={setItems} ecfType={ecfType} />
            </div>
            <Field label="Notas (opcional)">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas para esta factura"
                className="h-9 text-sm"
              />
            </Field>
          </Section>

          {/* Section: Pago */}
          <Section icon={CreditCard} title="Pago">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Condición de pago">
                <Select value={paymentType.toString()} onValueChange={(v) => setPaymentType(parseInt(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Contado</SelectItem>
                    <SelectItem value="2">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Método de pago">
                <Select
                  value={!showSplitPayment ? (paymentMethod?.toString() ?? "") : "__split__"}
                  onValueChange={(v) => {
                    if (v === "__split__") {
                      setShowSplitPayment(true);
                      if (paymentSplits.length === 0) {
                        setPaymentSplits([{ payment_method: 1, payment_amount: itemTotals.totalAmount }]);
                      }
                    } else {
                      setShowSplitPayment(false);
                      setPaymentMethod(v ? parseInt(v) : undefined);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm.value} value={pm.value.toString()}>{pm.label}</SelectItem>
                    ))}
                    <SelectItem value="__split__">Pago dividido (varios métodos)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {showSplitPayment && (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">División de pago</span>
                  {paymentSplits.length < 5 && (
                    <Button variant="ghost" size="icon-xs" onClick={addSplitPayment} className="size-6 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700">
                      <Plus className="size-3" />
                    </Button>
                  )}
                </div>
                {paymentSplits.map((split, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center">
                    <Select
                      value={split.payment_method.toString()}
                      onValueChange={(v) => updateSplitPayment(idx, "payment_method", parseInt(v))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.slice(0, 5).map((pm) => (
                          <SelectItem key={pm.value} value={pm.value.toString()}>{pm.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={split.payment_amount || ""}
                      onChange={(e) => updateSplitPayment(idx, "payment_amount", parseFloat(e.target.value) || 0)}
                      min={0}
                      step={0.01}
                      className="h-8 text-xs text-right"
                      placeholder="0.00"
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeSplitPayment(idx)}
                      className="text-destructive size-7 hover:bg-destructive/10"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>Total asignado</span>
                  <span className={cn(
                    "tabular-nums font-medium",
                    !isSplitTotalValid
                      ? "text-amber-600 font-semibold"
                      : "text-emerald-600 font-semibold"
                  )}>
                    RD$ {fmt(paymentSplits.reduce((s, p) => s + p.payment_amount, 0))}
                  </span>
                </div>
                {!isSplitTotalValid && (
                  <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-2.5 text-xs text-destructive">
                    La suma de los pagos divididos (RD$ {fmt(paymentSplits.reduce((s, p) => s + p.payment_amount, 0))}) debe ser exactamente igual al total de la factura (RD$ {fmt(itemTotals.totalAmount)}).
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Section: Referencia (E33/E34) */}
          {needsReference && (
            <Section icon={RefreshCw} title="Comprobante original">
              <p className="text-xs text-muted-foreground mb-2">
                Indique el comprobante electrónico original que está modificando.
              </p>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <Field label="ENCF del comprobante original">
                  <Input
                    value={referenceEcf}
                    onChange={(e) => setReferenceEcf(e.target.value.toUpperCase())}
                    placeholder="E310000000001"
                    className="h-9 text-sm font-mono"
                    maxLength={13}
                  />
                </Field>
                <Field label="Fecha del comprobante original">
                  <DateInput
                    value={referenceDate}
                    onChange={setReferenceDate}
                  />
                </Field>
              </div>
              <Field label="Motivo de modificación">
                <Select
                  value={modificationCode?.toString() ?? "3"}
                  onValueChange={(v) => setModificationCode(parseInt(v))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODIFICATION_CODES.map((mc) => (
                      <SelectItem key={mc.value} value={mc.value.toString()}>{mc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>
          )}

          {/* Mobile emit button (visible < lg) */}
          <div className="lg:hidden">
            <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
              <TotalsDisplay totals={itemTotals} fmt={fmt} isExemptType={isExemptType} />
              {itemTotals.totalAmount >= 250_000 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Calculator className="size-3 shrink-0" />
                  Monto ≥ RD$250,000 — procesamiento asíncrono por la DGII
                </p>
              )}
              {showSplitPayment && !isSplitTotalValid && (
                <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 text-xs text-destructive">
                  No se puede emitir la factura: El total asignado en los pagos mixtos no coincide con el total general.
                </div>
              )}

              {isCorrectEcfFlow && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Al guardar, se emitirá una <strong>Nota de Crédito (E34)</strong> que anulará la factura original,
                    y luego se creará una nueva factura corregida.
                  </span>
                </div>
              )}

              {isReemitFlow && (
                <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800/30 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <RefreshCw className="size-4 shrink-0 mt-0.5" />
                  <span>Se re-emitirá el comprobante físico con los datos actualizados.</span>
                </div>
              )}

              <Button
                className="w-full h-10 text-sm gap-2 bg-emerald-600 hover:bg-emerald-500 text-white focus-visible:ring-emerald-500"
                disabled={!canEmit || emitMutation.isPending}
                onClick={handleEmitClick}
              >
                {emitMutation.isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> Emitiendo...</>
                ) : (
                  <><Send className="size-4" /> {emitButtonLabel}</>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full h-9 text-xs gap-1.5 mt-1 border-emerald-600/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-600"
                disabled={items.length === 0}
                onClick={handleSaveDraft}
              >
                <Save className="size-3.5" />
                Guardar Borrador
              </Button>
            </div>
          </div>

          {emitMutation.data?.status === "error" && emitMutation.data.error_message && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 text-xs text-destructive">
              {emitMutation.data.error_message}
            </div>
          )}
        </div>

        {/* ── Preview Column (desktop/mobile toggle) ── */}
        <div className={cn(
          "w-full lg:w-[480px] xl:w-[550px] shrink-0 flex flex-col gap-4 min-h-0",
          activeTab !== "preview" && "hidden lg:flex"
        )}>
          {/* Scrollable A4 sheet container */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-0 lg:pr-2">
            <DetailedInvoicePreview
              organization={organization}
              ecfType={ecfType}
              customer={customer}
              items={items}
              notes={notes}
              totals={itemTotals}
              previewNcf={previewNcf}
              isElectronic={isElectronic}
            />
          </div>

          {/* Sidebar Actions & Info */}
          <div className="space-y-3 pt-2">
            {itemTotals.totalAmount >= 250_000 && (
              <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Calculator className="size-4 shrink-0 mt-0.5" />
                <span>
                  Monto ≥ RD$250,000 — este comprobante será procesado de forma asíncrona por la DGII.
                </span>
              </div>
            )}

            {showSplitPayment && !isSplitTotalValid && (
              <div className="border border-destructive/30 bg-destructive/5 dark:bg-destructive/10 rounded-lg p-3 text-xs text-destructive">
                No se puede emitir la factura: El total asignado en los pagos mixtos no coincide con el total general.
              </div>
            )}

            {isCorrectEcfFlow && (
              <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>
                  Al guardar, se emitirá una <strong>Nota de Crédito (E34)</strong> que anulará la factura original,
                  y luego se creará una nueva factura corregida.
                </span>
              </div>
            )}

            {isReemitFlow && (
              <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800/30 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <RefreshCw className="size-4 shrink-0 mt-0.5" />
                <span>Se re-emitirá el comprobante físico con los datos actualizados.</span>
              </div>
            )}

            <Button
              className="w-full h-10 text-sm gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              disabled={!canEmit || emitMutation.isPending}
              onClick={handleEmitClick}
            >
              {emitMutation.isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Emitiendo...</>
              ) : (
                <><Send className="size-4" /> {emitButtonLabel}</>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full h-9 text-xs gap-1.5 mt-1 border-emerald-600/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-600"
              disabled={items.length === 0}
              onClick={handleSaveDraft}
            >
              <Save className="size-3.5" />
              Guardar Borrador
            </Button>
          </div>
        </div>
      </div>

      <ConfirmEmissionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmEmit}
        isPending={emitMutation.isPending}
        totalAmount={itemTotals.totalAmount}
        hasUnregisteredBuyer={showBuyerSection && !customer.id}
      />
    </div>
  );
}

// ── Sub-components ──

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </div>
      <div className="border rounded-lg p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-right truncate max-w-[180px] text-xs">{value}</span>
    </div>
  );
}

function TotalsDisplay({
  totals,
  fmt,
  isExemptType,
}: {
  totals: { subtotal: number; discountTotal: number; itbisTotal: number; totalAmount: number; itbis18: number; itbis16: number; exemptAmount: number };
  fmt: (n: number) => string;
  isExemptType: boolean;
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span>
        <span className="tabular-nums">RD$ {fmt(totals.subtotal)}</span>
      </div>
      {totals.discountTotal > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <span>Descuentos</span>
          <span className="tabular-nums text-destructive">-RD$ {fmt(totals.discountTotal)}</span>
        </div>
      )}
      {isExemptType ? (
        <div className="flex justify-between text-muted-foreground">
          <span>Exento</span>
          <span className="tabular-nums">RD$ {fmt(totals.exemptAmount)}</span>
        </div>
      ) : (
        <>
          {totals.itbis18 > 0 && (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>ITBIS 18%</span>
              <span className="tabular-nums">RD$ {fmt(totals.itbis18)}</span>
            </div>
          )}
          {totals.itbis16 > 0 && (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>ITBIS 16%</span>
              <span className="tabular-nums">RD$ {fmt(totals.itbis16)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>ITBIS total</span>
            <span className="tabular-nums">RD$ {fmt(totals.itbisTotal)}</span>
          </div>
        </>
      )}
      <Separator />
      <div className="flex justify-between font-semibold text-base">
        <span>Total</span>
        <span className="tabular-nums">RD$ {fmt(totals.totalAmount)}</span>
      </div>
    </div>
  );
}
