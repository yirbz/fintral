"use client";

import { useEffect, useRef, useState } from "react";
import { OrgProvider } from "@/hooks/use-org";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getMe } from "@/lib/api/session";
import { LogoLoader } from "@/components/logo-loader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import SessionExpiredOverlay from "@/components/session-expired-overlay";
import { MobileNav } from "@/components/mobile-nav";
import { ConnectionStatus } from "@/components/connection-status";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

const LOAD_TIMEOUT = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];

function isBackendUnreachable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (
    err && typeof err === "object" && "code" in err &&
    typeof (err as Record<string, unknown>).code === "string" &&
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/.test((err as Record<string, string>).code)
  ) return true;
  if (err instanceof Error && /Failed to fetch|NetworkError|ECONNREFUSED|fetch|timeout|abort|proxy|aggregate|abort/i.test(err.message)) return true;
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: number }).status;
    if (s === 401) return false;
    if (s >= 500) return true;
  }
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return false;
}

export function BillingShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const mountedRef = useRef(true);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attempt = () => {
    setConnectionFailed(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT);

    getMe(controller.signal)
      .then(() => {
        clearTimeout(timeout);
        if (mountedRef.current) setReady(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (!mountedRef.current) return;
        if (isBackendUnreachable(err) && retryCount.current < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount.current] ?? 4_000;
          retryCount.current++;
          retryTimer.current = setTimeout(attempt, delay);
          return;
        }
        if (isBackendUnreachable(err)) {
          setConnectionFailed(true);
        } else {
          window.location.href = "/logout";
        }
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    attempt();
    return () => {
      mountedRef.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready && !connectionFailed) return <LogoLoader />;

  if (!ready && connectionFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Algo salió mal
          </h1>
          <p className="max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
            Nuestro servidor no está respondiendo en este momento.
          </p>
        </div>
        <Button
          onClick={() => {
            retryCount.current = 0;
            attempt();
          }}
          size="sm"
          className="h-9 rounded-full px-5 text-xs font-medium"
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  return (
    <OrgProvider>
      <SidebarProvider
        className="billing-theme"
        style={
          {
            "--sidebar-width": "18rem",
            "--header-height": "4rem",
          } as React.CSSProperties
        }
      >
        <SessionExpiredOverlay />
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <ConnectionStatus />
          <div className="@container/main flex-1 py-4 md:py-6 has-mobile-nav">
            {children}
          </div>
          <PwaInstallPrompt />
        </SidebarInset>
        <MobileNav variant="billing" />
      </SidebarProvider>
    </OrgProvider>
  );
}
