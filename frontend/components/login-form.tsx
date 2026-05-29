"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { login } from "@/lib/api/session";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailError = emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Formato inválido" : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (emailError) return;
    setLoading(true);

    try {
      await login(email, password, remember);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Acceder</h1>
          <p className="text-sm text-balance text-zinc-400">
            Ingresa tus credenciales para acceder al panel
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="email" className="text-zinc-300">Correo electrónico</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="usuario@dominio.com"
            required
            className={`border ${emailError ? "border-red-500/60" : "border-white/10"} bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
          />
          {emailError && <p className="mt-1 text-[11px] text-red-400">{emailError}</p>}
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password" className="text-zinc-300">Contraseña</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </Field>

        {/* Remember me */}
        <label
          htmlFor="remember"
          className="flex cursor-pointer items-center gap-2.5 select-none"
        >
          <div className="relative flex items-center">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
              aria-label="Recordar sesión"
            />
            {/* Custom checkbox visual */}
            <div
              className={cn(
                "flex size-4 items-center justify-center rounded border transition-all duration-150",
                remember
                  ? "border-sky-500 bg-sky-500"
                  : "border-white/20 bg-white/5 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/40"
              )}
              aria-hidden="true"
            >
              {remember && (
                <svg
                  className="size-2.5 text-white"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="1.5 6 4.5 9 10.5 3" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-zinc-400">
            Recordar sesión{" "}
            <span className="text-zinc-600 text-xs">(mantener iniciada 30 días)</span>
          </span>
        </label>

        <Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </Field>
      </FieldGroup>

      {/* Divider */}
      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-xs text-zinc-500">o continúa con</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>

      {/* Google button */}
      <button
        type="button"
        onClick={() => {
          window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/auth/google`;
        }}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <svg className="size-4" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continuar con Google
      </button>

      {/* Register link */}
      <p className="text-center text-sm text-zinc-500">
        ¿No tienes una cuenta?{" "}
        <Link href="/signup" className="font-medium text-white/70 underline-offset-4 hover:text-white hover:underline">
          Regístrate
        </Link>
      </p>

      {/* Terms */}
      <p className="text-center text-xs leading-relaxed text-zinc-600">
        Al continuar, aceptas nuestros{" "}
        <a href="#" className="underline underline-offset-2 hover:text-zinc-400">términos y condiciones</a>{" "}
        y{" "}
        <a href="#" className="underline underline-offset-2 hover:text-zinc-400">política de privacidad</a>.
      </p>
    </form>
  )
}
