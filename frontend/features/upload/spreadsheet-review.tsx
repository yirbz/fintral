"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBankAccounts } from "@/lib/api/payments";
import { updateInvoice, verifyInvoice, deleteInvoice } from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import { Loader2, Check, Trash2, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpreadsheetReviewProps {
  draftInvoices: Invoice[];
  onSuccess: () => void;
}

const DGII_CATEGORIES = [
  { code: "01", label: "01 Personal" },
  { code: "02", label: "02 Servicios" },
  { code: "03", label: "03 Alquileres" },
  { code: "04", label: "04 Activos Fijos" },
  { code: "05", label: "05 Representación" },
  { code: "06", label: "06 Otras Deducciones" },
  { code: "07", label: "07 Financieros" },
  { code: "08", label: "08 Extraordinarios" },
  { code: "09", label: "09 Costos de Operación" },
  { code: "10", label: "10 Adquisiciones Activos" },
  { code: "11", label: "11 Seguros" },
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

interface RowState {
  vendor_name: string;
  vendor_tax_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  tax_amount: number;
  goods_services_type: string;
  bank_account_id: string | null;
  payment_condition: string;
  payment_status: string;
  due_date: string;
  payment_date: string;
  description: string;
}

export function SpreadsheetReview({ draftInvoices, onSuccess }: SpreadsheetReviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rowsState, setRowsState] = useState<Record<string, RowState>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: getBankAccounts,
  });

  // Set default selected ID to the first draft
  if (draftInvoices.length > 0 && (!selectedId || !draftInvoices.some((inv) => inv.id === selectedId))) {
    setSelectedId(draftInvoices[0].id);
  }

  // Sync rowsState when draftInvoices change
  if (draftInvoices.some((inv) => !rowsState[inv.id])) {
    setRowsState((prev) => {
      const newState = { ...prev };
      let updated = false;
      draftInvoices.forEach((inv) => {
        if (!newState[inv.id]) {
          newState[inv.id] = {
            vendor_name: inv.vendor_name ?? "",
            vendor_tax_id: inv.vendor_tax_id ?? "",
            invoice_number: inv.invoice_number ?? "",
            invoice_date: inv.invoice_date ? inv.invoice_date.split("T")[0] : "",
            total_amount: inv.total_amount ?? 0,
            tax_amount: inv.tax_amount ?? 0,
            goods_services_type: inv.goods_services_type ?? "",
            bank_account_id: inv.bank_account_id ?? null,
            payment_condition: inv.payment_condition ?? "contado",
            payment_status: inv.payment_status ?? "pending",
            due_date: inv.due_date ? inv.due_date.split("T")[0] : "",
            payment_date: inv.payment_date ? inv.payment_date.split("T")[0] : "",
            description: inv.description ?? "",
          };
          updated = true;
        }
      });
      return updated ? newState : prev;
    });
  }

  if (draftInvoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="size-10 text-muted-foreground/60 mb-3" />
        <p className="text-sm font-semibold text-foreground">No hay facturas por revisar</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
          Todas las facturas e imágenes están al día. ¡Buen trabajo!
        </p>
      </div>
    );
  }

  const selectedInvoice = draftInvoices.find((inv) => inv.id === selectedId) || draftInvoices[0];

  const handleUpdateField = (id: string, field: keyof RowState, value: any) => {
    setRowsState((prev) => {
      const row = prev[id] || {
        vendor_name: "",
        vendor_tax_id: "",
        invoice_number: "",
        invoice_date: "",
        total_amount: 0,
        tax_amount: 0,
        goods_services_type: "",
        bank_account_id: null,
        payment_condition: "contado",
        payment_status: "pending",
        due_date: "",
        payment_date: "",
        description: "",
      };
      
      const updatedRow = { ...row, [field]: value };
      
      // Auto-update category if goods_services_type changes
      if (field === "goods_services_type" && value) {
        // Find category from mapping
        const category = ADMIN_CATEGORY_MAP[value];
        if (category) {
          updatedRow.description = updatedRow.description || `Gasto clasificado en ${category}`;
        }
      }

      return {
        ...prev,
        [id]: updatedRow,
      };
    });
  };

  const handleSaveAndVerify = async (id: string) => {
    const row = rowsState[id];
    if (!row) return;

    setActioningId(id);
    try {
      // 1. Update invoice details
      const payload = {
        vendor_name: row.vendor_name,
        vendor_tax_id: row.vendor_tax_id,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date || null,
        total_amount: Number(row.total_amount),
        tax_amount: Number(row.tax_amount),
        goods_services_type: row.goods_services_type || null,
        category: ADMIN_CATEGORY_MAP[row.goods_services_type] || null,
        bank_account_id: row.bank_account_id || null,
        payment_condition: row.payment_condition,
        payment_status: row.payment_status,
        due_date: row.due_date || null,
        payment_date: row.payment_date || null,
        description: row.description,
      };

      await updateInvoice(id, payload);

      // 2. Verify invoice
      await verifyInvoice(id);

      toast.success("Factura verificada y guardada correctamente");
      onSuccess();
    } catch (err) {
      toast.error(`Error al verificar: ${err instanceof Error ? err.message : "Error del servidor"}`);
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este borrador de factura?")) return;
    
    setActioningId(id);
    try {
      await deleteInvoice(id);
      toast.success("Factura eliminada");
      onSuccess();
    } catch (err) {
      toast.error(`Error al eliminar: ${err instanceof Error ? err.message : "Error del servidor"}`);
    } finally {
      setActioningId(null);
    }
  };

  const selectedExt = selectedInvoice.filename ? selectedInvoice.filename.split(".").pop()?.toLowerCase() : "";
  const isSelectedPdf = selectedExt === "pdf";
  const isSelectedImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(selectedExt || "") || selectedInvoice.file_type === "image";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 min-h-[600px] h-[calc(100vh-290px)] overflow-hidden">
      {/* Left side: Spreadsheet view */}
      <div className="xl:col-span-8 flex flex-col border border-border/60 rounded-xl bg-card overflow-hidden h-full shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-border/50 shrink-0 bg-muted/15">
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Edición Rápida (Hoja de Cálculo)</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Modifica los campos directamente en la tabla y presiona el check para verificar.</p>
          </div>
          <div className="text-[10px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/40">
            {draftInvoices.length} {draftInvoices.length === 1 ? "factura pendiente" : "facturas pendientes"}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
            <thead className="sticky top-0 bg-card border-b border-border/80 z-20 shadow-[0_1px_0_0_rgba(var(--border),0.1)]">
              <tr className="bg-muted/30">
                <th className="w-[45px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center">Sel.</th>
                <th className="w-[180px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Proveedor</th>
                <th className="w-[110px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">RNC</th>
                <th className="w-[125px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">NCF / Número</th>
                <th className="w-[120px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Fecha</th>
                <th className="w-[110px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total</th>
                <th className="w-[100px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">ITBIS</th>
                <th className="w-[160px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tipo de Gasto DGII</th>
                <th className="w-[150px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Cuenta Banco (IA)</th>
                <th className="w-[110px] px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {draftInvoices.map((inv) => {
                const row = rowsState[inv.id];
                if (!row) return null;

                const isSelected = selectedId === inv.id;
                const conf = inv.confidence_score ?? 1.0;
                const isLowConf = conf < 0.7;

                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    className={cn(
                      "group hover:bg-muted/15 transition-all cursor-pointer relative",
                      isSelected ? "bg-primary/[0.03] border-l-2 border-l-primary" : ""
                    )}
                  >
                    {/* Row Selector Indicator */}
                    <td className="px-2 py-2.5 text-center">
                      <div
                        className={cn(
                          "size-2.5 rounded-full mx-auto transition-all duration-300",
                          isSelected
                            ? "bg-primary scale-125 ring-4 ring-primary/20"
                            : "bg-muted-foreground/35 group-hover:bg-muted-foreground/60"
                        )}
                      />
                    </td>

                    {/* Vendor Name */}
                    <td className="px-2 py-2.5">
                      <div className="space-y-1">
                        <Input
                          className="h-7 text-[11px] px-2 bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                          value={row.vendor_name}
                          onChange={(e) => handleUpdateField(inv.id, "vendor_name", e.target.value)}
                        />
                        {isLowConf && !row.vendor_name && (
                          <div className="flex items-center gap-1 px-2 text-[9px] text-amber-500 font-semibold">
                            <AlertTriangle className="size-3 shrink-0" />
                            Requiere validar
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Vendor Tax ID / RNC */}
                    <td className="px-2 py-2.5">
                      <Input
                        className="h-7 text-[11px] px-2 font-mono bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                        value={row.vendor_tax_id}
                        onChange={(e) => handleUpdateField(inv.id, "vendor_tax_id", e.target.value)}
                      />
                    </td>

                    {/* Invoice Number / NCF */}
                    <td className="px-2 py-2.5">
                      <Input
                        className="h-7 text-[11px] px-2 font-mono uppercase bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                        value={row.invoice_number}
                        onChange={(e) => handleUpdateField(inv.id, "invoice_number", e.target.value)}
                      />
                    </td>

                    {/* Invoice Date */}
                    <td className="px-2 py-2.5">
                      <Input
                        type="date"
                        className="h-7 text-[10px] px-1 bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                        value={row.invoice_date}
                        onChange={(e) => handleUpdateField(inv.id, "invoice_date", e.target.value)}
                      />
                    </td>

                    {/* Total Amount */}
                    <td className="px-2 py-2.5">
                      <Input
                        type="number"
                        className="h-7 text-[11px] px-2 font-mono bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                        value={row.total_amount || ""}
                        onChange={(e) => handleUpdateField(inv.id, "total_amount", Number(e.target.value))}
                      />
                    </td>

                    {/* Tax Amount / ITBIS */}
                    <td className="px-2 py-2.5">
                      <Input
                        type="number"
                        className="h-7 text-[11px] px-2 font-mono bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background"
                        value={row.tax_amount || ""}
                        onChange={(e) => handleUpdateField(inv.id, "tax_amount", Number(e.target.value))}
                      />
                    </td>

                    {/* DGII Goods/Services Type */}
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={row.goods_services_type}
                        onValueChange={(val) => handleUpdateField(inv.id, "goods_services_type", val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background px-2">
                          <SelectValue placeholder="Categoría..." />
                        </SelectTrigger>
                        <SelectContent>
                          {DGII_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.code} value={cat.code} className="text-[11px]">
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Bank Account */}
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={row.bank_account_id ?? "none"}
                        onValueChange={(val) => handleUpdateField(inv.id, "bank_account_id", val === "none" ? null : val)}
                      >
                        <SelectTrigger className={cn(
                          "h-7 text-[11px] bg-transparent border-transparent hover:border-border/60 focus:border-primary focus:bg-background px-2",
                          row.bank_account_id ? "text-primary font-medium" : "text-muted-foreground"
                        )}>
                          <SelectValue placeholder="Asociar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[11px] italic">Ninguno</SelectItem>
                          {bankAccounts.map((bank) => (
                            <SelectItem key={bank.id} value={bank.id} className="text-[11px]">
                              {bank.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Action buttons */}
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveAndVerify(inv.id)}
                          disabled={actioningId === inv.id}
                          className="size-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-md"
                          title="Verificar y Guardar"
                        >
                          {actioningId === inv.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(inv.id)}
                          disabled={actioningId === inv.id}
                          className="size-7 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md"
                          title="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right side: Selected Invoice preview */}
      <div className="xl:col-span-4 border border-border/60 rounded-xl bg-card overflow-hidden flex flex-col h-full shadow-sm">
        <div className="p-4 border-b border-border/50 bg-muted/15 shrink-0">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Documento Seleccionado</h3>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {selectedInvoice.vendor_name || selectedInvoice.filename || "Proveedor no detectado"}
          </p>
        </div>

        <div className="flex-1 min-h-0 bg-muted/5 relative flex justify-center items-center">
          {isSelectedPdf ? (
            <iframe
              src={`/invoices/${selectedInvoice.id}/file#toolbar=0`}
              className="w-full h-full border-0"
              title="Previsualización PDF"
            />
          ) : isSelectedImage ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={`/invoices/${selectedInvoice.id}/file`}
                alt="Previsualización de la factura"
                className="max-w-full max-h-full object-contain rounded-md shadow-md border border-border/30"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <p className="font-semibold text-xs mb-1">Previsualización no disponible</p>
              <p className="text-[10px] text-muted-foreground/80 max-w-[280px]">
                {selectedExt === "xml"
                  ? "Este es un documento e-CF (XML) digital. Los datos fueron validados directamente de la firma electrónica."
                  : "Este tipo de archivo no admite previsualización visual."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
