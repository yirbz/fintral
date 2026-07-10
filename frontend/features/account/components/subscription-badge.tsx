"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Ban, XCircle, Clock } from "lucide-react";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"
  | "suspended"
  | string;

interface SubscriptionBadgeProps {
  status: SubscriptionStatus;
  size?: "sm" | "md";
  className?: string;
}

export function SubscriptionBadge({
  status,
  size = "sm",
  className,
}: SubscriptionBadgeProps) {
  const normalizedStatus = status ? status.toLowerCase() : "";

  let label = "Desconocido";
  let bgClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  let dotClass = "bg-slate-400";
  let Icon: React.ComponentType<any> | null = null;
  let customStyles = "";

  switch (normalizedStatus) {
    case "trial":
    case "trialing":
      label = "Plan de prueba";
      bgClass = "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-100 dark:border-sky-900/40";
      dotClass = "bg-sky-500 animate-pulse";
      Icon = Clock;
      break;

    case "active":
      label = "Activo";
      bgClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40";
      dotClass = "bg-emerald-500 animate-breath";
      Icon = CheckCircle2;
      customStyles = `
        @keyframes breath {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .animate-breath {
          animation: breath 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `;
      break;

    case "past_due":
      label = "Pago pendiente";
      bgClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40";
      dotClass = "bg-amber-500";
      Icon = AlertTriangle;
      break;

    case "cancelled":
    case "canceled":
      label = "Plan inactivo";
      bgClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60";
      dotClass = "bg-slate-400";
      Icon = Ban;
      break;

    case "expired":
      label = "Plan vencido";
      bgClass = "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-100 dark:border-red-900/40";
      dotClass = "bg-red-500";
      Icon = XCircle;
      break;

    case "suspended":
      label = "Cuenta suspendida";
      bgClass = "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900/60";
      dotClass = "bg-red-700";
      Icon = Ban;
      break;
  }

  const isMd = size === "md";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full tracking-wide transition-colors",
        isMd ? "text-sm px-3.5 py-1" : "text-xs px-2.5 py-0.5",
        bgClass,
        className
      )}
    >
      {customStyles && <style>{customStyles}</style>}
      
      {/* Animated status indicator dot */}
      <span className={cn("size-2 rounded-full", dotClass)} />
      
      {Icon && (
        <Icon
          className={cn(
            isMd ? "size-4" : "size-3.5",
            normalizedStatus === "past_due" && "animate-pulse"
          )}
        />
      )}
      
      <span>{label}</span>
    </span>
  );
}
