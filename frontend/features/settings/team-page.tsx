"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Crown,
  ShieldCheck,
  Eye,
  UserRound,
  Mail,
  UserPlus,
  X,
  ChevronDown,
  Check,
  CheckCircle2,
  Info,
  Shield,
  UserCheck,
  Search,
  Link as LinkIcon,
} from "lucide-react";

import { getOrganization, type OrgMember } from "@/lib/api/settings";
import {
  removeMember,
  updateMemberRole,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "@/lib/api/organizations";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

// ── Role config ───────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  string,
  {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    permissions: string;
  }
> = {
  owner: {
    label: "Propietario",
    description: "Control total de la organización",
    icon: Crown,
    color: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    permissions: "Acceso completo · Facturación · Configuración · Miembros",
  },
  admin: {
    label: "Administrador",
    description: "Gestiona la organización y sus miembros",
    icon: ShieldCheck,
    color: "text-primary bg-primary/10 border-primary/20",
    permissions: "Facturas · Configuración · Invitar miembros · Reportes",
  },
  member: {
    label: "Miembro",
    description: "Acceso a facturas y operaciones diarias",
    icon: UserRound,
    color: "text-foreground bg-muted border-border",
    permissions: "Facturas · Subir archivos · Reportes básicos",
  },
  viewer: {
    label: "Observador",
    description: "Solo lectura de facturas y reportes",
    icon: Eye,
    color: "text-muted-foreground bg-muted/50 border-border/60",
    permissions: "Ver facturas · Ver reportes",
  },
};

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 30) return `hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12)
    return `hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"}`;
  const diffYears = Math.floor(diffMonths / 12);
  return `hace ${diffYears} ${diffYears === 1 ? "año" : "años"}`;
}

// ── Role badge ────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.member;
  const Icon = config.icon;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] h-4 px-1.5 font-medium flex items-center gap-1 ${config.color}`}
    >
      <Icon className="size-2.5" />
      {config.label}
    </Badge>
  );
}

// ── Invite dialog ─────────────────────────────────────────────────

function InviteDialog({
  orgId,
  onSuccess,
}: {
  orgId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string } | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => createInvitation(orgId, { email, role }),
    onSuccess: (result: any) => {
      toast.success(`Invitación creada para ${email}`);
      setInviteResult({ token: result.token, email });
      // Don't close dialog — show the invite link
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Error al invitar", { description: err.message });
    },
  });

  const inviteUrl = inviteResult
    ? `${window.location.origin}/accept-invite?token=${inviteResult.token}`
    : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar. Selecciona y copia manualmente.");
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setEmail("");
    setRole("member");
    setInviteResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (o) setOpen(true);
      else resetAndClose();
    }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-3.5" data-icon="inline-start" />
          Invitar miembro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">
            {inviteResult ? "Enlace de invitación" : "Invitar miembro al equipo"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {inviteResult
              ? "Comparte este enlace con la persona para que cree su cuenta y se una."
              : "Crea una invitación para que alguien se una a la organización."}
          </DialogDescription>
        </DialogHeader>

        {inviteResult ? (
          <>
            <div className="flex flex-col gap-3 py-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>Invitación creada para <strong>{inviteResult.email}</strong></span>
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Enlace de invitación
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={inviteUrl}
                    readOnly
                    className="font-mono text-[11px] bg-muted/50"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                    <LinkIcon className="size-3.5" />
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  El enlace expira en 24 horas. Al abrirlo, la persona podrá crear su cuenta y acceder.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={resetAndClose}>
                Listo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 py-3">
              <div>
                <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    type="email"
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Rol de acceso
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["admin", "member", "viewer"].map((r) => {
                      const config = ROLE_CONFIG[r];
                      const Icon = config.icon;
                      return (
                        <SelectItem key={r} value={r}>
                          <div className="flex items-center gap-2 py-0.5">
                            <Icon className="size-3.5 text-muted-foreground" />
                            <div>
                              <span className="text-xs font-medium">
                                {config.label}
                              </span>
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                {config.permissions}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Role info card */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-start gap-2">
                  <Info className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">
                      {ROLE_CONFIG[role].label}
                    </span>
                    : {ROLE_CONFIG[role].description}.{" "}
                    {ROLE_CONFIG[role].permissions}.
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => inviteMutation.mutate()}
                disabled={!email || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserPlus className="size-3.5" />
                )}
                Enviar invitación
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Pending invitations section ───────────────────────────────────

function PendingInvitations({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();

  const {data: invitesQuery_data} = useQuery({
    queryKey: ["org-invitations", orgId],
    queryFn: () => listInvitations(orgId),
    enabled: !!orgId,
    refetchInterval: 15_000,
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(orgId, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["org-invitations", orgId],
      });
      toast.success("Invitación revocada");
    },
    onError: (err: Error) => {
      toast.error("Error", { description: err.message });
    },
  });

  const invites = invitesQuery_data ?? [];

  if (invites.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          Invitaciones pendientes
        </span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
          {invites.length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/40 bg-muted/15 px-3 py-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="size-6 rounded-md bg-muted">
                <AvatarFallback className="rounded-md text-[9px] font-medium text-muted-foreground bg-muted">
                  <Mail className="size-3" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {inv.email}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  Pendiente · expira{" "}
                  {new Date(inv.expires_at).toLocaleDateString("es-DO")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <RoleBadge role={inv.role} />
              <Button
                variant="ghost"
                size="icon"
                className="size-6 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10"
                onClick={() => revokeMutation.mutate(inv.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Member row ────────────────────────────────────────────────────

function MemberRow({
  member,
  orgId,
  currentUserId,
  canManage,
  onRoleChange,
  onRemove,
}: {
  member: OrgMember;
  orgId: string;
  currentUserId?: string;
  canManage: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
}) {
  const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
  const initials = member.full_name
    ? member.full_name.substring(0, 2).toUpperCase()
    : member.email.substring(0, 2).toUpperCase();
  const joinedAgo = relativeTime(member.joined_at);
  const isSelf = member.id === currentUserId;
  const [removeConfirm, setRemoveConfirm] = useState(false);

  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar className="size-9 rounded-lg shrink-0 ring-1 ring-border/50">
        <AvatarImage
          src={member.avatar_url || undefined}
          alt={member.full_name}
        />
        <AvatarFallback className="rounded-lg text-xs font-semibold bg-primary/10 text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-1 min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
            {member.full_name || member.email}
            {isSelf && (
              <Badge
                variant="outline"
                className="text-[9px] h-3.5 px-1 font-normal text-muted-foreground/60 border-muted-foreground/20"
              >
                tú
              </Badge>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-2">
            <span>{member.email}</span>
            {member.job_title && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>{member.job_title}</span>
              </>
            )}
            {joinedAgo && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-muted-foreground/50">
                  {joinedAgo}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RoleBadge role={member.role} />

          {/* Role changer */}
          {canManage && member.role !== "owner" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/60"
                >
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  Cambiar rol
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["admin", "member", "viewer"].map((r) => {
                  const cfg = ROLE_CONFIG[r];
                  const Icon = cfg.icon;
                  return (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => {
                        if (r !== member.role) onRoleChange(member.id, r);
                      }}
                      disabled={r === member.role}
                      className="flex items-center gap-2 py-1.5 px-2 text-xs"
                    >
                      <Icon className="size-3.5 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{cfg.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {cfg.description}
                        </span>
                      </div>
                      {r === member.role && (
                        <Check className="size-3 ml-auto text-primary" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Remove button */}
          {canManage && member.role !== "owner" && (
            <AlertDialog
              open={removeConfirm}
              onOpenChange={setRemoveConfirm}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="size-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="sm:max-w-[380px]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm font-heading">
                    Eliminar miembro
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs">
                    ¿Seguro que deseas eliminar a{" "}
                    <span className="font-medium text-foreground">
                      {member.full_name || member.email}
                    </span>{" "}
                    de la organización? Perderá acceso a todas las facturas y
                    datos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="text-xs">
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                    onClick={() => {
                      onRemove(member.id);
                      setRemoveConfirm(false);
                    }}
                  >
                    Eliminar miembro
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Role info section ─────────────────────────────────────────────

function RoleInfoCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
        const Icon = cfg.icon;
        return (
          <div
            key={key}
            className="rounded-lg border border-border/40 bg-muted/15 p-2.5"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-foreground">
                {cfg.label}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
              {cfg.permissions}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Main TeamPage ─────────────────────────────────────────────────

export function TeamPage() {
  const session = useSession();
  const { activeOrgId, userOrgs, switchOrg } = useOrg();
  const queryClient = useQueryClient();

  const {data: orgQuery_data, isLoading: orgQuery_isLoading} = useQuery({
    queryKey: ["organization-settings"],
    queryFn: getOrganization,
  });

  const isAdmin =
    session.data?.role === "owner" || session.data?.role === "admin";
  const members = orgQuery_data?.members ?? [];
  const memberCount = orgQuery_data?.member_count ?? 0;
  const currentUserId = session.data?.user?.id;
  const currentOrgId = activeOrgId ?? orgQuery_data?.id;
  const currentOrgName =
    userOrgs.find((o) => o.id === currentOrgId)?.name ??
    session.data?.organization?.name ??
    "Organización";

  // Count by role
  const roleCounts: Record<string, number> = {};
  for (const m of members) {
    roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
  }

  // Member management mutations
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(currentOrgId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
      toast.success("Miembro eliminado");
    },
    onError: (err: Error) => {
      toast.error("Error", { description: err.message });
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateMemberRole(currentOrgId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
      toast.success("Rol actualizado");
    },
    onError: (err: Error) => {
      toast.error("Error", { description: err.message });
    },
  });

  const handleRemove = (userId: string) => {
    removeMutation.mutate(userId);
  };

  const handleRoleChange = (userId: string, role: string) => {
    roleMutation.mutate({ userId, role });
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Users className="size-3.5 text-muted-foreground" />
            Equipo
          </CardTitle>
          <CardDescription className="text-xs">
            Personas con acceso a {currentOrgName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Sin permisos de administración
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60 max-w-xs">
              Solo los administradores y propietarios pueden gestionar los
              miembros del equipo.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-heading font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Equipo de {currentOrgName}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {memberCount}{" "}
            {memberCount === 1 ? "persona tiene" : "personas tienen"} acceso a
            esta organización.
          </p>
        </div>
        {currentOrgId && (
          <InviteDialog
            orgId={currentOrgId}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: ["organization-settings"],
              });
              queryClient.invalidateQueries({
                queryKey: ["org-invitations", currentOrgId],
              });
            }}
          />
        )}
      </div>

      {/* ── Quick stats ── */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const count = roleCounts[key] ?? 0;
          if (count === 0) return null;
          const Icon = cfg.icon;
          return (
            <Badge
              key={key}
              variant="outline"
              className={`text-[11px] h-5 px-2 font-medium flex items-center gap-1.5 ${cfg.color}`}
            >
              <Icon className="size-3" />
              {count} {cfg.label.toLowerCase()}
              {count !== 1 ? "s" : ""}
            </Badge>
          );
        })}
      </div>

      {/* ── Pending invitations ── */}
      {currentOrgId && <PendingInvitations orgId={currentOrgId} />}

      {/* ── Members list ── */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <UserCheck className="size-3.5 text-muted-foreground" />
            Miembros
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orgQuery_isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No hay miembros registrados
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60 max-w-xs">
                Invita personas al equipo para empezar a colaborar en la gestión
                de facturas.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40 -mx-6 px-6">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  orgId={currentOrgId ?? ""}
                  currentUserId={currentUserId}
                  canManage={isAdmin}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Role reference ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-heading flex items-center gap-2 text-muted-foreground">
            <Shield className="size-3" />
            Roles y permisos
          </CardTitle>
          <CardDescription className="text-[10px]">
            Qué puede hacer cada rol dentro de la organización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleInfoCards />
        </CardContent>
      </Card>
    </div>
  );
}
