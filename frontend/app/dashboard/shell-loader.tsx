"use client";

/**
 * Client-side only shell loader.
 * dynamic() with ssr:false MUST be called from a "use client" component to work in App Router.
 * Using it in a Server Component causes it to be ignored, running Sidebar (and useQuery) server-side.
 */
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { RealtimeProvider } from "@/hooks/use-realtime";

const Sidebar = dynamic(
  () => import("@/components/layout/sidebar").then((m) => ({ default: m.Sidebar })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
);

export function ShellLoader({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <Sidebar>{children}</Sidebar>
    </RealtimeProvider>
  );
}



