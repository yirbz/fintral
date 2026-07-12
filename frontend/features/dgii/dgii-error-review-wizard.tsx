"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceImageViewer } from "@/features/upload/invoice-image-viewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  dgiiConciliate,
  dgiiConciliateFix,
  dgiiConciliateDefer,
  dgiiConciliateExclude,
  type DgiiConciliateInvoice,
  type DgiiFormat,
} from "@/lib/api/dgii";
import { cn } from "@/lib/utils";

interface DgiiErrorReviewWizardProps {
  open: boolean;
  onClose: (resolvedAny: boolean) => void;
  format: DgiiFormat;
  period: string;
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(n);
}

function nextPeriod(p: string) {
  let y = parseInt(p.slice(0, 4), 10);
  let m = parseInt(p.slice(4, 6), 10);
  m++;
  if (m > 12) {
    m = 1;
    y++;
  }
  return `${y}${String(m).padStart(2, "0")}`;
}

export function DgiiErrorReviewWizard({
  open,
  onClose,
  format,
  period,
}: DgiiErrorReviewWizardProps) {
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<DgiiConciliateInvoice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [resolvedAny, setResolvedAny] = useState(false);

  // Form edit fields
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [excludeReason, setExcludeReason] = useState("");
  const [actionTab, setActionTab] = useState<"fix" | "defer" | "exclude">("fix");
  const [leftTab, setLeftTab] = useState<"details" | "file">("details");
  const [submitting, setSubmitting] = useState(false);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const cleanFormat = format.replace("dgii_", "");
      const res = await dgiiConciliate({ format: cleanFormat, period });
      setConflicts(res.conflicts || []);
      setCurrentIndex(0);
    } catch (e: any) {
      toast.error("Error al cargar facturas con problemas", {
        description: e.message || "Error del servidor",
      });
    } finally {
      setLoading(false);
    }
  }, [format, period]);

  // Load conflicts when wizard opens
  useEffect(() => {
    if (open) {
      void fetchConflicts();
      setResolvedCount(0);
      setResolvedAny(false);
    }
  }, [open, fetchConflicts]);

  const activeInvoice = conflicts[currentIndex];

  // Sync edit form fields when active invoice changes
  useEffect(() => {
    if (activeInvoice) {
      const initialFields: Record<string, string> = {};
      if (activeInvoice.editable_fields) {
        for (const [k, v] of Object.entries(activeInvoice.editable_fields)) {
          initialFields[k] = String(v.current ?? "");
        }
      }
      setEditFields(initialFields);
      setExcludeReason("");
      setLeftTab("details");
      // Choose best tab based on suggested actions
      if (activeInvoice.suggested_actions.includes("edit")) {
        setActionTab("fix");
      } else if (activeInvoice.suggested_actions.includes("defer")) {
        setActionTab("defer");
      } else {
        setActionTab("exclude");
      }
    }
  }, [activeInvoice]);

  const handleNext = () => {
    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const advanceOrComplete = (successMsg: string) => {
    toast.success(successMsg);
    setResolvedCount((prev) => prev + 1);
    setResolvedAny(true);

    // Remove solved conflict from the list locally
    const updatedConflicts = conflicts.filter((_, idx) => idx !== currentIndex);
    setConflicts(updatedConflicts);

    // Stay at same index unless it's out of bounds
    if (currentIndex >= updatedConflicts.length && currentIndex > 0) {
      setCurrentIndex(updatedConflicts.length - 1);
    }
  };

  const handleSaveFix = async () => {
    if (!activeInvoice) return;
    setSubmitting(true);
    try {
      await dgiiConciliateFix(activeInvoice.id, { fields: editFields });
      advanceOrComplete("Factura corregida y reclasificada correctamente.");
    } catch (e: any) {
      toast.error("Error al guardar corrección", {
        description: e.message || "Verifica los datos",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDefer = async () => {
    if (!activeInvoice) return;
    setSubmitting(true);
    const target = nextPeriod(period);
    try {
      await dgiiConciliateDefer(activeInvoice.id, { target_period: target });
      advanceOrComplete(`Factura diferida con éxito al período ${target}.`);
    } catch (e: any) {
      toast.error("Error al diferir la factura", {
        description: e.message || "Inténtalo de nuevo",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExclude = async () => {
    if (!activeInvoice) return;
    const reason = excludeReason.trim() || "Descartada por el usuario";
    setSubmitting(true);
    try {
      await dgiiConciliateExclude(activeInvoice.id, { reason });
      advanceOrComplete("Factura excluida permanentemente como no deducible.");
    } catch (e: any) {
      toast.error("Error al excluir la factura", {
        description: e.message || "Inténtalo de nuevo",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose(resolvedAny);
      }}
    >
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-md border-border/80 shadow-2xl p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                <Sparkles className="size-4.5 text-primary animate-pulse" />
                Asistente de Corrección y Descarte Fiscal
              </DialogTitle>
              <DialogDescription className="text-xs">
                Resuelve los problemas fiscales detectados en las facturas de este período.
              </DialogDescription>
            </div>
            {!loading && conflicts.length > 0 && (
              <Badge variant="outline" className="text-xs px-2 py-0.5 border-primary/30 text-primary bg-primary/5">
                {currentIndex + 1} de {conflicts.length} pendientes
              </Badge>
            )}
          </div>

          {/* Progress bar */}
          {!loading && conflicts.length > 0 && (
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-4">
              <div
                className="h-full bg-gradient-to-r from-primary to-sky-400 transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / conflicts.length) * 100}%`,
                }}
              />
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Buscando facturas con conflictos...</p>
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500">
              <CheckCircle2 className="size-10" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-semibold">¡Todo despejado!</h3>
              <p className="text-xs text-muted-foreground">
                No quedan facturas con errores críticos en este período. {resolvedCount > 0 && `Has resuelto ${resolvedCount} facturas en esta sesión.`}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => onClose(resolvedAny)}
              className="mt-2 h-8 text-xs px-4"
            >
              Cerrar Asistente
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left side: Invoice details & errors */}
            <div className="p-6 border-r border-border/40 bg-muted/10 flex flex-col gap-4">
              {/* Left tabs switcher */}
              <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-md text-xs">
                <button
                  onClick={() => setLeftTab("details")}
                  className={cn(
                    "py-1 px-2 rounded-sm font-medium transition-all text-center flex items-center justify-center gap-1",
                    leftTab === "details"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="size-3.5" />
                  Detalles y Errores
                </button>
                <button
                  onClick={() => setLeftTab("file")}
                  className={cn(
                    "py-1 px-2 rounded-sm font-medium transition-all text-center flex items-center justify-center gap-1",
                    leftTab === "file"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Eye className="size-3.5" />
                  Ver Factura
                </button>
              </div>

              {leftTab === "details" ? (
                <div className="space-y-4 flex-1">
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Detalles de la factura
                    </span>
                    <Card className="border-border/50 bg-background/50 backdrop-blur-xs">
                      <CardContent className="p-4 space-y-3">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-semibold text-muted-foreground">Proveedor</h4>
                          <p className="text-sm font-bold truncate">
                            {activeInvoice.vendor_name || "Sin nombre"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-[10px] font-semibold text-muted-foreground">RNC / Cédula</h4>
                            <p className="text-xs font-mono font-medium">
                              {activeInvoice.vendor_tax_id || "—"}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-[10px] font-semibold text-muted-foreground">NCF</h4>
                            <p className="text-xs font-mono font-medium">
                              {activeInvoice.invoice_number || "—"}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-[10px] font-semibold text-muted-foreground">Fecha</h4>
                            <p className="text-xs font-medium">
                              {activeInvoice.invoice_date?.slice(0, 10) || "—"}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-[10px] font-semibold text-muted-foreground">Monto Total</h4>
                            <p className="text-xs font-bold text-foreground">
                              {fmtCurrency(activeInvoice.total_amount)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Validation errors */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">
                      Errores detectados ({activeInvoice.problems.length})
                    </span>
                    <div className="space-y-2">
                      {activeInvoice.problems.map((prob, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start gap-2.5 p-3 rounded-lg border text-xs",
                            prob.severity === "error"
                              ? "bg-red-500/[0.04] border-red-500/20 text-red-700 dark:text-red-400"
                              : "bg-amber-500/[0.04] border-amber-500/20 text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {prob.severity === "error" ? (
                            <XCircle className="size-4 shrink-0 mt-0.5 text-red-500" />
                          ) : (
                            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                          )}
                          <div>
                            <p className="font-semibold leading-tight">{prob.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-[350px] relative flex flex-col">
                  {activeInvoice.file_path ? (
                    <InvoiceImageViewer
                      invoiceId={activeInvoice.id}
                      filename={activeInvoice.filename || activeInvoice.file_path.split("/").pop()}
                      className="flex-1 w-full min-h-[320px]"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-xl flex-1 bg-background/30">
                      <p className="text-xs font-medium text-muted-foreground">
                        No hay archivo adjunto para esta factura
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right side: Actions */}
            <div className="p-6 flex flex-col justify-between min-h-[400px]">
              <div className="space-y-4">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Resolver conflicto
                </span>

                {/* Tabs selection */}
                <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-md text-xs">
                  <button
                    onClick={() => setActionTab("fix")}
                    className={cn(
                      "py-1.5 px-2 rounded-sm font-medium transition-all text-center",
                      actionTab === "fix"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Corregir
                  </button>
                  <button
                    onClick={() => setActionTab("defer")}
                    className={cn(
                      "py-1.5 px-2 rounded-sm font-medium transition-all text-center",
                      actionTab === "defer"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Diferir
                  </button>
                  <button
                    onClick={() => setActionTab("exclude")}
                    className={cn(
                      "py-1.5 px-2 rounded-sm font-medium transition-all text-center",
                      actionTab === "exclude"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Excluir
                  </button>
                </div>

                {/* Tab content */}
                <div className="space-y-3 pt-2">
                  {actionTab === "fix" && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Modifica los valores directamente para corregir los problemas de formato y recalculación fiscal.
                      </p>
                      {Object.keys(editFields).map((key) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            {key.replace(/_/g, " ")}
                          </Label>
                          <Input
                            value={editFields[key] ?? ""}
                            onChange={(e) =>
                              setEditFields((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      ))}
                      <Button
                        size="sm"
                        onClick={handleSaveFix}
                        disabled={submitting}
                        className="w-full text-xs h-8 gap-1.5 mt-2"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        {submitting ? "Guardando..." : "Guardar y Re-clasificar"}
                      </Button>
                    </div>
                  )}

                  {actionTab === "defer" && (
                    <div className="space-y-3">
                      <div className="flex gap-2.5 p-3 rounded-lg border border-blue-500/20 bg-blue-500/[0.03] text-blue-700 dark:text-blue-400 text-xs">
                        <Clock className="size-4 shrink-0 mt-0.5 text-blue-500" />
                        <div>
                          <h4 className="font-semibold mb-0.5">Diferir período fiscal</h4>
                          <p className="text-[11px] leading-normal text-blue-700/80 dark:text-blue-400/80">
                            La factura se pospondrá para el mes siguiente (<strong>{nextPeriod(period)}</strong>). Se excluirá del reporte actual y reaparecerá automáticamente en el próximo.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleDefer}
                        disabled={submitting}
                        className="w-full text-xs h-8 gap-1.5 mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Clock className="size-3.5" />
                        )}
                        {submitting ? "Diriendo..." : `Diferir al período ${nextPeriod(period)}`}
                      </Button>
                    </div>
                  )}

                  {actionTab === "exclude" && (
                    <div className="space-y-3">
                      <div className="flex gap-2.5 p-3 rounded-lg border border-red-500/20 bg-red-500/[0.03] text-red-700 dark:text-red-400 text-xs">
                        <ShieldAlert className="size-4 shrink-0 mt-0.5 text-red-500" />
                        <div>
                          <h4 className="font-semibold mb-0.5">Marcar como no deducible</h4>
                          <p className="text-[11px] leading-normal text-red-700/80 dark:text-red-400/80">
                            Excluye permanentemente la factura del reporte de compras/ventas. Útil para gastos personales o comprobantes inválidos.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Motivo de exclusión
                        </Label>
                        <Input
                          value={excludeReason}
                          onChange={(e) => setExcludeReason(e.target.value)}
                          placeholder="Ej: Gasto personal, comprobante dañado, no deducible"
                          className="h-8 text-xs"
                        />
                      </div>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleExclude}
                        disabled={submitting}
                        className="w-full text-xs h-8 gap-1.5 mt-2"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <XCircle className="size-3.5" />
                        )}
                        {submitting ? "Excluyendo..." : "Excluir Definitivamente"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation controls */}
              <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentIndex === 0 || submitting}
                  className="h-7 text-xs gap-1"
                >
                  <ChevronLeft className="size-3.5" />
                  Anterior
                </Button>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {currentIndex + 1} / {conflicts.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentIndex === conflicts.length - 1 || submitting}
                  className="h-7 text-xs gap-1"
                >
                  Siguiente
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
