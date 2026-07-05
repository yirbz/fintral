"use client";

import { useState, useEffect, useCallback } from "react";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { getPaymentProofs, type PaymentProof } from "@/lib/api/plans";

export function PaymentStatusBanner() {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("fintral_dismissed_payment_banners");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          "fintral_dismissed_payment_banners",
          JSON.stringify([...next])
        );
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    getPaymentProofs()
      .then((data) => setProofs(data))
      .catch(() => {});
  }, []);

  const nonPending = proofs.filter(
    (p) => p.status !== "pending" && !dismissedIds.has(p.id)
  );

  if (nonPending.length === 0) return null;

  return (
    <div className="space-y-2">
      {nonPending.map((proof) => {
        const isVerified = proof.status === "verified";
        return (
          <div
            key={proof.id}
            className={`relative flex items-start gap-3 rounded-xl border p-4 pr-10 text-sm ${
              isVerified
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            }`}
          >
            {isVerified ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">
                {isVerified
                  ? "Pago verificado"
                  : "Pago rechazado"}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                {isVerified
                  ? "Tu transferencia bancaria ha sido verificada. Todos tus servicios están activos."
                  : `Tu transferencia no pudo ser verificada.${proof.admin_notes ? ` Motivo: ${proof.admin_notes}` : ""}`}
              </p>
              {proof.amount && (
                <p className="text-xs font-medium mt-1 opacity-70">
                  {proof.currency || "DOP"} {proof.amount.toLocaleString("es-DO", { minimumFractionDigits: 2 })} —{" "}
                  {new Date(proof.created_at).toLocaleDateString("es-DO")}
                </p>
              )}
            </div>
            <button
              onClick={() => dismiss(proof.id)}
              className="absolute right-3 top-3 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
