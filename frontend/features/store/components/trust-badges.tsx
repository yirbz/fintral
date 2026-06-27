"use client";

import React from "react";
import { ShieldAlert, CreditCard, RefreshCw, PhoneCall, ArrowUpRight } from "lucide-react";

export function TrustBadges() {
  const items = [
    { icon: ShieldAlert, label: "Pagos 100% Seguros" },
    { icon: CreditCard, label: "Visa · MC · Amex · Transferencias" },
    { icon: RefreshCw, label: "Cancela sin compromisos" },
    { icon: PhoneCall, label: "Soporte local en RD" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-brand-primary shrink-0" />
              <span className="text-[11px] text-brand-ink-mute dark:text-slate-400 whitespace-nowrap">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <p className="text-[11px] text-brand-ink-mute/60 dark:text-slate-500">
          Procesado por{" "}
          <span className="font-medium text-brand-ink-secondary dark:text-slate-300">
            MIO (GeoPagos)
          </span>{" "}
          (PCI-DSS Level 1) · Transferencias validadas localmente en RD
        </p>
      </div>
    </div>
  );
}
