"use client";

import { useState } from "react";

import { processInvoice, updateInvoice, uploadInvoices } from "@/lib/api/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingStatus[]>([]);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("auto");
  const [type, setType] = useState<"income" | "expense">("expense");

  function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
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
            i === index ? { ...item, status: "processing", invoiceId: invoiceId, progress: 60 } : item
          )
        );

        const processed = await processInvoice(invoiceId);
        const extractedData = (processed.extracted_data ?? {}) as ExtractedPayload;
        setResults((prev) => [...prev, { ...extractedData, id: invoiceId }]);
        setStatus((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: "done", invoiceId: invoiceId, progress: 100 } : item))
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
      invoice_date: row.invoice_date ?? null
    });
  }

  function reset() {
    setFiles([]);
    setStatus([]);
    setResults([]);
    setStep(1);
    setUploading(false);
  }

  const statusColors = {
    pending: "bg-muted text-muted-foreground",
    uploading: "bg-primary/10 text-primary",
    processing: "bg-amber-500/10 text-amber-600",
    done: "bg-emerald-500/10 text-emerald-600",
    error: "bg-destructive/10 text-destructive"
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="h-1 bg-primary" />
        <CardHeader>
          <CardTitle className="text-lg">Pipeline de Carga</CardTitle>
          <p className="text-xs text-muted-foreground">
            Importa, analiza y valida documentos por lote con trazabilidad completa.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <Step label="Carga" step={1} active={step >= 1} />
            <div className={cn("h-0.5 flex-1 mx-4", step >= 2 ? "bg-primary" : "bg-border")} />
            <Step label="Análisis IA" step={2} active={step >= 2} />
            <div className={cn("h-0.5 flex-1 mx-4", step >= 3 ? "bg-primary" : "bg-border")} />
            <Step label="Revisión" step={3} active={step >= 3} />
          </div>
        </CardContent>
      </Card>

      {step === 1 ? (
        <Card>
          <CardContent className="flex flex-col gap-6 pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Categoría por defecto
                </label>
               <Select value={category} onValueChange={(value) => setCategory(value)}>
                  <SelectTrigger>
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
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tipo transacción
                </label>
                <Select value={type} onValueChange={(value) => setType(value as "income" | "expense")}>
                  <SelectTrigger>
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
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Archivos
                </label>
                <div
                  className={cn(
                    "relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
                    files.length > 0 ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-primary/5"
                  )}
                >
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={onSelectFiles}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {files.length > 0 ? `${files.length} archivos seleccionados` : "Arrastra o selecciona"}
                    </p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, PDF</p>
                  </div>
                </div>
              </div>
            </div>

            {files.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{files.length} archivos listos</p>
                  <button className="text-xs text-destructive hover:underline" onClick={() => setFiles([])}>
                    Limpiar
                  </button>
                </div>
                <div className="max-h-32 flex flex-col gap-1.5 overflow-auto text-xs text-muted-foreground">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={() => void runPipeline()} disabled={files.length === 0 || uploading} className="shadow-button">
                Iniciar procesamiento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Procesamiento en curso</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {status.map((item, index) => (
              <div
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
                key={`${item.name}-${index}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  <Badge className={statusColors[item.status]}>{item.status}</Badge>
                </div>
                {item.status !== "error" && (
                  <Progress value={item.progress} className="h-1.5" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Revisión final</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={reset}>
                Subir más
              </Button>
              <Button onClick={() => (window.location.href = "/dashboard/invoices")}>Aprobar todo</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table className="min-w-full text-xs">
                <TableHeader className="bg-muted/80">
                  <TableRow>
                    <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Proveedor</TableHead>
                    <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Fecha</TableHead>
                    <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Total</TableHead>
                    <TableHead className="px-3 py-3 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Categoría</TableHead>
                    <TableHead className="px-3 py-3 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Confianza</TableHead>
                    <TableHead className="px-3 py-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow className="border-b border-border hover:bg-primary/5" key={row.id}>
                      <TableCell className="px-3 py-3">
                        <Input
                          className="h-7 text-xs"
                          value={row.vendor_name ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, vendor_name: event.target.value } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <Input
                          type="date"
                          className="h-7 text-xs"
                          value={row.invoice_date ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, invoice_date: event.target.value } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={row.total_amount ?? 0}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id
                                  ? { ...item, total_amount: Number(event.target.value) || 0 }
                                  : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <Input
                          className="h-7 text-xs"
                          value={row.category ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, category: event.target.value } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((row.confidence ?? 0) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{Math.round((row.confidence ?? 0) * 100)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right">
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
      ) : null}
    </div>
  );
}

function Step({ label, step, active }: { label: string; step: number; active: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {step}
      </div>
      <span className={cn("mt-2 text-xs", active ? "text-foreground font-medium" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}