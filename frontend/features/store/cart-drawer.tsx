"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { ShoppingCart, Trash2, Minus, Plus, Loader2, CreditCard } from "lucide-react";
import { useCart } from "./cart-context";
import { calculateCart, type CartItem } from "@/lib/api/plans";
import { CheckoutModal } from "./checkout-modal";
import { useQuery } from "@tanstack/react-query";

const ITEM_LABELS: Record<string, string> = {
  plan_change: "Cambio de plan",
  addon: "Bloque adicional",
  renewal: "Renovación",
  overage: "Pago por uso",
};

export function CartDrawer() {
  const { items, removeItem, updateQuantity, itemCount, isEmpty, clearCart } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const cartItems: CartItem[] = useMemo(
    () =>
      items.map((i) => ({
        type: i.type,
        plan_name: i.plan_name,
        addon_type: i.addon_type,
        quantity: i.quantity,
        months: i.months,
        price_cents: i.price_cents,
        label: i.label,
      })),
    [items],
  );

  const { data: cartCalc, isLoading: calcLoading } = useQuery({
    queryKey: ["cart-calc", cartItems],
    queryFn: () => calculateCart(cartItems),
    enabled: !isEmpty,
  });

  const total = cartCalc?.total ?? 0;
  const currency = cartCalc?.currency ?? "DOP";

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative gap-2 px-3 h-8">
            <ShoppingCart className="size-3.5" />
            <span className="text-xs">Carrito</span>
            {itemCount > 0 && (
              <Badge className="absolute -right-1.5 -top-1.5 size-4 p-0 flex items-center justify-center text-[9px] font-mono">
                {itemCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="p-5 pb-3 border-b">
            <SheetTitle className="text-sm flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              Carrito de compras
            </SheetTitle>
            <SheetDescription className="text-xs">
              {isEmpty ? "Agrega productos desde la tienda" : `${itemCount} artículo${itemCount !== 1 ? "s" : ""} en tu carrito`}
            </SheetDescription>
          </SheetHeader>

          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-12">
                <ShoppingCart className="size-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Tu carrito está vacío</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Explora los planes y addons disponibles
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 px-5 py-3 overflow-auto">
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-lg border border-border/60 p-3 gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {item.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {ITEM_LABELS[item.type] || item.type}
                          {item.months ? ` · ${item.months} mes${item.months > 1 ? "es" : ""}` : ""}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                          {(item.price_cents / 100).toLocaleString("es-DO", {
                            style: "currency",
                            currency: "DOP",
                          })}{" "}
                          /mes
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          className="size-6 rounded border border-border/60 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="size-2.5" />
                        </button>
                        <span className="font-mono text-xs tabular-nums w-5 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="size-6 rounded border border-border/60 flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Plus className="size-2.5" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="size-6 rounded border border-border/60 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
                        >
                          <Trash2 className="size-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t p-5 space-y-3">
                {calcLoading ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {cartCalc?.items.map((ci, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate mr-2">{ci.label}</span>
                        <span className="font-mono tabular-nums font-medium">
                          {ci.total.toLocaleString("es-DO", {
                            style: "currency",
                            currency,
                          })}
                        </span>
                      </div>
                    ))}
                    {cartCalc && cartCalc.months > 1 && (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{cartCalc.months} meses{cartCalc.discount > 0 ? ` · ${(cartCalc.discount * 100).toFixed(0)}% descuento` : ""}</span>
                        <span className="font-mono tabular-nums">
                          {cartCalc.monthly_total.toLocaleString("es-DO", { style: "currency", currency })}/mes
                        </span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">Total</span>
                      <span className="font-mono tabular-nums font-bold text-primary">
                        {total.toLocaleString("es-DO", {
                          style: "currency",
                          currency,
                        })}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={clearCart}>
                    Vaciar carrito
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5"
                    disabled={calcLoading || total <= 0}
                    onClick={() => setCheckoutOpen(true)}
                  >
                    <CreditCard className="size-3.5" />
                    Ir a pagar
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        items={cartItems}
        total={total}
        currency={currency}
        cartCalc={cartCalc}
        onSuccess={() => {
          setCheckoutOpen(false);
          clearCart();
        }}
      />
    </>
  );
}
