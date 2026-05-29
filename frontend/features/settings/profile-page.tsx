"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Camera, Loader2, Check, Building2, Calendar, Shield, Briefcase, Phone, Mail, BadgeCheck, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/hooks/use-session";
import { updateProfile, uploadAvatar, deleteAvatar } from "@/lib/api/settings";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  owner: { label: "Propietario", variant: "default" },
  admin: { label: "Administrador", variant: "default" },
  member: { label: "Miembro", variant: "secondary" },
  viewer: { label: "Observador", variant: "outline" },
};

const PLAN_LABELS: Record<string, string> = {
  free: "Plan Gratuito",
  starter: "Plan Starter",
  pro: "Plan Pro",
  enterprise: "Plan Enterprise",
};

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="flex flex-1 min-w-0 items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="text-xs font-medium text-foreground truncate text-right">{value}</span>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (session.data) {
      const u = session.data.user;
      setFullName(u.full_name || "");
      setJobTitle(u.job_title || "");
      setPhone(u.phone || "");
      setAvatarUrl(u.avatar_url || null);
    }
  }, [session.data]);

  // Track dirty state
  useEffect(() => {
    if (!session.data) return;
    const u = session.data.user;
    const dirty =
      fullName !== (u.full_name || "") ||
      jobTitle !== (u.job_title || "") ||
      phone !== (u.phone || "");
    setHasChanges(dirty);
  }, [fullName, jobTitle, phone, session.data]);

  const profileMutation = useMutation({
    mutationFn: async () =>
      updateProfile({ full_name: fullName, job_title: jobTitle, phone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Perfil actualizado");
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast.error("Error al actualizar perfil", { description: err.message });
    },
  });

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no debe superar 2MB");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadAvatar(file);
      setAvatarUrl(res.avatar_url);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Foto de perfil actualizada");
    } catch (err: unknown) {
      toast.error("Error al subir imagen", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleAvatarDelete() {
    setDeleting(true);
    try {
      await deleteAvatar();
      setAvatarUrl(null);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Foto de perfil eliminada");
    } catch (err: unknown) {
      toast.error("Error al eliminar la imagen", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setDeleting(false);
    }
  }

  const u = session.data?.user;
  const org = session.data?.organization;
  const role = session.data?.role ?? "member";
  const plan = session.data?.tenant?.plan ?? "free";
  const initials = (u?.full_name || "U").substring(0, 2).toUpperCase();
  const roleInfo = ROLE_LABELS[role] ?? ROLE_LABELS.member;
  const memberSince = u?.created_at
    ? (() => {
        const d = new Date(u.created_at);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 1) return "hoy";
        if (diffDays === 1) return "hace 1 día";
        if (diffDays < 30) return `hace ${diffDays} días`;
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths < 12) return `hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"}`;
        const diffYears = Math.floor(diffMonths / 12);
        return `hace ${diffYears} ${diffYears === 1 ? "año" : "años"}`;
      })()
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identidad ── */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between pb-4">
          <div>
            <CardTitle className="text-sm font-heading">Identidad</CardTitle>
            <CardDescription className="text-xs">
              Nombre, cargo y foto de perfil.
            </CardDescription>
          </div>
          <Button
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending || !hasChanges}
            size="sm"
            className="shrink-0"
          >
            {profileMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {profileMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="size-20 rounded-2xl ring-2 ring-border">
                <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                <AvatarFallback className="rounded-2xl text-xl font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-200"
              >
                {uploading ? (
                  <Loader2 className="size-5 text-white animate-spin" />
                ) : (
                  <Camera className="size-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                aria-label="Subir foto de perfil"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">
                {u?.full_name || "Sin nombre"}
              </p>
              <p className="text-xs text-muted-foreground">
                {u?.job_title || "Sin cargo asignado"}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant={roleInfo.variant} className="text-[10px] h-4 px-1.5">
                  {roleInfo.label}
                </Badge>
                {u?.is_superuser && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-600">
                    Superadmin
                  </Badge>
                )}
              </div>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  disabled={deleting}
                  className="text-[11px] text-destructive hover:underline font-medium text-left mt-2 flex items-center gap-1 w-fit"
                >
                  {deleting ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                  Eliminar foto de perfil
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nombre completo
              </Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cargo / Posición
              </Label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ej: Contador, Gerente Financiero"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Teléfono
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="809-555-0100"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Correo electrónico
              </Label>
              <Input
                value={u?.email ?? ""}
                disabled
                className="text-muted-foreground bg-muted/40 cursor-not-allowed"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                El correo no se puede cambiar desde aquí.
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            PNG, JPG. Máximo 2MB. Haz clic en la foto para cambiarla.
          </p>
        </CardContent>
      </Card>

      {/* ── Cuenta + Contexto ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cuenta */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Estado de cuenta</CardTitle>
            <CardDescription className="text-xs">
              Información de tu membresía y acceso.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/50">
              <InfoRow
                icon={Shield}
                label="Rol"
                value={
                  <Badge variant={roleInfo.variant} className="text-[10px] h-4 px-1.5">
                    {roleInfo.label}
                  </Badge>
                }
              />
              <InfoRow
                icon={BadgeCheck}
                label="Plan"
                value={
                  <span className="text-primary font-semibold">
                    {PLAN_LABELS[plan] ?? plan}
                  </span>
                }
              />
              <InfoRow
                icon={Calendar}
                label="Miembro desde"
                value={memberSince ?? "—"}
              />
              <InfoRow
                icon={User}
                label="Estado"
                value={
                  <Badge
                    variant={u?.is_active ? "default" : "secondary"}
                    className={`text-[10px] h-4 px-1.5 ${u?.is_active ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" : ""}`}
                  >
                    {u?.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Organización contextual */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Tu organización</CardTitle>
            <CardDescription className="text-xs">
              Datos de la empresa en la que operas.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/50">
              <InfoRow
                icon={Building2}
                label="Empresa"
                value={org?.name ?? "—"}
              />
              <InfoRow
                icon={Briefcase}
                label="RNC"
                value={org?.tax_id ?? (
                  <span className="text-muted-foreground/60 italic">Sin configurar</span>
                )}
              />
              <InfoRow
                icon={Globe}
                label="País"
                value={org?.country === "DOM" ? "República Dominicana" : (org?.country ?? "—")}
              />
              <InfoRow
                icon={Phone}
                label="Teléfono"
                value={org?.phone ?? (
                  <span className="text-muted-foreground/60 italic">Sin configurar</span>
                )}
              />
              {org?.email_contact && (
                <InfoRow icon={Mail} label="Email" value={org.email_contact} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
