"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import CardNav from "@/components/ui/CardNav";
import { GradientMesh } from "@/components/landing/GradientMesh";
import { LogosMarquee } from "@/components/landing/LogosMarquee";
import { LiveInvoiceFeed } from "@/components/landing/LiveInvoiceFeed";
import { TypewriterText } from "@/components/landing/TypewriterText";
import { GrowingExpenseCard } from "@/components/landing/GrowingExpenseCard";
import { BillingMetricsCard } from "@/components/landing/BillingMetricsCard";
import { IntegrationsGrid } from "@/components/landing/IntegrationsGrid";
import { CountUp } from "@/components/landing/CountUp";
import { PricingSection } from "@/components/plans/PricingSection";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { useScrollReveal } from "@/hooks/useScrollReveal";

function StickyNav() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.scrollY > 400);

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setVisible(window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const desktopNavLinks = [
    { label: "Características", href: "#features" },
    { label: "Integraciones", href: "#integrations" },
    { label: "Planes", href: "/plans" },
    { label: "Docs", href: "/docs" },
  ];

  const mobileNavItems = [
    {
      label: "Características",
      bgColor: "#0d253d",
      textColor: "#fff",
      links: [
        {
          label: "Explorar características",
          href: "#features",
          ariaLabel: "Explorar características",
        },
      ],
    },
    {
      label: "Integraciones",
      bgColor: "#1a3349",
      textColor: "#fff",
      links: [
        {
          label: "Ver integraciones",
          href: "#integrations",
          ariaLabel: "Ver integraciones",
        },
      ],
    },
    {
      label: "Planes",
      bgColor: "#273951",
      textColor: "#fff",
      links: [
        {
          label: "Comparar planes",
          href: "/plans",
          ariaLabel: "Comparar planes",
        },
      ],
    },
    {
      label: "Docs",
      bgColor: "#3d5a7d",
      textColor: "#fff",
      links: [
        {
          label: "Leer documentación",
          href: "/docs",
          ariaLabel: "Leer documentación",
        },
      ],
    },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* Mobile layout */}
      <div className="md:hidden mx-auto max-w-[90vw] py-2">
        <CardNav
          items={mobileNavItems}
          baseColor="rgba(255,255,255,0.95)"
          menuColor="#0d253d"
          buttonBgColor="#0EA5E9"
          buttonTextColor="#fff"
          ease="power3.out"
        />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:block mx-auto max-w-7xl px-6 lg:px-8 py-3">
        <div className="mx-auto max-w-5xl rounded-full bg-white/75 backdrop-blur-lg border border-white/40 shadow-lg shadow-black/5 px-6 py-3 flex items-center justify-between">
          <Link href="#" className="shrink-0">
            <Logo variant="dark" size="md" />
          </Link>

          <nav className="flex items-center gap-6 text-[14px] font-medium text-[#273951]">
            {desktopNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-[#0EA5E9] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Link href="/signup" className="shrink-0">
            <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-5 py-[10px] h-auto text-[13px] shadow-sm transition-all duration-200 active:scale-[0.97]">
              Comenzar gratis
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 will-change-transform ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
      style={{
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

function RevealStagger({
  children,
  className = "",
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 will-change-transform ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
      style={{
        transitionDelay: `${index * 120}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
      window.location.replace("/login");
    }
  }, []);

  return (
    <main className="relative min-h-screen bg-white font-sans text-[#0d253d] selection:bg-[#0EA5E9]/20 selection:text-[#0d253d]">
      <PwaInstallPrompt />
      <StickyNav />
      {/*
        HERO SECTION
      */}
      <div className="relative pt-6 pb-16 sm:pb-20 md:pb-32 overflow-hidden">
        <GradientMesh />

        {/* Nav Bar */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-20">
          <header className="flex items-center justify-between py-4">
            <Logo variant="dark" size="md" />
            <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-[#273951]">
              <Link
                href="#features"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Características
              </Link>
              <Link
                href="#integrations"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Integraciones
              </Link>
              <Link
                href="/plans"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Planes
              </Link>
              <Link
                href="/docs"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Docs
              </Link>
            </nav>
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/signup">
                <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-6 py-5 h-auto text-[14px] shadow-sm transition-all hover:shadow-md active:scale-[0.97]">
                  Comenzar gratis
                </Button>
              </Link>
            </div>
          </header>
        </div>

        {/* Hero Content */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-12 sm:mt-16 md:mt-24 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center pb-4 sm:pb-0">
            <div className="max-w-2xl">
              <h1 className="hero-line-1 text-[36px] sm:text-[48px] lg:text-[64px] leading-[1.05] tracking-[-1.4px] font-light text-[#0d253d] [font-feature-settings:'ss01'] mb-5 sm:mb-6">
                Acelera la validación de facturas en{" "}
                <span className="bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] bg-clip-text text-transparent font-medium">
                  <TypewriterText />
                </span>
              </h1>
              <p className="hero-line-2 text-[16px] sm:text-[18px] text-[#61718a] leading-[1.6] font-light mb-6 sm:mb-8 max-w-lg">
                Procesa comprobantes, audita NCFs y centraliza los gastos de tu
                empresa sin intervención manual. La infraestructura fiscal que
                República Dominicana esperaba.
              </p>

              <div className="hero-line-3 flex flex-row items-center gap-4">
                <Link href="/login">
                  <Button className="group rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-8 py-6 h-auto text-[16px] shadow-lg shadow-[#0EA5E9]/20 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97] shrink-0">
                    Comenzar gratis{" "}
                    <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                </Link>
                <div className="flex flex-col text-[12px] sm:text-[13px] text-[#64748d] leading-tight">
                  <span className="flex items-center gap-1">
                    <Check className="size-3.5 text-green-500" /> Sin tarjeta de
                    crédito
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="size-3.5 text-green-500" /> Configuración
                    en 5 min
                  </span>
                </div>
              </div>
            </div>

            {/* Live Invoice Feed */}
            <div className="hero-mockup relative w-full aspect-[3/4] sm:aspect-[4/3] max-w-[600px] mx-auto lg:ml-auto mt-8 lg:mt-0">
              <LiveInvoiceFeed />
            </div>
          </div>
        </div>
      </div>

      {/* LOGOS MARQUEE */}
      <RevealSection>
        <LogosMarquee />
      </RevealSection>

      {/* PRODUCT VIDEO */}
      <section id="features" className="py-24 bg-[#f6f9fc]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-[34px] sm:text-[44px] font-normal leading-[1.08] tracking-[-1.2px] text-[#0d253d] mb-5">
                Del WhatsApp al reporte 606 sin teclear nada.
              </h2>
              <p className="text-[17px] text-[#273951] font-normal leading-relaxed max-w-lg mx-auto">
                Así trabaja Fintral: recibes la factura, la IA la procesa,
                valida el NCF contra la DGII y deja todo listo para exportar.
                Mientras tú haces otras cosas.
              </p>
            </div>
          </RevealSection>

          <RevealSection>
            <div className="relative mx-auto max-w-4xl rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-[#e3e8ee] bg-white">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                poster="/images/landing/product-demo-poster.jpg"
                className="w-full h-auto block"
                controls={false}
                aria-label="Video demostración de Fintral"
              >
                <source
                  src="/images/landing/product-demo.mp4"
                  type="video/mp4"
                />
                <source
                  src="/software-in-action-video-opt.webm"
                  type="video/webm"
                />
              </video>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* LEFT TEXT, RIGHT IMAGE */}
      <RevealSection>
        <section className="py-24 bg-white overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="max-w-lg">
                <h2 className="text-[36px] font-light leading-[1.1] tracking-[-0.8px] text-[#0d253d] mb-6">
                  Entiende tus gastos y planifica mejor.
                </h2>
                <p className="text-[16px] text-[#61718a] leading-relaxed mb-8">
                  Visualiza el desglose exacto de en qué invierte tu empresa.
                  Fintral categoriza automáticamente las facturas basándose en
                  el comportamiento histórico.
                </p>
                <div className="flex gap-10">
                  <div>
                    <div className="text-[24px] font-medium text-[#0d253d] [font-feature-settings:'tnum']">
                      <CountUp end={10} suffix=" hrs/sem" />
                    </div>
                    <div className="text-[13px] text-[#64748d]">
                      Ahorradas en digitación
                    </div>
                  </div>
                  <div>
                    <div className="text-[24px] font-medium text-[#0d253d] [font-feature-settings:'tnum']">
                      <CountUp end={100} suffix="%" />
                    </div>
                    <div className="text-[13px] text-[#64748d]">
                      Trazabilidad fiscal
                    </div>
                  </div>
                </div>
                <Button
                  variant="link"
                  className="group px-0 mt-8 text-[#0EA5E9] hover:text-[#0284C7] font-medium"
                >
                  Conoce más{" "}
                  <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#0EA5E9]/10 to-[#fb923c]/10 rounded-[32px] transform rotate-3 scale-105 -z-10" />
                <div className="relative w-full aspect-square rounded-[32px] shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/5 to-[#ea2261]/5 rounded-[32px]" />
                  <GrowingExpenseCard />
                </div>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* LEFT IMAGE, RIGHT TEXT */}
      <RevealSection>
        <section className="py-24 bg-[#f6f9fc] overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="relative order-2 lg:order-1">
                <div className="absolute inset-0 bg-gradient-to-br from-[#38BDF8]/20 to-[#0EA5E9]/20 rounded-[32px] transform -rotate-3 scale-105 -z-10" />
                <div className="relative w-full aspect-square rounded-[32px] shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/5 to-[#38BDF8]/10 rounded-[32px]" />
                  <BillingMetricsCard />
                </div>
              </div>
              <div className="max-w-lg order-1 lg:order-2">
                <h2 className="text-[36px] font-light leading-[1.1] tracking-[-0.8px] text-[#0d253d] mb-6">
                  Optimiza el tiempo de tu equipo.
                </h2>
                <p className="text-[16px] text-[#61718a] leading-relaxed mb-8">
                  La Inteligencia Artificial extrae los datos clave (RNC, NCF,
                  ITBIS, Montos) sin que tengas que teclear nada. Deja que el
                  software trabaje por ti.
                </p>
                <ul className="space-y-4 mb-8">
                  {[
                    "Lectura OCR avanzada",
                    "Validación cruzada inteligente",
                    "Alertas de facturas duplicadas",
                    "Cálculo automático de retenciones",
                  ].map((item, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-[15px] text-[#273951]"
                    >
                      <div className="size-5 rounded-full bg-[#0EA5E9]/10 flex items-center justify-center">
                        <Check className="size-3 text-[#0EA5E9]" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                <Button className="group rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] px-6 py-4 h-auto font-medium transition-all active:scale-[0.97]">
                  Explorar características{" "}
                  <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* INTEGRATIONS */}
      <RevealSection>
        <section
          id="integrations"
          className="py-24 bg-white border-t border-[#e3e8ee]"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div className="max-w-md">
                <h2 className="text-[36px] font-light leading-[1.1] tracking-[-0.8px] text-[#0d253d] mb-4">
                  Se integra con tus herramientas.
                </h2>
                <p className="text-[16px] text-[#61718a] leading-relaxed mb-8">
                  Fintral no reemplaza tu sistema contable, lo empodera. Envía
                  la data estructurada a tu ERP de preferencia mediante API,
                  Webhooks o archivos planos.
                </p>
                <Button
                  variant="link"
                  className="group px-0 text-[#0EA5E9] hover:text-[#0284C7] font-medium"
                >
                  Ver todas las integraciones{" "}
                  <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </div>
              <IntegrationsGrid />
            </div>
          </div>
        </section>
      </RevealSection>

      {/* PRICING */}
      <RevealSection>
        <PricingSection />
      </RevealSection>

      {/* TESTIMONIAL */}
      <RevealSection>
        <section id="testimonials" className="py-24 bg-[#f6f9fc]">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="bg-white rounded-[24px] p-8 md:p-12 border border-[#e3e8ee] shadow-sm flex flex-col md:flex-row items-center gap-12">
              <div className="w-full md:w-1/3 shrink-0">
                <div className="aspect-[4/5] rounded-2xl overflow-hidden relative">
                  <Image
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=1000&fit=crop&crop=faces"
                    alt="Laura Rosario"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl text-center">
                    <div className="font-medium text-[14px]">Laura Rosario</div>
                    <div className="text-[11px] text-[#64748d]">
                      Contadora independiente · Santo Domingo
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full md:w-2/3">
                <div className="flex items-center gap-2 mb-6">
                  <Logo variant="dark" size="md" />
                </div>
                <p className="text-[20px] md:text-[24px] font-light leading-[1.45] text-[#0d253d] mb-8">
                  &ldquo;Yo llevo 8 años llevando la contabilidad de unas 40
                  empresas pequeñas. Cada fin de mes es lo mismo: me llegan
                  facturas por WhatsApp, por correo, algunas en foto que no se
                  lee nada. Y yo tengo que armar el reporte 606 a mano, revisar
                  que los NCFs estén vigentes, calcular las retenciones&hellip;
                  Si de verdad hay algo que automatice eso sin que yo tenga que
                  estar detrás de cada papel, me interesa.&rdquo;
                </p>
                <div className="flex gap-10 border-t border-[#e3e8ee] pt-6">
                  <div>
                    <div className="text-[28px] font-light text-[#0d253d] [font-feature-settings:'tnum']">
                      <CountUp end={40} suffix="+" />
                    </div>
                    <div className="text-[12px] text-[#64748d]">
                      Empresas gestionadas
                    </div>
                  </div>
                  <div>
                    <div className="text-[28px] font-light text-[#0d253d] [font-feature-settings:'tnum']">
                      <CountUp end={2000} suffix="+" />
                    </div>
                    <div className="text-[12px] text-[#64748d]">
                      Facturas mensuales
                    </div>
                  </div>
                  <div>
                    <div className="text-[28px] font-light text-[#0d253d] [font-feature-settings:'tnum']">
                      <CountUp end={8} suffix=" años" />
                    </div>
                    <div className="text-[12px] text-[#64748d]">
                      De experiencia
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* BOTTOM CTA */}
      <RevealSection>
        <section id="cta" className="py-24 bg-[#f6f9fc]">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="relative rounded-[32px] overflow-hidden bg-[#0d253d]">
              <div className="absolute inset-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0EA5E9]/20 rounded-full blur-[120px] -mr-32 -mt-32" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#38BDF8]/10 rounded-full blur-[100px] -ml-24 -mb-24" />
              </div>

              <div className="relative py-20 px-8 md:px-16 text-center md:text-left md:flex justify-between items-center">
                <div className="max-w-xl text-white mb-8 md:mb-0">
                  <h2 className="text-[32px] sm:text-[44px] font-light leading-[1.1] tracking-[-1px] mb-4">
                    ¿Interesado?{" "}
                    <span className="bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] bg-clip-text text-transparent font-medium">
                      Contactanos y recibe más información
                    </span>
                  </h2>
                  <p className="text-[16px] text-[#a8c3de] font-light leading-relaxed">
                    Forma parte de los primeros en probar Fintral y ayúdanos a
                    mejorar
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
                  <Link href="https://wa.me/18293758414?text=Hola%2C%20estoy%20interesado%20en%20Fintral%20y%20me%20gustar%C3%ADa%20recibir%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20servicios.">
                    <Button className="group rounded-full bg-white text-[#0d253d] hover:bg-[#f6f9fc] font-medium px-8 py-6 h-auto text-[16px] shadow-xl shadow-black/20 transition-all hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.97]">
                      Contactarnos{" "}
                      <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* FOOTER */}
      <footer className="border-t border-[#e3e8ee] bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Logo variant="dark" size="md" />
              <p className="text-[12px] text-[#64748d] mt-3 leading-relaxed">
                Infraestructura fiscal para empresas en República Dominicana.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Producto
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>OCR inteligente</li>
                <li>Validación NCF DGII</li>
                <li>Reporte 606 automático</li>
                <li>Exportación a ERP</li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Recursos
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>
                  <Link
                    href="/plans"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Planes
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Documentación
                  </Link>
                </li>
                <li>
                  <Link
                    href="/plans/terms"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Términos y condiciones
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Integraciones
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>QuickBooks</li>
                <li>Excel / Google Sheets</li>
                <li>WhatsApp Business</li>
                <li>API &amp; Webhooks</li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Cumplimiento
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>Normativa DGII</li>
                <li>NCF / e-NCF</li>
                <li>Retenciones ITBIS</li>
                <li>Auditoría fiscal</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#e3e8ee] pt-6 flex flex-col md:flex-row justify-between items-center text-[12px] text-[#a8c3de]">
            <p>
              &copy; {new Date().getFullYear()} Fintral. Financial
              infrastructure.
            </p>
            <p className="mt-2 md:mt-0">Santo Domingo, República Dominicana</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
