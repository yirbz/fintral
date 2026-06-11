"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";

import { createEvolutionInstance, getEvolutionQr, getEvolutionStatus } from "@/lib/api/evolution";
import { getSettings, saveSettings } from "@/lib/api/settings";
import type { SettingValue, SettingsPayload } from "@/lib/types";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export function WhatsAppPage() {
  const queryClient = useQueryClient();
  const {data: settingsQuery_data} = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const editable = settingsQuery_data ?? ({} as SettingsPayload);

  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(false);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waQrLoading, setWaQrLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
    if (!editable[category]) editable[category] = [];
    let row = editable[category].find((s) => s.key === key);
    if (!row) {
      row = { key, value: "", type: "string", category, source: "user" };
      editable[category].push(row);
    }
    row.value = value;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = editable["whatsapp"] ?? [];
      const updates = rows.map((r) => ({ key: r.key, value: r.value, type: r.type, category: "whatsapp" }));
      await saveSettings(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

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
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm" className="shrink-0">
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar cambios
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">URL Evolution API</Label>
            <Input
              defaultValue={String(findSetting("whatsapp", "evolution_url").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_url", e.target.value)}
              placeholder="https://evolution.api.com"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Global API Key</Label>
            <Input
              type="password"
              defaultValue={String(findSetting("whatsapp", "evolution_apikey").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_apikey", e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Instancia</Label>
            <Input
              defaultValue={String(findSetting("whatsapp", "evolution_instance").value || "")}
              onChange={(e) => updateSetting("whatsapp", "evolution_instance", e.target.value)}
              placeholder="whatsapp-instance"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Número autorizado</Label>
            <Input
              defaultValue={String(findSetting("whatsapp", "authorized_whatsapp_number").value || "")}
              onChange={(e) => updateSetting("whatsapp", "authorized_whatsapp_number", e.target.value)}
              placeholder="15555550100"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Respuesta automática</Label>
            <div className="flex h-7 items-center">
              <Switch
                defaultChecked={findSetting("whatsapp", "whatsapp_auto_reply").value === "true"}
                onCheckedChange={(v) => updateSetting("whatsapp", "whatsapp_auto_reply", v)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-3">Estado de conexión</p>
          <div className="flex flex-wrap items-center gap-2">
            {waStatus ? (
              <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 ${statusColor}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  waStatus === "open" || waStatus === "connected"
                    ? "bg-emerald-500"
                    : waStatus === "loading" || waStatus === "connecting"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-destructive"
                }`} />
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
              <Image alt="WhatsApp QR" className="h-40 w-40 rounded-lg border p-1.5" src={waQr} width={160} height={160} unoptimized />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
