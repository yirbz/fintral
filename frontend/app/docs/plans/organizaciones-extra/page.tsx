import { CheckCircle2 } from "lucide-react"

export default function ExtraOrganizationsPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Organizaciones Adicionales (Módulos de Extensión)
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Guía de Suscripción Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        Fintral emplea un modelo innovador de <strong>Planes Extensibles</strong>. En lugar de obligarte a contratar suscripciones completas e independientes para cada uno de tus clientes o unidades de negocio, puedes mantener una única suscripción base y añadir <strong>Organizaciones Adicionales</strong> de manera modular.
      </p>

      {/* ── QUE ES UNA ORGANIZACION ── */}
      <section className="space-y-3 font-light text-[14px] leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">¿Qué es una Organización Adicional?</h2>
        <p>
          Cada organización adicional creada funciona como una <strong>entidad jurídica independiente y totalmente aislada</strong> (multi-tenancy). Cuenta con su propio Registro Nacional de Contribuyentes (RNC), configuración fiscal propia ante la DGII, secuencia de comprobantes separada, y su propio grupo de usuarios.
        </p>
        <p>
          Este modelo es idóneo para contadores independientes, firmas de contabilidad y consorcios empresariales que administran múltiples empresas, permitiendo consolidar la facturación y la gestión bajo un solo panel unificado.
        </p>
      </section>

      {/* ── MODULOS DE EXTENSION ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Tipos de Extensiones y Tarifas</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl border border-[#e3e8ee] bg-[#f6f9fc]/40 space-y-2">
            <h3 className="text-[15px] font-bold text-[#0d253d]">Organización Estándar</h3>
            <p className="text-[12px] text-[#0EA5E9] font-semibold">RD$ 600.00 / mes (equiv. $10 USD)</p>
            <p className="text-[13px] text-[#64748d] leading-normal font-light">
              Diseñada para clientes o subsidiarias que solo requieren contabilidad, conciliación y reportes de compras/ventas.
            </p>
            <ul className="text-[12px] text-[#273951] space-y-1 pl-0 list-none pt-2">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> 100 documentos OCR al mes</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> Reporte 606 automático</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> Usuarios ilimitados dedicados</li>
              <li className="flex items-center gap-1.5 text-rose-500 font-medium"><span className="size-1 rounded-full bg-rose-500" /> Sin facturación e-CF</li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl border border-[#e3e8ee] bg-[#f6f9fc]/40 space-y-2">
            <h3 className="text-[15px] font-bold text-[#0d253d]">Organización Facturadora e-CF</h3>
            <p className="text-[12px] text-[#0EA5E9] font-semibold">RD$ 1,500.00 / mes (equiv. $25 USD)</p>
            <p className="text-[13px] text-[#64748d] leading-normal font-light">
              Para empresas que emiten facturación electrónica oficial homologada por la DGII.
            </p>
            <ul className="text-[12px] text-[#273951] space-y-1 pl-0 list-none pt-2">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> 200 comprobantes e-CF incluidos/mes</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> Excedente a RD$ 9.00 / e-CF</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> 200 documentos OCR al mes</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#0EA5E9]" /> Usuarios ilimitados dedicados</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── DETALLES DE FACTURACION Y EXCEDENTES ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Condiciones de Facturación y Consumos</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Facturación Consolidada</h3>
            <p>
              El costo de todas las organizaciones adicionales se acumula en la **factura única del administrador principal** de la cuenta. Esto permite, por ejemplo, que un despacho de contadores reciba un solo cargo unificado y posteriormente distribuya el costo o cobre un margen a cada uno de sus clientes individuales de forma independiente.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Manejo de Excedentes e-CF</h3>
            <p>
              Los 200 e-CF/mes incluidos en cada Organización Facturadora son independientes de las demás empresas. Si una organización supera sus 200 comprobantes, el excedente de esa empresa en específico se calcula a **RD$ 9.00 por comprobante e-CF** y se añade a la factura consolidada del período.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Usuarios Ilimitados por Entidad</h3>
            <p>
              Cada organización adicional puede tener su propio conjunto de usuarios (por ejemplo, el personal interno de la empresa cliente), quienes solo tendrán acceso a los datos de su respectiva entidad. El administrador del plan no paga cargos extra por estos usuarios, pero ellos consumen del cupo asignado a esa organización.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
