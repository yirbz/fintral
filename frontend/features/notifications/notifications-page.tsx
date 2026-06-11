"use client";

import { Bell, Check, CheckCheck, Loader2, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getNotifications, readAllNotifications, readNotification } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications(false, 100);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleMarkRead(id: string) {
    setSelected(id);
    try {
      await readNotification(id);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    } finally {
      setSelected(null);
    }
  }

  async function handleClearAll() {
    await readAllNotifications();
    setItems([]);
  }

  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute right-16 bottom-0 h-20 w-20 rounded-full bg-primary/8 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Bell className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Notificaciones
              </p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Centro de notificaciones</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {unreadCount > 0
                ? `Tienes ${unreadCount} notificacion${unreadCount !== 1 ? "es" : ""} sin leer.`
                : "No hay notificaciones nuevas."}
            </p>
          </div>
          {items.length > 0 ? (
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleClearAll}>
                  <CheckCheck className="size-3.5" />
                  Marcar todas como leídas
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* List */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card">
            <Inbox className="size-6 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">No hay notificaciones</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Las notificaciones de facturas recibidas, errores de sincronización y otros eventos aparecerán aquí.
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0 transition-colors ${!item.read ? "bg-primary/[0.03]" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm leading-tight ${!item.read ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                    {item.title}
                  </p>
                  {!item.read ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </div>
                <p className={`mt-0.5 text-xs leading-relaxed max-w-prose ${item.read ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                  {item.message}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/50">{item.time_ago}</p>
              </div>
              {!item.read ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 mt-0.5"
                  onClick={() => handleMarkRead(item.id)}
                  disabled={selected === item.id}
                >
                  {selected === item.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
