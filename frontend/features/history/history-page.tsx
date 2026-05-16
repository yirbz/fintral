"use client";

import { useState, useMemo } from "react";
import {
  Search,
  FileText,
  Upload,
  Download,
  Brain,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Ban,
  Zap,
  Inbox,
  ArrowUpRight,
  Filter,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/* ── Types ── */

type EventCategory = "invoice_created" | "processing" | "export" | "whatsapp" | "alert" | "system";
type SourceChannel = "web" | "whatsapp" | "bulk" | "api";
type EventStatus = "success" | "warning" | "error" | "info";

interface HistoryEvent {
  id: string;
  type: EventCategory;
  source: SourceChannel;
  status: EventStatus;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, string>;
}

interface DateGroup {
  label: string;
  events: HistoryEvent[];
}

/* ── Mock Data ── */

const MOCK_EVENTS: HistoryEvent[] = [
  {
    id: "1",
    type: "invoice_created",
    source: "web",
    status: "success",
    title: "Factura FAC-001-2026 subida",
    description: "Proveedor: Suministros YN, SRL · Monto: RD$45,230.50",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    metadata: { NCF: "B0100000001", items: "3", monto: "RD$45,230.50" },
  },
  {
    id: "2",
    type: "processing",
    source: "web",
    status: "success",
    title: "Procesamiento IA completado",
    description: "Confianza: 97.2% · Tiempo: 4.2s · Sin incidencias",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000),
    metadata: { confianza: "97.2%", tiempo: "4.2s", incidencias: "0" },
  },
  {
    id: "3",
    type: "whatsapp",
    source: "whatsapp",
    status: "success",
    title: "Factura vía WhatsApp recibida",
    description: "Remitente: +1 809-555-0123 · Archivo: factura_marzo.jpg",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    metadata: { telefono: "+1 809-555-0123", archivo: "factura_marzo.jpg" },
  },
  {
    id: "4",
    type: "processing",
    source: "whatsapp",
    status: "warning",
    title: "Procesamiento con observaciones",
    description: "Confianza: 82.5% · Alerta: posible duplicado con FAC-099",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000 + 8 * 60 * 1000),
    metadata: { confianza: "82.5%", alerta: "Posible duplicado" },
  },
  {
    id: "5",
    type: "export",
    source: "web",
    status: "success",
    title: "Exportación DGII 606 completada",
    description: "47 registros · Período: Enero 2026 · NCFs: B01, E31",
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    metadata: { registros: "47", formato: "DGII 606", periodo: "Ene 2026" },
  },
  {
    id: "6",
    type: "invoice_created",
    source: "bulk",
    status: "success",
    title: "Carga masiva completada",
    description: "12 facturas importadas desde Facturas_marzo.xlsx",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    metadata: { archivo: "Facturas_marzo.xlsx", registros: "12" },
  },
  {
    id: "7",
    type: "export",
    source: "web",
    status: "error",
    title: "Exportación QuickBooks fallida",
    description: "Error de conexión con API de QuickBooks · 5 reintentos",
    timestamp: new Date(Date.now() - 28 * 60 * 60 * 1000),
    metadata: { formato: "QuickBooks", error: "Conexión rechazada" },
  },
  {
    id: "8",
    type: "processing",
    source: "bulk",
    status: "error",
    title: "Error de procesamiento",
    description: "Factura B0100000045: formato PDF dañado o ilegible",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000 + 3 * 60 * 1000),
    metadata: { ncf: "B0100000045", error: "PDF dañado" },
  },
  {
    id: "9",
    type: "alert",
    source: "web",
    status: "warning",
    title: "Límite de procesamiento diario",
    description: "Se ha alcanzado el 85% del límite diario de documentos",
    timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
    metadata: { usado: "85%", limite: "200 docs/día" },
  },
  {
    id: "10",
    type: "system",
    source: "api",
    status: "info",
    title: "Webhook registrado",
    description: "Endpoint https://api.cliente.com/webhook activado para evento invoice.processed",
    timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000),
    metadata: { url: "https://api.cliente.com/webhook", evento: "invoice.processed" },
  },
  {
    id: "11",
    type: "invoice_created",
    source: "web",
    status: "success",
    title: "Factura FAC-002-2026 subida",
    description: "Proveedor: Tecnología Avanzada, SRL · Monto: RD$128,900.00",
    timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000 + 60 * 60 * 1000),
    metadata: { NCF: "E3100000001", items: "8", monto: "RD$128,900.00" },
  },
  {
    id: "12",
    type: "processing",
    source: "web",
    status: "success",
    title: "Procesamiento IA completado",
    description: "Confianza: 99.1% · Tiempo: 3.8s · Sin incidencias",
    timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000 + 60 * 60 * 1000 + 4 * 60 * 1000),
    metadata: { confianza: "99.1%", tiempo: "3.8s", incidencias: "0" },
  },
  {
    id: "13",
    type: "export",
    source: "web",
    status: "success",
    title: "Exportación CSV completada",
    description: "89 registros · Formato: CSV estándar",
    timestamp: new Date(Date.now() - 96 * 60 * 60 * 1000),
    metadata: { registros: "89", formato: "CSV" },
  },
  {
    id: "14",
    type: "whatsapp",
    source: "whatsapp",
    status: "error",
    title: "WhatsApp: imagen no procesable",
    description: "La imagen recibida no contiene una factura legible",
    timestamp: new Date(Date.now() - 96 * 60 * 60 * 1000),
    metadata: { telefono: "+1 829-555-0456", error: "Sin factura detectable" },
  },
];

/* ── Helpers ── */

const CATEGORY_CONFIG = {
  invoice_created: {
    icon: Upload,
    label: "Subida",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/20",
    dot: "bg-sky-500",
  },
  processing: {
    icon: Brain,
    label: "Procesamiento",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/20",
    dot: "bg-violet-500",
  },
  export: {
    icon: Download,
    label: "Exportación",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    color: "text-emerald-600",
    bg: "bg-emerald-600/10",
    ring: "ring-emerald-600/20",
    dot: "bg-emerald-600",
  },
  alert: {
    icon: AlertTriangle,
    label: "Alerta",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
    dot: "bg-amber-500",
  },
  system: {
    icon: Zap,
    label: "Sistema",
    color: "text-muted-foreground",
    bg: "bg-muted",
    ring: "ring-border/50",
    dot: "bg-muted-foreground/50",
  },
};

const STATUS_BADGE = {
  success: { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  warning: { icon: AlertTriangle, class: "bg-amber-500/10 text-amber-600" },
  error: { icon: XCircle, class: "bg-destructive/10 text-destructive" },
  info: { icon: Clock, class: "bg-sky-500/10 text-sky-600" },
};

const SOURCE_LABELS: Record<SourceChannel, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  bulk: "Carga masiva",
  api: "API",
};

const FILTER_TABS: Array<{ id: SourceChannel | "all"; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "web", label: "Web" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "bulk", label: "Carga masiva" },
  { id: "api", label: "API" },
];

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins} min`;
  if (hrs < 24) return `hace ${hrs} h`;
  if (days < 7) return `hace ${days} d`;
  return date.toLocaleDateString("es-DO", { day: "numeric", month: "short" });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
}

function groupEventsByDate(events: HistoryEvent[]): DateGroup[] {
  const groups: Map<string, HistoryEvent[]> = new Map();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  for (const event of events) {
    const d = new Date(event.timestamp);
    let label: string;
    if (d >= today) label = "Hoy";
    else if (d >= yesterday) label = "Ayer";
    else if (d >= weekStart) label = "Esta semana";
    else if (d >= lastWeekStart) label = "Semana pasada";
    else label = "Anterior";

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(event);
  }

  const order = ["Hoy", "Ayer", "Esta semana", "Semana pasada", "Anterior"];
  return order.filter((l) => groups.has(l)).map((label) => ({ label, events: groups.get(label)! }));
}

function countByStatus(events: HistoryEvent[]): { success: number; warning: number; error: number } {
  return {
    success: events.filter((e) => e.status === "success").length,
    warning: events.filter((e) => e.status === "warning").length,
    error: events.filter((e) => e.status === "error").length,
  };
}

/* ── Component ── */

export function HistoryPage() {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceChannel | "all">("all");

  const filtered = useMemo(() => {
    let list = MOCK_EVENTS;
    if (sourceFilter !== "all") list = list.filter((e) => e.source === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, sourceFilter]);

  const grouped = useMemo(() => groupEventsByDate(filtered), [filtered]);
  const stats = useMemo(() => countByStatus(filtered), [filtered]);
  const allStats = useMemo(() => countByStatus(MOCK_EVENTS), []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">Registro de actividad</p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">Historial</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Todas las actividades del sistema en orden cronológico
          </p>
        </div>
      </div>

      {/* Totals row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs">
          <Inbox className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Total:</span>
          <span className="font-semibold tabular-nums">{MOCK_EVENTS.length}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-xs">
          <CheckCircle2 className="size-3.5 text-emerald-500" />
          <span className="text-emerald-700 dark:text-emerald-400">{allStats.success} completados</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-1.5 text-xs">
          <AlertTriangle className="size-3.5 text-amber-500" />
          <span className="text-amber-700 dark:text-amber-400">{allStats.warning} con observaciones</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-1.5 text-xs">
          <XCircle className="size-3.5 text-destructive" />
          <span className="text-destructive">{allStats.error} errores</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar en el historial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSourceFilter(tab.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sourceFilter === tab.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex flex-col gap-6">
        {grouped.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                <Search className="size-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-foreground">Sin resultados</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Intenta con otros filtros o términos de búsqueda.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {grouped.map((group) => (
          <DateGroupCard key={group.label} group={group} />
        ))}
      </div>
    </div>
  );
}

/* ── Date Group ── */

function DateGroupCard({ group }: { group: DateGroup }) {
  const [collapsed, setCollapsed] = useState(false);
  const groupStats = useMemo(() => countByStatus(group.events), [group.events]);
  return (
    <Card>
      <CardHeader
        className="flex cursor-pointer flex-row items-center justify-between pb-0"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-heading">{group.label}</CardTitle>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {group.events.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {groupStats.error > 0 ? (
            <Badge variant="destructive" className="h-5 gap-1 px-1.5 text-[10px]">
              <XCircle className="size-2.5" />
              {groupStats.error}
            </Badge>
          ) : null}
          {groupStats.warning > 0 ? (
            <Badge variant="outline" className="h-5 gap-1 border-amber-500/30 bg-amber-500/8 px-1.5 text-[10px] text-amber-600">
              <AlertTriangle className="size-2.5" />
              {groupStats.warning}
            </Badge>
          ) : null}
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`}
          />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="pt-3">
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/60" />
            <div className="flex flex-col gap-0">
              {group.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ── Event Row ── */

function EventRow({ event }: { event: HistoryEvent }) {
  const config = CATEGORY_CONFIG[event.type];
  const Icon = config.icon;
  const StatusIcon = STATUS_BADGE[event.status].icon;
  const sourceLabel = SOURCE_LABELS[event.source];

  return (
    <div className="group relative flex gap-3 py-2.5 pl-1 transition-colors hover:bg-muted/30 rounded-lg -mx-1 px-2">
      {/* Dot on timeline */}
      <div className="relative z-10 mt-0.5 flex shrink-0">
        <div className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ring-4 ring-card ${config.bg}`}>
          <Icon className={`size-3 ${config.color}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-foreground">{event.title}</p>
            <Badge variant="outline" className={`h-4 gap-0.5 border-0 px-1 text-[10px] font-normal ${STATUS_BADGE[event.status].class}`}>
              <StatusIcon className="size-2.5" />
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{event.description}</p>
          {event.metadata ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(event.metadata).map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                >
                  <span className="text-[9px] uppercase tracking-wider opacity-60">{key}:</span>
                  {value}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Time & source */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {formatTime(event.timestamp)}
          </span>
          <span className="text-[10px] text-muted-foreground/60">{sourceLabel}</span>
        </div>
      </div>
    </div>
  );
}
