import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex items-center justify-between rounded-lg border bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded bg-black p-1 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold">InvoiceFlow</p>
          </div>
          <Link href="/login">
            <Button size="sm">Ingresar</Button>
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <p className="inline-flex rounded-full border bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              IA + Cumplimiento Fiscal RD
            </p>
            <h1 className="text-5xl font-semibold tracking-tight text-foreground">
              Convierte facturas en datos contables confiables.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              Centraliza captura web + WhatsApp, extracción inteligente, validaciones fiscales y salidas para
              DGII, ERP y BI.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login">
                <Button className="gap-2">
                  Acceso privado
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Operación en un solo flujo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {[
                "Carga por web o WhatsApp.",
                "Extracción + auditoría con IA.",
                "Revisión humana asistida.",
                "Exportaciones y webhooks automáticos."
              ].map((line) => (
                <div className="flex items-center gap-2" key={line}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{line}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
