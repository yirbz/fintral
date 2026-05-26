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
import { PlusCircle, Calendar, Hash, ToggleLeft, ToggleRight, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<EcfSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  useEffect(() => {
    fetchSequences();
  }, []);

  const openCreateDialog = () => {
    setForm({
      ecf_type: 31,
      prefix: "E",
      start_number: 1,
      end_number: 1000,
      current_number: 0,
      expiry_date: new Date(new Date().getFullYear() + 2, 11, 31).toISOString().split("T")[0], // 2 years out
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.start_number > form.end_number) {
      toast.error("El número inicial no puede ser mayor que el número final");
      return;
    }
    if (form.current_number < form.start_number - 1) {
      toast.error("El número actual debe ser mayor o igual al número inicial - 1");
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
      default:
        return `Comprobante Electrónico Tipo ${type}`;
    }
  };

  const getUsageStats = (seq: EcfSequence) => {
    const total = seq.end_number - seq.start_number + 1;
    const consumed = Math.max(0, seq.current_number - seq.start_number + 1);
    const percent = Math.min(100, Math.round((consumed / total) * 100));
    return { consumed, total, percent };
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
            className="h-8 rounded-md bg-[#533afd] text-white hover:bg-[#533afd]/90 text-xs gap-1.5 px-3"
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
            const stats = getUsageStats(seq);
            return (
              <Card key={seq.id} className="border border-border/50 bg-card/50 overflow-hidden relative">
                {/* Visual Accent */}
                <div className={`absolute top-0 left-0 w-1.5 h-full ${seq.is_active ? "bg-emerald-500" : "bg-muted"}`} />

                <CardHeader className="pb-3 pl-8 flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
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
                    </CardTitle>
                    <CardDescription className="text-xs font-mono">
                      Prefijo: <span className="font-semibold text-foreground">{seq.prefix}</span> | Rango:{" "}
                      <span className="font-semibold text-foreground">
                        {seq.prefix}
                        {seq.ecf_type}
                        {String(seq.start_number).padStart(10, "0")}
                      </span>{" "}
                      <ArrowRight className="inline size-3 mx-1" />{" "}
                      <span className="font-semibold text-foreground">
                        {seq.prefix}
                        {seq.ecf_type}
                        {String(seq.end_number).padStart(10, "0")}
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
                        `${seq.prefix}${seq.ecf_type}${String(seq.current_number).padStart(10, "0")}`
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Ninguno</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Consumido: {stats.percent}%</span>
                      <span>
                        {stats.consumed} / {stats.total}
                      </span>
                    </div>
                    <Progress value={stats.percent} className="h-1.5 bg-muted/60" />
                  </div>

                  <div className="space-y-1 flex items-center md:justify-end gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3.5 text-[#533afd]" />
                      <span>Vence:</span>
                      <span className="font-semibold text-foreground">
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
                    onChange={(e) => setForm({ ...form, ecf_type: parseInt(e.target.value) || 31 })}
                  >
                    <option value="31">Crédito Fiscal Electrónico (31)</option>
                    <option value="32">Consumo Electrónico (32)</option>
                    <option value="34">Nota de Crédito Electrónica (34)</option>
                    <option value="43">Gastos Menores Electrónico (43)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Prefijo *</label>
                  <input
                    type="text"
                    required
                    placeholder="E"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                    value={form.prefix}
                    onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Rango Inicial *</label>
                  <input
                    type="number"
                    required
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
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                  />
                </div>
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
                className="h-8 rounded-md bg-[#533afd] text-white hover:bg-[#533afd]/90 text-xs px-3 gap-1.5"
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
