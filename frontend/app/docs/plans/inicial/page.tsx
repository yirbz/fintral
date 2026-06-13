import { CheckCircle2 } from "lucide-react"

export default function InicialPlanPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Detalles del Plan Inicial
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Planes Comerciales Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        El plan <strong>Inicial</strong> está concebido para profesionales independientes, freelancers y pequeños negocios que inicialmente no requieren emitir comprobantes fiscales electrónicos (e-CF) en su organización base, pero desean automatizar su contabilidad, validar NCFs y generar reportes fiscales de compras automáticamente. Permite habilitar facturación electrónica de forma modular agregando organizaciones adicionales facturadoras.
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
                <td className="p-4 text-right">RD$ 999.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 999.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses (Trimestral)</td>
                <td className="p-4 text-right">RD$ 2,697.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 899.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 9,590.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">20%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 799.16</td>
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
            "Contabilidad y Reportes Financieros",
            "50 documentos OCR al mes",
            "Usuarios ilimitados para la organización",
            "Validación NCF contra servidores de la DGII",
            "Reporte 606 automático y estructurado",
            "Exportación directa a plantilla DGII",
            "Soporte técnico por correo electrónico (máx. 24h)",
            "Extensible con Organizaciones Adicionales"
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
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Emisión de Facturación Electrónica (e-CF)</h3>
            <p>
              La <strong>organización principal (base)</strong> incluida en el Plan Inicial no permite la emisión de comprobantes fiscales electrónicos (e-CF). Sin embargo, el cliente puede facturar electrónicamente bajo este mismo plan adquiriendo de forma modular una o más <strong>Organizaciones Facturadoras e-CF adicionales (+RD$ 1,500/mes)</strong>, sin verse obligado a migrar al Plan Profesional.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Procesamiento de Documentos (OCR)</h3>
            <p>
              Incluye la extracción inteligente de datos para hasta <strong>50 documentos de compra/gastos al mes</strong>. El procesamiento excedente no está disponible en este plan base; requiere actualizar a un plan superior para disponer de una cuota de OCR mayor.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Usuarios Ilimitados</h3>
            <p>
              No hay límite en el número de miembros del equipo o asesores externos que puede invitar. Sin embargo, todos los usuarios autorizados comparten la cuota única de 50 documentos OCR mensuales de la organización.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Generación Automática del Reporte 606</h3>
            <p>
              Las facturas digitalizadas y cargadas mediante OCR se procesan y clasifican automáticamente en la plataforma para pre-llenar y generar el formato 606 sin digitación manual. Es mandatorio que el usuario valide la exactitud de los gastos clasificados antes de su remisión final a la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
