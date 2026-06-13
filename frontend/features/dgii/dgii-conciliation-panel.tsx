"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock,
  ExternalLink, Loader2, RefreshCw, Save, Search, ShieldCheck,
  XCircle, FileText, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  dgiiConciliate, dgiiConciliateFix, dgiiConciliateDefer,
  dgiiConciliateExclude, dgiiVerifyNcf,
  type DgiiConciliateResult, type DgiiConciliateInvoice,
} from "@/lib/api/dgii";

const REPORTS = [
  { id: "dgii_606", label: "Formulario 606", desc: "Compras de bienes y servicios", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { id: "dgii_607", label: "Formulario 607", desc: "Ventas y comprobantes emitidos", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { id: "dgii_608", label: "Formulario 608", desc: "Comprobantes anulados", color: "text-red-600 bg-red-50 border-red-200" },
];

const FISCAL_STATUS_LABELS: Record<string, { label: string; icon: typeof AlertTriangle; class: string }> = {
  valid: { label: "Válida", icon: CheckCircle2, class: "text-emerald-600 bg-emerald-50" },
  invalid: { label: "Inválida", icon: XCircle, class: "text-red-600 bg-red-50" },
  pending_review: { label: "Pendiente", icon: AlertTriangle, class: "text-amber-600 bg-amber-50" },
  deferred: { label: "Diferida", icon: Clock, class: "text-blue-600 bg-blue-50" },
  non_deductible: { label: "No deducible", icon: ShieldCheck, class: "text-gray-600 bg-gray-50" },
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2 }).format(n);
}

// ── Fix Modal ──────────────────────────────────────────────────────────

function FixModal({
  invoice,
  open,
  onClose,
  onFixed,
}: {
  invoice: DgiiConciliateInvoice;
  open: boolean;
  onClose: () => void;
  onFixed: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (invoice.editable_fields) {
      for (const [k, v] of Object.entries(invoice.editable_fields)) {
        f[k] = String(v.current ?? "");
      }
    }
    return f;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await dgiiConciliateFix(invoice.id, { fields });
      toast.success("Factura corregida y reclasificada");
      onFixed();
      onClose();
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message || "Error del servidor" });
    } finally {
      setSaving(false);
    }
  };

  if (!invoice.editable_fields) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4 text-primary" />
            Corregir factura
          </DialogTitle>
          <DialogDescription className="text-xs">
            {invoice.vendor_name} — {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {Object.entries(invoice.editable_fields).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {key.replace(/_/g, " ")}
              </Label>
              <Input
                value={fields[key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-8 text-xs"
              />
              {val.suggestion != null && (
                <p className="text-[10px] text-muted-foreground">
                  Sugerencia: <span className="text-primary">{String(val.suggestion)}</span>
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
            {saving ? "Guardando..." : "Guardar y reclasificar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Defer Modal ────────────────────────────────────────────────────────

function DeferModal({
  invoice,
  open,
  onClose,
  onDeferred,
}: {
  invoice: DgiiConciliateInvoice;
  open: boolean;
  onClose: () => void;
  onDeferred: () => void;
}) {
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [saving, setSaving] = useState(false);

  const handleDefer = async () => {
    setSaving(true);
    try {
      await dgiiConciliateDefer(invoice.id, { target_period: targetPeriod });
      toast.success(`Factura diferida al período ${targetPeriod}`);
      onDeferred();
      onClose();
    } catch (e: any) {
      toast.error("Error al diferir", { description: e.message || "Error del servidor" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-primary" />
            Diferir factura
          </DialogTitle>
          <DialogDescription className="text-xs">
            {invoice.vendor_name} — {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Esta factura se excluirá del período actual y se incluirá en el período seleccionado.
          </p>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Período destino (YYYYMM)
            </Label>
            <Input
              value={targetPeriod}
              onChange={(e) => setTargetPeriod(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              className="h-8 text-xs font-mono"
              placeholder="202603"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleDefer} disabled={saving}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Clock className="size-3" />}
            {saving ? "Difiendo..." : "Diferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Exclude Modal ──────────────────────────────────────────────────────

function ExcludeModal({
  invoice,
  open,
  onClose,
  onExcluded,
}: {
  invoice: DgiiConciliateInvoice;
  open: boolean;
  onClose: () => void;
  onExcluded: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleExclude = async () => {
    if (!reason.trim()) {
      toast.error("Indica el motivo de exclusión");
      return;
    }
    setSaving(true);
    try {
      await dgiiConciliateExclude(invoice.id, { reason: reason.trim() });
      toast.success("Factura excluida como no deducible");
      onExcluded();
      onClose();
    } catch (e: any) {
      toast.error("Error al excluir", { description: e.message || "Error del servidor" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-primary" />
            Excluir factura (no deducible)
          </DialogTitle>
          <DialogDescription className="text-xs">
            {invoice.vendor_name} — {invoice.invoice_number} ({fmt(invoice.total_amount)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Esta factura se marcará como no deducible fiscalmente y no aparecerá en el 606.
          </p>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Motivo de exclusión
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-xs"
              placeholder="Ej: Gasto no deducible, sin sustento fiscal"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExclude} disabled={saving}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
            {saving ? "Excluyendo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Conflict Card ──────────────────────────────────────────────────────

function ConflictCard({
  invoice,
  onFix,
  onDefer,
  onExclude,
  onVerify,
}: {
  invoice: DgiiConciliateInvoice;
  onFix: () => void;
  onDefer: () => void;
  onExclude: () => void;
  onVerify?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = FISCAL_STATUS_LABELS[invoice.fiscal_status] || FISCAL_STATUS_LABELS.pending_review;
  const StatusIcon = statusConfig.icon;

  const hasActions = invoice.suggested_actions.length > 0;

  return (
    <div className="rounded-lg border border-border/80 bg-card shadow-xs transition-colors hover:border-border">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={cn("flex items-center justify-center rounded-full size-7 shrink-0 mt-0.5", statusConfig.class)}>
          <StatusIcon className="size-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{invoice.vendor_name || "Proveedor desconocido"}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">{invoice.invoice_number || "—"}</span>
                {invoice.invoice_date && (
                  <span className="text-[10px] text-muted-foreground">{invoice.invoice_date.slice(0, 10)}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold tabular-nums">{fmt(invoice.total_amount)}</p>
              {invoice.tax_amount != null && (
                <p className="text-[10px] text-muted-foreground tabular-nums">ITBIS: {fmt(invoice.tax_amount)}</p>
              )}
            </div>
          </div>

          {/* Problems */}
          {invoice.problems.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {invoice.problems.slice(0, expanded ? undefined : 2).map((p, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={cn(
                    "text-[10px] font-normal px-1.5 py-0",
                    p.severity === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {p.severity === "error" ? <XCircle className="size-2.5 mr-1 shrink-0" /> : <AlertTriangle className="size-2.5 mr-1 shrink-0" />}
                  {p.message}
                </Badge>
              ))}
              {invoice.problems.length > 2 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                >
                  {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {expanded ? "Menos" : `${invoice.problems.length - 2} más`}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          {hasActions && (
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {invoice.suggested_actions.includes("edit") && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={onFix}>
                  <Save className="size-2.5" />
                  Corregir
                </Button>
              )}
              {invoice.suggested_actions.includes("defer") && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={onDefer}>
                  <Clock className="size-2.5" />
                  Diferir
                </Button>
              )}
              {invoice.suggested_actions.includes("mark_non_deductible") && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onExclude}>
                  <ShieldCheck className="size-2.5" />
                  No deducible
                </Button>
              )}
              {onVerify && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={onVerify}>
                  <Search className="size-2.5" />
                  Verificar NCF
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────

interface DgiiConciliationPanelProps {
  onExportReady?: (result: DgiiConciliateResult) => void;
}

export function DgiiConciliationPanel({ onExportReady }: DgiiConciliationPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState("dgii_606");
  const [period, setPeriod] = useState(currentPeriod());
  const [result, setResult] = useState<DgiiConciliateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Action modals
  const [fixInvoice, setFixInvoice] = useState<DgiiConciliateInvoice | null>(null);
  const [deferInvoice, setDeferInvoice] = useState<DgiiConciliateInvoice | null>(null);
  const [excludeInvoice, setExcludeInvoice] = useState<DgiiConciliateInvoice | null>(null);

  const handleConciliate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dgiiConciliate({ format: selectedFormat, period });
      setResult(res);
      if (res.can_export && onExportReady) {
        onExportReady(res);
      }
    } catch (e: any) {
      toast.error("Error al conciliar", { description: e.message || "Error del servidor" });
    } finally {
      setLoading(false);
    }
  }, [selectedFormat, period, onExportReady]);

  const handleVerifyNcf = async () => {
    if (!result || result.conflicts.length === 0) return;
    const ids = result.conflicts.map((c) => c.id);
    setVerifying(true);
    try {
      const res = await dgiiVerifyNcf({ invoice_ids: ids });
      toast.success(`Verificación completada: ${res.found} encontrados, ${res.not_found} no encontrados`);
      // Refresh conciliation after verification
      await handleConciliate();
    } catch (e: any) {
      toast.error("Error al verificar NCF", { description: e.message || "Error del servidor" });
    } finally {
      setVerifying(false);
    }
  };

  const handleRefresh = () => {
    handleConciliate();
  };

  const formatLabel = REPORTS.find((r) => r.id === selectedFormat)?.label || selectedFormat;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 size-7">
              <ShieldCheck className="size-3.5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Conciliación Fiscal</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Revisa y resuelve conflictos antes de exportar al {formatLabel}
          </p>
        </div>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-3 gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { setSelectedFormat(r.id); setResult(null); }}
            className={cn(
              "flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all",
              selectedFormat === r.id
                ? "border-primary ring-1 ring-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
            )}
          >
            <span className="text-xs font-medium leading-tight">{r.label}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{r.desc}</span>
          </button>
        ))}
      </div>

      {/* Period + actions */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium text-muted-foreground">Período</Label>
          <div className="flex items-center gap-1">
            <Calendar className="size-3 text-muted-foreground" />
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              className="h-7 text-xs font-mono w-24"
              placeholder="202603"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleConciliate}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
          {loading ? "Conciliando..." : "Iniciar conciliación"}
        </Button>
        {result && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            Refrescar
          </Button>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Listas</p>
              <p className="text-lg font-semibold text-emerald-800 tabular-nums">{result.summary.total_ready}</p>
              <p className="text-[10px] text-emerald-600 tabular-nums">{fmt(result.summary.total_amount_ready)}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-[10px] font-medium text-red-700 uppercase tracking-wide">Conflictos</p>
              <p className="text-lg font-semibold text-red-800 tabular-nums">{result.summary.total_conflicts}</p>
              <p className="text-[10px] text-red-600">{result.conflicts.length > 0 ? "Requieren acción" : "—"}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="text-[10px] font-medium text-blue-700 uppercase tracking-wide">Diferidas (entrantes)</p>
              <p className="text-lg font-semibold text-blue-800 tabular-nums">{result.summary.total_deferred_in}</p>
              <p className="text-[10px] text-blue-600">De períodos anteriores</p>
            </div>
            <div className={cn(
              "rounded-lg border p-3",
              result.summary.days_remaining <= 3
                ? "border-red-200 bg-red-50/50"
                : result.summary.days_remaining <= 10
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-border bg-card",
            )}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Vence</p>
              <p className="text-lg font-semibold tabular-nums">{result.summary.deadline}</p>
              <p className={cn(
                "text-[10px] tabular-nums",
                result.summary.days_remaining <= 3 ? "text-red-600 font-medium" : "text-muted-foreground",
              )}>
                {result.summary.days_remaining} días restantes
              </p>
            </div>
          </div>

          {/* Can export notice */}
          {result.can_export && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800">
                Todas las facturas están conciliadas. Puedes exportar al {formatLabel} sin conflictos.
              </p>
            </div>
          )}

          {/* Conflicts list */}
          {result.conflicts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-amber-500" />
                  Conflictos ({result.conflicts.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={handleVerifyNcf}
                  disabled={verifying}
                >
                  {verifying ? <Loader2 className="size-2.5 animate-spin" /> : <ExternalLink className="size-2.5" />}
                  {verifying ? "Verificando..." : "Verificar NCF contra DGII"}
                </Button>
              </div>
              <div className="space-y-1.5">
                {result.conflicts.map((inv) => (
                  <ConflictCard
                    key={inv.id}
                    invoice={inv}
                    onFix={() => setFixInvoice(inv)}
                    onDefer={() => setDeferInvoice(inv)}
                    onExclude={() => setExcludeInvoice(inv)}
                    onVerify={handleVerifyNcf}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ready list (collapsible) */}
          {result.ready.length > 0 && (
            <div>
              <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Listas para exportar ({result.ready.length})
              </h3>
              <div className="space-y-1">
                {result.ready.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{inv.vendor_name || "—"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{inv.invoice_number || "—"}</p>
                    </div>
                    <p className="text-xs font-semibold tabular-nums shrink-0">{fmt(inv.total_amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deferred in (collapsible) */}
          {result.deferred_in.length > 0 && (
            <div>
              <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <Clock className="size-3.5 text-blue-500" />
                Diferidas de períodos anteriores ({result.deferred_in.length})
              </h3>
              <div className="space-y-1">
                {result.deferred_in.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <Clock className="size-3.5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{inv.vendor_name || "—"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{inv.invoice_number || "—"}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                      Período original: {inv.fiscal_period_override}
                    </Badge>
                    <p className="text-xs font-semibold tabular-nums shrink-0">{fmt(inv.total_amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">Selecciona un reporte y período</p>
          <p className="mt-1.5 max-w-[280px] text-xs text-muted-foreground leading-relaxed">
            La conciliación revisa cada factura contra las reglas fiscales de la DGII y te muestra qué necesita atención antes de exportar.
          </p>
          <Button size="sm" className="mt-4 gap-1.5 h-7 text-xs" onClick={handleConciliate}>
            <Search className="size-3" />
            Iniciar conciliación
          </Button>
        </div>
      )}

      {/* Modals */}
      {fixInvoice && (
        <FixModal
          invoice={fixInvoice}
          open={!!fixInvoice}
          onClose={() => setFixInvoice(null)}
          onFixed={handleRefresh}
        />
      )}
      {deferInvoice && (
        <DeferModal
          invoice={deferInvoice}
          open={!!deferInvoice}
          onClose={() => setDeferInvoice(null)}
          onDeferred={handleRefresh}
        />
      )}
      {excludeInvoice && (
        <ExcludeModal
          invoice={excludeInvoice}
          open={!!excludeInvoice}
          onClose={() => setExcludeInvoice(null)}
          onExcluded={handleRefresh}
        />
      )}
    </div>
  );
}
