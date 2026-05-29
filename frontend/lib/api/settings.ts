import { apiFetch } from "@/lib/api/client";
import type { SettingsPayload, WebhookEndpoint } from "@/lib/types";

export interface OrgMember {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string | null;
}

export interface OrganizationData {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email_contact: string | null;
  website: string | null;
  country: string | null;
  fiscal_address: string | null;
  created_at: string | null;
  updated_at: string | null;
  member_count: number;
  members: OrgMember[];
  role: string;
}

export async function getSettings() {
  return apiFetch<SettingsPayload>("/api/settings");
}

export async function saveSettings(payload: Array<Record<string, unknown>>) {
  return apiFetch<{ status: string; updated: number }>("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getWebhooks() {
  return apiFetch<WebhookEndpoint[]>("/api/webhooks");
}

export async function createWebhook(payload: {
  url: string;
  description?: string;
  events: string[];
}) {
  return apiFetch<WebhookEndpoint>("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(id: string) {
  return apiFetch<{ message: string }>(`/api/webhooks/${id}`, {
    method: "DELETE",
  });
}

export async function testWebhook(id: string) {
  return apiFetch<{ status: string; delivery_result: Record<string, unknown> }>(
    `/api/webhooks/${id}/test`,
    { method: "POST" }
  );
}

export async function updateProfile(data: {
  full_name: string;
  job_title: string;
  phone: string;
}) {
  return apiFetch<{
    id: string;
    email: string;
    full_name: string;
    job_title: string | null;
    phone: string | null;
    avatar_url: string | null;
    created_at: string | null;
  }>("/api/settings/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ avatar_url: string }>("/api/settings/avatar", {
    method: "POST",
    body: form,
  });
}

export async function deleteAvatar() {
  return apiFetch<{ message: string }>("/api/settings/avatar", {
    method: "DELETE",
  });
}

export async function getOrganization() {
  return apiFetch<OrganizationData>("/api/settings/organization");
}

export async function updateOrganization(data: {
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email_contact?: string | null;
  website?: string | null;
  country?: string | null;
  fiscal_address?: string | null;
}) {
  return apiFetch<{
    id: string;
    name: string;
    tax_id: string | null;
    phone: string | null;
    email_contact: string | null;
    website: string | null;
    country: string | null;
    fiscal_address: string | null;
  }>("/api/settings/organization", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
