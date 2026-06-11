import { apiFetch } from "@/lib/api/client";
import type { NotificationItem } from "@/lib/types";

export async function getNotifications(unreadOnly = false, limit = 20) {
  return apiFetch<NotificationItem[]>(
    `/api/notifications?unread_only=${unreadOnly ? "true" : "false"}&limit=${limit}`
  );
}

export async function readNotification(id: string) {
  return apiFetch<{ status: string }>(`/api/notifications/${id}/read`, { method: "POST" });
}

export async function readAllNotifications() {
  return apiFetch<{ status: string }>("/api/notifications/read-all", { method: "POST" });
}
