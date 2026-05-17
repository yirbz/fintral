"use client"

import { useEffect, useState } from "react"
import { getMe } from "@/lib/api/session"
import { SignUpForm } from "@/components/signup-form"
import { LogoLoader } from "@/components/logo-loader"

function LogoBars() {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="h-[3.5px] w-5 rounded-sm bg-sky-400" />
      <div className="h-[3.5px] w-3.5 rounded-sm bg-sky-300" />
      <div className="h-[3.5px] w-2 rounded-sm bg-sky-200/60" />
    </div>
  )
}

export default function SignUpPage() {
  const [showLoader, setShowLoader] = useState(true)

  useEffect(() => {
    getMe()
      .then(() => { window.location.href = "/dashboard" })
      .catch(() => setShowLoader(false))
  }, [])

  if (showLoader) return <LogoLoader />

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">

      {/* ── Left: Form panel ── */}
      <div className="relative flex w-full flex-col border-r border-white/[0.04] bg-zinc-900 lg:w-1/2">
        <div className="pointer-events-none absolute -left-48 top-1/2 size-[400px] -translate-y-1/2 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-6 md:px-12">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              <SignUpForm />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Brand panel ── */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-[#09090b] p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="pointer-events-none absolute -top-48 -right-48 size-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 size-[300px] rounded-full bg-sky-400/5 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-black ring-1 ring-white/[0.08]">
              <LogoBars />
            </div>
            <span className="text-xl font-medium tracking-tight text-white/90">Fintral</span>
          </div>

          <h2 className="mb-3 text-[2rem] font-medium leading-tight tracking-tight text-white">
            Gestiona tus facturas <span className="text-sky-400">con IA</span>.
          </h2>

          <p className="mb-12 max-w-sm text-[15px] leading-relaxed text-zinc-500">
            Automatiza el procesamiento de facturas, cumple con la DGII y centraliza tu facturación electrónica en un solo lugar.
          </p>

          <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
            <div className="mb-5 flex items-center justify-between">
              <div className="text-sm font-medium text-white/70">Beneficios</div>
            </div>
            <div className="space-y-4">
              {[
                { label: "Procesamiento automático", value: "IA" },
                { label: "Cumplimiento DGII", value: "NCF" },
                { label: "Soporte WhatsApp", value: "24/7" },
                { label: "Prueba gratuita", value: "14 días" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/[0.03] pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-zinc-500">{item.label}</span>
                  <span className="text-sm font-medium text-white/90">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
