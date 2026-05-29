"use client"

import { ForgotPasswordForm } from "@/components/forgot-password-form"

function LogoBars() {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="h-[3.5px] w-5 rounded-sm bg-sky-400" />
      <div className="h-[3.5px] w-3.5 rounded-sm bg-sky-300" />
      <div className="h-[3.5px] w-2 rounded-sm bg-sky-200/60" />
    </div>
  )
}

export default function ForgotPasswordPage() {

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
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
              <ForgotPasswordForm />
            </div>
          </div>
        </div>
      </div>

      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-[#09090b] p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="pointer-events-none absolute -top-48 -right-48 size-[500px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 size-[300px] rounded-full bg-sky-400/5 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-md flex-col items-start">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gray-950 ring-1 ring-white/[0.08]">
              <LogoBars />
            </div>
            <span className="text-xl font-medium tracking-tight text-white/90">Fintral</span>
          </div>
          <h2 className="mb-3 text-[2rem] font-medium leading-tight tracking-tight text-white">
            Recupera el acceso a <span className="text-sky-400">tu cuenta</span>.
          </h2>
          <p className="mb-12 max-w-sm text-[15px] leading-relaxed text-zinc-500">
            Ingresa tu correo y te enviaremos un código para restablecer tu contraseña.
          </p>
        </div>
      </div>
    </div>
  )
}
