"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  SendIcon, CheckCircle2, AlertTriangle, XCircle, Loader2,
  FileText, Trash2, Info, Clock, Search, Filter, List, Sheet,
  CheckCheck, Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  listDgiiSubmissions, deleteDgiiSubmission,
  getDgiiSubmissionDetail, confirmDgiiSubmission,
  reportDgiiSubmissionResults,
  markUploadedDgiiSubmission,
  type DgiiSubmission, type DgiiSubmissionDetail,
  type ReportResultsItem,
} from "@/lib/api/dgii"

const STATUS_CONFIG: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  pending_upload: {
    label: "Pendiente de envío",
    badge: "bg-sky-500/10 text-sky-600 border-sky-200",
    icon: <SendIcon className="size-3" />,
  },
  pending_confirm: {
    label: "Pendiente",
    badge: "bg-amber-500/10 text-amber-600 border-amber-200",
    icon: <Clock className="size-3" />,
  },
  confirmed: {
    label: "Confirmado",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    icon: <CheckCircle2 className="size-3" />,
  },
  partial_error: {
    label: "Con errores",
    badge: "bg-red-500/10 text-red-600 border-red-200",
    icon: <AlertTriangle className="size-3" />,
  },
}

const INVOICE_STATUS_OPTIONS = [
  { value: "reported", label: "Reportado", badge: "bg-emerald-500/10 text-emerald-600", icon: <CheckCircle2 className="size-2.5" /> },
  { value: "error", label: "Error", badge: "bg-red-500/10 text-red-600", icon: <XCircle className="size-2.5" /> },
  { value: "excluded", label: "Excluido", badge: "bg-slate-100 text-slate-600", icon: <Ban className="size-2.5" /> },
]

function snapshotCellValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

function periodLabel(p: string) {
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Jul", "Agosto", "Sep", "Octubre", "Nov", "Diciembre"]
  const y = p.slice(0, 4), m = parseInt(p.slice(4, 6), 10) - 1
  return `${months[m] || m + 1} ${y}`
}

export function DgiiSubmissionsPage() {
  const [submissions, setSubmissions] = useState<DgiiSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detail dialog
  const [detail, setDetail] = useState<DgiiSubmissionDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [localStatuses, setLocalStatuses] = useState<Map<string, { status: string; error_detail: string }>>(new Map())
  const [localDirty, setLocalDirty] = useState(false)
  const [savingStatuses, setSavingStatuses] = useState(false)
  const [detailSearch, setDetailSearch] = useState("")
  const [detailFilter, setDetailFilter] = useState<string | null>(null)
  const [detailView, setDetailView] = useState<"table" | "spreadsheet">("table")
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())

  const [confirming, setConfirming] = useState<string | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Mark as uploaded
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listDgiiSubmissions()
      setSubmissions(res.submissions)
    } catch (e: any) {
      setError(e.message || "Error al cargar envíos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  async function handleOpenDetail(submissionId: string) {
    try {
      const res = await getDgiiSubmissionDetail(submissionId)
      setDetail(res)
      // Initialize local statuses from server state
      const statuses = new Map<string, { status: string; error_detail: string }>()
      for (const inv of res.invoices) {
        statuses.set(inv.id, { status: inv.status, error_detail: inv.error_detail || "" })
      }
      setLocalStatuses(statuses)
      setLocalDirty(false)
      setDetailSearch("")
      setDetailFilter(null)
      setDetailView("table")
      setSelectedInvoiceIds(new Set())
      setDetailOpen(true)
    } catch (e: any) {
      setError(e.message || "Error al cargar detalle")
    }
  }

  async function handleConfirm(submissionId: string) {
    setConfirmBusy(true)
    try {
      await confirmDgiiSubmission(submissionId)
      setConfirming(null)
      await fetchSubmissions()
    } catch (e: any) {
      setError(e.message || "Error al confirmar")
    } finally {
      setConfirmBusy(false)
    }
  }

  async function handleMarkUploaded(submissionId: string) {
    setUploadBusy(true)
    try {
      await markUploadedDgiiSubmission(submissionId)
      setUploadTarget(null)
      await fetchSubmissions()
    } catch (e: any) {
      setError(e.message || "Error al marcar como subido")
    } finally {
      setUploadBusy(false)
    }
  }

  async function handleDelete(submissionId: string) {
    setDeleteBusy(true)
    try {
      await deleteDgiiSubmission(submissionId)
      setDeleteTarget(null)
      if (detail?.id === submissionId) {
        setDetailOpen(false)
        setDetail(null)
      }
      await fetchSubmissions()
    } catch (e: any) {
      setError(e.message || "Error al eliminar")
    } finally {
      setDeleteBusy(false)
    }
  }

  function setInvoiceLocalStatus(invoiceId: string, status: string) {
    setLocalStatuses(prev => {
      const next = new Map(prev)
      const existing = next.get(invoiceId) || { status: "reported", error_detail: "" }
      next.set(invoiceId, {
        ...existing,
        status,
        error_detail: status === "error" ? existing.error_detail : "",
      })
      return next
    })
    setLocalDirty(true)
  }

  function setInvoiceLocalErrorDetail(invoiceId: string, error_detail: string) {
    setLocalStatuses(prev => {
      const next = new Map(prev)
      const existing = next.get(invoiceId) || { status: "reported", error_detail: "" }
      next.set(invoiceId, { ...existing, error_detail })
      return next
    })
    setLocalDirty(true)
  }

  function toggleInvoiceSelection(invoiceId: string, selected: boolean) {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(invoiceId)
      else next.delete(invoiceId)
      return next
    })
  }

  function toggleVisibleSelection(selected: boolean) {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev)
      for (const invoice of filteredInvoices) {
        if (selected) next.add(invoice.id)
        else next.delete(invoice.id)
      }
      return next
    })
  }

  function bulkSetStatus(value: string) {
    if (!detail || filteredInvoices.length === 0) return
    const visibleIds = new Set(filteredInvoices.map((invoice) => invoice.id))
    setLocalStatuses(prev => {
      const next = new Map(prev)
      for (const inv of detail.invoices) {
        if (!visibleIds.has(inv.id)) continue
        const existing = next.get(inv.id) || { status: "reported", error_detail: "" }
        next.set(inv.id, {
          ...existing,
          status: value,
          error_detail: value === "error" ? existing.error_detail : "",
        })
      }
      return next
    })
    setLocalDirty(true)
  }

  function setSelectedStatus(value: string) {
    if (selectedInvoiceIds.size === 0) return
    setLocalStatuses((prev) => {
      const next = new Map(prev)
      for (const invoiceId of selectedInvoiceIds) {
        const existing = next.get(invoiceId) || { status: "reported", error_detail: "" }
        next.set(invoiceId, {
          ...existing,
          status: value,
          error_detail: value === "error" ? existing.error_detail : "",
        })
      }
      return next
    })
    setLocalDirty(true)
  }

  async function handleSaveStatuses() {
    if (!detail) return
    setSavingStatuses(true)
    try {
      const results: ReportResultsItem[] = []
      for (const [invoiceId, result] of localStatuses) {
        results.push({
          invoice_id: invoiceId,
          status: result.status,
          error_detail: result.error_detail || undefined,
        })
      }
      await reportDgiiSubmissionResults(detail.id, results)
      setLocalDirty(false)
      await fetchSubmissions()
      // Refresh detail
      const res = await getDgiiSubmissionDetail(detail.id)
      setDetail(res)
      // Re-init local statuses from fresh server data
      const statuses = new Map<string, { status: string; error_detail: string }>()
      for (const inv of res.invoices) {
        statuses.set(inv.id, { status: inv.status, error_detail: inv.error_detail || "" })
      }
      setLocalStatuses(statuses)
    } catch (e: any) {
      setError(e.message || "Error al guardar resultados")
    } finally {
      setSavingStatuses(false)
    }
  }

  const reportColumns = useMemo(() => detail?.report_columns || [], [detail])

  const filteredInvoices = useMemo(() => {
    if (!detail) return []
    const query = detailSearch.trim().toLowerCase()

    return detail.invoices.filter((invoice) => {
      const localStatus = localStatuses.get(invoice.id)?.status || invoice.status
      if (detailFilter && localStatus !== detailFilter) return false
      if (!query) return true

      const haystack = [
        ...reportColumns.map((column) => snapshotCellValue(invoice.report_snapshot?.[column.key])),
        invoice.error_detail || "",
        invoice.status || "",
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [
    detail,
    detailFilter,
    detailSearch,
    localStatuses,
    reportColumns,
  ])

  const totalErrors = useMemo(
    () => Array.from(localStatuses.values()).filter((status) => status.status === "error").length,
    [localStatuses],
  )

  const selectedVisibleCount = useMemo(
    () => filteredInvoices.filter((invoice) => selectedInvoiceIds.has(invoice.id)).length,
    [filteredInvoices, selectedInvoiceIds],
  )

  const pendingCount = submissions.filter(s => s.status === "pending_confirm" || s.status === "pending_upload").length

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <SendIcon className="size-5 text-primary" />
              Envíos DGII
            </CardTitle>
            <CardDescription className="text-xs">
              Historial de reportes enviados a la DGII. Gestiona resultados y errores.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/10 text-amber-600 border border-amber-200 gap-1 px-2 py-1">
                <Clock className="size-3" />
                {pendingCount} pendiente(s)
              </Badge>
            )}
            <Badge className="bg-muted text-muted-foreground gap-1 px-2 py-1">
              <FileText className="size-3" />
              {submissions.length} total
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="py-3 px-4 text-xs text-red-700">{error}</CardContent>
        </Card>
      )}

      {/* Submissions table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader className="bg-muted/80">
                  <TableRow>
                    <TableHead className="px-3 py-2.5"><Skeleton className="h-3 w-14 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5"><Skeleton className="h-3 w-14 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5"><Skeleton className="h-3 w-14 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5"><Skeleton className="ml-auto h-3 w-16 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5"><Skeleton className="h-3 w-14 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5"><Skeleton className="h-3 w-14 rounded-md" /></TableHead>
                    <TableHead className="px-3 py-2.5 w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index} className="border-b border-border">
                      <TableCell className="px-3 py-2"><Skeleton className="h-4 w-28 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2"><Skeleton className="h-4 w-16 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2"><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2"><Skeleton className="ml-auto h-4 w-12 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2"><Skeleton className="h-4 w-40 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2"><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Skeleton className="h-7 w-10 rounded-md" />
                          <Skeleton className="h-7 w-16 rounded-md" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No hay envíos registrados. Descarga un reporte DGII y márcalo como enviado para verlo aquí.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/80">
                <TableRow>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">Estado</TableHead>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">Formato</TableHead>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">Período</TableHead>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-right">Facturas</TableHead>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">Notas</TableHead>
                  <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">Fecha</TableHead>
                  <TableHead className="px-3 py-2.5 w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map(sub => {
                  const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending_confirm
                  return (
                    <TableRow key={sub.id} className="border-b border-border transition-colors hover:bg-muted/50">
                      <TableCell className="px-3 py-2">
                        <Badge className={cn("gap-1 px-1.5 py-0.5 text-[9px] font-medium border", cfg.badge)}>
                          {cfg.icon}{cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs font-semibold">F-{sub.format}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{periodLabel(sub.period)}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-right tabular-nums font-mono">{sub.invoice_count}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{sub.notes || "—"}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {sub.created_at ? new Date(sub.created_at).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-[10px] px-2"
                            onClick={() => handleOpenDetail(sub.id)}
                          >
                            Ver
                          </Button>
                          {sub.status === "pending_upload" && (
                            <>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[10px] px-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setConfirming(sub.id)}
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                Confirmar
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[10px] px-2 border-sky-200 text-sky-700 hover:bg-sky-50"
                                onClick={() => setUploadTarget(sub.id)}
                              >
                                <SendIcon className="size-3 mr-1" />
                                Subir
                              </Button>
                            </>
                          )}
                          {sub.status === "pending_confirm" && (
                            <>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[10px] px-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setConfirming(sub.id)}
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                Confirmar
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[10px] px-2"
                                onClick={() => handleOpenDetail(sub.id)}
                              >
                                Revisar
                              </Button>
                            </>
                          )}
                          {sub.status === "partial_error" && (
                            <Button
                              variant="outline" size="sm"
                              className="h-7 text-[10px] px-2 border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => handleOpenDetail(sub.id)}
                            >
                              <AlertTriangle className="size-3 mr-1" />
                              Revisar
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            onClick={() => setDeleteTarget(sub.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog — merged view with search, filter, inline edit, bulk actions */}
      <Dialog open={detailOpen} onOpenChange={o => { if (!o) { setDetailOpen(false); setDetail(null); } }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          {detail && (
            <>
              <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2 text-sm">
                    <SendIcon className="size-4 text-primary" />
                    Envío F-{detail.format} — {periodLabel(detail.period)}
                  </DialogTitle>
                  <Badge className={cn("gap-1 px-1.5 py-0 text-[9px] font-medium border",
                    STATUS_CONFIG[detail.status]?.badge
                  )}>
                    {STATUS_CONFIG[detail.status]?.icon}{STATUS_CONFIG[detail.status]?.label}
                  </Badge>
                </div>
                <DialogDescription className="text-xs flex items-center gap-3 mt-1">
                  <span>{detail.invoice_count} factura(s)</span>
                  <span>{new Date(detail.created_at).toLocaleString("es-DO")}</span>
                  <span className={cn(
                    "font-medium",
                    localDirty ? "text-amber-600" : "text-muted-foreground"
                  )}>
                    {localDirty ? "✗ Cambios sin guardar" : "✓ Sin cambios"}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {/* Search + Filters */}
              <div className="px-6 py-3 shrink-0 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por proveedor, NCF o RNC..."
                      value={detailSearch}
                      onChange={e => setDetailSearch(e.target.value)}
                      className="h-7 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {INVOICE_STATUS_OPTIONS.map(opt => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setDetailFilter(detailFilter === opt.value ? null : opt.value)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                          detailFilter === opt.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {opt.icon}{opt.label}
                      </button>
                    ))}
                    {detailFilter && (
                      <button
                        type="button"
                        onClick={() => setDetailFilter(null)}
                        className="text-[10px] text-muted-foreground underline ml-1"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant={detailView === "table" ? "default" : "ghost"} size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDetailView("table")}
                      title="Vista columnas"
                    >
                      <List className="size-3.5" />
                    </Button>
                    <Button
                      variant={detailView === "spreadsheet" ? "default" : "ghost"} size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDetailView("spreadsheet")}
                      title="Vista spreadsheet"
                    >
                      <Sheet className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Bulk actions */}
                {filteredInvoices.length > 0 && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <Filter className="size-3" />
                    <span>{filteredInvoices.length} visible(s)</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{selectedInvoiceIds.size} seleccionada(s)</span>
                    <span className="text-muted-foreground/50">|</span>
                    <button
                      type="button"
                      onClick={() => toggleVisibleSelection(selectedVisibleCount !== filteredInvoices.length)}
                      className="flex items-center gap-1 text-primary hover:underline font-medium"
                    >
                      {selectedVisibleCount === filteredInvoices.length ? "Quitar selección visible" : "Seleccionar visibles"}
                    </button>
                    <span className="text-muted-foreground/50">·</span>
                    <button
                      type="button"
                      onClick={() => bulkSetStatus("reported")}
                      className="flex items-center gap-1 text-emerald-600 hover:underline font-medium"
                    >
                      <CheckCheck className="size-3" /> Marcar visibles como reportadas
                    </button>
                    <span className="text-muted-foreground/50">·</span>
                    <button
                      type="button"
                      onClick={() => bulkSetStatus("error")}
                      className="flex items-center gap-1 text-red-600 hover:underline font-medium"
                    >
                      <XCircle className="size-3" /> Marcar visibles como error
                    </button>
                    <span className="text-muted-foreground/50">·</span>
                    <button
                      type="button"
                      onClick={() => bulkSetStatus("excluded")}
                      className="flex items-center gap-1 text-slate-600 hover:underline font-medium"
                    >
                      <Ban className="size-3" /> Excluir visibles
                    </button>
                    {selectedInvoiceIds.size > 0 && (
                      <>
                        <span className="text-muted-foreground/50">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedStatus("reported")}
                          className="flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                        >
                          <CheckCheck className="size-3" /> Seleccionadas: exitosas
                        </button>
                        <span className="text-muted-foreground/50">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedStatus("error")}
                          className="flex items-center gap-1 text-red-700 hover:underline font-semibold"
                        >
                          <XCircle className="size-3" /> Seleccionadas: con error
                        </button>
                        <span className="text-muted-foreground/50">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedStatus("excluded")}
                          className="flex items-center gap-1 text-slate-700 hover:underline font-semibold"
                        >
                          <Ban className="size-3" /> Seleccionadas: excluidas
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Invoices list */}
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-2">
                  {/* Summary mini-bar */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pb-2 border-b">
                    <span>{filteredInvoices.length} de {detail.invoice_count} factura(s)</span>
                    {totalErrors > 0 && (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <XCircle className="size-3" />{totalErrors} con error
                      </span>
                    )}
                  </div>

                  {filteredInvoices.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {detailSearch ? "No se encontraron facturas con ese filtro." : "No hay facturas en este envío."}
                    </div>
                  ) : detailView === "spreadsheet" ? (
                    <div className="border border-border rounded-md overflow-hidden">
                      <div className="overflow-auto max-h-[52vh] p-2 [scrollbar-gutter:stable_both-edges]">
                        <div className="inline-block min-w-full pr-3 pb-3">
                          <table className="w-max min-w-full border-collapse">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-[#4472C4] text-white">
                              <th className="px-1.5 py-1.5 text-[9px] font-bold border-r border-[#3b63a8] sticky left-0 bg-[#4472C4] z-20 w-8">
                                <Checkbox
                                  checked={selectedVisibleCount > 0 && selectedVisibleCount === filteredInvoices.length}
                                  onCheckedChange={(checked) => toggleVisibleSelection(!!checked)}
                                  className="size-3.5 border-white data-[state=checked]:bg-white data-[state=checked]:text-[#4472C4]"
                                />
                              </th>
                              <th className="px-1.5 py-1.5 text-[9px] font-bold text-center border-r border-[#3b63a8] w-8 sticky left-8 bg-[#4472C4] z-20">#</th>
                              <th className="px-2 py-1.5 text-[9px] font-bold text-center border-r border-[#3b63a8] min-w-[110px]">Estado</th>
                              {reportColumns.map((column) => (
                                <th
                                  key={column.key}
                                  className="px-2 py-1.5 text-[9px] font-bold text-center border-r border-[#3b63a8] min-w-[135px]"
                                >
                                  {column.label}
                                </th>
                              ))}
                              <th className="px-2 py-1.5 text-[9px] font-bold text-center min-w-[220px]">Detalle error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInvoices.map((inv, index) => {
                              const result = localStatuses.get(inv.id) || { status: "reported", error_detail: "" }
                              const checked = selectedInvoiceIds.has(inv.id)
                              return (
                                <tr
                                  key={inv.id}
                                  className={cn(
                                    "border-b border-border/50 hover:bg-blue-50/40 transition-colors",
                                    index % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                                  )}
                                >
                                  <td className="px-1.5 py-0.5 border-r border-border/30 sticky left-0 bg-inherit z-[5]">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(value) => toggleInvoiceSelection(inv.id, !!value)}
                                      className="size-3.5"
                                    />
                                  </td>
                                  <td className="px-1.5 py-0.5 text-[10px] text-center text-muted-foreground border-r border-border/30 sticky left-8 bg-inherit z-[5] font-mono">
                                    {index + 1}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-border/20">
                                    <select
                                      value={result.status}
                                      onChange={(event) => setInvoiceLocalStatus(inv.id, event.target.value)}
                                      className={cn(
                                        "h-6 text-[10px] rounded border px-1.5 py-0 font-medium w-full bg-transparent",
                                        result.status === "reported" ? "text-emerald-600 border-emerald-200" :
                                        result.status === "error" ? "text-red-600 border-red-200" :
                                        "text-slate-600 border-slate-200",
                                      )}
                                    >
                                      {INVOICE_STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  {reportColumns.map((column) => (
                                    <td
                                      key={column.key}
                                      className="px-2 py-0.5 text-[11px] border-r border-border/20 font-mono"
                                      title={snapshotCellValue(inv.report_snapshot?.[column.key]) || "—"}
                                    >
                                      {snapshotCellValue(inv.report_snapshot?.[column.key]) || "—"}
                                    </td>
                                  ))}
                                  <td className="px-2 py-0.5 text-[11px]">
                                    {result.status === "error" ? (
                                      <Input
                                        value={result.error_detail}
                                        onChange={(event) => setInvoiceLocalErrorDetail(inv.id, event.target.value)}
                                        placeholder="Detalle del error..."
                                        className="h-6 text-[10px] w-full"
                                      />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/80">
                        <TableRow>
                          <TableHead className="px-3 py-2 text-[10px] uppercase tracking-wider w-10">
                            <Checkbox
                              checked={selectedVisibleCount > 0 && selectedVisibleCount === filteredInvoices.length}
                              onCheckedChange={(checked) => toggleVisibleSelection(!!checked)}
                              className="size-3.5"
                            />
                          </TableHead>
                          <TableHead className="px-3 py-2 text-[10px] uppercase tracking-wider w-28">Estado</TableHead>
                          {reportColumns.map((column) => (
                            <TableHead key={column.key} className="px-3 py-2 text-[10px] uppercase tracking-wider min-w-[130px]">
                              {column.label}
                            </TableHead>
                          ))}
                          <TableHead className="px-3 py-2 text-[10px] uppercase tracking-wider">Detalle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map(inv => {
                          const result = localStatuses.get(inv.id) || { status: "reported", error_detail: "" }
                          return (
                            <TableRow key={inv.id} className="border-b border-border transition-colors hover:bg-muted/50">
                              <TableCell className="px-3 py-2">
                                <Checkbox
                                  checked={selectedInvoiceIds.has(inv.id)}
                                  onCheckedChange={(checked) => toggleInvoiceSelection(inv.id, !!checked)}
                                  className="size-3.5"
                                />
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <select
                                  value={result.status}
                                  onChange={e => setInvoiceLocalStatus(inv.id, e.target.value)}
                                  className={cn(
                                    "h-6 text-[10px] rounded border px-1.5 py-0 font-medium cursor-pointer appearance-none bg-transparent",
                                    result.status === "reported" ? "text-emerald-600 border-emerald-200" :
                                    result.status === "error" ? "text-red-600 border-red-200" :
                                    "text-slate-600 border-slate-200"
                                  )}
                                >
                                  {INVOICE_STATUS_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </TableCell>
                              {reportColumns.map((column) => (
                                <TableCell
                                  key={column.key}
                                  className="px-3 py-2 text-xs font-mono max-w-[220px] truncate"
                                  title={snapshotCellValue(inv.report_snapshot?.[column.key]) || ""}
                                >
                                  {snapshotCellValue(inv.report_snapshot?.[column.key]) || "—"}
                                </TableCell>
                              ))}
                              <TableCell className="px-3 py-2 text-[10px] max-w-[300px]">
                                {result.status === "error" ? (
                                  <Input
                                    value={result.error_detail}
                                    onChange={e => setInvoiceLocalErrorDetail(inv.id, e.target.value)}
                                    placeholder="Detalle del error..."
                                    className="h-6 text-[10px] w-full"
                                  />
                                ) : result.status === "excluded" ? (
                                  <span className="text-slate-400">Excluido</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
                <div className="flex items-center gap-2 mr-auto">
                  {detail.status === "pending_confirm" && (
                    <Button size="sm" className="h-8 text-xs" onClick={() => { setConfirming(detail.id); setDetailOpen(false); }}>
                      <CheckCircle2 className="size-3 mr-1" />
                      Confirmar envío
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {localDirty && (
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={handleSaveStatuses}
                      disabled={savingStatuses}
                    >
                      {savingStatuses ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
                      {savingStatuses ? "Guardando..." : "Guardar cambios"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setDetailOpen(false); setDetail(null); }}>
                    Cerrar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Alert */}
      <AlertDialog open={!!confirming} onOpenChange={o => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Confirmar envío
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-3">
              <p>
                ¿Confirmas que este reporte fue <strong>aceptado correctamente</strong> por la DGII?
              </p>
              <p className="text-muted-foreground">
                Todas las facturas de este envío quedarán marcadas como reportadas y no aparecerán en futuros reportes.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" disabled={confirmBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleConfirm(confirming!)}
              disabled={confirmBusy}
              className="h-8 text-xs gap-1.5"
            >
              {confirmBusy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              {confirmBusy ? "Confirmando..." : "Sí, confirmar envío"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark as uploaded Alert */}
      <AlertDialog open={!!uploadTarget} onOpenChange={o => { if (!o) setUploadTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <SendIcon className="size-4 text-sky-500" />
              Marcar como subido
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-3">
              <p>
                ¿Ya subiste este reporte al portal de la DGII?
              </p>
              <p className="text-muted-foreground">
                El envío pasará a estado &ldquo;pendiente de confirmar&rdquo;. Luego podrás reportar resultados por factura o confirmar directamente si todo fue aceptado.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" disabled={uploadBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleMarkUploaded(uploadTarget!)}
              disabled={uploadBusy}
              className="h-8 text-xs gap-1.5"
            >
              {uploadBusy ? <Loader2 className="size-3 animate-spin" /> : <SendIcon className="size-3" />}
              {uploadBusy ? "Guardando..." : "Sí, marcar como subido"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="size-4 text-red-500" />
              Eliminar envío
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-3">
              <p>
                Esto desmarcará todas las facturas de este envío como <strong>no reportadas</strong>.
                Volverán a aparecer como pendientes en futuros reportes.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <p className="text-[11px] flex items-center gap-1.5">
                  <Info className="size-3.5" />
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs" disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteTarget!)}
              disabled={deleteBusy}
              className="h-8 text-xs bg-red-600 hover:bg-red-700 gap-1.5"
            >
              {deleteBusy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              {deleteBusy ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
