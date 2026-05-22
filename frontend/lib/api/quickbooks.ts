import { apiFetch } from "@/lib/api/client"

export interface QuickBooksConnection {
  id: string
  provider: string
  name: string
  is_active: boolean
  last_sync_at: string | null
  last_error: string | null
  created_at: string | null
}

export interface QuickBooksTestResult {
  ok: boolean
  error?: string
  company_name?: string
  country?: string
}

export interface QuickBooksPushResult {
  total: number
  success: number
  failed: number
  results: Array<{
    invoice_id: string
    invoice_number: string | null
    success: boolean
    error?: string
    quickbooks_bill_id?: string
  }>
}

export interface AuthUrlResponse {
  url: string
}

export async function getQuickBooksAuthUrl(state?: string) {
  const params = state ? `?state=${encodeURIComponent(state)}` : ""
  return apiFetch<AuthUrlResponse>(`/api/integrations/quickbooks/auth-url${params}`)
}

export async function listQuickBooksConnections() {
  return apiFetch<QuickBooksConnection[]>("/api/integrations/quickbooks/connections")
}

export async function deleteQuickBooksConnection(id: string) {
  return apiFetch<{ status: string }>(`/api/integrations/quickbooks/connections/${id}`, {
    method: "DELETE",
  })
}

export async function testQuickBooksConnection(id: string) {
  return apiFetch<QuickBooksTestResult>(`/api/integrations/quickbooks/test/${id}`, {
    method: "POST",
  })
}

export async function refreshQuickBooksToken(id: string) {
  return apiFetch<{ status: string }>(`/api/integrations/quickbooks/refresh/${id}`, {
    method: "POST",
  })
}

export async function pushToQuickBooks(connectionId: string, invoiceIds: string[]) {
  return apiFetch<QuickBooksPushResult>("/api/integrations/quickbooks/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: connectionId, invoice_ids: invoiceIds }),
  })
}
