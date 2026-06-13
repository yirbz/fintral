import { Shield } from "lucide-react"

export default function GeneralTermsPage() {
  return (
    <article className="animate-fade-in space-y-6">
      <div className="border-b border-[#e3e8ee] pb-6 mb-8">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Términos y Condiciones Generales
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Fintral Legal
        </p>
      </div>
      
      <div className="space-y-8 text-[15px] font-light leading-relaxed text-[#273951]">
        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">1. Naturaleza del Servicio y Limitación de Asesoría</h2>
          <p>
            Fintral es una herramienta tecnológica en modalidad de Software como Servicio (SaaS). Fintral **no provee servicios de asesoría contable, auditoría fiscal ni representación legal ante la Dirección General de Impuestos Internos (DGII)**. El uso de la plataforma no sustituye el criterio, revisión y supervisión de un profesional de la contabilidad legalmente certificado en la República Dominicana.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">2. Responsabilidad Fiscal Exclusiva del Cliente</h2>
          <p>
            El cliente asume de manera total, exclusiva e incondicional la responsabilidad por la veracidad, exactitud y validez de la información transmitida o declarada a la DGII mediante Fintral. El cliente es el único responsable de:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[14px]">
            <li>Solicitar, custodiar e integrar sus certificados digitales de firma electrónica (archivos .p12 o equivalentes).</li>
            <li>Monitorear y validar que las secuencias de Números de Comprobante Fiscal (NCF y e-NCF) autorizadas por la DGII se emitan correctamente y no sufran duplicaciones o expiraciones.</li>
            <li>Revisar y validar los formatos impositivos (606, 607, 608) generados por Fintral antes de realizar la presentación final en la Oficina Virtual de la DGII.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">3. Exención Total de Responsabilidad por Multas y Sanciones</h2>
          <p>
            Fintral, sus desarrolladores, operadores y empresas matrices **no serán responsables en ningún caso por multas, recargos, intereses de mora, glosas fiscales, clausuras temporales o cualquier otra sanción pecuniaria o legal** impuesta al cliente por la DGII o cualquier organismo regulador de la República Dominicana, originada por errores en la emisión de comprobantes, inconsistencias en los reportes o fallas de transmisión.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">4. Disponibilidad y Dependencia de Terceros (Alanube y DGII)</h2>
          <p>
            Fintral actúa como una capa de integración sobre la API de Alanube y los servidores web de la DGII. El cliente reconoce y acepta que **Fintral no tiene control sobre caídas del servicio, tiempos de inactividad, latencia o modificaciones técnicas imprevistas en la infraestructura de Alanube o la DGII**. Cualquier retraso en la certificación o firma de documentos debido a fallas de estos proveedores queda expresamente exento de responsabilidad y no dará lugar a indemnizaciones.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">5. Modelo de Usuarios Ilimitados y Compartición de Recursos</h2>
          <p>
            Todos los planes contratados otorgan el derecho de registrar **usuarios ilimitados**. El cliente comprende y acepta que todos los usuarios agregados a su respectiva organización consumen de manera compartida la cuota mensual de recursos contratada (foliolos de facturas e-CF, procesamiento OCR y cuota de IA). El consumo que realicen dichos usuarios es responsabilidad exclusiva del administrador del plan, quien deberá responder por los cargos por excedentes correspondientes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">6. Rescisión y Conservación de Datos</h2>
          <p>
            El cliente puede dar de baja su suscripción en cualquier momento. Tras la baja, Fintral retendrá la información fiscal procesada por un lapso de 90 días naturales únicamente para permitir la exportación de datos. Transcurrido este plazo, Fintral procederá a la depuración definitiva de los servidores por seguridad y privacidad de datos.
          </p>
        </section>
      </div>
    </article>
  )
}
