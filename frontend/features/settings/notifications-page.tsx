"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";

import { getSettings, saveSettings } from "@/lib/api/settings";
import type { SettingValue, SettingsPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function NotificationToggle({ label, description, defaultChecked, onChange }: {
  label: string; description: string; defaultChecked: boolean; onChange: (v: boolean) => void;
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

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const {data: settingsQuery_data} = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const editable = settingsQuery_data ?? ({} as SettingsPayload);

  function updateSetting(category: string, key: string, value: string | number | boolean) {
    findSetting(editable, category, key).value = value;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = editable["notifications"] ?? [];
      const updates = rows.map((r) => ({ key: r.key, value: r.value, type: r.type, category: "notifications" }));
      await saveSettings(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm font-heading">Notificaciones</CardTitle>
          <CardDescription className="text-xs">Selecciona qué eventos del sistema generan notificaciones.</CardDescription>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm" className="shrink-0">
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar cambios
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <NotificationToggle label="Procesamiento completado" description="Cuando una factura termina de procesarse con éxito"
          defaultChecked={findSetting(editable, "notifications", "notify_processing_complete").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_processing_complete", v)} />
        <NotificationToggle label="Error de procesamiento" description="Cuando una factura falla durante el procesamiento"
          defaultChecked={findSetting(editable, "notifications", "notify_processing_error").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_processing_error", v)} />
        <NotificationToggle label="Factura recibida vía WhatsApp" description="Cuando se recibe una nueva imagen por WhatsApp"
          defaultChecked={findSetting(editable, "notifications", "notify_whatsapp_received").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_whatsapp_received", v)} />
        <NotificationToggle label="Exportación completada" description="Cuando una exportación de datos finaliza"
          defaultChecked={findSetting(editable, "notifications", "notify_export_complete").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_export_complete", v)} />
        <NotificationToggle label="Alerta de auditoría" description="Cuando se detectan incidencias fiscales en una factura"
          defaultChecked={findSetting(editable, "notifications", "notify_audit_alert").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_audit_alert", v)} />
        <NotificationToggle label="Alerta de costos" description="Cuando se acerca al límite diario de procesamiento"
          defaultChecked={findSetting(editable, "notifications", "notify_cost_alert").value !== "false"}
          onChange={(v) => updateSetting("notifications", "notify_cost_alert", v)} />
      </CardContent>
    </Card>
  );
}
