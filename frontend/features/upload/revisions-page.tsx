"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { listInvoices, bulkHardDelete } from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import {
  FileCheck,
  Loader2,
  AlertTriangle,
  ChevronRight,
  FileText,
  Clock,
  ShieldAlert,
  Banknote,
  ScanSearch,
  ArrowUpDown,
  Trash2,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadNav } from "./upload-nav";

type SortKey = "priority" | "date" | "amount" | "vendor";

function getPriority(inv: Invoice): { label: string; class: string; score: number } {
  const conf = inv.confidence_score ?? 1.0;
  if (conf < 0.7) return { label: "Alta", class: "bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-950/30 dark:text-red-400", score: 0 };
  if (conf <= 0.85) return { label: "Media", class: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-900/30 dark:text-amber-400", score: 1 };
  return { label: "Baja", class: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400", score: 2 };
}

function hasWarnings(inv: Invoice) {
  return inv.audit_flags && inv.audit_flags !== "[]" && inv.audit_flags !== "null";
}

function parseAuditFlags(inv: Invoice): string[] {
  if (!inv.audit_flags || inv.audit_flags === "[]" || inv.audit_flags === "null") return [];
  try {
    const parsed = JSON.parse(inv.audit_flags);
    if (Array.isArray(parsed)) return parsed.map((f: unknown) => typeof f === "string" ? f : JSON.stringify(f));
    if (typeof parsed === "object" && parsed !== null) {
      const arr = Array.isArray(parsed.warnings) ? parsed.warnings : Array.isArray(parsed.flags) ? parsed.flags : [];
      return arr.map((f: unknown) => typeof f === "string" ? f : JSON.stringify(f));
    }
    return [String(parsed)];
  } catch {
    return [inv.audit_flags];
  }
}

export function RevisionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discarding, setDiscarding] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {data: draftsQuery_data, isLoading: draftsQuery_isLoading} = useQuery({
    queryKey: ["invoices", "drafts", "revisions"],
    queryFn: () => listInvoices({ status: "draft", exclude_source_type: "billing" }),
    refetchInterval: 15_000,
  });

  const draftInvoices = (draftsQuery_data?.invoices ?? [])
    .filter((inv) => inv.status === "draft")
    .sort((a, b) => (a.confidence_score ?? 1.0) - (b.confidence_score ?? 1.0));

  const filtered = draftInvoices.filter((inv) => {
    if (filterPriority === "high") return (inv.confidence_score ?? 1.0) < 0.7;
    if (filterPriority === "medium") {
      const c = inv.confidence_score ?? 1.0;
      return c >= 0.7 && c <= 0.85;
    }
    if (filterPriority === "low") return (inv.confidence_score ?? 1.0) > 0.85;
    if (filterPriority === "warnings") return hasWarnings(inv);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "priority") return getPriority(a).score - getPriority(b).score;
    if (sortBy === "date") return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime();
    if (sortBy === "amount") return (b.total_amount || 0) - (a.total_amount || 0);
    if (sortBy === "vendor") return (a.vendor_name || "").localeCompare(b.vendor_name || "");
    return 0;
  });

  const highCount = draftInvoices.filter((i) => getPriority(i).score === 0).length;
  const warningCount = draftInvoices.filter(hasWarnings).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((i) => i.id)));
    }
  }

  async function handleDiscardSelected() {
    if (selected.size === 0) return;
    setDiscarding(true);
    try {
      await bulkHardDelete(Array.from(selected));
      toast.success(`${selected.size} factura(s) descartada(s) definitivamente`);
      setSelected(new Set());
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      toast.error(`Error al descartar: ${err instanceof Error ? err.message : "Error del servidor"}`);
    } finally {
      setDiscarding(false);
    }
  }

  if (draftsQuery_isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
      <UploadNav active="revisions" draftsCount={draftInvoices.length} />

      {/* Header */}
      <div className="flex items-start gap-4 sm:items-center sm:justify-between flex-col sm:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <ScanSearch className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-medium text-foreground">Revisiones de IA</h1>
            <p className="text-xs text-muted-foreground">
              {draftInvoices.length > 0
                ? `${draftInvoices.length} factura${draftInvoices.length !== 1 ? "s" : ""} pendiente${draftInvoices.length !== 1 ? "s" : ""} de revisión humana`
                : "Todas las facturas han sido revisadas"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={() => setShowConfirm(true)}
            >
              <Trash2 className="size-3.5" />
              Descartar {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
            </Button>
          )}
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Volver a carga
            <ChevronRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pendientes</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">{draftInvoices.length}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">Alta prioridad</p>
          <p className={cn("text-xl font-semibold tabular-nums", highCount > 0 ? "text-red-600" : "text-foreground")}>
            {highCount}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Alertas fiscales</p>
          <p className={cn("text-xl font-semibold tabular-nums", warningCount > 0 ? "text-amber-600" : "text-foreground")}>
            {warningCount}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confianza media</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {draftInvoices.length > 0
              ? `${Math.round(draftInvoices.reduce((a, i) => a + (i.confidence_score ?? 1.0), 0) / draftInvoices.length * 100)}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/20">
          {[
            { value: "all", label: "Todas" },
            { value: "high", label: "Alta" },
            { value: "medium", label: "Media" },
            { value: "low", label: "Baja" },
            { value: "warnings", label: "Alertas" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilterPriority(f.value)}
              className={cn(
                "h-7 text-xs px-2.5 rounded-md font-medium transition-all",
                filterPriority === f.value
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-border p-0.5 bg-muted/20">
          {[
            { value: "priority", label: "Prioridad" },
            { value: "date", label: "Fecha" },
            { value: "amount", label: "Monto" },
          ].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSortBy(s.value as SortKey)}
              className={cn(
                "h-7 text-xs px-2.5 rounded-md font-medium transition-all inline-flex items-center gap-1",
                sortBy === s.value
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowUpDown className="size-3" />
              {s.label}
            </button>
          ))}
        </div>

        {sorted.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="h-7 text-xs px-2.5 rounded-md border border-border font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <CheckSquare className="size-3" />
            {selected.size === sorted.length ? "Deseleccionar todo" : "Seleccionar todo"}
          </button>
        )}
      </div>

      {/* Invoice cards */}
      {sorted.length > 0 ? (
        <div className="space-y-2">
          {sorted.map((inv) => {
            const priority = getPriority(inv);
            const warnings = parseAuditFlags(inv);
            const conf = inv.confidence_score ?? 1.0;
            const isSelected = selected.has(inv.id);

            return (
              <div key={inv.id} className="relative flex items-start gap-2 group">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSelect(inv.id)}
                  className={cn(
                    "shrink-0 mt-4 size-5 rounded border-2 flex items-center justify-center transition-all",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30 hover:border-foreground/50"
                  )}
                  aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
                >
                  {isSelected && (
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

              <button
                type="button"
                onClick={() => router.push(`/dashboard/upload/revisions/${inv.id}`)}
                className="w-full text-left group"
                >
                  <div className={cn(
                    "rounded-xl border bg-card hover:bg-card/80 transition-all p-4 flex items-start gap-4 relative",
                    isSelected ? "border-primary/40" : "border-border/60 hover:border-primary/30"
                  )}>
                    {/* Priority indicator line */}
                    <div
                      className={cn(
                        "absolute left-0 top-2 bottom-2 w-1 rounded-full",
                        priority.score === 0 ? "bg-red-500" : priority.score === 1 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0 pl-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {inv.vendor_name || (
                              <span className="text-muted-foreground italic">Proveedor no detectado</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {inv.filename}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-0.5" />
                      </div>

                      {/* Details row */}
                      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 font-semibold border", priority.class)}>
                          Prioridad {priority.label}
                        </Badge>

                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {conf < 0.7 ? (
                            <span className="text-red-500 font-medium">{Math.round(conf * 100)}% confianza</span>
                          ) : conf <= 0.85 ? (
                            <span className="text-amber-600">{Math.round(conf * 100)}% confianza</span>
                          ) : (
                            <span className="text-emerald-600">{Math.round(conf * 100)}% confianza</span>
                          )}
                        </span>

                        {inv.invoice_number && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            NCF: {inv.invoice_number}
                          </span>
                        )}

                        <span className="text-[11px] font-mono font-medium text-foreground">
                          {new Intl.NumberFormat("es-DO", {
                            style: "currency",
                            currency: inv.currency || "DOP",
                          }).format(inv.total_amount || 0)}
                        </span>

                        {inv.invoice_date && (
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {new Date(inv.invoice_date).toLocaleDateString("es-DO", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>

                      {/* Audit warnings */}
                      {warnings.length > 0 && (
                        <div className="flex items-start gap-1.5 mt-2.5 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                          <ShieldAlert className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            {warnings.slice(0, 2).map((w, i) => (
                              <p key={i} className="text-[10px] text-red-600 leading-relaxed">
                                {w}
                              </p>
                            ))}
                            {warnings.length > 2 && (
                              <p className="text-[10px] text-red-500/70">
                                +{warnings.length - 2} alerta{warnings.length - 2 !== 1 ? "s" : ""} adicional{warnings.length - 2 !== 1 ? "es" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick status badge */}
                    {inv.original_xml_data && (
                      <div className="hidden sm:flex shrink-0 items-center gap-1 rounded-md bg-primary/5 border border-primary/10 px-2 py-1">
                        <FileText className="size-3 text-primary" />
                        <span className="text-[9px] font-medium text-primary">XML</span>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <FileCheck className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Todo revisado</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                No hay facturas pendientes de revisión humana. Los documentos procesados estan aprobados en tu contabilidad.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm discard dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Descartar facturas</DialogTitle>
            <DialogDescription className="text-xs">
              Se eliminaran definitivamente {selected.size} factura{selected.size !== 1 ? "s" : ""} del sistema.
              Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowConfirm(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={handleDiscardSelected}
              disabled={discarding}
            >
              {discarding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {discarding ? "Descartando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
