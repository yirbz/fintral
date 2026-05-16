import { Camera, ScanSearch, FileCheck } from "lucide-react";

const features = [
  {
    title: "Llega como sea",
    desc: "WhatsApp, correo o web. Tus facturas llegan como tú prefieras. Fintral las recibe, las lee y las procesa sin que tengas que hacer nada más.",
    icon: <Camera className="size-5" />,
  },
  {
    title: "Se extrae solo",
    desc: "Olvídate de escribir datos a mano. Cada número de factura, fecha, monto e ITBIS se captura automáticamente. Rápido y sin errores de dedo.",
    icon: <ScanSearch className="size-5" />,
  },
  {
    title: "Todo en orden",
    desc: "Tus facturas siempre al día, validadas y listas para tu contabilidad. Sin multas, sin sorpresas, sin dolores de cabeza con la DGII.",
    icon: <FileCheck className="size-5" />,
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="py-24 bg-[#f6f9fc] border-t border-[#e3e8ee]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-3xl mb-16 stagger-1">
          <h2 className="text-[32px] md:text-[40px] lg:text-[48px] font-light leading-[1.1] tracking-[-0.96px] text-[#0d253d] [font-feature-settings:'ss01'] mb-6">
            Olvídate del trabajo manual con facturas.
          </h2>
          <p className="text-[17px] sm:text-[18px] text-[#273951] font-light leading-relaxed">
            Así de simple es: la factura entra por un lado y los datos
            limpios salen por el otro. Sin escribir, sin revisar una por una,
            sin perder fines de semana organizando papeles.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className={`bg-white border border-[#e3e8ee] rounded-[12px] shadow-[0_1px_3px_rgba(0,55,112,0.08)] hover:shadow-[0_8px_24px_rgba(0,55,112,0.08),_0_2px_6px_rgba(0,55,112,0.04)] transition-all duration-300 hover:-translate-y-0.5 stagger-${idx + 2}`}
            >
              <div className="p-8 sm:p-10">
                <div className="flex items-center justify-center size-10 rounded-full bg-[#f6f9fc] text-[#533afd] mb-6 ring-1 ring-[#e3e8ee]">
                  {feature.icon}
                </div>
                <h3 className="text-[18px] font-medium text-[#0d253d] mb-3">
                  {feature.title}
                </h3>
                <p className="text-[15px] text-[#64748d] font-light leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
