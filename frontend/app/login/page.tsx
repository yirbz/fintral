import { LoginForm } from "@/components/login-form"
import { Logo } from "@/components/ui/logo"

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Logo size="sm" variant="dark" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#0a0a0a] lg:flex flex-col items-center justify-center p-12 border-l border-border/50">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-sky-500/10 to-transparent" />
        
        <div className="relative z-10 flex flex-col items-start w-full max-w-md">
          <div className="mb-8">
            <Logo variant="light" size="lg" showWordmark={true} />
          </div>
          <h2 className="text-3xl font-medium tracking-tight text-white mb-4">
            Infraestructura financiera IA.
          </h2>
          <p className="text-base text-zinc-400 leading-relaxed mb-10">
            Procesamiento de facturas, cumplimiento fiscal DGII y flujos automatizados vía WhatsApp para la República Dominicana.
          </p>

          <div className="w-full rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
               <div className="text-sm font-medium text-white">Extracción en tiempo real</div>
               <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  99.2% Precisión
               </div>
            </div>
            
            <div className="space-y-3">
              {[
                { label: "Facturas procesadas", value: "12,450", trend: "+18%" },
                { label: "NCFs validados", value: "8,720", trend: "+12%" },
                { label: "Tiempo promedio", value: "1.2s", trend: "-0.4s" }
              ].map((stat, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div className="text-sm text-zinc-400">{stat.label}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{stat.value}</span>
                    <span className="text-xs text-zinc-500">{stat.trend}</span>
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
