"use client";

import { useState } from "react";
import { Plus, Trash2, Calculator } from "lucide-react";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CreateInvoicePayload } from "@/lib/api/invoices";

const GOODS_TYPES = [
  { value: "none", label: "No especificado" },
  { value: "B01", label: "B01 - Productos locales" },
  { value: "B02", label: "B02 - Productos importados" },
  { value: "B03", label: "B03 - Materia prima local" },
  { value: "B04", label: "B04 - Materia prima importada" },
  { value: "B05", label: "B05 - Combustibles" },
  { value: "B06", label: "B06 - Energía eléctrica" },
  { value: "S01", label: "S01 - Servicios profesionales" },
  { value: "S02", label: "S02 - Servicios técnicos" },
  { value: "S03", label: "S03 - Arrendamiento" },
  { value: "S04", label: "S04 - Otros servicios" },
];

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export function ManualInvoiceDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: CreateInvoicePayload) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [currency, setCurrency] = useState("DOP");
  const [transactionType, setTransactionType] = useState("expense");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [vendorTaxId, setVendorTaxId] = useState("");
  const [goodsType, setGoodsType] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setVendorName("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setTotalAmount("");
    setTaxAmount("");
    setCurrency("DOP");
    setTransactionType("expense");
    setCategory("");
    setDescription("");
    setVendorTaxId("");
    setGoodsType("");
    setLineItems([]);
    setErrors({});
  }

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
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        total_amount: Number(totalAmount),
        tax_amount: taxAmount ? Number(taxAmount) : undefined,
        currency,
        transaction_type: transactionType,
        category: category.trim() || undefined,
        description: description.trim() || undefined,
        vendor_tax_id: vendorTaxId.trim() || undefined,
        goods_services_type: goodsType === "none" ? undefined : goodsType,
        line_items: lineItems.map((li) => ({
          ...li,
          description: li.description || "Item",
        })),
      };
      await onSave(payload);
      reset();
      onOpenChange(false);
    } catch {
      // error toast is handled by the mutation's onError in invoices-page
    } finally {
      setSaving(false);
    }
  }

  const lineTotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">Nueva factura manual</DialogTitle>
          <DialogDescription className="text-xs">
            Ingresa los datos de la factura para crear un registro manual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Vendor section */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Proveedor</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nombre *
                </label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Proveedor, SRL"
                  className={errors.vendorName ? "border-destructive" : ""}
                />
                {errors.vendorName ? <p className="mt-0.5 text-[10px] text-destructive">{errors.vendorName}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  RNC / Tax ID
                </label>
                <Input
                  value={vendorTaxId}
                  onChange={(e) => setVendorTaxId(e.target.value)}
                  placeholder="101-000-00-0"
                />
              </div>
            </div>
          </div>

          {/* Invoice section */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Factura</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  NCF / Número *
                </label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="B0100000001"
                  className={errors.invoiceNumber ? "border-destructive" : ""}
                />
                {errors.invoiceNumber ? <p className="mt-0.5 text-[10px] text-destructive">{errors.invoiceNumber}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fecha *
                </label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={errors.invoiceDate ? "border-destructive" : ""}
                />
                {errors.invoiceDate ? <p className="mt-0.5 text-[10px] text-destructive">{errors.invoiceDate}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Categoría
                </label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Oficina, Servicios, etc."
                />
              </div>
            </div>
          </div>

          {/* Amounts section */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Montos</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Total *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className={`font-mono tabular-nums ${errors.totalAmount ? "border-destructive" : ""}`}
                />
                {errors.totalAmount ? <p className="mt-0.5 text-[10px] text-destructive">{errors.totalAmount}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  ITBIS
                </label>
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
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Moneda
                </label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tipo
                </label>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto</SelectItem>
                    <SelectItem value="income">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* DGII section */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Clasificación DGII</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tipo B/S (606)
                </label>
                <Select value={goodsType} onValueChange={setGoodsType}>
                  <SelectTrigger><SelectValue placeholder="No especificado" /></SelectTrigger>
                  <SelectContent>
                    {GOODS_TYPES.map((gt) => (
                      <SelectItem key={gt.value} value={gt.value}>{gt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Descripción / Notas
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas adicionales sobre la factura..."
              rows={2}
            />
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Partidas</p>
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
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
