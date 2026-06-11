"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getMe } from "@/lib/api/session"
import { LoginForm } from "@/components/login-form"
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

export default function LoginPage() {
  const router = useRouter()
  const [showLoader, setShowLoader] = useState(true)

  useEffect(() => {
    const delay = new Promise<void>((r) => setTimeout(r, 1200))
    const check = getMe().then(() => true).catch(() => false)

    Promise.all([delay, check]).then(([, hasSession]) => {
      setShowLoader(false)
      if (hasSession) router.replace("/dashboard")
    })
  }, [router])

  if (showLoader) return <LogoLoader />

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
      {/* ── Left: Form panel ── */}
      <div className="relative flex w-full flex-col border-r border-white/[0.04] bg-zinc-900 p-8 md:p-12 lg:w-1/2">
        {/* Left glow accent */}
        <div className="pointer-events-none absolute -left-48 top-1/2 size-[400px] -translate-y-1/2 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-black ring-1 ring-white/[0.08]">
            <LogoBars />
          </div>
          <span className="text-sm font-medium tracking-tight text-white/80">Fintral</span>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 backdrop-blur-sm">
              <LoginForm />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Brand panel ── */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-[#09090b] p-12 lg:flex">
        {/* Mesh grid — right side only */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:32px_32px]" />

        {/* Glow orbs */}
        <div className="pointer-events-none absolute -top-48 -right-48 size-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 size-[300px] rounded-full bg-sky-400/5 blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-black ring-1 ring-white/[0.08]">
              <LogoBars />
            </div>
            <span className="text-xl font-medium tracking-tight text-white/90">Fintral</span>
          </div>

          <h2 className="mb-3 text-[2rem] font-medium leading-tight tracking-tight text-white">
            Infraestructura financiera <span className="text-sky-400">IA</span>.
          </h2>

          <p className="mb-12 max-w-sm text-[15px] leading-relaxed text-zinc-500">
            Procesamiento de facturas, cumplimiento fiscal DGII y flujos automatizados vía WhatsApp para República Dominicana.
          </p>

          <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
            <div className="mb-5 flex items-center justify-between">
              <div className="text-sm font-medium text-white/70">Extracción en tiempo real</div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400/80">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                99.2% precisión
              </div>
            </div>

            <div className="space-y-4">
              {[
                { label: "Facturas procesadas", value: "12,450", trend: "+18%" },
                { label: "NCFs validados", value: "8,720", trend: "+12%" },
                { label: "Tiempo promedio", value: "1.2s", trend: "-0.4s" },
              ].map((stat, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/[0.03] pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-zinc-500">{stat.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums text-white/90">{stat.value}</span>
                    <span className="text-xs text-zinc-600">{stat.trend}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
