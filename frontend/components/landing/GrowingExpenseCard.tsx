"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

const LIMIT = 60000;
const PROGRESS_CAP = 88;

function formatAmount(n: number): string {
  return `RD$ ${n.toLocaleString("es-DO")}`;
}

export function GrowingExpenseCard() {
  const [targetAmount, setTargetAmount] = useState(24000);
  const [displayedAmount, setDisplayedAmount] = useState(24000);
  const [progress, setProgress] = useState(52);
  const [flash, setFlash] = useState(0);
  const [lastJump, setLastJump] = useState(0);
  const displayRef = useRef(24000);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (displayRef.current === targetAmount) return;

    const startValue = displayRef.current;
    const diff = targetAmount - startValue;
    const duration = 1000;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(startValue + diff * eased);

      displayRef.current = current;
      setDisplayedAmount(current);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetAmount]);

  useEffect(() => {
    const amountId = setInterval(() => {
      setTargetAmount((prev) => {
        const remaining = LIMIT - prev;
        const increment = Math.max(300, Math.round((remaining * 0.35) / 100) * 100);
        if (prev + increment >= LIMIT) return prev;
        setLastJump(increment);
        return prev + increment;
      });
      setFlash((f) => f + 1);
    }, 3800);

    const progressId = setInterval(() => {
      setProgress((prev) => {
        if (prev >= PROGRESS_CAP) return prev;
        const remaining = PROGRESS_CAP - prev;
        const step = Math.max(0.3, remaining * 0.15 + Math.random() * 1.2);
        return Math.min(PROGRESS_CAP, Math.round((prev + step) * 10) / 10);
      });
    }, 2800);

    return () => {
      clearInterval(amountId);
      clearInterval(progressId);
    };
  }, []);

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] bg-white/90 backdrop-blur-md rounded-xl shadow-xl p-6 border border-white/40 transition-all duration-500 hover:shadow-2xl hover:bg-white/95">
      <div className="flex items-center gap-4 mb-4">
        <div className="size-10 rounded-full overflow-hidden relative shrink-0 ring-2 ring-white">
          <Image
            src="https://randomuser.me/api/portraits/men/32.jpg"
            alt="Carlos Mendoza"
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
        <div>
          <div className="text-[14px] font-medium">Aprobación de gastos</div>
          <div className="text-[12px] text-[#64748d]">Carlos Mendoza</div>
        </div>
      </div>

      <div className="h-2 w-full bg-[#f6f9fc] rounded-full mb-3 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-[1500ms] ease-out relative overflow-hidden"
          style={{ width: `${progress}%`, background: "linear-gradient(90deg, #0EA5E9, #38BDF8)" }}
        >
          <div className="absolute inset-0 animate-shimmer-bar" />
        </div>
      </div>

      <div className="relative flex justify-between items-end">
        <span className="text-[11px] text-[#64748d]">Monto aprobado</span>
        <div className="relative">
          <span
            key={flash}
            className="text-[14px] font-mono font-medium [font-feature-settings:'tnum'] text-[#0d253d] tabular-nums transition-colors duration-700"
          >
            {formatAmount(displayedAmount)}
          </span>
          <span
            key={`flash-${flash}`}
            className="absolute -top-3 right-0 text-[11px] font-mono font-medium text-emerald-500 pointer-events-none animate-float-up"
          >
            +{formatAmount(lastJump)}
          </span>
        </div>
      </div>
    </div>
  );
}
