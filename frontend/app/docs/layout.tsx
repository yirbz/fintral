"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Shield, BookOpen, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { cn } from "@/lib/utils"

interface DocItem {
  href: string
  label: string
  icon: any
}

interface DocSection {
  title: string
  items: DocItem[]
}

const SECTIONS: DocSection[] = [
  {
    title: "General",
    items: [
      { href: "/docs", label: "Introducción", icon: BookOpen },
      { href: "/docs/terms-conditions", label: "Términos Generales", icon: Shield }
    ]
  },
  {
    title: "Plan Profesional",
    items: [
      { href: "/docs/plans/profesional", label: "Detalles del Plan", icon: FileText }
    ]
  },
  {
    title: "Plan Empresarial",
    items: [
      { href: "/docs/plans/empresarial", label: "Detalles del Plan", icon: FileText }
    ]
  }
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Find active item for mobile selector value
  const allItems = SECTIONS.flatMap(s => s.items)
  const activeItem = allItems.find(item => item.href === pathname) || allItems[0]

  return (
    <div className="min-h-screen bg-[#f6f9fc] text-[#0d253d] flex flex-col font-sans selection:bg-[#0EA5E9]/20">
      {/* HEADER */}
      <header className="border-b border-[#e3e8ee] bg-white w-full z-50 sticky top-0">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <Link href="/" className="transition-transform active:scale-[0.98]">
              <Logo variant="dark" size="md" />
            </Link>
            <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-[#273951]">
              <Link href="/#features" className="hover:text-[#0EA5E9] transition-colors">Características</Link>
              <Link href="/#integrations" className="hover:text-[#0EA5E9] transition-colors">Integraciones</Link>
              <Link href="/plans" className="hover:text-[#0EA5E9] transition-colors">Planes</Link>
              <Link href="/docs" className="text-[#0EA5E9] transition-colors">Docs</Link>
            </nav>
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/login">
                <Button variant="outline" className="rounded-full font-medium px-5 py-4 h-auto text-[13px] border-[#e3e8ee] hover:bg-[#f6f9fc] text-[#0d253d] transition-all active:scale-[0.97]">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="rounded-full bg-[#0EA5E9] text-white hover:bg-[#0284C7] font-medium px-5 py-4 h-auto text-[13px] shadow-sm transition-all active:scale-[0.97]">
                  Comenzar gratis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT SPLIT */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col lg:flex-row gap-8">
        
        {/* SIDEBAR */}
        <aside className="w-full lg:w-64 shrink-0 space-y-6 lg:sticky lg:top-24 h-fit">
          {/* Mobile Selector Dropdown */}
          <div className="block lg:hidden w-full">
            <label htmlFor="doc-select" className="block text-xs font-semibold uppercase tracking-wider text-[#64748d] mb-2">
              Seleccionar Documento
            </label>
            <select
              id="doc-select"
              value={activeItem.href}
              onChange={(e) => {
                window.location.href = e.target.value
              }}
              className="w-full rounded-xl border border-[#e3e8ee] bg-white px-4 py-3 text-[14px] text-[#0d253d] focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9] outline-none"
            >
              {allItems.map(item => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:block space-y-6">
            {SECTIONS.map((section, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#64748d] px-3">
                  {section.title}
                </h4>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left",
                          isActive
                            ? "bg-white text-[#0EA5E9] shadow-sm border border-[#e3e8ee]/40 font-semibold"
                            : "text-[#64748d] hover:text-[#0d253d] hover:bg-white/50"
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", isActive ? "text-[#0EA5E9]" : "text-[#a8c3de]")} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* CONTAINER FOR CONTENT */}
        <main className="flex-1 bg-white rounded-3xl border border-[#e3e8ee] shadow-sm p-8 sm:p-12 min-h-[600px] max-w-3xl">
          {children}
        </main>

      </div>
    </div>
  )
}
