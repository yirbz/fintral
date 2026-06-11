"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Layers, Activity, Brain, Coins, TrendingUpIcon } from "lucide-react"

export function SectionCards({ stats }: { stats: any }) {
  const pending = stats?.queue?.pending ?? 0;
  const processed = stats?.performance?.daily_processed ?? 0;
  const confidence = stats?.performance?.avg_confidence ?? 0;
  const cost = stats?.costs?.avg_cost_per_doc ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 lg:grid-cols-4 dark:*:data-[slot=card]:bg-card/50">
      <Card className="Fintral-border">
        <CardHeader>
          <CardDescription className="text-sky-500 font-medium tracking-wide text-xs uppercase">Cola Pendiente</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums md:text-3xl text-foreground">
            {pending}
          </CardTitle>
          <CardAction>
            <div className="rounded-xl p-2.5 bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20">
              <Layers className="size-5" />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">
            Documentos en espera
          </div>
        </CardFooter>
      </Card>
      
      <Card className="Fintral-border">
        <CardHeader>
          <CardDescription className="text-emerald-500 font-medium tracking-wide text-xs uppercase">Procesadas Hoy</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums md:text-3xl text-foreground">
            {processed}
          </CardTitle>
          <CardAction>
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
              <Activity className="size-5" />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">
            Últimas 24 horas
          </div>
        </CardFooter>
      </Card>
      
      <Card className="Fintral-border">
        <CardHeader>
          <CardDescription className="text-amber-500 font-medium tracking-wide text-xs uppercase">Confianza Promedio</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums md:text-3xl text-foreground">
            {Math.round(confidence * 100)}%
          </CardTitle>
          <CardAction>
            <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
              <Brain className="size-5" />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">Calidad de extracción IA</div>
        </CardFooter>
      </Card>
      
      <Card className="Fintral-border">
        <CardHeader>
          <CardDescription className="text-rose-500 font-medium tracking-wide text-xs uppercase">Costo Promedio</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums md:text-3xl text-foreground">
            ${cost.toFixed(4)}
          </CardTitle>
          <CardAction>
            <div className="rounded-xl p-2.5 bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
              <Coins className="size-5" />
            </div>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">Costo por documento</div>
        </CardFooter>
      </Card>
    </div>
  )
}
