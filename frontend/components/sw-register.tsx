"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    // Skip service worker registration in development mode to avoid conflicts with Fast Refresh
    if (process.env.NODE_ENV === "development") {
      return;
    }

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerServiceWorker = async () => {
        try {
          const reg = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          });
          console.log("Service Worker registered successfully with scope:", reg.scope);

          // Handle message events from Service Worker
          navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data && event.data.type === "SYNC_INVOICES") {
              console.log("SW requested syncing offline invoices");
              // Dispatch custom event for sync manager / offline sync hook
              window.dispatchEvent(new CustomEvent("sync-invoices-trigger"));
            }
          });
        } catch (error) {
          console.error("Service Worker registration failed:", error);
        }
      };

      // Register only after page load
      if (document.readyState === "complete") {
        registerServiceWorker();
      } else {
        window.addEventListener("load", registerServiceWorker);
        return () => window.removeEventListener("load", registerServiceWorker);
      }
    }
  }, []);

  return null;
}
