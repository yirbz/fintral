"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DetailedInvoiceWizard } from "@/features/billing/emit/detailed-invoice-wizard";
import { PendingInvoiceView } from "@/features/billing/emit/pending-invoice-view";
import type { EmitResult } from "@/lib/api/billing";

type ViewState =
  | { type: "form" }
  | { type: "pending"; result: EmitResult & { invoice: NonNullable<EmitResult["invoice"]> } };

const ACTION_LABELS: Record<string, { title: string; description: string }> = {
  credit_note: {
    title: "Nota de Crédito (E34)",
    description: "Emite una Nota de Crédito electrónica para anular o reducir el monto de un comprobante ya timbrado",
  },
  debit_note: {
    title: "Nota de Débito (E33)",
    description: "Emite una Nota de Débito electrónica para incrementar el monto de un comprobante ya timbrado",
  },
};

export default function EmitInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewState>({ type: "form" });

  const sourceInvoiceId = searchParams.get("invoiceId");
  const sourceAction = searchParams.get("action");

  const actionLabel = sourceAction ? ACTION_LABELS[sourceAction] : null;

  const handleSuccess = (result: EmitResult) => {
    if (result.status === "pending" && result.invoice?.id) {
      setView({ type: "pending", result: result as EmitResult & { invoice: NonNullable<EmitResult["invoice"]> } });
    } else if (result.status === "verified" && result.invoice?.id) {
      const invoiceId = result.invoice.id;
      setTimeout(() => router.push(`/billing/invoices/${invoiceId}/print`), 1500);
    }
  };

  const handleBackToForm = () => {
    setView({ type: "form" });
  };

  if (view.type === "pending") {
    return (
      <div className="h-full w-full flex flex-col gap-6 p-6 lg:px-8 lg:py-8">
        <Button variant="ghost" size="icon" onClick={handleBackToForm} className="shrink-0 self-start">
          <ArrowLeft className="size-4" />
        </Button>
        <PendingInvoiceView result={view.result} onBack={handleBackToForm} />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col gap-6 p-6 lg:px-8 lg:py-8">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => (window.history.length > 1 ? router.back() : router.push("/billing"))} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            {actionLabel?.title ?? "Nueva factura electrónica"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {actionLabel?.description ?? "Emita un comprobante fiscal electrónico (e-CF) timbrado por la DGII"}
          </p>
        </div>
      </div>

      {/* Invoice wizard — fill remaining height */}
      <div className="flex-1 min-h-0">
        <DetailedInvoiceWizard
          onSuccess={handleSuccess}
          sourceInvoiceId={sourceInvoiceId ?? undefined}
          sourceAction={sourceAction ?? undefined}
        />
      </div>
    </div>
  );
}
