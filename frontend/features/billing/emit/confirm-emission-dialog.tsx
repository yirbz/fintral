"use client";

import { AlertTriangle, Calculator, UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RiskFactor {
  type: "high_amount" | "unregistered_buyer";
  label: string;
  description: string;
}

interface ConfirmEmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  totalAmount: number;
  hasUnregisteredBuyer: boolean;
}

export function ConfirmEmissionDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  totalAmount,
  hasUnregisteredBuyer,
}: ConfirmEmissionDialogProps) {
  const risks: RiskFactor[] = [];
  if (totalAmount >= 250_000) {
    risks.push({
      type: "high_amount",
      label: "Monto ≥ RD$250,000",
      description: "Este comprobante será procesado de forma asíncrona por la DGII. Recibirá una notificación cuando esté aprobado.",
    });
  }
  if (hasUnregisteredBuyer) {
    risks.push({
      type: "unregistered_buyer",
      label: "Comprador no registrado",
      description: "El comprador se registrará automáticamente en su lista de clientes al emitir la factura.",
    });
  }

  if (risks.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <AlertTriangle className="size-5 text-amber-600" />
          </div>
          <DialogTitle>Confirmar emisión</DialogTitle>
          <DialogDescription>
            Revise los siguientes puntos antes de emitir el comprobante.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {risks.map((risk) => (
            <div key={risk.type} className="flex gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              {risk.type === "high_amount" ? (
                <Calculator className="size-4 shrink-0 mt-0.5 text-amber-600" />
              ) : (
                <UserPlus className="size-4 shrink-0 mt-0.5 text-blue-600" />
              )}
              <div>
                <p className="font-medium">{risk.label}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{risk.description}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? "Emitiendo..." : "Confirmar y emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
