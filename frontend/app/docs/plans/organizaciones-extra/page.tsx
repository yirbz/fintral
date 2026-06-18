import { Building2, FileText, Zap, HardDrive } from "lucide-react"

export default function ExtensionesPage() {
  return (
    <article className="animate-fade-in space-y-8">
      <div className="border-b border-[#e3e8ee] pb-6">
        <h1 className="text-[28px] sm:text-[34px] font-light leading-tight tracking-tight text-[#0d253d] mb-2 font-brand">
          Extensiones Modulares
        </h1>
        <p className="text-[13px] text-[#64748d]">
          Última actualización: Junio 2026 · Extensiones Fintral
        </p>
      </div>

      <p className="text-[15px] leading-relaxed font-light text-[#273951]">
        Todos los planes de Fintral pueden complementarse con extensiones modulares adquiridas desde el Store de la plataforma. Estas extensiones se facturan de forma independiente y se pueden contratar o cancelar en cualquier momento.
        A continuación se detallan las extensiones disponibles y su estructura de precios.
      </p>

      {/* ── ENTIDADES ADICIONALES ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
          <Building2 className="size-5 text-[#0EA5E9]" />
          Capacidad de Entidades por Plan
        </h2>
        <p className="text-[15px] font-light leading-relaxed text-[#273951]">
          Cada plan incluye un número de entidades gratuitas. Las entidades adicionales más allá del límite tienen un costo de RD$ 600/mes cada una:
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Plan</th>
                <th className="p-4 font-semibold text-right">Entidades gratis</th>
                <th className="p-4 font-semibold text-right">Extra</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Inicial</td>
                <td className="p-4 text-right">1 entidad</td>
                <td className="p-4 text-right">RD$ 600/mes c/u</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Profesional</td>
                <td className="p-4 text-right">5 entidades</td>
                <td className="p-4 text-right">RD$ 600/mes c/u</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Despacho Contable</td>
                <td className="p-4 text-right">20 entidades</td>
                <td className="p-4 text-right">RD$ 600/mes c/u</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#64748d] italic">
          Las entidades dentro del límite gratuito no tienen ningún costo adicional. Las entidades extra comparten los mismos límites de OCR, almacenamiento y usuarios. Cada entidad gestiona y paga sus propios documentos e-CF de forma independiente.
        </p>
      </section>

      {/* ── USUARIOS ADICIONALES ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
          <Building2 className="size-5 text-[#0EA5E9]" />
          Usuarios Adicionales
        </h2>
        <p className="text-[15px] font-light leading-relaxed text-[#273951]">
          Cada plan incluye un número de usuarios gratuitos. Los usuarios adicionales más allá del límite tienen un costo de RD$ 300/mes cada uno:
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Plan</th>
                <th className="p-4 font-semibold text-right">Usuarios gratis</th>
                <th className="p-4 font-semibold text-right">Extra</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Inicial</td>
                <td className="p-4 text-right">3 usuarios</td>
                <td className="p-4 text-right">RD$ 300/mes c/u</td>
              </tr>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Profesional</td>
                <td className="p-4 text-right">10 usuarios</td>
                <td className="p-4 text-right">RD$ 300/mes c/u</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Despacho Contable</td>
                <td className="p-4 text-right">Ilimitados</td>
                <td className="p-4 text-right">N/A</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#64748d] italic">
          Los usuarios adicionales se contratan desde el Store de la plataforma con los mismos descuentos por compromiso (3/6/12 meses) que el plan base.
        </p>
      </section>

      {/* ── DOCUMENTOS E-CF ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
          <FileText className="size-5 text-[#0EA5E9]" />
          Bloques de Documentos Electrónicos (e-CF)
        </h2>
        <p className="text-[15px] font-light leading-relaxed text-[#273951]">
          Ningún plan base incluye documentos electrónicos (e-CF) en su cuota mensual. Todos los e-CF se adquieren mediante bloques de documentos, que se acreditan al saldo de la organización o entidad específica.
          Esto garantiza que cada documento electrónico tenga un costo conocido de antemano, eliminando la incertidumbre de los excedentes.
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Concepto</th>
                <th className="p-4 font-semibold text-right">Precio</th>
                <th className="p-4 font-semibold text-right">Costo por documento</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e3e8ee]/60 hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Bloque de 100 e-CF</td>
                <td className="p-4 text-right">RD$ 950.00</td>
                <td className="p-4 text-right text-[#64748d]">RD$ 9.50 c/u</td>
              </tr>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Pago por uso (pay-as-you-go)</td>
                <td className="p-4 text-right">RD$ 12.00</td>
                <td className="p-4 text-right text-[#64748d]">RD$ 12.00 c/u</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#64748d] italic">
          El pago por uso aplica cuando una entidad emite un e-CF sin tener saldo disponible en su balance. El bloque de 100 e-CF ofrece un ahorro del 21% frente al pago por uso.
        </p>

        <div className="bg-[#f6f9fc] rounded-xl border border-[#e3e8ee] p-5 space-y-3">
          <h3 className="text-[14px] font-semibold text-[#0d253d]">Notas importantes sobre e-CF</h3>
          <ul className="space-y-2 text-[13px] text-[#273951] leading-relaxed">
            <li className="flex gap-2">
              <span className="text-[#0EA5E9] font-medium">•</span>
              <span>Los bloques se acreditan al saldo de la organización o entidad específica que los adquiere.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#0EA5E9] font-medium">•</span>
              <span>Un contador puede comprar bloques para las entidades de sus clientes desde su cuenta de despacho.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#0EA5E9] font-medium">•</span>
              <span>Los documentos no consumidos se mantienen en el balance hasta su uso (no expiran mensualmente).</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#0EA5E9] font-medium">•</span>
              <span>Cuando el saldo llega a cero, el sistema utiliza el mecanismo de pago por uso (RD$ 12.00/doc) como respaldo para evitar interrupciones en la emisión.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#0EA5E9] font-medium">•</span>
              <span>Cada bloque de 100 e-CF tiene un margen del 45% sobre el costo de certificación (RD$ 5.22 por documento vía Alanube).</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── BLOQUES DE IA ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
          <Zap className="size-5 text-[#0EA5E9]" />
          Bloques de Consultas de IA
        </h2>
        <p className="text-[15px] font-light leading-relaxed text-[#273951]">
          Las consultas de inteligencia artificial se utilizan para el procesamiento inteligente de documentos, asistente de chat y análisis de datos. Cuando se alcanza el límite mensual del plan, se pueden adquirir bloques adicionales.
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Concepto</th>
                <th className="p-4 font-semibold text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Bloque de 500 consultas de IA</td>
                <td className="p-4 text-right">RD$ 600.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── BLOQUES DE ALMACENAMIENTO ── */}
      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d] flex items-center gap-2">
          <HardDrive className="size-5 text-[#0EA5E9]" />
          Bloques de Almacenamiento
        </h2>
        <p className="text-[15px] font-light leading-relaxed text-[#273951]">
          Cuando el almacenamiento del plan se acerca a su límite, se pueden contratar bloques adicionales de forma inmediata.
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#e3e8ee]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f6f9fc] border-b border-[#e3e8ee] text-[#0d253d]">
                <th className="p-4 font-semibold">Concepto</th>
                <th className="p-4 font-semibold text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-[#f6f9fc]/10">
                <td className="p-4 font-medium">Bloque de 10 GB adicionales</td>
                <td className="p-4 text-right">RD$ 300.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── CONDICIONES GENERALES ── */}
      <section className="space-y-4 text-[15px] font-light leading-relaxed text-[#273951]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#0d253d]">Condiciones Generales de Extensiones</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">1. Facturación y Compromiso</h3>
            <p>
              Los bloques de e-CF, IA y almacenamiento son compras únicas que no se renuevan automáticamente. El plan base y su límite de entidades se facturan según el período de compromiso seleccionado (1, 3, 6 o 12 meses) con los descuentos progresivos correspondientes.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">2. Cancelación de Extensiones</h3>
            <p>
              Los bloques de e-CF, IA y almacenamiento no son reembolsables una vez adquiridos. El plan base puede cancelarse en cualquier momento; al cancelar, el acceso se mantiene hasta el final del período de facturación actual.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">3. Transferencia de Bloques e-CF</h3>
            <p>
              Los bloques de e-CF están asignados a la entidad que los adquiere y no son transferibles entre organizaciones. En el caso de los despachos contables, el contador puede adquirir bloques en nombre de la entidad cliente desde el Store, y el saldo se acredita directamente a la entidad correspondiente.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#0d253d] mb-1">4. Independencia de Pagos</h3>
            <p>
              El contable paga únicamente la suscripción del plan base. Cada entidad (facturador) gestiona y paga sus propios bloques de documentos e-CF de forma completamente independiente. Esto permite que cada cliente del despacho controle su propio presupuesto de facturación electrónica sin intervención del contable.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
