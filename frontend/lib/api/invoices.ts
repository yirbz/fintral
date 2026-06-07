import { apiFetch } from "@/lib/api/client";
import type { Invoice } from "@/lib/types";

export interface InvoiceFilters {
  transaction_type?: string;
  processed?: string;
  search?: string;
  quality?: string;
  date_from?: string;
  date_to?: string;
  vendor_search?: string;
  category?: string;
  payment_status?: string;
  payment_condition?: string;
  status?: string;
  include_drafts?: boolean;
}

export async function listInvoices(filters: InvoiceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.transaction_type) params.set("transaction_type", filters.transaction_type);
  if (filters.processed) params.set("processed", filters.processed);
  if (filters.search) params.set("search", filters.search);
  if (filters.quality) params.set("quality", filters.quality);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.vendor_search) params.set("vendor_search", filters.vendor_search);
  if (filters.category) params.set("category", filters.category);
  if (filters.payment_status) params.set("payment_status", filters.payment_status);
  if (filters.payment_condition) params.set("payment_condition", filters.payment_condition);
  if (filters.status) params.set("status", filters.status);
  if (filters.include_drafts !== undefined) params.set("include_drafts", String(filters.include_drafts));
  const query = params.toString();
  return apiFetch<{ invoices: Invoice[]; total: number }>(`/invoices${query ? `?${query}` : ""}`);
}

export async function getInvoice(invoiceId: string) {
  return apiFetch<Invoice>(`/invoices/${invoiceId}`);
}

export async function getInvoiceRaw(invoiceId: string) {
  return apiFetch<{ invoice: Invoice; status: string }>(`/invoice/${invoiceId}`);
}

export interface DuplicateNcfInfo {
  invoice_id: string;
  invoice_number: string;
  vendor_name?: string;
  invoice_date?: string;
  total_amount?: number;
}

export async function processInvoice(invoiceId: string) {
  return apiFetch<{
    message: string;
    status?: string;
    error?: string;
    invoice: Invoice;
    extracted_data?: Record<string, unknown>;
    duplicate_ncf?: DuplicateNcfInfo;
  }>(`/process/${invoiceId}`, { method: "POST" });
}

export async function updateInvoice(invoiceId: string, payload: Partial<Invoice>) {
  return apiFetch<Invoice>(`/invoices/${invoiceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteInvoice(invoiceId: string) {
  return apiFetch<{ message: string }>(`/invoices/${invoiceId}`, { method: "DELETE" });
}

export async function bulkProcess(invoiceIds: string[]) {
  return apiFetch<{ message: string; success_count: number; errors: string[] }>(
    "/api/invoices/bulk-process",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_ids: invoiceIds })
    }
  );
}

export async function bulkDelete(invoiceIds: string[]) {
  return apiFetch<{ message: string; count: number }>("/api/invoices/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds })
  });
}

export async function cancelInvoice(invoiceId: string, cancellationType = "01") {
  return apiFetch<{ message: string; invoice: Invoice }>(`/invoices/${invoiceId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cancellation_type: cancellationType })
  });
}

export async function uncancelInvoice(invoiceId: string) {
  return apiFetch<{ message: string; invoice: Invoice }>(`/invoices/${invoiceId}/uncancel`, {
    method: "POST"
  });
}

export async function bulkCancel(invoiceIds: string[]) {
  return apiFetch<{ message: string; count: number }>("/api/invoices/bulk-cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds })
  });
}

export async function pushWebhook(invoiceIds: string[]) {
  return apiFetch<{ status: string }>("/api/invoices/push-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds })
  });
}

export interface CreateInvoicePayload {
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  tax_amount?: number;
  currency: string;
  transaction_type: string;
  category?: string;
  description?: string;
  vendor_tax_id?: string;
  vendor_country?: string;  // ISO 3166-1 alpha-3
  vendor_fiscal_address?: string;
  goods_services_type?: string;
  payment_method?: string;  // Código DGII 01-10
  payment_condition?: string;
  due_date?: string;
  ncf_modified?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export async function createInvoice(payload: CreateInvoicePayload) {
  return apiFetch<Invoice>("/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function uploadInvoices(
  files: File[],
  category?: string,
  transactionType?: string
) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  if (category) formData.append("category", category);
  if (transactionType) formData.append("transaction_type", transactionType);
  return apiFetch<{
    results: Array<{
      filename: string;
      success: boolean;
      invoice_id?: string;
      error?: string;
      message?: string;
    }>;
  }>("/upload", {
    method: "POST",
    body: formData
  });
}

export async function getOptimizedImage(invoiceId: string) {
  return apiFetch<{ optimized_image: string }>(`/invoice/${invoiceId}/optimized-image`);
}

export function exportUrl(format: string, invoiceIds: string[]) {
  const params = new URLSearchParams({
    format,
    invoice_ids: invoiceIds.join(",")
  });
  return `/export/csv?${params.toString()}`;
}

export async function exportInvoices(
  format: string,
  invoiceIds: string[],
  filters?: { date_from?: string; date_to?: string; vendor_search?: string; category?: string }
): Promise<Blob> {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("access_token") ||
        localStorage.getItem("access_token")
      : null;

  const body: Record<string, unknown> = { format, invoice_ids: invoiceIds };
  if (filters) {
    if (filters.date_from) body.date_from = filters.date_from;
    if (filters.date_to) body.date_to = filters.date_to;
    if (filters.vendor_search) body.vendor_search = filters.vendor_search;
    if (filters.category) body.category = filters.category;
  }

  const res = await fetch("/api/invoices/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Error al exportar");
  }

  return res.blob();
}

/* ── Hard Delete (drafts only) ─────────────── */

export async function hardDeleteInvoice(invoiceId: string) {
  return apiFetch<{ message: string }>(`/invoices/${invoiceId}/hard-delete`, {
    method: "DELETE",
  });
}

export async function bulkHardDelete(invoiceIds: string[]) {
  return apiFetch<{ message: string; count: number }>("/api/invoices/bulk-hard-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds }),
  });
}

/* ── Trash / Soft Delete ───────────────────── */

export async function listTrashedInvoices(skip = 0, limit = 100) {
  return apiFetch<{ invoices: Invoice[]; total: number }>(
    `/invoices/trash?skip=${skip}&limit=${limit}`
  );
}

export async function trashInvoice(invoiceId: string) {
  return apiFetch<{ message: string }>(`/invoices/${invoiceId}`, { method: "DELETE" });
}

export async function restoreInvoice(invoiceId: string) {
  return apiFetch<{ message: string; invoice: Invoice }>(`/invoices/${invoiceId}/restore`, {
    method: "POST"
  });
}

export async function permanentDeleteInvoice(invoiceId: string) {
  return apiFetch<{ message: string }>(`/invoices/${invoiceId}/permanent`, {
    method: "DELETE"
  });
}

export async function bulkRestore(invoiceIds: string[]) {
  return apiFetch<{ message: string; count: number }>("/api/invoices/bulk-restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds })
  });
}

export async function bulkPermanentDelete(invoiceIds: string[]) {
  return apiFetch<{ message: string; count: number }>("/api/invoices/bulk-permanent-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds })
  });
}

export async function getPendingInvoiceCount() {
  return apiFetch<{ count: number }>("/invoices/pending-count");
}

/* ── Pending Uploads ─────────────────────────── */

export interface PendingUpload {
  id: string;
  tenant_id: string;
  organization_id: string;
  user_id: string;
  filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  processed: boolean;
  created_at: string;
  expires_at: string;
  upload_link_id?: string | null;
  file_url?: string | null;
}

export async function createPendingUpload(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<{ pending_upload: PendingUpload }>("/pending-uploads", {
    method: "POST",
    body: formData,
  });
}

export async function listPendingUploads(skip = 0, limit = 50) {
  return apiFetch<{ pending_uploads: PendingUpload[]; total: number }>(
    `/pending-uploads?skip=${skip}&limit=${limit}`
  );
}

export async function getPendingUploadCount() {
  return apiFetch<{ count: number }>("/pending-uploads/count");
}

export async function processPendingUpload(pendingId: string) {
  return apiFetch<{
    message: string;
    invoice: import("@/lib/types").Invoice;
    extracted_data?: Record<string, unknown>;
  }>(`/pending-uploads/${pendingId}/process`, { method: "POST" });
}

export async function bulkProcessPendingUploads() {
  return apiFetch<{ message: string; success_count: number; errors: string[] }>(
    "/pending-uploads/bulk-process",
    { method: "POST" }
  );
}

export async function deletePendingUpload(pendingId: string) {
  return apiFetch<{ message: string }>(`/pending-uploads/${pendingId}`, {
    method: "DELETE",
  });
}

export async function verifyInvoice(invoiceId: string) {
  return apiFetch<{ message: string; invoice: Invoice }>(`/invoices/${invoiceId}/verify`, {
    method: "POST",
  });
}

/* ── Upload Links ─────────────────────────── */

export interface UploadLink {
  id: string;
  tenant_id: string;
  organization_id: string;
  created_by_user_id: string | null;
  client_email: string;
  token: string;
  max_files: number;
  uploaded_count: number;
  is_active: boolean;
  created_at: string;
  expires_at: string;
}

export async function listUploadLinks() {
  return apiFetch<{ upload_links: UploadLink[] }>("/pending-uploads/links");
}

export async function createUploadLink(payload: {
  client_email: string;
  max_files: number;
  expires_in_hours: number;
}) {
  return apiFetch<{ upload_link: UploadLink; url: string }>("/pending-uploads/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteUploadLink(linkId: string) {
  return apiFetch<{ message: string }>(`/pending-uploads/links/${linkId}`, {
    method: "DELETE",
  });
}

export interface PublicLinkInfo {
  organization_name: string;
  max_files: number;
  uploaded_count: number;
  expires_at: string;
  pending_uploads?: PendingUpload[];
}

export async function getPublicLinkInfo(token: string) {
  return apiFetch<PublicLinkInfo>(`/pending-uploads/public/${token}`);
}

export async function createPublicPendingUpload(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<{ pending_upload: PendingUpload }>(`/pending-uploads/public/${token}/upload`, {
    method: "POST",
    body: formData,
  });
}
export async function deletePublicPendingUpload(token: string, pendingId: string) {
  return apiFetch<{ message: string }>(`/pending-uploads/public/${token}/${pendingId}`, {
    method: "DELETE",
  });
}

export async function processPublicPendingUploads(token: string) {
  return apiFetch<{ message: string; success_count: number; errors: string[] }>(
    `/pending-uploads/public/${token}/process`,
    {
      method: "POST",
    }
  );
}

export async function getLinkInvoices(linkId: string) {
  return apiFetch<{ invoices: Invoice[] }>(`/pending-uploads/links/${linkId}/invoices`);
}
