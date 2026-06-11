import { apiFetch } from "@/lib/api/client"

export interface AuditEvent {
  id: string
  tenant_id: string
  organization_id: string
  organization_name: string | null
  actor_id: string
  actor_name: string | null
  actor_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  summary: string
  details: string | null
  ip_address: string | null
  visibility: string | null
  snapshot_before: Record<string, unknown> | null
  snapshot_after: Record<string, unknown> | null
  request_id: string | null
  metadata: Record<string, string> | null
  created_at: string
}

export interface HistoryResponse {
  total: number
  offset: number
  limit: number
  events: AuditEvent[]
}

export interface HistoryFilters {
  action?: string
  actor_id?: string
  resource_type?: string
  limit?: number
  offset?: number
}

export async function listHistory(filters: HistoryFilters = {}): Promise<HistoryResponse> {
  const params = new URLSearchParams()
  if (filters.action) params.set("action", filters.action)
  if (filters.actor_id) params.set("actor_id", filters.actor_id)
  if (filters.resource_type) params.set("resource_type", filters.resource_type)
  if (filters.limit) params.set("limit", String(filters.limit))
  if (filters.offset) params.set("offset", String(filters.offset))
  const qs = params.toString()
  return apiFetch<HistoryResponse>(`/api/history${qs ? `?${qs}` : ""}`)
}
