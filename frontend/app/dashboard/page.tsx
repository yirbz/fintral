"use client"

import { useQuery } from "@tanstack/react-query"
import { getStatistics } from "@/lib/api/statistics"
import { listInvoices } from "@/lib/api/invoices"
import { useRealtime } from "@/hooks/use-realtime"

import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { Zap, Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

// For the data table, we can just pass the invoices to it later if we modify DataTable.
// Or we can render the Activity feed here.

export default function Page() {
  const stats = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") })
  const invoices = useQuery({ queryKey: ["invoices", "dashboard"], queryFn: () => listInvoices() })
  const { events, connected } = useRealtime()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {/* Hero Banner with Fintral Branding */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -right-5 bottom-0 h-20 w-20 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Centro de Control</p>
            </div>
            <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Motor de Procesamiento IA</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Monitoreo operativo en tiempo real de Fintral.</p>
          </div>
          <Badge variant={connected ? "default" : "secondary"} className="gap-1.5 px-2.5 py-0.5 text-xs bg-background/50 backdrop-blur-md Fintral-border">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-muted-foreground/50"}`} />
            {connected ? "Conexión Activa" : "Sin Conexión"}
          </Badge>
        </div>
      </div>

      <SectionCards stats={stats.data} />
      
      <div>
        <ChartAreaInteractive />
      </div>

      {/* Since DataTable is complex, let's keep the real-time events feed here too */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
           {/* Placeholder for Fintral Invoices Table */}
           <div className="rounded-xl border bg-card p-6 Fintral-border shadow-sm h-full flex flex-col">
              <h3 className="text-lg font-heading font-semibold">Facturas Recientes</h3>
               <div className="flex items-center justify-between mb-4">
                 <p className="text-sm text-muted-foreground">Últimos documentos procesados en el sistema.</p>
                 <Link href="/dashboard/invoices">
                   <Button variant="outline" size="sm" className="h-8 text-xs">Ver Todas</Button>
                 </Link>
               </div>
               
               <div className="flex-1 overflow-auto space-y-3">
                 {(invoices.data?.invoices ?? []).slice(0, 5).map((inv) => (
                   <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`} className="flex items-center justify-between p-3 rounded-lg border bg-accent/30 hover:bg-accent transition-colors">
                     <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${inv.processed ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <div>
                          <p className="font-medium text-sm group-hover:text-primary transition-colors">{inv.vendor_name || "Procesando..."}</p>
                          <p className="text-xs text-muted-foreground">{inv.invoice_number || "Sin NCF"} · #{inv.id}</p>
                        </div>
                     </div>
                     <Badge variant={inv.processed ? "outline" : "secondary"}>{inv.processed ? "Procesado" : "Pendiente"}</Badge>
                   </Link>
                 ))}
                 {(invoices.data?.invoices?.length === 0) && (
                   <div className="flex flex-col gap-3 items-center justify-center h-40 text-muted-foreground text-sm">
                     Sin facturas recientes.
                     <Link href="/dashboard/upload">
                       <Button size="sm">Subir factura</Button>
                     </Link>
                   </div>
                 )}
               </div>
           </div>
        </div>
        <div className="lg:col-span-1">
          <div className="rounded-xl border bg-card p-6 Fintral-border shadow-sm h-full flex flex-col">
              <h3 className="text-lg font-heading font-semibold flex items-center gap-2">
                <Activity className="size-4" /> 
                Actividad en vivo
              </h3>
              <p className="text-sm text-muted-foreground mb-4">Eventos en tiempo real</p>
              
              <div className="flex-1 overflow-auto space-y-3 pr-2">
                {events.length === 0 ? (
                   <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sin eventos.</div>
                ) : (
                  events.slice(0, 15).map((event, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-accent transition-colors text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_4px_var(--color-primary)]" />
                        <p className="font-medium">{event.type}</p>
                      </div>
                      <p className="text-muted-foreground text-xs">{event.message}</p>
                    </div>
                  ))
                )}
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}
