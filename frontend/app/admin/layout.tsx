"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { 
  ArrowLeftIcon, 
  LayoutDashboard, 
  Users, 
  FileText, 
  Activity,
  Database,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pagos", label: "Pagos", icon: CreditCard },
  { href: "/admin/reference", label: "Datos de Referencia", icon: Database },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && !session?.user?.is_superuser) {
      router.replace("/dashboard");
    }
  }, [isLoading, session, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background">
          <div className="flex h-12 items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-4 w-px rounded-none" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
            <Skeleton className="h-3 w-40 rounded-md" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
          <div className="space-y-4">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-52 w-full rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (!session?.user?.is_superuser) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-12 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeftIcon className="size-4" />
              Volver
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link href="/admin" className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <span className="text-sm font-semibold">Admin</span>
            </Link>
          </div>
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            {session.user.email}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6">
        <nav className="flex items-center gap-1 mb-4 border-b border-border pb-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 h-8 rounded text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
