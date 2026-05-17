"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, User, Building2, Brain, MessageCircle, Webhook, Mail, Settings2, Bell, CreditCard, Eye, EyeOff, RefreshCw, Ban, Zap, Globe, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";

import { createEvolutionInstance, getEvolutionQr, getEvolutionStatus } from "@/lib/api/evolution";
import {
  createWebhook,
  deleteWebhook,
  getSettings,
  getWebhooks,
  saveSettings,
  testWebhook,
} from "@/lib/api/settings";
import { getStatistics } from "@/lib/api/statistics";
import type { SettingValue, SettingsPayload, StatisticsPayload, WebhookEndpoint } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type SectionId = "profile" | "organization" | "ai" | "whatsapp" | "webhooks" | "email" | "preferences" | "notifications" | "billing" | "password";

interface Section {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: Section[] = [
  { id: "profile", label: "Perfil", icon: <User className="size-3.5" /> },
  { id: "organization", label: "Organización", icon: <Building2 className="size-3.5" /> },
  { id: "ai", label: "Motor IA", icon: <Brain className="size-3.5" /> },
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="size-3.5" /> },
  { id: "webhooks", label: "Webhooks", icon: <Webhook className="size-3.5" /> },
  { id: "email", label: "Correo", icon: <Mail className="size-3.5" /> },
  { id: "preferences", label: "Preferencias", icon: <Settings2 className="size-3.5" /> },
  { id: "notifications", label: "Notificaciones", icon: <Bell className="size-3.5" /> },
  { id: "billing", label: "Facturación", icon: <CreditCard className="size-3.5" /> },
  { id: "password", label: "Contraseña", icon: <KeyRound className="size-3.5" /> },
];

const SAVE_CATEGORY_MAP: Record<SectionId, string | null> = {
  profile: null,
  organization: "general",
  ai: "openai",
  whatsapp: "whatsapp",
  webhooks: null,
  email: "email",
  preferences: "preferences",
  notifications: "notifications",
  billing: null,
  password: null,
};

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>("profile");
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());

  const session = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const webhooksQuery = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });
  const statsQuery = useQuery({ queryKey: ["statistics", "30d"], queryFn: () => getStatistics("30d") });

  const editable = useMemo(() => {
    return structuredClone(settingsQuery.data ?? ({} as SettingsPayload));
  }, [settingsQuery.data]);

  function findSetting(category: string, key: string): SettingValue {
    if (!editable[category]) editable[category] = [];
    let row = editable[category].find((s) => s.key === key);
    if (!row) {
      row = { key, value: "", type: "string", category, source: "user" };
      editable[category].push(row);
    }
    return row;
  }

  function updateSetting(category: string, key: string, value: string | number | boolean) {
    findSetting(category, key).value = value;
  }

  function toggleKeyVisibility(key: string) {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (category: string) => {
      const rows = editable[category] ?? [];
      const updates = rows.map((r) => ({ key: r.key, value: r.value, type: r.type, category }));
      await saveSettings(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 className="size-4 text-primary" />
            <p className="text-xs font-medium text-primary">Configuración del sistema</p>
          </div>
          <h1 className="text-lg font-heading font-semibold tracking-tight text-foreground">Ajustes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Gestiona tu perfil, integraciones y preferencias del sistema.</p>
        </div>
      </div>

      {settingsQuery.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <Card className="h-fit">
            <CardContent className="flex flex-col gap-1 p-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-3 w-44 rounded-md" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="mb-1 h-3 w-16 rounded-md" />
                      <Skeleton className="h-7 w-full rounded-md" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-36 rounded-md" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="mb-1 h-3 w-20 rounded-md" />
                    <Skeleton className="h-7 w-full rounded-md" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          {/* Sidebar */}
          <Card className="h-fit">
            <CardContent className="flex flex-col gap-0.5 p-2">
              {SECTIONS.map((section) => {
                const cat = SAVE_CATEGORY_MAP[section.id];
                return (
                  <button
                    key={section.id}
                    onClick={() => setActive(section.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left ${
                      active === section.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {section.icon}
                    <span className="flex-1">{section.label}</span>
                    {cat && saveMutation.isPending && saveMutation.variables === cat ? (
                      <Loader2 className="size-3 animate-spin shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Content */}
          <div className="flex flex-col gap-4">
            {active === "profile" ? (
              <ProfileSection session={session} />
            ) : null}

            {active === "password" ? (
              <PasswordSection />
            ) : null}

            {active === "organization" ? (
              <SettingsSection
                title="Organización"
                description="Información legal y fiscal de tu empresa."
                category="general"
                saving={saveMutation.isPending && saveMutation.variables === "general"}
                onSave={() => saveMutation.mutate("general")}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre legal">
                    <Input
                      defaultValue={String(findSetting("general", "company_name").value || "")}
                      onChange={(e) => updateSetting("general", "company_name", e.target.value)}
                    />
                  </Field>
                  <Field label="RNC / Tax ID">
                    <Input
                      defaultValue={String(findSetting("general", "company_tax_id").value || "")}
                      onChange={(e) => updateSetting("general", "company_tax_id", e.target.value)}
                    />
                  </Field>
                  <Field className="md:col-span-2" label="Dirección fiscal">
                    <Textarea
                      defaultValue={String(findSetting("general", "company_address").value || "")}
                      onChange={(e) => updateSetting("general", "company_address", e.target.value)}
                    />
                  </Field>
                  <Field label="País">
                    <Select
                      value={String(findSetting("general", "company_country").value || "DOM")}
                      onValueChange={(v) => updateSetting("general", "company_country", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOM">República Dominicana</SelectItem>
                        <SelectItem value="USA">Estados Unidos</SelectItem>
                        <SelectItem value="ESP">España</SelectItem>
                        <SelectItem value="COL">Colombia</SelectItem>
                        <SelectItem value="MEX">México</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Zona horaria">
                    <Select
                      value={String(findSetting("general", "timezone").value || "America/Santo_Domingo")}
                      onValueChange={(v) => updateSetting("general", "timezone", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Santo_Domingo">Santo Domingo (UTC-4)</SelectItem>
                        <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                        <SelectItem value="America/Mexico_City">Ciudad de México (UTC-6)</SelectItem>
                        <SelectItem value="America/Bogota">Bogotá (UTC-5)</SelectItem>
                        <SelectItem value="Europe/Madrid">Madrid (UTC+1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SettingsSection>
            ) : null}

            {active === "ai" ? (
              <SettingsSection
                title="Motor IA"
                description="Configuración del motor de inteligencia artificial para procesamiento de facturas."
                category="openai"
                saving={saveMutation.isPending && saveMutation.variables === "openai"}
                onSave={() => saveMutation.mutate("openai")}
              >
                <div className="flex flex-col gap-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field className="md:col-span-2" label="OpenAI API Key">
                      <div className="relative">
                        <Input
                          type={showKeys.has("openai_api_key") ? "text" : "password"}
                          defaultValue={String(findSetting("openai", "openai_api_key").value || "")}
                          onChange={(e) => updateSetting("openai", "openai_api_key", e.target.value)}
                          className="pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility("openai_api_key")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKeys.has("openai_api_key") ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                      </div>
                    </Field>
                    <Field label="Modelo">
                      <Select
                        value={String(findSetting("openai", "openai_model").value || "gpt-4o")}
                        onValueChange={(v) => updateSetting("openai", "openai_model", v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Límite diario (USD)">
                      <Input
                        type="number"
                        step="0.5"
                        defaultValue={String(findSetting("openai", "openai_daily_limit").value || "10")}
                        onChange={(e) => updateSetting("openai", "openai_daily_limit", Number(e.target.value) || 0)}
                      />
                    </Field>
                  </div>

                  {/* Ollama config */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="size-3.5 text-muted-foreground" />
                      <p className="text-xs font-medium text-foreground">Ollama (local)</p>
                    </div>
                    <p className="mb-2 text-[11px] text-muted-foreground">Alternativa auto-gestionada para procesamiento local.</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Host">
                        <Input
                          defaultValue={String(findSetting("openai", "ollama_host").value || "http://localhost:11434")}
                          onChange={(e) => updateSetting("openai", "ollama_host", e.target.value)}
                        />
                      </Field>
                      <Field label="Modelo">
                        <Input
                          defaultValue={String(findSetting("openai", "ollama_model").value || "gemma4:e2b-it-q4_K_M")}
                          onChange={(e) => updateSetting("openai", "ollama_model", e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Usage summary */}
                  {statsQuery.data ? (
                    <div className="rounded-lg border border-border/60 p-3">
                      <p className="text-xs font-medium text-foreground mb-2">Uso del período</p>
                      <div className="flex flex-wrap gap-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Procesadas hoy</p>
                          <p className="font-mono text-sm tabular-nums font-semibold">{statsQuery.data.performance.daily_processed}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Confianza promedio</p>
                          <p className="font-mono text-sm tabular-nums font-semibold">{(statsQuery.data.performance.avg_confidence * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Costo promedio/doc</p>
                          <p className="font-mono text-sm tabular-nums font-semibold">${statsQuery.data.costs.avg_cost_per_doc.toFixed(4)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Costo total</p>
                          <p className="font-mono text-sm tabular-nums font-semibold">${statsQuery.data.costs.total_cost.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </SettingsSection>
            ) : null}

            {active === "whatsapp" ? (
              <WhatsAppSection
                findSetting={findSetting}
                updateSetting={updateSetting}
                editable={editable}
                saveMutation={saveMutation}
              />
            ) : null}

            {active === "webhooks" ? (
              <WebhooksSection
                webhooksQuery={webhooksQuery}
                queryClient={queryClient}
              />
            ) : null}

            {active === "email" ? (
              <SettingsSection
                title="Correo"
                description="Configuración SMTP para notificaciones por correo electrónico."
                category="email"
                saving={saveMutation.isPending && saveMutation.variables === "email"}
                onSave={() => saveMutation.mutate("email")}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="SMTP Host">
                    <Input
                      defaultValue={String(findSetting("email", "smtp_host").value || "")}
                      onChange={(e) => updateSetting("email", "smtp_host", e.target.value)}
                    />
                  </Field>
                  <Field label="SMTP Puerto">
                    <Input
                      type="number"
                      defaultValue={String(findSetting("email", "smtp_port").value || "587")}
                      onChange={(e) => updateSetting("email", "smtp_port", Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Usuario">
                    <Input
                      defaultValue={String(findSetting("email", "smtp_user").value || "")}
                      onChange={(e) => updateSetting("email", "smtp_user", e.target.value)}
                    />
                  </Field>
                  <Field label="Contraseña">
                    <div className="relative">
                      <Input
                        type={showKeys.has("smtp_password") ? "text" : "password"}
                        defaultValue={String(findSetting("email", "smtp_password").value || "")}
                        onChange={(e) => updateSetting("email", "smtp_password", e.target.value)}
                        className="pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility("smtp_password")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKeys.has("smtp_password") ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Email remitente">
                    <Input
                      defaultValue={String(findSetting("email", "smtp_from").value || "")}
                      onChange={(e) => updateSetting("email", "smtp_from", e.target.value)}
                      placeholder="notificaciones@fintral.com"
                    />
                  </Field>
                  <Field label="Usar TLS">
                    <div className="flex h-7 items-center">
                      <Switch
                        defaultChecked={findSetting("email", "smtp_tls").value === "true" || findSetting("email", "smtp_tls").value === true}
                        onCheckedChange={(v) => updateSetting("email", "smtp_tls", v)}
                      />
                    </div>
                  </Field>
                </div>
              </SettingsSection>
            ) : null}

            {active === "preferences" ? (
              <SettingsSection
                title="Preferencias"
                description="Ajustes generales de visualización y formato."
                category="preferences"
                saving={saveMutation.isPending && saveMutation.variables === "preferences"}
                onSave={() => saveMutation.mutate("preferences")}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Moneda predeterminada">
                    <Select
                      value={String(findSetting("preferences", "currency").value || "DOP")}
                      onValueChange={(v) => updateSetting("preferences", "currency", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOP">DOP (RD$)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Formato de fecha">
                    <Select
                      value={String(findSetting("preferences", "date_format").value || "DD/MM/YYYY")}
                      onValueChange={(v) => updateSetting("preferences", "date_format", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Ítems por página">
                    <Select
                      value={String(findSetting("preferences", "items_per_page").value || "25")}
                      onValueChange={(v) => updateSetting("preferences", "items_per_page", Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Días de vencimiento por defecto">
                    <Input
                      type="number"
                      defaultValue={String(findSetting("preferences", "default_due_days").value || "30")}
                      onChange={(e) => updateSetting("preferences", "default_due_days", Number(e.target.value) || 30)}
                    />
                  </Field>
                  <Field label="Idioma">
                    <Select
                      value={String(findSetting("preferences", "language").value || "es")}
                      onValueChange={(v) => updateSetting("preferences", "language", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SettingsSection>
            ) : null}

            {active === "notifications" ? (
              <SettingsSection
                title="Notificaciones"
                description="Selecciona qué eventos del sistema generan notificaciones."
                category="notifications"
                saving={saveMutation.isPending && saveMutation.variables === "notifications"}
                onSave={() => saveMutation.mutate("notifications")}
              >
                <div className="flex flex-col gap-3">
                  <NotificationToggle
                    label="Procesamiento completado"
                    description="Cuando una factura termina de procesarse con éxito"
                    defaultChecked={findSetting("notifications", "notify_processing_complete").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_processing_complete", v)}
                  />
                  <NotificationToggle
                    label="Error de procesamiento"
                    description="Cuando una factura falla durante el procesamiento"
                    defaultChecked={findSetting("notifications", "notify_processing_error").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_processing_error", v)}
                  />
                  <NotificationToggle
                    label="Factura recibida vía WhatsApp"
                    description="Cuando se recibe una nueva imagen por WhatsApp"
                    defaultChecked={findSetting("notifications", "notify_whatsapp_received").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_whatsapp_received", v)}
                  />
                  <NotificationToggle
                    label="Exportación completada"
                    description="Cuando una exportación de datos finaliza"
                    defaultChecked={findSetting("notifications", "notify_export_complete").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_export_complete", v)}
                  />
                  <NotificationToggle
                    label="Alerta de auditoría"
                    description="Cuando se detectan incidencias fiscales en una factura"
                    defaultChecked={findSetting("notifications", "notify_audit_alert").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_audit_alert", v)}
                  />
                  <NotificationToggle
                    label="Alerta de costos"
                    description="Cuando se acerca al límite diario de procesamiento"
                    defaultChecked={findSetting("notifications", "notify_cost_alert").value !== "false"}
                    onChange={(v) => updateSetting("notifications", "notify_cost_alert", v)}
                  />
                </div>
              </SettingsSection>
            ) : null}

            {active === "billing" ? (
              <BillingSection statsQuery={statsQuery} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SettingsSection({
  title,
  description,
  category,
  saving,
  onSave,
  children,
}: {
  title: string;
  description: string;
  category: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm font-heading">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        <Button onClick={onSave} disabled={saving} size="sm" className="shrink-0">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PasswordSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Contraseña</CardTitle>
        <CardDescription className="text-xs">Cambia tu contraseña de acceso a Fintral.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Para cambiar tu contraseña, serás redirigido a la página de restablecimiento donde podrás ingresar un código de verificación enviado a tu correo electrónico.
        </p>
        <a
          href="/forgot-password"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 transition-colors self-start"
        >
          <KeyRound className="size-4" />
          Cambiar contraseña
        </a>
      </CardContent>
    </Card>
  );
}

function ProfileSection({ session }: { session: ReturnType<typeof useSession> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Perfil</CardTitle>
        <CardDescription className="text-xs">Información de tu cuenta de usuario.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre">
          <Input value={session.data?.user.full_name ?? ""} disabled className="text-muted-foreground" />
        </Field>
        <Field label="Email">
          <Input value={session.data?.user.email ?? ""} disabled className="text-muted-foreground" />
        </Field>
        <Field label="Organización">
          <Input value={session.data?.organization.name ?? ""} disabled className="text-muted-foreground" />
        </Field>
        <Field label="Rol">
          <Input value={session.data?.role ?? ""} disabled className="text-muted-foreground" />
        </Field>
      </CardContent>
    </Card>
  );
}

function WhatsAppSection({
  findSetting,
  updateSetting,
  saveMutation,
}: {
  findSetting: (cat: string, key: string) => SettingValue;
  updateSetting: (cat: string, key: string, value: string | number | boolean) => void;
  editable: SettingsPayload;
  saveMutation: { mutate: (vars: string) => void; isPending: boolean; variables: string | undefined };
}) {
  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(false);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waQrLoading, setWaQrLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function refreshWaStatus() {
    setWaStatusLoading(true);
    try {
      const data = await getEvolutionStatus() as Record<string, unknown>;
      const state = (data.instance as { state?: string } | undefined)?.state;
      setWaStatus(typeof state === "string" ? state : (data.status as string) ?? "error");
    } catch {
      setWaStatus("error");
    } finally {
      setWaStatusLoading(false);
    }
  }

  async function fetchQr() {
    setWaQrLoading(true);
    try {
      const data = await getEvolutionQr();
      setWaQr((data.base64 as string) ?? null);
    } finally {
      setWaQrLoading(false);
    }
  }

  async function createWa() {
    setCreating(true);
    try {
      await createEvolutionInstance();
      await refreshWaStatus();
    } finally {
      setCreating(false);
    }
  }

  const statusColor =
    waStatus === "open" || waStatus === "connected"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : waStatus === "loading" || waStatus === "connecting"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm font-heading">WhatsApp / Evolution</CardTitle>
          <CardDescription className="text-xs">Configuración de la integración con WhatsApp Business API vía Evolution.</CardDescription>
        </div>
        <Button
          onClick={() => saveMutation.mutate("whatsapp")}
          disabled={saveMutation.isPending && saveMutation.variables === "whatsapp"}
          size="sm"
          className="shrink-0"
        >
          {saveMutation.isPending && saveMutation.variables === "whatsapp" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Guardar cambios
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field className="md:col-span-2" label="URL Evolution API">
            <Input
              defaultValue={String(findSetting("whatsapp", "evolution_url").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_url", e.target.value)}
              placeholder="https://evolution.api.com"
            />
          </Field>
          <Field label="Global API Key">
            <Input
              type="password"
              defaultValue={String(findSetting("whatsapp", "evolution_apikey").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_apikey", e.target.value)}
            />
          </Field>
          <Field label="Instancia">
            <Input
              defaultValue={String(findSetting("whatsapp", "evolution_instance").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_instance", e.target.value)}
              placeholder="whatsapp-instance"
            />
          </Field>
          <Field label="Número autorizado">
            <Input
              defaultValue={String(findSetting("whatsapp", "authorized_whatsapp_number").value || "")}
              onChange={(e) => updateSetting("whatsapp", "authorized_whatsapp_number", e.target.value)}
              placeholder="15555550100"
            />
          </Field>
          <Field label="Respuesta automática">
            <div className="flex h-7 items-center">
              <Switch
                defaultChecked={findSetting("whatsapp", "whatsapp_auto_reply").value === "true"}
                onCheckedChange={(v) => updateSetting("whatsapp", "whatsapp_auto_reply", v)}
              />
            </div>
          </Field>
        </div>

        {/* Status & Actions */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-3">Estado de conexión</p>
          <div className="flex flex-wrap items-center gap-2">
            {waStatus ? (
              <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 ${statusColor}`}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    waStatus === "open" || waStatus === "connected"
                      ? "bg-emerald-500"
                      : waStatus === "loading" || waStatus === "connecting"
                        ? "bg-amber-500 animate-pulse"
                        : "bg-destructive"
                  }`}
                />
                {waStatus === "open" || waStatus === "connected"
                  ? "Conectado"
                  : waStatus === "loading" || waStatus === "connecting"
                    ? "Conectando..."
                    : "Desconectado"}
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refreshWaStatus()} disabled={waStatusLoading}>
              {waStatusLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Verificar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void fetchQr()} disabled={waQrLoading}>
              {waQrLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Generar QR
            </Button>
            <Button variant="outline" size="sm" onClick={() => void createWa()} disabled={creating}>
              {creating ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
              Crear instancia
            </Button>
          </div>
          {waQr ? (
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-muted-foreground">Escanea este código con WhatsApp para vincular:</p>
              <img alt="WhatsApp QR" className="h-40 w-40 rounded-lg border p-1.5" src={waQr} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function WebhooksSection({
  webhooksQuery,
  queryClient,
}: {
  webhooksQuery: ReturnType<typeof useQuery>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("invoice.processed");
  const [creating, setCreating] = useState(false);

  async function addWebhook() {
    if (!newWebhookUrl) return;
    setCreating(true);
    try {
      await createWebhook({ url: newWebhookUrl, events: [newWebhookEvent] });
      setNewWebhookUrl("");
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    } finally {
      setCreating(false);
    }
  }

  const webhooks = (webhooksQuery.data as WebhookEndpoint[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Webhooks</CardTitle>
        <CardDescription className="text-xs">
          Recibe notificaciones HTTP cuando ocurren eventos en el sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input
            placeholder="https://hooks.zapier.com/..."
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
          />
          <Select value={newWebhookEvent} onValueChange={(v) => setNewWebhookEvent(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice.processed">invoice.processed</SelectItem>
              <SelectItem value="audit.alert">audit.alert</SelectItem>
              <SelectItem value="invoices.exported">invoices.exported</SelectItem>
              <SelectItem value="*">todos los eventos</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => void addWebhook()} disabled={creating || !newWebhookUrl}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Crear
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 py-10">
            <Webhook className="mb-2 size-6 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">Sin webhooks configurados</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">Añade tu primer webhook para recibir eventos del sistema.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {webhooks.map((webhook) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3" key={webhook.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{webhook.url}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {webhook.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {ev}
                      </Badge>
                    ))}
                    <Badge variant={webhook.is_active ? "default" : "outline"} className="text-[10px] px-1.5 py-0 h-4">
                      {webhook.is_active ? "activo" : "inactivo"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void testWebhook(webhook.id)}>
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      await deleteWebhook(webhook.id);
                      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
                    }}
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillingSection({ statsQuery }: { statsQuery: ReturnType<typeof useQuery> }) {
  const stats = statsQuery.data as StatisticsPayload | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Facturación</CardTitle>
        <CardDescription className="text-xs">Plan actual, uso y límites del período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Plan card */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="default" className="mb-2">Plan Pro</Badge>
              <p className="text-sm font-heading font-semibold">Procesamiento IA + WhatsApp</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Incluye OpenAI, Evolution API, exportaciones DGII y soporte prioritario.</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Cambiar plan
            </Button>
          </div>
        </div>

        {/* Usage stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Facturas procesadas</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
              {stats?.queue.processed_total ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">este período</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Cola pendiente</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
              {stats?.queue.pending ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">por procesar</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">Costo IA</p>
            <p className="font-mono text-lg tabular-nums font-semibold mt-0.5">
              ${stats?.costs.total_cost.toFixed(2) ?? "0.00"}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">total acumulado</p>
          </div>
        </div>

        {/* Limits */}
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-foreground mb-3">Límites del plan</p>
          <div className="flex flex-col gap-2">
            <LimitRow label="Documentos / mes" used={stats?.queue.processed_total ?? 0} limit={500} />
            <LimitRow label="Costo IA / día" used={stats?.costs.total_cost ?? 0} limit={10} unit="$" />
            <LimitRow label="API requests / hora" used={stats?.queue.pending ?? 0} limit={100} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LimitRow({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground min-w-[4rem] text-right">
        {unit}{used.toFixed(1)} / {unit}{limit}
      </span>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  defaultChecked,
  onChange,
}: {
  label: string;
  description: string;
  defaultChecked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
