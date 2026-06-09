"use client"

import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { cn } from "@/lib/utils"
import { GradientMesh } from "@/components/landing/GradientMesh"
import { PricingSection } from "@/components/plans/PricingSection"

export default function PlansClient() {
  return (
    <main className="relative min-h-screen bg-white font-sans text-[#0d253d] brand-selection">
      {/* ── Hero mini ── */}
      <div className="relative pt-6 pb-16 sm:pb-20 overflow-hidden">
        <GradientMesh />

        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-20">
          <header className="flex items-center justify-between py-4">
            <Link href="/">
              <Logo variant="dark" size="md" />
            </Link>
            <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-[#273951]">
              <Link href="/#features" className="hover:text-[#0EA5E9] transition-colors">Características</Link>
              <Link href="/plans" className="text-[#533afd] transition-colors">Planes</Link>
              <Link href="/docs" className="hover:text-[#0EA5E9] transition-colors">Docs</Link>
            </nav>
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/login">
                <Button variant="outline" className="rounded-full font-medium px-5 py-5 h-auto text-[13px]">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="rounded-full bg-[#1c1e54] text-white hover:bg-[#0d253d] font-medium px-5 py-5 h-auto text-[13px] shadow-sm transition-all active:scale-[0.97]">
                  Comenzar gratis
                </Button>
              </Link>
            </div>
          </header>
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-12 sm:mt-16 relative z-10 text-center">
          <h1 className="text-[40px] sm:text-[56px] lg:text-[64px] leading-[1.05] tracking-[-1.4px] font-light text-[#0d253d] mb-5">
            Planes y precios
          </h1>
          <p className="text-[16px] sm:text-[18px] text-[#61718a] leading-[1.6] font-light max-w-lg mx-auto">
            Todo lo que necesitas para automatizar la gestión fiscal de tu empresa. Sin sorpresas.
          </p>
        </div>
      </div>

      {/* ── Pricing ── */}
      <PricingSection showHeader={false} />

      {/* ── Comparison Table ── */}
      <section className="py-24 bg-white border-t border-[#e3e8ee]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[32px] font-light leading-[1.1] tracking-[-0.64px] text-[#0d253d] mb-4">
              Comparativa completa
            </h2>
            <p className="text-[16px] text-[#61718a] leading-relaxed">
              Todos los detalles de lo que incluye cada plan.
            </p>
          </div>

          <div className="max-w-3xl mx-auto overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[#e3e8ee]">
                  <th className="text-left py-3 pr-6 text-[#64748d] font-medium">Característica</th>
                  <th className="text-center py-3 px-4 text-[#0d253d] font-medium">Inicial</th>
                  <th className="text-center py-3 px-4 text-[#533afd] font-medium bg-[#533afd]/5">Profesional</th>
                  <th className="text-center py-3 px-4 text-[#0d253d] font-medium">Empresarial</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Facturas al mes", "100", "500", "Ilimitadas"],
                  ["Usuarios", "1", "3", "Ilimitados"],
                  ["OCR básico", "Sí", "Sí", "Sí"],
                  ["OCR avanzado + IA", "—", "Sí", "Sí"],
                  ["AI Vision completo", "—", "—", "Sí"],
                  ["Validación NCF DGII", "Sí", "Sí", "Sí"],
                  ["Reporte 606 manual", "Sí", "—", "—"],
                  ["Reporte 606 automático", "—", "Sí", "Sí"],
                  ["Reportes 607/608", "—", "—", "Sí"],
                  ["WhatsApp Business", "—", "Sí", "Sí"],
                  ["API y Webhooks", "—", "Sí", "Sí"],
                  ["Integración ERP", "—", "—", "Sí"],
                  ["Soporte", "Email", "Prioritario", "Dedicado 24/7"],
                ].map(([feature, basic, pro, enterprise], i) => (
                  <tr key={i} className="border-b border-[#e3e8ee]/60">
                    <td className="py-3 pr-6 text-[#273951]">{feature}</td>
                    {[basic, pro, enterprise].map((val, j) => (
                      <td key={j} className={cn(
                        "text-center py-3 px-4",
                        j === 1 && "bg-[#533afd]/5",
                        val === "Sí" ? "text-[#533afd]" : val === "—" ? "text-[#a8c3de]" : "text-[#0d253d]",
                      )}>
                        {val === "Sí" ? <Check className="size-4 mx-auto" /> : val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-[#f6f9fc]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[32px] font-light leading-[1.1] tracking-[-0.64px] text-[#0d253d] mb-4">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {[
              {
                q: "¿Puedo cambiar de plan en cualquier momento?",
                a: "Sí. Puedes migrar a un plan superior o inferior en cualquier momento. Los cambios se aplican al siguiente ciclo de facturación."
              },
              {
                q: "¿Qué métodos de pago aceptan?",
                a: "Aceptamos transferencias bancarias (RD), tarjetas de crédito/débito y pagos en efectivo a través de nuestras entidades aliadas."
              },
              {
                q: "¿Ofrecen período de prueba gratuito?",
                a: "Sí, todos los planes incluyen 7 días de prueba gratuita sin necesidad de registrar tarjeta de crédito."
              },
              {
                q: "¿Los precios incluyen ITBIS?",
                a: "No. Los precios mostrados no incluyen ITBIS. El impuesto se añadirá en la facturación correspondiente."
              },
              {
                q: "¿Puedo cancelar mi suscripción?",
                a: "Sí, puedes cancelar en cualquier momento desde tu panel de control. Seguirás teniendo acceso hasta el final del período facturado."
              },
            ].map((faq, i) => (
              <details key={i} className="group bg-white rounded-xl border border-[#e3e8ee] open:shadow-sm transition-shadow">
                <summary className="flex items-center justify-between p-5 cursor-pointer text-[14px] font-medium text-[#0d253d] list-none">
                  {faq.q}
                  <span className="text-[#a8c3de] group-open:rotate-180 transition-transform text-lg leading-none">▾</span>
                </summary>
                <p className="px-5 pb-5 text-[13px] text-[#64748d] leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-[#0d253d]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-[32px] sm:text-[40px] font-light leading-[1.1] tracking-[-0.8px] text-white mb-4">
            ¿Listo para empezar?
          </h2>
          <p className="text-[16px] text-[#a8c3de] font-light max-w-md mx-auto mb-8">
            Únete a las empresas que ya confían en Fintral para su gestión fiscal.
          </p>
          <Link href="/signup">
            <Button className="rounded-full bg-[#533afd] text-white hover:bg-[#4434d4] font-medium px-8 py-6 h-auto text-[16px] shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 active:scale-[0.97]">
              Comenzar gratis <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#e3e8ee] bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Logo variant="dark" size="md" />
              <p className="text-[12px] text-[#64748d] mt-3 leading-relaxed">
                Infraestructura fiscal para empresas en República Dominicana.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">Producto</h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>OCR inteligente</li>
                <li>Validación NCF DGII</li>
                <li>Reporte 606 automático</li>
                <li>Exportación a ERP</li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">Recursos</h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li><Link href="/plans" className="hover:text-[#533afd] transition-colors">Planes</Link></li>
                <li><Link href="/docs" className="hover:text-[#533afd] transition-colors">Documentación</Link></li>
                <li><Link href="/plans/terms" className="hover:text-[#533afd] transition-colors">Términos y condiciones</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">Cumplimiento</h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>Normativa DGII</li>
                <li>NCF / e-NCF</li>
                <li>Retenciones ITBIS</li>
                <li>Auditoría fiscal</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#e3e8ee] pt-6 flex flex-col md:flex-row justify-between items-center text-[12px] text-[#a8c3de]">
            <p>&copy; {new Date().getFullYear()} Fintral. Financial infrastructure.</p>
            <p className="mt-2 md:mt-0">Santo Domingo, República Dominicana</p>
          </div>
        </div>
      </footer>
    </main>
  )
}


