"use client"

import { useUserSubscription } from "@/hooks/use-user-subscription"
import { Clock, Sparkles, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface TrialRemainingBadgeProps {
  variant?: "sidebar" | "inline" | "card"
  className?: string
}

export function TrialRemainingBadge({ variant = "inline", className }: TrialRemainingBadgeProps) {
  const { subscription, trialRemainingDays, isTrialing, isActive, isLoading } = useUserSubscription()

  if (isLoading || !subscription) return null

  if (isActive) return null

  if (isTrialing) {
    if (trialRemainingDays <= 0) {
      return (
        <div className={cn(
          variant === "sidebar" && "flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40",
          variant === "card" && "flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40",
          variant === "inline" && "inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400",
          className
        )}>
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>Prueba finalizada — elige un plan para continuar</span>
        </div>
      )
    }

    const daysLabel = trialRemainingDays === 1 ? "1 día" : `${trialRemainingDays} días`

    if (variant === "sidebar") {
      return (
        <div className={cn(
          "flex items-center gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-xs text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900/40",
          className
        )}>
          <Clock className="size-3.5 shrink-0 animate-pulse" />
          <div className="flex flex-col">
            <span className="font-medium">Prueba gratuita</span>
            <span className="text-[11px] opacity-80">Quedan {daysLabel}</span>
          </div>
        </div>
      )
    }

    if (variant === "card") {
      return (
        <div className={cn(
          "flex items-center gap-3 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/30 px-4 py-3 border border-sky-200 dark:border-sky-900/40",
          className
        )}>
          <div className="flex size-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/50">
            <Sparkles className="size-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sky-800 dark:text-sky-300">
              Periodo de prueba
            </span>
            <span className="text-xs text-sky-600 dark:text-sky-400">
              Quedan {daysLabel} — explora todas las funciones de Fintral Hub
            </span>
          </div>
        </div>
      )
    }

    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400",
        className
      )}>
        <Clock className="size-3" />
        <span>Prueba: {daysLabel}</span>
      </span>
    )
  }

  return null
}
