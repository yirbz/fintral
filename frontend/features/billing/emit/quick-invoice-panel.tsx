"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Calculator,
  Loader2,
  Plus,
  Send,
  Trash2,
  User,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { billingApi, type EmitLineItem, type EmitResult } from "@/lib/api/billing";
import { ConfirmEmissionDialog } from "./confirm-emission-dialog";
import { NcfSelector } from "./ncf-selector";
import { ProductSearch } from "./product-search";

interface QuickInvoicePanelProps {
  onSuccess?: (result: EmitResult) => void;
}

const CONSUMIDOR_FINAL_TYPES = new Set([2, 32]);

export function QuickInvoicePanel({ onSuccess }: QuickInvoicePanelProps) {
  const [ecfType, setEcfType] = useState<number | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerRnc, setBuyerRnc] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [paymentType, setPaymentType] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<number | undefined>(undefined);
  const [items, setItems] = useState<EmitLineItem[]>([
    { description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18 },
  ]);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isConsumerFinal = ecfType !== null && CONSUMIDOR_FINAL_TYPES.has(ecfType);

  useEffect(() => {
    if (CONSUMIDOR_FINAL_TYPES.has(ecfType ?? -1)) {
      setBuyerName("Consumidor Final");
      setBuyerRnc("132109122");
    }
  }, [ecfType]);

  const emitMutation = useMutation({
    mutationFn: (data: Parameters<typeof billingApi.emitInvoice>[0]) =>
      billingApi.emitInvoice(data),
    onSuccess: (result) => {
      if (result.status === "verified") {
        toast.success("Factura emitida exitosamente", {
          description: `Comprobante electrónico timbrado por la DGII.`,
        });
        onSuccess?.(result);
        resetForm();
      } else if (result.status === "pending") {
        toast.info("Factura enviada a la DGII", {
          description: "Será procesada de forma asíncrona. Recibirá una notificación.",
        });
        onSuccess?.(result);
        resetForm();
      } else {
        toast.error(result.error_message || "Error al emitir la factura");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error de conexión con el servidor");
    },
  });

  const resetForm = () => {
    setBuyerName("");
    setBuyerRnc("");
    setBuyerAddress("");
    setPaymentType(1);
    setPaymentMethod(undefined);
    setItems([{ description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18 }]);
    setNotes("");
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, discount_rate: 0, tax_rate: 18 }]);
  };

  const addItemFromProduct = (product: { id: string; name: string; price: number; tax_rate: number }) => {
    setItems([...items, { description: product.name, quantity: 1, unit_price: product.price, discount_rate: 0, tax_rate: product.tax_rate }]);
  };

  const updateItem = (index: number, field: keyof EmitLineItem, value: string | number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const canEmit =
    ecfType !== null &&
    (isConsumerFinal ||
      (buyerName.trim().length > 0 &&
        buyerRnc.replace(/[^0-9]/g, "").length >= 9)) &&
    items.length > 0 &&
    items.some((i) => i.description.trim() && i.unit_price > 0);

  const handleEmit = () => {
    if (!ecfType || !canEmit) return;

    const cleanRnc = buyerRnc.replace(/[^0-9]/g, "");
    if (cleanRnc.length !== 9 && cleanRnc.length !== 11) {
      toast.error("El RNC/Cédula debe tener 9 u 11 dígitos");
      return;
    }

    if (itemTotal >= 250_000) {
      setConfirmOpen(true);
      return;
    }

    doEmit(cleanRnc);
  };

  const itemTotal = items.reduce((sum, item) => {
    const gross = item.quantity * item.unit_price;
    const discount = gross * ((item.discount_rate ?? 0) / 100);
    const net = gross - discount;
    const tax = net * ((item.tax_rate ?? 18) / 100);
    return sum + net + tax;
  }, 0);

  const doEmit = (cleanRnc: string) => {
    setConfirmOpen(false);
    emitMutation.mutate({
      mode: "quick",
      ecf_type: ecfType!,
      payment_type: paymentType,
      payment_method: paymentMethod,
      buyer_name: buyerName.trim(),
      buyer_rnc: cleanRnc,
      buyer_address: buyerAddress.trim() || undefined,
      items,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="size-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Emisión Rápida</h2>
          <p className="text-xs text-muted-foreground">
            Factura POS — ideal para ventas al contado y consumo final
          </p>
        </div>
      </div>

      <Separator />

      {/* Type + Comprador row */}
      <div className="grid grid-cols-[1fr_1fr] gap-3 items-start">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Tipo de comprobante</Label>
          <NcfSelector
            value={ecfType}
            onChange={setEcfType}
            filterQuickMode
            electronicOnly
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Condición de pago</Label>
          <Select
            value={paymentType.toString()}
            onValueChange={(v) => setPaymentType(parseInt(v))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Contado</SelectItem>
              <SelectItem value="2">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Buyer details */}
      <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <User className="size-3.5" />
          Datos del comprador
        </div>
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Nombre o Razón Social *</Label>
            <Input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RNC / Cédula *</Label>
            <Input
              value={buyerRnc}
              onChange={(e) => setBuyerRnc(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
              placeholder="00000000000"
              className="h-9 text-sm"
              maxLength={11}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dirección (opcional)</Label>
          <Input
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value)}
            placeholder="Dirección fiscal del comprador"
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <ProductSearch onSelect={addItemFromProduct} />
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Productos / Servicios</Label>
          <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs">
            <Plus className="size-3 mr-1" />
            Agregar item
          </Button>
        </div>
        <div className="border rounded-lg divide-y divide-border">
          {items.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No hay productos. Agregue un item para comenzar.
            </div>
          ) : items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2">
              <Input
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
                placeholder="Describa el producto o servicio"
                className="h-8 text-xs flex-1"
              />
              <Input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(idx, "quantity", Math.max(0.01, parseFloat(e.target.value) || 0))}
                min={0.01}
                step={1}
                className="h-8 text-xs w-16 text-center"
                placeholder="1"
              />
              <div className="relative w-28">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">RD$</span>
                <Input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => updateItem(idx, "unit_price", Math.max(0, parseFloat(e.target.value) || 0))}
                  min={0}
                  step={0.01}
                  className="h-8 text-xs text-right pl-8"
                  placeholder="0.00"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                className="text-destructive hover:text-destructive size-7 shrink-0"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Notas (opcional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas internas para esta factura"
          className="h-9 text-sm"
        />
      </div>

      {/* Total + Emit */}
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground">Total estimado</span>
          <span className="text-lg font-semibold tabular-nums">
            RD$ {itemTotal.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <Button
          className="w-full h-10 text-sm gap-2"
          disabled={!canEmit || emitMutation.isPending}
          onClick={handleEmit}
        >
          {emitMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Emitiendo...
            </>
          ) : (
            <>
              <Send className="size-4" />
              Emitir y timbrar
            </>
          )}
        </Button>
        {itemTotal >= 250_000 && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
            <Calculator className="size-3" />
            Monto ≥ RD$250,000 — será procesado de forma asíncrona por la DGII
          </p>
        )}
      </div>

      {emitMutation.data?.status === "error" && emitMutation.data.error_message && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 text-xs text-destructive">
          {emitMutation.data.error_message}
        </div>
      )}

      <ConfirmEmissionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          const cleanRnc = buyerRnc.replace(/[^0-9]/g, "");
          doEmit(cleanRnc);
        }}
        isPending={emitMutation.isPending}
        totalAmount={itemTotal}
        hasUnregisteredBuyer={false}
      />
    </div>
  );
}
