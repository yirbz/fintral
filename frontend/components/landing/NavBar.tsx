"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/ui/logo";

const navLinks = [
  { label: "Productos", href: "#features" },
  { label: "Precios", href: "#pricing" },
  { label: "Documentación", href: "#docs" },
];

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="relative z-20 flex items-center justify-between py-5">
      <Logo variant="dark" size="md" />

      <nav className="hidden md:flex items-center gap-8 text-[15px] text-[#64748d] font-light">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hover:text-[#0d253d] transition-colors duration-200"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="hidden md:flex items-center gap-4">
        <Link
          href="/login"
          className="text-[15px] text-[#0d253d] font-light hover:text-[#533afd] transition-colors duration-200"
        >
          Iniciar sesión
        </Link>
        <Link href="/login">
          <button className="rounded-full bg-[#533afd] text-white hover:bg-[#4434d4] font-normal px-4 py-2 h-auto text-[15px] shadow-sm transition-all duration-200 hover:shadow-md active:bg-[#2e2b8c]">
            Comenzar <ArrowRight className="ml-1.5 inline size-4" />
          </button>
        </Link>
      </div>

      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden p-2 text-[#0d253d]"
        aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border border-[#e3e8ee] rounded-xl shadow-elevated p-4 mt-2 md:hidden z-30">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-[15px] text-[#64748d] hover:text-[#0d253d] transition-colors py-1"
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-[#e3e8ee]" />
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="text-[15px] text-[#0d253d] font-light"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-full bg-[#533afd] text-white hover:bg-[#4434d4] font-normal px-4 py-2.5 text-[15px] text-center transition-colors"
            >
              Comenzar <ArrowRight className="ml-1.5 inline size-4" />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
