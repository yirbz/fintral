"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  getStatement,
  payStatement,
  uploadPaymentProof,
  cancelAddon,
  reactivateAddon,
  payStatementCard,
  setStatementPlanChange,
  getPublicPlans,
} from "@/lib/api/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  CreditCard,
  X,
  ShoppingBag,
  Clock,
  CalendarDays,
  ReceiptText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Building2,
  Users,
  Cpu,
  HardDrive,
  Trash2,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LABELS: Record<string, string> = {
  ai: "Bloques de Consultas IA",
  storage: "Almacenamiento Adicional",
  entity_slot: "Empresas Adicionales",
  user_slot: "Usuarios Adicionales",
  plan: "Plan de Suscripción",
};

const ADDON_ICONS: Record<string, React.ElementType> = {
  entity_slot: Building2,
  user_slot: Users,
  ai: Cpu,
  storage: HardDrive,
  plan: ReceiptText,
};

const ADDON_TYPE_MAP: Record<string, "entity_slot" | "user_slot" | "ai" | "storage"> = {
  entity_slot: "entity_slot",
  user_slot: "user_slot",
  ai: "ai",
  storage: "storage",
};

function formatDOP(cents: number) {
  return (cents / 100).toLocaleString("es-DO", {
    style: "currency",
    currency: "DOP",
  });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Addon Detail Panel ──────────────────────────────────────────────────────

interface AddonDetailPanelProps {
  chargeType: string;
  addonDetail: NonNullable<NonNullable<Awaited<ReturnType<typeof getStatement>>>["addon_detail"]>;
  onCancel: (addonType: "entity_slot" | "user_slot" | "ai" | "storage", qty: number) => void;
  cancelling: boolean;
  onReactivate: (addonType: "entity_slot" | "user_slot" | "ai" | "storage", qty: number) => void;
  reactivating: boolean;
}

function ReactivateControl({
  addonType,
  pendingCancel,
  onReactivate,
  reactivating,
}: {
  addonType: "entity_slot" | "user_slot" | "ai" | "storage";
  pendingCancel: number;
  onReactivate: (addonType: "entity_slot" | "user_slot" | "ai" | "storage", qty: number) => void;
  reactivating: boolean;
}) {
  if (!pendingCancel || pendingCancel <= 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-red-200/50 dark:border-red-900/30 bg-red-500/[0.03] dark:bg-red-950/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
      <div className="space-y-0.5">
        <p className="font-semibold text-red-650 dark:text-red-400">Cancelación programada</p>
        <p className="text-[10px] text-brand-ink-mute dark:text-slate-400 leading-normal">
          Has cancelado {pendingCancel} slot{pendingCancel > 1 ? "s" : ""} para el próximo ciclo.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 py-2 px-3 text-[10px] font-semibold gap-1.5 rounded-lg bg-red-600 hover:bg-red-750 text-white active:scale-[0.98] transition-all duration-100 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onReactivate(addonType, pendingCancel);
        }}
        disabled={reactivating}
      >
        {reactivating ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RotateCcw className="size-3" />
        )}
        Reactivar slots
      </Button>
    </div>
  );
}

function AddonDetailPanel({
  chargeType,
  addonDetail,
  onCancel,
  cancelling,
  onReactivate,
  reactivating,
}: AddonDetailPanelProps) {
  const [cancelQty, setCancelQty] = useState(1);

  const canonical = ADDON_TYPE_MAP[chargeType];
  if (!canonical) return null;

  const handleCancelClick = (e: React.MouseEvent, type: "entity_slot" | "user_slot" | "ai" | "storage", qty: number) => {
    e.stopPropagation();
    onCancel(type, qty);
  };

  if (canonical === "entity_slot") {
    const d = addonDetail.entity_slot;
    if (!d || d.total === 0) return null;
    const canCancelCount = Math.max(d.total - (d.pending_cancel || 0), 0);
    return (
      <div className="mt-3 space-y-2 pl-1" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider">
          Empresas con slots adicionales activos
        </p>
        {d.orgs.map((o) => (
          <div key={o.org_id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand-ink dark:text-slate-200 truncate">{o.org_name}</p>
              {o.tax_id && <p className="text-[10px] text-brand-ink-mute dark:text-slate-500">RNC {o.tax_id}</p>}
            </div>
            <Badge variant="outline" className="text-[9px] px-1.5 border-brand-primary/20 bg-brand-primary/5 text-brand-primary shrink-0 ml-2">
              {o.slots} slot{o.slots > 1 ? "s" : ""}
            </Badge>
          </div>
        ))}
        {d.user_level_slots > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
            <p className="text-xs font-medium text-brand-ink dark:text-slate-200">Capacidad de cuenta (multi-empresa)</p>
            <Badge variant="outline" className="text-[9px] px-1.5 border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400 shrink-0 ml-2">
              {d.user_level_slots} slot{d.user_level_slots > 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        {canCancelCount > 0 && (
          <CancelControl
            addonType="entity_slot"
            max={canCancelCount}
            qty={cancelQty}
            setQty={setCancelQty}
            onCancel={handleCancelClick}
            cancelling={cancelling}
          />
        )}
        <ReactivateControl
          addonType="entity_slot"
          pendingCancel={d.pending_cancel || 0}
          onReactivate={onReactivate}
          reactivating={reactivating}
        />
      </div>
    );
  }

  if (canonical === "user_slot") {
    const d = addonDetail.user_slot;
    if (!d || d.total === 0) return null;
    const canCancelCount = Math.max(d.total - (d.pending_cancel || 0), 0);
    return (
      <div className="mt-3 space-y-2 pl-1" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider">
          Organizaciones con usuarios adicionales activos
        </p>
        {d.orgs.map((o) => (
          <div key={o.org_id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand-ink dark:text-slate-200 truncate">{o.org_name}</p>
              {o.tax_id && <p className="text-[10px] text-brand-ink-mute dark:text-slate-500">RNC {o.tax_id}</p>}
            </div>
            <Badge variant="outline" className="text-[9px] px-1.5 border-brand-primary/20 bg-brand-primary/5 text-brand-primary shrink-0 ml-2">
              {o.slots} usuario{o.slots > 1 ? "s" : ""}
            </Badge>
          </div>
        ))}
        {canCancelCount > 0 && (
          <CancelControl
            addonType="user_slot"
            max={canCancelCount}
            qty={cancelQty}
            setQty={setCancelQty}
            onCancel={handleCancelClick}
            cancelling={cancelling}
          />
        )}
        <ReactivateControl
          addonType="user_slot"
          pendingCancel={d.pending_cancel || 0}
          onReactivate={onReactivate}
          reactivating={reactivating}
        />
      </div>
    );
  }

  if (canonical === "ai") {
    const d = addonDetail.ai;
    if (!d || d.total_blocks === 0) return null;
    const canCancelCount = Math.max(d.total_blocks - (d.pending_cancel || 0), 0);
    return (
      <div className="mt-3 space-y-2 pl-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
          <p className="text-xs font-medium text-brand-ink dark:text-slate-200">Bloques IA activos en tu cuenta</p>
          <Badge variant="outline" className="text-[9px] px-1.5 border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400 shrink-0 ml-2">
            {d.total_blocks} bloque{d.total_blocks > 1 ? "s" : ""}
          </Badge>
        </div>
        {canCancelCount > 0 && (
          <CancelControl
            addonType="ai"
            max={canCancelCount}
            qty={cancelQty}
            setQty={setCancelQty}
            onCancel={handleCancelClick}
            cancelling={cancelling}
          />
        )}
        <ReactivateControl
          addonType="ai"
          pendingCancel={d.pending_cancel || 0}
          onReactivate={onReactivate}
          reactivating={reactivating}
        />
      </div>
    );
  }

  if (canonical === "storage") {
    const d = addonDetail.storage;
    if (!d || d.total_blocks === 0) return null;
    const canCancelCount = Math.max(d.total_blocks - (d.pending_cancel || 0), 0);
    return (
      <div className="mt-3 space-y-2 pl-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
          <p className="text-xs font-medium text-brand-ink dark:text-slate-200">Bloques de almacenamiento activos</p>
          <Badge variant="outline" className="text-[9px] px-1.5 border-orange-500/20 bg-orange-500/5 text-orange-600 dark:text-orange-400 shrink-0 ml-2">
            {d.total_blocks} bloque{d.total_blocks > 1 ? "s" : ""}
          </Badge>
        </div>
        {canCancelCount > 0 && (
          <CancelControl
            addonType="storage"
            max={canCancelCount}
            qty={cancelQty}
            setQty={setCancelQty}
            onCancel={handleCancelClick}
            cancelling={cancelling}
          />
        )}
        <ReactivateControl
          addonType="storage"
          pendingCancel={d.pending_cancel || 0}
          onReactivate={onReactivate}
          reactivating={reactivating}
        />
      </div>
    );
  }

  return null;
}

interface CancelControlProps {
  addonType: "entity_slot" | "user_slot" | "ai" | "storage";
  max: number;
  qty: number;
  setQty: (n: number) => void;
  onCancel: (e: React.MouseEvent, t: "entity_slot" | "user_slot" | "ai" | "storage", q: number) => void;
  cancelling: boolean;
}

function CancelControl({ addonType, max, qty, setQty, onCancel, cancelling }: CancelControlProps) {
  if (max === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <div className="flex items-center border border-brand-hairline dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <button
          type="button"
          className="px-2.5 py-1.5 text-sm font-bold text-brand-ink-mute dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          onClick={(e) => {
            e.stopPropagation();
            setQty(Math.max(1, qty - 1));
          }}
          disabled={qty <= 1}
        >
          −
        </button>
        <span className="px-3.5 text-xs font-semibold text-brand-ink dark:text-slate-200 select-none">{qty}</span>
        <button
          type="button"
          className="px-2.5 py-1.5 text-sm font-bold text-brand-ink-mute dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          onClick={(e) => {
            e.stopPropagation();
            setQty(Math.min(max, qty + 1));
          }}
          disabled={qty >= max}
        >
          +
        </button>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 text-[11px] font-semibold border-red-500/30 text-red-655 dark:text-red-450 hover:bg-red-500/10 hover:border-red-500/50 rounded-lg"
        onClick={(e) => onCancel(e, addonType, qty)}
        disabled={cancelling}
      >
        {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Cancelar {qty === 1 ? "1 slot" : `${qty} slots`}
      </Button>
      <p className="text-[10px] text-brand-ink-mute dark:text-slate-500 leading-tight">
        Efectivo al inicio del próximo ciclo
      </p>
    </div>
  );
}

// ── Recurring Row (Próximo Ciclo) ───────────────────────────────────────────

interface RecurringRowProps {
  item: any;
  addonDetail?: any;
  onCancel: (t: "entity_slot" | "user_slot" | "ai" | "storage", q: number) => void;
  cancelling: boolean;
  onReactivate: (t: "entity_slot" | "user_slot" | "ai" | "storage", q: number) => void;
  reactivating: boolean;
  plans?: any[];
  currentPlanName?: string;
  pendingPlanName?: string | null;
  onPlanSelect?: (planName: string | null) => void;
  changingPlan?: boolean;
}

function RecurringRow({ item, addonDetail, onCancel, cancelling, onReactivate, reactivating, plans, currentPlanName, pendingPlanName, onPlanSelect, changingPlan }: RecurringRowProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ADDON_ICONS[item.type] ?? ReceiptText;
  const isPlan = item.type === "plan";
  const canonicalType = ADDON_TYPE_MAP[item.type];
  const hasDetail = !isPlan && !!canonicalType && !!addonDetail;

  return (
    <div
      onClick={() => {
        if (isPlan && plans?.length) { setExpanded((v) => !v); }
        else if (hasDetail) { setExpanded((v) => !v); }
      }}
      className={cn(
        "rounded-xl border border-brand-hairline dark:border-slate-800/80 p-4 bg-white dark:bg-slate-900 transition-all select-none",
        (isPlan || hasDetail) ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" : ""
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="size-8 rounded-lg flex items-center justify-center shrink-0 bg-brand-primary/5">
            <Icon className="size-3.5 text-brand-primary" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-semibold text-brand-ink dark:text-slate-200 truncate">
                {isPlan && pendingPlanName
                  ? `${item.label || currentPlanName} → ${pendingPlanName}`
                  : (item.label || LABELS[item.type] || item.type)}
              </p>
              {item.pending_cancel > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-500/20 bg-red-500/5 text-red-650 dark:text-red-400 font-bold shrink-0">
                  {item.quantity === 0 ? "Cancelado" : `-${item.pending_cancel}`} próximo ciclo
                </Badge>
              )}
              {isPlan && pendingPlanName && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  Cambio pendiente
                </Badge>
              )}
              {hasDetail && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-brand-primary/20 bg-brand-primary/5 text-brand-primary font-medium flex gap-0.5 items-center">
                  <Settings2 className="size-2.5" />
                  Gestionar
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 font-medium">
              {isPlan ? (
                pendingPlanName ? "Se aplicará al pagar" : "Base de suscripción"
              ) : item.pending_cancel > 0 ? (
                `Límite actual: ${item.original_quantity} · Próximo ciclo: ${item.quantity}`
              ) : (
                `${item.quantity} extra contratado(s) · recurrente`
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "text-xs font-mono font-medium tabular-nums",
            item.pending_cancel > 0 && item.quantity === 0
              ? "line-through text-brand-ink-mute dark:text-slate-500"
              : "text-brand-ink dark:text-slate-350"
          )}>
            {formatDOP(item.price_cents * item.quantity)}
          </span>
          {(isPlan || hasDetail) ? (
            <motion.div
              animate={{ rotate: expanded ? 0 : -90 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="size-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <ChevronDown className="size-3.5 text-brand-ink-mute dark:text-slate-400" />
            </motion.div>
          ) : (
            <div className="size-6 shrink-0" />
          )}
        </div>
      </div>

      {/* Plan selector — expandable */}
      <AnimatePresence initial={false}>
        {isPlan && expanded && plans && plans.length > 0 && (
          <motion.div
            key="plan-selector"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3 border-t border-brand-hairline dark:border-slate-800/60 pt-3 space-y-0.5">
          {plans
            .filter((p: any) => p.is_enterprise !== true && p.is_active !== false)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((p: any) => {
              const planLabel = p.display_name || p.name;
              const isSelected = pendingPlanName
                ? planLabel === pendingPlanName
                : planLabel === currentPlanName;
              const isCurrent = planLabel === currentPlanName;
              const isStatic = isCurrent && !pendingPlanName;
              const sharedContent = (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150",
                      isSelected
                        ? "border-brand-primary dark:border-sky-400"
                        : "border-brand-hairline dark:border-slate-600",
                      isStatic && "opacity-40"
                    )}>
                      {isSelected && (
                        <div className="size-2 rounded-full bg-brand-primary dark:bg-sky-400" />
                      )}
                    </div>
                    <span className={cn(
                      "text-[11px] font-medium leading-tight truncate",
                      isSelected
                        ? "text-brand-primary dark:text-sky-400"
                        : "text-brand-ink dark:text-white",
                      isStatic && "text-brand-ink-mute dark:text-slate-500"
                    )}>
                      {planLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      "text-[11px] font-mono font-semibold tabular-nums",
                      isSelected && !isStatic
                        ? "text-brand-primary dark:text-sky-400"
                        : "text-brand-ink-mute dark:text-slate-400"
                    )}>
                      {formatDOP(Math.round(p.price_monthly * 100))}/mes
                    </span>
                    {isStatic && (
                      <span className="text-[9px] text-brand-ink-mute dark:text-slate-500 font-medium shrink-0">Actual</span>
                    )}
                    {isCurrent && pendingPlanName && (
                      <span className="text-[9px] text-brand-ink-mute dark:text-slate-400">Actual</span>
                    )}
                  </div>
                </>
              );
              if (isStatic) {
                return (
                  <div
                    key={p.name}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg opacity-40"
                  >
                    {sharedContent}
                  </div>
                );
              }
              return (
                <button
                  key={p.name}
                  type="button"
                  disabled={changingPlan}
                  onClick={() => {
                    if (isCurrent && pendingPlanName) {
                      onPlanSelect?.(null);
                    } else {
                      onPlanSelect?.(p.name);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all duration-150",
                    isSelected
                      ? "bg-brand-primary/8 dark:bg-sky-400/8"
                      : "hover:bg-brand-canvas-soft/50 dark:hover:bg-slate-800/50"
                  )}
                >
                  {sharedContent}
                </button>
              );
            })}
          {pendingPlanName && (
            <button
              type="button"
              onClick={() => onPlanSelect?.(null)}
              disabled={changingPlan}
              className="w-full text-center text-[10px] font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 py-1.5 rounded-lg hover:bg-red-500/5 transition-all duration-150"
            >
              Cancelar cambio
            </button>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasDetail && expanded && (
          <motion.div
            key="addon-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-brand-hairline dark:border-slate-800/60 pt-3">
              <AddonDetailPanel
                chargeType={item.type}
                addonDetail={addonDetail}
                onCancel={onCancel}
                cancelling={cancelling}
                onReactivate={onReactivate}
                reactivating={reactivating}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Charge Row (Simple ledger representation) ───────────────────────────────

interface ChargeRowProps {
  charge: any;
  paid?: boolean;
}

function ChargeRow({ charge, paid = false }: ChargeRowProps) {
  const Icon = ADDON_ICONS[charge.charge_type] ?? ReceiptText;

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      paid
        ? "border-brand-hairline dark:border-slate-800/60 opacity-75"
        : "border-amber-400/15 dark:border-amber-500/15 bg-amber-500/[0.03]",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            "size-8 rounded-lg flex items-center justify-center shrink-0",
            paid ? "bg-slate-100 dark:bg-slate-800" : "bg-amber-500/10"
          )}>
            <Icon className={cn("size-3.5", paid ? "text-brand-ink-mute dark:text-slate-400" : "text-amber-600 dark:text-amber-400")} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold text-brand-ink dark:text-slate-200 truncate">
              {charge.label || LABELS[charge.charge_type] || charge.charge_type}
            </p>
            <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
              {charge.quantity} × {formatDOP(charge.unit_price_cents)}
              {paid && charge.paid_at && (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-500">
                  <CalendarDays className="size-3" />
                  {formatDate(charge.paid_at)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "text-xs font-mono font-medium tabular-nums",
            paid ? "text-brand-ink dark:text-slate-350" : "text-amber-700 dark:text-amber-300"
          )}>
            {formatDOP(charge.total_price_cents)}
          </span>
          {paid ? (
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <div className="size-4 rounded-full border-2 border-amber-400 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── StatementTabContent (pure content block for AccountPage integration) ──

export function StatementTabContent() {
  const queryClient = useQueryClient();
  const [showPayForm, setShowPayForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cancellingType, setCancellingType] = useState<string | null>(null);
  const [reactivatingType, setReactivatingType] = useState<string | null>(null);

  const [payingCard, setPayingCard] = useState(false);
  const [payMonths, setPayMonths] = useState(1);
  const [selectedPlanName, setSelectedPlanName] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["statement"],
    queryFn: () => getStatement(),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ addonType, quantity }: { addonType: "entity_slot" | "user_slot" | "ai" | "storage"; quantity: number }) =>
      cancelAddon(addonType, quantity),
    onSuccess: (result) => {
      const labelMap: Record<string, string> = {
        entity_slot: "empresa(s) adicional(es)",
        user_slot: "usuario(s) adicional(es)",
        ai: "bloque(s) de IA",
        storage: "bloque(s) de almacenamiento",
      };
      toast.success(
        `${result.cancelled} ${labelMap[result.addon_type] ?? "addon(s)"} cancelado(s). Quedan ${result.remaining} activos.`,
        { description: "El cambio tomará efecto al inicio del próximo ciclo de facturación." }
      );
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
    },
    onError: (err: any) => {
      toast.error("No se pudo cancelar el addon", { description: err.message });
    },
    onSettled: () => setCancellingType(null),
  });

  const reactivateMutation = useMutation({
    mutationFn: ({ addonType, quantity }: { addonType: "entity_slot" | "user_slot" | "ai" | "storage"; quantity: number }) =>
      reactivateAddon(addonType, quantity),
    onSuccess: (result) => {
      const labelMap: Record<string, string> = {
        entity_slot: "empresa(s) adicional(es)",
        user_slot: "usuario(s) adicional(es)",
        ai: "bloque(s) de IA",
        storage: "bloque(s) de almacenamiento",
      };
      toast.success(
        `Cancelación revocada para ${result.reactivated} ${labelMap[result.addon_type] ?? "addon(s)"}.`,
        { description: "Tus slots seguirán facturándose y operando con normalidad." }
      );
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
    },
    onError: (err: any) => {
      toast.error("No se pudo reactivar el addon", { description: err.message });
    },
    onSettled: () => setReactivatingType(null),
  });

  function handleCancel(addonType: "entity_slot" | "user_slot" | "ai" | "storage", quantity: number) {
    setCancellingType(addonType);
    cancelMutation.mutate({ addonType, quantity });
  }

  function handleReactivate(addonType: "entity_slot" | "user_slot" | "ai" | "storage", quantity: number) {
    setReactivatingType(addonType);
    reactivateMutation.mutate({ addonType, quantity });
  }

  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
    staleTime: 5 * 60 * 1000,
  });

  // Sync selectedPlanName with pending_plan_name from server
  if (data?.pending_plan_name && !selectedPlanName) {
    setSelectedPlanName(data.pending_plan_name);
  }

  const planChangeMutation = useMutation({
    mutationFn: async (planName: string | null) => {
      setChangingPlan(true);
      const result = await setStatementPlanChange(planName, data?.cycle);
      return result;
    },
    onSuccess: (result) => {
      setSelectedPlanName(result.pending_plan_name ?? null);
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      if (result.pending_plan_name) {
        toast.success(`Plan cambiado a ${result.pending_plan_name} para el próximo ciclo.`);
      } else {
        toast.success("Cambio de plan cancelado.");
      }
    },
    onError: (err: any) => {
      toast.error("Error al cambiar de plan", { description: err.message });
    },
    onSettled: () => setChangingPlan(false),
  });

  async function handlePlanSelect(planName: string | null) {
    planChangeMutation.mutate(planName);
  }

  const DISCOUNT_TIERS: Record<number, number> = { 1: 0, 3: 0.03, 6: 0.05, 12: 0.10 };
  // During grace period, the monthly cost is driven by the subscription's net addon state
  // (always reflects pending cancels/reactivations without depending on charge reconciliation).
  // For non-grace, use actual unpaid charge total (includes mid-cycle purchases).
  const monthlyBase = data?.in_grace_period && data?.recurring?.total_cents
    ? data.recurring.total_cents
    : (data?.total_cents ?? 0);
  const discount = DISCOUNT_TIERS[payMonths] ?? 0;
  const adjustedTotal = payMonths > 1
    ? Math.round(monthlyBase * (1 - discount) * payMonths)
    : monthlyBase;

  async function handleCardPayment() {
    if (!data?.cycle) return;
    setPayingCard(true);
    try {
      const res = await payStatementCard(data.cycle, payMonths);
      if (res.checkout_url) {
        toast.info("Redirigiendo a la pasarela de pago MIO...");
        window.location.href = res.checkout_url;
      } else {
        toast.error("No se pudo obtener la URL de pago con tarjeta.");
      }
    } catch (err: any) {
      toast.error("Error al iniciar el pago con tarjeta", { description: err.message });
    } finally {
      setPayingCard(false);
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Debes adjuntar el comprobante de transferencia");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("plan_name", data?.plan_name || "Estado de cuenta");
      formData.append("amount", String(adjustedTotal / 100));
      formData.append("currency", "DOP");
      formData.append("notes", "Pago de estado de cuenta");
      formData.append("file", file);

      const proof = await uploadPaymentProof(formData);
      await payStatement(data!.cycle, proof.id, payMonths);

      toast.success("Comprobante enviado. Recibirás una notificación cuando sea verificado.");
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
      setShowPayForm(false);
      setFile(null);
    } catch (err: any) {
      toast.error("Error al registrar el pago", { description: err.message });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
        <div className="lg:col-span-7 space-y-4">
          <Skeleton className="h-[200px] w-full rounded-2xl animate-pulse" />
          <Skeleton className="h-[200px] w-full rounded-2xl animate-pulse" />
        </div>
        <div className="lg:col-span-5">
          <Skeleton className="h-[250px] w-full rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-5 border border-red-500/20 bg-red-500/5 text-red-500 rounded-2xl text-center text-xs">
        Ocurrió un error al obtener la información de tu estado de cuenta. Por favor, reintenta más tarde.
      </div>
    );
  }

  const paidCharges = data.charges.filter((c: any) => c.paid);
  const unpaidCharges = data.charges.filter((c: any) => !c.paid);
  const hasUnpaid = unpaidCharges.length > 0;
  const paidTotalCents = data.paid_total_cents ?? paidCharges.reduce((s: number, c: any) => s + c.total_price_cents, 0);
  const addonDetail = data.addon_detail;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Cycle summary banner */}
      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <ReceiptText className="size-4.5 text-brand-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-ink dark:text-white">{data.plan_name}</p>
            <p className="text-[11px] text-brand-ink-mute dark:text-slate-400">
              Ciclo {data.cycle}
              {data.next_billing_date && <> · próximo cobro {formatDate(data.next_billing_date)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {paidTotalCents > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">Pagado</p>
              <p className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatDOP(paidTotalCents)}</p>
            </div>
          )}
          {hasUnpaid && adjustedTotal > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">Pendiente</p>
              <p className="text-base font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {formatDOP(adjustedTotal)}
                {payMonths > 1 && <span className="text-[10px] font-normal text-amber-500/70 ml-1">({payMonths}m)</span>}
              </p>
            </div>
          )}
          {!hasUnpaid && adjustedTotal === 0 && paidTotalCents === 0 && (
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 text-[10px]">
              Sin cargos pendientes
            </Badge>
          )}
        </div>
      </div>

      {/* Grace period banner */}
      {data.in_grace_period && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300/40 dark:border-amber-700/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
          <Clock className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Período de gracia — tu ciclo de facturación ha finalizado
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
              Para seguir usando tu plan {data.plan_name}, realiza el pago de los cargos pendientes. 
              Puedes pagar con tarjeta o transferencia bancaria desde esta página.
            </p>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Plan, Recurring & Charges list */}
        <div className="lg:col-span-7 space-y-5">

          {/* UPCOMING CYCLE / RECURRING CHARGES CARD */}
          <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-brand-primary shrink-0" />
                <h3 className="text-sm font-semibold text-brand-ink dark:text-white leading-none">
                  Próximo ciclo de facturación
                </h3>
              </div>
              {data.next_billing_date && (
                <span className="text-xs text-brand-ink-mute dark:text-slate-400 font-medium">
                  Próximo cargo: {formatDate(data.next_billing_date)}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {data.recurring?.items && data.recurring.items.length > 0 ? (
                data.recurring.items.map((item: any, idx: number) => (
                  <RecurringRow
                    key={idx}
                    item={item}
                    addonDetail={addonDetail}
                    onCancel={handleCancel}
                    cancelling={cancellingType === ADDON_TYPE_MAP[item.type]}
                    onReactivate={handleReactivate}
                    reactivating={reactivatingType === ADDON_TYPE_MAP[item.type]}
                    plans={plans}
                    currentPlanName={data.plan_name}
                    pendingPlanName={data.pending_plan_name}
                    onPlanSelect={handlePlanSelect}
                    changingPlan={changingPlan}
                  />
                ))
              ) : (
                <div className="py-4 text-center text-xs text-brand-ink-mute dark:text-slate-500">
                  No hay cargos recurrentes programados.
                </div>
              )}
            </div>

            {data.recurring && data.recurring.total_cents > 0 && (
              <>
                <Separator className="bg-brand-hairline dark:bg-slate-800/60" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brand-ink-mute dark:text-slate-400">Total recurrente estimado</span>
                  <span className="text-sm font-mono font-bold text-brand-ink dark:text-slate-200 tabular-nums">
                    {formatDOP(data.recurring.total_cents)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Pending charges */}
          {unpaidCharges.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-amber-400/20 dark:border-amber-500/20 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-amber-500 shrink-0" />
                  <h3 className="text-sm font-semibold text-brand-ink dark:text-white leading-none">
                    Cargos pendientes de pago
                  </h3>
                </div>
                <Badge variant="outline" className="text-[10px] border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400">
                  {unpaidCharges.length} cargo{unpaidCharges.length > 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="space-y-2">
                {unpaidCharges.map((charge: any, idx: number) => (
                  <ChargeRow
                    key={charge.id || `pending-${idx}`}
                    charge={charge}
                    paid={false}
                  />
                ))}
              </div>
              <Separator className="bg-amber-400/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-brand-ink dark:text-white">
                  Total pendiente
                  {payMonths > 1 && <span className="text-[10px] font-normal text-brand-ink-mute dark:text-slate-400 ml-1.5">({payMonths} meses)</span>}
                </span>
                <span className="text-base font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatDOP(adjustedTotal)}
                </span>
              </div>
            </div>
          )}

          {/* Paid charges */}
          {paidCharges.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="size-4 text-emerald-500 shrink-0" />
                  <h3 className="text-sm font-semibold text-brand-ink dark:text-white leading-none">
                    Compras pagadas este ciclo
                  </h3>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 text-[10px]">
                  {paidCharges.length} pago{paidCharges.length > 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="space-y-2">
                {paidCharges.map((charge: any, idx: number) => (
                  <ChargeRow
                    key={charge.id || `paid-${idx}`}
                    charge={charge}
                    paid={true}
                  />
                ))}
              </div>
              {paidTotalCents > 0 && (
                <>
                  <Separator className="bg-brand-hairline dark:bg-slate-800/60" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-brand-ink-mute dark:text-slate-400">Total pagado este ciclo</span>
                    <span className="text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatDOP(paidTotalCents)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {paidCharges.length === 0 && unpaidCharges.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <CheckCircle2 className="size-9 text-emerald-500 mx-auto" />
              <p className="text-sm font-medium text-brand-ink dark:text-white">Sin cargos en este ciclo</p>
              <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                No se han registrado consumos adicionales en tu cuenta este mes.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Payment or status */}
        <div className="lg:col-span-5 space-y-5">
          {hasUnpaid && adjustedTotal > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-5">
              {!showPayForm ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-brand-ink dark:text-white">Liquidar saldo pendiente</h4>
                    <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                      Tienes cargos pendientes por un total de{" "}
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{formatDOP(monthlyBase)}</span>.
                      Elige tu método de pago preferido:
                    </p>
                  </div>

                  {/* Month selector — only when there's recurring cost */}
                  {(data?.recurring?.total_cents ?? 0) > 0 && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider">
                        Meses a pagar
                      </label>
                      <div className="flex gap-1.5">
                        {[1, 3, 6, 12].map((m) => {
                          const tierDiscount = DISCOUNT_TIERS[m] ?? 0;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPayMonths(m)}
                              className={cn(
                                "relative flex-1 h-9 text-xs font-semibold rounded-lg border transition-all duration-100",
                                payMonths === m
                                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-sky-400 dark:bg-sky-400/10 dark:text-sky-400"
                                  : "border-brand-hairline dark:border-slate-700 text-brand-ink-mute dark:text-slate-400 hover:border-brand-primary/50 dark:hover:border-sky-400/50"
                              )}
                            >
                              {m} {m === 1 ? "mes" : "meses"}
                              {tierDiscount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-1 rounded-md leading-tight">
                                  -{Math.round(tierDiscount * 100)}%
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {payMonths > 1 && (
                        <p className="text-[11px] text-brand-ink-mute dark:text-slate-400">
                          {data?.recurring?.items?.map((item: any, i: number) => (
                            <span key={i}>
                              {i > 0 && " + "}
                              {item.label}
                            </span>
                          )) ?? "Plan"} × {payMonths} meses
                          {discount > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                              ({(1 - discount) * 100}% del precio)
                            </span>
                          )}
                          <br />
                          Total a pagar:{" "}
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {formatDOP(adjustedTotal)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full h-11 text-sm font-semibold gap-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
                      onClick={handleCardPayment}
                      disabled={payingCard}
                    >
                      {payingCard ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                      Pagar con Tarjeta (5% recargo)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-sm font-semibold gap-1.5 rounded-xl border-brand-hairline active:scale-[0.98] transition-all duration-100"
                      onClick={() => setShowPayForm(true)}
                      disabled={payingCard}
                    >
                      <Upload className="size-4" />
                      Registrar transferencia bancaria
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePay} className="space-y-4 animate-in fade-in duration-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-ink-secondary dark:text-slate-350">
                    Comprobante de transferencia
                  </h4>
                  <div className={cn(
                    "relative rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                    file
                      ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-800/40 dark:bg-emerald-950/10"
                      : "border-brand-hairline hover:border-brand-primary/50 dark:border-slate-800 dark:hover:border-sky-400/50"
                  )}>
                    {file ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="size-6 text-emerald-500" />
                        <p className="text-xs font-medium text-brand-ink dark:text-white truncate max-w-[200px]">{file.name}</p>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="text-[10px] h-7 text-red-500 hover:bg-red-500/10 rounded-lg mt-1"
                          onClick={(e) => { e.preventDefault(); setFile(null); }}
                        >
                          <X className="size-3.5 mr-1" /> Quitar archivo
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer w-full h-full">
                        <Upload className="size-6 text-brand-ink-mute dark:text-slate-400" />
                        <p className="text-xs font-medium text-brand-ink dark:text-slate-200">Seleccionar comprobante</p>
                        <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">PNG, JPG o PDF · Máx. 10MB</p>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={(e) => setFile(e.target.files?.[0] || null)} />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button type="button" variant="outline"
                      className="h-11 px-7 text-sm font-semibold rounded-xl border-brand-hairline active:scale-[0.98] transition-all"
                      onClick={() => setShowPayForm(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit"
                      className="h-11 px-7 text-sm font-semibold gap-2 flex-1 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all"
                      disabled={uploading || !file}>
                      {uploading ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                      {uploading ? "Procesando..." : "Enviar comprobante"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : adjustedTotal === 0 && paidTotalCents === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 text-center space-y-3">
              <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
              <h4 className="text-xs font-semibold text-brand-ink dark:text-white">Sin cargos este ciclo</h4>
              <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                No hay consumos adicionales pendientes en este ciclo de facturación.
              </p>
            </div>
          ) : (
            <div className="bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-5 flex gap-3.5 items-start">
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Todo al día</p>
                <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                  Todos los consumos de este ciclo han sido pagados. ¡Gracias!
                </p>
              </div>
            </div>
          )}

          {/* Info note */}
          <div className="bg-brand-canvas-soft/20 dark:bg-slate-950/20 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-5 flex gap-3 items-start">
            <AlertCircle className="size-4 text-brand-primary shrink-0 mt-0.5" />
            <div className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal space-y-1.5">
              <p>
                Haz clic en el <span className="font-semibold text-brand-ink dark:text-slate-350">›</span> de los cargos recurrentes del Próximo Ciclo para ver dónde aplican los recursos y dar de baja los slots que ya no necesitas.
              </p>
              <p>
                La cancelación es efectiva al inicio del próximo mes. El recurso permanece activo por el resto del ciclo actual.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
