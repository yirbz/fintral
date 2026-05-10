import Link from "next/link";
import { ArrowRight, CheckCircle2, Smartphone, Brain, ShieldCheck, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b1120]">
      {/* Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_hsl(199_89%_48%_/_12%),_transparent_60%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-6 py-8">
        {/* Nav */}
        <header className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 backdrop-blur-lg">
          <Logo variant="light" size="md" />
          <Link href="/login">
            <Button size="sm" className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
              Ingresar
            </Button>
          </Link>
        </header>

        {/* Hero */}
        <section className="mt-20 grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col gap-7">
            <Badge className="w-fit uppercase tracking-widest text-[10px] bg-sky-400/10 text-sky-400 border-sky-400/20 hover:bg-sky-400/15">
              <Zap className="size-3 mr-1" />
              IA + Cumplimiento Fiscal RD
            </Badge>
            <h1 className="text-5xl font-light tracking-tight text-white leading-[1.1]">
              Convierte facturas en{" "}
              <span className="bg-gradient-to-r from-sky-400 to-sky-300 bg-clip-text text-transparent font-medium">
                datos contables
              </span>{" "}
              confiables.
            </h1>
            <p className="max-w-lg text-base text-sky-100/50 leading-relaxed">
              Centraliza captura web + WhatsApp, extracción inteligente, validaciones fiscales y salidas para
              DGII, ERP y BI.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link href="/login">
                <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30 h-10 px-5 text-sm hover:-translate-y-0.5 transition-all duration-200">
                  Acceso privado
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Flow card */}
          <Card className="overflow-hidden border-white/[0.08] bg-white/[0.03] backdrop-blur-sm shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-sky-500 via-sky-400 to-sky-300" />
            <CardHeader>
              <CardTitle className="text-base text-white">Operación en un solo flujo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-sky-100/50">
              {[
                "Carga por web o WhatsApp.",
                "Extracción + auditoría con IA.",
                "Revisión humana asistida.",
                "Exportaciones y webhooks automáticos."
              ].map((line) => (
                <div className="flex items-center gap-3" key={line}>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-400/10 ring-1 ring-sky-400/20">
                    <CheckCircle2 className="size-3.5 text-sky-400" />
                  </div>
                  <span>{line}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section className="mt-28 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Captura Múltiple",
              desc: "Web, email y WhatsApp en un solo lugar.",
              icon: <Smartphone className="size-6" />
            },
            {
              title: "Inteligencia Artificial",
              desc: "GPT-4Vision extrae datos con 99% de precisión.",
              icon: <Brain className="size-6" />
            },
            {
              title: "Cumplimiento DGII",
              desc: "Validaciones NCF automáticas para República Dominicana.",
              icon: <ShieldCheck className="size-6" />
            }
          ].map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:bg-white/[0.04] hover:border-sky-400/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/20">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-base font-medium text-white">{feature.title}</h3>
              <p className="text-sm text-sky-100/40 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </section>

        <footer className="mt-28 border-t border-white/[0.06] py-8 text-center text-xs text-sky-100/30">
          <p>&copy; 2026 Fintral. Financial infrastructure.</p>
        </footer>
      </div>
    </main>
  );
}