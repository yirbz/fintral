"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { forgotPassword, resetPassword } from "@/lib/api/auth";

function StepEmail({
  email, setEmail, loading, onSubmit,
}: {
  email: string; setEmail: (v: string) => void;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Restablecer contraseña</h1>
        <p className="text-sm text-balance text-zinc-400">
          Ingresa tu correo y te enviaremos un código de verificación.
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email" className="text-zinc-300">Correo electrónico</FieldLabel>
          <Input id="email" type="email" placeholder="usuario@fintral.com" required autoFocus
            className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field>
          <Button type="submit" className="w-full" disabled={!email.trim() || loading}>
            {loading ? "Enviando..." : "Enviar código"}
          </Button>
        </Field>
      </FieldGroup>
      <p className="text-center text-sm text-zinc-500">
        <a href="/login" className="font-medium text-white/70 underline-offset-4 hover:text-white hover:underline">
          Volver al inicio de sesión
        </a>
      </p>
    </form>
  );
}

function StepReset({
  email,
  code, setCode,
  password, setPassword,
  confirmPassword, setConfirmPassword,
  showPassword, showConfirmPassword,
  setShowPassword, setShowConfirmPassword,
  loading,
  onSubmit,
  onBack,
}: {
  email: string;
  code: string; setCode: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  showPassword: boolean; showConfirmPassword: boolean;
  setShowPassword: (v: boolean) => void; setShowConfirmPassword: (v: boolean) => void;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
}) {
  const valid = code.trim().length === 6 && password.length >= 6 && password === confirmPassword;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Nueva contraseña</h1>
        <p className="text-sm text-balance text-zinc-400">
          Ingresa el código que enviamos a <span className="text-zinc-300">{email}</span> y tu nueva contraseña.
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="resetCode" className="text-zinc-300">Código de verificación</FieldLabel>
          <Input id="resetCode" type="text" inputMode="numeric" placeholder="123456" required autoFocus maxLength={6}
            className="border-white/10 bg-white/5 text-center font-mono text-lg tracking-[0.5em] text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="resetPassword" className="text-zinc-300">Nueva contraseña</FieldLabel>
          <div className="relative">
            <Input id="resetPassword" type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres" required minLength={6}
              className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" tabIndex={-1}>
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
        <Field>
          <FieldLabel htmlFor="resetConfirmPassword" className="text-zinc-300">Confirmar contraseña</FieldLabel>
          <div className="relative">
            <Input id="resetConfirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Repite tu contraseña" required
              className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" tabIndex={-1}>
              {showConfirmPassword ? (
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
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
          <Button type="submit" className="flex-1" disabled={!valid || loading}>
            {loading ? "Restableciendo..." : "Restablecer contraseña"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar el código");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, code, password);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al restablecer la contraseña");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className={cn("flex flex-col gap-4 text-center", className)} {...props}>
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
          <svg className="size-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 6 4.5 8.5 10 3" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Contraseña actualizada</h1>
        <p className="text-sm text-zinc-400">
          Tu contraseña se ha restablecido correctamente. Ahora puedes iniciar sesión con tu nueva contraseña.
        </p>
        <a href="/logout"
          className="inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 transition-colors">
          Iniciar sesión
        </a>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {step === "email" && (
        <StepEmail
          email={email} setEmail={setEmail}
          loading={loading}
          onSubmit={handleSendCode}
        />
      )}

      {step === "reset" && (
        <StepReset
          email={email}
          code={code} setCode={setCode}
          password={password} setPassword={setPassword}
          confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
          showPassword={showPassword} showConfirmPassword={showConfirmPassword}
          setShowPassword={setShowPassword} setShowConfirmPassword={setShowConfirmPassword}
          loading={loading}
          onSubmit={handleReset}
          onBack={() => { setStep("email"); setError(""); }}
        />
      )}
    </div>
  );
}
