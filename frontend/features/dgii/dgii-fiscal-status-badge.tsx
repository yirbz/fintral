"use client";

import type { ReactNode } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FISCAL_STATUS_CONFIG: Record<string, {
  label: string;
  icon: ReactNode;
  class: string;
  dot: string;
}> = {
  valid: {
    label: "Válida",
    icon: <CheckCircle2 className="size-3" />,
    class: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  invalid: {
    label: "Inválida",
    icon: <XCircle className="size-3" />,
    class: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-500",
  },
  pending_review: {
    label: "Pendiente",
    icon: <AlertTriangle className="size-3" />,
    class: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  deferred: {
    label: "Diferida",
    icon: <Clock className="size-3" />,
    class: "text-blue-700 bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
  },
  non_deductible: {
    label: "No deducible",
    icon: <ShieldCheck className="size-3" />,
    class: "text-gray-600 bg-gray-50 border-gray-200",
    dot: "bg-gray-400",
  },
};

interface FiscalStatusBadgeProps {
  status: string | null | undefined;
  compact?: boolean;
}

export function FiscalStatusBadge({ status, compact }: FiscalStatusBadgeProps) {
  const config = FISCAL_STATUS_CONFIG[status ?? ""];
  if (!config) return null;

  if (compact) {
    return (
      <span className={cn("inline-flex items-center justify-center rounded-full size-5", config.class)} title={config.label}>
        {config.icon}
      </span>
    );
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
      config.class,
    )}>
      {config.icon}
      {config.label}
    </span>
  );
}
