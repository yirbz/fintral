"use client";

import { useState, useEffect, useRef } from "react";

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie"];

const SCENARIOS = [
  [40, 60, 30, 80, 50],
  [65, 25, 70, 45, 90],
  [30, 75, 55, 95, 35],
  [85, 40, 65, 20, 70],
  [50, 90, 25, 60, 45],
  [70, 35, 80, 50, 95],
  [45, 85, 35, 75, 30],
];

export function BillingMetricsCard() {
  const [scenario, setScenario] = useState(0);
  const [pulseIdx, setPulseIdx] = useState<number[]>(SCENARIOS[0]);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number[]>(SCENARIOS[0]);
  const targetRef = useRef<number[]>(SCENARIOS[0]);

  useEffect(() => {
    const id = setInterval(() => {
      setScenario((prev) => {
        const next = (prev + 1) % SCENARIOS.length;
        const from = SCENARIOS[prev];
        const to = SCENARIOS[next];

        startRef.current = [...from];
        targetRef.current = [...to];

        const startTime = performance.now();
        const duration = 300;

        function tick(now: number) {
          const elapsed = now - startTime;
          const p = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - p, 4);

          const current = from.map((v, i) =>
            Math.round(v + (to[i] - v) * eased)
          );
          setPulseIdx(current);

          if (p < 1) {
            rafRef.current = requestAnimationFrame(tick);
          }
        }

        rafRef.current = requestAnimationFrame(tick);
        return next;
      });
    }, 700);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] bg-white/90 backdrop-blur-md rounded-xl shadow-xl p-6 border border-white/40 transition-all duration-500 hover:shadow-2xl hover:bg-white/95">
      <h4 className="text-[14px] font-medium mb-4">Métricas de facturación</h4>
      <div className="flex items-end gap-2 h-24 mb-2">
        {pulseIdx.map((h, i) => (
          <div
            key={i}
            className="w-full rounded-t-sm transition-[height,background-color] duration-[300ms] ease-out"
            style={{
              height: `${h}%`,
              backgroundColor: `rgba(14, 165, 233, ${0.2 + (h / 100) * 0.8})`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-[#64748d] gap-2">
        {DAYS.map((d) => (
          <span key={d} className="w-full text-center">{d}</span>
        ))}
      </div>
    </div>
  );
}
