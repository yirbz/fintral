"use client";

import { useEffect, useState } from "react";
import { billingApi, EcfSequence, EcfSequenceCreate } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlusCircle, Calendar, Hash, ToggleLeft, ToggleRight, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<EcfSequence[]>([]);
  const [loading, setLoading] = useState(true);
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
      toast.error("Error al cargar secuencias NCF: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
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
      toast.error("Tu organización debe estar certificada ante la DGII para cargar secuencias electrónicas.");
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
      toast.success("Rango de secuencias NCF/e-CF creado exitosamente");
      setDialogOpen(false);
      fetchSequences();
    } catch (err: any) {
      toast.error("Error al registrar secuencia: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await billingApi.updateSequence(id, { is_active: !currentStatus });
      toast.success(`Rango de secuencia ${!currentStatus ? "activado" : "desactivado"} con éxito`);
      fetchSequences();
    } catch (err: any) {
      toast.error("Error al actualizar estado de secuencia: " + (err.message || "Error desconocido"));
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
            Secuencias y Comprobantes NCF
          </h2>
          <p className="text-sm text-muted-foreground">
            Rangos de numeración autorizados por la DGII para comprobantes fiscales electrónicos (e-CF).
          </p>
        </div>
        <div>
          <Button
            onClick={openCreateDialog}
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3"
          >
            <PlusCircle className="size-3.5" />
            Cargar Rango NCF/e-CF
          </Button>
        </div>
      </div>

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
                No hay rangos de secuencias NCF autorizados en esta organización.
              </p>
              <Button size="xs" variant="outline" className="h-7 text-[11px] mt-3" onClick={openCreateDialog}>
                Cargar primera secuencia
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
        <DialogContent className="sm:max-w-[425px] border border-border bg-card/95 backdrop-blur-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Cargar Rango Autorizado</DialogTitle>
              <DialogDescription className="text-xs">
                Registre las secuencias autorizadas por la DGII para el timbrado de sus e-CF.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de Comprobante *</label>
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.ecf_type}
                    onChange={(e) => {
                      const typeVal = parseInt(e.target.value) || (isEcfAuthorized ? 31 : 1);
                      const isE = [31, 32, 34, 43].includes(typeVal);
                      setForm({ ...form, ecf_type: typeVal, prefix: isE ? "E" : "B" });
                    }}
                  >
                    <option value="31" disabled={!isEcfAuthorized}>
                      Crédito Fiscal Electrónico (e-CF 31) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                    <option value="32" disabled={!isEcfAuthorized}>
                      Consumo Electrónico (e-CF 32) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                    <option value="34" disabled={!isEcfAuthorized}>
                      Nota de Crédito Electrónica (e-CF 34) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                    <option value="43" disabled={!isEcfAuthorized}>
                      Gastos Menores Electrónico (e-CF 43) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                    <option value="1">Factura de Crédito Fiscal Física (NCF 01)</option>
                    <option value="2">Factura de Consumo Física (NCF 02)</option>
                    <option value="4">Nota de Crédito Física (NCF 04)</option>
                    <option value="15">Comprobante Gubernamental Físico (NCF 15)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Prefijo *</label>
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-80"
                    value={form.prefix}
                    disabled
                  >
                    <option value="E">E (e-CF)</option>
                    <option value="B">B (NCF)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Rango Inicial *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    placeholder="1"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.start_number || ""}
                    onChange={(e) => setForm({ ...form, start_number: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Rango Final *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    placeholder="1000"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.end_number || ""}
                    onChange={(e) => setForm({ ...form, end_number: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Último Emitido *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    placeholder="0"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.current_number}
                    onChange={(e) => setForm({ ...form, current_number: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha Vencimiento</label>
                  <input
                    type="date"
                    required
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Dynamic Live Preview */}
              <div className="mt-1 p-3 bg-muted/40 rounded-lg border border-border/50 text-[11px] space-y-1.5">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px]">Vista Previa de Comprobantes</div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-muted-foreground block text-[9px]">Primer Comprobante</span>
                    <span className="font-semibold text-foreground">
                      {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String(form.start_number || 0).padStart(form.prefix === "E" ? 10 : 8, "0")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[9px]">Último Comprobante</span>
                    <span className="font-semibold text-foreground">
                      {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String(form.end_number || 0).padStart(form.prefix === "E" ? 10 : 8, "0")}
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-border/40 pt-1">
                    <span className="text-muted-foreground block text-[9px]">Siguiente Comprobante a Emitir</span>
                    <span className="font-semibold text-primary">
                      {form.prefix}{String(form.ecf_type).padStart(2, "0")}{String((form.current_number || 0) + 1).padStart(form.prefix === "E" ? 10 : 8, "0")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deactivation Warning */}
              <div className="text-[10px] leading-relaxed text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-md flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                <span>Al registrar este rango como activo, se desactivará automáticamente cualquier otra secuencia activa previa del mismo tipo ({getEcfTypeName(form.ecf_type)}).</span>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs rounded-md border-border/80 text-foreground hover:bg-muted"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
