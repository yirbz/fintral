import { Lock } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
    <article className="animate-fade-in space-y-6">
      <div className="border-b border-[#e3e8ee] pb-6 mb-8">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Política de Privacidad
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Fintral Legal
        </p>
      </div>
      
      <div className="space-y-8 text-[15px] font-light leading-relaxed text-[#273951]">
        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">1. Compromiso de Confidencialidad y Seguridad</h2>
          <p>
            En Fintral entendemos el valor y la confidencialidad de la información financiera e impositiva de su empresa. Nos comprometemos a proteger sus datos (incluyendo facturas, reportes fiscales de la DGII y datos personales) mediante la implementación de estándares estrictos de encriptación y control de acceso.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">2. Datos Recopilados y Procesados</h2>
          <p>
            Para proveer y optimizar nuestros servicios, Fintral procesa los siguientes tipos de información:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[14px]">
            <li><strong>Información Fiscal:</strong> Datos contenidos en comprobantes fiscales de ingresos y gastos (NCF/e-CF), incluyendo montos de ITBIS, RNC y nombres comerciales de sus proveedores y clientes.</li>
            <li><strong>Certificados Digitales:</strong> Cuando usted sube su certificado de firma electrónica (.p12) para emitir facturación electrónica, este archivo es encriptado en reposo mediante algoritmos AES-256 de nivel militar y utilizado únicamente bajo su instrucción directa para firmar los e-CF enviados a la DGII.</li>
            <li><strong>Datos de Usuario:</strong> Correo electrónico, nombre completo, número de teléfono y registros de inicio de sesión recopilados para la administración de su cuenta de Supabase Auth.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">3. Procesamiento mediante Inteligencia Artificial</h2>
          <p>
            Fintral utiliza modelos de Inteligencia Artificial para la extracción automática de datos de facturas físicas y digitales (OCR). Los documentos procesados a través de esta capa tecnológica son transmitidos de manera segura a través de canales cifrados de APIs acreditadas, y **no se almacenan en reposo de forma permanente por los proveedores externos de IA**, utilizándose estrictamente para el procesamiento instantáneo solicitado por usted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">4. Uso y Divulgación de la Información</h2>
          <p>
            Fintral **no vende, comercializa ni arrienda** bajo ninguna circunstancia su información financiera o de sus clientes a terceras partes. La información recopilada se utiliza exclusivamente para:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[14px]">
            <li>Facilitar la emisión, validación e integración de sus reportes fiscales ante la DGII.</li>
            <li>Proveer reportes financieros personalizados en su panel de control.</li>
            <li>Notificar actualizaciones de seguridad, facturación o soporte técnico de la cuenta.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">5. Derechos de Acceso y Depuración</h2>
          <p>
            Como titular de la información, usted mantiene la propiedad exclusiva sobre sus datos en todo momento. En caso de solicitar la baja de su suscripción, sus datos serán depurados de manera definitiva de todos nuestros servidores activos tras 90 días naturales, garantizando la eliminación irreversible de sus comprobantes, firmas y certificados cargados en la plataforma.
          </p>
        </section>
      </div>
    </article>
  )
}
