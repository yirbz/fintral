import { CheckCircle2, FileText, HardDrive, Users, Shield, Building2, Zap } from "lucide-react"

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
        El plan <strong>Profesional</strong> está diseñado para PyMEs en crecimiento que necesitan emitir facturas electrónicas (e-CF) válidas ante la DGII y automatizar su gestión fiscal con herramientas de IA.
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
                <th className="p-4 font-semibold text-right">Descuento</th>
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
                <td className="p-4 font-medium">3 Meses</td>
                <td className="p-4 text-right">RD$ 8,727.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">3%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,909.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">6 Meses</td>
                <td className="p-4 text-right">RD$ 17,094.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">5%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,849.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 32,389.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,699.08</td>
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
        <ul className="space-y-3 pl-0 list-none">
          {[
            { icon: FileText, text: "Emisión e-CF DGII — certificación e integración completa" },
            { icon: HardDrive, text: "500 documentos OCR al mes con procesamiento IA" },
            { icon: Zap, text: "1,000 consultas de IA al mes" },
            { icon: Shield, text: "Reportes DGII (606/607/608) — generación automática" },
            { icon: HardDrive, text: "5 GB de almacenamiento incluido" },
            { icon: Users, text: "Hasta 10 usuarios incluidos (adicionales a RD$ 300/mes c/u)" },
            { icon: Building2, text: "5 entidades incluidas (adicionales a RD$ 600/mes c/u)" },
            { icon: FileText, text: "Bloques de e-CF disponibles por compra separada en el Store" },
          ].map((feat, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-[#273951]">
              <feat.icon className="size-4 text-[#0EA5E9] shrink-0" />
              <span>{feat.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── CONDICIONES PARTICULARES ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Términos Particulares del Plan</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Límites de Consumo</h3>
            <p>
               El plan incluye procesamiento OCR de hasta <strong>500 documentos al mes</strong>, <strong>1,000 consultas de IA al mes</strong> y almacenamiento de <strong>5 GB</strong>. Los límites se reajustan mensualmente y los recursos no consumidos no son acumulables. Si necesitas más capacidad, puedes contratar bloques adicionales desde el Store: IA (500 consultas por RD$ 600) y almacenamiento (10 GB por RD$ 300).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Documentos Electrónicos (e-CF)</h3>
            <p>
              Este plan <strong>no incluye</strong> cuota de documentos electrónicos (e-CF) en la mensualidad. Los documentos e-CF se adquieren mediante bloques desde el Store de la plataforma:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[14px] mt-2">
              <li><strong>Bloque de 100 e-CF:</strong> RD$ 950.00 (RD$ 9.50 por documento)</li>
              <li><strong>Pago por uso:</strong> RD$ 12.00 por documento cuando no hay saldo disponible</li>
            </ul>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Capacidad de Entidades</h3>
            <p>
              El plan Profesional incluye <strong>5 entidades gratis</strong>. Las entidades adicionales tienen un costo de <strong>RD$ 600/mes c/u</strong>. Cada entidad gestiona sus propios bloques de e-CF de forma independiente — el contable paga el plan + entidades extra, la entidad paga sus documentos.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Capacidad de Usuarios</h3>
            <p>
              El plan Profesional incluye <strong>10 usuarios</strong>. Los usuarios adicionales tienen un costo de <strong>RD$ 300/mes c/u</strong> y se contratan desde el Store de la plataforma, con los mismos descuentos por compromiso (3/6/12 meses).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">5. WhatsApp Ingestion</h3>
            <p>
              El plan incluye la funcionalidad de ingestión de facturas por WhatsApp. Los documentos enviados por chat se procesan automáticamente y se contabilizan dentro del límite de OCR mensual.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">6. Exclusiones de Responsabilidad Fiscal</h3>
            <p>
              Fintral opera estrictamente como herramienta de software intermediaria para la transmisión y estructuración de datos. Es responsabilidad exclusiva del cliente fiscalizar y auditar la exactitud contable e impositiva de sus emisiones ante la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
