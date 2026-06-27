"use client";

import { Button } from "@/components/ui/button";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface PaddleCheckoutProps {
  planName: string;
  priceId: string;
  orgId?: string;
  customerId?: string;
  clientToken?: string;
  environment?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function PaddleCheckoutButton({
  priceId,
  orgId,
  customerId,
  clientToken,
  environment,
  disabled,
  onSuccess,
}: PaddleCheckoutProps) {
  const { isReady, openCheckout } = usePaddleCheckout(
    clientToken,
    (environment as "sandbox" | "production") || "sandbox"
  );
  const [pending, setPending] = useState(false);

  const handleClick = useCallback(async () => {
    setPending(true);

    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && orgId) {
      try {
        const res = await fetch(`/api/paddle/checkout-settings?org_id=${orgId}`);
        const data = await res.json();
        resolvedCustomerId = data.customer_id ?? undefined;
      } catch {
        // proceed without customer_id
      }
    }

    openCheckout({
      priceId,
      customerId: resolvedCustomerId,
      onCompleted: () => {
        toast.success("Pago procesado correctamente. Tu suscripción se activará en unos segundos.");
        setPending(false);
        onSuccess?.();
      },
      onClosed: () => setPending(false),
      onError: (err) => {
        logger.error("Paddle checkout error", err);
        toast.error("Ocurrió un error al procesar el pago");
        setPending(false);
      },
    });
  }, [priceId, orgId, customerId, openCheckout, onSuccess]);

  return (
    <Button
      onClick={handleClick}
      disabled={!isReady || pending || disabled}
      className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
    >
      {pending ? "Abriendo checkout..." : "Pagar con Tarjeta"}
    </Button>
  );
}

// Simple browser console logger fallback
const logger = {
  error: (...args: any[]) => {
    console.error("[PaddleCheckout]", ...args);
  }
};
