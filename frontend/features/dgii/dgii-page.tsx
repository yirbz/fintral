"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Search,
  ArrowUpDown,
  ShieldCheck,
  Receipt,
  Banknote,
  Percent,
  Landmark,
  Info,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// ── Types ──────────────────────────────────────────

type ValidationStatus = "ok" | "warning" | "error" | "missing";

interface InvoiceRow {
  id: string;
  date: string;
  vendor: string;
  rnc: string;
  ncf: string;
  amount: number;
  itbis: number;
  goodsType: string;
  paymentMethod: string;
  status: ValidationStatus;
  issues: string[];
}

interface PeriodSummary {
  month: string;
  short: string;
  total: number;
  complete: number;
  warnings: number;
  errors: number;
}

// ── Mock Data ──────────────────────────────────────

const MONTHS: PeriodSummary[] = [
  { month: "Enero 2026", short: "Ene", total: 142, complete: 138, warnings: 3, errors: 1 },
  { month: "Febrero 2026", short: "Feb", total: 167, complete: 159, warnings: 6, errors: 2 },
  { month: "Marzo 2026", short: "Mar", total: 198, complete: 192, warnings: 4, errors: 2 },
  { month: "Abril 2026", short: "Abr", total: 183, complete: 177, warnings: 5, errors: 1 },
  { month: "Mayo 2026", short: "May", total: 156, complete: 148, warnings: 7, errors: 1 },
  { month: "Junio 2026", short: "Jun", total: 89, complete: 74, warnings: 11, errors: 4 },
];

const GOODS_TYPES = [
  { value: "01", label: "01 - Mercancías para la venta" },
  { value: "02", label: "02 - Materias primas" },
  { value: "03", label: "03 - Bienes de activo fijo" },
  { value: "04", label: "04 - Combustibles" },
  { value: "05", label: "05 - Papelería y útiles" },
  { value: "06", label: "06 - Gastos de personal" },
  { value: "07", label: "07 - Servicios" },
  { value: "08", label: "08 - Arrendamientos" },
  { value: "09", label: "09 - Gastos de representación" },
  { value: "10", label: "10 - Otras deducciones" },
  { value: "11", label: "11 - ITBIS sujeto a proporcionalidad" },
];

const PAYMENT_METHODS = [
  { value: "1", label: "01 - Efectivo" },
  { value: "2", label: "02 - Cheque" },
  { value: "3", label: "03 - Tarjeta crédito/débito" },
  { value: "4", label: "04 - Transferencia bancaria" },
  { value: "5", label: "05 - Nota de crédito" },
  { value: "6", label: "06 - Compensación" },
  { value: "7", label: "07 - Otra" },
];

function mockInvoices(period: string): InvoiceRow[] {
  const all: InvoiceRow[] = [
    {
      id: "1", date: "05/06/2026", vendor: "Servicios Tecnológicos DR, SRL", rnc: "131598765",
      ncf: "B0100000001", amount: 45000, itbis: 6885, goodsType: "07", paymentMethod: "4",
      status: "ok", issues: [],
    },
    {
      id: "2", date: "05/06/2026", vendor: "Oficina Más, SAS", rnc: "132345678",
      ncf: "B0100000045", amount: 12500, itbis: 1912.5, goodsType: "05", paymentMethod: "1",
      status: "ok", issues: [],
    },
    {
      id: "3", date: "04/06/2026", vendor: "Transporte Rápido, CxA", rnc: "123456789",
      ncf: "", amount: 8900, itbis: 0, goodsType: "04", paymentMethod: "1",
      status: "error", issues: ["NCF no registrado", "RNC sin dígito verificador"],
    },
    {
      id: "4", date: "04/06/2026", vendor: "Consultora Fiduciaria, SRL", rnc: "130987654",
      ncf: "E3100000123", amount: 120000, itbis: 18360, goodsType: "07", paymentMethod: "4",
      status: "ok", issues: [],
    },
    {
      id: "5", date: "03/06/2026", vendor: "Suministros Agropecuarios, SAS", rnc: "131112223",
      ncf: "B0100000089", amount: 34000, itbis: 5202, goodsType: "01", paymentMethod: "3",
      status: "warning", issues: ["Tipo bien/servicio inferido, confirmar"],
    },
    {
      id: "6", date: "03/06/2026", vendor: "Inversiones Varias, SRL", rnc: "132223334",
      ncf: "B0100000090", amount: 28000, itbis: 4284, goodsType: "", paymentMethod: "4",
      status: "missing", issues: ["Falta tipo bienes/servicios (DGII 606)", "Falta forma de pago"],
    },
    {
      id: "7", date: "02/06/2026", vendor: "Proveedor Sin RNC", rnc: "",
      ncf: "B0100000100", amount: 15000, itbis: 2295, goodsType: "07", paymentMethod: "1",
      status: "error", issues: ["RNC del proveedor no registrado"],
    },
    {
      id: "8", date: "02/06/2026", vendor: "Servicios Generales del Sur", rnc: "131444555",
      ncf: "B0100000120", amount: 8750, itbis: 1338.75, goodsType: "07", paymentMethod: "2",
      status: "ok", issues: [],
    },
    {
      id: "9", date: "01/06/2026", vendor: "Tecnología Empresarial, SAS", rnc: "130987123",
      ncf: "B0100000145", amount: 67500, itbis: 10327.5, goodsType: "10", paymentMethod: "4",
      status: "warning", issues: ["Monto elevado sin retención ISR"],
    },
    {
      id: "10", date: "01/06/2026", vendor: "Distribuidora del Norte, SRL", rnc: "131555666",
      ncf: "", amount: 22000, itbis: 3366, goodsType: "01", paymentMethod: "",
      status: "missing", issues: ["NCF no registrado", "Falta forma de pago"],
    },
  ];

  if (period === "2026-05") {
    return all.slice(0, 8).map((r, i) => ({
      ...r,
      date: r.date.replace("06", "05"),
      id: String(i + 10),
    }));
  }

  return all;
}

const STATUS_CONFIG = {
  ok: {
    label: "Completa",
    icon: <CheckCircle2 className="size-3" />,
    badge: "bg-emerald-500/10 text-emerald-600",
    dot: "bg-emerald-500",
  },
  warning: {
    label: "Con observaciones",
    icon: <AlertTriangle className="size-3" />,
    badge: "bg-amber-500/10 text-amber-600",
    dot: "bg-amber-500",
  },
  error: {
    label: "Con errores",
    icon: <XCircle className="size-3" />,
    badge: "bg-red-500/10 text-red-600",
    dot: "bg-red-500",
  },
  missing: {
    label: "Datos incompletos",
    icon: <Info className="size-3" />,
    badge: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
};

// ── Helpers ────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 2 }).format(n);
}

function CompletionRing({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 95 ? "stroke-emerald-500" : pct >= 80 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <svg className="size-10 -rotate-90" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r={r} fill="none" className="stroke-border" strokeWidth="3" />
      <circle
        cx="16" cy="16" r={r}
        fill="none"
        className={cn("transition-all duration-700", color)}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────

export function DgiiPage() {
  const [currentPeriod, setCurrentPeriod] = useState("2026-06");
  const [periodIndex, setPeriodIndex] = useState(5);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const invoices = mockInvoices(currentPeriod);

  const periodLabel = MONTHS[periodIndex]?.month ?? "Desconocido";

  function goPrev() {
    const next = Math.max(0, periodIndex - 1);
    setPeriodIndex(next);
    setCurrentPeriod(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"][next]);
  }

  function goNext() {
    const next = Math.min(5, periodIndex + 1);
    setPeriodIndex(next);
    setCurrentPeriod(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"][next]);
  }

  const selectedMonth = MONTHS[periodIndex];
  const completePct = selectedMonth ? Math.round((selectedMonth.complete / selectedMonth.total) * 100) : 0;
  const warningPct = selectedMonth ? Math.round((selectedMonth.warnings / selectedMonth.total) * 100) : 0;
  const errorPct = selectedMonth ? Math.round(((selectedMonth.errors) / selectedMonth.total) * 100) : 0;

  const totals = invoices.reduce(
    (acc, inv) => {
      acc.amount += inv.amount;
      acc.itbis += inv.itbis;
      return acc;
    },
    { amount: 0, itbis: 0 }
  );

  const filteredInvoices = invoices.filter((inv) => {
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!inv.vendor.toLowerCase().includes(q) && !inv.rnc.includes(q) && !inv.ncf.includes(q)) return false;
    }
    return true;
  });

  function statusBadge(status: ValidationStatus) {
    const cfg = STATUS_CONFIG[status];
    return (
      <Badge className={cn("gap-1 px-2 py-0.5 text-[10px] font-medium", cfg.badge)}>
        {cfg.icon}
        {cfg.label}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Reportes DGII
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Valida, revisa y prepara tus facturas para el cumplimiento fiscal ante la DGII.
            </p>
          </div>

          {/* Period Navigator */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" onClick={goPrev} disabled={periodIndex === 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex min-w-[10rem] items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{periodLabel}</span>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={goNext} disabled={periodIndex === 5}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* ── Stats Cards ───────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <FileText className="size-3" />
              Total facturas
            </CardDescription>
            <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">
              {selectedMonth?.total ?? 0}
            </CardTitle>
          </CardHeader>
          <CardFooter className="pt-0">
            <span className="text-[10px] text-muted-foreground">En el período</span>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <CheckCircle2 className="size-3 text-emerald-500" />
              Completas
            </CardDescription>
            <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">
              {selectedMonth?.complete ?? 0}
            </CardTitle>
          </CardHeader>
          <CardFooter className="pt-0">
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completePct}%` }} />
              </div>
              <span className="text-muted-foreground">{completePct}%</span>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <AlertTriangle className="size-3 text-amber-500" />
              Con observaciones
            </CardDescription>
            <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">
              {selectedMonth?.warnings ?? 0}
            </CardTitle>
          </CardHeader>
          <CardFooter className="pt-0">
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${warningPct}%` }} />
              </div>
              <span className="text-muted-foreground">{warningPct}%</span>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <XCircle className="size-3 text-red-500" />
              Con errores
            </CardDescription>
            <CardTitle className="mt-1 text-2xl font-semibold tracking-tight">
              {selectedMonth ? selectedMonth.errors + (selectedMonth.total - selectedMonth.complete - selectedMonth.warnings - selectedMonth.errors) : 0}
            </CardTitle>
          </CardHeader>
          <CardFooter className="pt-0">
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-red-500" style={{ width: `${errorPct}%` }} />
              </div>
              <span className="text-muted-foreground">{errorPct}%</span>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* ── Monthly Overview ──────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Landmark className="size-3.5 text-muted-foreground" />
            Visión general del semestre
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {MONTHS.map((m, idx) => {
              const pct = Math.round((m.complete / m.total) * 100);
              const active = idx === periodIndex;
              return (
                <button
                  key={m.month}
                  onClick={() => {
                    setPeriodIndex(idx);
                    setCurrentPeriod(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"][idx]);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 transition-all",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/30 hover:bg-muted/50"
                  )}
                >
                  <CompletionRing pct={pct} />
                  <span className="text-xs font-medium">{m.short}</span>
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span>{m.complete}/{m.total}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Validation Queue + Summary ────────── */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Table */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="size-3.5 text-muted-foreground" />
                Validación de facturas
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 w-40 pl-6 text-xs"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="ok">Completas</SelectItem>
                    <SelectItem value="warning">Observaciones</SelectItem>
                    <SelectItem value="error">Errores</SelectItem>
                    <SelectItem value="missing">Incompletas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table className="min-w-[800px] text-xs">
                <TableHeader className="bg-muted/80">
                  <TableRow>
                    <TableHead className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <ArrowUpDown className="size-2.5" />
                        Fecha
                      </div>
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Proveedor
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      RNC
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      NCF
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Monto
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Estado DGII
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Tipo B/S
                    </TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Incidencias
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => {
                    const cfg = STATUS_CONFIG[inv.status];
                    const editing = editingId === inv.id;
                    return (
                      <TableRow
                        key={inv.id}
                        className={cn(
                          "border-b border-border transition-colors",
                          inv.status === "error" && "bg-red-500/[0.02]",
                          inv.status === "warning" && "bg-amber-500/[0.02]",
                          "hover:bg-muted/50"
                        )}
                      >
                        <TableCell className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {inv.date}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate px-3 py-2.5 font-medium">
                          {inv.vendor}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <span className={cn("font-mono text-[11px]", inv.rnc ? "" : "text-red-400")}>
                            {inv.rnc || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 font-mono text-[11px]">
                          <span className={cn(inv.ncf ? "" : "text-red-400")}>
                            {inv.ncf || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {fmtCurrency(inv.amount)}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-center">
                          {statusBadge(inv.status)}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          {editing ? (
                            <Select
                              defaultValue={inv.goodsType}
                              onValueChange={() => setEditingId(null)}
                            >
                              <SelectTrigger className="h-6 w-36 text-[10px]">
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                {GOODS_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value} className="text-[11px]">
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <button
                              onClick={() => setEditingId(inv.id)}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted",
                                inv.goodsType ? "" : "text-red-400 italic"
                              )}
                            >
                              {GOODS_TYPES.find((t) => t.value === inv.goodsType)?.label ?? "Sin asignar"}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right">
                          {inv.issues.length > 0 ? (
                            <div className="flex flex-wrap justify-end gap-1">
                              {inv.issues.slice(0, 2).map((issue, i) => (
                                <span
                                  key={i}
                                  className="inline-block max-w-[120px] truncate rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-600"
                                >
                                  {issue}
                                </span>
                              ))}
                              {inv.issues.length > 2 && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{inv.issues.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-emerald-500">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredInvoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                        No se encontraron facturas con esos filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Summary Sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="size-3.5 text-muted-foreground" />
              Totales del período
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Facturas
                </span>
                <span className="text-sm font-semibold">{invoices.length}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono tabular-nums font-medium">{fmtCurrency(totals.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Percent className="size-2.5" />
                    ITBIS 18%
                  </span>
                  <span className="font-mono tabular-nums font-medium">{fmtCurrency(totals.itbis)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                  <span className="font-semibold">Total</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {fmtCurrency(totals.amount + totals.itbis)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Resumen de validación
              </span>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Completas
                  </span>
                  <span className="font-medium">{invoices.filter((i) => i.status === "ok").length}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Observaciones
                  </span>
                  <span className="font-medium">{invoices.filter((i) => i.status === "warning").length}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-red-500" />
                    Con errores
                  </span>
                  <span className="font-medium">{invoices.filter((i) => i.status === "error").length}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-slate-400" />
                    Incompletas
                  </span>
                  <span className="font-medium">{invoices.filter((i) => i.status === "missing").length}</span>
                </div>
              </div>
            </div>

            <Button className="w-full shadow-button" disabled={!selectedMonth || selectedMonth.errors > 0}>
              <Download className="size-4" data-icon="inline-start" />
              Exportar 606
            </Button>
            {selectedMonth && selectedMonth.errors > 0 && (
              <p className="text-center text-[9px] text-red-400">
                Corrige los errores antes de exportar
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Calendar icon for period display
function CalendarDays({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
