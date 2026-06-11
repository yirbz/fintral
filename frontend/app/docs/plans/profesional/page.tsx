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
                <td className="p-4 text-right">RD$ 3,500.00</td>
                <td className="p-4 text-right text-[#a8c3de]">—</td>
                <td className="p-4 text-right font-medium">RD$ 3,500.00</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">3 Meses (Trimestral)</td>
                <td className="p-4 text-right">RD$ 9,450.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">10%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 3,150.00</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">12 Meses (Anual)</td>
                <td className="p-4 text-right">RD$ 33,600.00</td>
                <td className="p-4 text-right text-emerald-500 font-medium">20%</td>
                <td className="p-4 text-right font-medium text-[#0EA5E9]">RD$ 2,800.00</td>
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
            "500 facturas mensuales",
            "Hasta 3 usuarios registrados",
            "OCR avanzado con Inteligencia Artificial",
            "Validación NCF contra DGII",
            "Reporte 606 automático y estructurado",
            "Integración de facturación por WhatsApp",
            "Acceso completo a API y Webhooks",
            "Soporte prioritario (máx. 4h de respuesta)"
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
              El cupo mensual es de hasta <strong>500 facturas/mes</strong>. El número de facturas no acumuladas expira al finalizar el ciclo de facturación mensual y no es acumulable para períodos subsiguientes.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Límites de Conexión de API</h3>
            <p>
              La API REST y los Webhooks asociados al plan Profesional tienen restricciones técnicas para garantizar la estabilidad del servicio:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-[14px]">
              <li>Tasa de solicitudes de API: Máximo 1,000 solicitudes por hora.</li>
              <li>Endpoints de Webhooks: Hasta 3 URL de destino activas simultáneamente.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. SLA de Soporte</h3>
            <p>
              Fintral se compromete a brindar soporte técnico con prioridad profesional bajo los siguientes términos:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-[14px]">
              <li><strong>Tiempo de respuesta:</strong> Menos de 4 horas en horario laboral.</li>
              <li><strong>Horarios:</strong> Lunes a viernes de 8:00 AM a 6:00 PM (hora dominicana).</li>
              <li><strong>Canales:</strong> Chat directo en la plataforma y correo de soporte prioritario.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Cancelación y Retención de Datos</h3>
            <p>
              La cancelación de la suscripción Profesional puede realizarse en cualquier momento por el administrador del panel. Tras la baja efectiva del servicio, los datos se mantendrán disponibles por 90 días para su descarga en formato estructurado antes de proceder a la eliminación permanente.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
