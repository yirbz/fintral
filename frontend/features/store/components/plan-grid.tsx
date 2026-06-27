"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { PlanSummary } from "@/lib/api/plans";
import { PlanCard } from "./plan-card";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanGridProps {
  plans: PlanSummary[] | undefined;
  currentPlan: PlanSummary | null;
  isLoading: boolean;
  isError: boolean;
  cartPlanNames: (string | undefined)[];
  commitMonths: number;
  onAddToCart: (plan: PlanSummary) => void;
  exchangeRate: number;
}

export function PlanGrid({
  plans,
  currentPlan,
  isLoading,
  isError,
  cartPlanNames,
  commitMonths,
  onAddToCart,
  exchangeRate,
}: PlanGridProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    // Stagger fade-in entry animation
    const timer = setTimeout(() => setShouldAnimate(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300 flex items-center gap-2 max-w-2xl">
        <AlertCircle className="size-5 text-red-600 dark:text-red-500 shrink-0" />
        <div>
          <h4 className="font-semibold">Error al cargar planes</h4>
          <p className="text-xs mt-0.5">No pudimos obtener la lista de planes. Por favor, reintenta en unos instantes.</p>
        </div>
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-hairline dark:border-slate-800 p-8 text-center max-w-2xl">
        <p className="text-sm font-medium text-brand-ink-secondary dark:text-slate-300">
          No hay planes disponibles en este momento.
        </p>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400 mt-1">
          Por favor, contacta a nuestro equipo de soporte para recibir asistencia.
        </p>
      </div>
    );
  }

  // Sort plans by sort_order; filter out enterprise (handled via custom CTA below the grid)
  const sortedPlans = [...plans]
    .filter((p) => !p.is_enterprise)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (sortedPlans.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-hairline dark:border-slate-800 p-8 text-center max-w-2xl">
        <p className="text-sm font-medium text-brand-ink-secondary dark:text-slate-300">
          No hay planes disponibles en este momento.
        </p>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400 mt-1">
          Por favor, contacta a nuestro equipo de soporte para recibir asistencia.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cssStaggerGrid(sortedPlans.length)}
    >
      {sortedPlans.map((plan, index) => {
        const inCart = cartPlanNames.includes(plan.name) && plan.id !== currentPlan?.id;

        return (
          <div
            key={plan.id}
            className="transition-all duration-500 ease-out"
            style={{
              opacity: shouldAnimate ? 1 : 0,
              transform: shouldAnimate ? "translateY(0)" : "translateY(8px)",
              transitionDelay: `${index * 50}ms`,
            }}
          >
            <PlanCard
              plan={plan}
              currentPlan={currentPlan}
              onAddToCart={() => onAddToCart(plan)}
              inCart={inCart}
              commitMonths={commitMonths}
              exchangeRate={exchangeRate}
            />
          </div>
        );
      })}
    </div>
  );
}

// Dynamically sets columns based on plan list size for balanced visual display
function cssStaggerGrid(count: number) {
  if (count <= 2) {
    return "grid gap-6 grid-cols-1 md:grid-cols-2 max-w-4xl";
  }
  return "grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl";
}
