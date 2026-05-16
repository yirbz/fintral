"use client";

import { useState, useRef } from "react";

import { processInvoice, updateInvoice, uploadInvoices } from "@/lib/api/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Brain,
  Sparkles,
  ArrowRight,
  Trash2,
  AlertTriangle,
  Zap,
  Eye,
  File,
  Image,
  FileImage,
} from "lucide-react";

type Status = "pending" | "uploading" | "processing" | "done" | "error";

interface ProcessingStatus {
  name: string;
  status: Status;
  invoiceId?: string;
  progress?: number;
}

interface ProcessingResult {
  id: string;
  vendor_name?: string;
  invoice_date?: string;
  total_amount?: number;
  category?: string;
  confidence?: number;
  audit_warnings?: string[];
}

type ExtractedPayload = Omit<ProcessingResult, "id">;

const STORAGE_LABELS: Record<string, string> = {
  pending: "En espera",
  uploading: "Subiendo",
  processing: "Analizando",
  done: "Completado",
  error: "Error",
};

const FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf";

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="size-4" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext || "")) return <Image className="size-4" />;
  return <File className="size-4" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingStatus[]>([]);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("auto");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    event.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    const valid = dropped.filter((f) => FILE_ACCEPT.split(",").some((ext) => f.name.endsWith(ext.replace(".", ""))));
    setFiles((prev) => [...prev, ...valid]);
  }

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  async function runPipeline() {
    if (files.length === 0) return;
    setUploading(true);
    setStep(2);
    setStatus(files.map((file) => ({ name: file.name, status: "pending", progress: 0 })));
    setResults([]);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "uploading", progress: 20 } : item)));
      try {
        const upload = await uploadInvoices([file], category === "auto" ? undefined : category || undefined, type);
        const uploaded = upload.results[0];
        if (!uploaded.success || !uploaded.invoice_id) {
          setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "error", progress: 0 } : item)));
          continue;
        }

        const invoiceId = uploaded.invoice_id;
        setStatus((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, status: "processing", invoiceId, progress: 60 } : item
          )
        );

        const processed = await processInvoice(invoiceId);
        const extractedData = (processed.extracted_data ?? {}) as ExtractedPayload;
        setResults((prev) => [...prev, { ...extractedData, id: invoiceId }]);
        setStatus((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: "done", invoiceId, progress: 100 } : item))
        );
      } catch {
        setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "error", progress: 0 } : item)));
      }
    }

    setStep(3);
    setUploading(false);
  }

  async function saveRow(row: ProcessingResult) {
    await updateInvoice(row.id, {
      vendor_name: row.vendor_name ?? null,
      category: row.category ?? null,
      total_amount: row.total_amount ?? null,
      invoice_date: row.invoice_date ?? null,
    });
  }

  function reset() {
    setFiles([]);
    setStatus([]);
    setResults([]);
    setStep(1);
    setUploading(false);
  }

  const totalFiles = files.length;
  const successCount = status.filter((s) => s.status === "done").length;
  const errorCount = status.filter((s) => s.status === "error").length;
  const aggregateProgress = status.length > 0
    ? Math.round(status.reduce((sum, s) => sum + (s.progress ?? 0), 0) / status.length)
    : 0;

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      {/* Header */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Upload className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-medium text-foreground">
              {step === 1 ? "Carga de Facturas" : step === 2 ? "Procesando" : "Revisión Final"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {step === 1
                ? "Importa documentos para extracción automática con IA"
                : step === 2
                  ? `Procesando ${totalFiles} archivo${totalFiles !== 1 ? "s" : ""}...`
                  : `${successCount} de ${totalFiles} factura${totalFiles !== 1 ? "s" : ""} procesada${totalFiles !== 1 ? "s" : ""} exitosamente`}
            </p>
          </div>
          {step === 2 && (
            <div className="ml-auto flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span className="text-xs tabular-nums text-muted-foreground">{aggregateProgress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-0 rounded-xl bg-muted/60 p-1 ring-1 ring-border/50">
          {[
            { num: 1, label: "Archivos", icon: Upload },
            { num: 2, label: "Análisis IA", icon: Brain },
            { num: 3, label: "Revisión", icon: Eye },
          ].map((s, i) => (
            <div key={s.num} className={cn("flex flex-1 items-center gap-2 rounded-lg px-3 py-2 transition-all duration-300", step >= s.num ? "bg-background text-foreground shadow-xs" : "text-muted-foreground/60")}>
              <div className={cn("flex size-6 items-center justify-center rounded-md text-xs font-semibold transition-colors", step > s.num ? "bg-primary text-primary-foreground" : step === s.num ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground/40")}>
                {step > s.num ? <CheckCircle2 className="size-3.5" /> : <s.icon className="size-3.5" />}
              </div>
              <span className={cn("text-xs font-medium hidden sm:inline", step >= s.num ? "text-foreground" : "text-muted-foreground/60")}>{s.label}</span>
              {i < 2 && <ArrowRight className={cn("ml-auto size-3 hidden sm:block", step > s.num ? "text-primary/40" : "text-muted-foreground/20")} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-heading">Seleccionar documentos</CardTitle>
              <CardDescription className="text-xs">
                Formatos compatibles: JPG, PNG, PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-all duration-200",
                  dragOver
                    ? "border-primary bg-primary/5 shadow-inner"
                    : files.length > 0
                      ? "border-primary/30 bg-primary/[0.03]"
                      : "border-border/70 bg-muted/30 hover:border-primary/40 hover:bg-primary/[0.03]"
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={FILE_ACCEPT}
                  onChange={onSelectFiles}
                  className="hidden"
                />
                <div className={cn("flex size-12 items-center justify-center rounded-xl transition-colors", dragOver ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <Upload className={cn("size-5 transition-transform", dragOver && "scale-110")} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {dragOver ? "Suelta los archivos aquí" : files.length > 0 ? `${files.length} archivo${files.length !== 1 ? "s" : ""} seleccionado${files.length !== 1 ? "s" : ""}` : "Arrastra archivos o haz clic"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {files.length === 0 && "JPG, PNG, PDF — hasta 10 MB por archivo"}
                  </p>
                </div>
              </div>

              {/* Config + start row */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[160px]">
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Categoría
                    </label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="auto">Detectar automáticamente</SelectItem>
                          <SelectItem value="Viajes">Viajes</SelectItem>
                          <SelectItem value="Oficina">Oficina</SelectItem>
                          <SelectItem value="Software">Software</SelectItem>
                          <SelectItem value="Servicios">Servicios</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[140px]">
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tipo
                    </label>
                    <Select value={type} onValueChange={(v) => setType(v as "income" | "expense")}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="expense">Gastos</SelectItem>
                          <SelectItem value="income">Ingresos</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={() => void runPipeline()}
                  disabled={files.length === 0 || uploading}
                >
                  <Zap className="size-3.5" data-icon="inline-start" />
                  Procesar {files.length > 0 ? `${files.length} archivo${files.length !== 1 ? "s" : ""}` : ""}
                </Button>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{files.length} archivo{files.length !== 1 ? "s" : ""}</span>
                    <button className="text-[11px] text-destructive/70 hover:text-destructive hover:underline" onClick={() => setFiles([])}>
                      Limpiar todo
                    </button>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-2">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-3 rounded-md bg-background px-3 py-2 text-xs ring-1 ring-border/40"
                      >
                        {fileIcon(file.name)}
                        <span className="flex-1 truncate text-foreground">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Procesamiento en curso</CardTitle>
                  <CardDescription className="text-xs">
                    {successCount + errorCount} de {totalFiles} completados
                  </CardDescription>
                </div>
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  {aggregateProgress}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {status.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
                    item.status === "error"
                      ? "border-destructive/30 bg-destructive/[0.03]"
                      : item.status === "done"
                        ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                        : "border-border/60 bg-card"
                  )}
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    {item.status === "done" ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : item.status === "error" ? (
                      <XCircle className="size-3.5 text-destructive" />
                    ) : (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{item.name}</span>
                      <Badge
                        className={cn(
                          "shrink-0 text-[10px] px-1.5 py-0",
                          item.status === "done" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                          item.status === "error" && "bg-destructive/10 text-destructive border-destructive/20",
                          item.status === "processing" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                          (item.status === "pending" || item.status === "uploading") && "bg-primary/10 text-primary border-primary/20"
                        )}
                        variant="outline"
                      >
                        {STORAGE_LABELS[item.status]}
                      </Badge>
                    </div>
                    {item.status !== "error" && (
                      <Progress value={item.progress} className="mt-1.5 h-1" />
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-4">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span className="text-muted-foreground">Exitosos:</span>
                <span className="font-medium text-foreground">{successCount}</span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="size-3.5 text-destructive" />
                  <span className="text-muted-foreground">Con errores:</span>
                  <span className="font-medium text-foreground">{errorCount}</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  <Upload className="size-3" data-icon="inline-start" />
                  Subir más
                </Button>
                <Button size="sm" onClick={() => { window.location.href = "/dashboard/invoices"; }}>
                  <Sparkles className="size-3" data-icon="inline-start" />
                  Ir a facturas
                </Button>
              </div>
            </div>

            {/* Results table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Proveedor</TableHead>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Fecha</TableHead>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground text-right">Total</TableHead>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Categoría</TableHead>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground text-center">Confianza</TableHead>
                        <TableHead className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row) => (
                        <TableRow key={row.id} className="group hover:bg-primary/[0.02]">
                          <TableCell className="px-3 py-2">
                            <Input
                              className="h-7 text-xs"
                              value={row.vendor_name ?? ""}
                              onChange={(e) =>
                                setResults((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, vendor_name: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Input
                              type="date"
                              className="h-7 text-xs"
                              value={row.invoice_date ?? ""}
                              onChange={(e) =>
                                setResults((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, invoice_date: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-7 text-xs font-mono tabular-nums text-right"
                              value={row.total_amount ?? 0}
                              onChange={(e) =>
                                setResults((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id
                                      ? { ...item, total_amount: Number(e.target.value) || 0 }
                                      : item
                                  )
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Input
                              className="h-7 text-xs"
                              value={row.category ?? ""}
                              onChange={(e) =>
                                setResults((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, category: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${Math.round((row.confidence ?? 0) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {Math.round((row.confidence ?? 0) * 100)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => void saveRow(row)}>
                              Guardar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
