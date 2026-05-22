"use client"

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Layers, Activity, Brain, Coins, ShieldCheck } from "lucide-react"
import type { StatisticsPayload } from "@/lib/types"

export function SectionCards({ stats }: { stats: StatisticsPayload | undefined }) {
  const pending = stats?.queue?.pending ?? 0
  const processed = stats?.performance?.daily_processed ?? 0
  const confidence = stats?.performance?.avg_confidence ?? 0
  const cost = stats?.costs?.avg_cost_per_doc ?? 0
  const successRate = stats?.performance?.success_rate ?? 0
  const successPct = Math.round(successRate * 100)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Queue */}
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Cola pendiente
          </CardDescription>
          <div className="flex items-start justify-between">
            <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
              {pending}
            </CardTitle>
            <CardAction>
              <div className="rounded-xl p-2.5 bg-primary/10 text-primary ring-1 ring-primary/20">
                <Layers className="size-4" />
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardFooter className="pt-0 pb-4">
          <p className="text-xs text-muted-foreground">Documentos en espera</p>
        </CardFooter>
      </Card>

      {/* Processed today */}
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Completadas hoy
          </CardDescription>
          <div className="flex items-start justify-between">
            <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
              {processed}
            </CardTitle>
            <CardAction>
              <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                <Activity className="size-4" />
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardFooter className="pt-0 pb-4">
          <p className="text-xs text-muted-foreground">Facturas registradas hoy</p>
        </CardFooter>
      </Card>

      {/* Confidence + success rate */}
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Precisión de extracción
          </CardDescription>
          <div className="flex items-start justify-between">
            <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
              {Math.round(confidence * 100)}%
            </CardTitle>
            <CardAction>
              <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                <Brain className="size-4" />
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardFooter className="pt-0 pb-4 flex-col items-start gap-1.5">
          <p className="text-xs text-muted-foreground">Datos extraídos correctamente</p>
          {/* Success rate progress bar */}
          <div className="w-full">
            <div className="flex justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground">Tasa de éxito</span>
              <span className="text-[10px] tabular-nums font-medium text-foreground">{successPct}%</span>
            </div>
            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-700"
                style={{ width: `${successPct}%` }}
              />
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Cost */}
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Costo por factura
          </CardDescription>
          <div className="flex items-start justify-between">
            <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
              ${cost.toFixed(3)}
            </CardTitle>
            <CardAction>
              <div className="rounded-xl p-2.5 bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
                <Coins className="size-4" />
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardFooter className="pt-0 pb-4">
          <p className="text-xs text-muted-foreground">
            Costo de procesamiento automático
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
