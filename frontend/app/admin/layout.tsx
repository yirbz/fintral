"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && !session?.user?.is_superuser) {
      router.replace("/dashboard");
    }
  }, [isLoading, session, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
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
              Volver al dashboard
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link href="/admin/reference" className="flex items-center gap-2">
              <LogoMark className="size-5" />
              <span className="text-sm font-semibold">Admin</span>
            </Link>
          </div>
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            {session.user.email}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {children}
      </main>
    </div>
  );
}
