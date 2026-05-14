"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeProvider } from "@/hooks/use-realtime";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getMe } from "@/lib/api/session";
import { LogoLoader } from "@/components/logo-loader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const LOAD_TIMEOUT = 3_000;

function isBackendUnreachable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string" &&
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/.test((err as Record<string, string>).code)
  ) return true;
  if (err instanceof Error && /Failed to fetch|NetworkError|ECONNREFUSED|fetch|timeout|abort|proxy|aggregate|No autorizado/i.test(err.message)) return true;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    if (status >= 500) return true;
  }
  return false;
}

function BotIllustration() {
  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-sm"
    >
      {/* Antenna */}
      <line x1="80" y1="28" x2="80" y2="42" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="80" cy="25" r="4" fill="#38BDF8">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Head — tilted slightly */}
      <g transform="rotate(-4, 80, 68)">
        <rect x="44" y="42" width="72" height="52" rx="12" fill="#E0F2FE" stroke="#7DD3FC" strokeWidth="2" />

        {/* Eyes — different sizes, one squinting */}
        <ellipse cx="62" cy="64" rx="6" ry="7" fill="#0EA5E9" />
        <ellipse cx="98" cy="64" rx="5" ry="7" fill="#0EA5E9" />
        <ellipse cx="62" cy="64" rx="2.5" ry="4" fill="#FAFAFA" opacity="0.9" />
        <ellipse cx="98" cy="64" rx="2" ry="3.5" fill="#FAFAFA" opacity="0.9" />

        {/* Eyebrows — worried/raised */}
        <path d="M54 56 Q62 52 70 56" stroke="#7DD3FC" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M90 55 Q98 51 106 55" stroke="#7DD3FC" strokeWidth="2" strokeLinecap="round" fill="none" />

        {/* Mouth — small "o" of uncertainty */}
        <ellipse cx="80" cy="80" rx="5" ry="4.5" stroke="#7DD3FC" strokeWidth="2" fill="#E0F2FE" />
      </g>

      {/* Body */}
      <rect x="50" y="98" width="60" height="40" rx="8" fill="#F0F9FF" stroke="#BAE6FD" strokeWidth="2" />

      {/* Chest light — rapid blink shows worry */}
      <circle cx="80" cy="118" r="5" fill="#38BDF8">
        <animate attributeName="opacity" values="1;0.2;1;1;0.2;1;1;1" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Arms — one scratching head, one limp */}
      {/* Left arm — raised to chin, thinking pose */}
      <rect x="26" y="94" width="22" height="8" rx="4" fill="#BAE6FD" transform="rotate(-35, 37, 98)" />
      {/* Right arm — hanging limp */}
      <rect x="112" y="106" width="22" height="8" rx="4" fill="#BAE6FD" transform="rotate(10, 123, 110)" />

      {/* Legs — slightly apart, uncertain stance */}
      <rect x="54" y="138" width="12" height="14" rx="4" fill="#BAE6FD" transform="rotate(5, 60, 145)" />
      <rect x="92" y="138" width="12" height="14" rx="4" fill="#BAE6FD" transform="rotate(-5, 98, 145)" />

      {/* Sweat drop */}
      <path d="M110 48 Q114 42 110 38 Q106 42 110 48Z" fill="#38BDF8" opacity="0.6">
        <animate attributeName="opacity" values="0;0.6;0" dur="4s" repeatCount="indefinite" />
      </path>

      {/* Floating question marks */}
      <text x="120" y="30" fontSize="13" fontWeight="700" fill="#0EA5E9" fontFamily="sans-serif" opacity="0.7">
        <animate attributeName="y" values="30;24;30" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2.5s" repeatCount="indefinite" />
        ?
      </text>
      <text x="106" y="22" fontSize="10" fontWeight="600" fill="#0EA5E9" fontFamily="sans-serif" opacity="0.4">
        <animate attributeName="y" values="22;16;22" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
        ?
      </text>
    </svg>
  );
}

export function ShellLoader({ children }: { children: React.ReactNode }) {
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
    return () => { mountedRef.current = false; };
  }, []);

  if (!ready && !connectionFailed) return <LogoLoader />;

  if (!ready && connectionFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
        <div className="relative">
          <div className="absolute -inset-10 rounded-full bg-sky-500/5 blur-3xl" />
          <BotIllustration />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Algo salió mal
          </h1>
          <p className="max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
            Nuestro servidor no está respondiendo en este momento.
            <br />
            No te preocupes — ya estamos trabajando en ello.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <Button
            onClick={attempt}
            size="sm"
            className="h-9 rounded-full px-5 text-xs font-medium shadow-xs transition-all hover:shadow-sm active:scale-[0.97]"
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Intentar de nuevo
          </Button>
          <p className="text-[11px] text-muted-foreground/60">
            Esto suele resolverse en segundos
          </p>
        </div>
      </div>
    );
  }

  return (
    <RealtimeProvider>
      <SidebarProvider
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
          <div className="@container/main flex flex-1 flex-col py-4 md:py-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RealtimeProvider>
  );
}
