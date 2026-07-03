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
    <main className="relative min-h-screen bg-white font-sans text-[#0d253d] brand-selection overflow-hidden">
      {/* ── Hero mini ── */}
      <div className="relative pt-6 pb-20 sm:pb-24 overflow-hidden">
        <GradientMesh />

        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-20">
          <header className="flex items-center justify-between py-4">
            <Link href="/" className="transition-transform active:scale-[0.98]">
              <Logo variant="dark" size="md" />
            </Link>
            <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-[#273951]">
              <Link href="/#features" className="hover:text-[#0EA5E9] transition-colors">Características</Link>
              <Link href="/#integrations" className="hover:text-[#0EA5E9] transition-colors">Integraciones</Link>
              <Link href="/plans" className="text-[#0EA5E9] transition-colors">Planes</Link>
              <Link href="/docs" className="hover:text-[#0EA5E9] transition-colors">Docs</Link>
            </nav>
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/login">
                <Button variant="outline" className="rounded-full font-medium px-5 py-4 h-auto text-[13px] border-[#e3e8ee] hover:bg-[#f6f9fc] text-[#0d253d] transition-all active:scale-[0.97]">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-5 py-4 h-auto text-[13px] shadow-sm transition-all active:scale-[0.97]">
                  Comenzar gratis
                </Button>
              </Link>
            </div>
          </header>
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-16 sm:mt-20 relative z-10 text-center animate-mesh-reveal">
          <h1 className="text-[44px] sm:text-[60px] lg:text-[68px] leading-[1.05] tracking-[-1.5px] font-light text-[#0d253d] mb-6 font-brand">
            Planes y precios
          </h1>
          <p className="text-[17px] sm:text-[19px] text-[#61718a] leading-[1.6] font-light max-w-lg mx-auto">
            Todo lo que necesitas para automatizar la gestión fiscal de tu empresa. Sin sorpresas.
          </p>
        </div>
      </div>

      {/* ── Pricing ── */}
      <PricingSection showHeader={false} />

      {/* ── Comparison Table ── */}
      <section className="py-24 bg-white border-t border-[#e3e8ee]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0EA5E9] mb-3">
              Detalles
            </p>
            <h2 className="text-[32px] sm:text-[38px] font-light leading-[1.1] tracking-[-0.8px] text-[#0d253d] mb-4 font-brand">
              Comparativa completa
            </h2>
            <p className="text-[15px] text-[#61718a] leading-relaxed font-light">
              Todos los detalles de lo que incluye cada plan.
            </p>
          </div>

          <div className="max-w-4xl mx-auto overflow-x-auto rounded-2xl border border-[#e3e8ee] shadow-brand">
            <table className="w-full text-[14px] border-collapse bg-white">
              <thead>
                <tr className="border-b border-[#e3e8ee] bg-[#f6f9fc]/50">
                  <th className="text-left py-4 px-6 text-[#64748d] font-semibold text-[11px] uppercase tracking-[0.1em]">Característica</th>
                  <th className="text-center py-4 px-6 text-[#0d253d] font-medium">Inicial</th>
                  <th className="text-center py-4 px-6 text-[#0EA5E9] font-semibold bg-[#0EA5E9]/[0.03] border-x border-[#e3e8ee]/40">Profesional</th>
                  <th className="text-center py-4 px-6 text-[#0d253d] font-medium">Despacho Contable</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["e-CF (Fact. Electrónica DGII)", "No incluido — bloques desde RD$ 950/100", "No incluido — bloques desde RD$ 950/100", "No incluido — bloques desde RD$ 950/100"],
                  ["e-CF pago por uso", "RD$ 12.00 / doc", "RD$ 12.00 / doc", "RD$ 12.00 / doc"],
                  ["Documentos OCR / mes", "50 / mes", "500 / mes (IA)", "1,000 / mes (Pool firma)"],
                  ["Consultas IA / mes", "150 / mes", "1,000 / mes", "10,000 / mes"],
                  ["Bloque IA adicional (500 consultas)", "RD$ 600", "RD$ 600", "RD$ 600"],
                  ["Almacenamiento", "500 MB", "5 GB", "25 GB"],
                  ["Bloque almacenamiento (10 GB)", "RD$ 300 / mes", "RD$ 300 / mes", "RD$ 300 / mes"],
                  ["Usuarios incluidos", "3", "10", "Ilimitados"],
                  ["Usuario adicional", "RD$ 300 / mes c/u", "RD$ 300 / mes c/u", "N/A"],
                  ["Entidades incluidas", "1", "5", "20"],
                  ["Entity Slot adicional", "RD$ 600 / mes c/u", "RD$ 600 / mes c/u", "RD$ 600 / mes c/u"],
                  ["Dashboard Multi-Entidad", "—", "—", "Sí (Firma + Clientes)"],
                  ["Validación NCF DGII", "Sí", "Sí", "Sí"],
                  ["Reporte 606", "Automático (IA)", "Automático (IA)", "Automático (IA)"],
                  ["Reportes 607 / 608", "—", "Sí", "Sí (Automáticos)"],
                  ["WhatsApp Business", "—", "Sí", "Sí"],
                  ["API y Webhooks", "—", "Sí", "Sí"],
                  ["Integración ERP (QuickBooks/Odoo)", "—", "—", "Sí"],
                  ["Soporte técnico", "Email", "Prioritario (Email/Chat)", "Dedicado 24/7 + WhatsApp"],
                ].map(([feature, basic, pro, enterprise], i) => (
                  <tr key={i} className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/20 transition-colors">
                    <td className="py-4 px-6 text-[#273951] font-light">{feature}</td>
                    {[basic, pro, enterprise].map((val, j) => (
                      <td key={j} className={cn(
                        "text-center py-4 px-6 font-light text-[13px]",
                        j === 1 && "bg-[#0EA5E9]/[0.03] border-x border-[#e3e8ee]/40 text-[#0EA5E9] font-normal",
                        val === "Sí" ? "text-[#0EA5E9]" : val === "—" ? "text-[#a8c3de]" : "text-[#0d253d]",
                        // Apply tabular numerals to numeric metrics or pricing
                        (val.match(/\d/) || val.includes("Ilimitado") || val.includes("Adicional") || val.includes("excedente")) && "tabular-nums font-medium"
                      )}>
                        {val === "Sí" ? <Check className="size-4 mx-auto text-[#0EA5E9]" /> : val}
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
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0EA5E9] mb-3">
              FAQ
            </p>
            <h2 className="text-[32px] sm:text-[38px] font-light leading-[1.1] tracking-[-0.8px] text-[#0d253d] mb-4 font-brand">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {[
              {
                q: "¿Puedo cambiar de plan en cualquier momento?",
                a: "Sí. Puedes migrar a un plan superior o inferior en cualquier momento. Los cambios se aplican al siguiente ciclo de facturación de manera inmediata y prorrateada."
              },
              {
                q: "¿Qué métodos de pago aceptan?",
                a: "Aceptamos transferencias bancarias (RD), tarjetas de crédito/débito y pagos seguros a través de nuestra pasarela asociada MIO."
              },
              {
                q: "¿Ofrecen período de prueba gratuito?",
                a: "Sí, todos los planes incluyen 7 días de prueba gratuita completa con todos los módulos activos sin necesidad de ingresar tarjeta de crédito."
              },
              {
                q: "¿Los precios incluyen ITBIS?",
                a: "No. Los precios mostrados no incluyen ITBIS. El impuesto se calculará de manera transparente y se añadirá en la facturación correspondiente."
              },
              {
                q: "¿Puedo cancelar mi suscripción?",
                a: "Sí, puedes cancelar en cualquier momento de manera simple desde tu panel de configuración. Seguirás teniendo acceso a tu cuenta hasta finalizar el ciclo de facturación pagado."
              },
            ].map((faq, i) => (
              <details key={i} className="group bg-white rounded-xl border border-[#e3e8ee] open:shadow-brand transition-all duration-300">
                <summary className="flex items-center justify-between p-5 cursor-pointer text-[15px] font-medium tracking-tight text-[#0d253d] list-none select-none">
                  {faq.q}
                  <span className="text-[#a8c3de] group-open:rotate-180 transition-transform duration-200 text-lg leading-none">▾</span>
                </summary>
                <p className="px-5 pb-5 text-[14px] text-[#64748d] leading-relaxed font-light">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-[#0d253d] relative overflow-hidden">
        {/* Subtle mesh overlay for the dark CTA */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0EA5E9]/10 via-transparent to-transparent opacity-60 pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-[36px] sm:text-[44px] font-light leading-[1.1] tracking-[-1px] text-white mb-4 font-brand">
            ¿Listo para empezar?
          </h2>
          <p className="text-[17px] text-[#a8c3de] font-light max-w-md mx-auto mb-10 leading-relaxed">
            Únete a las empresas que ya confían en Fintral para su gestión fiscal y automatización de comprobantes.
          </p>
          <Link href="/signup">
            <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-8 py-6 h-auto text-[16px] shadow-lg shadow-black/35 transition-all hover:-translate-y-0.5 active:scale-[0.97] transform-gpu">
              Comenzar gratis <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#e3e8ee] bg-white py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo variant="dark" size="md" />
              <p className="text-[13px] text-[#64748d] mt-4 leading-relaxed font-light">
                Infraestructura fiscal de alta tecnología para empresas en la República Dominicana.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0d253d] mb-4">Producto</h4>
              <ul className="space-y-2.5 text-[13px] text-[#64748d] font-light">
                <li>OCR inteligente</li>
                <li>Validación NCF DGII</li>
                <li>Reporte 606 automático</li>
                <li>Exportación a ERP</li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0d253d] mb-4">Recursos</h4>
              <ul className="space-y-2.5 text-[13px] text-[#64748d] font-light">
                <li><Link href="/plans" className="hover:text-[#0EA5E9] transition-colors">Planes y Precios</Link></li>
                <li><Link href="/docs" className="hover:text-[#0EA5E9] transition-colors">Documentación</Link></li>
                <li><Link href="/docs/profesional/terminos" className="hover:text-[#0EA5E9] transition-colors">Términos legales</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0d253d] mb-4">Cumplimiento</h4>
              <ul className="space-y-2.5 text-[13px] text-[#64748d] font-light">
                <li>Normativa DGII</li>
                <li>NCF / e-NCF</li>
                <li>Retenciones ITBIS</li>
                <li>Auditoría fiscal</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#e3e8ee] pt-8 flex flex-col md:flex-row justify-between items-center text-[13px] text-[#64748d] font-light">
            <p>&copy; {new Date().getFullYear()} Fintral. Todos los derechos reservados.</p>
            <p className="mt-2 md:mt-0 font-light">Santo Domingo, República Dominicana</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
