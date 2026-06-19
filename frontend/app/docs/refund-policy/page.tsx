import { RotateCcw, Clock, Mail, AlertCircle, CheckCircle2, FileText } from "lucide-react"

export default function RefundPolicyPage() {
  return (
    <article className="animate-fade-in space-y-6">
      <div className="border-b border-[#e3e8ee] pb-6 mb-8">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Política de Reembolsos
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Fintral Comercial
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-sky-50 border border-sky-200 text-[13px] text-sky-800 leading-relaxed">
        <AlertCircle className="size-5 shrink-0 mt-0.5 text-sky-600" />
        <div>
          <strong className="font-semibold">Resumen:</strong> Ofrecemos un período de reembolso de <strong>14 días</strong> desde la fecha de compra para suscripciones nuevas. Los cargos por documentos e-CF utilizados, consultas de IA consumidas y procesamiento OCR no son reembolsables. Los reembolsos se procesan en un máximo de <strong>10 días hábiles</strong>.
        </div>
      </div>

      <div className="space-y-8 text-[15px] font-light leading-relaxed text-[#273951]">

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <RotateCcw className="size-5 text-[#0EA5E9]" />
            1. Período de Reembolso
          </h2>
          <p>
            Fintral ofrece una <strong>garantía de satisfacción de 14 días</strong> para todas las suscripciones nuevas. Si no estás satisfecho con el servicio por cualquier motivo, puedes solicitar un reembolso total del monto pagado dentro de los primeros 14 días calendario desde la fecha de facturación inicial.
          </p>
          <p>
            Pasado este período, las suscripciones no son reembolsables, pero puedes cancelar en cualquier momento y seguirás teniendo acceso al servicio hasta el final del período ya facturado.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <CheckCircle2 className="size-5 text-[#0EA5E9]" />
            2. ¿Qué es Reembolsable?
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
            <li>El cargo inicial de suscripción (mensual, trimestral, semestral o anual) dentro de los primeros 14 días.</li>
            <li>Pagos duplicados o incorrectos debido a errores del sistema.</li>
            <li>Cargos por suscripciones realizadas sin autorización expresa.</li>
            <li>Bloques de documentos e-CF, IA o almacenamiento adquiridos pero <strong>no consumidos</strong> en su totalidad dentro del período de reembolso, siempre que la suscripción también sea cancelada.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <FileText className="size-5 text-[#0EA5E9]" />
            3. ¿Qué NO es Reembolsable?
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
            <li>Documentos e-CF que ya hayan sido timbrados, enviados o certificados ante la DGII — estos representan un costo de operación real e irrevocable a través de Alanube.</li>
            <li>Consultas de IA consumidas (parcial o totalmente).</li>
            <li>Documentos procesados mediante OCR.</li>
            <li>Servicios de configuración personalizada, integraciones a medida o desarrollo de características especiales (<em>professional services</em>).</li>
            <li>Suscripciones renovadas automáticamente después del período de 14 días desde la fecha de facturación inicial — a menos que exista un error técnico comprobable.</li>
            <li>Cargos por excedentes (<em>overage</em>) ya consumidos en el ciclo de facturación.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <Clock className="size-5 text-[#0EA5E9]" />
            4. Reembolsos Parciales
          </h2>
          <p>
            Para cancelaciones dentro del período de reembolso donde se hayan consumido recursos facturables (e-CF, IA, OCR), Fintral se reserva el derecho de descontar el valor proporcional de los recursos utilizados antes de emitir el reembolso. En estos casos:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
            <li>Los documentos e-CF timbrados se deducen a su costo unitario (equivalente al precio del bloque dividido entre el tamaño del bloque).</li>
            <li>Las consultas de IA consumidas se deducen a RD$ 1.20 por consulta.</li>
            <li>Los documentos OCR procesados se deducen a RD$ 2.00 por documento.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <Mail className="size-5 text-[#0EA5E9]" />
            5. Cómo Solicitar un Reembolso
          </h2>
          <p>
            Para solicitar un reembolso, envía un correo electrónico a <a href="mailto:yirber@fintral.app?subject=Solicitud%20de%20Reembolso" className="text-[#0EA5E9] font-medium hover:underline">yirber@fintral.app</a> con los siguientes datos:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
            <li>Nombre completo y correo electrónico asociado a la cuenta.</li>
            <li>Número de factura o recibo de pago (si está disponible).</li>
            <li>Motivo detallado de la solicitud.</li>
            <li>Fecha aproximada de la transacción.</li>
          </ul>
          <p>
            Nuestro equipo de soporte evaluará la solicitud y responderá en un máximo de <strong>5 días hábiles</strong>. Una vez aprobado, el reembolso se procesará en un máximo de <strong>10 días hábiles</strong> al método de pago original. El tiempo de acreditación depende de tu banco o procesador de pago (típicamente 5-10 días hábiles adicionales para transferencias bancarias).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
            <AlertCircle className="size-5 text-[#0EA5E9]" />
            6. Excepciones y Consideraciones
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
            <li>Fintral se reserva el derecho de rechazar solicitudes de reembolso que considere abusivas o fraudulentas, incluyendo patrones de compra y cancelación repetitivos.</li>
            <li>En caso de disputa, Fintral y el cliente acuerdan agotar la vía de negociación directa antes de cualquier procedimiento legal, sujeto a las leyes de la República Dominicana.</li>
            <li>Esta política de reembolsos aplica exclusivamente a los servicios prestados directamente por Fintral. Los costos asociados a servicios de terceros (Alanube, DGII, proveedores de infraestructura cloud) están sujetos a sus propias políticas y Fintral actúa únicamente como intermediario tecnológico.</li>
          </ul>
        </section>

      </div>
    </article>
  )
}
