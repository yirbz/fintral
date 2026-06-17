"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyPlan,
  getPublicPlans,
  type PlanSummary,
  type AddonsSummary,
} from "@/lib/api/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Check,
  ShoppingCart,
  Package,
  Zap,
  HardDrive,
  Brain,
  Building2,
  Plus,
  Info,
  FileText,
  Loader2,
  AlertCircle,
  Stamp,
  CalendarDays,
  Users,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useCart } from "./cart-context";
import { CartDrawer } from "./cart-drawer";
import { purchaseAddonDirect } from "@/lib/api/plans";
import { toast } from "sonner";
import Link from "next/link";

function PlanCard({
  plan,
  currentPlanId,
  onAddToCart,
  inCart,
  commitMonths,
}: {
  plan: PlanSummary;
  currentPlanId?: string;
  onAddToCart: () => void;
  inCart: boolean;
  commitMonths: number;
}) {
  const isCurrent = plan.id === currentPlanId;
  const features = plan.features
    ? Object.entries(plan.features)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/_/g, " "))
    : [];

  return (
    <div
      className={cn(
        "relative rounded-xl border p-5 transition-all",
        isCurrent
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-card hover:shadow-sm hover:border-primary/30",
      )}
    >
      {isCurrent && (
        <Badge className="absolute top-3 right-3 text-[9px] h-4 px-1.5">
          Actual
        </Badge>
      )}
      {plan.is_enterprise && (
        <Badge variant="secondary" className="absolute top-3 left-3 text-[9px] h-4 px-1.5">
          Enterprise
        </Badge>
      )}

      <p className="text-base font-semibold text-foreground mt-1">{plan.display_name}</p>
      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 min-h-[2em]">
        {plan.description}
      </p>

      <div className="mt-4">
        {commitMonths > 1 ? (
          <>
            <span className="text-3xl font-light tabular-nums text-foreground">
              RD$ {new Intl.NumberFormat("es-DO").format(Math.round(discountedPrice(plan.price_monthly, commitMonths)))}
            </span>
            <span className="text-xs font-normal text-muted-foreground ml-1">/mes</span>
            <span className="block text-[10px] text-muted-foreground/50 line-through mt-0.5">
              RD$ {new Intl.NumberFormat("es-DO").format(plan.price_monthly)}/mes sin compromiso
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-light tabular-nums text-foreground">
              RD$ {new Intl.NumberFormat("es-DO").format(plan.price_monthly)}
            </span>
            <span className="text-xs font-normal text-muted-foreground ml-1">/mes</span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        {features.slice(0, 6).map((feature) => (
          <div key={feature} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check className="size-3 text-green-500 shrink-0" />
            <span className="capitalize">{feature}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground/60">
        {plan.limits?.max_ecf_monthly || 0} ECF/mes · {plan.limits?.max_users || 0} usuarios
      </div>

      <Button
        size="sm"
        className={cn("w-full mt-4 text-xs h-8 gap-1.5", inCart && "bg-green-600 hover:bg-green-700")}
        variant={isCurrent ? "outline" : "default"}
        disabled={isCurrent}
        onClick={onAddToCart}
      >
        {inCart ? (
          <>
            <Check className="size-3" />
            En carrito
          </>
        ) : (
          <>
            <ShoppingCart className="size-3" />
            {isCurrent ? "Plan actual" : "Agregar al carrito"}
          </>
        )}
      </Button>
    </div>
  );
}

function ConfirmAddonDialog({
  open,
  onOpenChange,
  label,
  price,
  onConfirm,
  confirmLabel = "Comprar",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  price: number;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShoppingCart className="size-4 text-primary" />
            Confirmar compra
          </DialogTitle>
          <DialogDescription className="text-xs">
            Estás a punto de agregar <strong>{label}</strong> a tu plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-mono tabular-nums font-semibold">
              RD$ {price.toFixed(2)}
              <span className="text-[10px] font-normal text-muted-foreground">/mes</span>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10 p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Esta acción es irreversible hasta el próximo ciclo de facturación. El cargo se agregará a tu estado de cuenta mensual.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            <Check className="size-3" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddonShopSection({
  addons,
}: {
  addons: AddonsSummary | undefined;
}) {
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<{ type: string; label: string; price: number } | null>(null);
  const addonItems = [
    {
      type: "ai",
      label: "Bloques IA",
      description: "Consultas de inteligencia artificial",
      icon: Brain,
      size: addons?.ai_block_size || 500,
      sizeLabel: "consultas",
      price: addons?.ai_block_price || 600,
      current: addons?.ai_blocks || 0,
    },
    {
      type: "storage",
      label: "Almacenamiento",
      description: "Espacio para documentos y archivos",
      icon: HardDrive,
      size: (addons?.storage_block_mb || 10240) / 1024,
      sizeLabel: "GB",
      price: addons?.storage_block_price || 300,
      current: addons?.storage_blocks || 0,
    },
  ];

  async function handleBuy(addonType: string, label: string) {
    setBuying(addonType);
    try {
      const res = await purchaseAddonDirect(addonType, 1, label);
      toast.success(`${label} activado — cargado a tu estado de cuenta (RD$ ${(res.total_price_cents / 100).toFixed(2)})`);
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
    } catch (err: any) {
      toast.error("Error al comprar bloque", { description: err.message });
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {addonItems.map((item) => (
        <div
          key={item.type}
          className="relative rounded-xl border border-border/60 bg-card hover:shadow-sm hover:border-primary/30 transition-all p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <item.icon className="size-4 text-primary" />
            <p className="text-xs font-semibold text-foreground">{item.label}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{item.description}</p>
          <p className="text-lg font-light tabular-nums mt-2 text-foreground">
            RD$ {new Intl.NumberFormat("es-DO").format(item.price)}
            <span className="text-xs font-normal text-muted-foreground">/bloque/mes</span>
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {item.size} {item.sizeLabel} por bloque · Tienes {item.current}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-3 text-xs h-7 gap-1.5"
            onClick={() => setConfirmItem({ type: item.type, label: item.label, price: item.price })}
            disabled={buying === item.type}
          >
            {buying === item.type ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
            {buying === item.type ? "Activando..." : "Comprar 1 bloque"}
          </Button>
        </div>
      ))}

      <ConfirmAddonDialog
        open={!!confirmItem}
        onOpenChange={(open) => { if (!open) setConfirmItem(null); }}
        label={confirmItem?.label || ""}
        price={confirmItem?.price || 0}
        confirmLabel="Comprar bloque"
        onConfirm={() => {
          if (confirmItem) handleBuy(confirmItem.type, confirmItem.label);
        }}
      />
    </div>
  );
}

function EcfBlockCard({
  label,
  description,
  price,
  onBuy,
  discounted,
  payg,
}: {
  label: string;
  description: string;
  price: number;
  onBuy?: () => void;
  discounted?: boolean;
  payg?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <Target className="size-4 text-primary mb-2" />
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{description}</p>
      {payg ? (
        <p className="text-xs text-muted-foreground mt-3 italic">
          Sin costo inicial. Se descuenta automáticamente del saldo al emitir.
        </p>
      ) : (
        <>
          <p className="text-lg font-light tabular-nums mt-2 text-foreground">
            RD$ {new Intl.NumberFormat("es-DO").format(price)}
            {discounted && (
              <span className="text-[10px] text-muted-foreground/50 line-through ml-1 font-normal">
                RD$ {new Intl.NumberFormat("es-DO").format(price)}
              </span>
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-3 text-xs h-7"
            onClick={onBuy}
          >
            <Plus className="size-3" />
            Agregar al carrito
          </Button>
        </>
      )}
    </div>
  );
}

const COMMIT_OPTIONS = [
  { months: 1, label: "1 mes", discount: 0 },
  { months: 3, label: "3 meses", discount: 3 },
  { months: 6, label: "6 meses", discount: 5 },
  { months: 12, label: "12 meses", discount: 10 },
] as const;

function discountedPrice(price: number, months: number): number {
  const tier = COMMIT_OPTIONS.find((o) => o.months === months);
  return price * (1 - (tier?.discount ?? 0) / 100);
}

export function StorePage() {
  const session = useSession();
  const isLoadingSession = session.isLoading;
  const role = session.data?.role;
  const canManage = role === "owner" || role === "admin";
  const { items, addItem, removeItem } = useCart();
  const [commitMonths, setCommitMonths] = useState(1);

  const { data: planData, isLoading: planLoading, isError: planError } = useQuery({
    queryKey: ["plans", "my"],
    queryFn: getMyPlan,
  });

  // Handle auto-add from ECF balance purchase redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qty = parseInt(params.get("add_ecf") || "", 10);
    const price = parseInt(params.get("price") || "", 10);
    if (qty > 0 && price > 0) {
      addItem({
        type: "ecf_blocks",
        quantity: qty,
        months: 1,
        price_cents: Math.round(price * 100),
        label: `${qty} bloque${qty > 1 ? "s" : ""} de 100 documentos ECF`,
      });
      toast.success(`${qty} bloque${qty > 1 ? "s" : ""} de ECF agregado al carrito`);
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/store");
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: publicPlans, isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ["plans", "public"],
    queryFn: getPublicPlans,
    enabled: canManage,
  });

  const cartPlanNames = items.filter((i) => i.type === "plan_change").map((i) => i.plan_name);

  function handleAddPlanToCart(plan: PlanSummary) {
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
  }

  function handleAddEcfBlocks(qty: number, pricePerBlock: number) {
    addItem({
      type: "ecf_blocks",
      quantity: qty,
      months: 1,
      price_cents: Math.round(pricePerBlock * 100),
      label: `${qty} bloque${qty > 1 ? "s" : ""} de 100 documentos ECF`,
    });
    toast.success(`${qty} bloque${qty > 1 ? "s" : ""} de documentos ECF agregado al carrito`);
  }

  const queryClient = useQueryClient();
  const [buyingSlot, setBuyingSlot] = useState<string | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<{ type: string; label: string; price: number } | null>(null);

  async function handleAddEntitySlot() {
    setBuyingSlot("entity");
    try {
      const res = await purchaseAddonDirect("entity_slot", 1, "Slot de entidad adicional");
      toast.success(`Slot de entidad activado — cargado a tu estado de cuenta (RD$ ${(res.total_price_cents / 100).toFixed(2)})`);
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
    } catch (err: any) {
      toast.error("Error al comprar slot de entidad", { description: err.message });
    } finally {
      setBuyingSlot(null);
    }
  }

  async function handleAddUserSlot() {
    setBuyingSlot("user");
    try {
      const res = await purchaseAddonDirect("user_slot", 1, "Slot de usuario adicional");
      toast.success(`Slot de usuario activado — cargado a tu estado de cuenta (RD$ ${(res.total_price_cents / 100).toFixed(2)})`);
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
    } catch (err: any) {
      toast.error("Error al comprar slot de usuario", { description: err.message });
    } finally {
      setBuyingSlot(null);
    }
  }

  // Wait for session to load before deciding access
  if (isLoadingSession) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-5">
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-muted/50 to-transparent p-5">
          <h1 className="text-lg font-heading font-semibold text-foreground">Tienda</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Solo los administradores pueden gestionar planes y pagos.
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">Volver al dashboard</Button>
        </Link>
      </div>
    );
  }

  const isDataLoading = planLoading || plansLoading;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="size-4 text-primary" />
              <p className="text-xs font-medium text-primary">Tienda</p>
            </div>
            <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">
              Tienda Fintral
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Elige tu plan, compra documentos ECF para tus clientes y paga con transferencia bancaria.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-1">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              {COMMIT_OPTIONS.map((opt) => (
                <button
                  key={opt.months}
                  onClick={() => setCommitMonths(opt.months)}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded-md transition-colors",
                    commitMonths === opt.months
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                  {opt.discount > 0 && (
                    <span className="ml-0.5 text-[8px] opacity-80">-{opt.discount}%</span>
                  )}
                </button>
              ))}
            </div>
            <CartDrawer />
          </div>
        </div>
      </div>

      {isDataLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Planes */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Planes</h2>
            </div>

            {plansError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4" />
                Error al cargar los planes. Intenta de nuevo más tarde.
              </div>
            ) : !publicPlans || publicPlans.length === 0 ? (
              <div className="rounded-lg border border-border/60 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No hay planes disponibles en este momento.
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Contacta al equipo de Fintral para más información.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {publicPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    currentPlanId={planData?.plan?.id}
                    onAddToCart={() => handleAddPlanToCart(plan)}
                    inCart={cartPlanNames.includes(plan.name) && plan.id !== planData?.plan?.id}
                    commitMonths={commitMonths}
                  />
                ))}
              </div>
            )}

            {/* Current plan info */}
            {planData?.plan && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px] h-5">
                  Plan actual: {planData.plan.display_name}
                </Badge>
                {planData.subscription?.status === "active" && (
                  <span className="text-green-600 dark:text-green-400">Activo</span>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Documentos ECF */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Documentos ECF</h2>
              <p className="text-[11px] text-muted-foreground ml-1">
                Compra bloques de documentos electrónicos para tus entidades emisoras
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mb-3">
              Los documentos se acreditan al saldo de la entidad. Cada entidad emisora puede comprar sus propios bloques o el contador puede asignarlos.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <EcfBlockCard
                label="Bloque 100 ECF"
                description="100 documentos electrónicos"
                price={planData?.plan ? Math.round((planData.plan as any)?.addon_ecf_block_price || 950) : 950}
                onBuy={() => handleAddEcfBlocks(1, planData?.plan ? Math.round((planData.plan as any)?.addon_ecf_block_price || 950) : 950)}
              />
              <EcfBlockCard
                label="Bloque 500 ECF"
                description="500 documentos electrónicos (ahorro 10%)"
                price={planData?.plan ? Math.round((planData.plan as any)?.addon_ecf_block_price || 950) * 5 : 4750}
                discounted
                onBuy={() => handleAddEcfBlocks(5, planData?.plan ? Math.round((planData.plan as any)?.addon_ecf_block_price || 950) : 950)}
              />
              <EcfBlockCard
                label="Pago por uso"
                description="RD$ 12.00 por documento, sin compromiso"
                price={0}
                payg
              />
            </div>
          </div>

          <Separator />

          {/* Addons (AI + Storage) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Bloques adicionales</h2>
              <p className="text-[11px] text-muted-foreground ml-1">
                Amplía los límites de tu plan contratado
              </p>
            </div>
            <AddonShopSection
              addons={planData?.subscription?.addons}
            />
          </div>

          <Separator />

          {/* Slots de entidad */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Slots de entidad</h2>
              <p className="text-[11px] text-muted-foreground ml-1">
                Agrega más entidades a tu plan
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-1">
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <Building2 className="size-4 text-primary mb-2" />
                <p className="text-xs font-semibold text-foreground">Slot de entidad</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Agrega una entidad adicional a tu plan
                </p>
                <p className="text-lg font-light tabular-nums mt-2 text-foreground">
                  RD$ {new Intl.NumberFormat("es-DO").format(planData?.plan ? Math.round((planData.plan as any)?.entity_slot_price || 600) : 600)}
                  <span className="text-xs font-normal text-muted-foreground">/mes</span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3 text-xs h-7 gap-1.5"
                  onClick={() => setConfirmSlot({
                    type: "entity_slot",
                    label: "Slot de entidad",
                    price: planData?.plan ? Math.round((planData.plan as any)?.entity_slot_price || 600) : 600,
                  })}
                  disabled={buyingSlot === "entity"}
                >
                  {buyingSlot === "entity" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {buyingSlot === "entity" ? "Activando..." : "Comprar 1 slot"}
                </Button>
              </div>
            </div>

            <ConfirmAddonDialog
              open={confirmSlot?.type === "entity_slot"}
              onOpenChange={(open) => { if (!open) setConfirmSlot(null); }}
              label={confirmSlot?.label || ""}
              price={confirmSlot?.price || 0}
              confirmLabel="Comprar slot"
              onConfirm={() => {
                if (confirmSlot) {
                  setConfirmSlot(null);
                  handleAddEntitySlot();
                }
              }}
            />
          </div>

          <Separator />

          {/* Slots de usuario */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Slots de usuario</h2>
              <p className="text-[11px] text-muted-foreground ml-1">
                Invita a más personas a tu plan
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-1">
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <Users className="size-4 text-primary mb-2" />
                <p className="text-xs font-semibold text-foreground">Slot de usuario</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Invita a un usuario adicional a tu plan
                </p>
                <p className="text-lg font-light tabular-nums mt-2 text-foreground">
                  RD$ {new Intl.NumberFormat("es-DO").format(planData?.plan ? Math.round((planData.plan as any)?.user_slot_price || 300) : 300)}
                  <span className="text-xs font-normal text-muted-foreground">/mes</span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3 text-xs h-7 gap-1.5"
                  onClick={() => setConfirmSlot({
                    type: "user_slot",
                    label: "Slot de usuario",
                    price: planData?.plan ? Math.round((planData.plan as any)?.user_slot_price || 300) : 300,
                  })}
                  disabled={buyingSlot === "user"}
                >
                  {buyingSlot === "user" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {buyingSlot === "user" ? "Activando..." : "Comprar 1 slot"}
                </Button>
              </div>
            </div>

            <ConfirmAddonDialog
              open={confirmSlot?.type === "user_slot"}
              onOpenChange={(open) => { if (!open) setConfirmSlot(null); }}
              label={confirmSlot?.label || ""}
              price={confirmSlot?.price || 0}
              confirmLabel="Comprar slot"
              onConfirm={() => {
                if (confirmSlot) {
                  setConfirmSlot(null);
                  handleAddUserSlot();
                }
              }}
            />
          </div>

          {/* How it works */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-900/30 dark:bg-sky-950/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="size-4 text-sky-600 shrink-0" />
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">¿Cómo funciona?</p>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>1. Agrega los productos que deseas al carrito.</p>
              <p>2. Revisa el resumen y haz clic en &quot;Ir a pagar&quot;.</p>
              <p>3. Transfiere el monto exacto a la cuenta indicada.</p>
              <p>4. Sube el comprobante de la transferencia.</p>
              <p>5. El equipo de Fintral verificará el pago y activará los cambios automáticamente.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
