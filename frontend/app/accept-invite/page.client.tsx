"use client"

import { useState, useEffect, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, CheckCircle2, XCircle, Building2, Mail, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/api/client"
import { login } from "@/lib/api/session"

function LogoBars() {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="h-[3.5px] w-5 rounded-sm bg-sky-400" />
      <div className="h-[3.5px] w-3.5 rounded-sm bg-sky-300" />
      <div className="h-[3.5px] w-2 rounded-sm bg-sky-200/60" />
    </div>
  )
}

interface InviteInfo {
  email: string
  organization_name: string
  organization_id: string
  role: string
  expires_at: string
  is_expired: boolean
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("") // Email de acceso (editable)
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch invitation info on mount
  useEffect(() => {
    if (!token) {
      setError("No se encontró el token de invitación. Revisa el enlace.")
      setLoading(false)
      return
    }

    apiFetch<InviteInfo>(`/api/invitations/${encodeURIComponent(token)}`)
      .then((data) => {
        setInfo(data)
        setEmail(data.email) // Pre-fill with invited email, user can change it
      })
      .catch((err) => {
        setError(err.message || "El enlace de invitación no es válido o ha expirado.")
      })
      .finally(() => setLoading(false))
  }, [token])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !fullName.trim() || !password || !email.trim()) return

    setSubmitting(true)
    try {
      const result = await apiFetch<{
        message: string
        access_token?: string
        token_type?: string
        email?: string
        requires_login?: boolean
        organization_id?: string
        organization_name?: string
      }>("/api/invitations/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          full_name: fullName.trim(),
          password,
          email: email.trim(),
          phone: phone.trim() || undefined,
        }),
      })

      if (result.access_token) {
        // Store token and redirect
        sessionStorage.setItem("access_token", result.access_token)
        localStorage.setItem("access_token", result.access_token)
        setSuccess(true)
        toast.success("¡Bienvenido a Fintral!")
        setTimeout(() => {
          router.push("/dashboard")
        }, 1000)
      } else if (result.requires_login) {
        toast.success(result.message)
        setTimeout(() => {
          router.push("/login")
        }, 1500)
      }
    } catch (err: any) {
      toast.error("Error", { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-6 animate-spin text-sky-400" />
          <p className="text-sm text-zinc-400">Validando invitación...</p>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md border-white/[0.06] bg-zinc-900">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="size-6 text-red-400" />
            </div>
            <CardTitle className="text-lg text-white">Invitación inválida</CardTitle>
            <CardDescription className="text-zinc-400">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => router.push("/login")}>
              Ir a iniciar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Expired state ──
  if (info?.is_expired) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md border-white/[0.06] bg-zinc-900">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <XCircle className="size-6 text-amber-400" />
            </div>
            <CardTitle className="text-lg text-white">Invitación expirada</CardTitle>
            <CardDescription className="text-zinc-400">
              Esta invitación para <strong>{info.email}</strong> ya no es válida.
              Pídele al administrador que te envíe una nueva.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => router.push("/login")}>
              Ir a iniciar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Success state ──
  if (success) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md border-white/[0.06] bg-zinc-900">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-6 text-emerald-400" />
            </div>
            <CardTitle className="text-lg text-white">¡Todo listo!</CardTitle>
            <CardDescription className="text-zinc-400">
              Redirigiendo al dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // ── Form ──
  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
      {/* Left panel */}
      <div className="relative flex w-full flex-col border-r border-white/[0.04] bg-zinc-900 lg:w-1/2">
        <div className="pointer-events-none absolute -left-48 top-1/2 size-[400px] -translate-y-1/2 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5 px-6 pt-6 md:px-12 md:pt-12">
          <div className="flex size-7 items-center justify-center rounded-md bg-gray-950 ring-1 ring-white/[0.08]">
            <LogoBars />
          </div>
          <span className="text-sm font-medium tracking-tight text-white/80">Fintral</span>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-6 md:px-12 md:pb-12">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              {/* Invite info card */}
              {info && (
                <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10">
                      <Building2 className="size-5 text-sky-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {info.organization_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Mail className="size-3 text-zinc-500" />
                        <span className="text-xs text-zinc-400 truncate">{info.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <span>Rol: <strong className="text-zinc-300 capitalize">{info.role}</strong></span>
                    <span className="text-zinc-600">·</span>
                    <span>Expira: {new Date(info.expires_at).toLocaleDateString("es-DO")}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Email de acceso
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="border-white/[0.08] bg-white/[0.03] text-white placeholder:text-zinc-600"
                    required
                  />
                  <p className="mt-1 text-xs text-zinc-600">
                    Este será tu email para iniciar sesión. Puede ser distinto al email invitado.
                  </p>
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Nombre completo
                  </Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className="border-white/[0.08] bg-white/[0.03] text-white placeholder:text-zinc-600"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Teléfono (opcional)
                  </Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 809 555 0123"
                    className="border-white/[0.08] bg-white/[0.03] text-white placeholder:text-zinc-600"
                  />
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Contraseña
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="border-white/[0.08] bg-white/[0.03] text-white placeholder:text-zinc-600 pr-10"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">
                    Mínimo 8 caracteres, con mayúscula, minúscula y número/símbolo.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={!fullName.trim() || !email.trim() || password.length < 8 || submitting}
                  className="mt-2 w-full bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Aceptar invitación y crear cuenta"
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-zinc-600">
                ¿Ya tienes una cuenta?{" "}
                <a href="/login" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                  Inicia sesión
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - hero */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-zinc-950 p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 ring-1 ring-white/[0.06]">
            <Building2 className="size-8 text-sky-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Has sido invitado a {info?.organization_name || "una organización"}
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Completa tus datos para crear tu cuenta y acceder al equipo.
            Podrás gestionar facturas, reportes DGII y más desde tu dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
