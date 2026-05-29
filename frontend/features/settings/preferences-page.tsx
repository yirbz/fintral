"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState, useMemo } from "react";

import { getSettings, saveSettings } from "@/lib/api/settings";
import type { SettingValue, SettingsPayload } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

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

function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/30">
      <div className="min-w-0 pr-4">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0"
      />
    </div>
  );
}

export function PreferencesPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const [editable, setEditable] = useState<SettingsPayload>({});
  const [theme, setTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    if (settingsQuery.data) {
      setEditable(structuredClone(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeMode | null;
    if (stored) setTheme(stored);
  }, []);

  function getSetting(category: string, key: string): SettingValue {
    if (!editable[category]) editable[category] = [];
    let row = editable[category].find((s) => s.key === key);
    if (!row) {
      row = { key, value: "", type: "string", category, source: "user" };
      editable[category].push(row);
    }
    return row;
  }

  function updateSetting(
    category: string,
    key: string,
    value: string | number | boolean
  ) {
    setEditable((prev) => {
      const copy = { ...prev };
      if (!copy[category]) copy[category] = [];
      const idx = copy[category].findIndex((s) => s.key === key);
      if (idx >= 0) {
        copy[category] = copy[category].map((s) =>
          s.key === key ? { ...s, value } : s
        );
      } else {
        copy[category] = [
          ...copy[category],
          { key, value, type: "string", category, source: "user" },
        ];
      }
      return copy;
    });
  }

  function setThemeAndPersist(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem("theme", mode);
    updateSetting("preferences", "theme", mode);

    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else if (mode === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }

  // Read controlled values
  const currency = String(getSetting("preferences", "currency").value || "DOP");
  const dateFormat = String(getSetting("preferences", "date_format").value || "DD/MM/YYYY");
  const timeFormat = String(getSetting("preferences", "time_format").value || "24h");
  const timezone = String(getSetting("preferences", "timezone").value || "America/Santo_Domingo");
  const language = String(getSetting("preferences", "language").value || "es");
  const itemsPerPage = String(getSetting("preferences", "items_per_page").value || "25");
  const defaultDueDays = Number(getSetting("preferences", "default_due_days").value || 30);
  const firstDayOfWeek = String(getSetting("preferences", "first_day_of_week").value || "monday");
  const compactView = getSetting("preferences", "compact_view").value === true || getSetting("preferences", "compact_view").value === "true";
  const systemSounds = getSetting("preferences", "system_sounds").value === true || getSetting("preferences", "system_sounds").value === "true";
  const desktopNotifications = getSetting("preferences", "desktop_notifications").value === true || getSetting("preferences", "desktop_notifications").value === "true";

  const datePreview = useMemo(
    () => formatDemoDate(dateFormat, timeFormat),
    [dateFormat, timeFormat]
  );
  const currencyPreview = useMemo(() => formatDemoCurrency(currency), [currency]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const allRows = Object.values(editable).flat();
      const updates = allRows.map((r) => ({
        key: r.key,
        value: r.value,
        type: r.type,
        category: r.category,
      }));
      await saveSettings(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Preferencias guardadas");
    },
    onError: (err: Error) => {
      toast.error("Error al guardar preferencias", { description: err.message });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between pb-4">
        <div>
          <CardTitle className="text-sm font-heading">Preferencias</CardTitle>
          <CardDescription className="text-xs">
            Personaliza la experiencia del sistema.
          </CardDescription>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          size="sm"
          className="shrink-0"
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">

        {/* ── Apariencia ── */}
        <div>
          <h3 className="mb-3 text-xs font-semibold text-foreground">Apariencia</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tema
              </Label>
              <div className="flex gap-1.5">
                {(
                  [
                    { value: "light", icon: Sun, label: "Claro" },
                    { value: "dark", icon: Moon, label: "Oscuro" },
                    { value: "system", icon: Monitor, label: "Sistema" },
                  ] as const
                ).map(({ value, icon: Icon, label }) => (
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
              <Select
                value={language}
                onValueChange={(v) => updateSetting("preferences", "language", v)}
              >
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

        {/* ── Regional ── */}
        <div>
          <h3 className="mb-3 text-xs font-semibold text-foreground">Regional</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Moneda predeterminada
              </Label>
              <Select
                value={currency}
                onValueChange={(v) => {
                  updateSetting("preferences", "currency", v);
                  localStorage.setItem("user_currency", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">🇩🇴 DOP — Peso dominicano</SelectItem>
                  <SelectItem value="USD">🇺🇸 USD — Dólar americano</SelectItem>
                  <SelectItem value="EUR">🇪🇺 EUR — Euro</SelectItem>
                  <SelectItem value="CAD">🇨🇦 CAD — Dólar canadiense</SelectItem>
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
              <Select
                value={timezone}
                onValueChange={(v) => {
                  updateSetting("preferences", "timezone", v);
                  localStorage.setItem("user_timezone", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Santo_Domingo">Santo Domingo (UTC-4)</SelectItem>
                  <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                  <SelectItem value="America/Mexico_City">Ciudad de México (UTC-6)</SelectItem>
                  <SelectItem value="America/Bogota">Bogotá (UTC-5)</SelectItem>
                  <SelectItem value="America/Lima">Lima (UTC-5)</SelectItem>
                  <SelectItem value="America/Chicago">Chicago (UTC-6)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Los Ángeles (UTC-8)</SelectItem>
                  <SelectItem value="Europe/Madrid">Madrid (UTC+1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Formato de fecha
              </Label>
              <Select
                value={dateFormat}
                onValueChange={(v) => {
                  updateSetting("preferences", "date_format", v);
                  localStorage.setItem("user_date_format", v);
                }}
              >
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
              <Select
                value={timeFormat}
                onValueChange={(v) => updateSetting("preferences", "time_format", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24h (14:30)</SelectItem>
                  <SelectItem value="12h">12h (2:30 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Live preview */}
            <div className="md:col-span-2">
              <p className="text-[10px] text-muted-foreground">
                Vista previa:{" "}
                <span className="font-mono text-foreground bg-muted rounded px-1.5 py-0.5">
                  {datePreview}
                </span>
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Tablas y listados ── */}
        <div>
          <h3 className="mb-3 text-xs font-semibold text-foreground">Tablas y listados</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Ítems por página
              </Label>
              <Select
                value={itemsPerPage}
                onValueChange={(v) =>
                  updateSetting("preferences", "items_per_page", Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25 (recomendado)</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Días de vencimiento por defecto
              </Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={defaultDueDays}
                onChange={(e) =>
                  updateSetting("preferences", "default_due_days", Number(e.target.value) || 30)
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Primer día de la semana
              </Label>
              <Select
                value={firstDayOfWeek}
                onValueChange={(v) =>
                  updateSetting("preferences", "first_day_of_week", v)
                }
              >
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

        {/* ── Interfaz y notificaciones ── */}
        <div>
          <h3 className="mb-3 text-xs font-semibold text-foreground">
            Interfaz y notificaciones
          </h3>
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
              checked={
                getSetting("preferences", "auto_save_drafts").value === true ||
                getSetting("preferences", "auto_save_drafts").value === "true"
              }
              onCheckedChange={(v) => updateSetting("preferences", "auto_save_drafts", v)}
              label="Guardar borradores automáticamente"
              description="Guardar cambios no enviados en facturas en edición."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
