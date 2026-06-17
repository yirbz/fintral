import { CheckCircle2, Shield, Users, FileText, HardDrive, Zap } from "lucide-react"

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
        El plan <strong>Inicial</strong> está diseñado para profesionales independientes, freelancers y microempresas que buscan automatizar su contabilidad con herramientas de IA.
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
                <td className="p-4 text-right">RD$ 999.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 999.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses</td>
                <td className="p-4 text-right">RD$ 2,907.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">3%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 969.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">6 Meses</td>
                <td className="p-4 text-right">RD$ 5,694.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">5%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 949.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 10,789.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 899.08</td>
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
            { icon: FileText, text: "Contabilidad, reportes y validación NCF DGII" },
            { icon: HardDrive, text: "50 documentos OCR al mes — extracción con IA" },
            { icon: Zap, text: "150 consultas de IA al mes" },
            { icon: HardDrive, text: "500 MB de almacenamiento incluido" },
            { icon: Users, text: "Hasta 3 usuarios incluidos (adicionales a RD$ 300/mes c/u)" },
            { icon: Shield, text: "Reporte 606 automático desde compras registradas" },
            { icon: FileText, text: "1 entidad incluida (entidades adicionales a RD$ 600/mes c/u)" },
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
               El plan incluye procesamiento OCR de hasta <strong>50 documentos al mes</strong>, <strong>150 consultas de IA al mes</strong> y almacenamiento de <strong>500 MB</strong>. Los límites se reajustan mensualmente y los recursos no consumidos no son acumulables al siguiente ciclo. Si necesitas más capacidad, puedes contratar bloques adicionales desde el Store: IA (500 consultas por RD$ 600) y almacenamiento (10 GB por RD$ 300).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Documentos Electrónicos (e-CF)</h3>
            <p>
              Este plan <strong>no incluye</strong> emisión de facturas electrónicas (e-CF). Los documentos e-CF pueden adquirirse por separado mediante bloques de 100 documentos (RD$ 950/bloque) desde el Store de la plataforma.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Capacidad de Entidades</h3>
            <p>
               El plan Inicial incluye <strong>1 entidad gratis</strong>. Las entidades adicionales tienen un costo de <strong>RD$ 600/mes c/u</strong>. Cada entidad gestiona sus propios bloques de e-CF de forma independiente — el contable paga el plan + entidades extra, la entidad paga sus documentos.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Capacidad de Usuarios</h3>
            <p>
              El plan Inicial incluye <strong>3 usuarios</strong>. Los usuarios adicionales tienen un costo de <strong>RD$ 300/mes c/u</strong> y se contratan desde el Store de la plataforma, con los mismos descuentos por compromiso (3/6/12 meses).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">5. Extensiones Modulares</h3>
            <p>
              Además de los bloques de e-CF, están disponibles bloques complementarios de AI (500 consultas por RD$ 600) y almacenamiento (10 GB por RD$ 300) desde el Store de la plataforma.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">6. Exclusiones de Responsabilidad Fiscal</h3>
            <p>
              Fintral opera estrictamente como herramienta de software intermediaria para la transmisión y estructuración de datos. Es responsabilidad exclusiva del cliente fiscalizar y auditar la exactitud contable e impositiva de sus operaciones ante la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
