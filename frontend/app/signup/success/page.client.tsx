"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { getMe } from "@/lib/api/session"
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

export default function SignUpSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || "tu correo"
  const [showLoader, setShowLoader] = useState(true)

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await getMe();
        window.location.href = "/dashboard";
      } catch {
        // No session — stay on success page
      } finally {
        setShowLoader(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  if (showLoader) return <LogoLoader />

  return (
    <div className="flex h-dvh items-center justify-center bg-zinc-950 p-8">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none fixed -top-48 left-1/2 size-[500px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center backdrop-blur-sm">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <svg className="size-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="mb-2 text-xl font-semibold text-white">Revisa tu email</h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-400">
            Te hemos enviado un enlace de confirmación a <span className="font-medium text-zinc-300">{email}</span>. Haz clic en el enlace para activar tu cuenta y poder iniciar sesión.
          </p>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-xs text-zinc-500">
              ¿No recibiste el email? Revisa tu carpeta de spam o{" "}
              <Link href="/signup" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
                intenta con otro correo
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded bg-gray-950 ring-1 ring-white/[0.08]">
              <LogoBars />
            </div>
            <span className="text-xs text-zinc-600">Fintral</span>
          </div>
        </div>
      </div>
    </div>
  )
}
