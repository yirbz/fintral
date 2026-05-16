import { apiFetch } from "@/lib/api/client";

export interface ReferenceDataItem {
  id: string;
  domain: string;
  code: string;
  label_es: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

export interface ReferenceDataResponse {
  items: ReferenceDataItem[];
  total: number;
}

export async function listReferenceData(domain?: string, includeInactive = false) {
  const params = new URLSearchParams();
  if (domain) params.set("domain", domain);
  if (includeInactive) params.set("include_inactive", "true");
  const query = params.toString();
  return apiFetch<ReferenceDataResponse>(`/api/admin/reference-data${query ? `?${query}` : ""}`);
}

export async function getDomains() {
  return apiFetch<{ domains: string[] }>("/api/admin/reference-data/domains");
}

export async function createReferenceData(data: Partial<ReferenceDataItem> & { domain: string; code: string; label_es: string }) {
  return apiFetch<ReferenceDataItem>("/api/admin/reference-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateReferenceData(id: string, data: Partial<ReferenceDataItem>) {
  return apiFetch<ReferenceDataItem>(`/api/admin/reference-data/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteReferenceData(id: string) {
  return apiFetch<{ message: string }>(`/api/admin/reference-data/${id}`, {
    method: "DELETE",
  });
}

export async function getPublicReferenceData(domain: string) {
  return apiFetch<{ domain: string; items: ReferenceDataItem[] }>(`/api/admin/reference-data/public/${domain}`);
}
