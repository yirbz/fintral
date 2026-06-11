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
} from "lucide-react";
import { toast } from "sonner";
import { adminApi, type AdminStats, type AdminUser, type AdminTenant, type AdminTenantDetail, type AuditEvent, type HealthCheck } from "@/lib/api/admin";
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

const TABS = [
  { id: "overview", label: "Resumen" },
  { id: "users", label: "Usuarios" },
  { id: "cuentas", label: "Cuentas" },
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

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedTenantId(null)}>
            ← Volver
          </Button>
          <Badge variant={t.deleted_at ? "destructive" : "default"} className="text-[10px]">
            {t.deleted_at ? "Eliminado" : t.is_active ? "Activo" : "Inactivo"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{t.plan}</Badge>
        </div>

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
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => ask("Eliminar tenant", "¿Eliminar este tenant y todos sus recursos? Los datos fiscales se preservarán por 10 años.", "Eliminar", () => deleteTenantMut.mutate(t.id))}>
              <Trash2 className="size-3 mr-1" /> Eliminar
            </Button>
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
      <div className="flex items-center gap-2">
        <Input
          value={tenantSearch}
          onChange={(e) => setTenantSearch(e.target.value)}
          placeholder="Buscar tenant..."
          className="h-7 text-xs max-w-xs"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="size-3" />
          Ver eliminados
        </label>
      </div>

      {tenantsQuery_isLoading ? (
        <div className="h-20 bg-muted rounded animate-pulse" />
      ) : (
        <div className="grid gap-1">
          {(tenantsQuery_data?.tenants ?? []).map((t) => (
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
                {t.deleted_at && <Badge variant="destructive" className="text-[10px]">Eliminado</Badge>}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                <span>{t.user_count} usuarios</span>
                <span>{t.organization_count} orgs</span>
                <ChevronRight className="size-3.5" />
              </div>
            </div>
          ))}
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
  onDelete, onRestore, onDeleteUser, onRestoreUser,
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
              {org.certification_status !== "none" && (
                <Badge variant="outline" className="text-[10px]">{org.certification_status}</Badge>
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
        <div className="border-t px-3 py-1.5 space-y-0.5">
          <div className="grid grid-cols-2 gap-x-4 text-[10px] text-muted-foreground mb-1.5">
            <span>RNC: {org.tax_id || "—"}</span>
            <span>e-CF: {org.is_ecf_authorized ? "Sí" : "No"}</span>
          </div>
          {org.users.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Sin usuarios</p>
          ) : (
            org.users.map((u) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
}


// ----- Audit -----
function AuditTab() {
  const [limit, setLimit] = useState(100);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-audit", limit],
    queryFn: () => adminApi.getAuditLogs({ limit }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
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
