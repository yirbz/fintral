"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PLAN_TIERS,
  BILLING_LABELS,
  BILLING_MULTIPLIER,
  type BillingPeriod,
} from "./plans-data";

function formatPrice(price: number): string {
  return price.toLocaleString("es-DO");
}

export function PricingSection({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("1m");

  const toggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toggleContainerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, x: 0 });

  const updateIndicator = useCallback(() => {
    const container = toggleContainerRef.current;
    const activeButton = toggleRefs.current[period];
    if (!container || !activeButton) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setIndicatorStyle({
      width: buttonRect.width,
      x: buttonRect.left - containerRect.left,
    });
  }, [period]);

  useEffect(() => {
    // Small RAF delay ensures DOM layout is settled
    let frame: number;
    frame = requestAnimationFrame(() => updateIndicator());
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <section className="py-24 bg-[#f6f9fc] brand-selection">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {showHeader && (
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0EA5E9] mb-3">
              Planes
            </p>
            <h2 className="text-[36px] sm:text-[48px] font-light leading-[1.08] tracking-[-1.2px] text-[#0d253d] mb-5 font-brand">
              Precios simples para cada etapa.
            </h2>
            <p className="text-[16px] text-[#273951] font-light leading-relaxed max-w-lg mx-auto">
              Elige el plan que mejor se adapte a tu negocio. Cambia o cancela
              cuando quieras.
            </p>
          </div>
        )}

        {/* Period Toggle — sliding bubble */}
        <div className="flex items-center justify-center mb-16">
          <div
            ref={toggleContainerRef}
            className="relative inline-flex items-center bg-[#e3e8ee]/40 rounded-full p-1 border border-[#e3e8ee] shadow-xs backdrop-blur-xs"
          >
            <div
              className="absolute top-1 bottom-1 rounded-full bg-[#0d253d] shadow-sm transition-all duration-400 ease-out-expo z-0"
              style={{
                width: indicatorStyle.width || undefined,
                transform: `translateX(${indicatorStyle.x}px)`,
              }}
            />
            {(
              Object.entries(BILLING_LABELS) as [
                BillingPeriod,
                (typeof BILLING_LABELS)["1m"],
              ][]
            ).map(([key, { label, discount }]) => (
              <button
                key={key}
                type="button"
                ref={(el) => {
                  toggleRefs.current[key] = el;
                }}
                onClick={() => setPeriod(key)}
                className={cn(
                  "relative px-5 py-2 rounded-full text-[13px] font-medium transition-colors duration-200 z-10 active:scale-[0.97]",
                  period === key
                    ? "text-white"
                    : "text-[#64748d] hover:text-[#0d253d]",
                )}
              >
                {label}
                {discount && (
                  <span className="absolute -top-3.5 -right-2.5 text-[9px] font-medium text-white bg-[#0EA5E9] px-2 py-0.5 rounded-full scale-90 border border-white">
                    {discount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
          {PLAN_TIERS.map((tier, index) => {
            const monthlyPrice = tier.prices[period];
            const multiplier = BILLING_MULTIPLIER[period];
            const effectiveMonthly =
              period === "1m"
                ? monthlyPrice
                : Math.round(monthlyPrice / multiplier);
            const singleMonthPrice = tier.prices["1m"];
            const normalTotalForPeriod = singleMonthPrice * multiplier;
            const savings = normalTotalForPeriod - monthlyPrice;

            const eyebrow =
              tier.id === "inicial"
                ? "Personal"
                : tier.id === "profesional"
                  ? "Recomendado"
                  : "Corporativo";
            const staggerClass =
              index === 0
                ? "stagger-1"
                : index === 1
                  ? "stagger-2"
                  : "stagger-3";

            const card = (
              <div
                className={cn(
                  "flex flex-col px-7 py-8 transition-all",
                  "rounded-xl border",
                  tier.popular
                    ? "bg-[#0d253d] border-[#0EA5E9] text-white shadow-[0_4px_24px_rgba(14,165,233,0.15),0_20px_50px_rgba(13,37,61,0.12)]"
                    : "bg-white border-[#e6eaef] text-[#0d253d] shadow-[0_1px_2px_rgba(13,37,61,0.02),0_6px_20px_rgba(13,37,61,0.04)] hover:border-[#0EA5E9]/20 hover:shadow-[0_8px_28px_rgba(13,37,61,0.06)] hover:-translate-y-0.5",
                )}
                style={{
                  transition:
                    "box-shadow 400ms cubic-bezier(0.16, 1, 0.3, 1), border-color 300ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Popular glow */}
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-gradient-to-b from-[#0EA5E9]/10 to-transparent blur-2xl rounded-full pointer-events-none" />
                )}

                {/* Plan header */}
                <div className="mb-1">
                  <span
                    className={cn(
                      "text-[9px] font-semibold tracking-[0.15em] uppercase",
                      tier.popular ? "text-[#38BDF8]" : "text-[#0EA5E9]",
                    )}
                  >
                    {eyebrow}
                  </span>
                  <h3
                    className={cn(
                      "text-[21px] font-medium tracking-[-0.3px] mt-1.5",
                      tier.popular ? "text-white" : "text-[#0d253d]",
                    )}
                  >
                    {tier.name}
                  </h3>
                </div>

                <p
                  className={cn(
                    "text-[12px] leading-relaxed font-light mb-6",
                    tier.popular ? "text-[#a8c3de]/70" : "text-[#64748d]/80",
                  )}
                >
                  {tier.description}
                </p>

                {/* Price */}
                <div className="mb-7">
                  <div className="flex items-baseline gap-px">
                    <span
                      className={cn(
                        "text-sm font-medium tracking-tight align-super mr-0.5",
                        tier.popular
                          ? "text-[#a8c3de]/70"
                          : "text-[#64748d]/70",
                      )}
                    >
                      RD$
                    </span>
                    <span
                      className={cn(
                        "text-[36px] font-light tracking-[-1.5px] tabular-nums leading-none",
                        tier.popular ? "text-white" : "text-[#0d253d]",
                      )}
                    >
                      {formatPrice(monthlyPrice)}
                    </span>
                    <span
                      className={cn(
                        "text-[12px] font-light pb-0.5",
                        tier.popular
                          ? "text-[#a8c3de]/50"
                          : "text-[#64748d]/60",
                      )}
                    >
                      {period === "1m" ? "/mes" : " total"}
                    </span>
                  </div>

                  {period !== "1m" && (
                    <p
                      className={cn(
                        "text-[11px] mt-1 font-light tabular-nums",
                        tier.popular
                          ? "text-[#a8c3de]/50"
                          : "text-[#64748d]/70",
                      )}
                    >
                      RD$ {formatPrice(effectiveMonthly)}/mes efectivo
                    </p>
                  )}

                  {savings > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full mt-3",
                        tier.popular
                          ? "bg-[#0EA5E9]/15 text-[#38BDF8]"
                          : "bg-[#E0F2FE] text-[#0284C7]",
                      )}
                    >
                      Ahorra RD$ {formatPrice(savings)}
                    </span>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href={period === "1m" ? "/signup" : "/plans"}
                  className="block mb-7"
                >
                  <Button
                    className={cn(
                      "w-full rounded-full font-medium py-[18px] h-auto text-[13px] transition-all duration-300 active:scale-[0.97] flex items-center justify-center gap-1.5",
                      "bg-[#0EA5E9] text-white hover:bg-[#0284C7] shadow-sm hover:shadow-md",
                    )}
                  >
                    <span>Comenzar ahora</span>
                    <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </Link>

                {/* Separator */}
                <div
                  className={cn(
                    "w-full h-px mb-7",
                    tier.popular ? "bg-white/8" : "bg-[#e6eaef]",
                  )}
                />

                {/* Features */}
                <ul className="space-y-3.5 flex-grow">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 inline-flex items-center justify-center",
                          feature.included
                            ? tier.popular
                              ? "text-[#38BDF8]"
                              : "text-[#0EA5E9]"
                            : tier.popular
                              ? "text-white/15"
                              : "text-[#a8c3de]/50",
                        )}
                      >
                        {feature.included ? (
                          <Check className="size-3.5 stroke-[2.5]" />
                        ) : (
                          <span className="size-1 rounded-full bg-current" />
                        )}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            "text-[12px] leading-snug",
                            feature.included
                              ? tier.popular
                                ? "text-white/90"
                                : "text-[#273951]"
                              : tier.popular
                                ? "text-white/25"
                                : "text-[#a8c3de]",
                          )}
                        >
                          {feature.text}
                        </span>
                        {feature.subtext && (
                          <span
                            className={cn(
                              "text-[10px] leading-normal mt-px",
                              feature.included
                                ? tier.popular
                                  ? "text-[#a8c3de]/50"
                                  : "text-[#64748d]/70"
                                : tier.popular
                                  ? "text-white/15"
                                  : "text-[#a8c3de]/40",
                            )}
                          >
                            {feature.subtext}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );

            return (
              <div key={tier.id} className={cn("relative", staggerClass)}>
                {tier.popular && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 z-20 lg:pr-3"
                    style={{ top: "-26px" }}
                  >
                    <span className="bg-[#0EA5E9] text-white text-[10px] font-semibold uppercase tracking-[0.12em] px-4 py-1 rounded-full shadow-sm">
                      {tier.highlightedFeature}
                    </span>
                  </div>
                )}
                {card}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="text-center mt-14">
          <p className="text-[13px] text-[#64748d] leading-relaxed max-w-md mx-auto font-light">
            Todos los planes incluyen configuración inicial gratuita. Los montos
            no incluyen ITBIS.{" "}
            <Link
              href="/docs"
              className="text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors"
            >
              Términos y condiciones
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
