"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { RealtimeProvider } from "@/hooks/use-realtime";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";

export function ShellLoader({ children }: { children: React.ReactNode }) {
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
