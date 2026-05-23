"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Calculator, AlertCircleIcon, Info } from "lucide-react";

import { useFormDraft } from "@/hooks/use-form-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DgiiSelect } from "@/components/dgii-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CreateInvoicePayload } from "@/lib/api/invoices";

const COUNTRIES = [
  { code: "DOM", label: "República Dominicana" },
  { code: "USA", label: "Estados Unidos" },
  { code: "ESP", label: "España" },
  { code: "MEX", label: "México" },
  { code: "COL", label: "Colombia" },
  { code: "ARG", label: "Argentina" },
  { code: "CHL", label: "Chile" },
  { code: "PER", label: "Perú" },
  { code: "BRA", label: "Brasil" },
  { code: "PAN", label: "Panamá" },
  { code: "PRI", label: "Puerto Rico" },
  { code: "VEN", label: "Venezuela" },
  { code: "CRI", label: "Costa Rica" },
  { code: "GTM", label: "Guatemala" },
  { code: "ECU", label: "Ecuador" },
  { code: "CHN", label: "China" },
  { code: "DEU", label: "Alemania" },
  { code: "JPN", label: "Japón" },
];

const TRANSACTION_TYPES = [
  { value: "expense", label: "Gasto / Compra (F-606)" },
  { value: "income", label: "Ingreso / Venta (F-607)" },
];

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export function AdvancedInvoiceDialog({
  open,
  onOpenChange,
  onSave,
  initial,
  onBackToSimple,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: CreateInvoicePayload) => Promise<void>;
  initial?: Partial<CreateInvoicePayload>;
  onBackToSimple?: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const [vendorName, setVendorName] = useState("");
  const [vendorTaxId, setVendorTaxId] = useState("");
  const [vendorCountry, setVendorCountry] = useState("");
  const [vendorFiscalAddress, setVendorFiscalAddress] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [ncfModified, setNcfModified] = useState("");
  const [category, setCategory] = useState("");

  const [totalAmount, setTotalAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [currency, setCurrency] = useState("DOP");
  const [transactionType, setTransactionType] = useState("expense");
  const [goodsType, setGoodsType] = useState("none");
  const [paymentMethod, setPaymentMethod] = useState("none");

  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showFiscal, setShowFiscal] = useState(false);

  const { saveDraftDebounced, loadDraft, clearDraft } = useFormDraft<Record<string, unknown>>("manual-invoice-draft");
  const restored = useRef(false);

  const isExpense = transactionType === "expense";

  useEffect(() => {
    if (!open) return;
    if (restored.current) return;
    const draft = loadDraft();
    if (draft) {
      if (draft.vendorName) setVendorName(draft.vendorName as string);
      if (draft.vendorTaxId) setVendorTaxId(draft.vendorTaxId as string);
      if (draft.vendorCountry) setVendorCountry(draft.vendorCountry as string);
      if (draft.vendorFiscalAddress) setVendorFiscalAddress(draft.vendorFiscalAddress as string);
      if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber as string);
      if (draft.invoiceDate) setInvoiceDate(draft.invoiceDate as string);
      if (draft.ncfModified) setNcfModified(draft.ncfModified as string);
      if (draft.category) setCategory(draft.category as string);
      if (draft.totalAmount) setTotalAmount(draft.totalAmount as string);
      if (draft.taxAmount) setTaxAmount(draft.taxAmount as string);
      if (draft.currency) setCurrency(draft.currency as string);
      if (draft.transactionType) setTransactionType(draft.transactionType as string);
      if (draft.description) setDescription(draft.description as string);
      if (draft.goodsType) setGoodsType(draft.goodsType as string);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod as string);
      if (draft.ncfModified) setNcfModified(draft.ncfModified as string);
      if (draft.lineItems) setLineItems(draft.lineItems as LineItem[]);
      return; // draft takes priority over initial
    }
    if (initial) {
      if (initial.vendor_name) setVendorName(initial.vendor_name);
      if (initial.vendor_tax_id) setVendorTaxId(initial.vendor_tax_id);
      if (initial.vendor_country) setVendorCountry(initial.vendor_country);
      if (initial.vendor_fiscal_address) setVendorFiscalAddress(initial.vendor_fiscal_address);
      if (initial.invoice_number) setInvoiceNumber(initial.invoice_number);
      if (initial.invoice_date) setInvoiceDate(initial.invoice_date);
      if (initial.currency) setCurrency(initial.currency);
      if (initial.transaction_type) setTransactionType(initial.transaction_type);
      if (initial.category) setCategory(initial.category);
      if (initial.goods_services_type) setGoodsType(initial.goods_services_type);
      if (initial.total_amount) setTotalAmount(String(initial.total_amount));
      if (initial.tax_amount) setTaxAmount(String(initial.tax_amount));
      if (initial.description) setDescription(initial.description);
    }
    restored.current = true;
  }, [open, initial, loadDraft]);

  useEffect(() => {
    if (!open) return;
    saveDraftDebounced({
      vendorName, vendorTaxId, vendorCountry, vendorFiscalAddress,
      invoiceNumber, invoiceDate, ncfModified, category,
      totalAmount, taxAmount, currency, transactionType, description,
      goodsType, paymentMethod, lineItems,
    });
  }, [
    open, vendorName, vendorTaxId, vendorCountry, vendorFiscalAddress,
    invoiceNumber, invoiceDate, ncfModified, category,
    totalAmount, taxAmount, currency, transactionType, description,
    goodsType, paymentMethod, lineItems, saveDraftDebounced,
  ]);

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0, subtotal: 0 }]);
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const items = lineItems.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.subtotal = Number(updated.quantity) * Number(updated.unit_price);
      }
      return updated;
    });
    setLineItems(items);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!vendorName.trim()) errs.vendorName = "Requerido";
    if (!vendorTaxId.trim()) errs.vendorTaxId = "Requerido para DGII (RNC/Cédula del proveedor)";
    if (!invoiceNumber.trim()) errs.invoiceNumber = "Requerido (NCF)";
    if (!invoiceDate) errs.invoiceDate = "Requerido";
    if (!totalAmount || Number(totalAmount) <= 0) errs.totalAmount = "Debe ser mayor a 0";
    if (isExpense && (goodsType === "none" || !goodsType)) errs.goodsType = "Requerido para DGII 606 (Tipo B/S)";
    if (paymentMethod === "none" || !paymentMethod) errs.paymentMethod = "Requerido para DGII (Forma de pago)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CreateInvoicePayload = {
        vendor_name: vendorName.trim(),
        vendor_tax_id: vendorTaxId.trim(),
        vendor_country: vendorCountry || undefined,
        vendor_fiscal_address: vendorFiscalAddress.trim() || undefined,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        currency,
        transaction_type: transactionType,
        category: category || undefined,
        payment_method: paymentMethod === "none" ? undefined : paymentMethod,
        ncf_modified: ncfModified.trim() || undefined,
        goods_services_type: goodsType === "none" ? undefined : goodsType,
        total_amount: Number(totalAmount),
        tax_amount: taxAmount ? Number(taxAmount) : undefined,
        description: description.trim() || undefined,
        line_items: lineItems.length > 0
          ? lineItems.map((li) => ({
              ...li,
              description: li.description || "Item",
            }))
          : [],
      };
      await onSave(payload);
      clearDraft();
      restored.current = false;
      onOpenChange(false);
    } catch {
      // error toast handled by parent
    } finally {
      setSaving(false);
    }
  }

  const lineTotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const dgiiFormat = isExpense ? "606" : "607";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-sm font-heading">Factura manual — avanzado</DialogTitle>
              <DialogDescription className="text-xs">
                Todos los campos fiscales DGII. Los marcados con <span className="text-destructive font-semibold">*</span> son requeridos.
              </DialogDescription>
            </div>
            {onBackToSimple && (
              <button
                type="button"
                onClick={onBackToSimple}
                className="shrink-0 rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground/60 hover:border-muted-foreground/30 hover:text-foreground/80 transition-all"
              >
                ← Simple
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* ── Proveedor ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Proveedor
              <Tooltip>
                <TooltipTrigger><Info className="size-3 text-muted-foreground/40" /></TooltipTrigger>
                <TooltipContent side="right" className="text-[11px] max-w-56">RNC obligatorio para DGII 606/607.</TooltipContent>
              </Tooltip>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label required>Nombre del proveedor</Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Proveedor, SRL"
                  className={errors.vendorName ? "border-destructive" : ""}
                />
                {errors.vendorName && <FieldError>{errors.vendorName}</FieldError>}
              </div>
              <div>
                <Label required>RNC / Cédula</Label>
                <Input
                  value={vendorTaxId}
                  onChange={(e) => setVendorTaxId(e.target.value)}
                  placeholder="101-000-00-0"
                  className={`font-mono ${errors.vendorTaxId ? "border-destructive" : ""}`}
                />
                {errors.vendorTaxId && <FieldError>{errors.vendorTaxId}</FieldError>}
              </div>
              <div>
                <Label>País</Label>
                <Select value={vendorCountry} onValueChange={setVendorCountry}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {showFiscal && (
              <div className="mt-3">
                <Label>Dirección fiscal</Label>
                <Textarea
                  value={vendorFiscalAddress}
                  onChange={(e) => setVendorFiscalAddress(e.target.value)}
                  placeholder="Calle, número, sector, ciudad..."
                  rows={2}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowFiscal(!showFiscal)}
              className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground/80 transition-colors"
            >
              <AlertCircleIcon className={`size-3 transition-transform ${showFiscal ? "rotate-90" : ""}`} />
              {showFiscal ? "Ocultar" : "Mostrar"} dirección fiscal
            </button>
          </section>

          {/* ── Comprobante ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Comprobante fiscal
              <Tooltip>
                <TooltipTrigger><Info className="size-3 text-muted-foreground/40" /></TooltipTrigger>
                <TooltipContent side="right" className="text-[11px] max-w-56">NCF del documento. Para notas de crédito, incluye el NCF original en &quot;Modificado&quot;.</TooltipContent>
              </Tooltip>
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label required>NCF</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="E310000000001"
                  className={`font-mono ${errors.invoiceNumber ? "border-destructive" : ""}`}
                />
                {errors.invoiceNumber && <FieldError>{errors.invoiceNumber}</FieldError>}
              </div>
              <div>
                <Label required>Fecha</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={errors.invoiceDate ? "border-destructive" : ""}
                />
                {errors.invoiceDate && <FieldError>{errors.invoiceDate}</FieldError>}
              </div>
              <div>
                <Label>Categoría</Label>
                <DgiiSelect
                  domain="categories"
                  value={category}
                  onChange={setCategory}
                  placeholder="Seleccionar categoría"
                  noneLabel="Sin categoría"
                />
              </div>
              <div className="sm:col-span-3">
                <Label>NCF modificado</Label>
                <Input
                  value={ncfModified}
                  onChange={(e) => setNcfModified(e.target.value)}
                  placeholder="Solo para notas de crédito / NCF rectificativo"
                  className="font-mono"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  Obligatorio si este comprobante rectifica o anula otro NCF.
                </p>
              </div>
            </div>
          </section>

          {/* ── Montos ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Montos
              <Tooltip>
                <TooltipTrigger><Info className="size-3 text-muted-foreground/40" /></TooltipTrigger>
                <TooltipContent side="right" className="text-[11px] max-w-56">Corresponde al Formulario {dgiiFormat}. El total es la suma de bienes + servicios + ITBIS.</TooltipContent>
              </Tooltip>
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label required>Total</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className={`font-mono tabular-nums ${errors.totalAmount ? "border-destructive" : ""}`}
                />
                {errors.totalAmount && <FieldError>{errors.totalAmount}</FieldError>}
              </div>
              <div>
                <Label>ITBIS</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <Label>Moneda</Label>
                <DgiiSelect
                  domain="currencies"
                  value={currency}
                  onChange={setCurrency}
                  placeholder="Seleccionar moneda"
                  noneLabel="Sin moneda"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ── Clasificación DGII ── */}
          <section className="rounded-lg border border-border/60 bg-amber-500/[0.03] p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <AlertCircleIcon className="size-3.5" />
              Clasificación DGII — Formulario {dgiiFormat}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label required={isExpense}>Tipo B/S (606)</Label>
                <DgiiSelect
                  domain="goods_services_types"
                  value={goodsType}
                  onChange={setGoodsType}
                  noneLabel="No especificado"
                />
                {errors.goodsType && <FieldError>{errors.goodsType}</FieldError>}
                {!isExpense && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">Opcional para ingresos (F-607).</p>
                )}
              </div>
              <div>
                <Label required>Forma de pago</Label>
                <DgiiSelect
                  domain="payment_methods"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  placeholder="Seleccionar..."
                  includeNone={false}
                />
                {errors.paymentMethod && <FieldError>{errors.paymentMethod}</FieldError>}
              </div>
            </div>
          </section>

          {/* ── Notas ── */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Notas</h3>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas adicionales sobre la factura..."
              rows={2}
            />
          </section>

          {/* ── Partidas ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Partidas</h3>
              <Button variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="size-3" />
                Añadir partida
              </Button>
            </div>
            {lineItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">Sin partidas. El monto total se usará tal cual.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border border-border/60 p-2">
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        placeholder="Descripción"
                        className="mb-1.5"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={item.quantity || ""}
                          onChange={(e) => updateLineItem(idx, "quantity", Number(e.target.value) || 0)}
                          placeholder="Cant."
                          className="w-20 font-mono tabular-nums"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price || ""}
                          onChange={(e) => updateLineItem(idx, "unit_price", Number(e.target.value) || 0)}
                          placeholder="Precio"
                          className="flex-1 font-mono tabular-nums"
                        />
                        <div className="flex h-7 items-center rounded-md border border-border/60 bg-muted/50 px-2 font-mono text-xs tabular-nums text-muted-foreground min-w-[5rem] justify-end">
                          {item.subtotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeLineItem(idx)}
                      className="mt-1.5 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs">
                  <Calculator className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Subtotal partidas:</span>
                  <span className="font-mono tabular-nums font-semibold">{lineTotal.toFixed(2)}</span>
                  <span className="text-muted-foreground/60 mx-1">|</span>
                  <span className="text-muted-foreground">Total declarado:</span>
                  <span className="font-mono tabular-nums font-semibold">{Number(totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/40 pt-4 mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Creando..." : "Crear factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Label({ required, children }: { required?: boolean; children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[10px] text-destructive">{children}</p>;
}
