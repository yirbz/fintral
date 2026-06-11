import { apiFetch } from "@/lib/api/client";

export interface SyncStatus {
  available: boolean;
  certified: boolean;
  company_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface SyncResult {
  status: string;
  sync: {
    total_fetched: number;
    new: number;
    updated: number;
    errors: string[];
    notifications_created: number;
  };
}

export async function getSyncStatus() {
  return apiFetch<SyncStatus>("/api/alanube/sync-status");
}

export async function syncAlanubeDocuments(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const query = params.toString();
  return apiFetch<SyncResult>(`/api/alanube/sync${query ? `?${query}` : ""}`, {
    method: "POST",
  });
}
