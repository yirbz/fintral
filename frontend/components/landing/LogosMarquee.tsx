"use client";

import {
  siQuickbooks,
  siSap,
  siXero,
  siOdoo,
  siGooglesheets,
  siWhatsapp,
  siSage,
  siZapier,
  siZoho,
} from "simple-icons";

const customIcons: Record<string, { color: string; path: string }> = {
  Excel: {
    color: "217346",
    path: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm4-6h4v2h-4v2h4v2h-4v-2H8v-2h2v-2zm2-4l2 3h-2v2h3v-2h-2l-2-3z",
  },
  Slack: {
    color: "4A154B",
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522V15.165zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  },
  "DGII": {
    color: "1c1e54",
    path: "M12 2L2 7v10l10 5 10-5V7L12 2zM5 9.5l7-3.5 7 3.5v5l-7 3.5-7-3.5v-5z",
  },
};

const logos = [
  { name: "QuickBooks", color: `#${siQuickbooks.hex}`, path: siQuickbooks.path, h: 28, showText: true },
  { name: "SAP", color: `#${siSap.hex}`, path: siSap.path, h: 40, showText: false },
  { name: "Xero", color: `#${siXero.hex}`, path: siXero.path, h: 38, showText: false },
  { name: "Odoo", color: `#${siOdoo.hex}`, path: siOdoo.path, h: 50, showText: false },
  { name: "Excel", color: `#${customIcons.Excel.color}`, path: customIcons.Excel.path, h: 28, showText: true },
  { name: "Google Sheets", color: `#${siGooglesheets.hex}`, path: siGooglesheets.path, h: 28, showText: true },
  { name: "Slack", color: `#${customIcons.Slack.color}`, path: customIcons.Slack.path, h: 30, showText: true },
  { name: "WhatsApp", color: `#${siWhatsapp.hex}`, path: siWhatsapp.path, h: 28, showText: true },
  { name: "Sage", color: `#${siSage.hex}`, path: siSage.path, h: 54, showText: false },
  { name: "Zoho", color: `#${siZoho.hex}`, path: siZoho.path, h: 64, showText: false },
  { name: "Zapier", color: `#${siZapier.hex}`, path: siZapier.path, h: 34, showText: false },
  { name: "DGII", color: `#${customIcons.DGII.color}`, path: customIcons.DGII.path, h: 28, showText: true },
];

const duplicated = [...logos, ...logos];

export function LogosMarquee() {
  return (
    <div className="relative overflow-hidden border-y border-[#0EA5E9]/10 bg-gradient-to-r from-[#0EA5E9]/[0.04] via-[#38BDF8]/[0.06] to-[#0EA5E9]/[0.04] py-14">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#0EA5E9]/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#0EA5E9]/10 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center mb-8 relative">
        <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[#0EA5E9]/60 uppercase tracking-[0.18em]">
          <span className="h-px w-6 bg-[#0EA5E9]/20" />
          Compatible con tus herramientas
          <span className="h-px w-6 bg-[#0EA5E9]/20" />
        </span>
      </div>

      <div className="relative w-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#f0f9ff] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#f0f9ff] to-transparent z-10 pointer-events-none" />

        <div className="flex gap-16 md:gap-24 items-center animate-marquee">
          {duplicated.map((logo, i) => (
            <div
              key={`${logo.name}-${i}`}
              className="flex items-center gap-3 shrink-0 grayscale hover:grayscale-0 transition-all duration-500"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ color: logo.color, height: logo.h, width: logo.h }}
                aria-hidden="true"
              >
                <path d={logo.path} />
              </svg>
              {logo.showText && (
                <span
                  className="text-[17px] md:text-[19px] font-semibold tracking-tight whitespace-nowrap"
                  style={{ color: logo.color }}
                >
                  {logo.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
