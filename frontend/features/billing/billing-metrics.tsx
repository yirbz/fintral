"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, CheckCircle2, Clock } from "lucide-react";

interface MetricsData {
  totalInvoiced: number;
  totalTax: number;
  verifiedCount: number;
  draftCount: number;
  loading: boolean;
  isEcfAuthorized: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);

export function BillingMetrics({ data }: { data: MetricsData }) {
  const metrics = [
    {
      label: "Total Facturado",
      value: formatCurrency(data.totalInvoiced),
      icon: <DollarSign className="size-4 text-emerald-500" />,
      sub: data.isEcfAuthorized
        ? "Comprobantes electrónicos timbrados DGII"
        : "Facturas registradas",
    },
    {
      label: "ITBIS Recaudado",
      value: formatCurrency(data.totalTax),
      icon: <TrendingUp className="size-4 text-primary" />,
      sub: "Para reporte fiscal Formato 607",
    },
    {
      label: data.isEcfAuthorized ? "Timbradas DGII" : "Emitidas",
      value: String(data.verifiedCount),
      icon: <CheckCircle2 className="size-4 text-emerald-500" />,
      sub: data.isEcfAuthorized
        ? "Aprobadas por la DGII"
        : "Facturas emitidas",
    },
    {
      label: "Borradores",
      value: String(data.draftCount),
      icon: <Clock className="size-4 text-amber-500" />,
      sub: "Pendientes de emitir",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <Card
          key={m.label}
          className="border border-border/50 bg-card/50 backdrop-blur-xs"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {m.label}
            </CardTitle>
            {m.icon}
          </CardHeader>
          <CardContent>
            {data.loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl font-bold text-foreground">{m.value}</div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
