"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getTransactions, requestSubscriptionRefund, TransactionItem } from "@/lib/api/plans";
import { AccountNav } from "./components/account-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Calendar, CreditCard, ExternalLink, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PaymentsPage() {
  const session = useSession();
  const orgId = session.data?.organization?.id || "";

  const { data: transactions, isLoading, refetch } = useQuery<TransactionItem[]>({
    queryKey: ["transactions-my", orgId],
    queryFn: getTransactions,
    enabled: !!orgId,
  });

  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-DO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Format currency helper
  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: currency || "DOP",
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  };

  // Get status color helper for transactions
  const getStatusBadge = (tx: TransactionItem) => {
    const status = tx.status.toUpperCase();
    if (status === "SUCCESS" || status === "VERIFIED") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          Completado
        </span>
      );
    }
    if (status === "FAILED" || status === "REJECTED") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
          Fallido
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
        Pendiente
      </span>
    );
  };

  const handleRefundSubmit = async () => {
    if (!selectedTx?.db_id) return;
    if (!refundReason) {
      toast.error("Por favor seleccione un motivo para el reembolso");
      return;
    }
    setIsSubmittingRefund(true);
    try {
      const res = await requestSubscriptionRefund(selectedTx.db_id, refundReason, refundNotes);
      toast.success(res.message || "Solicitud de reembolso enviada con éxito");
      setSelectedTx(null);
      setRefundReason("");
      setRefundNotes("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Error al enviar la solicitud de reembolso");
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight">
          Mi Cuenta
        </h1>
        <p className="text-sm text-brand-ink-mute dark:text-slate-400">
          Revisa el historial completo de pagos y transferencias realizadas.
        </p>
      </div>

      <AccountNav />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            {!transactions || transactions.length === 0 ? (
              <div className="text-center py-16 px-4 space-y-4">
                <div className="p-4 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-16 mx-auto flex items-center justify-center">
                  <Receipt className="size-8" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                    No tienes pagos registrados
                  </h4>
                  <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-xs mx-auto leading-normal">
                    Aquí aparecerá el historial de tus transacciones con tarjeta y transferencias bancarias verificadas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-hairline dark:border-slate-800/60 bg-brand-canvas-soft dark:bg-slate-900/60 text-xs text-brand-ink-mute dark:text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-6">Fecha</th>
                      <th className="py-3.5 px-6">Detalle / Concepto</th>
                      <th className="py-3.5 px-6">Monto</th>
                      <th className="py-3.5 px-6">Estado</th>
                      <th className="py-3.5 px-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-hairline dark:divide-slate-800/40 text-sm">
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-brand-canvas-soft/40 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="py-4 px-6 text-brand-ink-secondary dark:text-slate-350 whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-brand-ink dark:text-slate-200">
                              {tx.description}
                            </p>
                            {tx.reference && (
                              <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-none">
                                Ref: {tx.reference}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium tabular-nums text-brand-ink dark:text-slate-250 whitespace-nowrap">
                          {formatAmount(tx.amount, tx.currency)}
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          {getStatusBadge(tx)}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {tx.type === "card" && tx.status.toUpperCase() === "SUCCESS" && (
                              <>
                                {tx.refund_requested ? (
                                  <span className="text-xs text-brand-ink-mute dark:text-slate-400 italic">
                                    Reembolso solicitado
                                  </span>
                                ) : (
                                  <Button
                                    variant="link"
                                    onClick={() => setSelectedTx(tx)}
                                    className="text-xs text-red-500 hover:text-red-700 p-0 h-auto font-semibold"
                                  >
                                    Reembolso
                                  </Button>
                                )}
                              </>
                            )}

                            {tx.receipt_url && (
                              <a
                                href={tx.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep transition-colors"
                              >
                                <span>Ver recibo</span>
                                <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refund request Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-brand-ink dark:text-white">
              Solicitar Reembolso
            </DialogTitle>
            <DialogDescription className="text-sm text-brand-ink-mute dark:text-slate-400">
              Proporciona los detalles del reembolso para el pago por valor de{" "}
              <strong className="text-brand-ink dark:text-slate-200">
                {selectedTx ? formatAmount(selectedTx.amount, selectedTx.currency) : ""}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-ink dark:text-slate-300">
                Motivo del Reembolso
              </label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-primary/20 transition-all"
              >
                <option value="">Seleccione un motivo...</option>
                <option value="Doble cargo accidental">Doble cargo accidental</option>
                <option value="Suscripción no deseada / Cargo sorpresa">Suscripción no deseada / Cargo sorpresa</option>
                <option value="Problemas técnicos con la plataforma">Problemas técnicos con la plataforma</option>
                <option value="Error al seleccionar el plan de suscripción">Error al seleccionar el plan de suscripción</option>
                <option value="Otro">Otro motivo (especifique abajo)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-ink dark:text-slate-300">
                Notas adicionales (opcional)
              </label>
              <textarea
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder="Por favor brinde más información sobre su solicitud..."
                className="w-full h-24 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-primary/20 transition-all resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedTx(null)}
              disabled={isSubmittingRefund}
              className="rounded-xl h-10 px-5 text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRefundSubmit}
              disabled={isSubmittingRefund || !refundReason}
              className="rounded-xl h-10 px-5 text-sm bg-brand-primary text-white hover:bg-brand-primary-deep"
            >
              {isSubmittingRefund ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  <span>Enviando...</span>
                </>
              ) : (
                <span>Enviar solicitud</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
