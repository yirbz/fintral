import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="pt-20 pb-24 md:pt-32 md:pb-40 text-center lg:text-left grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
      <div className="flex flex-col gap-6 max-w-2xl mx-auto lg:mx-0 stagger-1">
        <div className="inline-flex items-center w-fit mx-auto lg:mx-0 rounded-full bg-[#533afd]/10 px-3 py-1 text-[13px] text-[#4434d4] font-medium tracking-wide">
          <span className="size-1.5 rounded-full bg-[#533afd] mr-2" />
          Olvídate del papeleo
        </div>

        <h1 className="text-[42px] sm:text-[52px] lg:text-[58px] leading-[1.03] tracking-[-1.4px] font-light text-[#0d253d] [font-feature-settings:'ss01']">
          Tus facturas
          <br />
          se procesan solas.
        </h1>

        <p className="text-[17px] sm:text-[18px] text-[#273951] leading-[1.6] font-light max-w-lg mx-auto lg:mx-0">
          Sube una foto desde WhatsApp, reenvía un PDF por correo o arrastra
          un archivo a la web. Fintral lee los datos por ti, los organiza y
          los valida. Sin escribir una sola línea.
        </p>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
          <Link href="/login">
            <button type="button" className="rounded-full bg-[#533afd] text-white hover:bg-[#4434d4] font-normal px-6 py-3 h-auto text-[16px] shadow-sm transition-all duration-200 hover:shadow-[0_8px_24px_rgba(83,58,253,0.25)] active:bg-[#2e2b8c]">
              Crear cuenta gratis{" "}
              <ArrowRight className="ml-2 inline size-4" />
            </button>
          </Link>
          <Link href="#contact">
            <button type="button" className="rounded-full bg-white text-[#0d253d] border border-[#e3e8ee] hover:border-[#a8c3de] hover:bg-[#f6f9fc] font-normal px-6 py-3 h-auto text-[16px] transition-all duration-200">
              Contactar ventas
            </button>
          </Link>
        </div>
      </div>

      <div className="relative w-full max-w-[580px] mx-auto mt-8 lg:mt-0 stagger-2">
        <div className="relative rounded-[16px] bg-[#0d253d] border border-[#1c1e54] shadow-[0_24px_48px_-12px_rgba(13,37,61,0.4),_0_8px_24px_rgba(13,37,61,0.2)] overflow-hidden transition-all duration-700 hover:shadow-[0_32px_64px_-16px_rgba(13,37,61,0.5)]">
          <div className="flex items-center px-4 py-3 bg-[#1c1e54]/50 border-b border-white/[0.05]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
            </div>
            <div className="mx-auto text-[11px] text-[#64748d] font-mono [font-feature-settings:'tnum'] tracking-widest">
              Fintral — Panel de facturas
            </div>
          </div>

          <div className="p-5 sm:p-6 grid gap-4">
            <div className="flex justify-between items-end mb-1">
              <div>
                <div className="text-[13px] text-[#61718a] font-light">
                  Total procesado este mes
                </div>
                <div className="text-[24px] sm:text-[28px] text-white font-light tracking-[-0.28px] [font-feature-settings:'tnum'] mt-1">
                  RD$ 4,285,900.00
                </div>
              </div>
              <div className="bg-[#ea2261]/20 text-[#ea2261] px-2 py-1 rounded-md text-[11px] font-medium [font-feature-settings:'tnum']">
                +12.5%
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.05] bg-[#1c1e54]/30 overflow-hidden">
              {[
                { prov: "TechCorp S.R.L.", date: "15 may 2026", amt: "45,200.00", status: "Listo" },
                { prov: "Oficina Express", date: "15 may 2026", amt: "12,450.50", status: "Listo" },
                { prov: "Servicios Grales.", date: "14 may 2026", amt: "8,900.00", status: "Listo" },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 text-[13px] ${i !== 2 ? "border-b border-white/[0.05]" : ""}`}
                >
                  <div className="text-white/90 font-light">{row.prov}</div>
                  <div className="text-[#61718a] text-[11px] [font-feature-settings:'tnum'] hidden sm:block">
                    {row.date}
                  </div>
                  <div className="text-white/90 [font-feature-settings:'tnum']">
                    ${row.amt}
                  </div>
                  <div className="text-[#665efd] text-[12px]">{row.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute -left-8 -bottom-8 rounded-[12px] bg-[#1c1e54] border border-white/[0.08] shadow-2xl p-4 w-52 hidden lg:block">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-1.5 rounded-full bg-[#665efd]" />
            <span className="text-[11px] text-[#64748d]">Resumen del mes</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Procesadas", value: "1,247", color: "text-white" },
              { label: "Validadas", value: "1,234", color: "text-[#665efd]" },
              { label: "Pendientes", value: "13", color: "text-[#ea2261]" },
            ].map((stat) => (
              <div key={stat.label} className="flex justify-between text-[11px]">
                <span className="text-[#a8c3de]">{stat.label}</span>
                <span className={`${stat.color} [font-feature-settings:'tnum']`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
