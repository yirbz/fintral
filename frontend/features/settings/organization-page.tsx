"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Check,
  Building2,
  Users,
  Crown,
  ShieldCheck,
  Eye,
  UserRound,
  Phone,
  Mail,
  MapPin,
  Link,
  Hash,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { getOrganization, updateOrganization, type OrgMember } from "@/lib/api/settings";
import { useSession } from "@/hooks/use-session";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ROLE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  owner: {
    label: "Propietario",
    icon: Crown,
    color: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
  admin: {
    label: "Administrador",
    icon: ShieldCheck,
    color: "text-primary bg-primary/10 border-primary/20",
  },
  member: {
    label: "Miembro",
    icon: UserRound,
    color: "text-foreground bg-muted border-border",
  },
  viewer: {
    label: "Observador",
    icon: Eye,
    color: "text-muted-foreground bg-muted/50 border-border/60",
  },
};

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
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
}

function MemberRow({ member }: { member: OrgMember }) {
  const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
  const RoleIcon = config.icon;
  const initials = member.full_name
    ? member.full_name.substring(0, 2).toUpperCase()
    : member.email.substring(0, 2).toUpperCase();
  const joinedAgo = relativeTime(member.joined_at);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar className="size-8 rounded-lg shrink-0">
        <AvatarImage src={member.avatar_url || undefined} alt={member.full_name} />
        <AvatarFallback className="rounded-lg text-xs font-semibold bg-primary/10 text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-1 min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {member.full_name || member.email}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {member.job_title ? `${member.job_title} · ` : ""}
            {member.email}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1.5 font-medium flex items-center gap-1 ${config.color}`}
          >
            <RoleIcon className="size-2.5" />
            {config.label}
          </Badge>
          {joinedAgo && (
            <span className="text-[10px] text-muted-foreground/60">{joinedAgo}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrganizationPage() {
  const session = useSession();
  const queryClient = useQueryClient();

  const orgQuery = useQuery({
    queryKey: ["organization-settings"],
    queryFn: getOrganization,
  });

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [emailContact, setEmailContact] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("DOM");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [province, setProvince] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (orgQuery.data) {
      const d = orgQuery.data;
      setName(d.name || "");
      setTaxId(d.tax_id || "");
      setPhone(d.phone || "");
      setEmailContact(d.email_contact || "");
      setWebsite(d.website || "");
      setCountry(d.country || "DOM");
      setFiscalAddress(d.fiscal_address || "");
      setMunicipality(d.municipality || "");
      setProvince(d.province || "");
    }
  }, [orgQuery.data]);

  // Dirty tracking
  useEffect(() => {
    if (!orgQuery.data) return;
    const d = orgQuery.data;
    const dirty =
      name !== (d.name || "") ||
      taxId !== (d.tax_id || "") ||
      phone !== (d.phone || "") ||
      emailContact !== (d.email_contact || "") ||
      website !== (d.website || "") ||
      country !== (d.country || "DOM") ||
      fiscalAddress !== (d.fiscal_address || "") ||
      municipality !== (d.municipality || "") ||
      province !== (d.province || "");
    setHasChanges(dirty);
  }, [name, taxId, phone, emailContact, website, country, fiscalAddress, municipality, province, orgQuery.data]);

  const isAdmin =
    session.data?.role === "owner" || session.data?.role === "admin";

  const orgMutation = useMutation({
    mutationFn: async () =>
      updateOrganization({
        name,
        tax_id: taxId || null,
        phone: phone || null,
        email_contact: emailContact || null,
        website: website || null,
        country,
        fiscal_address: fiscalAddress || null,
        municipality: municipality || null,
        province: province || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Organización actualizada");
      setHasChanges(false);
    },
    onError: (err: Error) => {
      const msg = err.message;
      if (msg.includes("RNC")) {
        toast.error("RNC inválido", { description: msg });
      } else if (msg.includes("ya está registrado")) {
        toast.error("Conflicto de datos", { description: msg });
      } else {
        toast.error("Error al actualizar", { description: msg });
      }
    },
  });

  const members = orgQuery.data?.members ?? [];
  const memberCount = orgQuery.data?.member_count ?? 0;
  const updatedAt = relativeTime(orgQuery.data?.updated_at ?? null);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-heading">Organización</CardTitle>
          <CardDescription className="text-xs">
            Información legal y fiscal de tu empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Sin permisos de administración
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60 max-w-xs">
              Solo los administradores y propietarios pueden modificar los datos
              de la organización.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Datos de la empresa ── */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between pb-4">
          <div>
            <CardTitle className="text-sm font-heading">Datos de la empresa</CardTitle>
            <CardDescription className="text-xs">
              Información legal y fiscal para facturas y reportes DGII.
              {updatedAt && (
                <span className="ml-1 text-muted-foreground/60">
                  · Actualizado {updatedAt}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            onClick={() => orgMutation.mutate()}
            disabled={orgMutation.isPending || !hasChanges}
            size="sm"
            className="shrink-0"
          >
            {orgMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {orgMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Nombre */}
            <div className="md:col-span-2">
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nombre legal / Razón social
              </Label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Razón social completa"
                  className="pl-8"
                />
              </div>
            </div>

            {/* RNC */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                RNC / Tax ID
              </Label>
              <div className="relative">
                {orgQuery.data?.tax_id ? (
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                ) : (
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                )}
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000000"
                  maxLength={11}
                  disabled={!!orgQuery.data?.tax_id}
                  className={`pl-8 pr-14 font-mono tracking-wider ${
                    orgQuery.data?.tax_id ? "bg-muted cursor-not-allowed opacity-80" : ""
                  } ${
                    taxId.length > 0 && taxId.length !== 9 && taxId.length !== 11
                      ? "border-amber-500/50 focus-visible:ring-amber-500/30"
                      : taxId.length === 9 || taxId.length === 11
                      ? "border-emerald-500/40"
                      : ""
                  }`}
                />
                {!orgQuery.data?.tax_id && (
                  <span
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono ${
                      taxId.length === 9 || taxId.length === 11
                        ? "text-emerald-600"
                        : taxId.length > 0
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {taxId.length}/{taxId.length <= 9 ? 9 : 11}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {orgQuery.data?.tax_id
                  ? "El RNC/Cédula está bloqueado y no puede ser modificado por cumplimiento fiscal."
                  : "9 dígitos (empresa/persona jurídica) · 11 dígitos (cédula/persona física) · Validación DGII"}
              </p>
            </div>

            {/* País */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                País
              </Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOM">🇩🇴 República Dominicana</SelectItem>
                  <SelectItem value="USA">🇺🇸 Estados Unidos</SelectItem>
                  <SelectItem value="ESP">🇪🇸 España</SelectItem>
                  <SelectItem value="COL">🇨🇴 Colombia</SelectItem>
                  <SelectItem value="MEX">🇲🇽 México</SelectItem>
                  <SelectItem value="PRI">🇵🇷 Puerto Rico</SelectItem>
                  <SelectItem value="CRI">🇨🇷 Costa Rica</SelectItem>
                  <SelectItem value="PAN">🇵🇦 Panamá</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Teléfono */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Teléfono
              </Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="809-555-0100"
                  className="pl-8"
                />
              </div>
            </div>

            {/* Email de contacto */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Email de contacto
              </Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={emailContact}
                  onChange={(e) => setEmailContact(e.target.value)}
                  placeholder="contacto@miempresa.com"
                  type="email"
                  className="pl-8"
                />
              </div>
            </div>

            {/* Sitio web */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sitio web
              </Label>
              <div className="relative">
                <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://miempresa.com"
                  className="pl-8"
                />
              </div>
            </div>

            {/* Dirección fiscal */}
            <div className="md:col-span-2">
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dirección fiscal
              </Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-3 size-3.5 text-muted-foreground" />
                <Textarea
                  value={fiscalAddress}
                  onChange={(e) => setFiscalAddress(e.target.value)}
                  placeholder="Calle, número, sector"
                  className="pl-8 resize-none"
                  rows={2}
                />
              </div>
            </div>

            {/* Municipio */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Municipio
              </Label>
              <Input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                placeholder="Santo Domingo"
              />
            </div>

            {/* Provincia */}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Provincia
              </Label>
              <Input
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Distrito Nacional"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Miembros del equipo ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Users className="size-3.5 text-muted-foreground" />
                Equipo
              </CardTitle>
              <CardDescription className="text-xs">
                {memberCount}{" "}
                {memberCount === 1
                  ? "persona tiene"
                  : "personas tienen"}{" "}
                acceso a esta organización.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {orgQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="size-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                No hay miembros registrados.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {members.map((m) => (
                <MemberRow key={m.id} member={m} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
