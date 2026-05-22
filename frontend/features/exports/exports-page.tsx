"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Download, FileSpreadsheet, FileType,
  Receipt, BookOpen, Box, Calculator, Braces,
  SlidersHorizontal, Mail, Check,
  DownloadCloud, Plus, Globe, Radio, Save, Zap, Settings2,
  Table2, Layers, Plug, Trash2, RefreshCw, CheckSquare, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listInvoices } from "@/lib/api/invoices"
import { exportInvoices } from "@/lib/api/invoices"
import { triggerBlobDownload } from "@/lib/api/dgii"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Invoice } from "@/lib/types"
import { QuickBooksIcon, XeroIcon, OdooIcon, SageIcon } from "@/components/brand-icons"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  listConnections, deleteConnection, testSavedConnection, pushToOdoo,
} from "@/lib/api/odoo"
import type { OdooConnection, OdooTestResult, OdooPushResult } from "@/lib/api/odoo"
import {
  getQuickBooksAuthUrl, listQuickBooksConnections, deleteQuickBooksConnection,
  testQuickBooksConnection, refreshQuickBooksToken, pushToQuickBooks,
} from "@/lib/api/quickbooks"
import type { QuickBooksConnection, QuickBooksTestResult, QuickBooksPushResult } from "@/lib/api/quickbooks"
import { toast } from "sonner"

function openQbPopup() {
  getQuickBooksAuthUrl().then(({ url }) => {
    const popup = window.open(url, "quickbooks-oauth", "width=600,height=700,scrollbars=yes");
    if (!popup) { toast.error("Permite ventanas emergentes para conectar QuickBooks"); return; }

    let resolved = false;
    const done = () => { resolved = true; window.removeEventListener("message", handler); clearInterval(timer); if (popup && !popup.closed) popup.close(); };

    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "qb-oauth") return;
      done();
      if (e.data.status === "connected") { toast.success("QuickBooks conectado"); }
      else { toast.error("Error al conectar", { description: e.data.detail || "Error desconocido" }); }
    };
    window.addEventListener("message", handler);

    const timer = setInterval(() => {
      if (popup.closed && !resolved) {
        done();
        toast.error("Conexión cancelada", { description: "Cerraste la ventana de QuickBooks sin completar la autenticación" });
      }
    }, 500);
  }).catch((e: any) => toast.error("Error al iniciar conexión", { description: e.message }));
}

type ExportFormatId =
  | "csv" | "quickbooks" | "xero" | "odoo" | "contaplus" | "json" | "excel"

type TabId = "export" | "mappings" | "profiles" | "webhooks"

interface FormatBrand {
  id: ExportFormatId
  name: string
  description: string
  extension: string
  icon: React.ReactNode
  bg: string
}

const FORMATS: FormatBrand[] = [
  { id: "csv", name: "CSV", description: "Importación genérica", extension: ".csv", icon: <FileSpreadsheet className="size-4" />, bg: "bg-sky-100 text-sky-700" },
  { id: "quickbooks", name: "QuickBooks", description: "Archivo Bills", extension: ".csv", icon: <QuickBooksIcon className="size-4" />, bg: "bg-emerald-100 text-emerald-700" },
  { id: "xero", name: "Xero", description: "CSV compatible", extension: ".csv", icon: <XeroIcon className="size-4" />, bg: "bg-cyan-100 text-cyan-700" },
  { id: "odoo", name: "Odoo", description: "Vendor Bills", extension: ".csv", icon: <OdooIcon className="size-4" />, bg: "bg-violet-100 text-violet-700" },
  { id: "contaplus", name: "Contaplus", description: "Formato español", extension: ".csv", icon: <SageIcon className="size-4" />, bg: "bg-slate-100 text-slate-700" },
  { id: "json", name: "JSON", description: "Integraciones custom", extension: ".json", icon: <Braces className="size-4" />, bg: "bg-amber-100 text-amber-700" },
  { id: "excel", name: "Excel", description: "Plantilla XLSX", extension: ".xlsx", icon: <FileType className="size-4" />, bg: "bg-green-100 text-green-700" },
]

const COLUMNS = [
  { id: "id", label: "ID" },
  { id: "rnc", label: "RNC/Cédula" },
  { id: "proveedor", label: "Proveedor" },
  { id: "ncf", label: "NCF" },
  { id: "fecha", label: "Fecha" },
  { id: "tipo_bienes", label: "Tipo (B/S)" },
  { id: "monto_servicios", label: "Servicios" },
  { id: "monto_bienes", label: "Bienes" },
  { id: "total", label: "Total" },
  { id: "itbis", label: "ITBIS" },
  { id: "itbis_retenido", label: "ITBIS Ret." },
  { id: "isr_retenido", label: "ISR Ret." },
  { id: "forma_pago", label: "Forma Pago" },
  { id: "estado", label: "Estado" },
]

const WEBHOOK_EVENTS = [
  "invoice.created", "invoice.processed", "invoice.updated", "invoice.deleted",
  "invoice.cancelled", "export.completed", "dgii.submitted", "batch.completed",
]

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "export", label: "Exportar", icon: DownloadCloud },
  { id: "mappings", label: "Mapeos", icon: Globe },
  { id: "profiles", label: "Perfiles", icon: Save },
  { id: "webhooks", label: "Webhooks", icon: Radio },
]

export function ExportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("export")
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [vendor, setVendor] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [selectedColumns, setSelectedColumns] = useState(COLUMNS.map((c) => c.id))
  const [email, setEmail] = useState("")
  const [exporting, setExporting] = useState(false)
  const [sent, setSent] = useState(false)

  // Odoo connection state
  const [connections, setConnections] = useState<OdooConnection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState("")
  const [testResult, setTestResult] = useState<OdooTestResult | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<OdooPushResult | null>(null)
  const [confirmExport, setConfirmExport] = useState<{count: number; action: 'download' | 'odoo' | 'quickbooks'} | null>(null)

  // QuickBooks connection state
  const [qbConnections, setQbConnections] = useState<QuickBooksConnection[]>([])
  const [qbSelectedId, setQbSelectedId] = useState("")
  const [qbPushing, setQbPushing] = useState(false)
  const [qbPushResult, setQbPushResult] = useState<QuickBooksPushResult | null>(null)
  const [qbTestResult, setQbTestResult] = useState<QuickBooksTestResult | null>(null)

  const activeFormat = FORMATS.find((f) => f.id === selectedFormat)

  // Invoice preview state
  const [previewInvoices, setPreviewInvoices] = useState<Invoice[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [prevCount, setPrevCount] = useState(0)

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true)
    try {
      const res = await listInvoices({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        vendor_search: vendor || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        processed: "true",
      })
      setPreviewInvoices(res.invoices)
      if (res.total !== prevCount) {
        setPrevCount(res.total)
        setSelectedIds(new Set())
      }
    } catch { /* silent */ }
    finally { setLoadingPreview(false) }
  }, [dateFrom, dateTo, vendor, categoryFilter, prevCount])

  useEffect(() => {
    if (activeTab === "export") loadPreview()
  }, [activeTab, loadPreview])

  const loadConnections = useCallback(async () => {
    try {
      const list = await listConnections()
      setConnections(list)
      if (list.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(list[0].id)
      }
    } catch { /* silent */ }
  }, [selectedConnectionId])

  useEffect(() => { loadConnections() }, [loadConnections])

  const loadQbConnections = useCallback(async () => {
    try {
      const list = await listQuickBooksConnections()
      setQbConnections(list)
      if (list.length > 0 && !qbSelectedId) {
        setQbSelectedId(list[0].id)
      }
    } catch { /* silent */ }
  }, [qbSelectedId])

  useEffect(() => { loadQbConnections() }, [loadQbConnections])

  function toggleColumn(colId: string) {
    setSelectedColumns((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    )
  }

  async function handleDownload() {
    if (!selectedFormat) return
    if (selectedIds.size === 0 && previewInvoices.length > 10) {
      setConfirmExport({ count: previewInvoices.length, action: 'download' })
      return
    }
    setExporting(true)
    try {
      const FORMAT_MAP: Record<string, string> = {
        csv: "csv", quickbooks: "quickbooks", xero: "xero",
        odoo: "odoo", contaplus: "contaplus", json: "json", excel: "excel",
      }
      const backendFormat = FORMAT_MAP[selectedFormat] || selectedFormat
      const invoiceIds = selectedIds.size > 0 ? Array.from(selectedIds) : previewInvoices.map(i => i.id)
      const blob = await exportInvoices(backendFormat, invoiceIds, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        vendor_search: vendor || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      })
      const ext = selectedFormat === "excel" ? ".xlsx" : selectedFormat === "json" ? ".json" : ".csv"
      triggerBlobDownload(blob, `export_${selectedFormat}_${new Date().toISOString().slice(0, 10)}${ext}`)
    } catch (e: any) {
      console.error("Export error:", e)
      toast.error("Error al exportar", { description: e.message || "Error desconocido" })
    } finally {
      setExporting(false)
    }
  }

  async function doConfirmedExport() {
    if (!confirmExport) return
    setConfirmExport(null)
    if (confirmExport.action === 'odoo') {
      if (!selectedConnectionId) return
      console.log("doConfirmedExport[odoo]: previewInvoices.length=%d, ids=%s",
        previewInvoices.length, JSON.stringify(previewInvoices.map(i => i.id)))
      setPushing(true)
      setPushResult(null)
      try {
        const ids = previewInvoices.map(i => i.id)
        const r = await pushToOdoo(selectedConnectionId, ids)
        setPushResult(r)
        if (r.failed === 0) {
          toast.success(`${r.success} facturas enviadas a Odoo`)
        } else {
          toast.warning(`${r.success} enviadas, ${r.failed} fallaron`, {
            description: r.results.find(x => !x.success)?.error || "Revisa los detalles abajo",
          })
        }
      } catch (e: any) {
        setPushResult({ total: 0, success: 0, failed: 1, results: [{ invoice_id: "", invoice_number: null, success: false, error: e.message }] })
        toast.error("Error al enviar a Odoo", { description: e.message })
      } finally { setPushing(false) }
    } else if (confirmExport.action === 'quickbooks') {
      if (!qbSelectedId) return
      setQbPushing(true)
      setQbPushResult(null)
      try {
        const ids = previewInvoices.map(i => i.id)
        const r = await pushToQuickBooks(qbSelectedId, ids)
        setQbPushResult(r)
        if (r.failed === 0) {
          toast.success(`${r.success} facturas enviadas a QuickBooks`)
        } else {
          toast.warning(`${r.success} enviadas, ${r.failed} fallaron`, {
            description: r.results.find(x => !x.success)?.error || "Revisa los detalles abajo",
          })
        }
      } catch (e: any) {
        setQbPushResult({ total: 0, success: 0, failed: 1, results: [{ invoice_id: "", invoice_number: null, success: false, error: e.message }] })
        toast.error("Error al enviar a QuickBooks", { description: e.message })
      } finally { setQbPushing(false) }
    } else {
      setExporting(true)
      try {
        const FORMAT_MAP: Record<string, string> = {
          csv: "csv", quickbooks: "quickbooks", xero: "xero",
          odoo: "odoo", contaplus: "contaplus", json: "json", excel: "excel",
        }
        const backendFormat = FORMAT_MAP[selectedFormat!] || selectedFormat!
        const invoiceIds = previewInvoices.map(i => i.id)
        const blob = await exportInvoices(backendFormat, invoiceIds, {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          vendor_search: vendor || undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
        })
        const ext = selectedFormat === "excel" ? ".xlsx" : selectedFormat === "json" ? ".json" : ".csv"
        triggerBlobDownload(blob, `export_${selectedFormat}_${new Date().toISOString().slice(0, 10)}${ext}`)
      } catch (e: any) {
        console.error("Export error:", e)
        toast.error("Error al exportar", { description: e.message || "Error desconocido" })
      } finally { setExporting(false) }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 size-7">
              <Layers className="size-3.5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Exportaciones</h1>
          </div>
          <p className="text-xs text-muted-foreground">Exporta facturas a tus sistemas contables</p>
        </div>
        {selectedFormat && (
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-[10px] shrink-0">
            <div className={cn("size-2 rounded-full", activeFormat?.bg.replace("bg-", "bg-").split(" ")[0])} />
            {activeFormat?.name}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Export Tab ── */}
      {activeTab === "export" && (
        <>
          {/* Format cards */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all",
                  selectedFormat === fmt.id
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                )}
              >
                <div className={cn("flex items-center justify-center rounded size-8", fmt.bg)}>
                  {fmt.icon}
                </div>
                <span className="text-xs font-medium leading-tight">{fmt.name}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{fmt.description}</span>
              </button>
            ))}
          </div>

          {activeFormat && (
            <>
              {/* Active format summary */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <div className={cn("flex items-center justify-center rounded size-8", activeFormat.bg)}>
                    {activeFormat.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {activeFormat.name === "Odoo" ? "Push directo a Odoo" :
                       activeFormat.name === "QuickBooks" ? "Push directo a QuickBooks" :
                       `Exportar como ${activeFormat.name}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedColumns.length} columnas
                      {(dateFrom || dateTo) && ` · ${dateFrom || "…"} → ${dateTo || "…"}`}
                      {vendor && ` · "${vendor}"`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs shrink-0 gap-1"
                  disabled={exporting || previewInvoices.length === 0}
                  onClick={handleDownload}
                >
                  <Download className="size-3" />
                  {exporting ? "Exportando..." :
                   selectedFormat === "odoo" ? "Descargar CSV para Odoo" :
                   selectedFormat === "quickbooks" ? "Descargar CSV para QuickBooks" :
                   "Descargar archivo"}
                </Button>
              </div>

              {/* Filters + email row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">Desde</Label>
                    <Input
                      type="date" value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-7 text-xs w-32"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">Hasta</Label>
                    <Input
                      type="date" value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-7 text-xs w-32"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">Proveedor</Label>
                    <Input
                      placeholder="Buscar proveedor..."
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="h-7 text-xs w-40"
                    />
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={loadPreview} disabled={loadingPreview}>
                    {loadingPreview ? "Cargando..." : "Buscar"}
                  </Button>
                </div>

              </div>

              {/* Columns selector */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground mr-1">Columnas:</span>
                {COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => toggleColumn(col.id)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] border transition-colors",
                      selectedColumns.includes(col.id)
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "text-muted-foreground border-border hover:border-muted-foreground/30"
                    )}
                  >
                    {col.label}
                  </button>
                ))}
              </div>

              {/* Invoice Preview table */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Vista previa
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      ({previewInvoices.length} facturas)
                    </span>
                  </CardTitle>
                  {previewInvoices.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.size === previewInvoices.length}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(new Set(previewInvoices.map(i => i.id)))
                          else setSelectedIds(new Set())
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {selectedIds.size > 0 ? `${selectedIds.size} seleccionadas` : "Seleccionar todas"}
                      </span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 overflow-x-auto">
                  {loadingPreview ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left font-medium py-2 pr-2 w-8" />
                          <th className="text-left font-medium py-2 pr-2">RNC</th>
                          <th className="text-left font-medium py-2 pr-2">Proveedor</th>
                          <th className="text-left font-medium py-2 pr-2">NCF</th>
                          <th className="text-left font-medium py-2 pr-2">Fecha</th>
                          <th className="text-right font-medium py-2 pr-2">Total</th>
                          <th className="text-right font-medium py-2 pr-2">ITBIS</th>
                          <th className="text-left font-medium py-2 pr-2">Categoría</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 pr-2"><Skeleton className="size-4 rounded" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-32 rounded" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-28 rounded" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-20 rounded" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-16 rounded ml-auto" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-3.5 w-14 rounded ml-auto" /></td>
                            <td className="py-2 pr-2"><Skeleton className="h-4 w-16 rounded" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : previewInvoices.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                      No hay facturas procesadas para exportar
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left font-medium py-2 pr-2 w-8">
                            <Checkbox
                              checked={selectedIds.size === previewInvoices.length}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedIds(new Set(previewInvoices.map(i => i.id)))
                                else setSelectedIds(new Set())
                              }}
                            />
                          </th>
                          <th className="text-left font-medium py-2 pr-2">RNC</th>
                          <th className="text-left font-medium py-2 pr-2">Proveedor</th>
                          <th className="text-left font-medium py-2 pr-2">NCF</th>
                          <th className="text-left font-medium py-2 pr-2">Fecha</th>
                          <th className="text-right font-medium py-2 pr-2">Total</th>
                          <th className="text-right font-medium py-2 pr-2">ITBIS</th>
                          <th className="text-left font-medium py-2 pr-2">Categoría</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewInvoices.map((inv) => {
                          const checked = selectedIds.has(inv.id)
                          return (
                            <tr
                              key={inv.id}
                              className={cn(
                                "border-b last:border-0 cursor-pointer transition-colors",
                                checked ? "bg-primary/5" : "hover:bg-muted/50"
                              )}
                              onClick={() => {
                                const next = new Set(selectedIds)
                                if (checked) next.delete(inv.id)
                                else next.add(inv.id)
                                setSelectedIds(next)
                              }}
                            >
                              <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={checked} onCheckedChange={() => {
                                  const next = new Set(selectedIds)
                                  if (checked) next.delete(inv.id)
                                  else next.add(inv.id)
                                  setSelectedIds(next)
                                }} />
                              </td>
                              <td className="py-1.5 pr-2 font-mono">{inv.vendor_tax_id || "—"}</td>
                              <td className="py-1.5 pr-2 font-medium truncate max-w-[140px]">{inv.vendor_name || "—"}</td>
                              <td className="py-1.5 pr-2 font-mono">{inv.invoice_number || "—"}</td>
                              <td className="py-1.5 pr-2 whitespace-nowrap">{inv.invoice_date ? inv.invoice_date.slice(0, 10) : "—"}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{(inv.total_amount ?? 0).toFixed(2)}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{(inv.tax_amount ?? 0).toFixed(2)}</td>
                              <td className="py-1.5 pr-2">
                                <Badge variant="outline" className="text-[10px]">{inv.category || "—"}</Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              {/* Odoo Push card */}
              {selectedFormat === "odoo" && (
                <Card className="border-violet-200/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center rounded bg-violet-100 text-violet-700 size-6">
                          <OdooIcon className="size-3.5" />
                        </div>
                        <CardTitle className="text-sm">Push directo a Odoo</CardTitle>
                      </div>
                      {pushResult && (
                        <Badge className={pushResult.failed === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                          {pushResult.success} enviadas
                          {pushResult.failed > 0 && ` · ${pushResult.failed} fallidas`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Envía facturas seleccionadas como Vendor Bills a Odoo vía XML-RPC
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {connections.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <select
                            className="flex-1 h-7 text-xs rounded border bg-background px-2"
                            value={selectedConnectionId}
                            onChange={(e) => setSelectedConnectionId(e.target.value)}
                          >
                            {connections.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}{c.last_error ? " ⚠️" : ""}</option>
                            ))}
                          </select>
                          <Button
                            variant="ghost" size="icon-sm" className="size-7 shrink-0"
                            onClick={async () => {
                              if (!selectedConnectionId) return
                              setTestResult(null)
                              try {
                                const r = await testSavedConnection(selectedConnectionId)
                                setTestResult(r)
                                if (r.ok) toast.success(`Conexión exitosa · ${r.server_series || r.server_version || "Odoo"}`)
                                else toast.error("Error de conexión", { description: r.error })
                              } catch { setTestResult({ ok: false, error: "Error de conexión" }); toast.error("No se pudo conectar con Odoo") }
                            }}
                          >
                            <RefreshCw className="size-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm" className="size-7 shrink-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!selectedConnectionId) return
                              try {
                                await deleteConnection(selectedConnectionId)
                                setSelectedConnectionId("")
                                loadConnections()
                                toast.success("Conexión eliminada")
                              } catch (e: any) { toast.error("Error al eliminar", { description: e.message }) }
                            }}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>

                        {testResult && (
                          <div className={cn(
                            "px-3 py-2 rounded text-xs border",
                            testResult.ok
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            {testResult.ok
                              ? `✓ Conectado · ${testResult.server_series || testResult.server_version || "Odoo"}`
                              : `✗ ${testResult.error}`}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm" className="h-7 text-xs gap-1"
                            disabled={pushing}
                            onClick={async () => {
                              if (selectedIds.size === 0 && previewInvoices.length > 10) {
                                setConfirmExport({ count: previewInvoices.length, action: 'odoo' })
                                return
                              }
                              setPushing(true)
                              setPushResult(null)
                              try {
                                const ids = selectedIds.size > 0 ? Array.from(selectedIds) : previewInvoices.map(i => i.id)
                                const r = await pushToOdoo(selectedConnectionId, ids)
                                setPushResult(r)
                                if (r.failed === 0) toast.success(`${r.success} facturas enviadas a Odoo`)
                                else toast.warning(`${r.success} enviadas, ${r.failed} fallaron`, {
                                  description: r.results.find(x => !x.success)?.error || "Revisa los detalles abajo",
                                })
                              } catch (e: any) {
                                setPushResult({ total: 0, success: 0, failed: 1, results: [{ invoice_id: "", invoice_number: null, success: false, error: e.message }] })
                                toast.error("Error al enviar a Odoo", { description: e.message })
                              } finally { setPushing(false) }
                            }}
                          >
                            <OdooIcon className="size-3" />
                            {pushing ? "Enviando..." : "Push a Odoo"}
                          </Button>
                          <Link href="/dashboard/settings?section=integraciones">
                            <Button variant="outline" size="sm" className="h-7 text-xs cursor-pointer">
                              <Settings2 className="size-3" />
                              Gestionar conexiones
                            </Button>
                          </Link>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Conecta tu instancia de Odoo para enviar facturas directamente como Vendor Bills
                        </p>
                        <Link href="/dashboard/settings?section=integraciones">
                          <Button size="sm" className="h-7 text-xs shrink-0 gap-1 cursor-pointer">
                            <Settings2 className="size-3" />
                            Gestionar conexiones
                          </Button>
                        </Link>
                      </div>
                    )}

                    {pushResult && pushResult.results.length > 0 && (
                      <div className="text-xs space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                        {pushResult.results.map((r, i) => (
                          <div key={i} className={cn("flex items-center gap-2", r.success ? "text-green-600" : "text-red-600")}>
                            <span>{r.success ? "✓" : "✗"}</span>
                            <span className="font-medium">{r.invoice_number || r.invoice_id}</span>
                            {r.error && <span className="text-muted-foreground truncate">{r.error}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* QuickBooks Push card */}
              {selectedFormat === "quickbooks" && (
                <Card className="border-emerald-200/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center rounded bg-emerald-100 text-emerald-700 size-6">
                          <QuickBooksIcon className="size-3.5" />
                        </div>
                        <CardTitle className="text-sm">Push directo a QuickBooks</CardTitle>
                      </div>
                      {qbPushResult && (
                        <Badge className={qbPushResult.failed === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                          {qbPushResult.success} enviadas
                          {qbPushResult.failed > 0 && ` · ${qbPushResult.failed} fallidas`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Envía facturas seleccionadas como Bills a QuickBooks Online vía API
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {qbConnections.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-muted-foreground truncate">
                            {qbConnections[0].name}{qbConnections[0].last_error ? " ⚠️" : ""}
                          </div>
                          <Button
                            variant="ghost" size="icon-sm" className="size-7 shrink-0"
                            onClick={async () => {
                              if (!qbSelectedId) return
                              setQbTestResult(null)
                              try {
                                const r = await testQuickBooksConnection(qbSelectedId)
                                setQbTestResult(r)
                                if (r.ok) toast.success(`Conexión exitosa · ${r.company_name || "QuickBooks"}`)
                                else toast.error("Error de conexión", { description: r.error })
                              } catch { setQbTestResult({ ok: false, error: "Error de conexión" }); toast.error("No se pudo conectar con QuickBooks") }
                            }}
                          >
                            <RefreshCw className="size-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm" className="size-7 shrink-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!qbSelectedId) return
                              try {
                                await deleteQuickBooksConnection(qbSelectedId)
                                setQbSelectedId("")
                                loadQbConnections()
                                toast.success("Conexión eliminada")
                              } catch (e: any) { toast.error("Error al eliminar", { description: e.message }) }
                            }}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>

                        {qbTestResult && (
                          <div className={cn(
                            "px-3 py-2 rounded text-xs border",
                            qbTestResult.ok
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            {qbTestResult.ok
                              ? `✓ Conectado · ${qbTestResult.company_name || "QuickBooks"}`
                              : `✗ ${qbTestResult.error}`}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm" className="h-7 text-xs gap-1"
                            disabled={qbPushing}
                            onClick={async () => {
                              if (!qbSelectedId) return
                              if (selectedIds.size === 0 && previewInvoices.length > 10) {
                                setConfirmExport({ count: previewInvoices.length, action: 'quickbooks' })
                                return
                              }
                              setQbPushing(true)
                              setQbPushResult(null)
                              try {
                                const ids = selectedIds.size > 0 ? Array.from(selectedIds) : previewInvoices.map(i => i.id)
                                const r = await pushToQuickBooks(qbSelectedId, ids)
                                setQbPushResult(r)
                                if (r.failed === 0) toast.success(`${r.success} facturas enviadas a QuickBooks`)
                                else toast.warning(`${r.success} enviadas, ${r.failed} fallaron`, {
                                  description: r.results.find(x => !x.success)?.error || "Revisa los detalles abajo",
                                })
                              } catch (e: any) {
                                setQbPushResult({ total: 0, success: 0, failed: 1, results: [{ invoice_id: "", invoice_number: null, success: false, error: e.message }] })
                                toast.error("Error al enviar a QuickBooks", { description: e.message })
                              } finally { setQbPushing(false) }
                            }}
                          >
                            <QuickBooksIcon className="size-3" />
                            {qbPushing ? "Enviando..." : "Push a QuickBooks"}
                          </Button>
                          <Button
                            variant="outline" size="sm" className="h-7 text-xs gap-1"
                            onClick={openQbPopup}
                          >
                            <RefreshCw className="size-3" />
                            Reconectar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Conecta tu cuenta de QuickBooks Online para enviar facturas directamente
                        </p>
                        <Button
                          size="sm" className="h-7 text-xs shrink-0 gap-1"
                          onClick={openQbPopup}
                        >
                          <QuickBooksIcon className="size-3" />
                          Conectar QuickBooks
                        </Button>
                      </div>
                    )}

                    {qbPushResult && qbPushResult.results.length > 0 && (
                      <div className="text-xs space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                        {qbPushResult.results.map((r, i) => (
                          <div key={i} className={cn("flex items-center gap-2", r.success ? "text-green-600" : "text-red-600")}>
                            <span>{r.success ? "✓" : "✗"}</span>
                            <span className="font-medium">{r.invoice_number || r.invoice_id}</span>
                            {r.quickbooks_bill_id && <span className="text-muted-foreground">→ ID QB: {r.quickbooks_bill_id}</span>}
                            {r.error && <span className="text-muted-foreground truncate">{r.error}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ── Mappings Tab ── */}
      {activeTab === "mappings" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm">Mapeo de cuentas</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Configura cómo se mapean las categorías a cuentas contables</p>
              </div>
              <Button size="sm" className="h-7 text-xs shrink-0">
                <Plus className="size-3.5" />
                Crear mapeo
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Globe className="size-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Sin mapeos configurados</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                  Los mapeos permiten asociar categorías de Fintral con cuentas contables de tu software
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Profiles Tab ── */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm">Perfiles de exportación</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Guarda configuraciones reutilizables</p>
              </div>
              <Button size="sm" className="h-7 text-xs shrink-0">
                <Plus className="size-3.5" />
                Nuevo perfil
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y divide-border">
                {([
                  { name: "QuickBooks Online Bills", letter: "Q", bg: "bg-emerald-100 text-emerald-700" },
                  { name: "Odoo Vendor Bills", letter: "O", bg: "bg-violet-100 text-violet-700" },
                  { name: "Xero Bills", letter: "X", bg: "bg-cyan-100 text-cyan-700" },
                  { name: "Contaplus/Sage Diario", letter: "C", bg: "bg-slate-100 text-slate-700" },
                ] as const).map((profile) => (
                  <div key={profile.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex size-8 items-center justify-center rounded-lg text-xs font-semibold", profile.bg)}>
                        {profile.letter}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{profile.name}</p>
                        <p className="text-[10px] text-muted-foreground">Preset · CSV</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Preset</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Webhooks Tab ── */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm">Webhooks</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Conecta con Zapier, n8n, Make</p>
              </div>
              <Button size="sm" className="h-7 text-xs shrink-0">
                <Plus className="size-3.5" />
                Crear webhook
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Radio className="size-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Sin webhooks configurados</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                  Los webhooks envían datos de facturas automáticamente a tus herramientas de automatización
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="size-3.5 text-muted-foreground" />
                Eventos disponibles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {WEBHOOK_EVENTS.map((evt) => (
                  <Badge key={evt} variant="outline" className="text-[10px] font-mono">
                    {evt}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmación exportar todo */}
      <AlertDialog open={!!confirmExport} onOpenChange={() => setConfirmExport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              <AlertDialogTitle>Exportar todas las facturas</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              No has seleccionado facturas específicas. Se exportarán <strong>{confirmExport?.count ?? 0}</strong> facturas del filtro actual.
              {confirmExport?.count && confirmExport.count > 200 && (
                <span className="block mt-1 text-amber-600 font-medium">
                  Son más de 200 facturas — esta operación puede tomar varios segundos.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirmedExport}>
              {confirmExport?.action === 'odoo' ? 'Enviar a Odoo' : confirmExport?.action === 'quickbooks' ? 'Enviar a QuickBooks' : 'Descargar todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
