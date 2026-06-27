"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { User, Receipt, FileText } from "lucide-react";

export function AccountNav() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: "Mi plan", path: "/dashboard/cuenta", icon: User },
    { label: "Historial de pagos", path: "/dashboard/cuenta/pagos", icon: Receipt },
    { label: "Estado de cuenta", path: "/dashboard/cuenta/estado", icon: FileText },
  ];

  return (
    <div className="flex border-b border-brand-hairline dark:border-slate-800/60 pb-px gap-6 overflow-x-auto select-none no-scrollbar">
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={cn(
              "flex items-center gap-1.5 pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all leading-none whitespace-nowrap",
              isActive
                ? "border-brand-primary text-brand-primary dark:border-sky-400 dark:text-sky-400"
                : "border-transparent text-brand-ink-mute hover:text-brand-ink dark:text-slate-400 dark:hover:text-white"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
