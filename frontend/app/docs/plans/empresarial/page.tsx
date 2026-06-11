import { CheckCircle2 } from "lucide-react"

export default function EmpresarialPlanPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Detalles del Plan Empresarial
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Planes Comerciales Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        El plan <strong>Empresarial</strong> está diseñado específicamente para corporaciones y organizaciones con grandes volúmenes de facturación que requieren integraciones a la medida con sus sistemas ERP y soporte especializado de alta disponibilidad.
      </p>

      {/* ── PRECIOS ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Estructura de Precios</h2>
        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Período</th>
                <th className="p-4 font-semibold text-right">Precio Total</th>
                <th className="p-4 font-semibold text-right">Ahorro</th>
                <th className="p-4 font-semibold text-right text-[#0EA5E9]">Efectivo/mes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">1 Mes</td>
                <td className="p-4 text-right">RD$ 8,000.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 8,000.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses (Trimestral)</td>
                <td className="p-4 text-right">RD$ 21,600.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 7,200.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 76,800.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">20%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 6,400.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#64748d] italic">
          * Los precios están expresados en Pesos Dominicanos (DOP) y no incluyen ITBIS.
        </p>
      </section>

      {/* ── CARACTERISTICAS ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Características Incluidas</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 list-none">
          {[
            "Facturas ilimitadas sin cupo mensual",
            "Usuarios ilimitados para la organización",
            "OCR + AI Vision completo en alta resolución",
            "Validación NCF en tiempo real contra DGII",
            "Reportes fiscales completos (606, 607, 608)",
            "Gerente de cuenta técnico y onboarding guiado",
            "Integraciones directas nativas con ERP",
            "Soporte prioritario 24/7 y SLA garantizado"
          ].map((feat, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-[#273951]">
              <CheckCircle2 className="size-4 text-[#0EA5E9] shrink-0" />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── SLA Y TÉRMINOS ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Acuerdos de Nivel de Servicio (SLA)</h2>
        <p>
          Fintral garantiza un Uptime de infraestructura del 99.9% en el ciclo mensual. Si la disponibilidad se viera afectada, se aplicarán créditos a la siguiente facturación de acuerdo a las siguientes escalas de penalización:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-[14px]">
          <li>Uptime menor al 99.9%: 5% de descuento en la siguiente factura.</li>
          <li>Uptime menor al 99.0%: 10% de descuento en la siguiente factura.</li>
          <li>Uptime menor al 95.0%: 25% de descuento en la siguiente factura (tope máximo permitido).</li>
        </ul>

        <div className="pt-4 space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Seguridad y Aislamiento de Datos</h3>
            <p>
              El plan Empresarial implementa rigurosos protocolos de ciberseguridad industrial, incluyendo cifrado AES-256 en reposo, TLS 1.3 en tránsito, bitácoras completas de auditoría para cada acceso al sistema y bases de datos lógicas aisladas.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Propiedad y Confidencialidad de los Datos</h3>
            <p>
              Todos los datos procesados son propiedad exclusiva del cliente. Fintral actúa únicamente como procesador de datos. Ambas partes suscriben una cláusula de no divulgación de información confidencial aplicable por un plazo de 5 años tras el cese del contrato.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Integraciones de ERP Soportadas</h3>
            <p>
              El soporte técnico cubre las integraciones de conectores nativos y a la medida para QuickBooks (Online/Desktop), SAP Business One, Oracle NetSuite, Microsoft Dynamics 365, así como integraciones personalizadas mediante llamadas de API directas.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
