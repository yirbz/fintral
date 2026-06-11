"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listUploadLinks,
  createUploadLink,
  deleteUploadLink,
  getLinkInvoices,
  type UploadLink,
} from "@/lib/api/invoices";
import { getOrganization, type OrgMember } from "@/lib/api/settings";
import { useSession } from "@/hooks/use-session";
import {
  Link2,
  Send,
  Copy,
  Share2,
  Loader2,
  Clock,
  Mail,
  CheckCircle2,
  Trash2,
  BarChart3,
  Link as LinkIcon,
  Eye,
  FileText,
  ExternalLink,
  Users,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadNav } from "./upload-nav";

function getPublicLinkUrl(token: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/upload/public?token=${token}`;
  }
  return "";
}

export function TemporaryLinksPage() {
  const queryClient = useQueryClient();
  const session = useSession();

  const [inviteDestination, setInviteDestination] = useState("");
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [maxFiles, setMaxFiles] = useState<number>(10);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [lastCreatedTime, setLastCreatedTime] = useState(0);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [emailPopoverOpen, setEmailPopoverOpen] = useState(false);

  const {data: orgQuery_data} = useQuery({
    queryKey: ["organization"],
    queryFn: () => getOrganization(),
    staleTime: 5 * 60_000,
  });

  const orgMembers = orgQuery_data?.members ?? [];

  const filteredMembers = useMemo(() => {
    if (!inviteDestination.trim()) return orgMembers;
    const q = inviteDestination.toLowerCase();
    return orgMembers.filter(
      (m) =>
        m.email.toLowerCase().includes(q) ||
        m.full_name.toLowerCase().includes(q)
    );
  }, [orgMembers, inviteDestination]);

  const {data: linksQuery_data, isLoading: linksQuery_isLoading} = useQuery({
    queryKey: ["upload-links"],
    queryFn: () => listUploadLinks(),
    refetchInterval: 30_000,
  });

  const {data: invoicesQuery_data, isLoading: invoicesQuery_isLoading} = useQuery({
    queryKey: ["link-invoices", selectedLinkId],
    queryFn: () => getLinkInvoices(selectedLinkId!),
    enabled: !!selectedLinkId,
  });

  const uploadLinks = linksQuery_data?.upload_links ?? [];

  const activeLinks = uploadLinks.filter(
    (l) => l.is_active && new Date(l.expires_at).getTime() > Date.now()
  );
  const totalFilesUploaded = uploadLinks.reduce((sum, l) => sum + l.uploaded_count, 0);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteDestination.trim())) {
      toast.error("Por favor, ingresa un correo electrónico válido");
      return;
    }

    const now = Date.now();
    if (now - lastCreatedTime < 5000) {
      toast.error("Espera unos segundos antes de generar otro enlace");
      return;
    }

    setSendingInvite(true);
    setGeneratedLink(null);
    try {
      const res = await createUploadLink({
        client_email: inviteDestination.trim(),
        max_files: maxFiles,
        expires_in_hours: expiresInHours,
      });
      setLastCreatedTime(Date.now());
      toast.success("Enlace temporal creado exitosamente");
      setGeneratedLink(res.url);
      setInviteDestination("");
      queryClient.invalidateQueries({ queryKey: ["upload-links"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear enlace temporal"
      );
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    try {
      await deleteUploadLink(linkId);
      toast.success("Enlace revocado");
      queryClient.invalidateQueries({ queryKey: ["upload-links"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al revocar enlace"
      );
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-8 py-4 sm:py-8 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8">
      <UploadNav active="links" />

      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 shrink-0">
          <Link2 className="size-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-medium text-foreground">Enlaces Temporales</h1>
          <p className="text-xs text-muted-foreground truncate">
            Comparte enlaces seguros para que tus clientes suban facturas
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Activos", value: activeLinks.length },
          { label: "Archivos recibidos", value: totalFilesUploaded },
          { label: "Clientes", value: uploadLinks.length },
          { label: "Total enlaces", value: uploadLinks.length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3 space-y-0.5">
            <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
            <p className="text-lg sm:text-xl font-semibold tabular-nums text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5 sm:gap-6 lg:grid lg:grid-cols-5">
        {/* Create link form */}
        <div className="lg:col-span-2">
          <Card className="border-border/60">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="size-4 text-primary shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Solicitar documentos
                </span>
              </div>
              <CardTitle className="text-sm font-heading">Nuevo enlace temporal</CardTitle>
              <CardDescription className="text-xs">
                Genera un enlace único para que tu cliente suba facturas de forma segura.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateLink}>
              <CardContent className="space-y-4 px-4 sm:px-6 pb-0">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Correo del destinatario
                    {orgMembers.length > 0 && (
                      <Badge variant="outline" className="text-[8px] py-0 px-1 font-normal text-muted-foreground/70 border-border/50">
                        <Users className="size-2.5 mr-0.5" />
                        {orgMembers.length}
                      </Badge>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="cliente@empresa.com"
                      value={inviteDestination}
                      onChange={(e) => {
                        setInviteDestination(e.target.value);
                        setEmailPopoverOpen(true);
                      }}
                      onFocus={() => setEmailPopoverOpen(true)}
                      onBlur={() => {
                        // Delay to allow clicking on suggestions
                        setTimeout(() => setEmailPopoverOpen(false), 150);
                      }}
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-[color,box-shadow] outline-none",
                        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                        "placeholder:text-muted-foreground"
                      )}
                      required
                      autoComplete="off"
                    />

                    {/* Autocomplete suggestions dropdown */}
                    {emailPopoverOpen && inviteDestination.length > 0 && filteredMembers.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-popover shadow-lg">
                        <div className="px-2.5 py-1.5 border-b border-border/40">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Usuarios de la organización
                          </span>
                        </div>
                        {filteredMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className="flex w-full items-center gap-2.5 px-2.5 py-2 text-xs hover:bg-accent/50 transition-colors cursor-pointer"
                            onMouseDown={(e) => {
                              e.preventDefault(); // prevent input blur
                              setInviteDestination(member.email);
                              setEmailPopoverOpen(false);
                            }}
                          >
                            <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0 text-[10px] font-semibold uppercase">
                              {member.full_name?.[0] || member.email[0]}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 text-left">
                              <span className="font-medium text-foreground truncate text-xs">
                                {member.full_name || "Sin nombre"}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate font-mono">
                                {member.email}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[8px] py-0 px-1.5 shrink-0 hidden sm:inline-flex">
                              {member.role}
                            </Badge>
                            {inviteDestination === member.email && (
                              <Check className="size-3.5 shrink-0 text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Duración
                    </label>
                    <Select
                      value={String(expiresInHours)}
                      onValueChange={(v) => setExpiresInHours(Number(v))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12 Horas</SelectItem>
                        <SelectItem value="24">24 Horas (1 Día)</SelectItem>
                        <SelectItem value="48">48 Horas (2 Días)</SelectItem>
                        <SelectItem value="168">7 Días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Máx. archivos
                    </label>
                    <Select
                      value={String(maxFiles)}
                      onValueChange={(v) => setMaxFiles(Number(v))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 5, 10, 15, 20, 30, 50, 75, 100, 200, 500].map((n) => (
                          <SelectItem key={n} value={String(n)} className="text-xs">
                            {n} {n === 1 ? "Archivo" : "Archivos"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={sendingInvite}
                  className="w-full gap-1.5 h-9 text-xs"
                >
                  {sendingInvite ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {sendingInvite ? "Generando..." : "Generar y enviar enlace"}
                </Button>
              </CardContent>
            </form>

            {/* Generated link success */}
            {generatedLink && (
              <div className="mx-4 sm:mx-6 mt-4 mb-6 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Enlace generado
                  </span>
                  <button
                    type="button"
                    onClick={() => setGeneratedLink(null)}
                    className="text-muted-foreground hover:text-foreground text-[10px] underline"
                  >
                    Ocultar
                  </button>
                </div>
                <p className="text-[10.5px] font-mono text-muted-foreground break-all select-all p-1.5 bg-background border rounded border-border">
                  {generatedLink}
                </p>
                <div className="flex flex-col xs:flex-row gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs flex-1 gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink);
                      toast.success("Enlace copiado al portapapeles");
                    }}
                  >
                    <Copy className="size-3" />
                    Copiar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs flex-1 gap-1 bg-primary hover:bg-primary/95 text-white"
                    onClick={() => {
                      if (navigator.share) {
                        navigator
                          .share({
                            title: "Subir Facturas a Fintral",
                            text: "Usa este enlace para enviarme tus facturas.",
                            url: generatedLink,
                          })
                          .catch(() => {
                            navigator.clipboard.writeText(generatedLink);
                            toast.success("Enlace copiado");
                          });
                      } else {
                        navigator.clipboard.writeText(generatedLink);
                        toast.success("Enlace copiado al portapapeles");
                      }
                    }}
                  >
                    <Share2 className="size-3" />
                    Compartir
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Active links list */}
        <div className="lg:col-span-3">
          <Card className="border-border/60">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-heading">Enlaces activos</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Enlaces compartidos con tus clientes.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs gap-1 shrink-0">
                  <LinkIcon className="size-3" />
                  <span className="hidden sm:inline">{uploadLinks.length} total</span>
                  <span className="sm:hidden">{uploadLinks.length}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              {linksQuery_isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : uploadLinks.length > 0 ? (
                <div className="space-y-3">
                  {uploadLinks.map((link) => {
                    const isExpired = new Date(link.expires_at).getTime() < Date.now();
                    const isActive = link.is_active && !isExpired;
                    const progress = (link.uploaded_count / link.max_files) * 100;
                    const hoursLeft = Math.round(
                      (new Date(link.expires_at).getTime() - Date.now()) / 3600_000
                    );
                    const timeLeft = isExpired
                      ? "Expirado"
                      : hoursLeft < 1
                        ? "Menos de 1h"
                        : `${hoursLeft}h restantes`;

                    return (
                      <div
                        key={link.id}
                        className="p-3 sm:p-4 rounded-xl border border-border bg-card/50 hover:bg-card transition-all"
                      >
                        {/* Top row: avatar + email + status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={cn(
                                "flex size-8 sm:size-7 items-center justify-center rounded-full shrink-0",
                                isActive
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-red-500/10 text-red-600"
                              )}
                            >
                              <Mail className="size-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {link.client_email}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="size-3 shrink-0" />
                                {timeLeft}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] py-0.5 px-2 font-semibold shrink-0",
                              isActive
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-red-500/10 text-red-600 border-red-500/20"
                            )}
                          >
                            {isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>

                        {/* Progress */}
                        <div className="mt-3 space-y-1.5">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <BarChart3 className="size-3" />
                              Archivos
                            </span>
                            <span className="font-medium tabular-nums">
                              {link.uploaded_count} / {link.max_files}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className={cn(
                                "h-1.5 rounded-full transition-all",
                                progress >= 100 ? "bg-amber-500" : "bg-primary"
                              )}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border/40">
                          <span className="text-[9px] font-mono text-muted-foreground truncate max-w-full sm:max-w-[200px] lg:max-w-[300px]">
                            {getPublicLinkUrl(link.token)}
                          </span>
                          <div className="flex items-center gap-1 self-end sm:self-auto">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 px-2 text-indigo-400 hover:text-indigo-300 border-indigo-500/20 hover:border-indigo-500/40"
                              onClick={() => setSelectedLinkId(link.id)}
                            >
                              <Eye className="size-3" />
                              <span>Ver recibidos</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 px-2"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  getPublicLinkUrl(link.token)
                                );
                                toast.success("Enlace copiado");
                              }}
                            >
                              <Copy className="size-3" />
                              <span className="hidden xs:inline">Copiar</span>
                            </Button>
                            {isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] gap-1 px-2 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                                onClick={() => handleRevokeLink(link.id)}
                              >
                                <Trash2 className="size-3" />
                                <span className="hidden xs:inline">Revocar</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Link2 className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">No hay enlaces</p>
                    <p className="text-xs text-muted-foreground max-w-[240px]">
                      Crea tu primer enlace temporal para empezar a recibir facturas de tus clientes.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Received Invoices Dialog */}
      <Dialog open={!!selectedLinkId} onOpenChange={(open) => !open && setSelectedLinkId(null)}>
        <DialogContent className="max-w-2xl w-full border-border/60 bg-card text-foreground max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-sm font-heading flex items-center gap-2">
              <LinkIcon className="size-4 text-indigo-500" />
              Documentos recibidos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Facturas y comprobantes procesados a través del enlace de{" "}
              <span className="font-semibold text-foreground">
                {uploadLinks.find((l) => l.id === selectedLinkId)?.client_email}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {invoicesQuery_isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : invoicesQuery_data?.invoices && invoicesQuery_data.invoices.length > 0 ? (
              <div className="space-y-3">
                {invoicesQuery_data.invoices.map((invoice) => {
                  const formattedDate = invoice.invoice_date
                    ? new Date(invoice.invoice_date).toLocaleDateString("es-DO")
                    : "S/F";
                  const isDraft = invoice.status === "draft";
                  
                  // Extract any AI processing errors from audit_flags
                  let aiProcessingError = "";
                  if (invoice.audit_flags) {
                    try {
                      const flags = JSON.parse(invoice.audit_flags);
                      if (Array.isArray(flags)) {
                        const foundErr = flags.find(
                          (f) =>
                            typeof f === "string" &&
                            (f.includes("Error de procesamiento de IA") || f.includes("Error de procesamiento"))
                        );
                        if (foundErr) {
                          aiProcessingError = foundErr;
                        }
                      }
                    } catch (e) {
                      // ignore
                    }
                  }

                  return (
                    <div
                      key={invoice.id}
                      className="p-3.5 rounded-xl border border-border/60 bg-[#090a16]/40 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-neutral-950 border border-neutral-800/80 shrink-0">
                          <FileText className="size-4 text-indigo-400" />
                        </div>
                        <div className="min-w-0 space-y-0.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-200 truncate max-w-[150px] sm:max-w-[200px]">
                              {invoice.vendor_name || "Proveedor no identificado"}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] py-0 px-1.5 font-semibold",
                                aiProcessingError
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : isDraft
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              )}
                            >
                              {aiProcessingError ? "Error" : isDraft ? "Borrador" : "Verificado"}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            NCF: <span className="font-mono text-neutral-300">{invoice.invoice_number || "S/N"}</span> &middot; Fecha: {formattedDate}
                          </p>
                          <p className="text-[9px] text-neutral-500 font-mono truncate">
                            Archivo: {invoice.filename}
                          </p>
                          {aiProcessingError && (
                            <p className="text-[10px] text-red-400 font-medium bg-red-950/20 border border-red-900/30 rounded-lg p-2 mt-1.5 leading-normal">
                              {aiProcessingError}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/40">
                        <div className="text-left sm:text-right">
                          <p className="font-semibold text-neutral-200 font-mono">
                            {invoice.total_amount
                              ? new Intl.NumberFormat("es-DO", {
                                  style: "currency",
                                  currency: invoice.currency || "DOP",
                                }).format(invoice.total_amount)
                              : "$0.00"}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            Confianza: {Math.round((invoice.confidence_score || 0) * 100)}%
                          </p>
                        </div>
                        <a
                          href={
                            isDraft
                              ? `/dashboard/upload/revisions/${invoice.id}`
                              : `/dashboard/invoices/${invoice.id}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-3 font-semibold transition-colors gap-1 shadow-sm shrink-0"
                        >
                          <span>Revisar</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileText className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No se han procesado documentos</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    Una vez que el cliente envíe y finalice la carga de archivos, aparecerán aquí procesados por la IA.
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
