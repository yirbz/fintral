"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, CheckCircle2, XCircle, ExternalLink, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { billingApi, type EmitResult } from "@/lib/api/billing";

interface PendingInvoiceViewProps {
  result: EmitResult & { invoice: NonNullable<EmitResult["invoice"]> };
  onBack: () => void;
}

const POLL_INTERVAL = 5_000;

export function PendingInvoiceView({ result, onBack }: PendingInvoiceViewProps) {
  const invoiceId = result.invoice.id;
  const [elapsed, setElapsed] = useState(0);

  const { data: invoice } = useQuery({
    queryKey: ["billing-invoice", invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "verified" || status === "rejected") return false;
      return POLL_INTERVAL;
    },
    initialData: result.invoice,
  });

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const isVerified = invoice?.status === "verified";
  const isRejected = invoice?.status === "rejected";
  const isStillPending = !isVerified && !isRejected;

  useEffect(() => {
    if (isVerified && invoiceId) {
      const existing = document.getElementById("print-iframe-pending");
      if (existing) {
        existing.remove();
      }
      const iframe = document.createElement("iframe");
      iframe.id = "print-iframe-pending";
      iframe.style.position = "absolute";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      iframe.src = `/billing/invoices/${invoiceId}/print?auto=true`;
      document.body.appendChild(iframe);

      const handleMessage = (e: MessageEvent) => {
        if (e.data && e.data.type === "printed") {
          iframe.remove();
          window.removeEventListener("message", handleMessage);
        }
      };
      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
        const frame = document.getElementById("print-iframe-pending");
        if (frame) frame.remove();
      };
    }
  }, [isVerified, invoiceId]);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-6 max-w-md mx-auto text-center">
      {isVerified ? (
        <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="size-8 text-emerald-600" />
        </div>
      ) : isRejected ? (
        <div className="size-16 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="size-8 text-red-600" />
        </div>
      ) : (
        <div className="size-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="size-8 text-amber-600" />
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          {isVerified
            ? "Comprobante aprobado"
            : isRejected
              ? "Comprobante rechazado"
              : "Procesando comprobante"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {isVerified
            ? "La DGII ha aprobado el comprobante electrónico. Ya puede descargarlo e imprimirlo."
            : isRejected
              ? "La DGII rechazó el comprobante. Verifique los datos fiscales e intente nuevamente."
              : "El comprobante fue enviado a la DGII para procesamiento asíncrono. Esto puede tomar varios minutos."}
        </p>
      </div>

      {isStillPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Verificando... {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
        </div>
      )}

      <div className="flex items-center gap-3">
        {isVerified && (
          <Button onClick={() => window.open(`/billing/invoices/${invoiceId}/print`, "_blank")}>
            <ExternalLink className="size-3.5 mr-1.5" />
            Ver comprobante
          </Button>
        )}
        {isRejected && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-3.5 mr-1.5" />
            Corregir y reintentar
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Volver
        </Button>
      </div>
    </div>
  );
}
