"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Info,
  ShoppingBag,
  ChevronRight,
  HardDrive,
  Brain,
  Scan,
  FileCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import {
  getMyPlan,
  getUsageDaily,
  getPaymentProofs,
  type FullUsageResponse,
  type PaymentProof,
  type UsageDailyResponse,
} from "@/lib/api/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";

function isOwnerOrAdmin(role: string | undefined) {
  return role === "owner" || role === "admin";
}

function LimitRow({
  label,
  used,
  limit,
  unit = "",
  onClick,
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  onClick?: () => void;
}) {
  const pct = Math.min((used / (limit || 1)) * 100, 100);
  const color =
    pct >= 90
      ? "bg-destructive"
      : pct >= 75
        ? "bg-amber-500"
        : "bg-primary";
  const inner = (
    <>
      <span className="w-36 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground min-w-[4rem] text-right">
        {unit}
        {used.toFixed(1)} / {unit}
        {limit}
      </span>
      {onClick && <ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex items-center gap-3 w-full hover:bg-accent/40 rounded px-1 -mx-1 py-0.5 transition-colors cursor-pointer text-left">
        {inner}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {inner}
    </div>
  );
}

function UsageDrilldownDialog({
  open,
  onOpenChange,
  resource,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resource: "ecf" | "ai" | "ocr" | "storage" | null;
  data: UsageDailyResponse | undefined;
}) {
  const resourceMeta = {
    ecf: { label: "Documentos ECF", icon: FileCheck, color: "text-blue-500" },
    ai: { label: "Consultas IA", icon: Brain, color: "text-purple-500" },
    ocr: { label: "OCR / Visión IA", icon: Scan, color: "text-amber-500" },
    storage: { label: "Almacenamiento", icon: HardDrive, color: "text-emerald-500" },
  };

  const meta = resource ? resourceMeta[resource] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {meta && <meta.icon className={`size-4 ${meta.color}`} />}
            <DialogTitle className="text-sm font-heading">
              {meta?.label || "Detalle de uso"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Consumo diario durante el período de facturación actual.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {resource === "storage" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {data ? `${data.total_storage_mb.toFixed(1)} MB usados este período` : "Cargando..."}
              </p>
              {data?.storage_items && data.storage_items.length > 0 ? (
                <div className="space-y-1">
                  {data.storage_items.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs truncate">{s.filename}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] uppercase text-muted-foreground">{s.file_type}</span>
                        <span className="font-mono text-xs tabular-nums">
                          {(s.file_size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No hay datos de almacenamiento este período.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {data?.daily && data.daily.length > 0 ? (
                data.daily
                  .filter((d) => {
                    if (resource === "ecf") return d.ecf_count > 0;
                    if (resource === "ai") return d.ai_query_count > 0;
                    if (resource === "ocr") return d.ocr_doc_count > 0;
                    return true;
                  })
                  .map((d) => {
                    const count =
                      resource === "ecf"
                        ? d.ecf_count
                        : resource === "ai"
                          ? d.ai_query_count
                          : d.ocr_doc_count;
                    return (
                      <div
                        key={d.date}
                        className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                      >
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("es-DO", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="font-mono text-xs tabular-nums font-medium">
                          {count} {count === 1 ? "vez" : "veces"}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No hay actividad este período.
                </p>
              )}
              {data?.daily && data.daily.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-center pt-2">
                  {data.daily.filter((d) => {
                    if (resource === "ecf") return d.ecf_count > 0;
                    if (resource === "ai") return d.ai_query_count > 0;
                    if (resource === "ocr") return d.ocr_doc_count > 0;
                    return true;
                  }).length === 0
                    ? "No hay actividad este período"
                    : `Mostrando ${data.daily.filter((d) => {
                        if (resource === "ecf") return d.ecf_count > 0;
                        if (resource === "ai") return d.ai_query_count > 0;
                        if (resource === "ocr") return d.ocr_doc_count > 0;
                        return true;
                      }).length} día(s)`}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanUsageSection({
  data,
}: {
  data: FullUsageResponse | undefined;
}) {
  const u = data?.usage;
  const [drilldownResource, setDrilldownResource] = useState<"ecf" | "ai" | "ocr" | "storage" | null>(null);

  const { data: session } = useSession();
  const role = session?.role;
  const orgId = session?.organization?.id;
  const canManage = isOwnerOrAdmin(role);

  const { data: usageDaily } = useQuery({
    queryKey: ["plans", "usage-daily"],
    queryFn: getUsageDaily,
    enabled: drilldownResource !== null,
  });

  return (
    <>
      <UsageDrilldownDialog
        open={drilldownResource !== null}
        onOpenChange={(v) => { if (!v) setDrilldownResource(null); }}
        resource={drilldownResource}
        data={usageDaily}
      />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <CreditCard className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">Plan y uso</p>
          </div>
          <CardTitle className="text-sm font-heading">Facturación</CardTitle>
          <CardDescription className="text-xs">
            Plan actual, consumo y límites del período.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="default" className="mb-2 text-[10px] h-5 px-2">
                  {data?.plan?.display_name || "Sin plan"}
                </Badge>
                <p className="text-sm font-heading font-semibold">
                  {data?.plan?.description || "Plan no asignado"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data?.subscription?.status === "active"
                    ? "Suscripción activa"
                    : data?.subscription?.status === "trialing"
                      ? "Período de prueba"
                      : data?.subscription?.status === "canceled"
                        ? "Cancelado"
                        : "Sin suscripción"}
                  {data?.subscription?.billing_cycle_end &&
                    ` · Ciclo hasta ${new Date(data.subscription.billing_cycle_end).toLocaleDateString("es-DO")}`}
                </p>
              </div>


            </div>
          </div>

          {u && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setDrilldownResource("ecf")}
                  className="rounded-lg border border-border/60 p-3 text-left hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Documentos ECF
                    </p>
                    <ChevronRight className="size-3 text-muted-foreground/40" />
                  </div>
                  <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
                    {u.ecf.used} / {u.ecf.limit}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    este período
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDrilldownResource("ai")}
                  className="rounded-lg border border-border/60 p-3 text-left hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Consultas IA
                    </p>
                    <ChevronRight className="size-3 text-muted-foreground/40" />
                  </div>
                  <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
                    {u.ai_queries.used} / {u.ai_queries.limit}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    este período
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDrilldownResource("ocr")}
                  className="rounded-lg border border-border/60 p-3 text-left hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      OCR documentos
                    </p>
                    <ChevronRight className="size-3 text-muted-foreground/40" />
                  </div>
                  <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
                    {u.ocr_docs.used} / {u.ocr_docs.limit}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    este período
                  </p>
                </button>
              </div>

              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs font-medium text-foreground mb-3">
                  Límites del plan
                </p>
                <div className="flex flex-col gap-2">
                  <LimitRow
                    label="ECF / mes"
                    used={u.ecf.used}
                    limit={u.ecf.limit}
                    onClick={() => setDrilldownResource("ecf")}
                  />
                  <LimitRow
                    label="Consultas IA / mes"
                    used={u.ai_queries.used}
                    limit={u.ai_queries.limit}
                    onClick={() => setDrilldownResource("ai")}
                  />
                  <LimitRow
                    label="OCR / mes"
                    used={u.ocr_docs.used}
                    limit={u.ocr_docs.limit}
                    onClick={() => setDrilldownResource("ocr")}
                  />
                  <LimitRow
                    label="Almacenamiento"
                    used={u.storage_mb.used}
                    limit={u.storage_mb.limit}
                    unit="MB"
                    onClick={() => setDrilldownResource("storage")}
                  />
                  <LimitRow
                    label="API calls / hora"
                    used={u.api_calls.used}
                    limit={u.api_calls.limit}
                  />
                </div>
              </div>
            </>
          )}

          {!u && (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No hay datos de uso disponibles
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PaymentHistory({
  proofs,
}: {
  proofs: PaymentProof[] | undefined;
}) {
  if (!proofs || proofs.length === 0) return null;

  const statusIcon: Record<string, React.ReactNode> = {
    pending: <Clock className="size-3 text-amber-500" />,
    verified: <CheckCircle2 className="size-3 text-green-500" />,
    rejected: <XCircle className="size-3 text-destructive" />,
  };

  const statusText: Record<string, string> = {
    pending: "Pendiente",
    verified: "Verificado",
    rejected: "Rechazado",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <Clock className="size-4 text-primary" />
          <p className="text-xs font-medium text-primary">Historial</p>
        </div>
        <CardTitle className="text-sm font-heading">
          Pagos realizados
        </CardTitle>
        <CardDescription className="text-xs">
          Comprobantes de pago que has enviado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {proofs.map((proof) => (
          <div
            key={proof.id}
            className="flex items-center justify-between rounded-lg border border-border/60 p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileText className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {proof.plan_name}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  {proof.currency} {proof.amount.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(proof.created_at).toLocaleDateString("es-DO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant={
                  proof.status === "verified"
                    ? "default"
                    : proof.status === "rejected"
                      ? "destructive"
                      : "outline"
                }
                className="flex items-center gap-1 text-[10px] h-5 px-2"
              >
                {statusIcon[proof.status]}
                {statusText[proof.status]}
              </Badge>
              {proof.admin_notes && (
                <div className="group relative">
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-popover p-2 text-[10px] text-popover-foreground shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    {proof.admin_notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function BillingPage() {
  const session = useSession();
  const role = session.data?.role;
  const canManage = isOwnerOrAdmin(role);

  const queryClient = useQueryClient();

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["plans", "my"],
    queryFn: getMyPlan,
    refetchInterval: 30_000,
  });

  const { data: paymentProofs } = useQuery({
    queryKey: ["payment-proofs"],
    queryFn: getPaymentProofs,
    enabled: canManage,
  });

  if (planLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">
              Facturación
            </p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">
            Facturación
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Plan, uso e historial de pagos.
          </p>
        </div>
      </div>

      {/* Plan & Usage - everyone sees this */}
      <PlanUsageSection data={planData} />

      {/* Link to store + statement - only owners/admins */}
      {canManage && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <ShoppingBag className="size-4 text-primary" />
                <p className="text-xs font-medium text-primary">Tienda</p>
              </div>
              <CardTitle className="text-sm font-heading">
                Gestionar plan y addons
              </CardTitle>
              <CardDescription className="text-xs">
                Cambia de plan, adquiere bloques adicionales o renueva desde la tienda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/store">
                <Button size="sm" className="gap-1.5 text-xs">
                  <ShoppingBag className="size-3.5" />
                  Ir a la tienda
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <FileText className="size-4 text-primary" />
                <p className="text-xs font-medium text-primary">Estado de Cuenta</p>
              </div>
              <CardTitle className="text-sm font-heading">
                Pagos mensuales
              </CardTitle>
              <CardDescription className="text-xs">
                Revisa y paga los cargos de bloques IA, almacenamiento y slots adicionales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/billing/statement">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <FileText className="size-3.5" />
                  Ver estado de cuenta
                </Button>
              </Link>
            </CardContent>
          </Card>
        </>
      )}

      {/* Payment history - only owners/admins */}
      {canManage && <PaymentHistory proofs={paymentProofs} />}
    </div>
  );
}
