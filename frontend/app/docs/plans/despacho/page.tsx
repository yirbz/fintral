import { CheckCircle2, LayoutDashboard, Users, HardDrive, FileText, Building2, Zap } from "lucide-react"

export default function DespachoPlanPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Detalles del Plan Despacho Contable
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Planes Comerciales Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        El plan <strong>Despacho Contable</strong> está diseñado para firmas de contabilidad, auditores y profesionales que gestionan múltiples clientes de forma centralizada con un dashboard multi-entidad.
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
                <td className="p-4 text-right">RD$ 7,999.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 7,999.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses</td>
                <td className="p-4 text-right">RD$ 23,277.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">3%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 7,759.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">6 Meses</td>
                <td className="p-4 text-right">RD$ 45,594.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">5%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 7,599.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 86,389.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 7,199.08</td>
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
            { icon: LayoutDashboard, text: "Dashboard multi-entidad — monitorea toda tu cartera en un solo lugar" },
            { icon: Users, text: "Usuarios ilimitados para staff de la firma y clientes" },
            { icon: HardDrive, text: "1,000 documentos OCR al mes — pool compartido entre entidades" },
            { icon: Zap, text: "10,000 consultas de IA al mes — pool compartido" },
            { icon: FileText, text: "Reportes DGII completos (606/607/608) — generación automática" },
            { icon: HardDrive, text: "25 GB de almacenamiento incluido" },
            { icon: Building2, text: "20 entidades incluidas (adicionales a RD$ 600/mes c/u)" },
            { icon: FileText, text: "Bloques de e-CF disponibles por compra separada — cada entidad con su saldo independiente" },
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
               El plan incluye procesamiento OCR de hasta <strong>1,000 documentos al mes</strong>, <strong>10,000 consultas de IA al mes</strong> y almacenamiento de <strong>25 GB</strong> — todo compartido entre las entidades del despacho. Los recursos no consumidos expiran al finalizar el ciclo mensual. Si necesitas más capacidad, puedes contratar bloques adicionales desde el Store: IA (500 consultas por RD$ 600) y almacenamiento (10 GB por RD$ 300).
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Documentos Electrónicos (e-CF)</h3>
            <p>
              Las entidades bajo el despacho no incluyen cuota de e-CF en el plan base. Cada entidad puede adquirir bloques de documentos electrónicos desde el Store (100 e-CF por RD$ 950), manteniendo un saldo independiente por entidad. Esto permite que cada cliente del despajo gestione su propio presupuesto de facturación electrónica.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Capacidad de Entidades</h3>
            <p>
              El plan Despacho Contable incluye <strong>20 entidades gratis</strong>. Las entidades adicionales tienen un costo de <strong>RD$ 600/mes c/u</strong>. Cada entidad gestiona sus propios bloques de e-CF de forma independiente con saldo separado. Para gestionar más de 20 entidades, contacta a nuestro equipo de ventas para un plan enterprise personalizado.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Usuarios Ilimitados y Consumo Compartido</h3>
            <p>
              No existen límites en el número de usuarios por entidad. Todos los usuarios autorizados consumen del mismo pool compartido de OCR, almacenamiento y consultas de IA. El administrador del despacho es responsable del consumo agregado.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">5. Exclusiones de Responsabilidad Fiscal</h3>
            <p>
              Fintral opera estrictamente como herramienta de software intermediaria para la transmisión y estructuración de datos. Es responsabilidad exclusiva del despacho y de cada cliente firmante fiscalizar y auditar la exactitud contable e impositiva de sus emisiones ante la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
