"use client";

import React from "react";
import { ShoppingCart, AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmAddonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  priceDopCents: number;
  onConfirm: () => void;
  isLoading?: boolean;
  confirmLabel?: string;
}

export function ConfirmAddonDialog({
  open,
  onOpenChange,
  label,
  priceDopCents,
  onConfirm,
  isLoading = false,
  confirmLabel = "Adquirir ahora",
}: ConfirmAddonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base font-medium text-brand-ink dark:text-white">
            <ShoppingCart className="size-5 text-brand-primary" />
            <span>Confirmar adquisición</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-brand-ink-mute dark:text-slate-400">
            Estás a punto de añadir capacidad extra a tu plan.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-xl border border-brand-hairline dark:border-slate-800 bg-brand-canvas-soft/40 dark:bg-slate-900/40 px-4 py-3">
            <span className="text-xs font-medium text-brand-ink-secondary dark:text-slate-300">
              {label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-brand-ink dark:text-white">
              RD$ {(priceDopCents / 100).toLocaleString("es-DO", { minimumFractionDigits: 0 })}/mes
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10 p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-400 leading-normal">
              Esta acción agregará un cobro recurrente a tu estado de cuenta mensual. Los complementos diferidos no requieren pago inmediato y se liquidarán en tu próximo período de cobro.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-row justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold gap-1.5 bg-brand-primary hover:bg-brand-primary-deep text-white active:scale-[0.98] transition-all duration-100"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            <span>{isLoading ? "Activando..." : confirmLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
