"use client";

import { useState } from "react";

import { processInvoice, updateInvoice, uploadInvoices } from "@/lib/api/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Status = "pending" | "uploading" | "processing" | "done" | "error";

interface ProcessingStatus {
  name: string;
  status: Status;
  invoiceId?: string;
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
  const [category, setCategory] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");

  function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
  }

  async function runPipeline() {
    if (files.length === 0) return;
    setUploading(true);
    setStep(2);
    setStatus(files.map((file) => ({ name: file.name, status: "pending" })));
    setResults([]);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "uploading" } : item)));
      try {
        const upload = await uploadInvoices([file], category || undefined, type);
        const uploaded = upload.results[0];
        if (!uploaded.success || !uploaded.invoice_id) {
          setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "error" } : item)));
          continue;
        }

        const invoiceId = uploaded.invoice_id;
        setStatus((prev) =>
          prev.map((item, i) =>
            i === index ? { ...item, status: "processing", invoiceId: invoiceId } : item
          )
        );

        const processed = await processInvoice(invoiceId);
        const extractedData = (processed.extracted_data ?? {}) as ExtractedPayload;
        setResults((prev) => [...prev, { ...extractedData, id: invoiceId }]);
        setStatus((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: "done", invoiceId: invoiceId } : item))
        );
      } catch {
        setStatus((prev) => prev.map((item, i) => (i === index ? { ...item, status: "error" } : item)));
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline de Carga</CardTitle>
          <p className="text-xs text-muted-foreground">
            Importa, analiza y valida documentos por lote con trazabilidad completa.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Step label="Carga" active={step >= 1} />
            <Step label="Análisis IA" active={step >= 2} />
            <Step label="Revisión" active={step >= 3} />
          </div>
        </CardContent>
      </Card>

      {step === 1 ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Categoría por defecto</label>
                <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Detectar automáticamente</option>
                  <option value="Viajes">Viajes</option>
                  <option value="Oficina">Oficina</option>
                  <option value="Software">Software</option>
                  <option value="Servicios">Servicios</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Tipo transacción</label>
                <Select value={type} onChange={(event) => setType(event.target.value as "income" | "expense")}>
                  <option value="expense">Gastos</option>
                  <option value="income">Ingresos</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Archivos</label>
                <Input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" onChange={onSelectFiles} />
              </div>
            </div>

            {files.length > 0 ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{files.length} archivos listos</p>
                  <button className="text-xs text-rose-700" onClick={() => setFiles([])}>
                    Limpiar
                  </button>
                </div>
                <div className="tight-scrollbar max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                  {files.map((file, index) => (
                    <p key={`${file.name}-${index}`}>{file.name}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={() => void runPipeline()} disabled={files.length === 0 || uploading}>
                Iniciar procesamiento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Procesamiento en curso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {status.map((item, index) => (
              <div className="flex items-center justify-between border-b py-2 last:border-b-0" key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <span className="font-semibold">{item.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Revisión final</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={reset}>
                Subir más
              </Button>
              <Button onClick={() => (window.location.href = "/dashboard/invoices")}>Aprobar todo</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-2 py-2 text-left">Proveedor</th>
                    <th className="px-2 py-2 text-left">Fecha</th>
                    <th className="px-2 py-2 text-left">Total</th>
                    <th className="px-2 py-2 text-left">Categoría</th>
                    <th className="px-2 py-2 text-center">Confianza</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr className="border-b" key={row.id}>
                      <td className="px-2 py-2">
                        <Input
                          value={row.vendor_name ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, vendor_name: event.target.value } : item
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="date"
                          value={row.invoice_date ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, invoice_date: event.target.value } : item
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
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
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={row.category ?? ""}
                          onChange={(event) =>
                            setResults((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, category: event.target.value } : item
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-center">{Math.round((row.confidence ?? 0) * 100)}%</td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => void saveRow(row)}>
                          Guardar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Step({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-white"}`}>
      {label}
    </div>
  );
}
