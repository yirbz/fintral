"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Building2,
  Layers,
  FileText,
  Activity,
  Database,
  HardDrive,
  Search,
  Shield,
  ShieldOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Eye,
  RefreshCw,
  Clock,
  Mail,
  UserCheck,
  UserX,
  Ban,
  Trash2,
  Undo2,
  ChevronRight,
  ChevronDown,
  Pencil,
  Plus,
  X,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminApi,
  type AdminStats,
  type AdminUser,
  type AdminTenant,
  type AdminTenantDetail,
  type AuditEvent,
  type HealthCheck,
  type AdminMrrResponse,
  type AdminPayment,
  type AdminPaymentsResponse,
  type LostSubscription,
  type ChurnRisk,
  type AdminChurnResponse,
  type AdminSubDistributionResponse,
  type AdminSubscription,
  type AdminSubscriptionsResponse,
  type AdminSubscriptionPlan,
} from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";


function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[11px] font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`size-4 ${color || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold">{value}</div>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-border mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors -mb-px ${
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const TABS = [
  { id: "overview", label: "Resumen" },
  { id: "users", label: "Usuarios" },
  { id: "cuentas", label: "Cuentas" },
  { id: "finanzas", label: "Finanzas" },
  { id: "suscripciones", label: "Suscripciones" },
  { id: "observability", label: "Observabilidad" },
  { id: "audit", label: "Auditoría" },
  { id: "health", label: "Sistema" },
];

export function AdminPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Panel de Administración</h1>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Superusuario
        </Badge>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "cuentas" && <CuentasTab />}
      {tab === "finanzas" && <FinanzasTab />}
      {tab === "suscripciones" && <SuscripcionesTab />}
      {tab === "observability" && <ObservabilityTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "health" && <HealthTab />}
    </div>
  );
}

// ----- Overview -----
function OverviewTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-20 bg-muted rounded animate-pulse mb-2" />
              <div className="h-6 w-12 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Usuarios" value={stats.users.total} sub={`${stats.users.active} activos · ${stats.users.new_24h} nuevos hoy`} color="text-blue-500" />
        <StatCard icon={Building2} label="Organizaciones" value={stats.organizations.total} sub={`${stats.organizations.active} activas · ${stats.organizations.new_24h} nuevas hoy`} color="text-emerald-500" />
        <StatCard icon={Layers} label="Tenants" value={stats.tenants} color="text-purple-500" />
        <StatCard icon={FileText} label="Facturas" value={stats.invoices} color="text-amber-500" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] text-muted-foreground">
          {stats.audit_events_24h} eventos de auditoría en las últimas 24h
        </CardContent>
      </Card>
    </div>
  );
}

// ----- Users -----
function UsersTab() {
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<string>("all");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", search, filterActive],
    queryFn: () =>
      adminApi.listUsers({
        search: search || undefined,
        is_active: filterActive === "all" ? undefined : filterActive === "active",
        limit: 100,
      }),
  });

  const handleToggleActive = async (userId: string) => {
    try {
      await adminApi.toggleUserActive(userId);
      toast.success("Estado cambiado");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleSuperuser = async (userId: string, current: boolean) => {
    try {
      await adminApi.setUserSuperuser(userId, !current);
      toast.success("Permiso actualizado");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por email o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Email</TableHead>
                <TableHead className="text-[10px]">Nombre</TableHead>
                <TableHead className="text-[10px]">Tenant</TableHead>
                <TableHead className="text-[10px]">Orgs</TableHead>
                <TableHead className="text-[10px]">Estado</TableHead>
                <TableHead className="text-[10px]">Admin</TableHead>
                <TableHead className="text-[10px] text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-[11px] font-mono">{u.email}</TableCell>
                  <TableCell className="text-[11px]">{u.full_name || "—"}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{u.tenant_name || "—"}</TableCell>
                  <TableCell className="text-[11px]">{u.organization_count}</TableCell>
                  <TableCell>
                    <Badge
                      variant={u.is_active ? "default" : "secondary"}
                      className={`text-[10px] ${u.is_active ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10" : ""}`}
                    >
                      {u.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_superuser ? (
                      <Shield className="size-3.5 text-amber-500" />
                    ) : (
                      <ShieldOff className="size-3.5 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleToggleActive(u.id)}
                        title={u.is_active ? "Desactivar" : "Activar"}
                      >
                        {u.is_active ? <UserX className="size-3.5 text-red-500" /> : <UserCheck className="size-3.5 text-emerald-500" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleToggleSuperuser(u.id, u.is_superuser)}
                        title={u.is_superuser ? "Quitar admin" : "Hacer admin"}
                      >
                        <Shield className={`size-3.5 ${u.is_superuser ? "text-amber-500" : "text-muted-foreground"}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data && data.total > (data?.users?.length || 0) && (
            <div className="p-2 text-center text-[10px] text-muted-foreground border-t">
              Mostrando {data.users.length} de {data.total} usuarios
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----- Confirmation Dialog -----
function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, variant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: "destructive" | "default";
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-7 text-xs">Cancelar</AlertDialogCancel>
          <AlertDialogAction className="h-7 text-xs" variant={variant ?? "destructive"} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


// ----- Cuentas (Tenant Drill-Down) -----
function CuentasTab() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantSearch, setTenantSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editingTenant, setEditingTenant] = useState<AdminTenantDetail | null>(null);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState("");

  // Suspension states
  const [suspendingTenantId, setSuspendingTenantId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendGraceDays, setSuspendGraceDays] = useState(0);
  const [suspendNotify, setSuspendNotify] = useState(true);

  // Unsuspension states
  const [unsuspendingTenantId, setUnsuspendingTenantId] = useState<string | null>(null);
  const [unsuspendNotify, setUnsuspendNotify] = useState(true);

  // Onboard states
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardData, setOnboardData] = useState({
    org_name: "",
    tax_id: "",
    admin_email: "",
    admin_name: "",
    plan: "free",
    country: "DO",
    password: "",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string } | null>(null);

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{ title: string; description: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  const queryClient = useQueryClient();

  const {data: tenantsQuery_data, isLoading: tenantsQuery_isLoading} = useQuery({
    queryKey: ["admin-tenants", tenantSearch, showDeleted],
    queryFn: () => adminApi.listTenants({ search: tenantSearch || undefined, include_deleted: showDeleted }),
  });

  const {data: tenantQuery_data, isLoading: tenantQuery_isLoading} = useQuery({
    queryKey: ["admin-tenant-detail", selectedTenantId],
    queryFn: () => adminApi.getTenant(selectedTenantId!),
    enabled: !!selectedTenantId,
  });

  const t = tenantQuery_data;

  const invalidateTenant = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-tenant-detail", selectedTenantId] });
    queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
  };

  const deleteTenantMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteTenant(id),
    onSuccess: () => { toast.success("Tenant eliminado"); setSelectedTenantId(null); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreTenantMut = useMutation({
    mutationFn: (id: string) => adminApi.restoreTenant(id),
    onSuccess: () => { toast.success("Tenant restaurado"); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTenantMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminApi.updateTenant>[1] }) =>
      adminApi.updateTenant(id, data),
    onSuccess: (_, vars) => { toast.success("Tenant actualizado"); setEditingTenant(null); queryClient.invalidateQueries({ queryKey: ["admin-tenant-detail", vars.id] }); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const suspendTenantMut = useMutation({
    mutationFn: ({ id, reason, grace_days, notify_user }: { id: string; reason: string; grace_days: number; notify_user: boolean }) =>
      adminApi.suspendTenant(id, { reason, grace_days, notify_user }),
    onSuccess: () => {
      toast.success("Tenant suspendido");
      setSuspendingTenantId(null);
      setSuspendReason("");
      setSuspendGraceDays(0);
      invalidateTenant();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unsuspendTenantMut = useMutation({
    mutationFn: ({ id, notify_user }: { id: string; notify_user: boolean }) =>
      adminApi.unsuspendTenant(id, { notify_user }),
    onSuccess: () => {
      toast.success("Tenant reactivado");
      setUnsuspendingTenantId(null);
      invalidateTenant();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onboardTenantMut = useMutation({
    mutationFn: (data: typeof onboardData) => adminApi.onboardTenant(data),
    onSuccess: (res) => {
      toast.success("Tenant creado exitosamente");
      setOnboardOpen(false);
      if (res.temp_password) {
        setCreatedCredentials({ email: res.admin_email, pass: res.temp_password });
      }
      setOnboardData({
        org_name: "",
        tax_id: "",
        admin_email: "",
        admin_name: "",
        plan: "free",
        country: "DO",
        password: "",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOrgMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrg(id),
    onSuccess: () => { toast.success("Organización eliminada"); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreOrgMut = useMutation({
    mutationFn: (id: string) => adminApi.restoreOrg(id),
    onSuccess: () => { toast.success("Organización restaurada"); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrgMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminApi.updateOrg>[1] }) =>
      adminApi.updateOrg(id, data),
    onSuccess: () => { toast.success("Organización actualizada"); setEditingOrg(null); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUserMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => { toast.success("Usuario eliminado (datos preservados)"); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreUserMut = useMutation({
    mutationFn: (id: string) => adminApi.restoreUser(id),
    onSuccess: () => { toast.success("Usuario restaurado"); invalidateTenant(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ask = (title: string, description: string, confirmLabel: string, onConfirm: () => void) =>
    setConfirm({ title, description, confirmLabel, onConfirm });

  if (selectedTenantId && tenantQuery_isLoading) {
    return <div className="h-40 bg-muted rounded animate-pulse" />;
  }

  // Parse suspension details
  let suspensionDetail: { suspended_at: string; reason: string; grace_days: number } | null = null;
  if (t && t.settings_json) {
    try {
      const settings = JSON.parse(t.settings_json);
      suspensionDetail = settings.suspension || null;
    } catch(e) {}
  }

  if (t) {
    return (
      <div className="space-y-3">
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(v) => { if (!v) setConfirm(null); }}
          title={confirm?.title ?? ""}
          description={confirm?.description ?? ""}
          confirmLabel={confirm?.confirmLabel ?? ""}
          onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
        />

        {/* Dialog for Suspend */}
        <Dialog open={!!suspendingTenantId} onOpenChange={(v) => { if (!v) setSuspendingTenantId(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Suspender Tenant</DialogTitle>
              <DialogDescription className="text-xs">
                Esto bloqueará el acceso de todos los usuarios de este tenant al sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Motivo de la suspensión</label>
                <Textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Ej: Falta de pago, violación de términos de servicio..."
                  className="text-xs min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Días de gracia</label>
                  <Input
                    type="number"
                    value={suspendGraceDays}
                    onChange={(e) => setSuspendGraceDays(Number(e.target.value))}
                    min={0}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Checkbox
                    id="notify-suspend"
                    checked={suspendNotify}
                    onCheckedChange={(v) => setSuspendNotify(!!v)}
                  />
                  <label htmlFor="notify-suspend" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Notificar usuarios
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSuspendingTenantId(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={!suspendReason.trim() || suspendTenantMut.isPending}
                onClick={() => suspendTenantMut.mutate({ id: suspendingTenantId!, reason: suspendReason, grace_days: suspendGraceDays, notify_user: suspendNotify })}
              >
                {suspendTenantMut.isPending ? "Suspendiendo..." : "Confirmar Suspensión"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for Unsuspend */}
        <Dialog open={!!unsuspendingTenantId} onOpenChange={(v) => { if (!v) setUnsuspendingTenantId(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Reactivar Tenant</DialogTitle>
              <DialogDescription className="text-xs">
                Esto restablecerá el acceso de todos los usuarios de este tenant al sistema de forma inmediata.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 flex items-center gap-2">
              <Checkbox
                id="notify-unsuspend"
                checked={unsuspendNotify}
                onCheckedChange={(v) => setUnsuspendNotify(!!v)}
              />
              <label htmlFor="notify-unsuspend" className="text-xs text-muted-foreground cursor-pointer select-none">
                Notificar usuarios por email
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setUnsuspendingTenantId(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={unsuspendTenantMut.isPending}
                onClick={() => unsuspendTenantMut.mutate({ id: unsuspendingTenantId!, notify_user: unsuspendNotify })}
              >
                {unsuspendTenantMut.isPending ? "Reactivando..." : "Confirmar Reactivación"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedTenantId(null)}>
            ← Volver
          </Button>
          {t.deleted_at ? (
            <Badge variant="destructive" className="text-[10px]">Eliminado</Badge>
          ) : t.is_active ? (
            <Badge variant="default" className="text-[10px] bg-emerald-500 hover:bg-emerald-600">Activo</Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]" title={suspensionDetail ? `Razón: ${suspensionDetail.reason}` : "Suspendido"}>
              Suspendido
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{t.plan}</Badge>
        </div>

        {!t.is_active && !t.deleted_at && suspensionDetail && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-[11px] text-destructive flex items-start gap-2 max-w-xl">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-red-500">Cuenta Suspendida</span>
              <span className="block mt-0.5">Razón: {suspensionDetail.reason}</span>
              <span className="block text-muted-foreground mt-0.5 text-[10px]">
                Suspendido el {new Date(suspensionDetail.suspended_at).toLocaleString("es-DO")}
                {suspensionDetail.grace_days > 0 && ` · Período de gracia: ${suspensionDetail.grace_days} días`}
              </span>
            </div>
          </div>
        )}

        {editingTenant ? (
          <div className="flex items-center gap-2">
            <Input value={editingTenant.name} onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })} className="h-7 text-xs max-w-xs" />
            <Button size="sm" className="h-7 text-xs" onClick={() => updateTenantMut.mutate({ id: t.id, data: { name: editingTenant.name } })}>Guardar</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingTenant(null)}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t.name}</h2>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingTenant({ ...t })}>
              <Pencil className="size-3" />
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Slug: {t.slug} · ID: {t.id}</p>

        <div className="flex gap-2">
          {t.deleted_at ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restoreTenantMut.mutate(t.id)}>
              <Undo2 className="size-3 mr-1" /> Restaurar
            </Button>
          ) : (
            <>
              {t.is_active ? (
                <Button size="sm" variant="outline" className="h-7 text-xs text-amber-500 border-amber-500/20 hover:bg-amber-500/10" onClick={() => setSuspendingTenantId(t.id)}>
                  <Ban className="size-3 mr-1" /> Suspender
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10" onClick={() => setUnsuspendingTenantId(t.id)}>
                  <CheckCircle2 className="size-3 mr-1" /> Reactivar
                </Button>
              )}
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => ask("Eliminar tenant", "¿Eliminar este tenant y todos sus recursos? Los datos fiscales se preservarán por 10 años.", "Eliminar", () => deleteTenantMut.mutate(t.id))}>
                <Trash2 className="size-3 mr-1" /> Eliminar
              </Button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Organizaciones ({t.organizations.length})
          </h3>
          {t.organizations.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              onEdit={() => { setEditingOrg(org.id); setEditOrgName(org.name); }}
              editing={editingOrg === org.id}
              editName={editOrgName}
              onEditNameChange={setEditOrgName}
              onSaveName={() => updateOrgMut.mutate({ id: org.id, data: { name: editOrgName } })}
              onCancelEdit={() => setEditingOrg(null)}
              onDelete={() => ask("Eliminar organización", "¿Eliminar esta organización y sus miembros? Los datos fiscales se preservarán por 10 años.", "Eliminar", () => deleteOrgMut.mutate(org.id))}
              onRestore={() => ask("Restaurar organización", "¿Restaurar esta organización? Los miembros deberán ser reasignados manualmente.", "Restaurar", () => restoreOrgMut.mutate(org.id))}
              onDeleteUser={(uid, uname) => ask("Eliminar usuario", `¿Eliminar a "${uname}"? Sus datos fiscales se preservarán por 10 años.`, "Eliminar usuario", () => deleteUserMut.mutate(uid))}
              onRestoreUser={(uid, uname) => ask("Restaurar usuario", `¿Restaurar a "${uname}"?`, "Restaurar", () => restoreUserMut.mutate(uid))}
              onToggleEcf={(isAuthorized) => updateOrgMut.mutate({ id: org.id, data: { is_ecf_authorized: isAuthorized } })}
              onChangeCertificationStatus={(status) => updateOrgMut.mutate({ id: org.id, data: { certification_status: status } })}
            />
          ))}
          {t.organizations.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Sin organizaciones</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Dialog for Onboard */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Crear Nuevo Tenant (Onboarding Manual)</DialogTitle>
            <DialogDescription className="text-xs">
              Registra manualmente una empresa en el sistema. Esto creará el tenant, la organización, el usuario administrador y su suscripción inicial.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Nombre de la Empresa</label>
              <Input
                value={onboardData.org_name}
                onChange={(e) => setOnboardData({ ...onboardData, org_name: e.target.value })}
                placeholder="Mi Empresa S.A."
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">RNC / Cédula</label>
              <Input
                value={onboardData.tax_id}
                onChange={(e) => setOnboardData({ ...onboardData, tax_id: e.target.value })}
                placeholder="130123456"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Nombre del Administrador</label>
              <Input
                value={onboardData.admin_name}
                onChange={(e) => setOnboardData({ ...onboardData, admin_name: e.target.value })}
                placeholder="Juan Pérez"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Email del Administrador</label>
              <Input
                type="email"
                value={onboardData.admin_email}
                onChange={(e) => setOnboardData({ ...onboardData, admin_email: e.target.value })}
                placeholder="juan.perez@empresa.com"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Plan Inicial</label>
              <Select
                value={onboardData.plan}
                onValueChange={(v) => setOnboardData({ ...onboardData, plan: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inicial">Inicial</SelectItem>
                  <SelectItem value="profesional">Profesional</SelectItem>
                  <SelectItem value="despacho">Despacho Contable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">País</label>
              <Select
                value={onboardData.country}
                onValueChange={(v) => setOnboardData({ ...onboardData, country: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DO">República Dominicana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Contraseña (Opcional - dejar vacío para auto-generar)</label>
              <Input
                type="password"
                value={onboardData.password}
                onChange={(e) => setOnboardData({ ...onboardData, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOnboardOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!onboardData.org_name || !onboardData.admin_email || !onboardData.admin_name || onboardTenantMut.isPending}
              onClick={() => onboardTenantMut.mutate(onboardData)}
            >
              {onboardTenantMut.isPending ? "Registrando..." : "Crear Cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Credentials */}
      <Dialog open={!!createdCredentials} onOpenChange={(v) => { if (!v) setCreatedCredentials(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-emerald-600 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="size-4" /> Cuenta Creada Exitosamente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Copia estas credenciales temporales y compártelas con el administrador de la cuenta. No volverán a mostrarse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 bg-muted/50 rounded-md p-3 font-mono text-xs border">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground uppercase font-sans font-semibold">Email:</span>
              <span>{createdCredentials?.email}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2 mt-2">
              <span className="text-[10px] text-muted-foreground uppercase font-sans font-semibold">Contraseña:</span>
              <span className="font-bold text-foreground bg-background px-1.5 py-0.5 rounded border">{createdCredentials?.pass}</span>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-8 text-xs" onClick={() => setCreatedCredentials(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={tenantSearch}
            onChange={(e) => setTenantSearch(e.target.value)}
            placeholder="Buscar tenant..."
            className="h-8 text-xs max-w-xs"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="size-3" />
            Ver eliminados
          </label>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setOnboardOpen(true)}>
          <Plus className="size-3.5" /> Crear Tenant
        </Button>
      </div>

      {tenantsQuery_isLoading ? (
        <div className="h-20 bg-muted rounded animate-pulse" />
      ) : (
        <div className="grid gap-1">
          {(tenantsQuery_data?.tenants ?? []).map((t) => {
            return (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 text-xs"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTenantId(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTenantId(t.id); } }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate">{t.name}</span>
                  <Badge variant="outline" className="text-[10px]">{t.plan}</Badge>
                  {t.deleted_at ? (
                    <Badge variant="destructive" className="text-[10px]">Eliminado</Badge>
                  ) : !t.is_active ? (
                    <Badge variant="destructive" className="text-[10px] bg-red-500/10 text-red-600 hover:bg-red-500/10">Suspendido</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>{t.user_count} usuarios</span>
                  <span>{t.organization_count} orgs</span>
                  <ChevronRight className="size-3.5" />
                </div>
              </div>
            );
          })}
          {(tenantsQuery_data?.tenants ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No hay tenants</p>
          )}
        </div>
      )}
    </div>
  );
}

function OrgCard({
  org, editing, editName, onEdit, onEditNameChange, onSaveName, onCancelEdit,
  onDelete, onRestore, onDeleteUser, onRestoreUser, onToggleEcf, onChangeCertificationStatus,
}: {
  org: AdminTenantDetail["organizations"][0];
  editing: boolean;
  editName: string;
  onEdit: () => void;
  onEditNameChange: (v: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeleteUser: (uid: string, uname: string) => void;
  onRestoreUser: (uid: string, uname: string) => void;
  onToggleEcf: (isAuthorized: boolean) => void;
  onChangeCertificationStatus: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/30" role="button" tabIndex={0} onClick={() => setExpanded(!expanded)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}>
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {editing ? (
            <div className="flex items-center gap-1" role="presentation" onClick={(e) => e.stopPropagation()}>
              <Input value={editName} onChange={(e) => onEditNameChange(e.target.value)} className="h-6 text-xs w-40" />
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onSaveName}>OK</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancelEdit}>X</Button>
            </div>
          ) : (
            <>
              <span className="text-xs font-medium">{org.name}</span>
              <Badge variant={org.deleted_at ? "destructive" : org.is_active ? "default" : "secondary"} className="text-[10px]">
                {org.deleted_at ? "Eliminado" : org.is_active ? "Activo" : "Inactivo"}
              </Badge>
              {org.is_ecf_authorized && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/5 border-emerald-500/20 text-emerald-600">e-CF</Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" role="presentation" onClick={(e) => e.stopPropagation()}>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
              <Pencil className="size-3" />
            </Button>
          )}
          {org.deleted_at ? (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={onRestore}>
              <Undo2 className="size-3" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={onDelete}>
              <Trash2 className="size-3" />
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground ml-1">{org.users.length} usuarios</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2.5">
          <div className="grid grid-cols-2 gap-3 text-[10px] text-muted-foreground items-center bg-muted/20 p-2 rounded-md border">
            <div>RNC: <span className="font-mono text-foreground font-semibold">{org.tax_id || "—"}</span></div>
            <div className="flex items-center gap-2">
              <span>Facturación Electrónica (e-CF):</span>
              <Switch
                checked={org.is_ecf_authorized}
                onCheckedChange={(checked) => onToggleEcf(checked)}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <span>Certificación DGII:</span>
              <Select
                value={org.certification_status}
                onValueChange={(v) => onChangeCertificationStatus(v)}
              >
                <SelectTrigger className="h-6 text-[10px] w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno (Física)</SelectItem>
                  <SelectItem value="applicant">Postulante</SelectItem>
                  <SelectItem value="testing">Pruebas</SelectItem>
                  <SelectItem value="certified">Certificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {org.users.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Sin usuarios</p>
          ) : (
            <div className="space-y-1">
              {org.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded px-2 py-0.5 hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="size-3 shrink-0 text-muted-foreground" />
                    <span className="text-xs truncate">{u.full_name || u.email}</span>
                    <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                    {u.deleted_at && <Badge variant="destructive" className="text-[10px]">Eliminado</Badge>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {u.deleted_at ? (
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-600" onClick={() => onRestoreUser(u.id, u.full_name || u.email || "")}>
                        <Undo2 className="size-2.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => onDeleteUser(u.id, u.full_name || u.email || "")}>
                        <Trash2 className="size-2.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ----- Audit -----
function AuditTab() {
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [tenantId, setTenantId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const startIso = startDate ? `${startDate}T00:00:00` : undefined;
  const endIso = endDate ? `${endDate}T23:59:59` : undefined;

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "admin-audit",
      limit,
      offset,
      tenantId,
      orgId,
      action,
      actorId,
      resourceType,
      visibility,
      startIso,
      endIso,
    ],
    queryFn: () =>
      adminApi.getAuditLogs({
        limit,
        offset,
        tenant_id: tenantId || undefined,
        organization_id: orgId || undefined,
        action: action || undefined,
        actor_id: actorId || undefined,
        resource_type: resourceType || undefined,
        visibility: visibility === "all" ? undefined : visibility,
        start_date: startIso,
        end_date: endIso,
      }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-3">
      {/* Filter panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 bg-muted/30 p-2.5 rounded-lg border">
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Tenant ID</label>
          <Input
            value={tenantId}
            onChange={(e) => { setTenantId(e.target.value); setOffset(0); }}
            placeholder="UUID..."
            className="h-7 text-[10px]"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Org ID</label>
          <Input
            value={orgId}
            onChange={(e) => { setOrgId(e.target.value); setOffset(0); }}
            placeholder="UUID..."
            className="h-7 text-[10px]"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Acción</label>
          <Input
            value={action}
            onChange={(e) => { setAction(e.target.value); setOffset(0); }}
            placeholder="Ej: user.login..."
            className="h-7 text-[10px]"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Actor ID</label>
          <Input
            value={actorId}
            onChange={(e) => { setActorId(e.target.value); setOffset(0); }}
            placeholder="UUID..."
            className="h-7 text-[10px]"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Tipo Recurso</label>
          <Input
            value={resourceType}
            onChange={(e) => { setResourceType(e.target.value); setOffset(0); }}
            placeholder="Ej: invoice..."
            className="h-7 text-[10px]"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Visibilidad</label>
          <Select value={visibility} onValueChange={(v) => { setVisibility(v); setOffset(0); }}>
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Desde</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setOffset(0); }}
            className="h-7 text-[10px] px-1"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[9px] font-bold text-muted-foreground uppercase">Hasta</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setOffset(0); }}
            className="h-7 text-[10px] px-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setOffset(0); }}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 eventos</SelectItem>
              <SelectItem value="100">100 eventos</SelectItem>
              <SelectItem value="500">500 eventos</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">{data?.total || 0} total</span>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="text-[10px] w-16">Hora</TableHead>
                <TableHead className="text-[10px]">Acción</TableHead>
                <TableHead className="text-[10px]">Actor</TableHead>
                <TableHead className="text-[10px]">Recurso</TableHead>
                <TableHead className="text-[10px]">Resumen</TableHead>
                <TableHead className="text-[10px] w-16">Vis.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.events.map((e) => (
                <TableRow key={e.id} className="group">
                  <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] max-w-[120px] truncate" title={e.actor_email || ""}>
                    {e.actor_name || e.actor_email || e.actor_id}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground max-w-[100px] truncate">
                    {e.resource_type}{e.resource_id ? `:${e.resource_id.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell className="text-[10px] max-w-[200px] truncate" title={e.summary}>
                    {e.summary}
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <Badge variant="outline" className={`text-[9px] ${e.visibility === "internal" ? "border-amber-300 text-amber-600" : ""}`}>
                      {e.visibility || "client"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > limit && (
        <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Anterior
          </Button>
          <span>
            Mostrando {offset + 1} - {Math.min(offset + limit, data.total)} de {data.total}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            disabled={offset + limit >= data.total}
            onClick={() => setOffset(offset + limit)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

// ----- Health -----
function HealthTab() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => adminApi.getHealth(),
    refetchInterval: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats-health"],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <Activity className="size-4" />
            Estado del Sistema
          </CardTitle>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => refetch()}>
            <RotateCcw className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-6 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : health ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {health.status === "ok" ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-500" />
                )}
                <span className="text-xs font-semibold">
                  {health.status === "ok" ? "Todos los sistemas operativos" : "Sistema degradado"}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  <Clock className="size-3 inline mr-1" />
                  {new Date(health.timestamp).toLocaleString("es-DO")}
                </span>
              </div>

              <div className="grid gap-2">
                {Object.entries(health.checks).map(([name, check]) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                    <div className="flex items-center gap-2">
                      {name === "database" ? (
                        <Database className="size-3.5 text-muted-foreground" />
                      ) : (
                        <HardDrive className="size-3.5 text-muted-foreground" />
                      )}
                      <span className="font-medium capitalize">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {check.status === "ok" ? (
                        <Badge className="text-[9px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">OK</Badge>
                      ) : (
                        <Badge className="text-[9px] bg-red-500/10 text-red-600 hover:bg-red-500/10" title={check.message}>
                          ERROR
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                <span className="font-medium">Errores (última hora)</span>
                <Badge
                  className={`text-[9px] ${
                    health.errors_last_hour > 0
                      ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10"
                      : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10"
                  }`}
                >
                  {health.errors_last_hour}
                </Badge>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold">Resumen rápido</CardTitle>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Usuarios</p>
                <p className="text-sm font-bold">{stats.users.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Organizaciones</p>
                <p className="text-sm font-bold">{stats.organizations.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Tenants</p>
                <p className="text-sm font-bold">{stats.tenants}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Facturas</p>
                <p className="text-sm font-bold">{stats.invoices}</p>
              </div>
            </div>
          ) : (
            <div className="h-16 bg-muted rounded animate-pulse" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ----- Observability -----
const OBSERVABILITY_SUB_TABS = [
  { id: "costs", label: "Costos de IA" },
  { id: "usage", label: "Consumo de Recursos" },
  { id: "storage", label: "Almacenamiento" },
  { id: "alanube", label: "API Alanube" },
];

const MODEL_COLORS = ["#533afd", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const LOCAL_VS_ELECTRONIC_COLORS = ["#533afd", "#f59e0b"];

function ObservabilityTab() {
  const [subTab, setSubTab] = useState("costs");

  const { data: costs, isLoading: loadingCosts } = useQuery({
    queryKey: ["admin-costs-analytics"],
    queryFn: () => adminApi.getCostsAnalytics(),
  });

  const { data: usage, isLoading: loadingUsage } = useQuery({
    queryKey: ["admin-usage-analytics"],
    queryFn: () => adminApi.getUsageAnalytics(),
  });

  const { data: storage, isLoading: loadingStorage } = useQuery({
    queryKey: ["admin-storage-analytics"],
    queryFn: () => adminApi.getStorageAnalytics(),
  });

  const { data: alanube, isLoading: loadingAlanube } = useQuery({
    queryKey: ["admin-alanube-analytics"],
    queryFn: () => adminApi.getAlanubeAnalytics(),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border/60 pb-2">
        {OBSERVABILITY_SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-[10px] font-semibold rounded-md transition-all ${
              subTab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "costs" && <CostsSection data={costs} isLoading={loadingCosts} />}
      {subTab === "usage" && <UsageSection data={usage} isLoading={loadingUsage} />}
      {subTab === "storage" && <StorageSection data={storage} isLoading={loadingStorage} />}
      {subTab === "alanube" && <AlanubeSection data={alanube} isLoading={loadingAlanube} />}
    </div>
  );
}

function CostsSection({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <div className="h-64 bg-muted rounded animate-pulse" />;
  if (!data) return <div className="text-xs text-muted-foreground">No hay datos de costos disponibles.</div>;

  const pieData = data.model_breakdown.map((m: any) => ({
    name: m.model,
    value: m.total_cost,
  }));

  const chartData = data.weekly_breakdown.map((w: any) => ({
    fecha: new Date(w.date).toLocaleDateString("es-DO", { day: "numeric", month: "short" }),
    costo: w.cost,
    requests: w.requests,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={HardDrive} label="Costo Total IA" value={`$${data.total_cost.toFixed(4)} USD`} sub={`${data.total_tokens.toLocaleString()} tokens totales`} color="text-indigo-500" />
        <StatCard icon={Activity} label="Costo Promedio / Req" value={`$${data.average_cost_per_request.toFixed(4)} USD`} sub={`${data.total_requests} peticiones`} color="text-emerald-500" />
        <StatCard icon={Clock} label="Gasto Diario Actual" value={`$${data.daily.cost.toFixed(4)} USD`} sub={`Límite diario: $${data.daily.limit} USD`} color="text-amber-500" />
        <StatCard icon={Shield} label="Gasto Restante Diario" value={`$${data.daily.remaining.toFixed(4)} USD`} sub={`${(data.daily.remaining / data.daily.limit * 100).toFixed(0)}% disponible`} color="text-teal-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Tendencia de Costo Diario (Últimos 7 Días)</CardTitle>
          </CardHeader>
          <CardContent className="h-60 text-xs">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} className="text-[10px] text-muted-foreground" />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px] text-muted-foreground" />
                  <ChartTooltip formatter={(value: any) => [`$${value.toFixed(4)}`, "Costo (USD)"]} />
                  <Line type="monotone" dataKey="costo" stroke="#533afd" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Sin datos históricos de los últimos 7 días</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Distribución de Costo por Modelo</CardTitle>
          </CardHeader>
          <CardContent className="h-60 flex items-center justify-between text-xs">
            {pieData.length > 0 ? (
              <>
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={MODEL_COLORS[index % MODEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value: any) => [`$${value.toFixed(4)} USD`, "Costo"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-1.5 pl-4 overflow-y-auto max-h-full">
                  {data.model_breakdown.map((m: any, index: number) => (
                    <div key={m.model} className="flex flex-col">
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <span className="size-2 rounded-full inline-block" style={{ backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] }} />
                        <span className="truncate max-w-[100px]">{m.model}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground pl-3.5">
                        ${m.total_cost.toFixed(4)} USD ({m.requests} reqs)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">Sin desglose por modelo disponible</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold">Tabla Desglosada por Modelo de IA</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Modelo</TableHead>
                <TableHead className="text-[10px]">Peticiones</TableHead>
                <TableHead className="text-[10px]">Tokens Totales</TableHead>
                <TableHead className="text-[10px]">Costo Total</TableHead>
                <TableHead className="text-[10px] text-right">Costo Promedio / Req</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.model_breakdown.map((m: any) => (
                <TableRow key={m.model}>
                  <TableCell className="text-[11px] font-mono font-medium">{m.model}</TableCell>
                  <TableCell className="text-[11px]">{m.requests}</TableCell>
                  <TableCell className="text-[11px]">{m.total_tokens.toLocaleString()}</TableCell>
                  <TableCell className="text-[11px]">${m.total_cost.toFixed(4)} USD</TableCell>
                  <TableCell className="text-[11px] text-right font-medium">${m.avg_cost_per_request.toFixed(4)} USD</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageSection({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <div className="h-64 bg-muted rounded animate-pulse" />;
  if (!data) return <div className="text-xs text-muted-foreground">No hay datos de consumo disponibles.</div>;

  const ratioData = [
    { name: "Electrónicas (e-CF)", value: data.ratio_local_vs_electronic.electronic },
    { name: "Físicas (NCF)", value: data.ratio_local_vs_electronic.physical },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={FileText} label="Facturas e-CF" value={data.totals.ecf_count} sub="Emitidas vía DGII" color="text-indigo-500" />
        <StatCard icon={Activity} label="Peticiones AI" value={data.totals.ai_query_count} sub="Sidebar + Pipeline" color="text-purple-500" />
        <StatCard icon={Building2} label="Documentos OCR" value={data.totals.ocr_doc_count} sub="Procesados por OCR" color="text-emerald-500" />
        <StatCard icon={HardDrive} label="Almacenamiento" value={`${data.totals.storage_mb} MB`} sub="Cargados en Storage" color="text-amber-500" />
        <StatCard icon={Users} label="Llamadas API" value={data.totals.api_call_count} sub="Peticiones API" color="text-blue-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Relación Local vs. Facturación Electrónica</CardTitle>
          </CardHeader>
          <CardContent className="h-60 flex items-center justify-between text-xs">
            {ratioData[0].value > 0 || ratioData[1].value > 0 ? (
              <>
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={ratioData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                        {ratioData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={LOCAL_VS_ELECTRONIC_COLORS[index]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value: any) => [value, "Facturas"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-3 pl-4">
                  {ratioData.map((d: any, index: number) => {
                    const total = ratioData[0].value + ratioData[1].value;
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
                    return (
                      <div key={d.name} className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-medium text-[11px]">
                          <span className="size-2 rounded-full inline-block" style={{ backgroundColor: LOCAL_VS_ELECTRONIC_COLORS[index] }} />
                          <span>{d.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground pl-3.5">
                          {d.value.toLocaleString()} facturas ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">Sin datos de facturación disponibles</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Calidad de Extracción de Inteligencia Artificial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/20 rounded-md">
                <p className="text-[10px] text-muted-foreground">Confianza Promedio</p>
                <p className="text-lg font-bold">{(data.ai_extraction_quality.average_confidence * 100).toFixed(1)}%</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-md">
                <p className="text-[10px] text-muted-foreground">Tasa de Baja Confianza (&lt;70%)</p>
                <p className={`text-lg font-bold ${data.ai_extraction_quality.error_rate_pct > 15 ? "text-amber-500" : "text-emerald-500"}`}>
                  {data.ai_extraction_quality.error_rate_pct}%
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Peticiones de Alta Confianza (&ge;70%)</span>
                <span>{(data.ai_extraction_quality.total_ai_processed - data.ai_extraction_quality.low_confidence_count).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Peticiones de Baja Confianza / Fallidas</span>
                <span>{data.ai_extraction_quality.low_confidence_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Peticiones AI Totales Analizadas</span>
                <span>{data.ai_extraction_quality.total_ai_processed.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Top Organizaciones por Consultas AI (Ciclo {data.cycle})</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_organizations.ai.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px] text-right">Consultas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_organizations.ai.map((org: any) => (
                    <TableRow key={org.org_id}>
                      <TableCell className="text-[11px] truncate max-w-[150px] font-medium">{org.name}</TableCell>
                      <TableCell className="text-[11px] text-right font-semibold">{org.value.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">Sin consumo AI en este ciclo</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Top Organizaciones por Emisiones e-CF (Ciclo {data.cycle})</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_organizations.ecf.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px] text-right">Comprobantes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_organizations.ecf.map((org: any) => (
                    <TableRow key={org.org_id}>
                      <TableCell className="text-[11px] truncate max-w-[150px] font-medium">{org.name}</TableCell>
                      <TableCell className="text-[11px] text-right font-semibold">{org.value.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">Sin comprobantes e-CF en este ciclo</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StorageSection({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <div className="h-64 bg-muted rounded animate-pulse" />;
  if (!data) return <div className="text-xs text-muted-foreground">No hay datos de almacenamiento disponibles.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] font-medium text-muted-foreground">Peso Total en GB</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{data.total_storage_gb.toFixed(4)} GB</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Mantenido en Supabase Storage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] font-medium text-muted-foreground">Peso Total en MB</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{data.total_storage_mb.toLocaleString()} MB</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">De archivos adjuntos y comprobantes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] font-medium text-muted-foreground">Tamaño Promedio / Org</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {data.organizations.length > 0
                ? `${(data.total_storage_mb / data.organizations.length).toFixed(2)} MB`
                : "—"}
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Estimado por organización activa</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Tipos de Archivos Cargados (Extensión)</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.file_types).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Tipo de Archivo</TableHead>
                    <TableHead className="text-[10px] text-right">Archivos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.file_types).map(([type, count]: [string, any]) => (
                    <TableRow key={type}>
                      <TableCell className="text-[11px] font-mono capitalize">{type}</TableCell>
                      <TableCell className="text-[11px] text-right font-semibold">{count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No hay archivos cargados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Orígenes de Ingestión en Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.file_sources).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Origen de Datos</TableHead>
                    <TableHead className="text-[10px] text-right">Documentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.file_sources).map(([source, count]: [string, any]) => (
                    <TableRow key={source}>
                      <TableCell className="text-[11px] font-mono capitalize">{source}</TableCell>
                      <TableCell className="text-[11px] text-right font-semibold">{count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No hay documentos procesados</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold">Desglose de Almacenamiento por Organización</CardTitle>
        </CardHeader>
        <CardContent>
          {data.organizations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Organización</TableHead>
                  <TableHead className="text-[10px]">ID</TableHead>
                  <TableHead className="text-[10px] text-right">Almacenamiento (MB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.organizations.map((org: any) => (
                  <TableRow key={org.org_id}>
                    <TableCell className="text-[11px] font-medium">{org.name}</TableCell>
                    <TableCell className="text-[11px] font-mono text-muted-foreground">{org.org_id}</TableCell>
                    <TableCell className="text-[11px] text-right font-semibold">{org.storage_mb.toLocaleString()} MB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Ninguna organización ha consumido almacenamiento registrado.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlanubeSection({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) return <div className="h-64 bg-muted rounded animate-pulse" />;
  if (!data) return <div className="text-xs text-muted-foreground">No hay datos de telemetría de Alanube.</div>;

  const summary = data.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Peticiones Totales API" value={summary.total_calls.toLocaleString()} sub="Llamadas al API de Alanube" color="text-blue-500" />
        <StatCard icon={CheckCircle2} label="Peticiones Exitosas" value={summary.success_calls.toLocaleString()} sub={`Tasa éxito: ${summary.success_rate_pct}%`} color="text-emerald-500" />
        <StatCard icon={XCircle} label="Errores de API" value={summary.failed_calls.toLocaleString()} sub={`${(100 - summary.success_rate_pct).toFixed(1)}% tasa de fallos`} color="text-red-500" />
        <StatCard icon={Clock} label="Latencia Promedio" value={`${summary.average_latency_ms} ms`} sub="Tiempo de respuesta del API" color="text-amber-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Peticiones por Acción</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.by_action).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Acción / Endpoint</TableHead>
                    <TableHead className="text-[10px] text-right">Llamadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.by_action).map(([action, count]: [string, any]) => (
                    <TableRow key={action}>
                      <TableCell className="text-[11px] font-mono">{action}</TableCell>
                      <TableCell className="text-[11px] text-right font-semibold">{count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No se ha registrado telemetría aún</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Emisiones por Tipo de e-CF</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.by_ecf_type).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Tipo de Comprobante</TableHead>
                    <TableHead className="text-[10px] text-right">Emitidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.by_ecf_type).map(([type, count]: [string, any]) => {
                    const names: Record<string, string> = {
                      31: "Factura de Crédito Fiscal Electrónica (31)",
                      32: "Factura de Consumo Electrónica (32)",
                      33: "Nota de Débito Electrónica (33)",
                      34: "Nota de Crédito Electrónica (34)",
                      41: "Registro de Proveedores Informales (41)",
                      43: "Gastos Menores Electrónicos (43)",
                      44: "Regímenes Especiales (44)",
                      45: "Gubernamentales (45)",
                      46: "Apoyo a la Exportación (46)",
                      47: "Pagos al Exterior (47)",
                    };
                    return (
                      <TableRow key={type}>
                        <TableCell className="text-[11px] font-medium">{names[type] || `e-CF Tipo ${type}`}</TableCell>
                        <TableCell className="text-[11px] text-right font-semibold">{count.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No se han emitido e-CFs a través del API</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold">Últimos 10 Errores de API Alanube</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_failures.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Organización</TableHead>
                  <TableHead className="text-[10px]">Acción</TableHead>
                  <TableHead className="text-[10px]">Tipo e-CF</TableHead>
                  <TableHead className="text-[10px]">Latencia</TableHead>
                  <TableHead className="text-[10px]">Error del API</TableHead>
                  <TableHead className="text-[10px] text-right">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_failures.map((fail: any) => (
                  <TableRow key={fail.id}>
                    <TableCell className="text-[11px] font-semibold">{fail.organization_name}</TableCell>
                    <TableCell className="text-[11px] font-mono">{fail.action}</TableCell>
                    <TableCell className="text-[11px] font-mono">{fail.ecf_type || "—"}</TableCell>
                    <TableCell className="text-[11px] text-red-500 font-medium">{fail.latency_ms} ms</TableCell>
                    <TableCell className="text-[11px] font-mono max-w-[200px] truncate text-muted-foreground" title={fail.error_message}>
                      {fail.error_message}
                    </TableCell>
                    <TableCell className="text-[11px] text-right text-muted-foreground">
                      {new Date(fail.created_at).toLocaleString("es-DO")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 text-center text-xs text-emerald-600 font-medium bg-emerald-500/5 rounded-md flex items-center justify-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" /> No se han registrado fallas en la API de Alanube.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ----- Finanzas -----
const FINANCE_COLORS = ["#533afd", "#22c55e", "#eab308", "#3b82f6", "#ef4444", "#a855f7"];

function FinanzasTab() {
  const { data: mrr, isLoading: loadingMrr } = useQuery({
    queryKey: ["admin-mrr"],
    queryFn: () => adminApi.getMrr(),
  });

  const { data: churn, isLoading: loadingChurn } = useQuery({
    queryKey: ["admin-churn"],
    queryFn: () => adminApi.getChurn(),
  });

  const { data: subDist, isLoading: loadingSubDist } = useQuery({
    queryKey: ["admin-sub-distribution"],
    queryFn: () => adminApi.getSubDistribution(),
  });

  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [paymentsOffset, setPaymentsOffset] = useState(0);
  const paymentsLimit = 10;

  const { data: paymentsData, isLoading: loadingPayments } = useQuery({
    queryKey: ["admin-payments", paymentStatus, paymentsOffset],
    queryFn: () =>
      adminApi.getPayments({
        status: paymentStatus === "all" ? undefined : paymentStatus,
        limit: paymentsLimit,
        offset: paymentsOffset,
      }),
  });

  if (loadingMrr || loadingChurn || loadingSubDist) {
    return <div className="h-64 bg-muted rounded animate-pulse" />;
  }

  const piePlanData = subDist
    ? Object.entries(subDist.by_plan).map(([name, value]) => ({ name, value }))
    : [];

  const pieStatusData = subDist
    ? Object.entries(subDist.by_status).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      {/* Resumen Financiero */}
      {mrr && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={TrendingUp}
            label="MRR Total"
            value={`$${mrr.mrr.toFixed(2)} USD`}
            sub={`${mrr.active_subscriptions_count} suscripciones activas`}
            color="text-indigo-500"
          />
          <StatCard
            icon={DollarSign}
            label="Base MRR"
            value={`$${mrr.base_mrr.toFixed(2)} USD`}
            sub="Planes principales"
            color="text-emerald-500"
          />
          <StatCard
            icon={Plus}
            label="Addon MRR"
            value={`$${mrr.addon_mrr.toFixed(2)} USD`}
            sub="Servicios adicionales"
            color="text-blue-500"
          />
          <StatCard
            icon={TrendingDown}
            label="Riesgo de Churn"
            value={churn?.churn_risk_count ?? 0}
            sub="Clientes inactivos (14 días)"
            color="text-amber-500"
          />
        </div>
      )}

      {/* Gráficos de distribución */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Distribución por Planes de Suscripción</CardTitle>
          </CardHeader>
          <CardContent className="h-60 flex items-center justify-between text-xs">
            {piePlanData.length > 0 ? (
              <>
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={piePlanData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                        {piePlanData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={FINANCE_COLORS[index % FINANCE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value: any) => [value, "Suscripciones"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-1.5 pl-4 overflow-y-auto max-h-full">
                  {piePlanData.map((item: any, index: number) => (
                    <div key={item.name} className="flex flex-col">
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <span className="size-2 rounded-full inline-block" style={{ backgroundColor: FINANCE_COLORS[index % FINANCE_COLORS.length] }} />
                        <span className="truncate max-w-[120px]">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground pl-3.5">
                        {item.value} suscripciones ({(item.value / (mrr?.active_subscriptions_count || 1) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">Sin datos de distribución por plan</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold">Distribución por Estado de Suscripción</CardTitle>
          </CardHeader>
          <CardContent className="h-60 flex items-center justify-between text-xs">
            {pieStatusData.length > 0 ? (
              <>
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                        {pieStatusData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={FINANCE_COLORS[(index + 3) % FINANCE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value: any) => [value, "Suscripciones"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-1.5 pl-4 overflow-y-auto max-h-full">
                  {pieStatusData.map((item: any, index: number) => (
                    <div key={item.name} className="flex flex-col">
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <span className="size-2 rounded-full inline-block" style={{ backgroundColor: FINANCE_COLORS[(index + 3) % FINANCE_COLORS.length] }} />
                        <span className="truncate max-w-[120px]">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground pl-3.5">
                        {item.value} suscripciones
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">Sin datos de distribución por estado</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Riesgos de Churn y Suscripciones canceladas recientemente */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> Alerta de Riesgo de Churn (Clientes Inactivos &gt; 14 días)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto">
            {churn && churn.churn_risks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px]">Plan</TableHead>
                    <TableHead className="text-[10px]">Facturas Totales</TableHead>
                    <TableHead className="text-[10px]">Fin Ciclo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {churn.churn_risks.map((org) => (
                    <TableRow key={org.organization_id} className="hover:bg-amber-50/20 text-[11px]">
                      <TableCell className="font-medium">{org.organization_name}</TableCell>
                      <TableCell>{org.plan_name}</TableCell>
                      <TableCell>{org.total_invoices}</TableCell>
                      <TableCell>{org.billing_cycle_end ? new Date(org.billing_cycle_end).toLocaleDateString("es-DO") : "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center">No hay clientes con riesgo de abandono detectados. ¡Excelente!</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
              <TrendingDown className="size-4" /> Cancelaciones en los Últimos 90 Días
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto">
            {churn && churn.lost_subscriptions_last_90_days.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px]">Plan</TableHead>
                    <TableHead className="text-[10px]">Estado</TableHead>
                    <TableHead className="text-[10px]">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {churn.lost_subscriptions_last_90_days.map((sub) => (
                    <TableRow key={sub.subscription_id} className="hover:bg-red-50/20 text-[11px]">
                      <TableCell className="font-medium">{sub.organization_name}</TableCell>
                      <TableCell>{sub.plan_name}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-[9px] px-1 py-0">{sub.status}</Badge>
                      </TableCell>
                      <TableCell>{new Date(sub.lost_at).toLocaleDateString("es-DO")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center">No se han registrado cancelaciones en los últimos 90 días.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial de Transacciones (Mio Payments) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-xs font-semibold">Historial de Transacciones (Pasarela Mio/GeoPagos)</CardTitle>
          <div className="flex gap-2">
            <Select value={paymentStatus} onValueChange={(val) => { setPaymentStatus(val); setPaymentsOffset(0); }}>
              <SelectTrigger className="w-[120px] h-8 text-[11px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="SUCCESS">Completados</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="FAILED">Fallidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPayments ? (
            <div className="h-32 bg-muted rounded animate-pulse" />
          ) : paymentsData && paymentsData.payments.length > 0 ? (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">UUID Orden</TableHead>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px]">Monto</TableHead>
                    <TableHead className="text-[10px]">Estado</TableHead>
                    <TableHead className="text-[10px]">Factura Asoc.</TableHead>
                    <TableHead className="text-[10px]">Creado el</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsData.payments.map((p) => (
                    <TableRow key={p.id} className="text-[11px]">
                      <TableCell className="font-mono text-[10px] truncate max-w-[100px]">{p.mio_order_uuid}</TableCell>
                      <TableCell>{p.organization_name || "N/A"}</TableCell>
                      <TableCell className="font-semibold">
                        {p.currency === "214" || p.currency === "DOP" ? "RD$" : "$"} {p.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="text-[9px] px-1 py-0"
                          variant={
                            p.status === "SUCCESS"
                              ? "default"
                              : p.status === "PENDING"
                              ? "outline"
                              : "destructive"
                          }
                        >
                          {p.status === "SUCCESS" ? "Completado" : p.status === "PENDING" ? "Pendiente" : "Fallido"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.invoice_number ? (
                          <span className="text-muted-foreground">{p.invoice_number} ({p.currency === "214" || p.currency === "DOP" ? "RD$" : "$"} {p.invoice_total.toFixed(2)})</span>
                        ) : (
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </TableCell>
                      <TableCell>{p.created_at ? new Date(p.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Pagination */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] text-muted-foreground">Mostrando {paymentsData.payments.length} de {paymentsData.total}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    disabled={paymentsOffset === 0}
                    onClick={() => setPaymentsOffset(Math.max(0, paymentsOffset - paymentsLimit))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    disabled={paymentsOffset + paymentsLimit >= paymentsData.total}
                    onClick={() => setPaymentsOffset(paymentsOffset + paymentsLimit)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">No se encontraron pagos con los filtros seleccionados.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ----- Suscripciones -----
function SuscripcionesTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const limit = 15;

  const { data: subsData, isLoading: loadingSubs, refetch } = useQuery({
    queryKey: ["admin-subscriptions", statusFilter, offset],
    queryFn: () =>
      adminApi.listSubscriptions({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit,
        offset,
      }),
  });

  const { data: plans } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: () => adminApi.listSubscriptionPlans(),
  });

  const queryClient = useQueryClient();

  // Dialog State for Credit (Grace days)
  const [creditSub, setCreditSub] = useState<AdminSubscription | null>(null);
  const [creditDays, setCreditDays] = useState<number>(30);
  const [creditReason, setCreditReason] = useState<string>("");

  // Dialog State for Custom Overrides / Plan change
  const [overrideSub, setOverrideSub] = useState<AdminSubscription | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [subStatus, setSubStatus] = useState<string>("");
  const [customPrice, setCustomPrice] = useState<string>("");
  const [customLimits, setCustomLimits] = useState<string>("");

  const creditMutation = useMutation({
    mutationFn: ({ subId, days, reason }: { subId: string; days: number; reason: string }) =>
      adminApi.creditSubscription(subId, { days, reason }),
    onSuccess: () => {
      toast.success("Días de gracia inyectados correctamente");
      setCreditSub(null);
      setCreditReason("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-mrr"] });
    },
    onError: (err: any) => {
      toast.error(`Error: ${err.message || "No se pudo inyectar días"}`);
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({ subId, data }: { subId: string; data: any }) =>
      adminApi.updateSubscription(subId, data),
    onSuccess: () => {
      toast.success("Suscripción modificada con éxito");
      setOverrideSub(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-mrr"] });
    },
    onError: (err: any) => {
      toast.error(`Error: ${err.message || "No se pudo actualizar"}`);
    },
  });

  const handleOpenOverride = (sub: AdminSubscription) => {
    setOverrideSub(sub);
    setSelectedPlanId(sub.plan_id);
    setSubStatus(sub.status);
    setCustomPrice(sub.limits?.custom_price_cents ? String(sub.limits.custom_price_cents / 100) : "");
    // Extract overrides only
    setCustomLimits(sub.limits ? JSON.stringify(sub.limits, null, 2) : "{}");
  };

  const handleApplyOverride = () => {
    if (!overrideSub) return;
    let parsedLimits = null;
    if (customLimits.trim()) {
      try {
        parsedLimits = JSON.parse(customLimits);
      } catch (e) {
        toast.error("JSON de límites inválido");
        return;
      }
    }
    const priceCents = customPrice ? Math.round(parseFloat(customPrice) * 100) : undefined;

    overrideMutation.mutate({
      subId: overrideSub.id,
      data: {
        plan_id: selectedPlanId,
        status: subStatus,
        custom_price_cents: priceCents,
        custom_limits_json: parsedLimits,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-semibold">Control de Suscripciones y Límites B2B Custom</h2>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setOffset(0); }}>
            <SelectTrigger className="w-[130px] h-8 text-[11px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="text-[11px]">
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="trialing">Período Prueba</SelectItem>
              <SelectItem value="past_due">Atrasado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
              <SelectItem value="expired">Expirado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loadingSubs ? (
            <div className="h-40 bg-muted rounded animate-pulse" />
          ) : subsData && subsData.subscriptions.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Organización</TableHead>
                    <TableHead className="text-[10px]">Plan</TableHead>
                    <TableHead className="text-[10px]">Estado</TableHead>
                    <TableHead className="text-[10px]">Ciclo Facturación</TableHead>
                    <TableHead className="text-[10px]">Límites e-CF/IA</TableHead>
                    <TableHead className="text-[10px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subsData.subscriptions.map((sub) => (
                    <TableRow key={sub.id} className="text-[11px]">
                      <TableCell className="font-semibold">{sub.organization_name || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{sub.plan_name || "Desconocido"}</span>
                          {sub.limits?.custom_price_cents && (
                            <span className="text-[10px] text-indigo-600 font-medium">B2B Override: RD$ {(sub.limits.custom_price_cents / 100).toFixed(2)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="text-[9px] px-1 py-0"
                          variant={
                            sub.status === "active"
                              ? "default"
                              : sub.status === "trialing"
                              ? "outline"
                              : sub.status === "past_due"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {sub.status === "active" ? "Activo" : sub.status === "trialing" ? "Prueba" : sub.status === "past_due" ? "Atrasado" : sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-[10px]">
                          <span>Inicia: {sub.billing_cycle_start ? new Date(sub.billing_cycle_start).toLocaleDateString("es-DO") : "N/A"}</span>
                          <span>Vence: {sub.billing_cycle_end ? new Date(sub.billing_cycle_end).toLocaleDateString("es-DO") : "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-[10px] text-muted-foreground">
                          <span>e-CF: {sub.limits?.max_ecf_monthly ?? "N/A"} / mes</span>
                          <span>Consultas IA: {sub.limits?.max_ai_queries_monthly ?? "N/A"} / mes</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] px-2"
                          type="button"
                          onClick={() => setCreditSub(sub)}
                        >
                          <Calendar className="size-3.5 mr-1 text-emerald-600" /> + Días
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] px-2"
                          type="button"
                          onClick={() => handleOpenOverride(sub)}
                        >
                          <Settings2 className="size-3.5 mr-1 text-primary" /> Override
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] text-muted-foreground">Mostrando {subsData.subscriptions.length} de {subsData.total}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    disabled={offset + limit >= subsData.total}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">No se encontraron suscripciones.</div>
          )}
        </CardContent>
      </Card>

      {/* Credit / Grace Days Dialog */}
      {creditSub && (
        <AlertDialog open={!!creditSub} onOpenChange={() => setCreditSub(null)}>
          <AlertDialogContent className="max-w-md text-xs">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm font-semibold">Crédito de Días de Gracia (Grace Days)</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-[11px]">
                Inyectar días de gracia a la organización <span className="font-semibold text-foreground">{creditSub.organization_name}</span>. Esto extenderá la fecha de vencimiento actual ({creditSub.billing_cycle_end ? new Date(creditSub.billing_cycle_end).toLocaleDateString("es-DO") : "N/A"}).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 my-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-medium">Días a agregar</label>
                <Input
                  type="number"
                  value={creditDays}
                  onChange={(e) => setCreditDays(parseInt(e.target.value) || 0)}
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-medium">Razón / Justificación</label>
                <Input
                  type="text"
                  placeholder="Ej: Compensación por interrupción del servicio o solicitud B2B"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="h-8 text-[11px]"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-8 text-[11px]" onClick={() => setCreditSub(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="h-8 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                disabled={creditDays <= 0 || !creditReason.trim() || creditMutation.isPending}
                onClick={() => creditMutation.mutate({ subId: creditSub.id, days: creditDays, reason: creditReason })}
              >
                {creditMutation.isPending ? "Procesando..." : "Aplicar días"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Override / Plan Custom Dialog */}
      {overrideSub && (
        <AlertDialog open={!!overrideSub} onOpenChange={() => setOverrideSub(null)}>
          <AlertDialogContent className="max-w-lg text-xs overflow-y-auto max-h-[90vh]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm font-semibold">Modificar Suscripción y Límites (B2B Override)</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-[11px]">
                Configurar plan personalizado y overrides para <span className="font-semibold text-foreground">{overrideSub.organization_name}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium">Plan Principal</label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue placeholder="Seleccione un plan" />
                    </SelectTrigger>
                    <SelectContent className="text-[11px]">
                      {plans?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.display_name} (${p.price_monthly.toFixed(2)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium">Estado</label>
                  <Select value={subStatus} onValueChange={setSubStatus}>
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent className="text-[11px]">
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="trialing">Trialing</SelectItem>
                      <SelectItem value="past_due">Past Due</SelectItem>
                      <SelectItem value="canceled">Cancelado</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium">Precio Mensual Override (USD) <span className="text-[10px] text-muted-foreground">(Dejar vacío para usar precio de plan)</span></label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ej: 99.00"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="h-8 text-[11px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium">JSON de Overrides de Límites <span className="text-[10px] text-muted-foreground">(Formatos válidos: max_users, max_ecf_monthly, max_ai_queries_monthly, etc.)</span></label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  placeholder='{\n  "max_users": 15,\n  "max_ecf_monthly": 500\n}'
                  value={customLimits}
                  onChange={(e) => setCustomLimits(e.target.value)}
                />
              </div>
            </div>
            <AlertDialogFooter className="pt-2">
              <AlertDialogCancel className="h-8 text-[11px]" onClick={() => setOverrideSub(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="h-8 text-[11px]"
                disabled={overrideMutation.isPending}
                onClick={handleApplyOverride}
              >
                {overrideMutation.isPending ? "Guardando..." : "Guardar cambios"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

