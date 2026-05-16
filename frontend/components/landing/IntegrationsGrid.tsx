"use client";

import { useState } from "react";
import {
  siQuickbooks,
  siSap,
  siXero,
  siOdoo,
  siGooglesheets,
  siWhatsapp,
  siSage,
  siZapier,
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
  "Zoho Books": {
    color: "E42527",
    path: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  },
  "API / Webhooks": {
    color: "6366F1",
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
};

const integrations = [
  {
    name: "QuickBooks",
    color: `#${siQuickbooks.hex}`,
    path: siQuickbooks.path,
  },
  {
    name: "SAP",
    color: `#${siSap.hex}`,
    path: siSap.path,
  },
  {
    name: "Xero",
    color: `#${siXero.hex}`,
    path: siXero.path,
  },
  {
    name: "Odoo",
    color: `#${siOdoo.hex}`,
    path: siOdoo.path,
  },
  {
    name: "Excel",
    color: `#${customIcons.Excel.color}`,
    path: customIcons.Excel.path,
  },
  {
    name: "Google Sheets",
    color: `#${siGooglesheets.hex}`,
    path: siGooglesheets.path,
  },
  {
    name: "Slack",
    color: `#${customIcons.Slack.color}`,
    path: customIcons.Slack.path,
  },
  {
    name: "WhatsApp",
    color: `#${siWhatsapp.hex}`,
    path: siWhatsapp.path,
  },
  {
    name: "Sage",
    color: `#${siSage.hex}`,
    path: siSage.path,
  },
  {
    name: "Zoho Books",
    color: `#${customIcons["Zoho Books"].color}`,
    path: customIcons["Zoho Books"].path,
  },
  {
    name: "Zapier",
    color: `#${siZapier.hex}`,
    path: siZapier.path,
  },
  {
    name: "API / Webhooks",
    color: `#${customIcons["API / Webhooks"].color}`,
    path: customIcons["API / Webhooks"].path,
  },
];

export function IntegrationsGrid() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-4 gap-4 md:gap-5">
      {integrations.map((item, i) => {
        const bgColor = `${item.color}10`;
        const borderColor = hoveredIdx === i ? `${item.color}40` : "#e3e8ee";
        return (
          <div
            key={item.name}
            className="aspect-square rounded-2xl border flex items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
            style={{
              backgroundColor: hoveredIdx === i ? bgColor : "#f6f9fc",
              borderColor,
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="flex flex-col items-center gap-1.5 transition-transform duration-300 group-hover:scale-110">
              <svg
                viewBox="0 0 24 24"
                className="size-8"
                style={{ color: item.color }}
                fill="currentColor"
              >
                <path d={item.path} />
              </svg>
              <span className="text-[10px] font-medium text-[#64748d] group-hover:text-[#0d253d] transition-colors text-center leading-tight px-1">
                {item.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
