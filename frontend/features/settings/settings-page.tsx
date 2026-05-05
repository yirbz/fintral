"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { createEvolutionInstance, getEvolutionQr, getEvolutionStatus } from "@/lib/api/evolution";
import {
  createWebhook,
  deleteWebhook,
  getSettings,
  getWebhooks,
  saveSettings,
  testWebhook
} from "@/lib/api/settings";
import type { SettingValue, SettingsPayload } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SECTIONS = ["account", "general", "openai", "whatsapp", "webhooks", "email"] as const;

export function SettingsPage() {
  const [active, setActive] = useState<(typeof SECTIONS)[number]>("account");
  const [saving, setSaving] = useState(false);
  const [waStatus, setWaStatus] = useState("idle");
  const [waQr, setWaQr] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("invoice.processed");

  const session = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const webhooksQuery = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });

  const editable = useMemo(() => {
    return structuredClone(settingsQuery.data ?? ({} as SettingsPayload));
  }, [settingsQuery.data]);

  function findSetting(category: string, key: string): SettingValue {
    if (!editable[category]) editable[category] = [];
    let row = editable[category].find((item) => item.key === key);
    if (!row) {
      row = {
        key,
        value: "",
        type: "string",
        category,
        source: "user"
      };
      editable[category].push(row);
    }
    return row;
  }

  async function persistSettings() {
    setSaving(true);
    try {
      const updates: Array<Record<string, unknown>> = [];
      Object.entries(editable).forEach(([category, rows]) => {
        rows.forEach((row) => {
          updates.push({
            key: row.key,
            value: row.value,
            type: row.type,
            category
          });
        });
      });
      await saveSettings(updates);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSaving(false);
    }
  }

  async function refreshWaStatus() {
    setWaStatus("loading");
    try {
      const data = await getEvolutionStatus();
      const state = (data.instance as { state?: string } | undefined)?.state;
      if (state) {
        setWaStatus(state);
      } else if (typeof data.status === "string") {
        setWaStatus(data.status);
      } else {
        setWaStatus("error");
      }
    } catch {
      setWaStatus("error");
    }
  }

  async function fetchQr() {
    const data = await getEvolutionQr();
    setWaQr((data.base64 as string) ?? null);
  }

  async function createWa() {
    await createEvolutionInstance();
    await refreshWaStatus();
  }

  async function addWebhook() {
    if (!newWebhookUrl) return;
    await createWebhook({ url: newWebhookUrl, events: [newWebhookEvent] });
    setNewWebhookUrl("");
    await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  }

  if (settingsQuery.isLoading || !settingsQuery.data || session.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Configuración</CardTitle>
            <p className="text-xs text-muted-foreground">Gestiona perfil, integraciones y reglas de IA.</p>
          </div>
          <Button onClick={() => void persistSettings()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-12">
        <Card className="md:col-span-3">
          <CardContent className="space-y-2 pt-6">
            {SECTIONS.map((section) => (
              <button
                key={section}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  active === section ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
                onClick={() => setActive(section)}
              >
                {section}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4 md:col-span-9">
          {active === "account" ? (
            <Card>
              <CardHeader>
                <CardTitle>Cuenta</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre">
                  <Input value={session.data?.user.full_name ?? ""} disabled />
                </Field>
                <Field label="Email">
                  <Input value={session.data?.user.email ?? ""} disabled />
                </Field>
                <Field label="Workspace">
                  <Input value={session.data?.organization.name ?? ""} disabled />
                </Field>
                <Field label="Rol">
                  <Input value={session.data?.role ?? ""} disabled />
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {active === "general" ? (
            <Card>
              <CardHeader>
                <CardTitle>Workspace</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre legal">
                  <Input
                    defaultValue={String(findSetting("general", "company_name").value || "")}
                    onChange={(event) => {
                      findSetting("general", "company_name").value = event.target.value;
                    }}
                  />
                </Field>
                <Field label="RNC">
                  <Input
                    defaultValue={String(findSetting("general", "company_tax_id").value || "")}
                    onChange={(event) => {
                      findSetting("general", "company_tax_id").value = event.target.value;
                    }}
                  />
                </Field>
                <Field className="md:col-span-2" label="Dirección fiscal">
                  <Textarea
                    defaultValue={String(findSetting("general", "company_address").value || "")}
                    onChange={(event) => {
                      findSetting("general", "company_address").value = event.target.value;
                    }}
                  />
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {active === "openai" ? (
            <Card>
              <CardHeader>
                <CardTitle>Motor IA</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Field className="md:col-span-2" label="OpenAI API Key">
                  <Input
                    type="password"
                    defaultValue={String(findSetting("openai", "openai_api_key").value || "")}
                    onChange={(event) => {
                      findSetting("openai", "openai_api_key").value = event.target.value;
                    }}
                  />
                </Field>
                <Field label="Modelo">
                  <Select
                    defaultValue={String(findSetting("openai", "openai_model").value || "gpt-4o")}
                    onChange={(event) => {
                      findSetting("openai", "openai_model").value = event.target.value;
                    }}
                  >
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5</option>
                  </Select>
                </Field>
                <Field label="Límite diario USD">
                  <Input
                    type="number"
                    defaultValue={String(findSetting("openai", "openai_daily_limit").value || 0)}
                    onChange={(event) => {
                      findSetting("openai", "openai_daily_limit").value = Number(event.target.value) || 0;
                    }}
                  />
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {active === "whatsapp" ? (
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp / Evolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field className="md:col-span-2" label="URL Evolution API">
                    <Input
                      defaultValue={String(findSetting("whatsapp", "evolution_url").value || "")}
                      onChange={(event) => {
                        findSetting("whatsapp", "evolution_url").value = event.target.value;
                      }}
                    />
                  </Field>
                  <Field label="Global API Key">
                    <Input
                      type="password"
                      defaultValue={String(findSetting("whatsapp", "evolution_apikey").value || "")}
                      onChange={(event) => {
                        findSetting("whatsapp", "evolution_apikey").value = event.target.value;
                      }}
                    />
                  </Field>
                  <Field label="Instancia">
                    <Input
                      defaultValue={String(findSetting("whatsapp", "evolution_instance").value || "")}
                      onChange={(event) => {
                        findSetting("whatsapp", "evolution_instance").value = event.target.value;
                      }}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => void refreshWaStatus()}>
                    Verificar estado
                  </Button>
                  <Button variant="outline" onClick={() => void fetchQr()}>
                    Generar QR
                  </Button>
                  <Button variant="outline" onClick={() => void createWa()}>
                    Crear instancia
                  </Button>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs">Estado: {waStatus}</span>
                </div>
                {waQr ? <img alt="QR WhatsApp" className="h-48 w-48 rounded-md border p-2" src={waQr} /> : null}
              </CardContent>
            </Card>
          ) : null}

          {active === "webhooks" ? (
            <Card>
              <CardHeader>
                <CardTitle>API & Webhooks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                  <Input
                    placeholder="https://hooks.zapier.com/..."
                    value={newWebhookUrl}
                    onChange={(event) => setNewWebhookUrl(event.target.value)}
                  />
                  <Select value={newWebhookEvent} onChange={(event) => setNewWebhookEvent(event.target.value)}>
                    <option value="invoice.processed">invoice.processed</option>
                    <option value="audit.alert">audit.alert</option>
                    <option value="invoices.exported">invoices.exported</option>
                    <option value="*">todos</option>
                  </Select>
                  <Button onClick={() => void addWebhook()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear
                  </Button>
                </div>
                <div className="space-y-2">
                  {(webhooksQuery.data ?? []).map((webhook) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-xs" key={webhook.id}>
                      <div>
                        <p className="font-semibold">{webhook.url}</p>
                        <p className="text-muted-foreground">{webhook.events.join(", ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => void testWebhook(webhook.id)}>
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-rose-700"
                          onClick={async () => {
                            await deleteWebhook(webhook.id);
                            await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {active === "email" ? (
            <Card>
              <CardHeader>
                <CardTitle>Notificaciones por correo</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Field label="SMTP Host">
                  <Input
                    defaultValue={String(findSetting("email", "smtp_host").value || "")}
                    onChange={(event) => {
                      findSetting("email", "smtp_host").value = event.target.value;
                    }}
                  />
                </Field>
                <Field label="SMTP Puerto">
                  <Input
                    type="number"
                    defaultValue={String(findSetting("email", "smtp_port").value || "")}
                    onChange={(event) => {
                      findSetting("email", "smtp_port").value = Number(event.target.value) || 0;
                    }}
                  />
                </Field>
                <Field label="Usuario">
                  <Input
                    defaultValue={String(findSetting("email", "smtp_user").value || "")}
                    onChange={(event) => {
                      findSetting("email", "smtp_user").value = event.target.value;
                    }}
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    defaultValue={String(findSetting("email", "smtp_password").value || "")}
                    onChange={(event) => {
                      findSetting("email", "smtp_password").value = event.target.value;
                    }}
                  />
                </Field>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
