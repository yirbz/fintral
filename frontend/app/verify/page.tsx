"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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

export default function VerifyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setMessage("Enlace inválido")
      return
    }

    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) {
          setStatus("success")
          setMessage(data.message || "Cuenta verificada correctamente")
        } else {
          setStatus("error")
          setMessage(data.detail || "Enlace inválido o expirado")
        }
      })
      .catch(() => {
        setStatus("error")
        setMessage("Error al verificar la cuenta")
      })
  }, [token])

  if (status === "loading") return <LogoLoader />

  return (
    <div className="flex h-dvh items-center justify-center bg-zinc-950 p-8">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none fixed -top-48 left-1/2 size-[500px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center backdrop-blur-sm">
          <div className={`mx-auto mb-6 flex size-14 items-center justify-center rounded-full ring-1 ${
            status === "success"
              ? "bg-emerald-500/10 ring-emerald-500/20"
              : "bg-destructive/10 ring-destructive/20"
          }`}>
            {status === "success" ? (
              <svg className="size-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="size-6 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </div>

          <h1 className={`mb-2 text-xl font-semibold ${
            status === "success" ? "text-white" : "text-destructive"
          }`}>
            {status === "success" ? "¡Cuenta verificada!" : "Error de verificación"}
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-400">{message}</p>

          {status === "success" && (
            <div className="mt-8">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Ir a iniciar sesión
              </a>
            </div>
          )}

          {status === "error" && (
            <div className="mt-8">
              <a
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Crear cuenta nuevamente
              </a>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded bg-black ring-1 ring-white/[0.08]">
              <LogoBars />
            </div>
            <span className="text-xs text-zinc-600">Fintral</span>
          </div>
        </div>
      </div>
    </div>
  )
}
