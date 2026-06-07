"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Building2,
  Zap,
  Globe,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { billingApi, testAlanubeConnection } from "@/lib/api/billing";
import { getStatistics } from "@/lib/api/statistics";
import { getSettings, saveSettings } from "@/lib/api/settings";
import type { StatisticsPayload } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const ECF_TYPE_MAP: Record<number, string> = {
  31: "Factura Crédito Fiscal",
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

function LimitRow({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground min-w-[4rem] text-right">
        {unit}{used.toFixed(1)} / {unit}{limit}
      </span>
    </div>
  );
}

function PlanUsageSection({ stats }: { stats: StatisticsPayload | undefined }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <CreditCard className="size-4 text-primary" />
          <p className="text-xs font-medium text-primary">Plan y uso</p>
        </div>
        <CardTitle className="text-sm font-heading">Facturación</CardTitle>
        <CardDescription className="text-xs">Plan actual, consumo y límites del período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/2 p-4">
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="default" className="mb-2 text-[10px] h-5 px-2">Plan Pro</Badge>
              <p className="text-sm font-heading font-semibold">Procesamiento IA + WhatsApp</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Incluye OpenAI, Evolution API, exportaciones DGII y soporte prioritario.</p>
            </div>
            <Button variant="outline" size="sm" disabled className="text-[11px] h-7">
              Cambiar plan
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Facturas procesadas</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">{stats?.queue.processed_total ?? 0}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">este período</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Cola pendiente</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">{stats?.queue.pending ?? 0}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">por procesar</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Costo IA</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">${stats?.costs.total_cost.toFixed(2) ?? "0.00"}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">total acumulado</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-foreground mb-3">Límites del plan</p>
          <div className="flex flex-col gap-2">
            <LimitRow label="Documentos / mes" used={stats?.queue.processed_total ?? 0} limit={500} />
            <LimitRow label="Costo IA / día" used={stats?.costs.total_cost ?? 0} limit={10} unit="$" />
            <LimitRow label="API requests / hora" used={stats?.queue.pending ?? 0} limit={100} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CertificationSection() {
  const verQuery = useQuery({
    queryKey: ["billing", "verification-status"],
    queryFn: () => billingApi.getVerificationStatus(),
  });

  const isAuthorized = verQuery.data?.is_ecf_authorized;
  const taxId = verQuery.data?.tax_id;
  const orgName = verQuery.data?.name;

  if (verQuery.isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-4 w-28 rounded-md" /><Skeleton className="h-3 w-44 rounded-md" /></CardHeader>
        <CardContent><Skeleton className="h-20 rounded-lg" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <ShieldCheck className="size-4 text-primary" />
          <p className="text-xs font-medium text-primary">DGII</p>
        </div>
        <CardTitle className="text-sm font-heading">Certificación Electrónica</CardTitle>
        <CardDescription className="text-xs">
          Estado de tu empresa como emisor electrónico ante la DGII.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className={cn(
          "rounded-lg border p-4 flex items-start justify-between gap-4",
          isAuthorized
            ? "border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10"
            : "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10"
        )}>
          <div className="flex items-start gap-3">
            {isAuthorized ? (
              <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{isAuthorized ? "Verificado" : "No verificado"}</p>
                <Badge variant={isAuthorized ? "default" : "outline"} className={cn(
                  "text-[10px] h-4 px-1.5",
                  isAuthorized ? "bg-green-500/10 text-green-600 border-green-500/20" : ""
                )}>
                  {isAuthorized ? "emisor electrónico" : "pendiente"}
                </Badge>
              </div>
              {orgName && <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>}
              {taxId && <p className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">RNC {taxId}</p>}
              {!isAuthorized && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Completa la verificación para emitir comprobantes electrónicos (e-CF) tipo 31-34, 43-47.
                </p>
              )}
            </div>
          </div>
          {isAuthorized ? (
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] h-7 shrink-0"
              disabled
            >
              Verificado
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="text-[11px] h-7 shrink-0"
              onClick={() => {
                window.location.href = "/billing/settings";
              }}
            >
              Configurar certificación
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-foreground mb-2">Tipos de comprobantes disponibles</p>
          <div className="flex flex-wrap gap-1.5">
            {[31, 32, 33, 34, 43, 44, 45, 46, 47].map((type) => (
              <Badge
                key={type}
                variant="outline"
                className={cn(
                  "text-[10px] font-normal",
                  isAuthorized ? "" : "opacity-40"
                )}
              >
                E{type} — {ECF_TYPE_MAP[type]?.split(" ")[0] ?? type}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlanubeSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [showKey, setShowKey] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [jwtToken, setJwtToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; company?: unknown; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const alanubeUrlSetting = settingsQuery.data?.alanube?.find((s: any) => s.key === "api_url");
  const alanubeJwtSetting = settingsQuery.data?.alanube?.find((s: any) => s.key === "jwt_token");

  const storedUrl = typeof alanubeUrlSetting?.value === "string" ? alanubeUrlSetting.value : "";
  const storedJwt = typeof alanubeJwtSetting?.value === "string" ? alanubeJwtSetting.value : "";
  const hasCredentials = !!(storedUrl || storedJwt);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testAlanubeConnection({
        api_url: apiUrl.trim() || storedUrl || "https://sandbox-api.alanube.co/dom/v1",
        jwt_token: jwtToken.trim() || storedJwt || "",
      });
      setTestResult(r);
      if (r.ok) toast.success("Conexión Alanube exitosa");
      else toast.error("Error de conexión", { description: r.error });
    } catch {
      setTestResult({ ok: false, error: "Error de red" });
      toast.error("No se pudo conectar con Alanube");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings([
        { key: "api_url", value: apiUrl.trim(), type: "string", category: "alanube" },
        { key: "jwt_token", value: jwtToken.trim(), type: "string", category: "alanube" },
      ]);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setApiUrl("");
      setJwtToken("");
      toast.success("Configuración de Alanube guardada");
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  const displayUrl = storedUrl || apiUrl || "https://sandbox-api.alanube.co/dom/v1";
  const hasStoredJwt = !!storedJwt;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <Globe className="size-4 text-primary" />
          <p className="text-xs font-medium text-primary">Alanube</p>
        </div>
        <CardTitle className="text-sm font-heading">Conexión Alanube API</CardTitle>
        <CardDescription className="text-xs">
          Configura la integración con Alanube para emitir comprobantes electrónicos ante la DGII.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className={cn(
          "rounded-lg border p-3 flex items-center gap-3",
          hasStoredJwt
            ? "border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10"
            : "border-border/60"
        )}>
          {hasStoredJwt ? (
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          ) : (
            <div className="size-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              {hasStoredJwt ? "API configurada" : "Sin configurar"}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">{displayUrl}</p>
          </div>
          {hasStoredJwt && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-600 border-green-500/20">
              conectado
            </Badge>
          )}
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              API URL
            </Label>
            <Input
              placeholder="https://sandbox-api.alanube.co/dom/v1"
              value={apiUrl || storedUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground/60">Sandbox por defecto. Cambia a producción cuando estés listo.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              JWT Token
            </Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={hasStoredJwt ? "••••••••••••••••" : "Ingresa tu JWT de Alanube"}
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
                className="h-7 text-xs pr-8"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Obten tu JWT en <a href="https://alanube.co" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">alanube.co</a>
            </p>
          </div>
        </div>

        {testResult && (
          <div className={cn(
            "px-3 py-2 rounded-lg text-xs border",
            testResult.ok
              ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900/30"
              : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/30"
          )}>
            {testResult.ok
              ? `✓ Conexión exitosa — empresa verificada`
              : `✗ ${testResult.error || "Error de conexión"}`}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] h-7"
            disabled={testing || (!jwtToken && !hasStoredJwt)}
            onClick={handleTest}
          >
            {testing ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
            Probar conexión
          </Button>
          <Button
            size="sm"
            className="text-[11px] h-7"
            disabled={saving || (!apiUrl && !jwtToken)}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SequencesSection() {
  const seqQuery = useQuery({
    queryKey: ["billing", "sequences"],
    queryFn: () => billingApi.getSequences(),
  });

  const active = seqQuery.data?.filter((s) => s.is_active) ?? [];
  const inactive = seqQuery.data?.filter((s) => !s.is_active) ?? [];

  if (seqQuery.isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-4 w-28 rounded-md" /><Skeleton className="h-3 w-44 rounded-md" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-14 rounded-lg" />))}
        </CardContent>
      </Card>
    );
  }

  function allSeqs() {
    if (seqQuery.data && seqQuery.data.length > 0) {
      return [...active, ...inactive];
    }
    return [];
  }

  const sequences = allSeqs();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <FileText className="size-4 text-primary" />
          <p className="text-xs font-medium text-primary">e-CF</p>
        </div>
        <CardTitle className="text-sm font-heading">Secuencias de Comprobantes</CardTitle>
        <CardDescription className="text-xs">
          Rangos de numeración e-CF/NCF registrados para emisión.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sequences.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
            <FileText className="size-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No hay secuencias registradas</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Carga una secuencia e-CF o NCF desde la sección de emisión de facturas.</p>
          </div>
        ) : (
          sequences.map((seq) => {
            const usage = seq.end_number - seq.start_number + 1;
            const consumed = seq.current_number - seq.start_number + 1;
            const pct = Math.min((consumed / usage) * 100, 100);
            const isExhausted = seq.current_number >= seq.end_number;
            const label = ECF_TYPE_MAP[seq.ecf_type] ?? `Tipo ${seq.ecf_type}`;
            return (
              <div
                key={seq.id}
                className={cn(
                  "rounded-lg border p-3",
                  seq.is_active ? "border-l-2 border-l-primary border-border/80" : "border-border/60 opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">{label}</p>
                      <Badge variant="outline" className="font-mono text-[10px] h-4 px-1.5">
                        {seq.prefix}{seq.ecf_type.toString().padStart(2, "0")}
                      </Badge>
                      {isExhausted && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20">
                          agotado
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-0.5">
                      #{seq.current_number.toString().padStart(8, "0")} / {seq.end_number.toString().padStart(8, "0")}
                    </p>
                  </div>
                  <Badge variant={seq.is_active ? "default" : "outline"} className={cn(
                    "text-[10px] h-4 px-1.5",
                    seq.is_active ? "" : ""
                  )}>
                    {seq.is_active ? "activo" : "inactivo"}
                  </Badge>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isExhausted ? "bg-destructive" : pct > 75 ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {seq.expiry_date && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    Vence: {new Date(seq.expiry_date).toLocaleDateString("es-DO")}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function BillingPage() {
  const statsQuery = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") });
  const stats = statsQuery.data as StatisticsPayload | undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">Facturación y certificación</p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">
            Facturación Electrónica
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Plan, certificación DGII, conexión Alanube y secuencias de comprobantes.
          </p>
        </div>
      </div>

      {statsQuery.isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <PlanUsageSection stats={stats} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CertificationSection />
            <AlanubeSection />
          </div>
          <SequencesSection />
        </div>
      )}
    </div>
  );
}
