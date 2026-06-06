"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Plus,
  X,
  Trash2,
  ChevronDown,
  UserPlus,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

import { getOrganization, updateOrganization, type OrgMember } from "@/lib/api/settings";
import {
  listOrgMembers,
  removeMember,
  updateMemberRole,
  createInvitation,
  listInvitations,
  revokeInvitation,
  createOrganization,
} from "@/lib/api/organizations";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/hooks/use-org";
import { useRNCValidation } from "@/hooks/use-rnc-validation";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { RD_PROVINCE_NAMES, getMunicipalities } from "@/lib/data/rd-geography";

// ── Role config ───────────────────────────────────────────────────

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
  orgId?: string;
  currentUserId?: string;
  canManage?: boolean;
  onRoleChange?: (userId: string, role: string) => void;
  onRemove?: (userId: string) => void;
}) {
  const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
  const RoleIcon = config.icon;
  const initials = member.full_name
    ? member.full_name.substring(0, 2).toUpperCase()
    : member.email.substring(0, 2).toUpperCase();
  const joinedAgo = relativeTime(member.joined_at);
  const isSelf = member.id === currentUserId;

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
            {isSelf && (
              <span className="ml-1.5 text-[10px] text-muted-foreground/50">(tú)</span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {member.job_title ? `${member.job_title} · ` : ""}
            {member.email}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1.5 font-medium flex items-center gap-1 ${config.color}`}
          >
            <RoleIcon className="size-2.5" />
            {config.label}
          </Badge>

          {/* Role changer (only for non-owners, if can manage) */}
          {canManage && member.role !== "owner" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {["admin", "member", "viewer"].map((r) => (
                  <DropdownMenuItem
                    key={r}
                    onClick={() => onRoleChange && onRoleChange(member.id, r)}
                    disabled={r === member.role}
                    className="text-xs"
                  >
                    {r === "admin" && <ShieldCheck className="size-3 mr-2" />}
                    {r === "member" && <UserRound className="size-3 mr-2" />}
                    {r === "viewer" && <Eye className="size-3 mr-2" />}
                    {ROLE_CONFIG[r].label}
                    {r === member.role && (
                      <Check className="size-3 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Remove button (only for non-owners, admins/owners) */}
          {canManage && member.role !== "owner" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5 rounded-md text-muted-foreground/40 hover:text-destructive"
              onClick={() => onRemove?.(member.id)}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
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

  const inviteMutation = useMutation({
    mutationFn: () => createInvitation(orgId, { email, role }),
    onSuccess: () => {
      toast.success(`Invitación enviada a ${email}`);
      setEmail("");
      setRole("member");
      setOpen(false);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Error al invitar", { description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <UserPlus className="size-3.5" data-icon="inline-start" />
          Invitar miembro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">Invitar miembro</DialogTitle>
          <DialogDescription className="text-xs">
            Envía una invitación por email para que se unan a esta organización.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              type="email"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Rol
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="member">Miembro</SelectItem>
                <SelectItem value="viewer">Observador</SelectItem>
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}

// ── Phone formatting ─────────────────────────────────────────────

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

// ── Create organization dialog ────────────────────────────────────

function SkeletonResult() {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 animate-pulse">
      <div className="size-4 rounded bg-muted-foreground/10 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-20 rounded bg-muted-foreground/10" />
          <div className="h-3 w-8 rounded-full bg-muted-foreground/10" />
        </div>
      </div>
    </div>
  );
}

function CreateOrgDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fiscalAddress, setFiscalAddress] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("DOM");

  // ── Name typeahead state ──
  const [nameSearchResults, setNameSearchResults] = useState<
    { rnc: string; name: string; tradeName?: string; status: string }[]
  >([]);
  const [isSearchingName, setIsSearchingName] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const nameSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(-1);

  // ── RNC validation ──
  const rnc = useRNCValidation({
    onLookupComplete: (data) => {
      if (data.name && !name) {
        setName(data.name);
      }
    },
  });

  const { switchOrg } = useOrg();

  // ── Search by name via DGII Server Action ──
  const handleNameSearch = useCallback(async (query: string) => {
    if (query.trim().length < 4) {
      setNameSearchResults([]);
      setShowNameDropdown(false);
      return;
    }
    setIsSearchingName(true);
    setShowNameDropdown(true);
    try {
      const { searchByNameAction } = await import("@/app/actions/dgii");
      const results = await searchByNameAction(query.trim());
      setNameSearchResults(results);
      if (results.length === 0) setShowNameDropdown(false);
    } catch {
      setNameSearchResults([]);
      setShowNameDropdown(false);
    } finally {
      setIsSearchingName(false);
    }
  }, []);

  const onNameChange = useCallback(
    (value: string) => {
      setName(value);
      // Reset RNC if name changes after a typeahead selection
      if (nameSearchResults.length > 0 && !value) {
        setTaxId("");
      }
      if (nameSearchTimer.current) clearTimeout(nameSearchTimer.current);
      if (value.trim().length >= 4) {
        nameSearchTimer.current = setTimeout(() => handleNameSearch(value), 350);
      } else {
        setNameSearchResults([]);
        setShowNameDropdown(false);
      }
    },
    [handleNameSearch, nameSearchResults.length]
  );

  const selectNameResult = useCallback(
    (result: { rnc: string; name: string; tradeName?: string }) => {
      setName(result.name);
      setTaxId(result.rnc);
      setNameSearchResults([]);
      setShowNameDropdown(false);
      selectedIndexRef.current = -1;
      // Trigger RNC validation + lookup for the selected RNC
      rnc.debouncedLookup(result.rnc);
    },
    [rnc]
  );

  // ── Keyboard navigation for dropdown ──
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showNameDropdown || nameSearchResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndexRef.current = Math.min(
          selectedIndexRef.current + 1,
          nameSearchResults.length - 1
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndexRef.current = Math.max(selectedIndexRef.current - 1, 0);
      } else if (e.key === "Enter" && selectedIndexRef.current >= 0) {
        e.preventDefault();
        selectNameResult(nameSearchResults[selectedIndexRef.current]);
      } else if (e.key === "Escape") {
        setShowNameDropdown(false);
        selectedIndexRef.current = -1;
      }
    },
    [showNameDropdown, nameSearchResults, selectNameResult]
  );

  // ── Close dropdown on outside click ──
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        nameDropdownRef.current &&
        !nameDropdownRef.current.contains(e.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(e.target as Node)
      ) {
        setShowNameDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createMutation = useMutation({
    mutationFn: () =>
      createOrganization({
        name,
        tax_id: taxId || undefined,
        phone: phone || undefined,
        email_contact: email || undefined,
        fiscal_address: fiscalAddress || undefined,
        municipality: municipality || undefined,
        province: province || undefined,
        country,
      }),
    onSuccess: async (org) => {
      toast.success(`Organización "${org.name}" creada`);
      setName("");
      setTaxId("");
      setPhone("");
      setEmail("");
      setFiscalAddress("");
      setMunicipality("");
      setProvince("");
      setCountry("DOM");
      setNameSearchResults([]);
      setShowNameDropdown(false);
      setIsSearchingName(false);
      rnc.reset();
      setOpen(false);
      onSuccess();
      await switchOrg(org.id);
    },
    onError: (err: Error) => {
      toast.error("Error al crear", { description: err.message });
    },
  });

  const isFormValid =
    name.trim().length >= 3 &&
    (!taxId || rnc.isValid);

  const hasNameDropdown =
    showNameDropdown &&
    (isSearchingName || nameSearchResults.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Plus className="size-3.5" data-icon="inline-start" />
          Nueva organización
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">Crear organización</DialogTitle>
          <DialogDescription className="text-xs">
            Escribe el nombre o RNC y la DGII te ayudará a encontrar los datos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* ── Nombre (typeahead) ── */}
          <div className="relative">
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nombre de la organización <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={nameInputRef}
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onFocus={() => {
                  if (nameSearchResults.length > 0 || isSearchingName) {
                    setShowNameDropdown(true);
                  }
                }}
                placeholder="Escribe para buscar en DGII o ingresa manualmente"
                className="pl-8"
                autoFocus
              />
              {isSearchingName && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            {name.length > 0 && name.length < 4 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Escribe al menos 4 caracteres para buscar en el padrón DGII
              </p>
            )}

            {/* ── Typeahead dropdown ── */}
            {hasNameDropdown && (
              <div
                ref={nameDropdownRef}
                className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg border border-border/40 bg-popover shadow-lg overflow-hidden"
              >
                {isSearchingName && nameSearchResults.length === 0 ? (
                  /* Skeleton loading */
                  <div className="divide-y divide-border/10">
                    {[1, 2, 3].map((i) => (
                      <SkeletonResult key={i} />
                    ))}
                  </div>
                ) : (
                  /* Results */
                  <div className="max-h-[220px] overflow-y-auto divide-y divide-border/10">
                    {nameSearchResults.map((result, i) => (
                      <button
                        key={result.rnc}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectNameResult(result);
                        }}
                        onMouseEnter={() => { selectedIndexRef.current = i; }}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                          selectedIndexRef.current === i
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <Building2 className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {result.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              RNC {result.rnc}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-3.5 px-1 ${
                                result.status === "ACTIVO"
                                  ? "border-emerald-500/30 text-emerald-600"
                                  : "border-amber-500/30 text-amber-600"
                              }`}
                            >
                              {result.status}
                            </Badge>
                          </div>
                          {result.tradeName && (
                            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                              {result.tradeName}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RNC / Cédula ── */}
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              RNC / Cédula
            </Label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={taxId}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setTaxId(raw);
                  rnc.debouncedLookup(raw);
                }}
                placeholder="000000000 (9 RNC · 11 Cédula)"
                maxLength={11}
                className={`pl-8 pr-20 font-mono tracking-wider ${
                  taxId
                    ? rnc.isValid
                      ? "border-emerald-500/50 focus-visible:ring-emerald-500/30"
                      : rnc.error
                      ? "border-destructive/50 focus-visible:ring-destructive/30"
                      : ""
                    : ""
                }`}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                {taxId && rnc.isValid && !rnc.isLookingUp && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <CheckCircle2 className="size-3" />
                    <span className="hidden sm:inline">
                      {rnc.type === "rnc" ? "RNC" : "Cédula"} válido
                    </span>
                  </span>
                )}
                {rnc.isLookingUp && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
                {taxId && !rnc.isValid && !rnc.isLookingUp && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {taxId.length}/{taxId.length <= 9 ? 9 : 11}
                  </span>
                )}
              </div>
            </div>
            {taxId && rnc.error && !rnc.isLookingUp && (
              <p className="mt-1 text-[10px] text-destructive flex items-center gap-1">
                <XCircle className="size-2.5" />
                {rnc.error}
              </p>
            )}
            {taxId && rnc.lookupError && (
              <p className="mt-1 text-[10px] text-amber-600 flex items-center gap-1">
                <AlertCircle className="size-2.5" />
                {rnc.lookupError}
              </p>
            )}
            {taxId && rnc.taxpayer && (
              <p className="mt-1 text-[10px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="size-2.5" />
                {rnc.taxpayer.status === "ACTIVO"
                  ? "Contribuyente activo en DGII"
                  : `Estado DGII: ${rnc.taxpayer.status}`}
                {rnc.taxpayer.isElectronicBillingRegistered && (
                  <span className="ml-1 px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold">
                    e-CF
                  </span>
                )}
              </p>
            )}
            {!taxId && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                9 dígitos (RNC empresa) · 11 dígitos (Cédula persona física) · Validación dígito verificador DGII
              </p>
            )}
          </div>

          {/* ── Two-column grid ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Teléfono
              </Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={formatPhoneDisplay(phone)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(digits);
                  }}
                  placeholder="809-555-0100"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Email de contacto
              </Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                  type="email"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dirección fiscal
            </Label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-3 size-3.5 text-muted-foreground pointer-events-none" />
              <Textarea
                value={fiscalAddress}
                onChange={(e) => setFiscalAddress(e.target.value)}
                placeholder="Calle, número, sector"
                className="pl-8 resize-none"
                rows={2}
              />
            </div>
          </div>
          {/* Municipio + Provincia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Municipio
              </Label>
              {country === "DOM" ? (
                <Select
                  value={municipality}
                  onValueChange={setMunicipality}
                  disabled={!province}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={province ? "Seleccionar municipio" : "Selecciona provincia primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {getMunicipalities(province).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  placeholder="Ciudad / Municipio"
                />
              )}
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Provincia
              </Label>
              {country === "DOM" ? (
                <Select value={province} onValueChange={(v) => {
                  setProvince(v);
                  setMunicipality(""); // reset municipality when province changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    {RD_PROVINCE_NAMES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Provincia / Estado"
                />
              )}
            </div>
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
                <SelectItem value="COL">🇨🇴 Colombia</SelectItem>
                <SelectItem value="MEX">🇲🇽 México</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); rnc.reset(); }}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!isFormValid || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Building2 className="size-3.5" />
            )}
            Crear organización
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pending invitations section ───────────────────────────────────

function PendingInvitations({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: ["org-invitations", orgId],
    queryFn: () => listInvitations(orgId),
    enabled: !!orgId,
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(orgId, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-invitations", orgId] });
      toast.success("Invitación revocada");
    },
    onError: (err: Error) => {
      toast.error("Error", { description: err.message });
    },
  });

  const invites = invitesQuery.data ?? [];

  if (invites.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Invitaciones pendientes ({invites.length})
      </p>
      <div className="space-y-1.5">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate text-muted-foreground">{inv.email}</span>
              <Badge
                variant="outline"
                className={`text-[9px] h-3.5 px-1 ${
                  ROLE_CONFIG[inv.role]?.color ?? ""
                }`}
              >
                {ROLE_CONFIG[inv.role]?.label ?? inv.role}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-4 text-muted-foreground/40 hover:text-destructive"
              onClick={() => revokeMutation.mutate(inv.id)}
            >
              <X className="size-2.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export function OrganizationPage() {
  const session = useSession();
  const { activeOrgId, userOrgs, switchOrg, refreshOrgs } = useOrg();
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

  // Populate form fields when data loads
  useEffect(() => {
    if (!orgQuery.data) return;
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
  }, [orgQuery.data]);

  // Track dirty state
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
  });

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

  // Members from org settings
  const members = orgQuery.data?.members ?? [];
  const memberCount = orgQuery.data?.member_count ?? 0;
  const updatedAt = relativeTime(orgQuery.data?.updated_at ?? null);
  const currentUserId = session.data?.user?.id;
  const currentOrgId = activeOrgId ?? orgQuery.data?.id;

  // Member management mutations
  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMember(currentOrgId!, userId),
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
    if (window.confirm("¿Seguro que deseas eliminar este miembro de la organización?")) {
      removeMutation.mutate(userId);
    }
  };

  const handleRoleChange = (userId: string, role: string) => {
    roleMutation.mutate({ userId, role });
  };

  // Org switcher in settings
  const otherOrgs = userOrgs.filter((o) => o.id !== currentOrgId);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Organization switcher (settings-specific) ── */}
      {otherOrgs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <LogOut className="size-3.5 text-muted-foreground" />
              Cambiar de organización
            </CardTitle>
            <CardDescription className="text-xs">
              Cambia rápidamente a otra de tus organizaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {otherOrgs.map((org) => (
                <Button
                  key={org.id}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => switchOrg(org.id)}
                >
                  <Building2 className="size-3.5" />
                  <span className="text-xs font-medium">{org.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] h-3.5 px-1 ${
                      ROLE_CONFIG[org.role]?.color ?? ""
                    }`}
                  >
                    {ROLE_CONFIG[org.role]?.label ?? org.role}
                  </Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isAdmin ? (
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
      ) : (
        <>
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
              <div className="flex items-center gap-2">
                <CreateOrgDialog
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["user-organizations"] });
                    refreshOrgs();
                  }}
                />
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
                      value={name}
                      onChange={(e) => setName(e.target.value)}
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
                        orgQuery.data?.tax_id
                          ? "bg-muted cursor-not-allowed opacity-80"
                          : ""
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

          {/* ── Miembros / Team shortcut ── */}
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
                <Button variant="outline" size="sm" asChild>
                  <a href="/dashboard/settings/team">
                    <Users className="size-3.5" data-icon="inline-start" />
                    Gestionar equipo
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {members.length > 0 && (
                <div className="divide-y divide-border/40">
                  {members.slice(0, 3).map((m) => (
                    <MemberRow key={m.id} member={m} />
                  ))}
                  {members.length > 3 && (
                    <p className="pt-2 text-[10px] text-muted-foreground/60 text-center">
                      +{members.length - 3} miembro{members.length - 3 !== 1 ? "s" : ""} más —{" "}
                      <a href="/dashboard/settings/team" className="text-primary underline underline-offset-2">
                        ver todos
                      </a>
                    </p>
                  )}
                </div>
              )}
              {members.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Users className="size-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Invita personas al equipo desde la sección{" "}
                    <a href="/dashboard/settings/team" className="text-primary underline underline-offset-2">
                      Equipo
                    </a>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
