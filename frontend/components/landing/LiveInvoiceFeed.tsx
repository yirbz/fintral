"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp } from "lucide-react";

type InvoiceStatus = "Pendiente" | "Procesando" | "Validado" | "Rechazado";

interface Invoice {
  id: string;
  prov: string;
  amt: string;
  rawAmt: number;
  status: InvoiceStatus;
  isNew: boolean;
  justTransitioned?: boolean;
}

const providers = [
  "TechCorp SRL",
  "Oficina Express",
  "Servicios Grales.",
  "Grupo Mota",
  "Distribuidora Corripio",
  "Industrias Nigua",
  "Cervecería Nacional",
  "AES Dominicana",
  "Claro RD",
  "Altice Dominicana",
  "Banco Popular",
  "Multiquímica",
  "Metaldom",
  "Induveca",
  "Casa Cuesta",
];

function randomAmt(): number {
  return Math.round((Math.random() * 90000 + 3000) / 100) * 100;
}

function formatAmt(n: number): string {
  return `RD$ ${n.toLocaleString("es-DO")}.00`;
}

const statusSteps: InvoiceStatus[] = ["Pendiente", "Procesando", "Validado"];

const statusConfig: Record<InvoiceStatus, { dot: string; bg: string; text: string }> = {
  Pendiente: { dot: "bg-amber-400", bg: "bg-amber-50", text: "text-amber-600" },
  Procesando: { dot: "bg-blue-400", bg: "bg-blue-50", text: "text-blue-600" },
  Validado: { dot: "bg-emerald-400", bg: "bg-green-50", text: "text-green-600" },
  Rechazado: { dot: "bg-red-400", bg: "bg-red-50", text: "text-red-600" },
};

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createInvoice(overrides?: Partial<Invoice>): Invoice {
  const raw = overrides?.rawAmt ?? randomAmt();
  return {
    id: randomId(),
    prov: providers[Math.floor(Math.random() * providers.length)],
    amt: formatAmt(raw),
    rawAmt: raw,
    status: "Pendiente",
    isNew: true,
    ...overrides,
  };
}

export function LiveInvoiceFeed() {
  const [invoices, setInvoices] = useState<Invoice[]>(() => [
    createInvoice({ prov: "TechCorp SRL", rawAmt: 45200, status: "Validado", isNew: false }),
    createInvoice({ prov: "Oficina Express", rawAmt: 12450, status: "Pendiente", isNew: false }),
    createInvoice({ prov: "Servicios Grales.", rawAmt: 8900, status: "Validado", isNew: false }),
    createInvoice({ prov: "Grupo Mota", rawAmt: 32100, status: "Procesando", isNew: false }),
  ]);

  const [dailyCount, setDailyCount] = useState(47);
  const [dailyTotal, setDailyTotal] = useState(4285900);

  const tick = useCallback(() => {
    setInvoices((prev) => {
      const next = prev
        .map((inv) => {
          if (inv.status === "Rechazado") return inv;
          const idx = statusSteps.indexOf(inv.status);
          if (idx === -1) return inv;
          if (idx < statusSteps.length - 1 && Math.random() > 0.5) {
            return { ...inv, status: statusSteps[idx + 1], justTransitioned: true, isNew: false };
          }
          return { ...inv, isNew: false, justTransitioned: false };
        })
        .slice(0, 6);

      const newInv = createInvoice();
      next.unshift(newInv);

      return next;
    });

    setDailyCount((c) => c + 1);
    setDailyTotal((t) => t + randomAmt());
  }, []);

  useEffect(() => {
    const interval = setInterval(tick, 3500);
    return () => clearInterval(interval);
  }, [tick]);

  return (
    <>
      {/* Live Invoice Table */}
      <div className="absolute top-6 right-0 sm:top-10 w-[85%] bg-white rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] border border-[#e3e8ee] p-3 sm:p-5 z-20">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <div>
            <h4 className="font-medium text-[13px] sm:text-[14px]">Facturas en vivo</h4>
            <p className="text-[10px] sm:text-[11px] text-[#64748d]">
              <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5 align-middle" />
              Procesando en tiempo real
            </p>
          </div>
          <span className="text-[11px] sm:text-[12px] bg-[#f6f9fc] text-[#64748d] px-2 py-1 rounded tabular-nums">
            {dailyCount} hoy
          </span>
        </div>
        <div className="space-y-1 sm:space-y-1.5">
          {invoices.map((inv) => {
            const cfg = statusConfig[inv.status];
            return (
              <div
                key={inv.id}
                className={`flex justify-between items-center text-[12px] sm:text-[13px] p-1.5 sm:p-2 rounded-md transition-all duration-500 ${
                  inv.isNew
                    ? "animate-slide-down bg-[#f0fdf4] border-l-2 border-emerald-400 -ml-0.5"
                    : inv.justTransitioned
                      ? "animate-status-flash"
                      : "hover:bg-[#f6f9fc]"
                }`}
              >
                <span className="font-medium truncate max-w-[100px] sm:max-w-[120px]">
                  {inv.prov}
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                  <span className="font-mono text-[#61718a] [font-feature-settings:'tnum'] text-[11px] sm:text-[12px]">
                    {inv.amt}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} font-medium transition-all duration-300`}
                  >
                    <span className={`size-1.5 rounded-full ${cfg.dot} ${inv.status === "Procesando" ? "animate-pulse" : ""}`} />
                    <span className="hidden sm:inline">{inv.status}</span>
                    <span className="sm:hidden">{inv.status === "Pendiente" ? "Pend." : inv.status === "Procesando" ? "Proc." : "Val."}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Stats Card */}
      <div className="absolute bottom-6 left-0 sm:bottom-10 w-[55%] bg-white rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] border border-[#e3e8ee] p-3 sm:p-5 z-30">
        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="p-1.5 sm:p-2 bg-[#ea2261]/10 rounded-lg">
            <TrendingUp className="size-4 sm:size-5 text-[#ea2261]" />
          </div>
          <span className="font-medium text-[13px] sm:text-[14px]">Hoy</span>
        </div>
        <div className="flex items-baseline gap-1 sm:gap-1.5">
          <span className="text-[24px] sm:text-[30px] font-light tracking-tight text-[#0d253d] [font-feature-settings:'tnum'] transition-all duration-500">
            {dailyCount}
          </span>
          <span className="text-[12px] sm:text-[13px] text-[#64748d]">facturas</span>
        </div>
        <div className="text-[11px] sm:text-[12px] text-[#64748d] mt-0.5 tabular-nums">
          {dailyTotal.toLocaleString("es-DO")} procesados
        </div>
      </div>
    </>
  );
}
