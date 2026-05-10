"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileCode2,
  FileType,
  FileText,
  Receipt,
  BookOpen,
  Building2,
  Box,
  Calculator,
  Braces,
  Table2,
  Search,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Mail,
  Check,
  Clock,
  RefreshCw,
  Ban,
  DownloadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ExportFormatId =
  | "csv"
  | "dgii_606"
  | "quickbooks"
  | "xero"
  | "odoo"
  | "contaplus"
  | "json"
  | "excel";

interface FormatBrand {
  id: ExportFormatId;
  name: string;
  description: string;
  extension: string;
  icon: React.ReactNode;
  bg: string;
  fg: string;
}

const FORMATS: FormatBrand[] = [
  {
    id: "csv",
    name: "CSV",
    description: "Importación genérica",
    extension: ".csv",
    icon: <FileSpreadsheet className="size-4" />,
    bg: "bg-sky-100 text-sky-700",
    fg: "group-hover:border-sky-300",
  },
  {
    id: "dgii_606",
    name: "DGII 606",
    description: "Formato oficial compras",
    extension: ".csv",
    icon: <FileText className="size-4" />,
    bg: "bg-indigo-100 text-indigo-700",
    fg: "group-hover:border-indigo-300",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Archivo Bills (IIF)",
    extension: ".iif",
    icon: <Receipt className="size-4" />,
    bg: "bg-emerald-100 text-emerald-700",
    fg: "group-hover:border-emerald-300",
  },
  {
    id: "xero",
    name: "Xero",
    description: "CSV compatible",
    extension: ".csv",
    icon: <BookOpen className="size-4" />,
    bg: "bg-cyan-100 text-cyan-700",
    fg: "group-hover:border-cyan-300",
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "Estructura importación",
    extension: ".csv",
    icon: <Box className="size-4" />,
    bg: "bg-violet-100 text-violet-700",
    fg: "group-hover:border-violet-300",
  },
  {
    id: "contaplus",
    name: "Contaplus",
    description: "Formato español",
    extension: ".csv",
    icon: <Calculator className="size-4" />,
    bg: "bg-slate-100 text-slate-700",
    fg: "group-hover:border-slate-300",
  },
  {
    id: "json",
    name: "JSON",
    description: "Integraciones custom",
    extension: ".json",
    icon: <Braces className="size-4" />,
    bg: "bg-amber-100 text-amber-700",
    fg: "group-hover:border-amber-300",
  },
  {
    id: "excel",
    name: "Excel",
    description: "Plantilla XLSX",
    extension: ".xlsx",
    icon: <FileType className="size-4" />,
    bg: "bg-green-100 text-green-700",
    fg: "group-hover:border-green-300",
  },
];

type ExportStatus = "completado" | "en_curso" | "fallido";

interface ExportRecord {
  id: string;
  date: string;
  format: string;
  records: number;
  status: ExportStatus;
}

const HISTORY: ExportRecord[] = [
  { id: "1", date: "08/05/2026 14:32", format: "CSV", records: 47, status: "completado" },
  { id: "2", date: "07/05/2026 09:15", format: "DGII 606", records: 123, status: "completado" },
  { id: "3", date: "06/05/2026 16:40", format: "Excel", records: 89, status: "completado" },
  { id: "4", date: "05/05/2026 11:20", format: "JSON", records: 12, status: "fallido" },
  { id: "5", date: "04/05/2026 08:00", format: "QuickBooks", records: 256, status: "completado" },
];

const STATUS_STYLES: Record<ExportStatus, string> = {
  completado: "bg-emerald-500/10 text-emerald-600",
  en_curso: "bg-amber-500/10 text-amber-600",
  fallido: "bg-destructive/10 text-destructive",
};

const STATUS_ICONS: Record<ExportStatus, React.ReactNode> = {
  completado: <Check className="size-3" />,
  en_curso: <RefreshCw className="size-3 animate-spin" />,
  fallido: <Ban className="size-3" />,
};

const COLUMNS = [
  { id: "fecha", label: "Fecha" },
  { id: "ncf", label: "NCF" },
  { id: "proveedor", label: "Proveedor" },
  { id: "rnc", label: "RNC" },
  { id: "monto", label: "Monto" },
  { id: "categoria", label: "Categoría" },
  { id: "tipo", label: "Tipo" },
  { id: "estado", label: "Estado" },
  { id: "notas", label: "Notas" },
];

export function ExportsPage() {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState(COLUMNS.map((c) => c.id));
  const [email, setEmail] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sent, setSent] = useState(false);

  const activeFormat = FORMATS.find((f) => f.id === selectedFormat);

  function toggleColumn(colId: string) {
    setSelectedColumns((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  }

  async function handleDownload() {
    if (!selectedFormat) return;
    setExporting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setExporting(false);
  }

  async function handleSendEmail() {
    if (!selectedFormat || !email) return;
    setExporting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setExporting(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  const statusBadge = (status: ExportStatus) => (
    <Badge className={cn("gap-1 px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[status])}>
      {STATUS_ICONS[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Exportaciones</CardTitle>
            <p className="text-xs text-muted-foreground">
              Exporta datos contables en múltiples formatos compatibles con los principales sistemas.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-[10px]">
            <Clock className="size-3" />
            Última: 08/05/2026
          </Badge>
        </CardHeader>
      </Card>

      {/* Format Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <DownloadCloud className="size-3.5 text-muted-foreground" />
            Formato de exportación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                  selectedFormat === fmt.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                    fmt.bg
                  )}
                >
                  {fmt.icon}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium">{fmt.name}</span>
                  <span className="truncate text-[10px] leading-tight text-muted-foreground">
                    {fmt.description}
                  </span>
                  <span className="mt-0.5 text-[9px] text-muted-foreground/50">{fmt.extension}</span>
                </div>
                {selectedFormat === fmt.id && (
                  <Check className="absolute right-2 top-2 size-3 text-primary" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters + Columns + Actions */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Filters */}
        <Card className="lg:col-span-1">
          <CardHeader
            className="cursor-pointer pb-3"
            onClick={() => setShowFilters(!showFilters)}
          >
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                Filtros
              </span>
              {showFilters ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
          {showFilters && (
            <CardContent className="flex flex-col gap-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Desde
                  </Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Hasta
                  </Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Proveedor
                </Label>
                <Input
                  placeholder="Buscar proveedor..."
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Categoría
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="Viajes">Viajes</SelectItem>
                    <SelectItem value="Oficina">Oficina</SelectItem>
                    <SelectItem value="Software">Software</SelectItem>
                    <SelectItem value="Servicios">Servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Table2 className="size-3.5 text-muted-foreground" />
                Columnas
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground"
                  onClick={() => setSelectedColumns(COLUMNS.map((c) => c.id))}
                >
                  Todo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground"
                  onClick={() => setSelectedColumns([])}
                >
                  Ninguno
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {COLUMNS.map((col) => (
                <label
                  key={col.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedColumns.includes(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                    className="size-3.5"
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Download className="size-3.5 text-muted-foreground" />
              Acción
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            <Button
              disabled={!selectedFormat || exporting}
              onClick={() => void handleDownload()}
              className="w-full shadow-button"
            >
              <Download className="size-4" data-icon="inline-start" />
              {exporting ? "Exportando..." : "Descargar"}
            </Button>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="enviar@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-7 pl-8 text-xs"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={!selectedFormat || !email || exporting}
              onClick={() => void handleSendEmail()}
            >
              {exporting ? "Enviando..." : sent ? "¡Enviado!" : "Enviar por correo"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Active export summary bar */}
      {activeFormat && (
        <Card>
          <CardContent className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Exportación activa:</span>
              <div className={cn("flex size-5 items-center justify-center rounded", activeFormat.bg)}>
                {activeFormat.icon}
              </div>
              <span className="font-medium text-foreground">{activeFormat.name}</span>
              <span className="text-muted-foreground/40">|</span>
              <span>{selectedColumns.length} de {COLUMNS.length} columnas</span>
              <span className="text-muted-foreground/40">|</span>
              <span>
                {dateFrom || dateTo
                  ? `${dateFrom || "—"} → ${dateTo || "—"}`
                  : "Sin filtro de fecha"}
              </span>
              {vendor && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <span>Proveedor: {vendor}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-3.5 text-muted-foreground" />
            Historial de exportaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table className="min-w-full text-xs">
              <TableHeader className="bg-muted/80">
                <TableRow>
                  <TableHead className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Fecha
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Formato
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Registros
                  </TableHead>
                  <TableHead className="px-3 py-3 text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Estado
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Acción
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {HISTORY.map((row, idx) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-primary/5",
                      idx % 2 === 1 && "bg-muted/30"
                    )}
                  >
                    <TableCell className="px-4 py-3 text-muted-foreground">{row.date}</TableCell>
                    <TableCell className="px-3 py-3 font-medium text-foreground">{row.format}</TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-foreground">
                      {row.records.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center">{statusBadge(row.status)}</TableCell>
                    <TableCell className="px-3 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]">
                        <Download className="mr-1 size-3" />
                        Descargar
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
  );
}
