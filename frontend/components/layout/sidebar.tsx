"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChartPie,
  Clock,
  FileText,
  LifeBuoy,
  Loader2,
  LogOut,
  Search,
  Bell,
  Settings,
  ShoppingBag,
  Upload,
  Command,
  Plus
} from "lucide-react";
import { useState, useMemo } from "react";

import { useSession } from "@/hooks/use-session";
import { useRealtime } from "@/hooks/use-realtime";
import { GlobalSearch } from "@/components/global-search";
import { NotificationMenu } from "@/features/notifications/notification-menu";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import * as ShadcnSidebar from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/dashboard/invoices", label: "Facturas", icon: FileText },
  { href: "/dashboard/upload", label: "Pipeline", icon: Upload },
  { href: "/dashboard/reports", label: "Analítica", icon: ChartPie },
  { href: "/dashboard/history", label: "Historial", icon: Clock },
  { href: "/dashboard/notifications", label: "Notificaciones", icon: Bell },
  { href: "/dashboard/store", label: "Tienda", icon: ShoppingBag },
  { href: "/dashboard/help", label: "Ayuda", icon: LifeBuoy },
  { href: "/dashboard/settings", label: "Ajustes", icon: Settings }
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SidebarInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected } = useRealtime();
  const session = useSession();

  const title = useMemo(() => {
    const hit = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    return hit?.label ?? "Workspace";
  }, [pathname]);

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (session.error || !session.data) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { source: "sidebar" } }));
    }
    return null;
  }

  const currentTitle = title;

  return (
    <ShadcnSidebar.SidebarProvider defaultOpen={true}>
      <GlobalSearch />
      <ShadcnSidebar.Sidebar collapsible="icon" className="border-r-0">
        {/* Logo */}
        <ShadcnSidebar.SidebarHeader className="px-4 pt-5 pb-4">
          <Logo variant="light" size="md" />
        </ShadcnSidebar.SidebarHeader>

        {/* Navigation */}
        <ShadcnSidebar.SidebarContent className="px-3 py-1">
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </ShadcnSidebar.SidebarContent>

        {/* User */}
        <ShadcnSidebar.SidebarFooter className="p-3">
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-8 border border-sidebar-border">
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary text-xs font-medium">
                  {getInitials(session.data.user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">{session.data.user.full_name}</p>
                <p className="truncate text-[11px] text-sidebar-foreground/50">{session.data.user.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                    <LogOut className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuItem onClick={() => { window.location.href = "/logout"; }}>
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ShadcnSidebar.SidebarFooter>
      </ShadcnSidebar.Sidebar>

      <ShadcnSidebar.SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur-md px-4">
          <ShadcnSidebar.SidebarTrigger />

          <Separator orientation="vertical" className="mx-2 h-4" />

          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Workspace</span>
              <span className="text-border">/</span>
              <span className="font-medium text-foreground">{session.data.company_name}</span>
              <span className="text-border">/</span>
              <span className="font-semibold text-foreground">{currentTitle}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/search")}
                className="relative hidden items-center sm:flex cursor-pointer"
              >
                <Search className="absolute left-3 size-3.5 text-muted-foreground pointer-events-none" />
                <div className="h-8 w-56 rounded-lg border border-border bg-muted/50 pl-9 pr-12 text-xs flex items-center text-muted-foreground/60 pointer-events-none text-left">
                  Buscar...
                </div>
                <div className="absolute right-2 flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground pointer-events-none">
                  <Command className="size-2.5" />
                  <span>K</span>
                </div>
              </button>

              <Badge variant="secondary" className="gap-1.5 font-normal">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                {connected ? "Conectado" : "Sin conexión"}
              </Badge>

              <NotificationMenu />

              <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => router.push("/dashboard/upload")}>
                <Plus className="size-3.5" />
                Nuevo
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </ShadcnSidebar.SidebarInset>
      </ShadcnSidebar.SidebarProvider>
  );
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SidebarInner>{children}</SidebarInner>
    </Suspense>
  );
}