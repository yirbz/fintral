"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { GradientMesh } from "@/components/landing/GradientMesh"

export default function TermsClient() {
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
              <Link href="/plans" className="hover:text-[#0EA5E9] transition-colors">Planes</Link>
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
          <h1 className="text-[40px] sm:text-[48px] leading-[1.05] tracking-[-1.4px] font-light text-[#0d253d] mb-5">
            Términos y condiciones
          </h1>
          <p className="text-[16px] sm:text-[18px] text-[#61718a] leading-[1.6] font-light max-w-lg mx-auto">
            Los detalles legales de nuestros planes y servicios.
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="prose prose-sm max-w-none text-[#273951]">
            <p className="text-[14px] text-[#64748d] mb-8">Última actualización: Junio 2026</p>

            <Section title="1. Aceptación de los términos">
              <p>Al contratar cualquiera de los planes ofrecidos por Fintral (en adelante, &laquo;la plataforma&raquo;), el usuario acepta los siguientes términos y condiciones. Si no está de acuerdo con estos términos, no debe utilizar los servicios de pago de la plataforma.</p>
            </Section>

            <Section title="2. Planes y precios">
              <p>Fintral ofrece los siguientes planes de suscripción:</p>
              <ul>
                <li><strong>Inicial</strong> — Orientado a freelancers y contadores independientes. Incluye 100 facturas al mes, 1 usuario y OCR básico.</li>
                <li><strong>Profesional</strong> — Orientado a equipos en crecimiento. Incluye 500 facturas al mes, 3 usuarios, OCR avanzado con IA y reporte 606 automático.</li>
                <li><strong>Empresarial</strong> — Orientado a empresas con alto volumen. Incluye facturas ilimitadas, usuarios ilimitados, AI Vision, reportes DGII completos (606/607/608), API, Webhooks e integración con ERP.</li>
              </ul>
              <p>Los precios están expresados en Pesos Dominicanos (DOP) y no incluyen ITBIS. Fintral se reserva el derecho de modificar los precios con una notificación previa de al menos 30 días.</p>
            </Section>

            <Section title="3. Períodos de facturación">
              <p>Ofrecemos tres modalidades de facturación:</p>
              <ul>
                <li><strong>Mensual (1 mes):</strong> Facturación cada mes. Sin compromiso mínimo.</li>
                <li><strong>Trimestral (3 meses):</strong> Facturación cada 3 meses con un 10% de descuento sobre el precio mensual.</li>
                <li><strong>Anual (12 meses):</strong> Facturación una vez al año con un 20% de descuento sobre el precio mensual.</li>
              </ul>
            </Section>

            <Section title="4. Período de prueba">
              <p>Todos los planes incluyen un período de prueba gratuito de 7 días sin necesidad de registrar una tarjeta de crédito. Al finalizar el período de prueba, el usuario deberá seleccionar un plan de pago para continuar utilizando la plataforma.</p>
            </Section>

            <Section title="5. Facturación y pagos">
              <p>Los pagos se procesarán al inicio de cada período de facturación. El usuario autoriza a Fintral a realizar los cobros correspondientes según el plan y período seleccionado. En caso de fallo en el pago, Fintral se reserva el derecho de suspender el acceso a la plataforma hasta que se regularice la situación.</p>
            </Section>

            <Section title="6. Cancelación y reembolsos">
              <p>El usuario puede cancelar su suscripción en cualquier momento desde el panel de control. Al cancelar, el usuario seguirá teniendo acceso a la plataforma hasta el final del período de facturación actual. No se realizarán reembolsos parciales por períodos no utilizados.</p>
            </Section>

            <Section title="7. Cambios de plan">
              <p>El usuario puede migrar a un plan superior o inferior en cualquier momento. Las mejoras de plan se aplican de inmediato y se prorratea el costo restante del ciclo actual. Las reducciones de plan se aplican al siguiente ciclo de facturación.</p>
            </Section>

            <Section title="8. Uso aceptable">
              <p>El usuario se compromete a utilizar la plataforma únicamente para fines legales y de acuerdo con la normativa fiscal de la República Dominicana. Queda prohibido el uso de la plataforma para actividades fraudulentas o ilegales.</p>
            </Section>

            <Section title="9. Limitación de responsabilidad">
              <p>Fintral no se hace responsable por daños directos, indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso de la plataforma. La plataforma se proporciona &laquo;tal cual&raquo; y &laquo;según disponibilidad&raquo;.</p>
            </Section>

            <Section title="10. Privacidad y datos">
              <p>El tratamiento de datos personales se rige por nuestra Política de Privacidad. Los datos fiscales procesados en la plataforma son propiedad del usuario y Fintral actúa únicamente como procesador de datos.</p>
            </Section>

            <Section title="11. Modificaciones">
              <p>Fintral se reserva el derecho de modificar estos términos y condiciones en cualquier momento. Los cambios serán notificados a los usuarios con al menos 15 días de anticipación a través del correo electrónico registrado.</p>
            </Section>

            <Section title="12. Legislación aplicable">
              <p>Estos términos y condiciones se rigen por las leyes de la República Dominicana. Cualquier disputa será sometida a los tribunales competentes de Santo Domingo, República Dominicana.</p>
            </Section>

            <Section title="13. Contacto">
              <p>Para cualquier pregunta sobre estos términos, puedes contactarnos a través de nuestro <Link href="https://docs.google.com/forms/d/e/1FAIpQLSfJKt5ZVnPw5RJGVbh1CpiihMXxd1QUb4p47MC8qwyHsAGnzg/viewform" className="text-[#533afd] hover:underline">formulario de contacto</Link>.</p>
            </Section>
          </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-[18px] font-medium text-[#0d253d] mb-3">{title}</h2>
      <div className="text-[14px] text-[#273951] leading-relaxed space-y-2 [&_ul]:pl-5 [&_li]:mb-1.5 [&_ul]:list-disc">
        {children}
      </div>
    </div>
  )
}
