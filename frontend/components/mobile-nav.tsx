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
  Menu,
  PlusCircle,
  FileCheck,
  RefreshCw,
  Upload,
  Package,
} from "lucide-react";

interface MobileNavProps {
  variant: "dashboard" | "billing";
}

export function MobileNav({ variant }: MobileNavProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { pendingCount } = useOffline();
  const [isBillingSubdomain, setIsBillingSubdomain] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setIsBillingSubdomain(window.location.hostname.startsWith("factura."));
    }
  }, []);

  const getBillingLink = (path: string) => {
    return isBillingSubdomain ? path : `/billing${path === "/" ? "" : path}`;
  };

  const isBillingActive = (path: string) => {
    const resolved = getBillingLink(path);
    if (resolved === "/" || resolved === "/billing") {
      return pathname === resolved || pathname === resolved + "/";
    }
    return pathname.startsWith(resolved);
  };

  // Active tab helper for dashboard
  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/dashboard/";
    }
    return pathname.startsWith(path);
  };

  if (variant === "billing") {
    const isRootActive = isBillingActive("/");
    const isProductsActive = isBillingActive("/products");
    
    return (
      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 lg:hidden border border-border/40 bg-background/80 backdrop-blur-md rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 h-16">
        <div className="flex h-full items-center justify-around px-2 relative">
          {/* Panel */}
          <Link
            href={getBillingLink("/")}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95",
              isRootActive
                ? "text-emerald-500 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[9px] mt-0.5 tracking-tight">Panel</span>
            <span className={cn(
              "absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-500 transition-all duration-300 ease-out",
              isRootActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-1"
            )} />
          </Link>

          {/* Productos */}
          <Link
            href={getBillingLink("/products")}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95",
              isProductsActive
                ? "text-emerald-500 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="h-5 w-5" />
            <span className="text-[9px] mt-0.5 tracking-tight">Productos</span>
            <span className={cn(
              "absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-500 transition-all duration-300 ease-out",
              isProductsActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-1"
            )} />
          </Link>

          {/* Nueva (FAB) */}
          <Link
            href={getBillingLink("/quick")}
            className={cn(
              "flex flex-col items-center justify-center -translate-y-5 shadow-md w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-150 active:scale-90 border-4 border-background"
            )}
            title="Nueva Factura"
          >
            <PlusCircle className="h-7 w-7" />
          </Link>

          {/* Sync */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-sync-panel"));
            }}
            className={cn(
              "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95 text-muted-foreground hover:text-foreground"
            )}
          >
            <RefreshCw className="h-5 w-5" />
            <span className="text-[9px] mt-0.5 tracking-tight">Sync</span>
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Más */}
          <button
            onClick={() => setOpenMobile(true)}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[9px] mt-0.5 tracking-tight">Más</span>
          </button>
        </div>
      </div>
    );
  }

  // Dashboard variant
  const isDashboardRootActive = isActive("/dashboard") && !isActive("/dashboard/invoices") && !isActive("/dashboard/dgii") && !isActive("/dashboard/upload");
  const isInvoicesActive = isActive("/dashboard/invoices");
  const isDgiiActive = isActive("/dashboard/dgii");

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 lg:hidden border border-border/40 bg-background/80 backdrop-blur-md rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 h-16">
      <div className="flex h-full items-center justify-around px-2 relative">
        {/* Panel */}
        <Link
          href="/dashboard"
          className={cn(
            "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95",
            isDashboardRootActive
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[9px] mt-0.5 tracking-tight">Panel</span>
          <span className={cn(
            "absolute bottom-0.5 w-1 h-1 rounded-full bg-primary transition-all duration-300 ease-out",
            isDashboardRootActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-1"
            )} />
        </Link>

        {/* Facturas */}
        <Link
          href="/dashboard/invoices"
          className={cn(
            "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95",
            isInvoicesActive
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-5 w-5" />
          <span className="text-[9px] mt-0.5 tracking-tight">Facturas</span>
          <span className={cn(
            "absolute bottom-0.5 w-1 h-1 rounded-full bg-primary transition-all duration-300 ease-out",
            isInvoicesActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-1"
          )} />
        </Link>

        {/* Capturar (FAB) */}
        <Link
          href="/dashboard/upload"
          className={cn(
            "flex flex-col items-center justify-center -translate-y-5 shadow-md w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-150 active:scale-90 border-4 border-background"
          )}
          title="Subir Factura"
        >
          <Upload className="h-5 w-5" />
        </Link>

        {/* DGII */}
        <Link
          href="/dashboard/dgii"
          className={cn(
            "relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 active:scale-95",
            isDgiiActive
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-5 w-5" />
          <span className="text-[9px] mt-0.5 tracking-tight">DGII</span>
          <span className={cn(
            "absolute bottom-0.5 w-1 h-1 rounded-full bg-primary transition-all duration-300 ease-out",
            isDgiiActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-1"
          )} />
        </Link>

        {/* Más */}
        <button
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[9px] mt-0.5 tracking-tight">Más</span>
        </button>
      </div>
    </div>
  );
}
