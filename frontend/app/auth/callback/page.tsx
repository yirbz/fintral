"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogoLoader } from "@/components/logo-loader"
import { toast } from "sonner"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        // 1) Parse tokens/code from URL hash and search query
        const hash = window.location.hash
        const search = window.location.search

        let accessToken: string | null = null
        let code: string | null = null

        if (hash) {
          const hashParams = new URLSearchParams(hash.substring(1))
          accessToken = hashParams.get("access_token")
        }

        if (search) {
          const searchParams = new URLSearchParams(search)
          code = searchParams.get("code")
          if (!accessToken) {
            accessToken = searchParams.get("access_token")
          }
          const errorMsg = searchParams.get("error_description") || searchParams.get("error")
          if (errorMsg) {
            throw new Error(errorMsg)
          }
        }

        if (!accessToken && !code) {
          throw new Error("No se encontró token de acceso o código de autorización.")
        }

        // 2) Send to backend to establish HTTP-only cookie session
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: accessToken,
            code: code,
          }),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.detail || "Error al iniciar sesión.")
        }

        // 3) Successfully logged in, clean up local Session storage/cache and redirect
        try {
          localStorage.removeItem("fintral_active_org")
          localStorage.removeItem("fintral_session")
        } catch { /* noop */ }

        toast.success("¡Sesión iniciada con éxito!")
        router.replace("/dashboard")
      } catch (err: any) {
        console.error("Auth callback error:", err)
        setError(err.message || "Error de autenticación.")
        toast.error(err.message || "Error al completar el inicio de sesión.")
      }
    }

    handleCallback()
  }, [router])

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
        <div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-8 backdrop-blur-sm">
          <div className="mb-4 flex justify-center text-red-500">
            <svg className="size-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">Error de Autenticación</h2>
          <p className="mb-6 text-sm text-zinc-400">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="rounded-lg bg-zinc-800 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return <LogoLoader />
}
