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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </CardHeader>
        </Card>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader><Skeleton className="h-4 w-24 rounded-md" /></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={i === 7 ? "md:col-span-2" : ""}>
                    <Skeleton className="mb-1 h-3 w-16 rounded-md" />
                    <Skeleton className="h-7 w-full rounded-md" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader><Skeleton className="h-4 w-28 rounded-md" /></CardHeader>
              <CardContent>
                <Skeleton className="h-40 w-full rounded-md" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><Skeleton className="h-4 w-24 rounded-md" /></CardHeader>
              <CardContent className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-16 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const invoice = query.data;
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: editable.currency || invoice.currency || "USD"
  }).format(editable.total_amount ?? invoice.total_amount ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/dashboard/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <CardTitle>{editable.vendor_name || invoice.vendor_name || "Documento sin procesar"}</CardTitle>
              <p className="text-xs text-muted-foreground">#{invoice.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={invoice.processed ? "default" : "secondary"}>
              {invoice.processed ? "Procesado" : "Borrador"}
            </Badge>
            <Button variant="secondary" onClick={() => processMutation.mutate()} disabled={invoice.processed}>
              <Sparkles className="size-4" data-icon="inline-start" />
              Analizar
            </Button>
            <Button variant="outline" onClick={() => saveMutation.mutate()}>
              <Save className="size-4" data-icon="inline-start" />
              Guardar
            </Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()}>
              <Trash2 className="size-4" data-icon="inline-start" />
              Eliminar
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/uploads/${invoice.filename}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" data-icon="inline-start" />
                Descargar
              </a>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {flags.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Observaciones de auditoría</p>
            <ul className="mt-2 list-disc flex flex-col gap-1 pl-5 text-xs text-amber-900">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
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
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="DOP">DOP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="MXN">MXN</SelectItem>
                    </SelectGroup>
                  </SelectContent>
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
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, transaction_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="expense">Gasto</SelectItem>
                      <SelectItem value="income">Ingreso</SelectItem>
                    </SelectGroup>
                  </SelectContent>
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
                  value={(editable.goods_services_type || "none") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, goods_services_type: value === "none" ? "" : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Sin especificar</SelectItem>
                      <SelectItem value="01">01 — Gastos de personal</SelectItem>
                      <SelectItem value="02">02 — Gastos por trabajos</SelectItem>
                      <SelectItem value="03">03 — Arrendamientos</SelectItem>
                      <SelectItem value="04">04 — Gastos de activos fijos</SelectItem>
                      <SelectItem value="05">05 — Gastos de representación</SelectItem>
                      <SelectItem value="06">06 — Gastos financieros</SelectItem>
                      <SelectItem value="07">07 — Gastos de seguros</SelectItem>
                      <SelectItem value="08">08 — Gastos por regalías</SelectItem>
                      <SelectItem value="09">09 — Otros gastos</SelectItem>
                      <SelectItem value="10">10 — Costo/Gasto menor</SelectItem>
                      <SelectItem value="11">11 — Adquisiciones</SelectItem>
                    </SelectGroup>
                  </SelectContent>
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
              <CardContent className="overflow-auto p-0">
                <table className="min-w-full text-xs">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Descripción</th>
                      <th className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Cant.</th>
                      <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Unitario</th>
                      <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.line_items.map((item, idx) => (
                      <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/30" key={`${item.description}-${idx}`}>
                        <td className="px-4 py-2.5 text-foreground">{item.description}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{item.unit_price}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium">{item.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documento fuente</CardTitle>
              {invoice.file_type === "image" ? (
                <Button variant="ghost" size="icon" onClick={() => setShowFullImage(true)}>
                  <Expand className="size-4" />
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
            <CardContent className="flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">
                  {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "USD" }).format((editable.total_amount ?? 0) - (editable.tax_amount ?? 0))}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">ITBIS</span>
                <span className="font-mono tabular-nums">
                  {new Intl.NumberFormat("es-DO", { style: "currency", currency: editable.currency || invoice.currency || "USD" }).format(editable.tax_amount ?? 0)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between py-1">
                <span className="font-medium text-foreground">Total</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">{amount}</span>
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
