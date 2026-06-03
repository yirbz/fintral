"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi, EcfSequence, EcfSequenceCreate, SequenceAlert, type InvoiceTypeInfo } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Calendar, Hash, ToggleLeft, ToggleRight, Loader2, ArrowRight, AlertTriangle, Flame, FileText, Info } from "lucide-react";
import { toast } from "sonner";

function TypeSelector({
  value,
  isEcfAuthorized,
  onChange,
}: {
  value: number;
  isEcfAuthorized: boolean;
  onChange: (ecfType: number, prefix: string) => void;
}) {
  const { data: types, isLoading } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: billingApi.getInvoiceTypes,
  });

  const filtered = (types ?? []).filter((t) => {
    if (t.ecf_type >= 31) return isEcfAuthorized;
    return [1, 2, 4, 15].includes(t.ecf_type);
  });

  const selected = (types ?? []).find((t) => t.ecf_type === value);

  return (
    <Select
      value={value?.toString() ?? ""}
      onValueChange={(v) => {
        const ecfType = parseInt(v);
        const prefix = ecfType >= 31 ? "E" : "B";
        onChange(ecfType, prefix);
      }}
      disabled={isLoading}
    >
      <SelectTrigger className="h-9 text-xs">
        {isLoading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Cargando...
          </span>
        ) : (
          <SelectValue placeholder="Seleccionar tipo">
            {selected && (
              <span className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <span>{selected.label}</span>
                <span className="text-muted-foreground/60">({selected.code})</span>
              </span>
            )}
          </SelectValue>
        )}
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <div className="px-3 py-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            <p>No hay tipos disponibles</p>
            {!isEcfAuthorized && (
              <p className="text-xs mt-1">Certificación DGII requerida para e-CF</p>
            )}
          </div>
        ) : (
          filtered.map((t) => (
            <SelectItem key={t.ecf_type} value={t.ecf_type.toString()}>
              <div className="flex flex-col">
                <span className="text-sm">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.code}</span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<EcfSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<SequenceAlert[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEcfAuthorized, setIsEcfAuthorized] = useState<boolean>(true);

  // Form State
  const [form, setForm] = useState<EcfSequenceCreate>({
    ecf_type: 31,
    prefix: "E",
    start_number: 1,
    end_number: 1000,
    current_number: 0,
    expiry_date: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSequences = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getSequences();
      setSequences(data);
    } catch (err: any) {
      toast.error("Error al cargar rangos NCF: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const data = await billingApi.getSequenceAlerts();
      setAlerts(data);
    } catch {
      // non-critical
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const status = await billingApi.getVerificationStatus();
      setIsEcfAuthorized(status.is_ecf_authorized);
    } catch (err) {
      console.error("Error checking verification status:", err);
      setIsEcfAuthorized(false);
    }
  };

  useEffect(() => {
    fetchSequences();
    fetchAlerts();
    fetchVerificationStatus();
  }, []);

  const openCreateDialog = () => {
    setForm({
      ecf_type: isEcfAuthorized ? 31 : 1,
      prefix: isEcfAuthorized ? "E" : "B",
      start_number: 1,
      end_number: 1000,
      current_number: 0,
      expiry_date: new Date(new Date().getFullYear() + 2, 11, 31).toISOString().split("T")[0], // 2 years out
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    // 0. ECF Authorization Validation
    const isEcfType = [31, 32, 34, 43].includes(form.ecf_type);
    if (isEcfType && !isEcfAuthorized) {
      toast.error("Tu organización debe estar certificada ante la DGII para cargar rangos electrónicos.");
      return;
    }

    // 1. Prefix Validation
    if (!form.prefix || !["E", "B"].includes(form.prefix.toUpperCase())) {
      toast.error("El prefijo debe ser 'E' (Electrónico) o 'B' (Físico/Tradicional).");
      return;
    }

    // 2. Number range and positivity validations
    if (form.start_number <= 0) {
      toast.error("El número inicial debe ser un entero positivo mayor a cero.");
      return;
    }
    if (form.end_number <= 0) {
      toast.error("El número final debe ser un entero positivo mayor a cero.");
      return;
    }
    if (form.start_number > form.end_number) {
      toast.error("El número inicial no puede ser mayor que el número final.");
      return;
    }
    if (form.current_number < 0) {
      toast.error("El número actual no puede ser negativo.");
      return;
    }
    if (form.current_number < form.start_number - 1) {
      toast.error(`El número actual debe ser mayor o igual a ${form.start_number - 1} (número inicial - 1).`);
      return;
    }
    if (form.current_number > form.end_number) {
      toast.error(`El número actual no puede exceder el número final (${form.end_number}).`);
      return;
    }

    // 3. Date Existence and Past Date validations
    if (!form.expiry_date) {
      toast.error("La fecha de vencimiento es requerida.");
      return;
    }
    const dateParts = form.expiry_date.split("-");
    if (dateParts.length !== 3) {
      toast.error("Formato de fecha inválido.");
      return;
    }
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const testDate = new Date(year, month, day);
    if (
      testDate.getFullYear() !== year ||
      testDate.getMonth() !== month ||
      testDate.getDate() !== day
    ) {
      toast.error("La fecha de vencimiento ingresada no existe en el calendario.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (testDate < today) {
      toast.error("La fecha de vencimiento no puede estar en el pasado.");
      return;
    }

    // 4. Prefix type alignment check
    if (isEcfType && form.prefix !== "E") {
      toast.error("Para comprobantes electrónicos, el prefijo debe ser 'E'.");
      return;
    }
    if (!isEcfType && form.prefix !== "B") {
      toast.error("Para comprobantes físicos, el prefijo debe ser 'B'.");
      return;
    }

    try {
      setSubmitting(true);
      await billingApi.createSequence(form);
      toast.success("Rango de numeración creado exitosamente");
      setDialogOpen(false);
      fetchSequences();
    } catch (err: any) {
      toast.error("Error al registrar rango: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await billingApi.updateSequence(id, { is_active: !currentStatus });
      toast.success(`Rango ${!currentStatus ? "activado" : "desactivado"} con éxito`);
      fetchSequences();
    } catch (err: any) {
      toast.error("Error al actualizar estado del rango: " + (err.message || "Error desconocido"));
    }
  };

  const getEcfTypeName = (type: number) => {
    switch (type) {
      case 31:
        return "Factura de Crédito Fiscal Electrónica (e-CF 31)";
      case 32:
        return "Factura de Consumo Electrónica (e-CF 32)";
      case 34:
        return "Nota de Crédito Electrónica (e-CF 34)";
      case 43:
        return "Comprobante de Gastos Menores Electrónico (e-CF 43)";
      case 1:
        return "Factura de Crédito Fiscal Física (NCF 01)";
      case 2:
        return "Factura de Consumo Física (NCF 02)";
      case 4:
        return "Nota de Crédito Física (NCF 04)";
      case 15:
        return "Comprobante Gubernamental Físico (NCF 15)";
      default:
        return `Comprobante Tipo ${type}`;
    }
  };

  const getSequenceStatus = (seq: EcfSequence) => {
    const total = seq.end_number - seq.start_number + 1;
    const consumed = Math.max(0, seq.current_number - seq.start_number + 1);
    const percent = Math.min(100, Math.round((consumed / total) * 100));
    const remaining = total - consumed;
    
    const isExpired = seq.expiry_date ? new Date(seq.expiry_date) < new Date() : false;
    const isCloseToExpiration = seq.expiry_date 
      ? (new Date(seq.expiry_date).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000) && !isExpired
      : false;
      
    const isExhausted = seq.current_number >= seq.end_number;
    const isCritical = remaining < (total * 0.1) && !isExhausted; // less than 10% remaining
    
    return {
      total,
      consumed,
      percent,
      remaining,
      isExpired,
      isCloseToExpiration,
      isExhausted,
      isCritical
    };
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Rangos NCF
          </h2>
          <p className="text-sm text-muted-foreground">
            Rangos de numeración autorizados por la DGII para comprobantes fiscales electrónicos (e-CF) y físicos (NCF).
          </p>
        </div>
        <div>
          <Button
            onClick={openCreateDialog}
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3"
          >
            <PlusCircle className="size-3.5" />
            Cargar Rango
          </Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => {
            const label = `Tipo ${a.ecf_type}`;
            let icon = <AlertTriangle className="size-4 shrink-0 text-amber-500" />;
            let border = "border-amber-500/30";
            let bg = "bg-amber-500/8";
            let text = "text-amber-600";
            if (a.alerts.includes("exhausted") || a.alerts.includes("expired")) {
              icon = <Flame className="size-4 shrink-0 text-rose-500" />;
              border = "border-rose-500/30";
              bg = "bg-rose-500/8";
              text = "text-rose-600";
            }
            return (
              <div key={a.sequence_id} className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${border} ${bg}`}>
                {icon}
                <div className="flex-1 space-y-0.5">
                  <p className={`text-xs font-semibold ${text}`}>{label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.alerts.includes("expired") && "Este rango ha expirado. "}
                    {a.alerts.includes("exhausted") && "Todos los folios han sido consumidos. "}
                    {a.alerts.includes("critical") && `Solo quedan ${a.remaining} folios disponibles (${a.consumed_pct}% consumido). `}
                    {a.alerts.includes("expiring") && !a.alerts.includes("expired") && "El rango vence en menos de 30 días. "}
                    Cargá un nuevo rango para seguir emitiendo.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : sequences.length === 0 ? (
          <Card className="border border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Hash className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                No hay rangos NCF autorizados en esta organización.
              </p>
              <Button size="xs" variant="outline" className="h-7 text-[11px] mt-3" onClick={openCreateDialog}>
                Cargar primer rango
              </Button>
            </CardContent>
          </Card>
        ) : (
          sequences.map((seq) => {
            const status = getSequenceStatus(seq);
            
            // Visual Accent Color
            let accentColor = "bg-muted";
            if (seq.is_active) {
              if (status.isExhausted || status.isExpired) accentColor = "bg-rose-500";
              else if (status.isCritical || status.isCloseToExpiration) accentColor = "bg-amber-500";
              else accentColor = "bg-emerald-500";
            }

            // Expiry calendar text color
            let expiryColor = "text-muted-foreground";
            if (seq.is_active) {
              if (status.isExpired) expiryColor = "text-rose-500 font-semibold";
              else if (status.isCloseToExpiration) expiryColor = "text-amber-500 font-semibold";
            }

            return (
              <Card key={seq.id} className="border border-border/50 bg-card/50 overflow-hidden relative">
                {/* Visual Accent */}
                <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />

                <CardHeader className="pb-3 pl-8 flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold flex flex-wrap items-center gap-2">
                      {getEcfTypeName(seq.ecf_type)}
                      {seq.is_active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] h-4">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] h-4">
                          Inactivo
                        </Badge>
                      )}
                      
                      {seq.is_active && status.isExpired && (
                        <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px] h-4">
                          Expirado
                        </Badge>
                      )}
                      {seq.is_active && !status.isExpired && status.isExhausted && (
                        <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px] h-4">
                          Agotado
                        </Badge>
                      )}
                      {seq.is_active && !status.isExpired && status.isCritical && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] h-4">
                          Crítico (Quedan {status.remaining})
                        </Badge>
                      )}
                      {seq.is_active && status.isCloseToExpiration && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] h-4">
                          Por Vencer
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs font-mono">
                      Prefijo: <span className="font-semibold text-foreground">{seq.prefix}</span> | Rango:{" "}
                      <span className="font-semibold text-foreground">
                        {seq.prefix}
                        {String(seq.ecf_type).padStart(2, "0")}
                        {String(seq.start_number).padStart(seq.prefix === "E" ? 10 : 8, "0")}
                      </span>{" "}
                      <ArrowRight className="inline size-3 mx-1" />{" "}
                      <span className="font-semibold text-foreground">
                        {seq.prefix}
                        {String(seq.ecf_type).padStart(2, "0")}
                        {String(seq.end_number).padStart(seq.prefix === "E" ? 10 : 8, "0")}
                      </span>
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleToggleActive(seq.id, seq.is_active)}
                  >
                    {seq.is_active ? (
                      <ToggleRight className="size-6 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="size-6" />
                    )}
                  </Button>
                </CardHeader>
                <CardContent className="pl-8 grid md:grid-cols-3 gap-6 items-center">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Último Emitido</div>
                    <div className="text-sm font-semibold font-mono">
                      {seq.current_number >= seq.start_number ? (
                        `${seq.prefix}${String(seq.ecf_type).padStart(2, "0")}${String(seq.current_number).padStart(seq.prefix === "E" ? 10 : 8, "0")}`
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Ninguno</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Consumido: {status.percent}%</span>
                      <span>
                        {status.consumed} / {status.total}
                      </span>
                    </div>
                    {/* Custom colorful progress bar */}
                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          !seq.is_active
                            ? "bg-muted-foreground/30"
                            : status.isExhausted || status.isExpired
                            ? "bg-rose-500" 
                            : status.isCritical 
                            ? "bg-amber-500" 
                            : "bg-primary"
                        }`}
                        style={{ width: `${status.percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1 flex items-center md:justify-end gap-2">
                    <div className={`flex items-center gap-1.5 text-xs ${expiryColor}`}>
                      <Calendar className="size-3.5" />
                      <span>Vence:</span>
                      <span className="font-semibold">
                        {seq.expiry_date
                          ? new Date(seq.expiry_date).toLocaleDateString("es-DO")
                          : "No expira"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] border-border/60 bg-card shadow-2xl p-0 gap-0 overflow-hidden rounded-xl">
          <form onSubmit={handleSubmit}>
            <div className="relative overflow-hidden border-b border-border/40 bg-gradient-to-br from-primary/[0.04] via-transparent to-primary/[0.02] px-6 pt-5 pb-4">
              <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/[0.08] blur-3xl" />
              <DialogHeader className="p-0">
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Cargar Rango Autorizado
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Registre los rangos de numeración autorizados por la DGII.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ── Tipo de Comprobante ── */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground tracking-tight">
                  Tipo de Comprobante <span className="text-primary">*</span>
                </label>
                <TypeSelector
                  value={form.ecf_type}
                  isEcfAuthorized={isEcfAuthorized}
                  onChange={(ecfType, prefix) => setForm({ ...form, ecf_type: ecfType, prefix })}
                />
              </div>

              {/* ── Rango Numérico ── */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground tracking-tight">
                  Rango Numérico <span className="text-primary">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/60 pointer-events-none select-none">
                      {form.prefix}{String(form.ecf_type).padStart(2, "0")}
                    </span>
                    <Input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="1"
                      className="h-9 pl-[5.5rem] text-xs font-mono tabular-nums"
                      value={form.start_number || ""}
                      onChange={(e) => setForm({ ...form, start_number: Math.max(1, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/60 pointer-events-none select-none">
                      {form.prefix}{String(form.ecf_type).padStart(2, "0")}
                    </span>
                    <Input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="1000"
                      className="h-9 pl-[5.5rem] text-xs font-mono tabular-nums"
                      value={form.end_number || ""}
                      onChange={(e) => setForm({ ...form, end_number: Math.max(1, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Desde — Hasta
                </p>
              </div>

              {/* ── Estado Actual ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="seq-current" className="text-xs font-medium text-muted-foreground tracking-tight">
                    Último Folio Emitido <span className="text-primary">*</span>
                  </label>
                  <Input
                    id="seq-current"
                    type="number"
                    required
                    min="0"
                    step="1"
                    placeholder="0"
                    className="h-9 text-xs font-mono tabular-nums"
                    value={form.current_number}
                      onChange={(e) => setForm({ ...form, current_number: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    0 si es nuevo
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="seq-expiry" className="text-xs font-medium text-muted-foreground tracking-tight">
                    Fecha de Vencimiento
                  </label>
                  <DateInput
                    id="seq-expiry"
                    required
                    value={form.expiry_date}
                    onChange={(v) => setForm({ ...form, expiry_date: v })}
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    La DGII asigna una vigencia
                  </p>
                </div>
              </div>

              {/* ── Vista Previa ── */}
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-muted/50 to-muted/20 p-4">
                <div className="pointer-events-none absolute right-0 top-0 size-20 rounded-full bg-primary/[0.04] blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Info className="size-3 text-muted-foreground/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                      Vista Previa
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono text-xs">
                    <div>
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50 block mb-0.5">
                        Primer Folio
                      </span>
                      <span className="font-semibold text-foreground/90 tracking-wide">
                        {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String(form.start_number || 0).padStart(form.prefix === "E" ? 10 : 8, "0")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50 block mb-0.5">
                        Último Folio
                      </span>
                      <span className="font-semibold text-foreground/90 tracking-wide">
                        {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String(form.end_number || 0).padStart(form.prefix === "E" ? 10 : 8, "0")}
                      </span>
                    </div>
                    <div className="col-span-2 border-t border-border/40 pt-2.5 mt-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50 block mb-0.5">
                        Siguiente a Emitir
                      </span>
                      <span className="font-semibold text-primary tracking-wide">
                        {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String((form.current_number || 0) + 1).padStart(form.prefix === "E" ? 10 : 8, "0")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Aviso de Desactivación ── */}
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3.5 py-2.5">
                <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-amber-600/90">
                  Al registrar este rango, se desactivará automáticamente cualquier otro rango activo del mismo tipo ({getEcfTypeName(form.ecf_type)}).
                </p>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground/60 hidden sm:block">
                Los rangos se asignan por la DGII
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 text-xs rounded-lg border-border/70"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-4 gap-1.5"
                >
                  {submitting && <Loader2 className="size-3 animate-spin" />}
                  Registrar Rango
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
