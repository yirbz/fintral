"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Zap, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickInvoicePanel } from "@/features/billing/emit/quick-invoice-panel";
import { DetailedInvoiceWizard } from "@/features/billing/emit/detailed-invoice-wizard";
import { PendingInvoiceView } from "@/features/billing/emit/pending-invoice-view";
import type { EmitResult } from "@/lib/api/billing";

type ViewState =
  | { type: "form" }
  | { type: "pending"; result: EmitResult & { invoice: NonNullable<EmitResult["invoice"]> } };

export default function EmitInvoicePage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ type: "form" });
  const [mode, setMode] = useState<"quick" | "detailed">("quick");

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
        <Button variant="ghost" size="icon" onClick={() => router.push("/billing")} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Nueva factura electrónica</h1>
          <p className="text-sm text-muted-foreground">
            Emita un comprobante fiscal electrónico (e-CF) timbrado por la DGII
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "quick" | "detailed")}
        className="w-full shrink-0"
      >
        <TabsList className="w-[300px] grid grid-cols-2 h-10">
          <TabsTrigger value="quick" className="text-sm gap-2">
            <Zap className="size-4" />
            Rápida
            <span className="text-[10px] text-muted-foreground font-normal">POS</span>
          </TabsTrigger>
          <TabsTrigger value="detailed" className="text-sm gap-2">
            <Layers className="size-4" />
            Detallada
            <span className="text-[10px] text-muted-foreground font-normal">Asistente</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Panels — fill remaining height */}
      <div className="flex-1 min-h-0">
        {mode === "quick" ? (
          <QuickInvoicePanel onSuccess={handleSuccess} />
        ) : (
          <DetailedInvoiceWizard onSuccess={handleSuccess} />
        )}
      </div>
    </div>
  );
}
