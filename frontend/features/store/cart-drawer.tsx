"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, CreditCard, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "./cart-context";
import { calculateCart, type CartItem as ApiCartItem } from "@/lib/api/plans";
import { CartItem } from "./components/cart-item";
import { CartSummary } from "./components/cart-summary";

export function CartDrawer() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, itemCount, isEmpty, clearCart } = useCart();

  const cartItems: ApiCartItem[] = useMemo(
    () =>
      items.map((i) => ({
        type: i.type,
        plan_name: i.plan_name,
        addon_type: i.addon_type,
        quantity: i.quantity,
        months: i.months,
        price_cents: i.price_cents,
        label: i.label,
        target_org_id: i.targetOrgId,
      })),
    [items]
  );

  const { data: cartCalc, isLoading: calcLoading } = useQuery({
    queryKey: ["cart-calc", cartItems],
    queryFn: () => calculateCart(cartItems),
    enabled: !isEmpty,
    staleTime: 5000,
  });

  const total = cartCalc?.total ?? 0;
  const currency = cartCalc?.currency ?? "DOP";
  const months = cartCalc?.months ?? 1;
  const discount = cartCalc?.discount ?? 0;
  const monthlyTotal = cartCalc?.monthly_total ?? 0;

  const handleCheckoutClick = () => {
    // Navigate to dedicated checkout page
    router.push("/dashboard/tienda/checkout");
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="relative gap-2 h-9 px-5 rounded-lg border border-brand-hairline bg-transparent text-brand-ink-secondary text-sm font-medium hover:text-brand-ink hover:bg-brand-canvas-soft transition-all active:scale-[0.97] select-none duration-100"
        >
          <ShoppingCart className="size-[15px]" />
          <span>Carrito</span>
          {itemCount > 0 && (
            <Badge className="absolute -right-2 -top-2 size-5 p-0 flex items-center justify-center text-[11px] font-semibold bg-brand-primary text-white ring-2 ring-white shadow-sm transition-transform duration-250 ease-out-expo animate-in fade-in zoom-in-75">
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 rounded-l-2xl border-brand-hairline dark:border-slate-800 bg-white dark:bg-slate-900">
        <SheetHeader className="p-5 pb-4 border-b border-brand-hairline dark:border-slate-800/60">
          <SheetTitle className="text-base font-semibold flex items-center gap-2 text-brand-ink dark:text-white">
            <ShoppingCart className="size-5 text-brand-primary" />
            <span>Carrito de compras</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-brand-ink-mute dark:text-slate-400">
            {isEmpty
              ? "Agrega planes o bloques desde la tienda."
              : `${itemCount} artículo${itemCount !== 1 ? "s" : ""} en tu carrito`}
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-brand-canvas-soft/10 dark:bg-slate-900/10">
            <div className="text-center space-y-3">
              <div className="p-4 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-14 mx-auto flex items-center justify-center border border-brand-hairline dark:border-slate-800">
                <ShoppingCart className="size-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                  Tu carrito está vacío
                </h4>
                <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-[240px] mx-auto leading-normal">
                  Explora planes y complementos disponibles en nuestra tienda.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable Cart Items list */}
            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4 bg-brand-canvas-soft/20 dark:bg-slate-900/10">
              {(() => {
                const planItems = items.filter(i => i.type === "plan_change");
                const recurringItems = items.filter(i => i.type === "entity_slot" || i.type === "user_slot" || i.type === "addon");
                const prepaidItems = items.filter(i => i.type === "ecf_blocks");
                const otherItems = items.filter(i => !["plan_change", "entity_slot", "user_slot", "addon", "ecf_blocks"].includes(i.type));

                return (
                  <>
                    {planItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink-mute">
                          Suscripción
                        </h4>
                        {planItems.map((item) => (
                          <CartItem
                            key={item.id}
                            item={item}
                            onUpdateQuantity={updateQuantity}
                            onRemove={removeItem}
                          />
                        ))}
                      </div>
                    )}
                    {recurringItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink-mute">
                          Complementos recurrentes
                        </h4>
                        {recurringItems.map((item) => (
                          <CartItem
                            key={item.id}
                            item={item}
                            onUpdateQuantity={updateQuantity}
                            onRemove={removeItem}
                          />
                        ))}
                      </div>
                    )}
                    {prepaidItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink-mute">
                          Complementos prepago
                        </h4>
                        {prepaidItems.map((item) => (
                          <CartItem
                            key={item.id}
                            item={item}
                            onUpdateQuantity={updateQuantity}
                            onRemove={removeItem}
                          />
                        ))}
                      </div>
                    )}
                    {otherItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink-mute">
                          Otros
                        </h4>
                        {otherItems.map((item) => (
                          <CartItem
                            key={item.id}
                            item={item}
                            onUpdateQuantity={updateQuantity}
                            onRemove={removeItem}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Bottom summary and checkouts */}
            <div className="border-t border-brand-hairline dark:border-slate-800/60 p-5 space-y-4 bg-white dark:bg-slate-900">
              {calcLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-brand-primary" />
                </div>
              ) : (
                <CartSummary
                  total={total}
                  currency={currency}
                  months={months}
                  discount={discount}
                  monthlyTotal={monthlyTotal}
                  breakdown={cartCalc?.items}
                />
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 py-3 px-7 min-w-[100px] rounded-xl text-sm font-semibold hover:bg-brand-canvas-soft hover:text-brand-ink active:scale-[0.98] transition-all duration-100"
                  onClick={clearCart}
                >
                  Vaciar
                </Button>
                
                <Button
                  type="button"
                  className="flex-1 h-11 py-3 px-7 min-w-[120px] text-sm font-semibold gap-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                  disabled={calcLoading || total <= 0}
                  onClick={handleCheckoutClick}
                >
                  <CreditCard className="size-3.5" />
                  <span>Ir a pagar</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
