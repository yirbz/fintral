import { apiFetch } from "@/lib/api/client"

export interface OdooConnection {
  id: string
  provider: string
  name: string
  is_active: boolean
  last_sync_at: string | null
  last_error: string | null
  created_at: string | null
}

export interface OdooTestResult {
  ok: boolean
  error?: string
  server_version?: string
  server_series?: string
  uid?: number
}

export interface OdooPushResult {
  total: number
  success: number
  failed: number
  results: Array<{
    invoice_id: string
    invoice_number: string | null
    success: boolean
    error?: string
    odoo_move_id?: number
  }>
}

export async function listConnections() {
  return apiFetch<OdooConnection[]>("/api/integrations/odoo/connections")
}

export async function createConnection(data: {
  name: string
  url: string
  database: string
  username?: string
  api_key: string
}) {
  return apiFetch<OdooConnection>("/api/integrations/odoo/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export async function deleteConnection(id: string) {
  return apiFetch<{ status: string }>(`/api/integrations/odoo/connections/${id}`, {
    method: "DELETE",
  })
}

export async function testConnection(data: {
  url: string
  database: string
  username?: string
  api_key: string
}) {
  return apiFetch<OdooTestResult>("/api/integrations/odoo/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export async function testSavedConnection(id: string) {
  return apiFetch<OdooTestResult>(`/api/integrations/odoo/test/${id}`, {
    method: "POST",
  })
}

export async function pushToOdoo(connectionId: string, invoiceIds: string[]) {
  return apiFetch<OdooPushResult>("/api/integrations/odoo/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: connectionId, invoice_ids: invoiceIds }),
  })
}
