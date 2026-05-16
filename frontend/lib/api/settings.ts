import { apiFetch } from "@/lib/api/client";
import type { SettingsPayload, WebhookEndpoint } from "@/lib/types";

export async function getSettings() {
  return apiFetch<SettingsPayload>("/api/settings");
}

export async function saveSettings(payload: Array<Record<string, unknown>>) {
  return apiFetch<{ status: string; updated: number }>("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getWebhooks() {
  return apiFetch<WebhookEndpoint[]>("/api/webhooks");
}

export async function createWebhook(payload: { url: string; description?: string; events: string[] }) {
  return apiFetch<WebhookEndpoint>("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteWebhook(id: string) {
  return apiFetch<{ message: string }>(`/api/webhooks/${id}`, { method: "DELETE" });
}

export async function testWebhook(id: string) {
  return apiFetch<{ status: string; delivery_result: Record<string, unknown> }>(
    `/api/webhooks/${id}/test`,
    { method: "POST" }
  );
}
