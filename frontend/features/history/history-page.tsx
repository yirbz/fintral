"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Search, Upload, Download, Brain, MessageCircle,
  AlertTriangle, CheckCircle2, XCircle, Clock, Zap,
  Inbox, ChevronDown, Settings, Trash2, LogIn, LogOut,
  Plug, FileText, RotateCcw, Edit3, Send, BookMarked,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listHistory } from "@/lib/api/history";
import type { AuditEvent } from "@/lib/api/history";
import { cn } from "@/lib/utils";

/* ── Helpers ── */

const ACTION_CATEGORY: Record<string, { icon: typeof FileText; label: string; color: string; bg: string }> = {
  "invoice.created":       { icon: Upload,         label: "Subida",      color: "text-sky-500",       bg: "bg-sky-500/10" },
  "invoice.uploaded":      { icon: Upload,         label: "Subida",      color: "text-sky-500",       bg: "bg-sky-500/10" },
  "invoice.processed":     { icon: Brain,          label: "Procesado",   color: "text-violet-500",    bg: "bg-violet-500/10" },
  "invoice.exported":      { icon: Download,       label: "Exportación", color: "text-emerald-500",   bg: "bg-emerald-500/10" },
  "invoice.deleted":       { icon: Trash2,         label: "Eliminado",   color: "text-red-500",       bg: "bg-red-500/10" },
  "invoice.permanent_deleted":   { icon: Trash2,    label: "Elim. perm.", color: "text-red-600",       bg: "bg-red-600/10" },
  "invoice.bulk_permanent_deleted": { icon: Trash2, label: "Elim. perm.", color: "text-red-600",       bg: "bg-red-600/10" },
  "invoice.restored":      { icon: RotateCcw,      label: "Restaurado",  color: "text-emerald-500",   bg: "bg-emerald-500/10" },
  "invoice.bulk_restored": { icon: RotateCcw,      label: "Restaurado",  color: "text-emerald-500",   bg: "bg-emerald-500/10" },
  "invoice.cancelled":     { icon: XCircle,        label: "Anulado",     color: "text-amber-500",     bg: "bg-amber-500/10" },
  "invoice.uncancelled":   { icon: RotateCcw,      label: "Revocado",    color: "text-orange-500",    bg: "bg-orange-500/10" },
  "invoice.updated":       { icon: Edit3,          label: "Editado",     color: "text-blue-500",      bg: "bg-blue-500/10" },
  "invoice.bulk_cancelled":{ icon: XCircle,        label: "Anulación",   color: "text-amber-500",     bg: "bg-amber-500/10" },
  "invoice.emitted":       { icon: Send,           label: "Emitido",     color: "text-indigo-500",    bg: "bg-indigo-500/10" },
  "invoice.booked":        { icon: BookMarked,     label: "Contab.",     color: "text-amber-600",     bg: "bg-amber-600/10" },
  "integration.connected": { icon: Plug,           label: "Conexión",    color: "text-emerald-600",   bg: "bg-emerald-600/10" },
  "integration.disconnected": { icon: Plug,        label: "Desconexión", color: "text-red-500",       bg: "bg-red-500/10" },
  "integration.pushed":    { icon: Upload,         label: "Push",        color: "text-cyan-500",      bg: "bg-cyan-500/10" },
  "export.downloaded":     { icon: Download,       label: "Descarga",    color: "text-blue-500",      bg: "bg-blue-500/10" },
  "settings.updated":      { icon: Settings,       label: "Config.",     color: "text-muted-foreground", bg: "bg-muted" },
  "webhook.created":       { icon: Zap,            label: "Webhook",     color: "text-purple-500",    bg: "bg-purple-500/10" },
  "webhook.deleted":       { icon: Zap,            label: "Webhook",     color: "text-red-500",       bg: "bg-red-500/10" },
  "user.login":            { icon: LogIn,          label: "Login",       color: "text-green-600",     bg: "bg-green-600/10" },
  "user.logout":           { icon: LogOut,         label: "Logout",      color: "text-muted-foreground", bg: "bg-muted" },
};

const STATUS_STYLE: Record<string, { icon: typeof Clock; class: string }> = {
  "invoice.created":        { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "invoice.uploaded":       { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "invoice.processed":      { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "invoice.restored":       { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "invoice.bulk_restored":  { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "invoice.updated":        { icon: Edit3,         class: "bg-blue-500/10 text-blue-600" },
  "invoice.emitted":        { icon: CheckCircle2,  class: "bg-indigo-500/10 text-indigo-600" },
  "invoice.booked":         { icon: BookMarked,    class: "bg-amber-500/10 text-amber-600" },
  "invoice.cancelled":      { icon: XCircle,       class: "bg-amber-500/10 text-amber-600" },
  "invoice.uncancelled":    { icon: RotateCcw,     class: "bg-orange-500/10 text-orange-600" },
  "integration.connected":  { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "user.login":             { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "integration.pushed":     { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
  "export.downloaded":      { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-600" },
};
const DEFAULT_STATUS = { icon: Clock, class: "bg-sky-500/10 text-sky-600" };

const RESOURCE_ICONS: Record<string, typeof FileText> = {
  invoice: FileText,
  integration: Plug,
  webhook: Zap,
  user: LogIn,
};

interface ContextGroup {
  id: string;
  label: string;
  icon: typeof FileText;
  filters: { id: string; label: string }[];
}

const CONTEXT_GROUPS: ContextGroup[] = [
  {
    id: "all",
    label: "Todos",
    icon: FileText,
    filters: [],
  },
  {
    id: "billing",
    label: "Facturación",
    icon: Send,
    filters: [
      { id: "invoice.emitted", label: "Emitidos" },
      { id: "invoice.created", label: "Creados" },
      { id: "invoice.updated", label: "Editados" },
      { id: "invoice.cancelled", label: "Anulados" },
      { id: "invoice.uncancelled", label: "Revocados" },
      { id: "invoice.restored", label: "Restaurados" },
      { id: "invoice.deleted", label: "Eliminados" },
      { id: "invoice.permanent_deleted", label: "Elim. perm." },
    ],
  },
  {
    id: "accounting",
    label: "Contabilidad",
    icon: BookMarked,
    filters: [
      { id: "invoice.booked", label: "Contabilizados" },
      { id: "invoice.processed", label: "Procesados" },
      { id: "invoice.exported", label: "Exportados" },
      { id: "export.downloaded", label: "Descargas" },
    ],
  },
  {
    id: "integrations",
    label: "Integraciones",
    icon: Plug,
    filters: [
      { id: "integration.connected", label: "Conectadas" },
      { id: "integration.disconnected", label: "Desconectadas" },
      { id: "integration.pushed", label: "Pushes" },
      { id: "webhook.created", label: "Webhooks" },
      { id: "webhook.deleted", label: "Eliminados" },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    icon: Settings,
    filters: [
      { id: "settings.updated", label: "Configuración" },
      { id: "user.login", label: "Inicios sesión" },
      { id: "user.logout", label: "Cierres sesión" },
    ],
  },
];

const CONTEXT_ACTION_MAP: Record<string, string[]> = {};
for (const group of CONTEXT_GROUPS) {
  CONTEXT_ACTION_MAP[group.id] = group.filters.map((f) => f.id);
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
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

function groupByDate(events: AuditEvent[]): { label: string; events: AuditEvent[] }[] {
  const groups = new Map<string, AuditEvent[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  for (const ev of events) {
    const d = new Date(ev.created_at);
    let label: string;
    if (d >= today) label = "Hoy";
    else if (d >= yesterday) label = "Ayer";
    else if (d >= weekStart) label = "Esta semana";
    else if (d >= lastWeekStart) label = "Semana pasada";
    else label = "Anterior";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(ev);
  }

  const order = ["Hoy", "Ayer", "Esta semana", "Semana pasada", "Anterior"];
  return order.reduce<{ label: string; events: AuditEvent[] }[]>((acc, label) => {
    if (groups.has(label)) {
      acc.push({ label, events: groups.get(label)! });
    }
    return acc;
  }, []);
}

function countErrors(events: AuditEvent[]): number {
  return events.filter((e) => e.details?.toLowerCase().includes("error") || e.details?.toLowerCase().includes("fail")).length;
}

/* ── Page ── */

export function HistoryPage() {
  const [search, setSearch] = useState("");
  const [contextTab, setContextTab] = useState("all");
  const [specificAction, setSpecificAction] = useState<string | null>(null);
  const resolvedAction = contextTab === "all" ? null : specificAction;

  const { data, isLoading } = useQuery({
    queryKey: ["history", resolvedAction],
    queryFn: () =>
      listHistory({
        action: resolvedAction ?? undefined,
        limit: 200,
      }),
    refetchInterval: 15_000,
  });

  const events = useMemo(() => {
    if (!data?.events) return [];
    let list = data.events;

    if (contextTab !== "all" && !specificAction) {
      const allowed = CONTEXT_ACTION_MAP[contextTab] ?? [];
      list = list.filter((e) => allowed.includes(e.action));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          e.actor_name?.toLowerCase().includes(q) ||
          e.details?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, contextTab, specificAction]);

  const grouped = useMemo(() => groupByDate(events), [events]);
  const errors = useMemo(() => countErrors(events), [events]);

  const currentGroup = CONTEXT_GROUPS.find((g) => g.id === contextTab);

  function handleContextChange(id: string) {
    setContextTab(id);
    setSpecificAction(null);
  }

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
            Trazabilidad completa de acciones por usuario, empresa y recurso.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs">
          <Inbox className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Total:</span>
          <span className="font-semibold tabular-nums">{data?.total ?? 0}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-xs">
          <CheckCircle2 className="size-3.5 text-emerald-500" />
          <span className="text-emerald-700">{(data?.total ?? 0) - errors} exitosos</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-1.5 text-xs">
          <XCircle className="size-3.5 text-destructive" />
          <span className="text-destructive">{errors} con errores</span>
        </div>
      </div>

      {/* Context tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-0.5 self-start overflow-x-auto">
        {CONTEXT_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => handleContextChange(group.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                contextTab === group.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GroupIcon className="size-3.5" />
              {group.label}
            </button>
          );
        })}
      </div>

      {/* Sub-filters per context */}
      {currentGroup && currentGroup.filters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por resumen, usuario o detalle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-0.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSpecificAction(null)}
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                !specificAction
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Todos
            </button>
            {currentGroup.filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSpecificAction(f.id)}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  specificAction === f.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por resumen, usuario o detalle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5 animate-spin" />
              Cargando historial...
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Empty */}
      {!isLoading && events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Search className="size-4 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-foreground">Sin resultados</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {search ? "Intenta con otros filtros." : "Aún no hay actividad registrada."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Timeline */}
      {!isLoading && grouped.length > 0
        ? grouped.map((group) => <DateGroupCard key={group.label} group={group} />)
        : null}
    </div>
  );
}

/* ── Date Group ── */

function DateGroupCard({ group }: { group: { label: string; events: AuditEvent[] } }) {
  const [collapsed, setCollapsed] = useState(false);
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
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="pt-3">
          <div className="relative">
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

function snapshotDiff(event: AuditEvent): [string, string, string][] | null {
  if (!event.snapshot_before || !event.snapshot_after) return null;
  const before = event.snapshot_before as Record<string, unknown>;
  const after = event.snapshot_after as Record<string, unknown>;
  const labelMap: Record<string, string> = {
    vendor_name: "Proveedor", invoice_number: "NCF", total_amount: "Monto",
    tax_amount: "Impuesto", currency: "Moneda", transaction_type: "Tipo",
    category: "Categoría", description: "Descripción", invoice_date: "Fecha",
    vendor_tax_id: "RNC", vendor_country: "País", goods_services_type: "Tipo BS",
  };
  const diffs: [string, string, string][] = [];
  for (const key of Object.keys(labelMap)) {
    const bv = String(before[key] ?? "");
    const av = String(after[key] ?? "");
    if (bv !== av) {
      diffs.push([labelMap[key], bv || "—", av || "—"]);
    }
  }
  return diffs.length > 0 ? diffs : null;
}

function snapshotBefore(event: AuditEvent): [string, string][] | null {
  if (!event.snapshot_before || event.action !== "invoice.permanent_deleted") return null;
  const data = event.snapshot_before as Record<string, unknown>;
  const fields: [string, string][] = [];
  const show: Record<string, string> = {
    vendor_name: "Proveedor", invoice_number: "NCF", total_amount: "Monto",
    tax_amount: "Impuesto", currency: "Moneda", transaction_type: "Tipo",
    category: "Categoría", invoice_date: "Fecha", vendor_tax_id: "RNC",
  };
  for (const [k, label] of Object.entries(show)) {
    const v = data[k];
    if (v !== null && v !== undefined && v !== "") {
      fields.push([label, String(v)]);
    }
  }
  return fields.length > 0 ? fields : null;
}

function EventRow({ event }: { event: AuditEvent }) {
  const config = ACTION_CATEGORY[event.action] ?? { icon: Clock, label: event.action, color: "text-muted-foreground", bg: "bg-muted" };
  const Icon = config.icon;
  const statusDef = STATUS_STYLE[event.action] ?? DEFAULT_STATUS;
  const StatusIcon = statusDef.icon;
  const diff = snapshotDiff(event);
  const snap = snapshotBefore(event);

  return (
    <div className="group relative flex gap-3 py-2.5 pl-1 transition-colors hover:bg-muted/30 rounded-lg -mx-1 px-2">
      {/* Dot */}
      <div className="relative z-10 mt-0.5 flex shrink-0">
        <div className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-full ring-4 ring-card", config.bg)}>
          <Icon className={cn("size-3", config.color)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-foreground">{event.summary}</p>
            <Badge variant="outline" className={cn("h-4 gap-0.5 border-0 px-1 text-[10px] font-normal", statusDef.class)}>
              <StatusIcon className="size-2.5" />
            </Badge>
            {event.visibility === "internal" ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
                      interno
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">
                    Solo visible para administradores
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          {event.details ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{event.details}</p>
          ) : null}

          {/* Snapshot diff (invoice.updated) */}
          {diff ? (
            <div className="mt-1.5 rounded-md border border-border/50 bg-muted/30 p-1.5">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Campos modificados:</p>
              <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-0.5 text-[10px]">
                <span className="font-medium text-muted-foreground">Campo</span>
                <span className="text-red-600/70">Antes</span>
                <span className="text-emerald-600/70">Después</span>
                {diff.map(([label, b, a]) => (
                  <>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="truncate font-mono text-red-600/70">{b}</span>
                    <span className="truncate font-mono text-emerald-600/70">{a}</span>
                  </>
                ))}
              </div>
            </div>
          ) : null}

          {/* Snapshot data (permanent delete) */}
          {snap ? (
            <div className="mt-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-1.5">
              <p className="mb-1 text-[10px] font-medium text-destructive/70">Datos de la factura eliminada:</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {snap.map(([label, val]) => (
                  <span key={label} className="text-muted-foreground">
                    <span className="font-medium">{label}:</span> {val}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {event.actor_name ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                {event.actor_name}
              </span>
            ) : null}
            {event.resource_type ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {event.resource_type}{event.resource_id ? ` #${event.resource_id.slice(0, 8)}` : ""}
              </span>
            ) : null}
            {event.organization_name ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {event.organization_name}
              </span>
            ) : null}
            {event.metadata ? (
              Object.entries(event.metadata).slice(0, 2).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  <span className="text-[9px] uppercase tracking-wider opacity-60">{k}:</span>
                  {String(v).length > 20 ? `${String(v).slice(0, 20)}…` : v}
                </span>
              ))
            ) : null}
          </div>
        </div>

        {/* Time */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {formatTime(new Date(event.created_at))}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {formatTimeAgo(new Date(event.created_at))}
          </span>
        </div>
      </div>
    </div>
  );
}
