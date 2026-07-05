"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBankAccounts } from "@/lib/api/payments";
import { updateInvoice, verifyInvoice } from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import { formatCurrency, getItbisDetail } from "@/lib/utils/date";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface ReviewInvoiceDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const DGII_CATEGORIES = [
  { code: "01", label: "01 Gastos de Personal" },
  { code: "02", label: "02 Trabajos, Suministros y Servicios" },
  { code: "03", label: "03 Arrendamientos" },
  { code: "04", label: "04 Gastos de Activos Fijos" },
  { code: "05", label: "05 Gastos de Representación" },
  { code: "06", label: "06 Otras Deducciones Admitidas" },
  { code: "07", label: "07 Gastos Financieros" },
  { code: "08", label: "08 Gastos Extraordinarios" },
  { code: "09", label: "09 Costos y Gastos de Operación" },
  { code: "10", label: "10 Adquisiciones de Activos" },
  { code: "11", label: "11 Gastos de Seguros" },
];

const ADMIN_CATEGORY_MAP: Record<string, string> = {
  "01": "Personal",
  "02": "Servicios y Suministros",
  "03": "Alquileres",
  "04": "Mantenimiento y Activos",
  "05": "Dietas y Viajes",
  "06": "Otras Deducciones",
  "07": "Gastos Financieros",
  "08": "Gastos Extraordinarios",
  "09": "Costos de Operación",
  "10": "Adquisición de Activos",
  "11": "Seguros",
};

export function ReviewInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onSuccess,
}: ReviewInvoiceDialogProps) {
  const [formState, setFormState] = useState<Partial<Invoice>>({});
  const [saving, setSaving] = useState(false);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts,
    enabled: open && !!invoice,
  });

  useEffect(() => {
    if (invoice) {
      setFormState({
        ...invoice,
        invoice_date: invoice.invoice_date ? invoice.invoice_date.split("T")[0] : "",
        due_date: invoice.due_date ? invoice.due_date.split("T")[0] : "",
        payment_date: invoice.payment_date ? invoice.payment_date.split("T")[0] : "",
      });
    }
  }, [invoice, open]);

  if (!invoice) return null;

  const confidence = invoice.confidence_score ?? 1.0;
  const isLowConfidence = confidence < 0.7;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build payload: for e-CF (locked) only send operational metadata
      const isLocked = !!invoice.original_xml_data || invoice.status === "verified";
      const operationalFields: Record<string, unknown> = {
        category: formState.category,
        payment_condition: formState.payment_condition,
        due_date: formState.due_date || null,
        payment_date: formState.payment_date || null,
        payment_status: formState.payment_status,
        bank_account_id: formState.bank_account_id || null,
        description: formState.description,
      };
      const fiscalFields: Record<string, unknown> = {
        vendor_name: formState.vendor_name,
        invoice_number: formState.invoice_number,
        invoice_date: formState.invoice_date,
        total_amount: formState.total_amount ? Number(formState.total_amount) : 0,
        tax_amount: formState.tax_amount ? Number(formState.tax_amount) : 0,
        currency: formState.currency || "DOP",
        transaction_type: formState.transaction_type,
        goods_services_type: formState.goods_services_type,
        vendor_tax_id: formState.vendor_tax_id,
      };
      const payload = isLocked ? operationalFields : { ...operationalFields, ...fiscalFields };
      const updated = await updateInvoice(invoice.id, payload);

      // 2. Verify invoice to lock it if not electronic or already verified
      if (!invoice.original_xml_data && invoice.status !== "verified") {
        await verifyInvoice(invoice.id);
      }

      toast.success("Factura verificada y guardada exitosamente");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Error al guardar factura: ${err instanceof Error ? err.message : "Error del servidor"}`);
    } finally {
      setSaving(false);
    }
  };

  const ext = invoice.filename ? invoice.filename.split(".").pop()?.toLowerCase() : "";
  const isPdf = ext === "pdf";
  const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext || "") || invoice.file_type === "image";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[96vw] max-h-[95vh] lg:h-[90vh] bg-card border border-border text-card-foreground shadow-2xl flex flex-col p-6 overflow-hidden rounded-xl">
        <DialogHeader className="shrink-0 mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <DialogTitle className="text-base font-semibold">
              Revisar Extracción de Factura por IA
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Revisa los datos extraídos y la cuenta sugerida antes de confirmarlos y agregarlos al registro contable.
          </DialogDescription>
        </DialogHeader>

        {isLowConfidence && (
          <div className="shrink-0 mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <span className="font-semibold">Confianza de extracción baja ({(confidence * 100).toFixed(0)}%)</span>.
              Por favor, verifica minuciosamente que el NCF, el RNC del proveedor y los montos totales sean correctos.
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden mb-3">
          {/* Left Column: Visual preview (PDF/Image) */}
          <div className="lg:col-span-7 border border-border rounded-lg bg-muted/20 overflow-hidden flex flex-col justify-center items-center relative min-h-[260px] lg:min-h-0 h-full">
            {isPdf ? (
              <iframe
                src={`/invoices/${invoice.id}/file#toolbar=0`}
                className="w-full h-full border-0 rounded-lg"
                title="Previsualización PDF"
              />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center p-3">
                <img
                  src={`/invoices/${invoice.id}/file`}
                  alt="Previsualización del documento"
                  className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <p className="font-semibold text-xs mb-1">Previsualización no disponible</p>
                <p className="text-[10px] text-muted-foreground/80 max-w-[280px]">
                  {ext === "xml"
                    ? "Este es un documento e-CF (XML) digital. Los datos fueron validados directamente de la firma electrónica."
                    : "Este tipo de archivo no admite previsualización visual."}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Form fields (Scrollable) */}
          <div className="lg:col-span-5 flex flex-col overflow-y-auto pr-2 gap-4">
            <div className="grid grid-cols-1 gap-4 text-xs">
              {/* Vendor Details */}
              <div className="space-y-3">
                <h4 className="font-semibold text-primary uppercase tracking-wider text-[10px]">Datos del Proveedor</h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Nombre Proveedor</Label>
                    <Input
                      className="h-8 text-xs mt-1"
                      value={formState.vendor_name ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, vendor_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">RNC/Cédula Proveedor</Label>
                    <Input
                      className="h-8 text-xs mt-1"
                      value={formState.vendor_tax_id ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, vendor_tax_id: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">NCF / Número Comprobante</Label>
                    <Input
                      className="h-8 text-xs mt-1 font-mono uppercase"
                      value={formState.invoice_number ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, invoice_number: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Payment & Classification Details */}
              <div className="space-y-3 border-t border-border/60 pt-4">
                <h4 className="font-semibold text-primary uppercase tracking-wider text-[10px]">Clasificación & Pagos</h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Condición Pago</Label>
                      <Select
                        value={formState.payment_condition ?? "contado"}
                        onValueChange={(val) => setFormState((p) => ({ ...p, payment_condition: val }))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contado" className="text-xs">Contado</SelectItem>
                          <SelectItem value="credito" className="text-xs">Crédito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Estado Pago</Label>
                      <Select
                        value={formState.payment_status ?? "pending"}
                        onValueChange={(val) => setFormState((p) => ({ ...p, payment_status: val }))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending" className="text-xs">Pendiente</SelectItem>
                          <SelectItem value="paid" className="text-xs">Pagado</SelectItem>
                          <SelectItem value="overdue" className="text-xs">Vencido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Cuenta Bancaria Asociada (IA)</Label>
                    <Select
                      value={formState.bank_account_id ?? ""}
                      onValueChange={(val) => setFormState((p) => ({ ...p, bank_account_id: val || null }))}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1 border-primary/30 bg-primary/[0.02]">
                        <SelectValue placeholder="Selecciona o asocia cuenta..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none_acc" disabled className="text-xs italic text-muted-foreground">Ninguna cuenta</SelectItem>
                        {bankAccounts.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id} className="text-xs">
                            {bank.name} (${bank.balance.toFixed(2)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Tipo de Gasto (DGII 606)</Label>
                    <Select
                      value={formState.goods_services_type ?? ""}
                      onValueChange={(val) => setFormState((p) => ({ ...p, goods_services_type: val, category: ADMIN_CATEGORY_MAP[val] ?? p.category }))}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Clasificación DGII..." />
                      </SelectTrigger>
                      <SelectContent>
                        {DGII_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.code} value={cat.code} className="text-xs">
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Invoice Amounts & Dates Row */}
              <div className="space-y-3 border-t border-border/60 pt-4">
                <h4 className="font-semibold text-primary uppercase tracking-wider text-[10px]">Montos & Fechas</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Fecha Emisión</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs mt-1"
                      value={formState.invoice_date ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, invoice_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Fecha Vencimiento</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs mt-1"
                      value={formState.due_date ?? ""}
                      onChange={(e) => setFormState((p) => ({ ...p, due_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Monto Total</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs mt-1 font-mono font-medium"
                      value={formState.total_amount ?? 0}
                      onChange={(e) => setFormState((p) => ({ ...p, total_amount: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">ITBIS</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        className="h-8 text-xs font-mono flex-1"
                        value={formState.tax_amount ?? 0}
                        onChange={(e) => setFormState((p) => ({ ...p, tax_amount: Number(e.target.value) }))}
                      />
                      <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                        {getItbisDetail(invoice).rate}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-border/60 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-primary hover:bg-primary/90 text-white font-medium"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Guardando...
              </>
            ) : (
              "Confirmar y Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  );
}
