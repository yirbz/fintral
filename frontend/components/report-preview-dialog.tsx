"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Table2,
} from "lucide-react";
import { getApArPreview, exportApAr, type ReportPreviewData } from "@/lib/api/payments";
import { triggerBlobDownload } from "@/lib/api/dgii";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/use-user-preferences";

interface ReportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: "ap" | "ar";
}

export function ReportPreviewDialog({
  isOpen,
  onClose,
  reportType,
}: ReportPreviewDialogProps) {
  const [data, setData] = useState<ReportPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const { formatCurrency } = useUserPreferences();

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getApArPreview(reportType)
        .then((previewData) => {
          setData(previewData);
        })
        .catch((err) => {
          toast.error("Error al cargar vista previa del reporte", {
            description: err instanceof Error ? err.message : "Error del servidor",
          });
          onClose();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setData(null);
    }
  }, [isOpen, reportType, onClose]);

  const handleExport = async (format: "xlsx" | "csv" | "txt") => {
    setExporting(format);
    try {
      const blob = await exportApAr(reportType, format);
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const slug = reportType === "ap" ? "cxp" : "cxc";
      const ext = format === "xlsx" ? "xlsx" : format === "csv" ? "csv" : "txt";
      triggerBlobDownload(blob, `reporte_${slug}_${timestamp}.${ext}`);
      toast.success("Archivo descargado correctamente");
    } catch (err) {
      toast.error("Error al exportar archivo", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setExporting(null);
    }
  };

  const getColLetter = (idx: number) => {
    return String.fromCharCode(65 + idx); // A, B, C, ...
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] lg:max-w-[85vw] xl:max-w-[75vw] max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Table2 className="size-5 text-primary" />
              Vista Previa de Reporte: {reportType === "ap" ? "Cuentas por Pagar (CXP)" : "Cuentas por Cobrar (CXC)"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Previsualiza y valida los datos tal como se exportarán en formato de hoja de cálculo.
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("xlsx")}
              disabled={loading || !!exporting}
              className="h-8 text-xs gap-1.5 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700 font-medium"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-3.5" />
              )}
              Descargar Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={loading || !!exporting}
              className="h-8 text-xs gap-1.5 border-sky-500/30 hover:border-sky-500 hover:bg-sky-50 text-sky-700 font-medium"
            >
              {exporting === "csv" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Descargar CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("txt")}
              disabled={loading || !!exporting}
              className="h-8 text-xs gap-1.5 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50 text-orange-700 font-medium"
            >
              {exporting === "txt" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              Descargar TXT
            </Button>
          </div>
        </DialogHeader>

        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[350px] gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-medium animate-pulse">
              Cargando datos y estructurando hoja de cálculo...
            </p>
          </div>
        )}

        {!loading && data && (
          <div className="flex-1 flex flex-col overflow-hidden my-4">
            {/* Info bar */}
            <div className="bg-muted/40 border rounded-lg p-3 mb-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="font-semibold text-muted-foreground">Organización:</span>{" "}
                <span className="font-medium text-foreground">{data.org_name}</span>
              </div>
              {data.org_tax_id && (
                <div>
                  <span className="font-semibold text-muted-foreground">RNC:</span>{" "}
                  <span className="font-medium text-foreground font-mono">{data.org_tax_id}</span>
                </div>
              )}
              <div>
                <span className="font-semibold text-muted-foreground">Generado:</span>{" "}
                <span className="font-medium text-foreground font-mono">{data.generated_at} (UTC)</span>
              </div>
              <div className="ml-auto">
                <span className="font-semibold text-muted-foreground">Registros:</span>{" "}
                <span className="font-semibold text-primary font-mono">{data.rows.length}</span>
              </div>
            </div>

            {/* Spreadsheet Grid Mock */}
            <div className="flex-1 border rounded-lg overflow-auto bg-slate-100 dark:bg-slate-900 grid-sheet-container">
              <table className="border-collapse w-full table-fixed select-none">
                <thead>
                  {/* Letters Header Row */}
                  <tr className="bg-slate-200 dark:bg-slate-800 text-[10px] font-mono text-slate-500 sticky top-0 z-20">
                    <th className="w-10 bg-slate-300 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-center sticky left-0 z-30 py-0.5">
                      {/* Empty top-left cell */}
                    </th>
                    {data.headers.map((_, idx) => (
                      <th
                        key={idx}
                        className="w-[150px] md:w-[180px] border border-slate-300 dark:border-slate-600 text-center font-normal py-0.5"
                      >
                        {getColLetter(idx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-950 font-sans text-xs text-slate-800 dark:text-slate-200">
                  {/* Row 1: Title */}
                  <tr className="h-8">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      1
                    </td>
                    <td
                      colSpan={data.headers.length}
                      className="border border-slate-200 dark:border-slate-800 px-3 font-semibold text-base text-indigo-950 dark:text-indigo-200 align-middle bg-indigo-50/20"
                    >
                      FINTRAL - PLATAFORMA DE FACTURACIÓN & CONTABILIDAD
                    </td>
                  </tr>

                  {/* Row 2: Subtitle */}
                  <tr className="h-6">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      2
                    </td>
                    <td
                      colSpan={data.headers.length}
                      className="border border-slate-200 dark:border-slate-800 px-3 font-medium text-xs text-slate-600 dark:text-slate-400 align-middle bg-indigo-50/20"
                    >
                      {data.report_name}
                    </td>
                  </tr>

                  {/* Row 3: Organization metadata */}
                  <tr className="h-6">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      3
                    </td>
                    <td
                      colSpan={data.headers.length}
                      className="border border-slate-200 dark:border-slate-800 px-3 text-xs text-slate-700 dark:text-slate-300 align-middle bg-indigo-50/20"
                    >
                      Organización: {data.org_name} | RNC: {data.org_tax_id || "N/A"}
                    </td>
                  </tr>

                  {/* Row 4: Timestamp */}
                  <tr className="h-6">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      4
                    </td>
                    <td
                      colSpan={data.headers.length}
                      className="border border-slate-200 dark:border-slate-800 px-3 text-[11px] text-slate-500 italic align-middle bg-indigo-50/20"
                    >
                      Generado el: {data.generated_at} (UTC)
                    </td>
                  </tr>

                  {/* Row 5: Empty space */}
                  <tr className="h-4 bg-slate-50/30 dark:bg-slate-900/30">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      5
                    </td>
                    {data.headers.map((_, idx) => (
                      <td key={idx} className="border border-slate-200 dark:border-slate-800" />
                    ))}
                  </tr>

                  {/* Row 6: Table Headers */}
                  <tr className="h-10 bg-indigo-600 text-white font-semibold">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal text-slate-800 dark:text-slate-200">
                      6
                    </td>
                    {data.headers.map((h, idx) => (
                      <td
                        key={idx}
                        className="border border-indigo-700 px-2.5 text-center text-xs tracking-wide align-middle"
                      >
                        {h}
                      </td>
                    ))}
                  </tr>

                  {/* Row 7+: Data Rows */}
                  {data.rows.map((row, rowIdx) => {
                    const excelRowNumber = rowIdx + 7;
                    const isZebra = rowIdx % 2 === 1;

                    return (
                      <tr
                        key={row.id}
                        className={`h-8 hover:bg-indigo-500/5 transition-colors ${
                          isZebra ? "bg-slate-50/40 dark:bg-slate-900/10" : ""
                        }`}
                      >
                        <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                          {excelRowNumber}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 font-mono text-[11px] align-middle truncate">
                          {row.invoice_number}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 align-middle truncate font-medium">
                          {row.entity_name}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 font-mono text-[11px] align-middle truncate">
                          {row.tax_id}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-center align-middle font-mono text-[11px]">
                          {row.invoice_date}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-center align-middle font-mono text-[11px]">
                          {row.due_date}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-right align-middle font-mono text-[11px]">
                          {row.days_overdue}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-center align-middle">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                              row.status === "Vencido"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-slate-50 text-slate-700 border-slate-200"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-right font-mono text-[11px] align-middle font-medium">
                          {formatCurrency(row.base_amount, "DOP")}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-right font-mono text-[11px] align-middle">
                          {formatCurrency(row.tax_amount, "DOP")}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-800 px-2 text-right font-mono text-[11px] align-middle font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(row.total_amount, "DOP")}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Empty rows if list is empty to preserve sheet structure */}
                  {data.rows.length === 0 && (
                    <tr className="h-16">
                      <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                        7
                      </td>
                      <td
                        colSpan={data.headers.length}
                        className="border border-slate-200 dark:border-slate-800 text-center text-muted-foreground italic align-middle"
                      >
                        No hay facturas vigentes para mostrar en el reporte.
                      </td>
                    </tr>
                  )}

                  {/* Totals Row */}
                  <tr className="h-9 bg-slate-50 dark:bg-slate-900/50 font-bold border-t border-slate-400">
                    <td className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px] text-slate-500 text-center sticky left-0 py-1 font-normal">
                      {data.rows.length + 7}
                    </td>
                    <td className="border-t-2 border-b-4 border-double border-slate-400 px-2 align-middle text-left">
                      Total General
                    </td>
                    {/* Empty cells for columns B-G */}
                    <td className="border-t-2 border-b-4 border-double border-slate-400" colSpan={6} />
                    <td className="border-t-2 border-b-4 border-double border-slate-400 px-2 text-right font-mono text-[11px] align-middle">
                      {formatCurrency(data.totals.base_amount, "DOP")}
                    </td>
                    <td className="border-t-2 border-b-4 border-double border-slate-400 px-2 text-right font-mono text-[11px] align-middle">
                      {formatCurrency(data.totals.tax_amount, "DOP")}
                    </td>
                    <td className="border-t-2 border-b-4 border-double border-slate-400 px-2 text-right font-mono text-[11px] align-middle text-indigo-700 dark:text-indigo-400">
                      {formatCurrency(data.totals.total_amount, "DOP")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
