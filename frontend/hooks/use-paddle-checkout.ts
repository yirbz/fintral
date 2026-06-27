"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { initializePaddle, Paddle, PaddleEventData } from "@paddle/paddle-js";

export function usePaddleCheckout(token?: string, environment: "sandbox" | "production" = "sandbox") {
  const [paddle, setPaddle] = useState<Paddle | undefined>();
  const [isReady, setIsReady] = useState(false);

  // Use refs to store the callbacks so the global eventCallback always accesses the latest ones
  const callbacksRef = useRef<{
    onCompleted?: (transactionId: string) => void;
    onClosed?: () => void;
    onError?: (error: unknown) => void;
  }>({});

  useEffect(() => {
    const resolvedToken = token || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
    const resolvedEnv = token ? environment : (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as "sandbox" | "production") || "sandbox";

    console.log("[usePaddleCheckout] useEffect triggered.", {
      tokenPassed: token ? `${token.substring(0, 15)}...` : "none",
      resolvedToken: resolvedToken ? `${resolvedToken.substring(0, 15)}...` : "empty",
      resolvedEnv
    });

    if (!resolvedToken) {
      console.warn("[usePaddleCheckout] No token resolved. Skipping Paddle initialization.");
      return;
    }

    setIsReady(false);
    console.log("[usePaddleCheckout] Initializing Paddle.js...");
    initializePaddle({
      environment: resolvedEnv,
      token: resolvedToken,
      eventCallback: (event: PaddleEventData) => {
        console.log("[usePaddleCheckout] Event received:", event.name, event.data);
        // Access the current callbacks from the ref
        const { onCompleted, onClosed, onError } = callbacksRef.current;
        
        switch (event.name) {
          case "checkout.completed":
            onCompleted?.(event.data?.transaction_id ?? "");
            break;
          case "checkout.closed":
            onClosed?.();
            break;
          case "checkout.error":
          case "checkout.payment.failed":
            onError?.(event.data ?? event);
            break;
        }
      },
    }).then((instance) => {
      if (instance) {
        console.log("[usePaddleCheckout] Paddle initialized successfully!");
        setPaddle(instance);
        setIsReady(true);
      } else {
        console.error("[usePaddleCheckout] Paddle instance is undefined after initialization.");
      }
    }).catch((err) => {
      console.error("[usePaddleCheckout] Error initializing Paddle:", err);
    });
  }, [token, environment]);

  const openCheckout = useCallback(
    (opts: {
      priceId: string;
      customerId?: string;
      onCompleted?: (transactionId: string) => void;
      onClosed?: () => void;
      onError?: (error: unknown) => void;
    }) => {
      console.log("[usePaddleCheckout] openCheckout called.", {
        priceId: opts.priceId,
        customerId: opts.customerId,
        hasPaddleInstance: !!paddle
      });

      if (!paddle) {
        console.error("[usePaddleCheckout] openCheckout failed: Paddle instance is not initialized yet.");
        return;
      }

      // Store the callbacks in the ref
      callbacksRef.current = {
        onCompleted: opts.onCompleted,
        onClosed: opts.onClosed,
        onError: opts.onError,
      };

      paddle.Checkout.open({
        items: [{ priceId: opts.priceId, quantity: 1 }],
        ...(opts.customerId ? { customer: { id: opts.customerId } } : {}),
        settings: {
          displayMode: "overlay",
          theme: "light",
          locale: "es",
        },
      });
    },
    [paddle]
  );

  return { paddle, isReady, openCheckout };
}
