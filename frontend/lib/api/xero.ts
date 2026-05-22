import { apiFetch } from "@/lib/api/client"

export interface XeroConnection {
  id: string
  provider: string
  name: string
  is_active: boolean
  last_sync_at: string | null
  last_error: string | null
  created_at: string | null
}

export interface XeroTestResult {
  ok: boolean
  error?: string
  company_name?: string
  country?: string
}

export interface XeroPushResult {
  total: number
  success: number
  failed: number
  results: Array<{
    invoice_id: string
    invoice_number: string | null
    success: boolean
    error?: string
    xero_invoice_id?: string
  }>
}

export interface AuthUrlResponse {
  url: string
}

export async function getXeroAuthUrl() {
  return apiFetch<AuthUrlResponse>("/api/integrations/xero/auth-url")
}

export async function listXeroConnections() {
  return apiFetch<XeroConnection[]>("/api/integrations/xero/connections")
}

export async function deleteXeroConnection(id: string) {
  return apiFetch<{ status: string }>(`/api/integrations/xero/connections/${id}`, {
    method: "DELETE",
  })
}

export async function testXeroConnection(id: string) {
  return apiFetch<XeroTestResult>(`/api/integrations/xero/test/${id}`, {
    method: "POST",
  })
}

export async function pushToXero(connectionId: string, invoiceIds: string[]) {
  return apiFetch<XeroPushResult>("/api/integrations/xero/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: connectionId, invoice_ids: invoiceIds }),
  })
}
