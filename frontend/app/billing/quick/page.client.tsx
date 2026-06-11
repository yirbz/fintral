"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Calculator,
  CreditCard,
  Eraser,
  Landmark,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  Send,
  User,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  billingApi,
  type EmitResult,
  type Product,
  type BillingInvoice,
} from "@/lib/api/billing";
import { ProductSearch } from "@/features/billing/emit/product-search";
import { NcfSelector } from "@/features/billing/emit/ncf-selector";
import { CustomerSearch } from "@/features/billing/emit/customer-search";
import { ConfirmEmissionDialog } from "@/features/billing/emit/confirm-emission-dialog";
import { PendingInvoiceView } from "@/features/billing/emit/pending-invoice-view";

// ── Types ──

interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  discount: number;
}

interface BuyerState {
  id?: string;
  name: string;
  rnc: string;
  address?: string;
  phone?: string;
  email?: string;
}

type ViewState =
  | { type: "form" }
  | { type: "pending"; result: EmitResult & { invoice: NonNullable<EmitResult["invoice"]> } };

const STORAGE_KEY = "fintral_quick_billing_form";
const CONSUMIDOR_FINAL_TYPES = new Set([2, 32]);
const FISCAL_TYPES = new Set([1, 31]);
const ELECTRONIC_TYPES = new Set([31, 32, 33, 34, 41, 43, 44, 45, 46, 47]);

// ── Helpers ──

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Sub-components ──

function EmptyCart() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center">
        <Search className="size-5 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Carrito vacío</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Busque productos para agregar a la factura
        </p>
      </div>
    </div>
  );
}

interface CartRowProps {
  item: CartItem;
  onUpdate: (updates: Partial<CartItem>) => void;
  onRemove: () => void;
}

function CartRow({ item, onUpdate, onRemove }: CartRowProps) {
  const lineTotal = item.quantity * item.price * (1 - item.discount / 100);

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 group transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.product.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(item.price)} c/u
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          onClick={() => {
            if (item.quantity <= 1) onRemove();
            else onUpdate({ quantity: item.quantity - 1 });
          }}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums font-medium">
          {item.quantity}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          onClick={() => onUpdate({ quantity: item.quantity + 1 })}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <div className="text-right min-w-[100px]">
        <p className="text-sm font-medium tabular-nums">
          {formatCurrency(lineTotal)}
        </p>
        {item.discount > 0 && (
          <p className="text-[10px] text-rose-500 tabular-nums">
            -{item.discount}% desc.
          </p>
        )}
      </div>

      <div className="w-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <Input
          type="number"
          value={item.price}
          onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
          className="h-7 text-xs text-right"
          min={0}
          step={0.01}
          aria-label="Override price"
        />
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        className="size-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
        onClick={onRemove}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function TotalRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between text-xs text-muted-foreground", className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ── Main Page ──

export default function QuickBillingPage() {
  const [view, setView] = useState<ViewState>({ type: "form" });

  // Restore draft from sessionStorage
  const savedDraft = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  // NCF & payment
  const [ecfType, setEcfType] = useState<number | null>(savedDraft?.ecfType ?? null);
  const [paymentType, setPaymentType] = useState<number>(savedDraft?.paymentType ?? 1);
  const [paymentMethod, setPaymentMethod] = useState<number | undefined>(savedDraft?.paymentMethod ?? undefined);
  const [notes, setNotes] = useState(savedDraft?.notes ?? "");

  // Buyer
  const [buyer, setBuyer] = useState<BuyerState>(savedDraft?.buyer ?? { name: "", rnc: "" });

  // Cart
  const [cart, setCart] = useState<CartItem[]>(savedDraft?.cart ?? []);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Listen for iframe print cleanup
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "printed") {
        const iframe = document.getElementById("print-iframe");
        if (iframe) {
          iframe.remove();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const printInvoice = useCallback((invoiceId: string) => {
    const existing = document.getElementById("print-iframe");
    if (existing) {
      existing.remove();
    }
    const iframe = document.createElement("iframe");
    iframe.id = "print-iframe";
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    iframe.src = `/billing/invoices/${invoiceId}/print?auto=true`;
    document.body.appendChild(iframe);
  }, []);

  // Persist draft to sessionStorage on every change
  useEffect(() => {
    if (view.type !== "form") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ecfType, paymentType, paymentMethod, notes, buyer, cart,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [ecfType, paymentType, paymentMethod, notes, buyer, cart, view.type]);

  const isConsumidorFinal = ecfType !== null && CONSUMIDOR_FINAL_TYPES.has(ecfType);
  const isElectronic = ecfType !== null && ELECTRONIC_TYPES.has(ecfType);
  const hasCartItems = cart.length > 0;

  // ── Totals ──
  const totals = cart.reduce(
    (acc, item) => {
      const gross = item.quantity * item.price;
      const disc = gross * (item.discount / 100);
      const net = gross - disc;
      const tax = net * (item.product.tax_rate / 100);
      return {
        subtotal: acc.subtotal + gross,
        discountAmount: acc.discountAmount + disc,
        taxAmount: acc.taxAmount + tax,
        total: acc.total + net + tax,
      };
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 },
  );

  // ── Validation ──
  const buyerRncClean = buyer.rnc.replace(/[^0-9]/g, "");
  const buyerValid = buyer.name.trim().length > 0 && buyerRncClean.length >= 9;
  const canEmit = ecfType !== null && (isConsumidorFinal || buyerValid) && hasCartItems;

  // ── Resolve buyer for emission ──
  function resolveBuyer(): { name: string; rnc: string } {
    if (isConsumidorFinal) return { name: "Consumidor Final", rnc: "132109122" };
    return { name: buyer.name.trim(), rnc: buyerRncClean || "132109122" };
  }

  // ── Electronic emission via /emit ──
  const emitMutation = useMutation({
    mutationFn: (data: Parameters<typeof billingApi.emitInvoice>[0]) =>
      billingApi.emitInvoice(data),
    onSuccess: (result) => {
      if (result.status === "verified") {
        toast.success("Factura emitida exitosamente", {
          description: "Comprobante electrónico timbrado por la DGII.",
        });
        if (result.invoice?.id) {
          printInvoice(result.invoice.id);
        }
        resetForm();
      } else if (result.status === "pending" && result.invoice?.id) {
        setView({
          type: "pending",
          result: result as EmitResult & { invoice: NonNullable<EmitResult["invoice"]> },
        });
      } else {
        toast.error(result.error_message || "Error al emitir la factura");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error de conexión con el servidor");
    },
  });

  // ── Physical emission via create + transmit ──
  const physicalMutation = useMutation({
    mutationFn: async () => {
      const { name, rnc } = resolveBuyer();
      const invoice = await billingApi.createInvoice({
        client_id: buyer.id || undefined,
        ecf_type: ecfType!,
        payment_type: paymentType,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.price,
          discount_rate: item.discount,
        })),
      });
      const result = await billingApi.transmitInvoice(invoice.id);
      return result.invoice;
    },
    onSuccess: (invoice: BillingInvoice) => {
      toast.success("Factura emitida exitosamente", {
        description: `Comprobante físico registrado. NCF: ${invoice.invoice_number || ""}`,
      });
      if (invoice.id) {
        printInvoice(invoice.id);
      }
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al emitir la factura física");
    },
  });

  const isPending = emitMutation.isPending || physicalMutation.isPending;

  function clearForm() {
    sessionStorage.removeItem(STORAGE_KEY);
    setCart([]);
    setBuyer({ name: "", rnc: "" });
    setNotes("");
    setPaymentMethod(undefined);
    setPaymentType(1);
    setEcfType(null);
  }

  const resetForm = clearForm;

  // ── Cart operations ──
  function addToCart(product: Product) {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
    } else {
      setCart([...cart, { product, quantity: 1, price: product.price, discount: 0 }]);
    }
  }

  function updateCartItem(index: number, updates: Partial<CartItem>) {
    setCart(cart.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  function removeFromCart(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  // ── Emission ──
  function handleEmit() {
    if (!ecfType || !canEmit) return;

    const { name, rnc } = resolveBuyer();

    if (!isConsumidorFinal && rnc.length !== 9 && rnc.length !== 11) {
      toast.error("El RNC/Cédula debe tener 9 u 11 dígitos");
      return;
    }

    const needsConfirmation = totals.total >= 250_000 || (!isConsumidorFinal && !buyer.id);

    if (isElectronic && needsConfirmation) {
      setConfirmOpen(true);
      return;
    }

    if (!isElectronic && needsConfirmation) {
      setConfirmOpen(true);
      return;
    }

    doEmit(name, rnc);
  }

  function doEmit(buyerName: string, buyerRnc: string) {
    setConfirmOpen(false);

    if (isElectronic) {
      emitMutation.mutate({
        mode: "quick",
        ecf_type: ecfType!,
        payment_type: paymentType,
        payment_method: paymentMethod,
        buyer_name: buyerName,
        buyer_rnc: buyerRnc,
        buyer_address: isConsumidorFinal ? undefined : buyer.address || undefined,
        items: cart.map((item) => ({
          description: item.product.name,
          quantity: item.quantity,
          unit_price: item.price,
          discount_rate: item.discount,
          tax_rate: item.product.tax_rate,
        })),
        notes: notes.trim() || undefined,
      });
    } else {
      physicalMutation.mutate();
    }
  }

  // ── Pending state ──
  if (view.type === "pending") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center">
        <PendingInvoiceView
          result={view.result}
          onBack={() => {
            resetForm();
            setView({ type: "form" });
          }}
        />
      </div>
    );
  }

  // ── Form state ──
  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* ── Left: Product search + Receipt tape ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border/50">
        <div className="shrink-0 p-4 border-b border-border/50">
          <ProductSearch onSelect={addToCart} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!hasCartItems ? (
            <EmptyCart />
          ) : (
            <div className="space-y-1">
              {cart.map((item, index) => (
                <CartRow
                  key={`${item.product.id}-${index}`}
                  item={item}
                  onUpdate={(updates) => updateCartItem(index, updates)}
                  onRemove={() => removeFromCart(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Payment panel ── */}
      <div className="w-[380px] shrink-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Datos de facturación</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={clearForm}
            >
              <Eraser className="size-3" />
              Limpiar
            </Button>
          </div>

          <Section label="Tipo de comprobante">
            <NcfSelector value={ecfType} onChange={setEcfType} filterQuickMode />
          </Section>

          {isConsumidorFinal ? (
            <div className="rounded-lg border p-3 bg-muted/20">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="size-3.5" />
                Consumidor Final
                <span className="text-muted-foreground/60">
                  ({ecfType === 2 ? "Físico 02" : "e-CF 32"})
                </span>
              </div>
            </div>
          ) : (
            <Section label="Comprador">
              <CustomerSearch value={buyer} onChange={setBuyer} />
            </Section>
          )}

          <Section label="Condición de pago">
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
          </Section>

          <Section label="Método de pago">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: 1, label: "Efectivo", icon: Wallet },
                { value: 2, label: "Transferencia", icon: Landmark },
                { value: 3, label: "Tarjeta", icon: CreditCard },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={paymentMethod === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod(value)}
                  className="h-9 text-xs gap-1.5"
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </Section>

          <Section label="Notas">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas (opcional)"
              className="h-9 text-sm"
            />
          </Section>
        </div>

        {/* ── Footer: Totals + Emit ── */}
        <div className="shrink-0 border-t border-border/50 p-4 space-y-4">
          <div className="space-y-1">
            <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
            {totals.discountAmount > 0 && (
              <TotalRow
                label="Descuentos"
                value={`-${formatCurrency(totals.discountAmount)}`}
                className="text-rose-500"
              />
            )}
            <TotalRow label="ITBIS" value={formatCurrency(totals.taxAmount)} />
            <Separator />
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold tabular-nums text-primary">
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>

          <Button
            className="w-full h-11 text-sm gap-2"
            disabled={!canEmit || isPending}
            onClick={handleEmit}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Emitiendo...
              </>
            ) : (
              <>
                {isElectronic ? <Send className="size-4" /> : <Receipt className="size-4" />}
                {isConsumidorFinal
                  ? "Cobrar y emitir"
                  : isElectronic
                    ? "Emitir comprobante electrónico"
                    : "Emitir comprobante físico"}
              </>
            )}
          </Button>

          {isElectronic && totals.total >= 250_000 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Calculator className="size-3" />
              Monto ≥ RD$250,000 — procesamiento asíncrono por la DGII
            </p>
          )}
        </div>
      </div>

      <ConfirmEmissionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          const { name, rnc } = resolveBuyer();
          doEmit(name, rnc);
        }}
        isPending={isPending}
        totalAmount={totals.total}
        hasUnregisteredBuyer={!isConsumidorFinal && !buyer.id}
      />
    </div>
  );
}
