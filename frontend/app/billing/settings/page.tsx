"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  User, Building2, Settings2, ShieldCheck, FileText, Camera, Loader2, Check,
  CheckCircle2, AlertTriangle, Calendar, BadgeCheck, Phone, Mail, Globe,
  MapPin, Link, Hash, Crown, ShieldCheck as ShieldIcon, Eye, UserRound,
  Trash2, Briefcase, CreditCard, Sun, Moon, Monitor,
} from "lucide-react";

import { useSession } from "@/hooks/use-session";
import { billingApi, VerificationStatus } from "@/lib/api/billing";
import { CertificationWizard } from "@/components/billing/certification-wizard";
import {
  getSettings, saveSettings, getOrganization,
  updateProfile, uploadAvatar, deleteAvatar,
} from "@/lib/api/settings";
import type { OrgMember, OrganizationData } from "@/lib/api/settings";
import type { SettingsPayload, SettingValue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const ECF_TYPE_MAP: Record<number, string> = {
  31: "Factura de Crédito Fiscal",
  32: "Factura de Consumo",
  33: "Nota de Débito",
  34: "Nota de Crédito",
  41: "Compras",
  43: "Gastos Menores",
  44: "Regímenes Especiales",
  45: "Gubernamentales",
  46: "Exportación",
  47: "Pago al Exterior",
};

const ROLE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  owner: { label: "Propietario", icon: Crown, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  admin: { label: "Administrador", icon: ShieldIcon, color: "text-primary bg-primary/10 border-primary/20" },
  member: { label: "Miembro", icon: UserRound, color: "text-foreground bg-muted border-border" },
  viewer: { label: "Observador", icon: Eye, color: "text-muted-foreground bg-muted/50 border-border/60" },
};

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

const SECTIONS = [
  { id: "profile", icon: User, label: "Perfil" },
  { id: "company", icon: Building2, label: "Empresa" },
  { id: "preferences", icon: Settings2, label: "Preferencias" },
  { id: "dgii", icon: ShieldCheck, label: "DGII" },
  { id: "sequences", icon: FileText, label: "Secuencias" },
] as const;

type ThemeMode = "light" | "dark" | "system";

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
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

function formatDemoDate(fmt: string, timeFormat: string): string {
  const DEMO_DATE = new Date(2026, 11, 31, 14, 30, 0);
  try {
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = pad(DEMO_DATE.getDate());
    const month = pad(DEMO_DATE.getMonth() + 1);
    const year = DEMO_DATE.getFullYear();
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const monthShort = months[DEMO_DATE.getMonth()];
    const h24 = pad(DEMO_DATE.getHours());
    const h12 = DEMO_DATE.getHours() % 12 || 12;
    const ampm = DEMO_DATE.getHours() < 12 ? "AM" : "PM";
    const time = timeFormat === "12h" ? `${h12}:30 ${ampm}` : `${h24}:30`;
    if (fmt === "DD/MM/YYYY") return `${day}/${month}/${year}, ${time}`;
    if (fmt === "MM/DD/YYYY") return `${month}/${day}/${year}, ${time}`;
    if (fmt === "YYYY-MM-DD") return `${year}-${month}-${day}, ${time}`;
    if (fmt === "DD MMM YYYY") return `${day} ${monthShort} ${year}, ${time}`;
    return `${day}/${month}/${year}, ${time}`;
  } catch {
    return fmt;
  }
}

function formatDemoCurrency(currency: string, amount = 12450.75): string {
  try {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function ToggleSwitch({ checked, onCheckedChange, label, description }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/30">
      <div className="min-w-0 pr-4">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
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
          <p className="text-xs font-medium text-foreground truncate">{member.full_name || member.email}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {member.job_title ? `${member.job_title} · ` : ""}{member.email}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-medium flex items-center gap-1 ${config.color}`}>
            <RoleIcon className="size-2.5" />
            {config.label}
          </Badge>
          {joinedAgo && <span className="text-[10px] text-muted-foreground/60">{joinedAgo}</span>}
        </div>
      </div>
    </div>
  );
}

function BillingSettingsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);
  const session = useSession();
  const queryClient = useQueryClient();

  // ── Profile ──
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Organization ──
  const {data: orgQuery_data, isLoading: orgQuery_isLoading} = useQuery({
    queryKey: ["billing-org"],
    queryFn: getOrganization,
  });
  const [orgName, setOrgName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("DOM");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // ── Preferences ──
  const {data: settingsQuery_data} = useQuery({ queryKey: ["billing-settings"], queryFn: getSettings });
  const [editable, setEditable] = useState<SettingsPayload>({});
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // ── DGII ──
  const [verificationStatus, setVerificationStatus] = useState<any>({
    is_ecf_authorized: false,
    certification_status: "none",
    tax_id: "",
    name: "",
  });

  // ── Sequences ──
  const {data: seqQuery_data, isLoading: seqQuery_isLoading, refetch: seqQuery_refetch} = useQuery({
    queryKey: ["billing", "sequences"],
    queryFn: () => billingApi.getSequences(),
  });
  const activeSeqs = seqQuery_data?.filter((s) => s.is_active) ?? [];
  const inactiveSeqs = seqQuery_data?.filter((s) => !s.is_active) ?? [];

  // ── Hydrate from session ──
  useEffect(() => {
    if (session.data) {
      const u = session.data.user;
      setFullName(u.full_name || "");
      setJobTitle(u.job_title || "");
      setPhone(u.phone || "");
      setAvatarUrl(u.avatar_url || null);
    }
  }, [session.data]);

  // ── Hydrate org ──
  useEffect(() => {
    if (orgQuery_data) {
      const d = orgQuery_data;
      setOrgName(d.name || "");
      setTaxId(d.tax_id || "");
      setOrgPhone(d.phone || "");
      setOrgEmail(d.email_contact || "");
      setWebsite(d.website || "");
      setCountry(d.country || "DOM");
      setFiscalAddress(d.fiscal_address || "");
    }
  }, [orgQuery_data]);

  // ── Hydrate preferences ──
  useEffect(() => {
    if (settingsQuery_data) {
      setEditable(structuredClone(settingsQuery_data));
    }
  }, [settingsQuery_data]);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null;
    if (stored) setTheme(stored);
  }, []);

  // ── Fetch verification status ──
  useEffect(() => {
    billingApi.getVerificationStatus()
      .then(setVerificationStatus)
      .catch(() => {});
  }, []);

  // ── Helpers ──
  function getSetting(category: string, key: string): SettingValue {
    if (!editable[category]) editable[category] = [];
    let row = editable[category].find((s) => s.key === key);
    if (!row) {
      row = { key, value: "", type: "string", category, source: "user" };
      editable[category].push(row);
    }
    return row;
  }

  function updateSetting(category: string, key: string, value: string | number | boolean) {
    setEditable((prev) => {
      const copy = { ...prev };
      if (!copy[category]) copy[category] = [];
      const idx = copy[category].findIndex((s) => s.key === key);
      if (idx >= 0) {
        copy[category] = copy[category].map((s) =>
          s.key === key ? { ...s, value } : s
        );
      } else {
        copy[category] = [...copy[category], { key, value, type: "string", category, source: "user" }];
      }
      return copy;
    });
  }

  function setThemeAndPersist(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem("theme", mode);
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else if (mode === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }

  // ── Handlers ──
  async function handleSaveProfile() {
    if (!fullName.trim()) { toast.error("El nombre completo es requerido"); return; }
    try {
      setSavingProfile(true);
      await updateProfile({ full_name: fullName, job_title: jobTitle, phone });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Perfil actualizado");
    } catch (err: any) {
      toast.error("Error al guardar perfil", { description: err.message });
    } finally { setSavingProfile(false); }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("La imagen no debe superar 2MB"); return; }
    setUploadingAvatar(true);
    try {
      const res = await uploadAvatar(file);
      setAvatarUrl(res.avatar_url);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Foto de perfil actualizada");
    } catch (err: unknown) {
      toast.error("Error al subir imagen", { description: err instanceof Error ? err.message : "Error desconocido" });
    } finally { setUploadingAvatar(false); }
  }

  async function handleAvatarDelete() {
    setDeletingAvatar(true);
    try {
      await deleteAvatar();
      setAvatarUrl(null);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Foto de perfil eliminada");
    } catch (err: unknown) {
      toast.error("Error al eliminar la imagen", { description: err instanceof Error ? err.message : "Error desconocido" });
    } finally { setDeletingAvatar(false); }
  }

  async function handleSaveOrg() {
    if (!orgName.trim()) { toast.error("La razón social es requerida"); return; }
    try {
      setSavingOrg(true);
      await billingApi.updateOrganization({
        name: orgName, tax_id: taxId || undefined,
        phone: orgPhone || undefined, email_contact: orgEmail || undefined,
        website: website || undefined, country, fiscal_address: fiscalAddress || undefined,
      });
      await billingApi.getVerificationStatus().then(setVerificationStatus).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["billing-org"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Empresa actualizada");
    } catch (err: any) {
      toast.error("Error al guardar empresa", { description: err.message });
    } finally { setSavingOrg(false); }
  }


  async function handleSavePrefs() {
    try {
      setSavingPrefs(true);
      const allRows = Object.values(editable).flat();
      const updates = allRows.map((r) => ({ key: r.key, value: r.value, type: r.type, category: r.category }));
      await saveSettings(updates);
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
      toast.success("Preferencias guardadas");
    } catch (err: any) {
      toast.error("Error al guardar preferencias", { description: err.message });
    } finally { setSavingPrefs(false); }
  }

  const u = session.data?.user;
  const orgSummary = session.data?.organization;
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

  const currencyPref = String(getSetting("preferences", "currency").value || "DOP");
  const dateFormatPref = String(getSetting("preferences", "date_format").value || "DD/MM/YYYY");
  const timeFormatPref = String(getSetting("preferences", "time_format").value || "24h");
  const timezonePref = String(getSetting("preferences", "timezone").value || "America/Santo_Domingo");
  const languagePref = String(getSetting("preferences", "language").value || "es");
  const itemsPerPagePref = String(getSetting("preferences", "items_per_page").value || "25");
  const defaultDueDaysPref = Number(getSetting("preferences", "default_due_days").value || 30);
  const firstDayOfWeekPref = String(getSetting("preferences", "first_day_of_week").value || "monday");
  const compactView = getSetting("preferences", "compact_view").value === true || getSetting("preferences", "compact_view").value === "true";
  const systemSounds = getSetting("preferences", "system_sounds").value === true || getSetting("preferences", "system_sounds").value === "true";
  const desktopNotifications = getSetting("preferences", "desktop_notifications").value === true || getSetting("preferences", "desktop_notifications").value === "true";
  const autoSaveDrafts = getSetting("preferences", "auto_save_drafts").value === true || getSetting("preferences", "auto_save_drafts").value === "true";

  const datePreview = formatDemoDate(dateFormatPref, timeFormatPref);
  const currencyPreview = formatDemoCurrency(currencyPref);

  const hasOrgChanges =
    orgName !== (orgQuery_data?.name || "") ||
    taxId !== (orgQuery_data?.tax_id || "") ||
    orgPhone !== (orgQuery_data?.phone || "") ||
    orgEmail !== (orgQuery_data?.email_contact || "") ||
    website !== (orgQuery_data?.website || "") ||
    country !== (orgQuery_data?.country || "DOM") ||
    fiscalAddress !== (orgQuery_data?.fiscal_address || "");

  const members = orgQuery_data?.members ?? [];
  const memberCount = orgQuery_data?.member_count ?? 0;
  const updatedAt = relativeTime(orgQuery_data?.updated_at ?? null);
  const isAdmin = role === "owner" || role === "admin";

   return (
     <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* ── Compact header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-heading font-semibold tracking-tight text-foreground">
            Facturación Electrónica
          </h1>
          <p className="text-xs text-muted-foreground">
            Perfil, empresa, preferencias, certificación DGII y secuencias e-CF.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[196px_1fr]">
        {/* ── Sidebar nav ── */}
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-px p-1.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeTab === section.id;
              return (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => setActiveTab(section.id)}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Icon
                    className={`size-3.5 shrink-0 ${
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="flex-1 text-left">{section.label}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Content ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {activeTab === "profile" && (
        <div className="flex flex-col gap-4">
            {/* Identity */}
            <Card>
              <CardHeader className="pb-4">
                <div>
                  <CardTitle className="text-sm font-heading">Identidad</CardTitle>
                  <CardDescription className="text-xs">
                    Nombre, cargo y foto de perfil.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Avatar className="size-16 rounded-xl ring-2 ring-border">
                      <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                      <AvatarFallback className="rounded-xl text-lg font-semibold bg-primary/10 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      aria-label="Cambiar foto de perfil"
                      className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      {uploadingAvatar ? (
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
                        disabled={deletingAvatar}
                        className="text-[11px] text-destructive hover:underline font-medium text-left mt-2 flex items-center gap-1 w-fit"
                      >
                        {deletingAvatar ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                        Eliminar foto de perfil
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
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
                <p className="text-[10px] text-muted-foreground">
                  PNG, JPG. Máximo 2MB. Haz clic en la foto para cambiarla.
                </p>
              </CardContent>
              <CardFooter className="flex justify-end border-t pt-4">
                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  size="sm"
                >
                  {savingProfile ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {savingProfile ? "Guardando..." : "Guardar cambios"}
                </Button>
              </CardFooter>
            </Card>

            {/* Account + Context */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Estado de cuenta</CardTitle>
                  <CardDescription className="text-xs">
                    Información de tu membresía y acceso.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-border/50">
                    <InfoRow icon={ShieldCheck} label="Rol" value={
                      <Badge variant={roleInfo.variant} className="text-[10px] h-4 px-1.5">{roleInfo.label}</Badge>
                    } />
                    <InfoRow icon={BadgeCheck} label="Plan" value={
                      <span className="text-primary font-semibold">{PLAN_LABELS[plan] ?? plan}</span>
                    } />
                    <InfoRow icon={Calendar} label="Miembro desde" value={memberSince ?? "—"} />
                    <InfoRow icon={User} label="Estado" value={
                      <Badge variant={u?.is_active ? "default" : "secondary"} className={`text-[10px] h-4 px-1.5 ${u?.is_active ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" : ""}`}>
                        {u?.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    } />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Tu organización</CardTitle>
                  <CardDescription className="text-xs">
                    Datos de la empresa en la que operas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-border/50">
                    <InfoRow icon={Building2} label="Empresa" value={orgSummary?.name ?? "—"} />
                    <InfoRow icon={Briefcase} label="RNC" value={orgSummary?.tax_id ?? <span className="text-muted-foreground/60 italic">Sin configurar</span>} />
                    <InfoRow icon={Globe} label="País" value={orgSummary?.country === "DOM" ? "República Dominicana" : (orgSummary?.country ?? "—")} />
                    <InfoRow icon={Phone} label="Teléfono" value={orgSummary?.phone ?? <span className="text-muted-foreground/60 italic">Sin configurar</span>} />
                    {orgSummary?.email_contact && <InfoRow icon={Mail} label="Email" value={orgSummary.email_contact} />}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

          {activeTab === "company" && (
          <>{isAdmin ? (
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-4">
                  <div>
                    <CardTitle className="text-sm font-heading">Datos de la empresa</CardTitle>
                    <CardDescription className="text-xs">
                      Información legal y fiscal para facturas y reportes DGII.
                      {updatedAt && <span className="ml-1 text-muted-foreground/60">· Actualizado {updatedAt}</span>}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Nombre legal / Razón social
                      </Label>
                      <div className="relative">
                        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="Razón social completa"
                          className="pl-8"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        RNC / Tax ID
                      </Label>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={taxId}
                          onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                          placeholder="000000000"
                          maxLength={11}
                          disabled={!!orgQuery_data?.tax_id}
                          className={`pl-8 pr-14 font-mono tracking-wider ${
                            orgQuery_data?.tax_id ? "bg-muted cursor-not-allowed opacity-80" : ""
                          } ${
                            taxId.length > 0 && taxId.length !== 9 && taxId.length !== 11
                              ? "border-amber-500/50 focus-visible:ring-amber-500/30"
                              : taxId.length === 9 || taxId.length === 11
                              ? "border-emerald-500/40"
                              : ""
                          }`}
                        />
                        <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono ${
                          taxId.length === 9 || taxId.length === 11
                            ? "text-emerald-600"
                            : taxId.length > 0 ? "text-amber-600" : "text-muted-foreground"
                        }`}>
                          {taxId.length}/{taxId.length <= 9 ? 9 : 11}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {orgQuery_data?.tax_id 
                          ? "El RNC/Cédula está bloqueado y no puede ser modificado por razones de cumplimiento fiscal." 
                          : "9 dígitos (empresa) · 11 dígitos (cédula) · Validación DGII"}
                      </p>
                    </div>

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
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Teléfono
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={orgPhone}
                          onChange={(e) => setOrgPhone(e.target.value)}
                          placeholder="809-555-0100"
                          className="pl-8"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Correo de contacto
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={orgEmail}
                          onChange={(e) => setOrgEmail(e.target.value)}
                          placeholder="facturacion@empresa.com"
                          className="pl-8"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sitio web
                      </Label>
                      <div className="relative">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://"
                          className="pl-8"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Dirección fiscal
                      </Label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                        <Textarea
                          value={fiscalAddress}
                          onChange={(e) => setFiscalAddress(e.target.value)}
                          placeholder="Calle, número, sector, ciudad, provincia"
                          className="pl-8 resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end border-t pt-4">
                  <Button
                    onClick={handleSaveOrg}
                    disabled={savingOrg || !hasOrgChanges}
                    size="sm"
                  >
                    {savingOrg ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {savingOrg ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Team */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-heading flex items-center gap-2">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        Equipo
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {memberCount} {memberCount === 1 ? "persona tiene" : "personas tienen"} acceso a esta organización.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {orgQuery_isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Building2 className="size-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">No hay miembros registrados.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {members.map((m) => <MemberRow key={m.id} member={m} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
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
                  <p className="text-sm font-medium text-muted-foreground">Sin permisos de administración</p>
                  <p className="mt-1 text-xs text-muted-foreground/60 max-w-xs">
                    Solo los administradores y propietarios pueden modificar los datos de la organización.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          </>
          )}

          {activeTab === "preferences" && (
          <Card>
            <CardHeader className="pb-4">
              <div>
                <CardTitle className="text-sm font-heading">Preferencias</CardTitle>
                <CardDescription className="text-xs">
                  Personaliza la experiencia del sistema de facturación.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Apariencia */}
              <div>
                <h3 className="mb-3 text-xs font-semibold text-foreground">Apariencia</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tema
                    </Label>
                    <div className="flex gap-1.5">
                      {([{ value: "light", icon: Sun, label: "Claro" },
                         { value: "dark", icon: Moon, label: "Oscuro" },
                         { value: "system", icon: Monitor, label: "Sistema" }] as const).map(({ value, icon: Icon, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setThemeAndPersist(value)}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-all",
                            theme === value
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                          )}
                        >
                          <Icon className="size-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Idioma
                    </Label>
                    <Select value={languagePref} onValueChange={(v) => updateSetting("preferences", "language", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es">🇩🇴 Español</SelectItem>
                        <SelectItem value="en">🇺🇸 English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Regional */}
              <div>
                <h3 className="mb-3 text-xs font-semibold text-foreground">Regional</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Moneda predeterminada
                    </Label>
                    <Select value={currencyPref} onValueChange={(v) => {
                      updateSetting("preferences", "currency", v);
                      localStorage.setItem("user_currency", v);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOP">🇩🇴 DOP — Peso dominicano</SelectItem>
                        <SelectItem value="USD">🇺🇸 USD — Dólar americano</SelectItem>
                        <SelectItem value="EUR">🇪🇺 EUR — Euro</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[10px] font-mono text-primary/80 bg-primary/5 rounded px-1.5 py-0.5 inline-block">
                      Vista previa: {currencyPreview}
                    </p>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Zona horaria
                    </Label>
                    <Select value={timezonePref} onValueChange={(v) => {
                      updateSetting("preferences", "timezone", v);
                      localStorage.setItem("user_timezone", v);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Santo_Domingo">Santo Domingo (UTC-4)</SelectItem>
                        <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                        <SelectItem value="America/Mexico_City">Ciudad de México (UTC-6)</SelectItem>
                        <SelectItem value="America/Bogota">Bogotá (UTC-5)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Formato de fecha
                    </Label>
                    <Select value={dateFormatPref} onValueChange={(v) => {
                      updateSetting("preferences", "date_format", v);
                      localStorage.setItem("user_date_format", v);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                        <SelectItem value="DD MMM YYYY">DD MMM YYYY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Formato de hora
                    </Label>
                    <Select value={timeFormatPref} onValueChange={(v) => updateSetting("preferences", "time_format", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24h (14:30)</SelectItem>
                        <SelectItem value="12h">12h (2:30 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="mb-3 text-xs font-semibold text-foreground">Plazos</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Días de vencimiento por defecto
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={defaultDueDaysPref}
                      onChange={(e) => updateSetting("preferences", "default_due_days", Number(e.target.value) || 30)}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Primer día de la semana
                    </Label>
                    <Select value={firstDayOfWeekPref} onValueChange={(v) => updateSetting("preferences", "first_day_of_week", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Lunes</SelectItem>
                        <SelectItem value="sunday">Domingo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Interfaz y notificaciones */}
              <div>
                <h3 className="mb-3 text-xs font-semibold text-foreground">Interfaz y notificaciones</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <ToggleSwitch
                    checked={compactView}
                    onCheckedChange={(v) => updateSetting("preferences", "compact_view", v)}
                    label="Vista compacta"
                    description="Reduce el espaciado en tablas y listados."
                  />
                  <ToggleSwitch
                    checked={systemSounds}
                    onCheckedChange={(v) => updateSetting("preferences", "system_sounds", v)}
                    label="Sonidos del sistema"
                    description="Reproducir sonido al completar procesamiento."
                  />
                  <ToggleSwitch
                    checked={desktopNotifications}
                    onCheckedChange={(v) => {
                      if (v && "Notification" in window) {
                        Notification.requestPermission().then((perm) => {
                          updateSetting("preferences", "desktop_notifications", perm === "granted");
                        });
                      } else {
                        updateSetting("preferences", "desktop_notifications", v);
                      }
                    }}
                    label="Notificaciones de escritorio"
                    description="Recibir alertas del navegador cuando hay facturas procesadas."
                  />
                  <ToggleSwitch
                    checked={autoSaveDrafts}
                    onCheckedChange={(v) => updateSetting("preferences", "auto_save_drafts", v)}
                    label="Guardar borradores automáticamente"
                    description="Guardar cambios no enviados en facturas en edición."
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button
                onClick={handleSavePrefs}
                disabled={savingPrefs}
                size="sm"
              >
                {savingPrefs ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {savingPrefs ? "Guardando..." : "Guardar cambios"}
              </Button>
            </CardFooter>
          </Card>
          )}

          {activeTab === "dgii" && (
            verificationStatus.is_ecf_authorized || verificationStatus.certification_status === "certified" ? (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ShieldCheck className="size-4 text-primary" />
                    <p className="text-xs font-medium text-primary">DGII</p>
                  </div>
                  <CardTitle className="text-sm font-heading">Certificación Electrónica</CardTitle>
                  <CardDescription className="text-xs">
                    Estado de tu empresa como emisor electrónico ante la DGII.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status banner */}
                  <div className="rounded-lg border p-4 flex items-start justify-between gap-4 border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Verificado</p>
                          <Badge className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-600 border-green-500/20">
                            emisor electrónico
                          </Badge>
                        </div>
                        {orgName && <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>}
                        {taxId && <p className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">RNC {taxId}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Verified details */}
                  <div className="rounded-lg border border-border/60 p-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Razón Social</p>
                      <p className="font-medium mt-0.5">{verificationStatus.name || orgName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">RNC</p>
                      <p className="font-medium mt-0.5">{verificationStatus.tax_id || taxId}</p>
                    </div>
                    {verificationStatus.economic_activity && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actividad Económica</p>
                        <p className="font-medium mt-0.5">{verificationStatus.economic_activity}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ambiente Fiscal</p>
                      <p className="font-medium text-emerald-600 mt-0.5">Producción / TesteCF</p>
                    </div>
                  </div>

                  {/* e-CF type badges */}
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs font-medium text-foreground mb-2">Tipos de comprobantes electrónicos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[31, 32, 33, 34, 43, 44, 45, 46, 47].map((type) => (
                        <Badge
                          key={type}
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          E{type} — {ECF_TYPE_MAP[type]?.split(" ")[0] ?? type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <CertificationWizard 
                initialStatus={verificationStatus} 
                onComplete={() => {
                  billingApi.getVerificationStatus().then(setVerificationStatus).catch(() => {});
                  seqQuery_refetch();
                }} 
              />
            )
          )}

          {activeTab === "sequences" && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-0.5">
                <FileText className="size-4 text-primary" />
                <p className="text-xs font-medium text-primary">e-CF</p>
              </div>
              <CardTitle className="text-sm font-heading">Secuencias de Comprobantes</CardTitle>
              <CardDescription className="text-xs">
                Rangos de numeración e-CF/NCF registrados para emisión.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {seqQuery_isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : seqQuery_data && seqQuery_data.length > 0 ? (
                [...activeSeqs, ...inactiveSeqs].map((seq) => {
                  const usage = seq.end_number - seq.start_number + 1;
                  const consumed = seq.current_number - seq.start_number + 1;
                  const pct = Math.min((consumed / usage) * 100, 100);
                  const isExhausted = seq.current_number >= seq.end_number;
                  const label = ECF_TYPE_MAP[seq.ecf_type] ?? `Tipo ${seq.ecf_type}`;
                  return (
                    <div
                      key={seq.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        seq.is_active
                          ? "border-primary/30 bg-primary/[0.02]"
                          : "border-border/60 opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium">{label}</p>
                            <Badge variant="outline" className="font-mono text-[10px] h-4 px-1.5">
                              {seq.prefix}{String(seq.ecf_type).padStart(2, "0")}
                            </Badge>
                            {isExhausted && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20">
                                agotado
                              </Badge>
                            )}
                          </div>
                          <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-0.5">
                            #{String(seq.current_number).padStart(8, "0")} / {String(seq.end_number).padStart(8, "0")}
                          </p>
                        </div>
                        <Badge variant={seq.is_active ? "default" : "outline"} className="text-[10px] h-4 px-1.5">
                          {seq.is_active ? "activo" : "inactivo"}
                        </Badge>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isExhausted ? "bg-destructive" : pct > 75 ? "bg-amber-500" : "bg-primary"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {seq.expiry_date && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                          Vence: {new Date(seq.expiry_date).toLocaleDateString("es-DO")}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                  <FileText className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay secuencias registradas</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    Carga una secuencia e-CF o NCF desde la emisión de facturas.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
     </div>
   );
 }

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={null}>
      <BillingSettingsPageInner />
    </Suspense>
  );
}

