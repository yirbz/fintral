"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, Download, Expand, FileText, Flame, RotateCcw, Save, Sparkles, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { bulkPermanentDelete as permanentDeleteApi, cancelInvoice, deleteInvoice, getInvoice, getOptimizedImage, processInvoice, restoreInvoice, uncancelInvoice, updateInvoice } from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import { useReferenceData } from "@/hooks/use-reference-data";
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
import { DgiiSelect } from "@/components/dgii-select";
import { toast } from "sonner";

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId)
  });
  const [editable, setEditable] = useState<Partial<Invoice>>({});
  const [showFullImage, setShowFullImage] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelType, setCancelType] = useState("01");
  const [imageLoaded, setImageLoaded] = useState(false);
  const image = useQuery({
    queryKey: ["invoice-image", invoiceId],
    queryFn: () => getOptimizedImage(invoiceId),
    enabled: query.data?.file_type === "image"
  });

  useEffect(() => {
    if (query.data) {
      setEditable(query.data);
      setImageLoaded(false);
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

  const restoreMutation = useMutation({
    mutationFn: () => restoreInvoice(invoiceId),
    onSuccess: () => {
      toast.success("Factura restaurada exitosamente");
      void query.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al restaurar"),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: () => permanentDeleteApi([invoiceId]),
    onSuccess: (data) => {
      toast.success(`${data.count} factura eliminada permanentemente`);
      router.push("/dashboard/invoices/trash");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al eliminar"),
  });

  const cancelMutation = useMutation({
    mutationFn: (cancellationType: string) => cancelInvoice(invoiceId, cancellationType),
    onSuccess: () => {
      toast.success("Factura anulada exitosamente");
      void query.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al anular"),
  });

  const uncancelMutation = useMutation({
    mutationFn: () => uncancelInvoice(invoiceId),
    onSuccess: () => {
      toast.success("Anulación revertida");
      void query.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al revertir anulación"),
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
  const isTrashed = !!invoice.deleted_at;
  const amount = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: editable.currency || invoice.currency || "USD"
  }).format(editable.total_amount ?? invoice.total_amount ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link href={isTrashed ? "/dashboard/invoices/trash" : "/dashboard/invoices"}>
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
            {isTrashed ? (
              <>
                <Badge variant="destructive">En papelera</Badge>
                <Button size="sm" variant="outline" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
                  <RotateCcw className="size-3.5" data-icon="inline-start" />
                  Restaurar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => permanentDeleteMutation.mutate()} disabled={permanentDeleteMutation.isPending}>
                  <Flame className="size-3.5" data-icon="inline-start" />
                  Eliminar permanentemente
                </Button>
              </>
            ) : (
              <>
                <Badge variant={invoice.processed ? "default" : "secondary"}>
                  {invoice.processed ? "Procesado" : "Borrador"}
                </Badge>
                {invoice.cancelled_at ? (
                  <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-600">
                    <XCircle className="size-3 mr-1" />
                    Anulada
                  </Badge>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => processMutation.mutate()} disabled={invoice.processed}>
                  <Sparkles className="size-3.5" data-icon="inline-start" />
                  Analizar
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()}>
                  <Save className="size-3.5" data-icon="inline-start" />
                  Guardar
                </Button>
                {invoice.cancelled_at ? (
                  <Button size="sm" variant="outline" onClick={() => uncancelMutation.mutate()} disabled={uncancelMutation.isPending}>
                    <Ban className="size-3.5" data-icon="inline-start" />
                    Desanular
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setCancelDialogOpen(true)}>
                    <XCircle className="size-3.5" data-icon="inline-start" />
                    Anular
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate()}>
                  <Trash2 className="size-3.5" data-icon="inline-start" />
                  Eliminar
                </Button>
              </>
            )}
            {invoice.file_url ? (
              <Button size="sm" variant="outline" asChild>
                <a href={invoice.file_url} target="_blank" rel="noreferrer">
                  <Download className="size-3.5" data-icon="inline-start" />
                  Descargar
                </a>
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {isTrashed ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-xs text-destructive">
              Esta factura está en la papelera. No se puede modificar hasta que sea restaurada.
              {invoice.deleted_at ? ` Eliminada el ${new Date(invoice.deleted_at).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}.` : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {invoice.cancelled_at ? (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-center gap-3 py-3">
            <XCircle className="size-4 text-orange-600 shrink-0" />
            <div className="text-xs text-orange-900">
              <span className="font-semibold">Factura anulada</span>
              <span className="text-orange-700">
                {" — "}Tipo: {invoice.cancellation_type || "01"} ·{" "}
                {new Date(invoice.cancelled_at).toLocaleDateString("es-DO", {
                  day: "numeric", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                  disabled={isTrashed}
                />
              </Field>
              <Field label="NCF">
                <Input
                  value={editable.invoice_number ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_number: event.target.value }))}
                  disabled={isTrashed}
                />
              </Field>
              <Field label="Fecha">
                <Input
                  type="date"
                  value={(editable.invoice_date ?? "") as string}
                  onChange={(event) => setEditable((prev) => ({ ...prev, invoice_date: event.target.value }))}
                  disabled={isTrashed}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  value={(editable.currency ?? "USD") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, currency: value }))}
                  disabled={isTrashed}
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
                  disabled={isTrashed}
                />
              </Field>
              <Field label="Tipo transacción">
                <Select
                  value={(editable.transaction_type ?? "expense") as string}
                  onValueChange={(value) => setEditable((prev) => ({ ...prev, transaction_type: value }))}
                  disabled={isTrashed}
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
                  disabled={isTrashed}
                />
              </Field>
              <Field label="ITBIS">
                <Input
                  type="number"
                  value={Number(editable.tax_amount ?? 0)}
                  onChange={(event) =>
                    setEditable((prev) => ({ ...prev, tax_amount: Number(event.target.value) || 0 }))
                  }
                  disabled={isTrashed}
                />
              </Field>
              <Field label="Tipo bienes/servicios (DGII 606)">
                <DgiiSelect
                  domain="goods_services_types"
                  value={(editable.goods_services_type || "none") as string}
                  onChange={(value) => setEditable((prev) => ({ ...prev, goods_services_type: value === "none" ? "" : value }))}
                  disabled={isTrashed}
                />
              </Field>
              <Field label="Descripción" className="md:col-span-2">
                <Textarea
                  value={editable.description ?? ""}
                  onChange={(event) => setEditable((prev) => ({ ...prev, description: event.target.value }))}
                  disabled={isTrashed}
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
              <div className="flex items-center gap-1">
                {invoice.file_url ? (
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a href={invoice.file_url} target="_blank" rel="noreferrer">
                      <Download className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                {invoice.file_type === "image" && image.data?.optimized_image ? (
                  <Button variant="ghost" size="icon-xs" onClick={() => setShowFullImage(true)}>
                    <Expand className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoice.file_type === "image" ? (
                image.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Skeleton className="h-48 w-full rounded-b-md" />
                  </div>
                ) : image.data?.optimized_image ? (
                  <div className="relative">
                    {!imageLoaded ? (
                      <div className="flex items-center justify-center py-12 absolute inset-0 z-10">
                        <Skeleton className="h-48 w-full rounded-b-md" />
                      </div>
                    ) : null}
                    <img
                      alt="Factura"
                      className={`max-h-72 w-full cursor-zoom-in rounded-b-md border-t object-contain transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                      src={image.data.optimized_image}
                      onClick={() => setShowFullImage(true)}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageLoaded(true)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                    <FileText className="size-10" />
                    <span className="text-xs">Vista previa no disponible</span>
                    {invoice.file_url ? (
                      <a href={invoice.file_url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-primary">
                        Abrir documento original
                      </a>
                    ) : null}
                  </div>
                )
              ) : invoice.file_type === "pdf" && invoice.file_url ? (
                <div className="relative">
                  {!imageLoaded ? (
                    <div className="flex items-start justify-center pt-4 absolute inset-0 z-10">
                      <Skeleton className="h-40 w-[90%] rounded-md" />
                    </div>
                  ) : null}
                  <iframe
                    src={invoice.file_url}
                    className={`w-full max-h-72 rounded-b-md border-t transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                    style={{ minHeight: "280px" }}
                    title="Visor de PDF"
                    onLoad={() => setImageLoaded(true)}
                  />
                  <a
                    href={invoice.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`absolute inset-0 ${imageLoaded ? "z-30" : "z-0"}`}
                    aria-label="Abrir PDF"
                  />
                </div>
              ) : invoice.file_url ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <FileText className="size-10" />
                  <a href={invoice.file_url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-primary">
                    Abrir documento original
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <FileText className="size-10" />
                  <span className="text-xs">Sin documento adjunto</span>
                </div>
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

      {/* ── Cancel Dialog ────────────────────────────────────────────── */}
      {cancelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCancelDialogOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Anular factura</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Esto marcará la factura como anulada ante la DGII. La factura permanecerá visible en tu lista y aparecerá en el formulario 608.
            </p>
            <div className="mb-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de anulación
              </label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                value={cancelType}
                onChange={(e) => setCancelType(e.target.value)}
              >
                <option value="01">01 - Deterioro</option>
                <option value="02">02 - Errores de impresión</option>
                <option value="03">03 - Impresión defectuosa</option>
                <option value="04">04 - Corrección información</option>
                <option value="05">05 - Cambio de productos</option>
                <option value="06">06 - Devolución de productos</option>
                <option value="07">07 - Omisión de productos</option>
                <option value="08">08 - Errores en secuencia NCF</option>
                <option value="09">09 - Por cese de operaciones</option>
                <option value="10">10 - Pérdida o hurto</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => {
                cancelMutation.mutate(cancelType);
                setCancelDialogOpen(false);
              }} disabled={cancelMutation.isPending}>
                <XCircle className="size-3.5 mr-1" />
                Anular factura
              </Button>
            </div>
          </div>
        </div>
      )}

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
