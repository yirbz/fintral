"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PLAN_TIERS, BILLING_LABELS, BILLING_MULTIPLIER, type BillingPeriod } from "./plans-data"

function formatPrice(price: number): string {
  return price.toLocaleString("es-DO")
}

export function PricingSection({ showHeader = true }: { showHeader?: boolean }) {
  const [period, setPeriod] = useState<BillingPeriod>("1m")

  return (
    <section className="py-24 bg-[#f6f9fc] brand-selection">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {showHeader && (
          <div className="text-center max-w-2xl mx-auto mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#533afd] mb-3">
              Planes
            </p>
            <h2 className="text-[34px] sm:text-[44px] font-normal leading-[1.08] tracking-[-1.2px] text-[#0d253d] mb-5">
              Precios simples para cada etapa.
            </h2>
            <p className="text-[17px] text-[#273951] font-normal leading-relaxed max-w-lg mx-auto">
              Elige el plan que mejor se adapte a tu negocio. Cambia o cancela cuando quieras.
            </p>
          </div>
        )}

        {/* Period Toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex items-center gap-1 bg-white rounded-full p-1 border border-[#e3e8ee] shadow-sm">
            {(Object.entries(BILLING_LABELS) as [BillingPeriod, typeof BILLING_LABELS["1m"]][]).map(
              ([key, { label, discount }]) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={cn(
                    "relative px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200",
                    period === key
                      ? "bg-[#0d253d] text-white shadow-sm"
                      : "text-[#64748d] hover:text-[#0d253d]",
                  )}
                >
                  {label}
                  {discount && (
                    <span className="absolute -top-2 -right-1 text-[8px] font-semibold text-[#533afd] bg-[#b9b9f9]/50 px-1.5 py-0.5 rounded-full">
                      {discount}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {PLAN_TIERS.map((tier, index) => {
            const monthlyPrice = tier.prices[period]
            const periodInfo = BILLING_LABELS[period]
            const multiplier = BILLING_MULTIPLIER[period]
            const effectiveMonthly = period === "1m" ? monthlyPrice : Math.round(monthlyPrice / multiplier)

            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-8 transition-all duration-300",
                  tier.popular
                    ? "bg-[#0d253d] border-[#0d253d] shadow-[0_8px_32px_rgba(13,37,61,0.15)] scale-[1.02] md:scale-105"
                    : "bg-white border-[#e3e8ee] shadow-sm hover:shadow-[0_8px_24px_rgba(0,55,112,0.06)]",
                )}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#533afd] text-white text-[10px] font-semibold uppercase tracking-[0.08em] px-3 py-1 rounded-full">
                      {tier.highlightedFeature}
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h3 className={cn(
                    "text-[18px] font-medium mb-1",
                    tier.popular ? "text-white" : "text-[#0d253d]",
                  )}>
                    {tier.name}
                  </h3>
                  <p className={cn(
                    "text-[13px] leading-relaxed",
                    tier.popular ? "text-[#a8c3de]" : "text-[#64748d]",
                  )}>
                    {tier.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-0.5">
                    <span className={cn(
                      "text-[36px] font-light tracking-[-0.8px]",
                      tier.popular ? "text-white" : "text-[#0d253d]",
                    )}>
                      RD${formatPrice(monthlyPrice)}
                    </span>
                    <span className={cn(
                      "text-[13px]",
                      tier.popular ? "text-[#a8c3de]" : "text-[#64748d]",
                    )}>
                      {period === "1m" ? "/mes" : ` total`}
                    </span>
                  </div>
                  {period !== "1m" && (
                    <p className={cn(
                      "text-[12px] mt-0.5",
                      tier.popular ? "text-[#a8c3de]/70" : "text-[#64748d]",
                    )}>
                      RD${formatPrice(effectiveMonthly)}/mes efectivo
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Link href={period === "1m" ? "/signup" : "/plans"} className="block mb-8">
                  <Button
                    className={cn(
                      "w-full rounded-full font-medium py-5 h-auto text-[14px] transition-all active:scale-[0.97]",
                      tier.popular
                        ? "bg-white text-[#0d253d] hover:bg-[#f6f9fc] shadow-lg"
                        : "bg-[#533afd] text-white hover:bg-[#4434d4] shadow-sm",
                    )}
                  >
                    Comenzar ahora{" "}
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Button>
                </Link>

                {/* Features */}
                <ul className="space-y-3 mt-auto">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className={cn(
                        "mt-0.5 size-4 rounded-full flex items-center justify-center shrink-0",
                        feature.included
                          ? tier.popular ? "bg-[#533afd]/20" : "bg-[#533afd]/10"
                          : "bg-transparent",
                      )}>
                        {feature.included ? (
                          <Check className={cn(
                            "size-2.5",
                            tier.popular ? "text-[#533afd]" : "text-[#533afd]",
                          )} />
                        ) : (
                          <span className={cn(
                            "size-1.5 rounded-full",
                            tier.popular ? "bg-[#a8c3de]/30" : "bg-[#d1d9e6]",
                          )} />
                        )}
                      </div>
                      <span className={cn(
                        "text-[13px] leading-snug",
                        feature.included
                          ? tier.popular ? "text-white" : "text-[#273951]"
                          : tier.popular ? "text-[#a8c3de]/50" : "text-[#a8c3de]",
                      )}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div className="text-center mt-10">
          <p className="text-[12px] text-[#64748d] leading-relaxed max-w-md mx-auto">
            Todos los planes incluyen configuración inicial gratuita.
            {" "}Los montos no incluyen ITBIS.{" "}
            <Link href="/plans/terms" className="text-[#533afd] hover:underline">
              Términos y condiciones
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
