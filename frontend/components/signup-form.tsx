"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { register, verifyAndLogin, resendCode } from "@/lib/api/auth";
import { dgiiService } from "@/lib/services/dgii";
import { consultRncAction } from "@/app/actions/dgii";
import { Loader2 } from "lucide-react";

const SIGNUP_STORAGE_KEY = "fintral_signup";

interface SignupStorage {
  email: string;
  step: number;
}

function saveSignupState(email: string, step: number) {
  try {
    sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify({ email, step }));
  } catch {}
}

function loadSignupState(): SignupStorage | null {
  try {
    const raw = sessionStorage.getItem(SIGNUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSignupState() {
  try {
    sessionStorage.removeItem(SIGNUP_STORAGE_KEY);
  } catch {}
}

interface StepDef {
  label: string;
  desc: string;
}

const STEPS: StepDef[] = [
  { label: "Cuenta", desc: "Tus datos de acceso" },
  { label: "Empresa", desc: "Información fiscal" },
  { label: "Verificar", desc: "Código de verificación" },
];

function StepIndicator({ current, goTo }: { current: number; goTo: (s: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={i} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => isDone && goTo(i)}
              disabled={!isDone}
              className={cn(
                "flex items-center gap-2.5 transition-all",
                isDone && "cursor-pointer",
                !isDone && !isActive && "opacity-40",
              )}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all",
                  isDone && "bg-sky-500 text-white",
                  isActive && "bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40",
                  !isDone && !isActive && "bg-white/5 text-zinc-600",
                )}
              >
                {isDone ? (
                  <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2 6 4.5 8.5 10 3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div className={cn("text-xs font-medium", isActive ? "text-white" : "text-zinc-500")}>{step.label}</div>
                <div className="text-[10px] text-zinc-600">{step.desc}</div>
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px w-8 sm:w-12 transition-colors", i < current ? "bg-sky-500/50" : "bg-white/5")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function _validateEmail(v: string): string | null {
  if (!v.trim()) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Formato inválido (ej: usuario@dominio.com)";
}

function _validateName(v: string): string | null {
  const parts = v.trim().split(/\s+/);
  if (parts.length < 2) return "Debe incluir nombre y apellido";
  for (const p of parts) {
    if (!/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(p)) return "No puede contener solo números o símbolos";
  }
  return null;
}

function _passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function _strengthLabel(score: number): { label: string; color: string; bars: number } {
  if (score <= 1) return { label: "Débil", color: "bg-red-500", bars: 1 };
  if (score <= 3) return { label: "Media", color: "bg-amber-500", bars: 2 };
  if (score <= 4) return { label: "Buena", color: "bg-lime-500", bars: 3 };
  return { label: "Fuerte", color: "bg-emerald-500", bars: 4 };
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = _passwordScore(password);
  const { label, color, bars } = _strengthLabel(score);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= bars ? color : "bg-white/10"}`}
          />
        ))}
      </div>
      <p className={`text-[10px] ${score <= 1 ? "text-red-400" : score <= 3 ? "text-amber-400" : "text-emerald-400"}`}>
        {label}
      </p>
    </div>
  );
}

function StepAccount({
  fullName,
  setFullName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  showConfirmPassword,
  setShowPassword,
  setShowConfirmPassword,
}: {
  fullName: string; setFullName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  showPassword: boolean; showConfirmPassword: boolean;
  setShowPassword: (v: boolean) => void; setShowConfirmPassword: (v: boolean) => void;
}) {
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const nameError = nameTouched ? _validateName(fullName) : null;
  const emailError = emailTouched ? _validateEmail(email) : null;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const valid =
    fullName.trim().length > 0 &&
    !_validateName(fullName) &&
    email.trim().length > 0 &&
    !_validateEmail(email) &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    password === confirmPassword;
  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Tus datos</h1>
        <p className="text-sm text-balance text-zinc-400">Crea tu cuenta de acceso</p>
      </div>
      <Field>
        <FieldLabel htmlFor="fullName" className="text-zinc-300">Nombre completo</FieldLabel>
        <Input id="fullName" type="text" placeholder="Juan Pérez" required autoFocus
          className={`border ${nameError ? "border-red-500/60" : "border-white/10"} bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50`}
          value={fullName} onChange={(e) => setFullName(e.target.value)} onBlur={() => setNameTouched(true)} />
        {nameError && <p className="mt-1 text-[11px] text-red-400">{nameError}</p>}
      </Field>
      <Field>
        <FieldLabel htmlFor="email" className="text-zinc-300">Correo electrónico</FieldLabel>
        <Input id="email" type="email" placeholder="usuario@dominio.com" required
          className={`border ${emailError ? "border-red-500/60" : "border-white/10"} bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50`}
          value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} />
        {emailError && <p className="mt-1 text-[11px] text-red-400">{emailError}</p>}
      </Field>
      <Field>
        <FieldLabel htmlFor="password" className="text-zinc-300">Contraseña</FieldLabel>
        <div className="relative">
          <Input id="password" type={showPassword ? "text" : "password"} placeholder="Mín. 8 caracteres" required
            className="border border-white/10 bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
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
        <PasswordStrength password={password} />
      </Field>
      <Field>
        <FieldLabel htmlFor="confirmPassword" className="text-zinc-300">Confirmar contraseña</FieldLabel>
        <div className="relative">
          <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Repite tu contraseña" required
            className={`border ${passwordMismatch ? "border-red-500/60" : "border-white/10"} bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50`}
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
        {passwordMismatch && <p className="mt-1 text-[11px] text-red-400">Las contraseñas no coinciden</p>}
      </Field>
      <Field>
        <Button type="submit" className="w-full" disabled={!valid}>Continuar</Button>
      </Field>
    </FieldGroup>
  );
}

function StepCompany({
  companyName, setCompanyName,
  taxId, setTaxId,
  phone, setPhone,
  onBack,
  loading,
}: {
  companyName: string; setCompanyName: (v: string) => void;
  taxId: string; setTaxId: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  onBack: () => void;
  loading: boolean;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    name?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    const clean = dgiiService.cleanRNC(taxId);
    if (clean.length === 9 || clean.length === 11) {
      if (dgiiService.isValidRNC(clean)) {
        let active = true;
        const lookup = async () => {
          setVerifying(true);
          setVerificationResult(null);
          try {
            const data = await consultRncAction(clean);
            if (!active) return;
            if (data && data.name) {
              setVerificationResult({ success: true, name: data.name });
              // Autofill company name if empty
              if (!companyName.trim()) {
                setCompanyName(data.name);
              }
            } else {
              setVerificationResult({ success: false, message: "No encontrado en padrón DGII" });
            }
          } catch (e) {
            if (!active) return;
            setVerificationResult({ success: false, message: "Error de conexión con DGII" });
          } finally {
            if (active) setVerifying(false);
          }
        };
        lookup();
        return () => { active = false; };
      } else {
        setVerificationResult({ success: false, message: "Formato/Dígito verificador inválido" });
      }
    } else {
      setVerificationResult(null);
    }
  }, [taxId, setCompanyName]);

  const valid = companyName.trim().length > 0;
  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Tu empresa</h1>
        <p className="text-sm text-balance text-zinc-400">Información fiscal y contacto</p>
      </div>
      <Field>
        <FieldLabel htmlFor="companyName2" className="text-zinc-300">Nombre de la empresa</FieldLabel>
        <Input id="companyName2" type="text" placeholder="Mi Empresa S.R.L." required autoFocus
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
          value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="taxId2" className="text-zinc-300">RNC / Cédula</FieldLabel>
        <Input id="taxId2" type="text" inputMode="numeric" placeholder="123-45678-9" maxLength={11}
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50 font-mono"
          value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 11))} />
        {verifying && (
          <p className="mt-1 text-xs text-sky-400 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="size-3 animate-spin" />
            Buscando RNC en la DGII...
          </p>
        )}
        {verificationResult && !verifying && (
          <p className={cn(
            "mt-1 text-xs flex items-center gap-1.5",
            verificationResult.success ? "text-emerald-400" : "text-amber-400"
          )}>
            {verificationResult.success ? (
              <>
                <svg className="size-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 6 4.5 8.5 10 3" />
                </svg>
                <span>RNC Verificado: <strong>{verificationResult.name}</strong></span>
              </>
            ) : (
              <>
                <span className="shrink-0 text-[10px]">⚠</span>
                <span>{verificationResult.message}. Puedes continuar de todos modos.</span>
              </>
            )}
          </p>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="phone2" className="text-zinc-300">Teléfono</FieldLabel>
        <Input id="phone2" type="tel" placeholder="809-555-0100"
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
          value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button type="submit" className="flex-1" disabled={!valid || loading}>
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </div>
    </FieldGroup>
  );
}

function StepVerify({
  email,
  code,
  setCode,
  onBack,
  onResend,
  loading,
  resending,
}: {
  email: string;
  code: string;
  setCode: (v: string) => void;
  onBack: () => void;
  onResend: () => void;
  loading: boolean;
  resending: boolean;
}) {
  const valid = code.trim().length === 6;
  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Verifica tu cuenta</h1>
        <p className="text-sm text-balance text-zinc-400">
          Ingresa el código de 6 dígitos que enviamos a <span className="text-zinc-300">{email}</span>
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="code" className="text-zinc-300">Código de verificación</FieldLabel>
        <Input id="code" type="text" inputMode="numeric" placeholder="123456" required autoFocus maxLength={6}
          className="border-white/10 bg-white/5 text-center font-mono text-lg tracking-[0.5em] text-white placeholder:text-zinc-500 focus-visible:border-sky-500/50"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </Field>
      <Field>
        <Button type="submit" className="w-full" disabled={!valid || loading}>
          {loading ? "Verificando..." : "Verificar cuenta"}
        </Button>
      </Field>
      <div className="flex justify-center">
        <button type="button" onClick={onResend} disabled={resending}
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline disabled:opacity-50">
          {resending ? "Reenviando..." : "Reenviar código"}
        </button>
      </div>
      <div className="flex justify-center">
        <button type="button" onClick={onBack}
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline">
          Corregir datos
        </button>
      </div>
    </FieldGroup>
  );
}

export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [step, setStep] = useState(0);

  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [code, setCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | React.ReactNode>("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    const saved = loadSignupState();
    if (saved && saved.step === 2) {
      setEmail(saved.email);
      setStep(2);
      setResuming(true);
    }
  }, []);

  function goToStep(newStep: number) {
    setStep(newStep);
    setError("");
    if (newStep === 0) {
      clearSignupState();
    }
  }

  function handleAccountStep(e: FormEvent) {
    e.preventDefault();
    setError("");
    setStep(1);
  }

  async function handleCompanyStep(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError("La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número");
      return;
    }

    const cleanTaxId = dgiiService.cleanRNC(taxId);
    if (cleanTaxId && !dgiiService.isValidRNC(cleanTaxId)) {
      setError("El RNC / Cédula ingresado es inválido. Debe tener 9 u 11 dígitos y cumplir con el dígito verificador.");
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, full_name: fullName, company_name: companyName, tax_id: cleanTaxId || "", phone });
      saveSignupState(email, 2);
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear la cuenta";
      if (msg.includes("ya está registrado")) {
        setError(<>Este email ya está registrado. <a href="/login" className="underline text-zinc-300">Inicia sesión</a></>);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyStep(e: FormEvent) {
    e.preventDefault();
    setError("");

    setLoading(true);
    try {
      await verifyAndLogin(email, code);
      clearSignupState();
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      await resendCode(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reenviar el código");
    } finally {
      setResending(false);
    }
  }

  function handleBackToData() {
    setError("");
    clearSignupState();
    setStep(1);
  }

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      onSubmit={step === 0 ? handleAccountStep : step === 1 ? handleCompanyStep : handleVerifyStep}
      {...props}
    >
      <StepIndicator current={step} goTo={goToStep} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive [&_a]:underline [&_a]:text-zinc-300">
          {error}
        </div>
      )}

      {resuming && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Tienes una verificación pendiente. Ingresa el código que enviamos a <strong>{email}</strong> o solicita uno nuevo.
        </div>
      )}

      <div>
        {step === 0 && (
          <StepAccount
            fullName={fullName} setFullName={setFullName}
            email={email} setEmail={setEmail}
            password={password} setPassword={setPassword}
            confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
            showPassword={showPassword} showConfirmPassword={showConfirmPassword}
            setShowPassword={setShowPassword} setShowConfirmPassword={setShowConfirmPassword}
          />
        )}
        {step === 1 && (
          <StepCompany
            companyName={companyName} setCompanyName={setCompanyName}
            taxId={taxId} setTaxId={setTaxId}
            phone={phone} setPhone={setPhone}
            onBack={() => { setStep(0); setError(""); }}
            loading={loading}
          />
        )}
        {step === 2 && (
          <StepVerify
            email={email}
            code={code} setCode={setCode}
            onBack={handleBackToData}
            onResend={handleResend}
            loading={loading}
            resending={resending}
          />
        )}
      </div>

      <p className="text-center text-sm text-zinc-500">
        ¿Ya tienes una cuenta?{" "}
        <Link href="/login" className="font-medium text-white/70 underline-offset-4 hover:text-white hover:underline">
          Inicia sesión
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-zinc-600">
        Al registrarte, aceptas nuestros{" "}
        <a href="#" className="underline underline-offset-2 hover:text-zinc-400">términos y condiciones</a>{" "}
        y{" "}
        <a href="#" className="underline underline-offset-2 hover:text-zinc-400">política de privacidad</a>.
      </p>
    </form>
  )
}
