"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getMe } from "@/lib/api/session";
import { LogoLoader } from "@/components/logo-loader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const LOAD_TIMEOUT = 5_000;

function isBackendUnreachable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string" &&
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/.test(
      (err as Record<string, string>).code
    )
  )
    return true;
  if (
    err instanceof Error &&
    /Failed to fetch|NetworkError|ECONNREFUSED|fetch|timeout|abort|proxy|aggregate/i.test(
      err.message
    )
  )
    return true;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    if (status >= 500) return true;
  }
  return false;
}

export function BillingShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const mountedRef = useRef(true);

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
        if (isBackendUnreachable(err)) {
          setConnectionFailed(true);
        } else {
          window.location.href = "/login";
        }
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    attempt();
    return () => {
      mountedRef.current = false;
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
          onClick={attempt}
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
    <SidebarProvider
      className="billing-theme"
      style={
        {
          "--sidebar-width": "18rem",
          "--header-height": "4rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex-1 py-4 md:py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
