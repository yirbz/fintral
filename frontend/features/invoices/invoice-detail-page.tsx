"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Expand, Save, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { deleteInvoice, getInvoice, getOptimizedImage, processInvoice, updateInvoice } from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId)
  });
  const [editable, setEditable] = useState<Partial<Invoice>>({});
  const [showFullImage, setShowFullImage] = useState(false);
  const image = useQuery({
    queryKey: ["invoice-image", invoiceId],
    queryFn: () => getOptimizedImage(invoiceId),
    enabled: query.data?.file_type === "image"
  });

  useEffect(() => {
    if (query.data) {
      setEditable(query.data);
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateInvoice(invoiceId, editable),
    onSuccess: () => query.refetch()
  });

  const processMutation = useMutation({
    mutationFn: () => processInvoice(invoiceId),
    onSuccess: () => query.refetch()
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: () => router.push("/dashboard/invoices")
  });

  const flags = useMemo(() => {
    if (!query.data?.audit_flags) return [] as string[];
    try {
      const parsed = JSON.parse(query.data.audit_flags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [query.data?.audit_flags]);

  if (query.isLoading || !query.data) {
    return <div className="text-sm text-muted-foreground">Cargando factura...</div>;
  }

  const invoice = query.data;
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: editable.currency || invoice.currency || "USD"
  }).format(editable.total_amount ?? invoice.total_amount ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/dashboard/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <CardTitle>{editable.vendor_name || invoice.vendor_name || "Documento sin procesar"}</CardTitle>
              <p className="text-xs text-muted-foreground">#{invoice.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={invoice.processed ? "success" : "warning"}>
              {invoice.processed ? "Procesado" : "Borrador"}
            </Badge>
            <Button variant="secondary" onClick={() => processMutation.mutate()} disabled={invoice.processed}>
              <Sparkles className="mr-2 h-4 w-4" />
              Analizar
            </Button>
            <Button variant="outline" onClick={() => saveMutation.mutate()}>
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>
            <Button variant="outline" className="text-rose-700" onClick={() => deleteMutation.mutate()}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
            <a
              href={`/uploads/${invoice.filename}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar
            </a>
          </div>
        </CardHeader>
      </Card>

      {flags.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Observaciones de auditoría</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Detalle contable</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field label="Proveedor">
                <Input
                  value={editable.vendor_name ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, vendor_name: event.target.value }))}
                />
              </Field>
              <Field label="NCF">
                <Input
                  value={editable.invoice_number ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_number: event.target.value }))}
                />
              </Field>
              <Field label="Fecha">
                <Input
                  type="date"
                  value={(editable.invoice_date ?? "") as string}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_date: event.target.value }))}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  value={(editable.currency ?? "USD") as string}
                  onChange={(event) => setEditable((prev) => ({ ...prev, currency: event.target.value }))}
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MXN">MXN</option>
                </Select>
              </Field>
              <Field label="Categoría">
                <Input
                  value={editable.category ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, category: event.target.value }))}
                />
              </Field>
              <Field label="Tipo transacción">
                <Select
                  value={(editable.transaction_type ?? "expense") as string}
                  onChange={(event) => setEditable((prev) => ({ ...prev, transaction_type: event.target.value }))}
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </Select>
              </Field>
              <Field label="Total">
                <Input
                  type="number"
                  value={Number(editable.total_amount ?? 0)}
                  onChange={(event) =>
                    setEditable((prev) => ({ ...prev, total_amount: Number(event.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="ITBIS">
                <Input
                  type="number"
                  value={Number(editable.tax_amount ?? 0)}
                  onChange={(event) =>
                    setEditable((prev) => ({ ...prev, tax_amount: Number(event.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="Tipo bienes/servicios (DGII 606)">
                <Select
                  value={(editable.goods_services_type ?? "") as string}
                  onChange={(event) => setEditable((prev) => ({ ...prev, goods_services_type: event.target.value }))}
                >
                  <option value="">Seleccionar</option>
                  <option value="01">01</option>
                  <option value="02">02</option>
                  <option value="03">03</option>
                  <option value="04">04</option>
                  <option value="05">05</option>
                  <option value="06">06</option>
                  <option value="07">07</option>
                  <option value="08">08</option>
                  <option value="09">09</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                </Select>
              </Field>
              <Field label="Descripción" className="md:col-span-2">
                <Textarea
                  value={editable.description ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, description: event.target.value }))}
                />
              </Field>
            </CardContent>
          </Card>

          {invoice.line_items.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Líneas de productos/servicios</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-2 py-2 text-left">Descripción</th>
                      <th className="px-2 py-2 text-center">Cant.</th>
                      <th className="px-2 py-2 text-right">Unitario</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.line_items.map((item, idx) => (
                      <tr className="border-b" key={`${item.description}-${idx}`}>
                        <td className="px-2 py-2">{item.description}</td>
                        <td className="px-2 py-2 text-center">{item.quantity}</td>
                        <td className="px-2 py-2 text-right">{item.unit_price}</td>
                        <td className="px-2 py-2 text-right">{item.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documento fuente</CardTitle>
              {invoice.file_type === "image" ? (
                <Button variant="ghost" size="icon" onClick={() => setShowFullImage(true)}>
                  <Expand className="h-4 w-4" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {invoice.file_type === "image" && image.data?.optimized_image ? (
                <img
                  alt="Factura"
                  className="max-h-64 w-full cursor-zoom-in rounded-md border object-contain"
                  src={image.data.optimized_image}
                  onClick={() => setShowFullImage(true)}
                />
              ) : (
                <a
                  href={`/uploads/${invoice.filename}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
                >
                  Abrir PDF original
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen financiero</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-semibold">{amount}</span>
              </div>
              <div className="flex justify-between">
                <span>Base</span>
                <span>{(editable.total_amount ?? 0) - (editable.tax_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>ITBIS</span>
                <span>{editable.tax_amount ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showFullImage && image.data?.optimized_image ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setShowFullImage(false)}
        >
          <img alt="Factura completa" className="max-h-full max-w-full rounded-md" src={image.data.optimized_image} />
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
