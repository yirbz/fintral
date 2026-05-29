"use client";

import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getNotifications, readAllNotifications } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getNotifications(true, 8);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    await readAllNotifications();
    setItems([]);
  }

  const hasUnread = useMemo(() => items.some((item) => !item.read), [items]);

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((prev) => !prev)}>
        <Bell className="size-4" />
        {hasUnread ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" /> : null}
      </Button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide">Notificaciones</p>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={clearAll}>
              Limpiar
            </button>
          </div>
          <div className="max-h-72 overflow-auto tight-scrollbar">
            {loading ? (
              <div className="flex flex-col gap-1.5 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 py-1.5">
                    <Skeleton className="h-3.5 w-40 rounded-md" />
                    <Skeleton className="h-3 w-full rounded-md" />
                    <Skeleton className="h-2.5 w-16 rounded-md" />
                  </div>
                ))}
              </div>
            ) : null}
            {!loading && items.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No hay notificaciones nuevas.</div>
            ) : null}
            {items.map((item) => (
              <div className="border-b px-3 py-2 text-xs last:border-b-0" key={item.id}>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="text-muted-foreground">{item.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.time_ago}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
