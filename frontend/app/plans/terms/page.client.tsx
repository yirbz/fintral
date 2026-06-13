"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { GradientMesh } from "@/components/landing/GradientMesh";

export default function TermsClient() {
  return (
    <main className="relative min-h-screen bg-white font-sans text-[#0d253d] brand-selection">
      {/* ── Hero mini ── */}
      <div className="relative pt-6 pb-16 sm:pb-20 overflow-hidden">
        <GradientMesh />

        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-20">
          <header className="flex items-center justify-between py-4">
            <Link href="/" className="transition-transform active:scale-[0.98]">
              <Logo variant="dark" size="md" />
            </Link>
            <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-[#273951]">
              <Link
                href="/#features"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Características
              </Link>
              <Link
                href="/#integrations"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Integraciones
              </Link>
              <Link
                href="/plans"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Planes
              </Link>
              <Link
                href="/docs"
                className="hover:text-[#0EA5E9] transition-colors"
              >
                Docs
              </Link>
            </nav>
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/login">
                <Button
                  variant="outline"
                  className="rounded-full font-medium px-5 py-4 h-auto text-[13px] border-[#e3e8ee] hover:bg-[#f6f9fc] text-[#0d253d] transition-all active:scale-[0.97]"
                >
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-5 py-4 h-auto text-[13px] shadow-sm transition-all active:scale-[0.97]">
                  Comenzar gratis
                </Button>
              </Link>
            </div>
          </header>
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-12 sm:mt-16 relative z-10 text-center">
          <h1 className="text-[40px] sm:text-[48px] leading-[1.05] tracking-[-1.4px] font-light text-[#0d253d] mb-5">
            Términos y condiciones
          </h1>
          <p className="text-[16px] sm:text-[18px] text-[#61718a] leading-[1.6] font-light max-w-lg mx-auto">
            Los detalles legales de nuestros planes y servicios.
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="prose prose-sm max-w-none text-[#273951]">
            <p className="text-[14px] text-[#64748d] mb-8">
              Última actualización: Junio 2026
            </p>

            <Section title="1. Aceptación de los términos">
              <p>
                Al contratar cualquiera de los planes ofrecidos por Fintral (en
                adelante, &laquo;la plataforma&raquo;), el usuario acepta los
                siguientes términos y condiciones. Si no está de acuerdo con
                estos términos, no debe utilizar los servicios de pago de la
                plataforma.
              </p>
            </Section>

            <Section title="2. Planes, Precios y Extensiones Modulares">
              <p>Fintral ofrece los siguientes planes de suscripción base:</p>
              <ul>
                <li>
                  <strong>Inicial (RD$ 999 / mes):</strong> Diseñado para
                  profesionales independientes y pequeños negocios. Incluye
                  contabilidad y reportes, 50 documentos OCR al mes, usuarios
                  ilimitados y validación NCF contra DGII. La organización base
                  no incluye emisión de facturas electrónicas (e-CF), pero está
                  disponible agregando organizaciones adicionales facturadoras.
                </li>
                <li>
                  <strong>Profesional (RD$ 2,999 / mes):</strong> Diseñado para
                  PyMEs en crecimiento. Incluye emisión de facturación
                  electrónica (e-CF) certificada con 500 comprobantes incluidos
                  al mes (excedente a RD$ 9.00 / e-CF), 500 documentos OCR al
                  mes procesados con IA, usuarios ilimitados y reporte 606
                  automático.
                </li>
                <li>
                  <strong>Despacho Contable (RD$ 7,999 / mes):</strong> Diseñado para firmas y contadores independientes con múltiples clientes. Incluye dashboard multi-entidad, 500 comprobantes e-CF mensuales en la organización principal (firma), 1,000 documentos OCR al mes (pool de procesamiento compartido), usuarios ilimitados, reportes impositivos completos (606/607/608) e integración ERP.
                </li>
              </ul>
              <p>
                Adicionalmente, bajo cualquiera de los planes contratados, el
                cliente puede agregar de forma modular{" "}
                <strong>Organizaciones Adicionales (Clientes)</strong> a su
                cuenta:
              </p>
              <ul>
                <li>
                  <strong>Organización Estándar (+RD$ 600 / mes):</strong> Para
                  clientes que solo necesitan contabilidad interna y reportes.
                  Incluye 100 documentos OCR al mes. No permite emisión de e-CF.
                </li>
                <li>
                  <strong>
                    Organización Facturadora e-CF (+RD$ 1,500 / mes):
                  </strong>{" "}
                  Para clientes que emiten facturas electrónicas válidas ante la
                  DGII. Incluye 200 e-CF/mes y 200 OCR/mes dedicados. Las
                  facturas e-CF excedentes de esta organización se facturan a
                  RD$ 9.00 / e-CF.
                </li>
              </ul>
              <p>
                Los precios están expresados en Pesos Dominicanos (DOP) y no
                incluyen ITBIS. Fintral se reserva el derecho de modificar los
                precios o las tarifas por excedente con una notificación previa
                de al menos 30 días.
              </p>
            </Section>

            <Section title="3. Períodos de facturación">
              <p>Ofrecemos tres modalidades de facturación:</p>
              <ul>
                <li>
                  <strong>Mensual (1 mes):</strong> Facturación cada mes. Sin
                  compromiso mínimo.
                </li>
                <li>
                  <strong>Trimestral (3 meses):</strong> Facturación cada 3
                  meses con un 10% de descuento sobre el precio mensual.
                </li>
                <li>
                  <strong>Anual (12 meses):</strong> Facturación una vez al año
                  con un 20% de descuento sobre el precio mensual.
                </li>
              </ul>
            </Section>

            <Section title="4. Período de prueba">
              <p>
                Todos los planes incluyen un período de prueba gratuito de 7
                días sin necesidad de registrar una tarjeta de crédito. Al
                finalizar el período de prueba, el usuario deberá seleccionar un
                plan de pago para continuar utilizando la plataforma.
              </p>
            </Section>

            <Section title="5. Facturación y pagos">
              <p>
                Los pagos se procesarán al inicio de cada período de
                facturación. El usuario autoriza a Fintral a realizar los cobros
                correspondientes según el plan y período seleccionado. En caso
                de fallo en el pago, Fintral se reserva el derecho de suspender
                el acceso a la plataforma hasta que se regularice la situación.
              </p>
            </Section>

            <Section title="6. Cancelación y reembolsos">
              <p>
                El usuario puede cancelar su suscripción en cualquier momento
                desde el panel de control. Al cancelar, el usuario seguirá
                teniendo acceso a la plataforma hasta el final del período de
                facturación actual. No se realizarán reembolsos parciales por
                períodos no utilizados.
              </p>
            </Section>

            <Section title="7. Cambios de plan">
              <p>
                El usuario puede migrar a un plan superior o inferior en
                cualquier momento. Las mejoras de plan se aplican de inmediato y
                se prorratea el costo restante del ciclo actual. Las reducciones
                de plan se aplican al siguiente ciclo de facturación.
              </p>
            </Section>

            <Section title="8. Usuarios Ilimitados y Uso Aceptable de Recursos">
              <p>
                <strong>8.1. Modelo de Usuarios Compartidos:</strong> Todos los
                planes permiten registrar usuarios ilimitados dentro de la
                organización. El cliente comprende y acepta que todos los
                usuarios vinculados consumen de manera compartida la cuota
                contratada del plan base (facturas electrónicas e-CF,
                procesamiento OCR y cuotas de inteligencia artificial). Es
                responsabilidad exclusiva del administrador de la cuenta
                supervisar e instruir a sus usuarios autorizados sobre el
                consumo de dichos recursos.
              </p>
              <p>
                <strong>8.2. Uso Aceptable:</strong> El usuario se compromete a
                utilizar la plataforma únicamente para fines legales y de
                acuerdo con la normativa fiscal de la República Dominicana.
                Queda prohibido el uso de la plataforma para actividades
                fraudulentas, emisión de comprobantes falsos o manipulación de
                datos impositivos.
              </p>
            </Section>

            <Section title="9. Naturaleza de la Herramienta y Exclusión de Responsabilidad Fiscal">
              <p>
                <strong>9.1. Sin Asesoría Fiscal o Contable:</strong> Fintral es
                exclusivamente un proveedor de tecnología en modalidad de
                Software como Servicio (SaaS). Fintral no presta asesoría
                contable, auditoría fiscal, ni consultoría tributaria. El uso de
                la plataforma no reemplaza, bajo ninguna circunstancia, el
                juicio y la revisión obligatoria de un Contador Público
                Autorizado (CPA) certificado en la República Dominicana.
              </p>
              <p>
                <strong>
                  9.2. Custodia del Certificado de Firma Digital (.p12):
                </strong>{" "}
                El cliente es el único poseedor, custodio y responsable directo
                de su certificado digital (archivo .p12 o equivalente). El
                cliente se obliga a mantener la confidencialidad de la clave del
                certificado y a renovarlo oportunamente ante la entidad emisora
                autorizada (Indotel/Avansi/Cámara de Comercio). Fintral no se
                responsabiliza por la expiración, revocación, mal uso o pérdida
                de dichos certificados.
              </p>
              <p>
                <strong>9.3. Secuencias de Comprobantes (NCF y e-NCF):</strong>{" "}
                Corresponde única y exclusivamente al cliente solicitar a la
                Dirección General de Impuestos Internos (DGII) las
                autorizaciones de rangos de comprobantes fiscales, así como
                configurar, monitorear y evitar la duplicidad, expiración o
                salto involuntario en las secuencias de facturación.
              </p>
              <p>
                <strong>
                  9.4. Validación de Declaraciones y Formatos (606, 607, 608):
                </strong>{" "}
                Aunque Fintral facilita la exportación y estructuración de los
                formatos de envío de datos impositivos (606, 607, 608), el
                cliente tiene la obligación legal ineludible de revisar la
                exactitud de los datos recopilados antes de proceder con su
                presentación oficial en la Oficina Virtual de la DGII (OFV).
              </p>
              <p>
                <strong>
                  9.5. Exclusión Absoluta de Responsabilidad por Sanciones:
                </strong>{" "}
                Fintral, sus desarrolladores, directivos y empresas matrices
                quedan expresamente exentos de toda responsabilidad solidaria o
                directa ante multas, recargos, intereses de mora, penalidades,
                auditorías fiscales desfavorables, clausuras comerciales o
                cualquier otra sanción administrativa o judicial impuesta por la
                DGII, independientemente de si el origen es una falla técnica
                del software, un error en la transmisión de datos o una
                inconsistencia de la API.
              </p>
              <p>
                <strong>9.6. Dependencia de Terceros y Conectividad:</strong> La
                emisión de comprobantes electrónicos (e-CF) depende críticamente
                de la API de Alanube y de la disponibilidad de los servidores
                receptores de la DGII. Fintral no garantiza un tiempo de
                actividad del 100% de estos sistemas externos y no será
                responsable por demoras, fallos de timbrado, latencia en
                respuestas o pérdidas financieras asociadas con la caída de
                servicios ajenos a nuestra infraestructura propia.
              </p>
            </Section>

            <Section title="10. Privacidad y datos">
              <p>
                El tratamiento de datos personales se rige por nuestra Política
                de Privacidad. Los datos fiscales procesados en la plataforma
                son propiedad del usuario y Fintral actúa únicamente como
                procesador de datos.
              </p>
            </Section>

            <Section title="11. Modificaciones">
              <p>
                Fintral se reserva el derecho de modificar estos términos y
                condiciones en cualquier momento. Los cambios serán notificados
                a los usuarios con al menos 15 días de anticipación a través del
                correo electrónico registrado.
              </p>
            </Section>

            <Section title="12. Legislación aplicable">
              <p>
                Estos términos y condiciones se rigen por las leyes de la
                República Dominicana. Cualquier disputa será sometida a los
                tribunales competentes de Santo Domingo, República Dominicana.
              </p>
            </Section>

            <Section title="13. Contacto">
              <p>
                Para cualquier pregunta sobre estos términos, puedes
                contactarnos a través de nuestro{" "}
                <Link
                  href="https://docs.google.com/forms/d/e/1FAIpQLSfJKt5ZVnPw5RJGVbh1CpiihMXxd1QUb4p47MC8qwyHsAGnzg/viewform"
                  className="text-[#0EA5E9] hover:underline"
                >
                  formulario de contacto
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#e3e8ee] bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Logo variant="dark" size="md" />
              <p className="text-[12px] text-[#64748d] mt-3 leading-relaxed">
                Infraestructura fiscal para empresas en República Dominicana.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Producto
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>OCR inteligente</li>
                <li>Validación NCF DGII</li>
                <li>Reporte 606 automático</li>
                <li>Exportación a ERP</li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Recursos
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>
                  <Link
                    href="/plans"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Planes
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Documentación
                  </Link>
                </li>
                <li>
                  <Link
                    href="/plans/terms"
                    className="hover:text-[#0EA5E9] transition-colors"
                  >
                    Términos y condiciones
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0d253d] mb-3">
                Cumplimiento
              </h4>
              <ul className="space-y-2 text-[13px] text-[#64748d]">
                <li>Normativa DGII</li>
                <li>NCF / e-NCF</li>
                <li>Retenciones ITBIS</li>
                <li>Auditoría fiscal</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#e3e8ee] pt-6 flex flex-col md:flex-row justify-between items-center text-[12px] text-[#a8c3de]">
            <p>
              &copy; {new Date().getFullYear()} Fintral. Financial
              infrastructure.
            </p>
            <p className="mt-2 md:mt-0">Santo Domingo, República Dominicana</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <h2 className="text-[18px] font-medium text-[#0d253d] mb-3">{title}</h2>
      <div className="text-[14px] text-[#273951] leading-relaxed space-y-2 [&_ul]:pl-5 [&_li]:mb-1.5 [&_ul]:list-disc">
        {children}
      </div>
    </div>
  );
}
