"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Calculator, ChevronRight, AlertCircleIcon } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useReferenceData } from "@/hooks/use-reference-data";
import type { CreateInvoicePayload } from "@/lib/api/invoices";

const COUNTRIES = [
  { code: "DO", label: "República Dominicana" },
  { code: "US", label: "Estados Unidos" },
  { code: "ES", label: "España" },
  { code: "MX", label: "México" },
  { code: "CO", label: "Colombia" },
  { code: "AR", label: "Argentina" },
  { code: "CL", label: "Chile" },
  { code: "PE", label: "Perú" },
  { code: "BR", label: "Brasil" },
  { code: "PA", label: "Panamá" },
  { code: "PR", label: "Puerto Rico" },
  { code: "VE", label: "Venezuela" },
  { code: "CR", label: "Costa Rica" },
  { code: "GT", label: "Guatemala" },
  { code: "EC", label: "Ecuador" },
  { code: "CN", label: "China" },
  { code: "DE", label: "Alemania" },
  { code: "JP", label: "Japón" },
];

const TRANSACTION_TYPES = [
  { value: "expense", label: "Gasto / Compra" },
  { value: "income", label: "Ingreso / Venta" },
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
  const [showFiscal, setShowFiscal] = useState(false);

  const [vendorName, setVendorName] = useState("");
  const [vendorTaxId, setVendorTaxId] = useState("");
  const [vendorCountry, setVendorCountry] = useState("");
  const [vendorFiscalAddress, setVendorFiscalAddress] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("DOP");
  const [transactionType, setTransactionType] = useState("expense");
  const [category, setCategory] = useState("");
  const [goodsType, setGoodsType] = useState("none");

  const [totalAmount, setTotalAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [description, setDescription] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (initial) {
      if (initial.vendor_name) setVendorName(initial.vendor_name);
      if (initial.vendor_tax_id) setVendorTaxId(initial.vendor_tax_id);
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
  }, [open, initial]);

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
    if (!invoiceNumber.trim()) errs.invoiceNumber = "Requerido";
    if (!invoiceDate) errs.invoiceDate = "Requerido";
    if (!totalAmount || Number(totalAmount) <= 0) errs.totalAmount = "Debe ser mayor a 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CreateInvoicePayload = {
        vendor_name: vendorName.trim(),
        vendor_tax_id: vendorTaxId.trim() || undefined,
        vendor_country: vendorCountry || undefined,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        currency,
        transaction_type: transactionType,
        category: category || undefined,
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
      onOpenChange(false);
    } catch {
      // error toast handled by parent
    } finally {
      setSaving(false);
    }
  }

  const lineTotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-sm font-heading">Factura manual — avanzado</DialogTitle>
              <DialogDescription className="text-xs">
                Todos los campos disponibles para registrar una factura manual con clasificación DGII completa.
              </DialogDescription>
            </div>
            {onBackToSimple && (
              <button
                type="button"
                onClick={onBackToSimple}
                className="shrink-0 rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground/60 hover:border-muted-foreground/30 hover:text-foreground/80 transition-all"
              >
                ← Volver al simple
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Vendor section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Proveedor
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel required>Nombre del proveedor</FieldLabel>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Proveedor, SRL"
                  className={errors.vendorName ? "border-destructive" : ""}
                />
                {errors.vendorName && <FieldError>{errors.vendorName}</FieldError>}
              </div>
              <div>
                <FieldLabel>RNC / Tax ID</FieldLabel>
                <Input value={vendorTaxId} onChange={(e) => setVendorTaxId(e.target.value)} placeholder="101-000-00-0" />
              </div>
              <div>
                <FieldLabel>País</FieldLabel>
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
                <FieldLabel>Dirección fiscal</FieldLabel>
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
              <ChevronRight className={`size-3 transition-transform ${showFiscal ? "rotate-90" : ""}`} />
              {showFiscal ? "Ocultar" : "Mostrar"} dirección fiscal
            </button>
          </section>

          {/* Invoice section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Factura
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel required>NCF / Número</FieldLabel>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="B0100000001"
                  className={errors.invoiceNumber ? "border-destructive" : ""}
                />
                {errors.invoiceNumber && <FieldError>{errors.invoiceNumber}</FieldError>}
              </div>
              <div>
                <FieldLabel required>Fecha</FieldLabel>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={errors.invoiceDate ? "border-destructive" : ""}
                />
                {errors.invoiceDate && <FieldError>{errors.invoiceDate}</FieldError>}
              </div>
              <div>
                <FieldLabel>Categoría</FieldLabel>
                <DgiiSelect
                  domain="categories"
                  value={category}
                  onChange={setCategory}
                  placeholder="Seleccionar categoría"
                  noneLabel="Sin categoría"
                />
              </div>
            </div>
          </section>

          {/* Amounts section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Montos
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <FieldLabel required>Total</FieldLabel>
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
                <FieldLabel>ITBIS</FieldLabel>
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
                <FieldLabel>Moneda</FieldLabel>
                <DgiiSelect
                  domain="currencies"
                  value={currency}
                  onChange={setCurrency}
                  placeholder="Seleccionar moneda"
                  noneLabel="Sin moneda"
                />
              </div>
              <div className="pl-1 md:pl-5">
                <FieldLabel>Tipo</FieldLabel>
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

          {/* DGII section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Clasificación DGII
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Tipo bienes/servicios (606)</FieldLabel>
                <DgiiSelect
                  domain="goods_services_types"
                  value={goodsType}
                  onChange={setGoodsType}
                  noneLabel="No especificado"
                />
              </div>
            </div>
          </section>

          {/* Description */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Notas
            </h3>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas adicionales sobre la factura..."
              rows={2}
            />
          </section>

          {/* Line items */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                Partidas
              </h3>
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

function FieldLabel({ required, children }: { required?: boolean; children: React.ReactNode }) {
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
