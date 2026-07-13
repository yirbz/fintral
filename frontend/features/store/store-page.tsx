"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyPlan, getPublicPlans, PlanSummary } from "@/lib/api/plans";
import { useSession } from "@/hooks/use-session";
import { useCart } from "./cart-context";
import { DurationSelector } from "./components/duration-selector";
import { PlanGrid } from "./components/plan-grid";
import { AddonSection } from "./components/addon-section";
import { TrustBadges } from "./components/trust-badges";
import { CartDrawer } from "./cart-drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TrialRemainingBadge } from "@/components/trial-remaining-badge";
import { Package, Lock, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export function StorePage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const { items, addItem, removeItem } = useCart();
  const [commitMonths, setCommitMonths] = useState(1);


  const isSessionLoading = session.isLoading;
  const role = session.data?.role;
  const canManage = role === "owner" || role === "admin";

  const { data: mySubData, isLoading: mySubLoading } = useQuery({
    queryKey: ["plans", "my"],
    queryFn: getMyPlan,
  });

  const { data: publicPlans, isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ["plans", "public"],
    queryFn: getPublicPlans,
    enabled: canManage,
  });

  // Handle URL auto-add from billing platform redirects — runs once on mount
  const cartRef = React.useRef({ items, addItem, removeItem });
  cartRef.current = { items, addItem, removeItem };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qty = parseInt(params.get("add_ecf") || "", 10);
    const price = parseInt(params.get("price") || "", 10);

    if (qty > 0 && price > 0) {
      const { items, addItem, removeItem } = cartRef.current;
      const existingEcf = items.find((i) => i.type === "ecf_blocks");
      if (existingEcf) removeItem(existingEcf.id);

      addItem({
        type: "ecf_blocks",
        quantity: qty,
        months: 1,
        price_cents: Math.round(price * 100),
        label: `${qty} bloque${qty > 1 ? "s" : ""} de 100 documentos ECF`,
      });
      toast.success(`${qty} bloque${qty > 1 ? "s" : ""} de ECF agregado al carrito`);

      window.history.replaceState({}, "", "/dashboard/tienda");
    }
  }, []); // Intentionally empty — reads cart via ref to avoid re-trigger loop

  // Handle adding plans to cart (pre-pay)
  const handleAddPlanToCart = (plan: PlanSummary) => {
    const existing = items.find((i) => i.type === "plan_change");
    if (existing) removeItem(existing.id);

    addItem({
      type: "plan_change",
      plan_name: plan.name,
      quantity: 1,
      months: commitMonths,
      price_cents: Math.round(plan.price_monthly * 100),
      label: `Plan ${plan.display_name} (${commitMonths} mes${commitMonths > 1 ? "es" : ""})`,
    });
    toast.success(`${plan.display_name} agregado al carrito`);
  };

  // Handle adding addon block to cart (pre-pay — e-CF blocks only)
  const handleAddAddonToCart = (type: string, quantity: number, pricePerBlockDop: number, label: string) => {
    const existing = items.find((i) => i.type === type);
    if (existing) removeItem(existing.id);

    addItem({
      type: type as any,
      quantity,
      months: 1,
      price_cents: Math.round(pricePerBlockDop * 100),
      label,
    });
    toast.success(`${label} agregado al carrito`);
  };

  // Handle adding post-pay addons to cart (superpuestos-al-plan)
  const handleAddPostpayToCart = (type: string, label: string, priceCents: number) => {
    const existing = items.find((i) => i.type === type);
    if (existing) removeItem(existing.id);

    addItem({
      type: type as any,
      quantity: 1,
      months: 1,
      price_cents: priceCents,
      label,
    });
    toast.success(`${label} añadido al carrito`);
  };

  if (isSessionLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-24 w-full rounded-2xl animate-pulse" />
        <Skeleton className="h-80 w-full rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Permission access gate check
  if (!canManage) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 text-center border border-brand-hairline dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs space-y-4">
        <div className="p-3 bg-red-500/10 text-red-500 rounded-full size-12 mx-auto flex items-center justify-center">
          <Lock className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-brand-ink dark:text-white">Acceso restringido</h2>
          <p className="text-xs text-brand-ink-mute dark:text-slate-400">
            Solo los dueños y administradores de la organización pueden comprar complementos o modificar el plan.
          </p>
        </div>
        <Button asChild className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100">
          <Link href="/dashboard">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  const cartPlanNames = items.filter((i) => i.type === "plan_change").map((i) => i.plan_name);

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 border-b border-brand-hairline dark:border-slate-800/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-primary dark:text-sky-400">
            <Package className="size-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-widest leading-none">Tienda</span>
          </div>
          <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight">
            Tienda Fintral
          </h1>
          <p className="text-sm text-brand-ink-mute dark:text-slate-400">
            Elige el plan ideal para tu organización y amplía tus capacidades de facturación.
          </p>
        </div>
        <div className="flex items-center shrink-0">
          <CartDrawer />
        </div>
      </div>

      {/* Trial remaining indicator */}
      <TrialRemainingBadge />

      {/* Commitment duration selector */}
      <DurationSelector value={commitMonths} onChange={setCommitMonths} />

      {/* Main Pricing Cards Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-brand-ink dark:text-white">
          Planes disponibles
        </h3>
        <PlanGrid
          plans={publicPlans}
          currentPlan={mySubData?.plan ?? null}
          isTrial={mySubData?.subscription?.status === "trialing"}
          isLoading={mySubLoading || plansLoading}
          isError={plansError}
          cartPlanNames={cartPlanNames}
          commitMonths={commitMonths}
          onAddToCart={handleAddPlanToCart}
        />
      </div>

      {/* Custom plan CTA — enterprise handled outside the grid */}
      <div className="rounded-2xl border border-dashed border-brand-hairline dark:border-slate-800 bg-brand-canvas-soft/30 dark:bg-slate-900/30 p-6 sm:p-8 text-center space-y-3">
        <h4 className="text-sm font-semibold text-brand-ink dark:text-white">
          ¿Necesitas un plan personalizado?
        </h4>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
          Si tu organización requiere límites superiores, integraciones a la medida o condiciones especiales, podemos diseñar un plan Enterprise adaptado a tu negocio.
        </p>
        <Button asChild variant="outline" className="h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100 font-semibold">
          <a href="mailto:support@fintral.app?subject=Quiero%20información%20de%20un%20plan%20personalizado">
            <span>Contactar a ventas</span>
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </div>

      <Separator className="bg-brand-hairline dark:border-slate-800" />

      {/* Addons Grid */}
      <AddonSection
        plan={mySubData?.plan ?? null}
        addons={mySubData?.subscription?.addons}
        cartItems={items}
        onAddPrepayToCart={handleAddAddonToCart}
        onAddPostpayToCart={handleAddPostpayToCart}
      />

      <Separator className="bg-brand-hairline dark:bg-slate-800" />

      {/* Trust guarantees footer */}
      <TrustBadges />
    </div>
  );
}
