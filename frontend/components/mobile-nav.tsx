"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { useOffline } from "@/components/offline-provider";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Bell,
  Menu,
  PlusCircle,
  FileCheck,
  RefreshCw,
} from "lucide-react";

interface MobileNavProps {
  variant: "dashboard" | "billing";
}

export function MobileNav({ variant }: MobileNavProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { pendingCount } = useOffline();

  // Active tab helper
  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/dashboard/";
    }
    if (path === "/billing") {
      return pathname === "/billing" || pathname === "/billing/";
    }
    return pathname.startsWith(path);
  };

  if (variant === "billing") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-border/40 bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom,0px)] shadow-lg transition-transform duration-300">
        <div className="flex h-16 items-center justify-around px-2">
          {/* Panel */}
          <Link
            href="/billing"
            className={cn(
              "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95",
              isActive("/billing") && !isActive("/billing/emit") && !isActive("/billing/invoices")
                ? "text-emerald-500 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px] mt-1">Panel</span>
          </Link>

          {/* Emitidas */}
          <Link
            href="/billing/invoices"
            className={cn(
              "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95",
              isActive("/billing/invoices")
                ? "text-emerald-500 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileCheck className="h-5 w-5" />
            <span className="text-[10px] mt-1">Emitidas</span>
          </Link>

          {/* Nueva (FAB) */}
          <Link
            href="/billing/emit"
            className={cn(
              "flex flex-col items-center justify-center -translate-y-4 shadow-md w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-200 active:scale-90 border-4 border-background"
            )}
          >
            <PlusCircle className="h-7 w-7" />
          </Link>

          {/* Sync */}
          <button
            onClick={() => {
              // Trigger sync overlay or open settings sync tab
              window.dispatchEvent(new CustomEvent("open-sync-panel"));
            }}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground"
            )}
          >
            <RefreshCw className="h-5 w-5" />
            <span className="text-[10px] mt-1">Sync</span>
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Más */}
          <button
            onClick={() => setOpenMobile(true)}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-lg text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] mt-1">Más</span>
          </button>
        </div>
      </div>
    );
  }

  // Dashboard variant
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-border/40 bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom,0px)] shadow-lg transition-transform duration-300">
      <div className="flex h-16 items-center justify-around px-2">
        {/* Panel */}
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95",
            isActive("/dashboard")
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] mt-1">Panel</span>
        </Link>

        {/* Facturas */}
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-5 w-5" />
          <span className="text-[10px] mt-1">Facturas</span>
        </Link>

        {/* DGII */}
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-5 w-5" />
          <span className="text-[10px] mt-1">DGII</span>
        </Link>

        {/* Alertas */}
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 active:scale-95 text-muted-foreground hover:text-foreground"
          )}
        >
          <Bell className="h-5 w-5" />
          <span className="text-[10px] mt-1">Alertas</span>
        </Link>

        {/* Más */}
        <button
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center justify-center w-12 h-12 rounded-lg text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] mt-1">Más</span>
        </button>
      </div>
    </div>
  );
}
