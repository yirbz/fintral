"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { getPaymentProofs, PaymentProof } from "@/lib/api/plans";
import { AccountNav } from "./components/account-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Calendar, CreditCard, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaymentsPage() {
  const session = useSession();
  const orgId = session.data?.organization?.id || "";

  const { data: proofs, isLoading } = useQuery<PaymentProof[]>({
    queryKey: ["payment-proofs-my", orgId],
    queryFn: getPaymentProofs,
    enabled: !!orgId,
  });

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

  // Get status color helper for payment proofs
  const getProofStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            Verificado
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
            Rechazado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            Pendiente
          </span>
        );
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
            {!proofs || proofs.length === 0 ? (
              <div className="text-center py-16 px-4 space-y-4">
                <div className="p-4 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-16 mx-auto flex items-center justify-center">
                  <Receipt className="size-8" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                    No tienes pagos registrados
                  </h4>
                  <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-xs mx-auto leading-normal">
                    Aquí aparecerá el historial de tus transferencias y comprobantes de pago verificados.
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
                      <th className="py-3.5 px-6 text-right">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-hairline dark:divide-slate-800/40 text-sm">
                    {proofs.map((proof) => (
                      <tr
                        key={proof.id}
                        className="hover:bg-brand-canvas-soft/40 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="py-4 px-6 text-brand-ink-secondary dark:text-slate-350 whitespace-nowrap">
                          {formatDate(proof.created_at)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-brand-ink dark:text-slate-200">
                              Plan {proof.plan_name}
                            </p>
                            {proof.notes && (
                              <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal max-w-sm truncate">
                                {proof.notes}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium tabular-nums text-brand-ink dark:text-slate-250 whitespace-nowrap">
                          <div>{formatAmount(proof.amount, proof.currency)}</div>
                          {proof.usd_amount && (
                            <div className="text-[10px] text-brand-ink-mute dark:text-slate-400 font-normal">
                              (${proof.usd_amount.toFixed(2)} USD @ {proof.exchange_rate?.toFixed(2)})
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          {getProofStatusBadge(proof.status)}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <a
                            href={proof.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep transition-colors"
                          >
                            <span>Ver archivo</span>
                            <ExternalLink className="size-3" />
                          </a>
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
    </div>
  );
}
