"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrgProvider } from "@/hooks/use-org";
import { CartProvider } from "@/features/store/cart-context";

import { SwRegister } from "@/components/sw-register";

function ThemeInit() {
  useEffect(() => {
    const stored = localStorage.getItem("theme") as string | null;
    const theme = stored || "system";

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);

      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        if (!localStorage.getItem("theme")) {
          document.documentElement.classList.toggle("dark", e.matches);
        }
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  return null;
}

import { OfflineProvider } from "@/components/offline-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 60 * 1000
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeInit />
        <SwRegister />
        <OrgProvider>
          <OfflineProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </OfflineProvider>
        </OrgProvider>
        <Toaster position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
