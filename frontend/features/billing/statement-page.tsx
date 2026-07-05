"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStatement, payStatement, type StatementResponse } from "@/lib/api/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Loader2,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadPaymentProof } from "@/lib/api/plans";

const LABELS: Record<string, string> = {
  ai: "Bloques IA",
  storage: "Almacenamiento",
  entity_slot: "Slots de entidad",
  user_slot: "Slots de usuario",
  entity_slot_recurring: "Slots de entidad (recurrente)",
  user_slot_recurring: "Slots de usuario (recurrente)",
};

export function StatementPage() {
  const queryClient = useQueryClient();
  const [showPayForm, setShowPayForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["statement"],
    queryFn: () => getStatement(),
  });

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
      formData.append("amount", String((data?.total_cents ?? 0) / 100));
      formData.append("currency", "DOP");
      formData.append("notes", "Pago de estado de cuenta");
      formData.append("file", file);

      const proof = await uploadPaymentProof(formData);
      await payStatement(data!.cycle, proof.id);

      toast.success("Estado de cuenta pagado. Recibirás una notificación cuando sea verificado.");
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
      setShowPayForm(false);
      setFile(null);
    } catch (err: any) {
      toast.error("Error al pagar estado de cuenta", { description: err.message });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h1 className="text-lg font-heading font-semibold text-foreground">Estado de Cuenta</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Error al cargar el estado de cuenta.</p>
        </div>
      </div>
    );
  }

  const totalFormatted = (data.total_cents / 100).toLocaleString("es-DO", {
    style: "currency",
    currency: "DOP",
  });

  const hasUnpaid = data.charges.some((c) => !c.paid);

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">Facturación</p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">
            Estado de Cuenta
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.plan_name} · Ciclo {data.cycle}
          </p>
        </div>
      </div>

      {/* Charges list */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Cargos del ciclo</h2>
          <Badge variant={hasUnpaid ? "outline" : "secondary"} className="text-[10px]">
            {hasUnpaid ? "Pendiente" : "Pagado"}
          </Badge>
        </div>

        <div className="space-y-2">
          {data.charges.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No hay cargos en este ciclo.
            </p>
          ) : (
            data.charges.map((charge, idx) => (
              <div
                key={charge.id || `recurring-${idx}`}
                className="flex items-center justify-between rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {charge.label || LABELS[charge.charge_type] || charge.charge_type}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {charge.quantity} × RD$ {(charge.unit_price_cents / 100).toFixed(2)}
                    {charge.is_recurring && (
                      <Badge variant="outline" className="ml-1.5 text-[8px] h-3.5 px-1">
                        recurrente
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono tabular-nums">
                    RD$ {(charge.total_price_cents / 100).toFixed(2)}
                  </span>
                  {charge.paid ? (
                    <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                  ) : (
                    <div className="size-3.5 rounded-full border-2 border-amber-400 shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-sm font-mono tabular-nums font-bold text-primary">
            {totalFormatted}
          </span>
        </div>
      </div>

      {/* Pay button or paid state */}
      {hasUnpaid && data.total_cents > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-5">
          {showPayForm ? (
            <form onSubmit={handlePay} className="space-y-4">
              <h3 className="text-xs font-semibold text-foreground">Pagar estado de cuenta</h3>

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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 text-muted-foreground"
                      onClick={() => setFile(null)}
                    >
                      Quitar archivo
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 cursor-pointer">
                    <FileUp className="size-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Subir comprobante de pago</p>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setShowPayForm(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs h-8 gap-1.5 flex-1"
                  disabled={uploading || !file}
                >
                  {uploading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CreditCard className="size-3.5" />
                  )}
                  {uploading
                    ? "Enviando..."
                    : `Pagar ${totalFormatted}`}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              size="sm"
              className="w-full text-xs h-8 gap-1.5"
              onClick={() => setShowPayForm(true)}
            >
              <CreditCard className="size-3.5" />
              Pagar estado de cuenta
            </Button>
          )}
        </div>
      ) : data.total_cents === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 text-center">
          <CheckCircle2 className="size-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Sin cargos pendientes</p>
          <p className="text-xs text-muted-foreground mt-1">
            No hay cargos adicionales en este ciclo.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10 p-5 flex items-center gap-3">
          <CheckCircle2 className="size-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Estado de cuenta pagado
            </p>
            <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
              Todos los cargos de este ciclo están al día.
            </p>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-900/30 dark:bg-sky-950/10 p-4 flex items-start gap-2">
        <AlertCircle className="size-4 text-sky-600 shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground space-y-1">
          <p>
            Los cargos por concepto de bloques IA, almacenamiento, slots de entidad y slots de
            usuario se agregan automáticamente a tu estado de cuenta mensual.
          </p>
          <p>
            El pago se realiza mediante transferencia bancaria. Una vez verificado, los cargos se
            marcan como pagados.
          </p>
        </div>
      </div>
    </div>
  );
}
