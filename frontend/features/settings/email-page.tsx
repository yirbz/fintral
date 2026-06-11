"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { getSettings, saveSettings } from "@/lib/api/settings";
import type { SettingValue, SettingsPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function findSetting(editable: SettingsPayload, category: string, key: string): SettingValue {
  if (!editable[category]) editable[category] = [];
  let row = editable[category].find((s) => s.key === key);
  if (!row) {
    row = { key, value: "", type: "string", category, source: "user" };
    editable[category].push(row);
  }
  return row;
}

export function EmailPage() {
  const queryClient = useQueryClient();
  const {data: settingsQuery_data} = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const editable = settingsQuery_data ?? ({} as SettingsPayload);
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());

  function updateSetting(category: string, key: string, value: string | number | boolean) {
    findSetting(editable, category, key).value = value;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = editable["email"] ?? [];
      const updates = rows.map((r) => ({ key: r.key, value: r.value, type: r.type, category: "email" }));
      await saveSettings(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  function toggleKeyVisibility(key: string) {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm font-heading">Correo</CardTitle>
          <CardDescription className="text-xs">Configuración SMTP para notificaciones por correo electrónico.</CardDescription>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm" className="shrink-0">
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar cambios
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SMTP Host</Label>
            <Input defaultValue={String(findSetting(editable, "email", "smtp_host").value || "")}
              onChange={(e) => updateSetting("email", "smtp_host", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SMTP Puerto</Label>
            <Input type="number" defaultValue={String(findSetting(editable, "email", "smtp_port").value || "587")}
              onChange={(e) => updateSetting("email", "smtp_port", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usuario</Label>
            <Input defaultValue={String(findSetting(editable, "email", "smtp_user").value || "")}
              onChange={(e) => updateSetting("email", "smtp_user", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contraseña</Label>
            <div className="relative">
              <Input type={showKeys.has("smtp_password") ? "text" : "password"}
                defaultValue={String(findSetting(editable, "email", "smtp_password").value || "")}
                onChange={(e) => updateSetting("email", "smtp_password", e.target.value)} className="pr-8" />
              <button type="button" onClick={() => toggleKeyVisibility("smtp_password")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKeys.has("smtp_password") ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email remitente</Label>
            <Input defaultValue={String(findSetting(editable, "email", "smtp_from").value || "")}
              onChange={(e) => updateSetting("email", "smtp_from", e.target.value)} placeholder="notificaciones@fintral.com" />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usar TLS</Label>
            <div className="flex h-7 items-center">
              <Switch defaultChecked={findSetting(editable, "email", "smtp_tls").value === "true" || findSetting(editable, "email", "smtp_tls").value === true}
                onCheckedChange={(v) => updateSetting("email", "smtp_tls", v)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
