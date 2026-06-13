import { CheckCircle2 } from "lucide-react"

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
        El plan <strong>Despacho Contable</strong> está diseñado específicamente para firmas de contabilidad, auditores y asesores independientes que gestionan múltiples clientes. Permite agregar clientes de manera modular con cuotas de uso y usuarios ilimitados.
      </p>

      {/* ── PRECIOS ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Estructura de Precios Base</h2>
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
                <td className="p-4 text-right">RD$ 7,999.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 7,999.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses (Trimestral)</td>
                <td className="p-4 text-right">RD$ 21,597.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 7,199.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 76,790.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">20%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 6,399.16</td>
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
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Características Incluidas en el Plan Base</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 list-none">
          {[
            "1 Organización Emisora e-CF incluida (la del despacho)",
            "500 e-CF mensuales en la organización base",
            "1,000 documentos OCR al mes (pool de la firma)",
            "Usuarios ilimitados para todo el staff y clientes",
            "Dashboard Multi-Entidad para gestionar clientes",
            "Reportes fiscales completos (606, 607, 608)",
            "Historial cruzado e informes de auditoría",
            "Conexión nativa con ERPs (QuickBooks, Odoo)",
            "Soporte prioritario 24/7 y vía WhatsApp"
          ].map((feat, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-[#273951]">
              <CheckCircle2 className="size-4 text-[#0EA5E9] shrink-0" />
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── EXTENSIBILIDAD DE ORGANIZACIONES ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Módulos de Extensión (Clientes adicionales)</h2>
        <p className="text-[14px] leading-relaxed text-[#64748d]">
          Puedes agregar clientes a tu cartera contratando extensiones individuales según su perfil operativo. Cada extensión tiene usuarios ilimitados:
        </p>
        
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl border border-[#e3e8ee] bg-[#f6f9fc]/20 space-y-2">
            <h3 className="text-[15px] font-bold text-[#0d253d]">Organización Estándar</h3>
            <p className="text-[12px] text-[#0EA5E9] font-semibold">RD$ 600.00 / mes (+$10 USD)</p>
            <p className="text-[13px] text-[#64748d] leading-normal font-light">
              Ideal para clientes que solo necesitan contabilidad interna y reportes. Incluye <strong>100 documentos OCR al mes</strong>. No permite facturación e-CF.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-[#e3e8ee] bg-[#f6f9fc]/20 space-y-2">
            <h3 className="text-[15px] font-bold text-[#0d253d]">Organización Facturadora</h3>
            <p className="text-[12px] text-[#0EA5E9] font-semibold">RD$ 1,500.00 / mes (+$25 USD)</p>
            <p className="text-[13px] text-[#64748d] leading-normal font-light">
              Para clientes que emiten facturas electrónicas válidas ante la DGII. Incluye **200 facturas e-CF/mes** y **200 OCR/mes** dedicados.
            </p>
          </div>
        </div>
      </section>

      {/* ── CONDICIONES PARTICULARES ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Condiciones de Uso y Excedentes</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Excedentes por e-CF</h3>
            <p>
              Si una organización facturadora adicional supera sus 200 e-CF/mes, cada factura electrónica excedente se facturará a **RD$ 9.00** ($0.15 USD). Esto permite al contador transferir el costo del excedente directamente a la empresa cliente que generó el tráfico.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Usuarios Ilimitados</h3>
            <p>
              Fintral no cobra cargos adicionales por usuario. Los recursos incluidos (facturas, OCR, queries de IA) son compartidos por todos los usuarios autorizados de la respectiva organización. Es responsabilidad del administrador del sistema monitorear y restringir los permisos para optimizar el consumo de recursos.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Responsabilidad Fiscal Solidaria</h3>
            <p>
              Fintral es una herramienta tecnológica de procesamiento y transmisión de datos. No ejerce funciones de auditoría contable ni asesoría tributaria. El contador o firma contratante asume de forma única y exclusiva la responsabilidad de validar, fiscalizar y presentar la información económica ante la DGII.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
