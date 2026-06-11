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
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">1. Aceptación de los términos</h2>
          <p>
            Al contratar o utilizar cualquiera de los planes y servicios ofrecidos por Fintral, el usuario acepta de forma expresa los presentes términos y condiciones. Si no está conforme con los mismos, deberá abstenerse de utilizar la plataforma.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">2. Definición de la plataforma</h2>
          <p>
            Fintral es una plataforma de infraestructura fiscal diseñada para automatizar la contabilidad corporativa en la República Dominicana. Proporciona herramientas de procesamiento OCR, visión artificial para validar comprobantes fiscales, generación de reportes fiscales (606, 607, 608) y conectividad mediante API y Webhooks con sistemas de facturación ERP.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">3. Registro y Cuentas de Usuario</h2>
          <p>
            Para acceder a los servicios, el usuario debe registrarse y mantener una cuenta activa en el sistema. Es responsabilidad exclusiva del usuario custodiar sus credenciales de acceso. Cualquier actividad realizada bajo sus credenciales se entenderá imputable al titular de la cuenta.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">4. Facturación, Planes y Precios</h2>
          <p>
            Fintral ofrece planes con facturación mensual, trimestral y anual. Los precios están expresados en Pesos Dominicanos (DOP) y no incluyen el Impuesto sobre Transferencias de Bienes Industrializados y Servicios (ITBIS), el cual será cargado adicionalmente de acuerdo a la normativa fiscal vigente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">5. Limitación de Responsabilidad</h2>
          <p>
            La plataforma se proporciona &ldquo;tal cual&rdquo; y &ldquo;según disponibilidad&rdquo;. Fintral realiza sus mejores esfuerzos para asegurar el correcto procesamiento de los datos fiscales, pero el usuario reconoce que la validación final frente a la Dirección General de Impuestos Internos (DGII) es de su exclusiva responsabilidad y debe ser fiscalizada por su equipo contable.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">6. Modificaciones de los Términos</h2>
          <p>
            Fintral se reserva el derecho de modificar estos términos en cualquier momento, comprometiéndose a notificar a los clientes mediante correo electrónico con al menos 15 días de antelación.
          </p>
        </section>
      </div>
    </article>
  )
}
