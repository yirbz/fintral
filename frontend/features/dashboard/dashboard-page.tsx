"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Brain, Coins, Layers } from "lucide-react";

import { getStatistics } from "@/lib/api/statistics";
import { listInvoices } from "@/lib/api/invoices";
import { useRealtime } from "@/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DashboardPage() {
  const stats = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") });
  const invoices = useQuery({ queryKey: ["invoices", "dashboard"], queryFn: () => listInvoices() });
  const { events, connected } = useRealtime();

  const data = stats.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Centro de Control IA</CardTitle>
            <p className="text-xs text-muted-foreground">Monitoreo operativo en tiempo real.</p>
          </div>
          <Badge variant={connected ? "success" : "danger"}>
            {connected ? "Tiempo real activo" : "Tiempo real inactivo"}
          </Badge>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cola pendiente"
          value={String(data?.queue.pending ?? 0)}
          description="Documentos en espera"
          icon={<Layers className="h-4 w-4" />}
        />
        <MetricCard
          title="Procesadas hoy"
          value={String(data?.performance.daily_processed ?? 0)}
          description="Últimas 24 horas"
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Confianza promedio"
          value={`${Math.round((data?.performance.avg_confidence ?? 0) * 100)}%`}
          description="Calidad de extracción"
          icon={<Brain className="h-4 w-4" />}
        />
        <MetricCard
          title="Costo promedio"
          value={`$${(data?.costs.avg_cost_per_doc ?? 0).toFixed(4)}`}
          description="Por documento"
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(invoices.data?.invoices ?? []).slice(0, 8).map((invoice) => (
              <div className="flex items-center justify-between border-b pb-2 text-xs last:border-b-0" key={invoice.id}>
                <div>
                  <p className="font-semibold">{invoice.vendor_name || "Procesando..."}</p>
                  <p className="text-muted-foreground">{invoice.invoice_number || "Sin NCF"} · #{invoice.id}</p>
                </div>
                <Badge variant={invoice.processed ? "success" : "warning"}>
                  {invoice.processed ? "Procesado" : "Pendiente"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Pulse</CardTitle>
          </CardHeader>
          <CardContent className="tight-scrollbar max-h-80 space-y-2 overflow-auto">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esperando eventos...</p>
            ) : null}
            {events.slice(0, 20).map((event, idx) => (
              <div className="rounded-md border bg-muted/30 p-2 text-xs" key={`${event.timestamp}-${idx}`}>
                <p className="font-semibold">{event.type}</p>
                <p className="text-muted-foreground">{event.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-md border bg-muted p-2">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
