import { CheckCircle2 } from "lucide-react"

export default function ProfesionalPlanPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Detalles del Plan Profesional
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Planes Comerciales Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        El plan <strong>Profesional</strong> está diseñado para equipos en crecimiento y contadores independientes que necesitan automatización real en su gestión fiscal sin intervención manual constante.
      </p>

      {/* ── PRECIOS ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Estructura de Precios y Ahorro</h2>
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
                <td className="p-4 text-right">RD$ 2,999.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 2,999.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses (Trimestral)</td>
                <td className="p-4 text-right">RD$ 8,097.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,699.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 28,790.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">20%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,399.16</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#64748d] italic">
          * Los precios están cotizados en Pesos Dominicanos (DOP) y no incluyen ITBIS.
        </p>
      </section>

      {/* ── CARACTERISTICAS ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Características Incluidas</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 list-none">
          {[
            "1 Organización Emisora e-CF incluida",
            "500 facturas electrónicas (e-CF) mensuales",
            "500 documentos OCR al mes",
            "Usuarios ilimitados para toda la organización",
            "Validación NCF contra DGII",
            "Reporte 606 automático y estructurado",
            "Integración de facturación por WhatsApp",
            "Acceso completo a API y Webhooks",
            "Soporte prioritario por email y chat (máx. 4h)"
          ].map((feat, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-[#273951]">
              <CheckCircle2 className="size-4 text-[#0EA5E9] shrink-0" />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── CONDICIONES PARTICULARES ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Términos Particulares del Plan</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Alcance y Límites de Consumo</h3>
            <p>
              El cupo mensual incluye hasta <strong>500 facturas/mes</strong> en la organización principal. El excedente se factura mensualmente a razón de **RD$ 9.00** ($0.15 USD) por comprobante e-CF emitido. Los folios de facturas no consumidas expiran al finalizar el ciclo de facturación mensual y no son acumulables.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Capacidad de Extensión Modular</h3>
            <p>
              El cliente puede añadir organizaciones estándar (+RD$ 600/mes) o facturadoras adicionales (+RD$ 1,500/mes) bajo la misma suscripción base, permitiendo gestionar múltiples entidades jurídicas de forma centralizada.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Usuarios Ilimitados y Consumo</h3>
            <p>
              No existen límites en el número de usuarios que pueden agregarse a la organización. Sin embargo, todos los usuarios autorizados consumen del mismo pool compartido de facturas, OCR y cuotas de consulta de IA (1,000 consultas de IA mensuales incluidas). Exceder el cupo de IA requerirá la compra de bloques adicionales (500 consultas por $10 USD).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Exclusiones de Responsabilidad Fiscal</h3>
            <p>
              Fintral opera estrictamente como herramienta de software intermediaria para la transmisión y estructuración de datos. Es responsabilidad exclusiva del cliente fiscalizar y auditar la exactitud contable e impositiva de sus emisiones ante la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
