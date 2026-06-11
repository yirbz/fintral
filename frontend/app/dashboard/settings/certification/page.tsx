"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, BadgeCheck, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { billingApi } from "@/lib/api/billing";
import { CertificationWizard } from "@/components/billing/certification-wizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ECF_TYPE_MAP: Record<number, string> = {
  31: "Factura de Crédito Fiscal",
  32: "Factura de Consumo",
  33: "Nota de Débito",
  34: "Nota de Crédito",
  41: "Compras",
  43: "Gastos Menores",
  44: "Regímenes Especiales",
  45: "Gubernamentales",
  46: "Exportación",
  47: "Pago al Exterior",
};

export const dynamic = "force-dynamic";

export default function CertificationPage() {
  const queryClient = useQueryClient();
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await billingApi.getVerificationStatus();
      setVerification(status);
    } catch {
      setVerification(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleComplete = useCallback(async () => {
    await fetchStatus();
    queryClient.invalidateQueries({ queryKey: ["billing", "verification-status"] });
    toast.success("Certificación completada exitosamente");
  }, [fetchStatus, queryClient]);

  const isAuthorized = verification?.is_ecf_authorized || verification?.certification_status === "certified";
  const orgName = verification?.name;
  const taxId = verification?.tax_id;

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-4 w-28 rounded-md" /><Skeleton className="h-3 w-44 rounded-md" /></CardHeader>
        <CardContent><Skeleton className="h-40 rounded-lg" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">DGII</p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">
            Certificación Electrónica
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Registra tu empresa como emisor electrónico ante la Dirección General de Impuestos Internos.
          </p>
        </div>
      </div>

      {isAuthorized ? (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 mb-0.5">
              <ShieldCheck className="size-4 text-primary" />
              <p className="text-xs font-medium text-primary">DGII</p>
            </div>
            <CardTitle className="text-sm font-heading">Certificación Electrónica</CardTitle>
            <CardDescription className="text-xs">
              Estado de tu empresa como emisor electrónico ante la DGII.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 flex items-start justify-between gap-4 border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Verificado</p>
                    <Badge className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-600 border-green-500/20">
                      emisor electrónico
                    </Badge>
                  </div>
                  {orgName && <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>}
                  {taxId && <p className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">RNC {taxId}</p>}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Razón Social</p>
                <p className="font-medium mt-0.5">{verification.name || orgName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">RNC</p>
                <p className="font-medium mt-0.5">{verification.tax_id || taxId}</p>
              </div>
              {verification.economic_activity && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actividad Económica</p>
                  <p className="font-medium mt-0.5">{verification.economic_activity}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ambiente Fiscal</p>
                <p className="font-medium text-emerald-600 mt-0.5">Producción / TesteCF</p>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-xs font-medium text-foreground mb-2">Tipos de comprobantes electrónicos</p>
              <div className="flex flex-wrap gap-1.5">
                {[31, 32, 33, 34, 43, 44, 45, 46, 47].map((type) => (
                  <Badge key={type} variant="outline" className="text-[10px] font-normal">
                    E{type} — {ECF_TYPE_MAP[type]?.split(" ")[0] ?? type}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        verification && (
          <CertificationWizard
            initialStatus={verification}
            onComplete={handleComplete}
          />
        )
      )}
    </div>
  );
}
