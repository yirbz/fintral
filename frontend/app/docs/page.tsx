import Link from "next/link"
import { ArrowRight, BookOpen, Shield, FileText } from "lucide-react"

export default function DocsPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Documentación Legal de Fintral
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Guía de Cumplimiento
        </p>
      </div>

      <div className="prose prose-slate font-light text-[15px] leading-relaxed text-[#273951] space-y-4">
        <p>
          Bienvenido a la sección de documentación legal y comercial de <strong>Fintral</strong>. Aquí detallamos los acuerdos de nivel de servicio (SLA), términos de facturación, condiciones generales de uso de nuestra infraestructura fiscal y las particularidades operativas de cada uno de nuestros planes.
        </p>
        <p>
          Esta sección está diseñada para proporcionar total transparencia a los equipos contables, de compras, legales y gerenciales sobre cómo opera nuestra plataforma bajo el marco regulatorio tributario de la República Dominicana.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 pt-4">
        <Link href="/docs/terms-conditions" className="group p-5 rounded-2xl border border-[#e3e8ee] hover:border-[#0EA5E9] hover:shadow-brand transition-all bg-[#f6f9fc]/30">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="size-5 text-[#0EA5E9]" />
            <h3 className="text-[16px] font-semibold text-[#0d253d]">Términos Generales</h3>
          </div>
          <p className="text-[13px] text-[#64748d] leading-normal font-light">
            Las bases legales generales sobre el uso de la plataforma, cuentas de usuario y límites de responsabilidad fiscal.
          </p>
          <div className="flex items-center gap-1 text-[12px] font-medium text-[#0EA5E9] mt-4 group-hover:underline">
            Ver términos generales <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>

        <Link href="/docs/plans/profesional" className="group p-5 rounded-2xl border border-[#e3e8ee] hover:border-[#0EA5E9] hover:shadow-brand transition-all bg-[#f6f9fc]/30">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="size-5 text-[#0EA5E9]" />
            <h3 className="text-[16px] font-semibold text-[#0d253d]">Plan Profesional</h3>
          </div>
          <p className="text-[13px] text-[#64748d] leading-normal font-light">
            Estructuras de precios, cuotas de procesamiento (500 facturas/mes), soporte y restricciones de API del Plan Profesional.
          </p>
          <div className="flex items-center gap-1 text-[12px] font-medium text-[#0EA5E9] mt-4 group-hover:underline">
            Ver detalles del plan <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>

        <Link href="/docs/plans/empresarial" className="group p-5 rounded-2xl border border-[#e3e8ee] hover:border-[#0EA5E9] hover:shadow-brand transition-all bg-[#f6f9fc]/30 sm:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="size-5 text-[#0EA5E9]" />
            <h3 className="text-[16px] font-semibold text-[#0d253d]">Plan Empresarial</h3>
          </div>
          <p className="text-[13px] text-[#64748d] leading-normal font-light">
            Garantías de disponibilidad del sistema (99.9% Uptime), acuerdos de nivel de servicio (SLA), integraciones directas con ERP y facturación corporativa a crédito.
          </p>
          <div className="flex items-center gap-1 text-[12px] font-medium text-[#0EA5E9] mt-4 group-hover:underline">
            Ver detalles del plan <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>
    </article>
  )
}
