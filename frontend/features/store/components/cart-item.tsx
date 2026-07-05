"use client";

import React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { CartItemState } from "../cart-context";

const ITEM_LABELS: Record<string, string> = {
  plan_change: "Cambio de plan",
  addon: "Bloque adicional",
  renewal: "Renovación",
  overage: "Pago por uso",
  ecf_blocks: "Documentos e-CF",
  entity_slot: "Slot de empresa",
  user_slot: "Slot de usuario",
};

interface CartItemProps {
  item: CartItemState;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}

export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
}: CartItemProps) {
  // Format currency helper
  const formatAmount = (cents: number) => {
    return (cents / 100).toLocaleString("es-DO", {
      style: "currency",
      currency: "DOP",
      minimumFractionDigits: 0,
    });
  };

  return (
    <div className="flex items-start justify-between rounded-xl border border-brand-hairline dark:border-slate-800 bg-white dark:bg-slate-900 p-4 gap-3 transition-shadow hover:shadow-xs">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold text-brand-ink dark:text-white truncate">
          {item.label}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-brand-ink-mute dark:text-slate-400">
          <span className="font-medium bg-brand-canvas-soft dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {ITEM_LABELS[item.type] || item.type}
          </span>
          {item.months && (
            <span>· {item.months} mes{item.months > 1 ? "es" : ""}</span>
          )}
        </div>
        <p className="text-[10px] font-mono text-brand-ink-mute/70 dark:text-slate-500 tabular-nums">
          {formatAmount(item.price_cents)} /mes
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 select-none">
        {/* Decrease button */}
        <button
          type="button"
          onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
          className="size-6 rounded-lg border border-brand-hairline dark:border-slate-700 flex items-center justify-center hover:bg-brand-canvas-soft dark:hover:bg-slate-800 text-brand-ink-secondary dark:text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors duration-100"
          disabled={item.quantity <= 1}
        >
          <Minus className="size-3" />
        </button>

        {/* Quantity display */}
        <span className="font-mono text-xs font-semibold tabular-nums w-5 text-center text-brand-ink dark:text-white">
          {item.quantity}
        </span>

        {/* Increase button */}
        <button
          type="button"
          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
          className="size-6 rounded-lg border border-brand-hairline dark:border-slate-700 flex items-center justify-center hover:bg-brand-canvas-soft dark:hover:bg-slate-800 text-brand-ink-secondary dark:text-slate-300 transition-colors duration-100"
        >
          <Plus className="size-3" />
        </button>

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="size-6 rounded-lg border border-brand-hairline dark:border-slate-700 flex items-center justify-center hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-brand-ink-mute/60 transition-colors duration-100 ml-1"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
