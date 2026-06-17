"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Loader2,
  CheckCircle2,
  X,
  Info,
  Banknote,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadPaymentProof, getBankDetails } from "@/lib/api/plans";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartItem, BankDetails, CalculateCartResponse } from "@/lib/api/plans";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  total: number;
  currency: string;
  cartCalc: CalculateCartResponse | undefined;
  onSuccess: () => void;
}

export function CheckoutModal({
  open,
  onOpenChange,
  items,
  total,
  currency,
  cartCalc,
  onSuccess,
}: CheckoutModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: bankDetails } = useQuery({
    queryKey: ["bank-details"],
    queryFn: getBankDetails,
    staleTime: 1000 * 60 * 30,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Debes adjuntar el comprobante de transferencia");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("plan_name", items.find((i) => i.type === "plan_change")?.plan_name || "Personalizado");
      formData.append("amount", String(total));
      formData.append("currency", currency);
      formData.append("notes", notes);
      formData.append("items", JSON.stringify(items));
      formData.append("file", file);

      await uploadPaymentProof(formData);
      toast.success("Comprobante subido correctamente. Recibirás una notificación cuando sea verificado.");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      setFile(null);
      setNotes("");
      onSuccess();
    } catch (err: any) {
      toast.error("Error al subir comprobante", {
        description: err.message,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="size-4 text-primary" />
            Confirmar pago
          </DialogTitle>
          <DialogDescription className="text-xs">
            Revisa tu carrito y sube el comprobante de la transferencia bancaria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Resumen del carrito */}
          <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Resumen
            </p>
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate mr-2">
                  {item.label || item.type}
                  {(item.quantity ?? 1) > 1 ? ` x${item.quantity ?? 1}` : ""}
                </span>
                <span className="font-mono tabular-nums">
                  {((item.price_cents * (item.quantity ?? 1) * (item.months || 1)) / 100).toLocaleString("es-DO", {
                    style: "currency",
                    currency,
                  })}
                </span>
              </div>
            ))}
            {cartCalc && cartCalc.months > 1 && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                <span>{cartCalc.months} meses{cartCalc.discount > 0 ? ` · ${(cartCalc.discount * 100).toFixed(0)}% descuento` : ""}</span>
                <span className="font-mono tabular-nums">
                  {cartCalc.monthly_total.toLocaleString("es-DO", { style: "currency", currency })}/mes
                </span>
              </div>
            )}
            <Separator className="my-1.5" />
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Total a pagar</span>
              <span className="font-mono tabular-nums font-bold text-primary">
                {total.toLocaleString("es-DO", { style: "currency", currency })}
              </span>
            </div>
          </div>

          {/* Datos bancarios */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-900/30 dark:bg-sky-950/10 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Info className="size-3.5 text-sky-600 shrink-0" />
              <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                Transferencia bancaria
              </p>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p><span className="font-medium text-foreground">Banco:</span> {bankDetails?.bank_name || "Banco Popular Dominicano"}</p>
              <p><span className="font-medium text-foreground">Titular:</span> {bankDetails?.account_holder || "Fintral SRL"}</p>
              <p><span className="font-medium text-foreground">Cuenta:</span> {bankDetails?.account_number || "123-456789-01"}</p>
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                Transfiere el monto exacto y sube el comprobante aquí debajo.
              </p>
            </div>
          </div>

          {/* Adjuntar comprobante */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Comprobante de transferencia
            </Label>
            <div
              className={cn(
                "relative rounded-lg border-2 border-dashed p-5 text-center transition-colors",
                file
                  ? "border-green-400 bg-green-50/30 dark:border-green-800/40 dark:bg-green-950/10"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="size-5 text-green-500" />
                  <p className="text-xs font-medium text-foreground">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 text-muted-foreground"
                    onClick={() => setFile(null)}
                  >
                    <X className="size-3 mr-1" />
                    Quitar archivo
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Haz clic para seleccionar el comprobante
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    PNG, JPG o PDF · Máx 10MB
                  </p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notas (opcional)
            </Label>
            <Textarea
              placeholder="Referencia de la transferencia, número de confirmación..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[60px]"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
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
              type="submit"
              size="sm"
              className="text-xs h-8 gap-1.5"
              disabled={uploading || !file}
            >
              {uploading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Banknote className="size-3.5" />
              )}
              {uploading ? "Enviando..." : `Pagar ${total.toLocaleString("es-DO", { style: "currency", currency })}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
