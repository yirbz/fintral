"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { getNotifications, readAllNotifications } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications(true, 8);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function clearAll() {
    await readAllNotifications();
    setItems([]);
  }

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((prev) => !prev)} className="relative">
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide">Notificaciones</p>
            <div className="flex items-center gap-2">
              {items.length > 0 ? (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={clearAll}>
                  Limpiar todo
                </button>
              ) : null}
              <Link
                href="/dashboard/notifications"
                className="text-xs text-primary hover:text-primary/80"
                onClick={() => setOpen(false)}
              >
                Ver todas
              </Link>
            </div>
          </div>
          <div className="max-h-80 overflow-auto tight-scrollbar">
            {loading && items.length === 0 ? (
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
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Bell className="mx-auto mb-2 size-5 text-muted-foreground/40" />
                No hay notificaciones nuevas.
              </div>
            ) : null}
            {items.map((item) => (
              <div
                className={`border-b px-3 py-2.5 text-xs last:border-b-0 transition-colors ${!item.read ? "bg-primary/5" : ""}`}
                key={item.id}
              >
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 text-muted-foreground leading-relaxed">{item.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/60">{item.time_ago}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
