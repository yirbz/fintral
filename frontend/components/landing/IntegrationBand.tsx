import Link from "next/link";
import { FileDown, Share2 } from "lucide-react";

export function IntegrationBand() {
  return (
    <section className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="bg-[#f5e9d4] rounded-[16px] p-8 sm:p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 overflow-hidden relative">
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-[#fb923c]/20 to-[#ea2261]/15 rounded-full filter blur-[100px] -mr-24 -mt-24 pointer-events-none"
          />

          <div className="max-w-xl relative z-10">
            <h2 className="text-[28px] sm:text-[32px] font-light tracking-[-0.64px] text-[#0d253d] [font-feature-settings:'ss01'] mb-4">
              Tus facturas, donde las necesites.
            </h2>
            <p className="text-[16px] text-[#273951] font-light leading-relaxed mb-8">
              Una vez procesadas, puedes descargar todo en Excel, compartirlo
              con tu contador o enviarlo directamente a tu sistema contable. Los
              datos limpios y organizados, siempre a un click.
            </p>
            <div className="flex gap-4">
              <Link
                href="/login"
                className="inline-flex items-center rounded-full bg-[#0d253d] text-white hover:bg-[#1c1e54] font-normal px-6 py-2.5 h-auto text-[15px] transition-all duration-200"
              >
                Probar gratis
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 relative z-10 w-full md:w-auto">
            <div className="bg-white/70 backdrop-blur-sm p-4 sm:p-5 rounded-lg border border-white/50 shadow-sm flex flex-col items-center justify-center gap-2.5 aspect-square w-28 sm:w-32">
              <FileDown className="size-6 text-[#533afd]" />
              <span className="text-[13px] font-medium text-[#0d253d]">
                Exportar a Excel
              </span>
            </div>
            <div className="bg-white/70 backdrop-blur-sm p-4 sm:p-5 rounded-lg border border-white/50 shadow-sm flex flex-col items-center justify-center gap-2.5 aspect-square w-28 sm:w-32 mt-6 sm:mt-8">
              <Share2 className="size-6 text-[#ea2261]" />
              <span className="text-[13px] font-medium text-[#0d253d]">
                Enviar a contador
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
