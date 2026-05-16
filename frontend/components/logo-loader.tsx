"use client"

import { Logo } from "@/components/ui/logo"

export function LogoLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="animate-logo-pulse">
          <Logo variant="dark" size="xl" showWordmark={false} />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="animate-logo-fade text-lg font-semibold tracking-tight text-foreground">
            Fintral
          </span>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 animate-logo-dot rounded-full bg-foreground/40" style={{ animationDelay: "0ms" }} />
            <span className="size-1.5 animate-logo-dot rounded-full bg-foreground/40" style={{ animationDelay: "200ms" }} />
            <span className="size-1.5 animate-logo-dot rounded-full bg-foreground/40" style={{ animationDelay: "400ms" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
