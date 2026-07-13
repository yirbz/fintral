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
import { Layers, Activity, Brain, Coins, ShieldCheck, Sparkles, FileText, Scan } from "lucide-react"
import type { StatisticsPayload } from "@/lib/types"
import type { UsageSummary } from "@/lib/api/plans"
import Link from "next/link"

export function SectionCards({ 
  stats, 
  usage, 
  isLoadingUsage 
}: { 
  stats: StatisticsPayload | undefined
  usage?: UsageSummary | null
  isLoadingUsage?: boolean
}) {
  const pending = stats?.queue?.pending ?? 0
  const processed = stats?.performance?.daily_processed ?? 0

  // e-CF remaining
  const ecfUsed = usage?.ecf?.used ?? 0
  const ecfLimit = usage?.ecf?.limit ?? 0
  const ecfRemaining = Math.max(0, ecfLimit - ecfUsed)

  // AI remaining
  const aiUsed = usage?.ai_queries?.used ?? 0
  const aiLimit = usage?.ai_queries?.limit ?? 0
  const aiRemaining = Math.max(0, aiLimit - aiUsed)

  // OCR remaining
  const ocrUsed = usage?.ocr_docs?.used ?? 0
  const ocrLimit = usage?.ocr_docs?.limit ?? 0
  const ocrRemaining = Math.max(0, ocrLimit - ocrUsed)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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

      {/* e-CF Remaining */}
      <Link href="/dashboard/tienda" className="block group">
        <Card className="transition-shadow duration-200 hover:shadow-md group-hover:border-sky-500/40 group-hover:bg-sky-500/5 transition-all duration-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-sky-600 transition-colors">
              Comprobantes e-CF
            </CardDescription>
            <div className="flex items-start justify-between">
              {isLoadingUsage ? (
                <div className="h-9 w-16 bg-muted rounded animate-pulse" />
              ) : (
                <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
                  {ecfRemaining}
                </CardTitle>
              )}
              <CardAction>
                <div className="rounded-xl p-2.5 bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20 group-hover:bg-sky-500 group-hover:text-white group-hover:ring-sky-500 transition-all duration-200">
                  <FileText className="size-4" />
                </div>
              </CardAction>
            </div>
          </CardHeader>
          <CardFooter className="pt-0 pb-4 flex flex-col items-start gap-1">
            <p className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
              Restantes de {ecfLimit} este mes
            </p>
            <span className="text-[10px] text-sky-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Comprar más addons &rarr;
            </span>
          </CardFooter>
        </Card>
      </Link>

      {/* AI Remaining */}
      <Link href="/dashboard/tienda" className="block group">
        <Card className="transition-shadow duration-200 hover:shadow-md group-hover:border-amber-500/40 group-hover:bg-amber-500/5 transition-all duration-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-amber-600 transition-colors">
              Consultas IA
            </CardDescription>
            <div className="flex items-start justify-between">
              {isLoadingUsage ? (
                <div className="h-9 w-16 bg-muted rounded animate-pulse" />
              ) : (
                <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
                  {aiRemaining}
                </CardTitle>
              )}
              <CardAction>
                <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 group-hover:bg-amber-500 group-hover:text-white group-hover:ring-amber-500 transition-all duration-200">
                  <Sparkles className="size-4" />
                </div>
              </CardAction>
            </div>
          </CardHeader>
          <CardFooter className="pt-0 pb-4 flex flex-col items-start gap-1">
            <p className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
              Restantes de {aiLimit} este mes
            </p>
            <span className="text-[10px] text-amber-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Comprar más addons &rarr;
            </span>
          </CardFooter>
        </Card>
      </Link>

      {/* OCR Remaining */}
      <Link href="/dashboard/tienda" className="block group">
        <Card className="transition-shadow duration-200 hover:shadow-md group-hover:border-indigo-500/40 group-hover:bg-indigo-500/5 transition-all duration-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-indigo-600 transition-colors">
              Extracciones OCR/IA
            </CardDescription>
            <div className="flex items-start justify-between">
              {isLoadingUsage ? (
                <div className="h-9 w-16 bg-muted rounded animate-pulse" />
              ) : (
                <CardTitle className="text-3xl font-light tabular-nums tracking-tight text-foreground">
                  {ocrRemaining}
                </CardTitle>
              )}
              <CardAction>
                <div className="rounded-xl p-2.5 bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/20 group-hover:bg-indigo-500 group-hover:text-white group-hover:ring-indigo-500 transition-all duration-200">
                  <Scan className="size-4" />
                </div>
              </CardAction>
            </div>
          </CardHeader>
          <CardFooter className="pt-0 pb-4 flex flex-col items-start gap-1">
            <p className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
              Restantes de {ocrLimit} este mes
            </p>
            <span className="text-[10px] text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Comprar más addons &rarr;
            </span>
          </CardFooter>
        </Card>
      </Link>
    </div>
  )
}
