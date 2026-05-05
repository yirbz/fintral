"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ChartPie,
  FileText,
  Loader2,
  LogOut,
  MessageSquare,
  Settings,
  Upload
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSession } from "@/hooks/use-session";
import { useRealtime } from "@/hooks/use-realtime";
import { NotificationMenu } from "@/features/notifications/notification-menu";
import { FinanceChat } from "@/features/chat/finance-chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/dashboard/invoices", label: "Facturas", icon: FileText },
  { href: "/dashboard/upload", label: "Pipeline", icon: Upload },
  { href: "/dashboard/reports", label: "Analítica", icon: ChartPie },
  { href: "/dashboard/settings", label: "Ajustes", icon: Settings }
];

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const { connected } = useRealtime();
  const [term, setTerm] = useState(search.get("search") ?? "");
  const session = useSession();

  const title = useMemo(() => {
    const hit = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    return hit?.label ?? "Workspace";
  }, [pathname]);

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (session.error || !session.data) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 border-r bg-[#0f172a] p-4 text-slate-300 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="rounded-md bg-white/90 p-1 text-black">
            <FileText className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold text-white">InvoiceFlow</p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-white/10 text-white" : "hover:bg-white/5"
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs">
          <p className="truncate font-semibold text-white">{session.data.user.full_name}</p>
          <p className="truncate text-slate-400">{session.data.user.email}</p>
          <button
            className="mt-3 inline-flex items-center gap-1 text-slate-300 hover:text-white"
            onClick={() => {
              window.location.href = "/logout";
            }}
          >
            <LogOut className="h-3 w-3" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Workspace</p>
              <p className="truncate text-sm font-semibold">
                {session.data.company_name} / {title}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden items-center gap-2 rounded-md border bg-white px-2 py-1 sm:flex">
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <Input
                  className="h-7 w-56 border-0 p-0 text-xs focus-visible:ring-0"
                  placeholder="Buscar proveedor o NCF..."
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && term.trim()) {
                      router.push(`/dashboard/invoices?search=${encodeURIComponent(term.trim())}`);
                    }
                  }}
                />
              </div>
              <div
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-semibold",
                  connected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}
              >
                {connected ? "Tiempo real conectado" : "Tiempo real desconectado"}
              </div>
              <NotificationMenu />
              <Button size="sm" onClick={() => router.push("/dashboard/upload")}>
                Nuevo
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      <FinanceChat />
    </div>
  );
}
