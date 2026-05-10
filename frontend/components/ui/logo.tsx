"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: { container: "w-6 h-6", bars: { top: "w-3 h-0.5", mid: "w-2 h-0.5", bot: "w-1 h-0.5" }, wordmark: "text-sm" },
  md: { container: "w-10 h-10", bars: { top: "w-5 h-[3.5px]", mid: "w-3.5 h-[3.5px]", bot: "w-2 h-[3.5px]" }, wordmark: "text-lg" },
  lg: { container: "w-12 h-12", bars: { top: "w-6 h-[4px]", mid: "w-4 h-[4px]", bot: "w-2.5 h-[4px]" }, wordmark: "text-xl" },
  xl: { container: "w-16 h-16", bars: { top: "w-8 h-[5px]", mid: "w-5 h-[5px]", bot: "w-3 h-[5px]" }, wordmark: "text-2xl" }
};

export function Logo({ variant = "dark", size = "md", showWordmark = true, className }: LogoProps) {
  const sizeConfig = sizeClasses[size];

  const containerStyles = {
    dark: "bg-zinc-950",
    light: "bg-white border border-zinc-200"
  };

  const barStyles = {
    dark: { top: "bg-sky-400", mid: "bg-sky-300", bot: "bg-white" },
    light: { top: "bg-sky-500", mid: "bg-sky-400", bot: "bg-zinc-950" }
  };

  const wordmarkStyles = {
    dark: "text-zinc-950",
    light: "text-white"
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("rounded-xl flex items-center justify-center", sizeConfig.container, containerStyles[variant])}>
        <div className="flex flex-col gap-1.5">
          <div className={cn("rounded-sm", sizeConfig.bars.top, barStyles[variant].top)} />
          <div className={cn("rounded-sm", sizeConfig.bars.mid, barStyles[variant].mid)} />
          <div className={cn("rounded-sm", sizeConfig.bars.bot, barStyles[variant].bot)} />
        </div>
      </div>
      {showWordmark && (
        <span className={cn("font-medium tracking-tight", sizeConfig.wordmark, wordmarkStyles[variant])}>
          Fintral
        </span>
      )}
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="Fintral"
    >
      <rect width="40" height="40" rx="8" fill="#09090b" />
      <rect x="10" y="11" width="20" height="3.5" rx="1" fill="#38BDF8" />
      <rect x="10" y="18.25" width="14" height="3.5" rx="1" fill="#7DD3FC" />
      <rect x="10" y="25.5" width="9" height="3.5" rx="1" fill="white" />
    </svg>
  );
}

export function LogoDark({ className }: { className?: string }) {
  return <Logo variant="dark" size="md" className={className} />;
}

export function LogoLight({ className }: { className?: string }) {
  return <Logo variant="light" size="md" className={className} />;
}