"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStatement, payStatement, uploadPaymentProof } from "@/lib/api/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle, Upload, Loader2, CreditCard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AccountNav } from "./components/account-nav";

const LABELS: Record<string, string> = {
  ai: "Bloques de Consultas IA",
  storage: "Almacenamiento Adicional",
  entity_slot: "Empresas Adicionales",
  user_slot: "Usuarios Adicionales",
  entity_slot_recurring: "Empresas Adicionales (Recurrente)",
  user_slot_recurring: "Usuarios Adicionales (Recurrente)",
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
      <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 animate-in fade-in duration-300">
        <Skeleton className="h-20 w-full rounded-2xl animate-pulse" />
        <Skeleton className="h-10 w-full rounded-xl animate-pulse" />
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 animate-in fade-in duration-300">
        <div className="space-y-1">
          <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight">Mi Cuenta</h1>
          <p className="text-sm text-brand-ink-mute dark:text-slate-400">Error al cargar el estado de cuenta.</p>
        </div>
        <AccountNav />
        <div className="p-5 border border-red-500/20 bg-red-500/5 text-red-500 rounded-2xl text-center text-xs">
          Ocurrió un error al obtener la información de tu estado de cuenta. Por favor, reintenta más tarde.
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
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight">
          Mi Cuenta
        </h1>
        <p className="text-sm text-brand-ink-mute dark:text-slate-400">
          Revisa y paga el estado de cuenta correspondiente a tus consumos mensuales.
        </p>
      </div>

      <AccountNav />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Charges list */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-brand-ink dark:text-white leading-none">
                  Cargos del período
                </h3>
                <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 mt-1">
                  {data.plan_name} · Ciclo {data.cycle}
                </p>
              </div>
              <Badge
                variant={hasUnpaid ? "outline" : "secondary"}
                className={cn(
                  "text-[10px] font-semibold",
                  hasUnpaid
                    ? "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10"
                )}
              >
                {hasUnpaid ? "Pago Pendiente" : "Completamente Pagado"}
              </Badge>
            </div>

            <div className="space-y-3">
              {data.charges.length === 0 ? (
                <div className="text-center py-10 px-4 space-y-2">
                  <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-medium text-brand-ink dark:text-white">Sin cargos en este ciclo</p>
                  <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                    No se han registrado consumos adicionales en tu cuenta.
                  </p>
                </div>
              ) : (
                data.charges.map((charge, idx) => (
                  <div
                    key={charge.id || `recurring-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-brand-hairline dark:border-slate-850/60 p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-semibold text-brand-ink dark:text-slate-200 truncate">
                        {charge.label || LABELS[charge.charge_type] || charge.charge_type}
                      </p>
                      <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 font-medium">
                        {charge.quantity} × RD$ {(charge.unit_price_cents / 100).toLocaleString("es-DO")}
                        {charge.is_recurring && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[9px] h-4.5 px-1.5 border-brand-primary/20 bg-brand-primary/5 text-brand-primary"
                          >
                            Recurrente
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono font-medium text-brand-ink dark:text-slate-250 tabular-nums">
                        RD$ {(charge.total_price_cents / 100).toLocaleString("es-DO")}
                      </span>
                      {charge.paid ? (
                        <CheckCircle2 className="size-4.5 text-emerald-500 shrink-0 animate-in fade-in" />
                      ) : (
                        <div className="size-4.5 rounded-full border-2 border-amber-400 shrink-0" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Separator className="bg-brand-hairline dark:bg-slate-800/60" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-brand-ink dark:text-white">Total</span>
              <span className="text-lg font-mono font-bold text-brand-primary dark:text-sky-400 tabular-nums">
                {totalFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Payment submission or details */}
        <div className="lg:col-span-5 space-y-6">
          {hasUnpaid && data.total_cents > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-5">
              {!showPayForm ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-brand-ink dark:text-white">¿Cómo pagar este saldo?</h4>
                    <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                      Realiza una transferencia bancaria y adjunta el comprobante para liquidar tu cuenta.
                    </p>
                  </div>
                  <Button
                    className="w-full h-11 py-3 px-7 min-w-[120px] text-sm font-semibold gap-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                    onClick={() => setShowPayForm(true)}
                  >
                    <CreditCard className="size-4" />
                    Registrar comprobante de pago
                  </Button>
                </div>
              ) : (
                <form onSubmit={handlePay} className="space-y-4 animate-in fade-in duration-200">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-ink-secondary dark:text-slate-350">
                    Comprobante de pago
                  </h4>

                  <div
                    className={cn(
                      "relative rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                      file
                        ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-800/40 dark:bg-emerald-950/10"
                        : "border-brand-hairline hover:border-brand-primary/50 dark:border-slate-800 dark:hover:border-sky-400/50 bg-brand-canvas-soft/10"
                    )}
                  >
                    {file ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="size-6 text-emerald-500" />
                        <p className="text-xs font-medium text-brand-ink dark:text-white truncate max-w-[200px]">
                          {file.name}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-7 text-red-500 hover:text-red-650 hover:bg-red-500/10 rounded-lg mt-1"
                          onClick={(e) => {
                            e.preventDefault();
                            setFile(null);
                          }}
                        >
                          <X className="size-3.5 mr-1" />
                          Quitar archivo
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer w-full h-full">
                        <Upload className="size-6 text-brand-ink-mute dark:text-slate-400" />
                        <p className="text-xs font-medium text-brand-ink dark:text-slate-200">
                          Seleccionar comprobante
                        </p>
                        <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                          PNG, JPG o PDF · Máx. 10MB
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

                  <div className="flex items-center gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 py-3 px-7 min-w-[120px] text-sm font-semibold rounded-xl border-brand-hairline active:scale-[0.98] transition-all duration-100"
                      onClick={() => setShowPayForm(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 py-3 px-7 min-w-[120px] text-sm font-semibold gap-2 flex-1 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                      disabled={uploading || !file}
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      {uploading ? "Procesando..." : `Enviar comprobante`}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : data.total_cents === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 text-center space-y-3">
              <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
              <h4 className="text-xs font-semibold text-brand-ink dark:text-white leading-none">
                Sin cargos pendientes
              </h4>
              <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                No hay cargos adicionales pendientes de liquidación en este ciclo de facturación.
              </p>
            </div>
          ) : (
            <div className="bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-5 flex gap-3.5 items-start">
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Estado de cuenta pagado
                </p>
                <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                  Todos los consumos y cargos de este ciclo se encuentran al día. ¡Gracias por tu puntualidad!
                </p>
              </div>
            </div>
          )}

          {/* Info note */}
          <div className="bg-brand-canvas-soft/20 dark:bg-slate-950/20 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-5 flex gap-3 items-start">
            <AlertCircle className="size-4 text-brand-primary shrink-0 mt-0.5" />
            <div className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal space-y-1.5">
              <p>
                Los cargos por concepto de consultas IA, almacenamiento extra y Slots de Empresas/Usuarios adicionales se computan en tu saldo diferido y se consolidan en tu estado de cuenta mensual.
              </p>
              <p>
                Recibirás una notificación por correo electrónico el primer día del mes para conciliar tu saldo pendiente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
