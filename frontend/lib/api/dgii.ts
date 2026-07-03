/**
 * API client para exportaciones DGII (606, 607, 608).
 * Pensado para el flujo del contador: filtros ricos, preview antes de descargar.
 */
import { apiFetch } from "@/lib/api/client";

export type DgiiFormat = "dgii_606" | "dgii_607" | "dgii_608";

export interface DgiiExportFilters {
  format: DgiiFormat;
  // Período rápido (YYYYMM) — alternativa a date_from/date_to
  period?: string;
  // Rango de fechas explícito
  date_from?: string;  // YYYY-MM-DD
  date_to?: string;    // YYYY-MM-DD
  // Filtros adicionales
  categories?: string[];
  goods_types?: string[];     // ["01", "07", ...]
  vendor_search?: string;
  source_types?: string[];    // ["xml", "pdf_text", "image_ai", ...]
  // Opciones
  processed_only?: boolean;
  include_no_ncf?: boolean;
  // Override explícito
  invoice_ids?: string[];
  exclude_ids?: string[];
  // Auto-fixes: "deduplicate" | "recalculate_itbis" | "assign_goods_type"
  auto_fixes?: string[];
  // Excluir facturas ya reportadas en submissions previas
  exclude_reported?: boolean;
  // Formato de salida: "dgii_txt" (oficial para subir a DGII), "xls" (plantilla .xlsx), o "csv" (rápido).
  output_format?: "dgii_txt" | "xls" | "csv";
}

export interface DgiiDuplicateInfo {
  ncf: string;
  count: number;
  invoices: { id: string; vendor_name: string; total_amount: number | null }[];
}

export interface DgiiPreviewResult {
  format: DgiiFormat;
  total_invoices: number;
  total_visible_invoices?: number;
  reportable_invoices?: number;
  blocked_confirmed_ncf?: number;
  complete: number;
  issues: number;
  can_export: boolean;
  has_duplicates: boolean;
  has_itbis_errors: boolean;
  missing_ncf: number;
  missing_rnc: number;
  missing_goods_type: number;
  invalid_ncf: number;
  invalid_rnc: number;
  zero_amount: number;
  missing_payment_method: number;
  invalid_payment_method: number;
  missing_report_rnc: number;
  invalid_report_rnc: number;
  invalid_period: number;
  record_limit_exceeded: number;
  report_errors: string[];
  duplicates: DgiiDuplicateInfo[];
  total_errors: number;
  total_warnings: number;
  total_amount: number;
  total_tax: number;
  filters_applied: {
    date_from: string | null;
    date_to: string | null;
    categories: string[] | null;
    goods_types: string[] | null;
    vendor_search: string | null;
  };
  fixes_applied?: {
    duplicates_removed?: number;
    itbis_fixed?: number;
    goods_type_fixed?: number;
  };
  preview_invoices: DgiiPreviewInvoice[];
}

export interface DgiiRawFields {
  ncf_modified?: string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  itbis_retenido?: number | null;
  itbis_proporcionalidad?: number | null;
  itbis_llevado_costo?: number | null;
  itbis_percibido?: number | null;
  isr_retention_type?: string | null;
  isr_retention_amount?: number | null;
  isr_percibido?: number | null;
  isc_amount?: number | null;
  other_taxes?: number | null;
  legal_tip?: number | null;
  cancellation_type?: string | null;
  tipo_ingreso?: string | null;
  retencion_renta_terceros?: number | null;
}

export interface DgiiPreviewInvoice {
  id: string;
  vendor_name: string;
  vendor_tax_id: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  goods_services_type: string;
  category: string;
  source_type: string;
  validation_status: "ok" | "warning" | "error";
  validation_errors: string[];
  validation_warnings: string[];
  macro_status: string;
  reporting_state?: "reportable" | "blocked_confirmed_ncf";
  reporting_note?: string | null;
  dgii_fields: DgiiRawFields;
  file_path?: string;
  file_url?: string | null;
  dgii_validation_status?: string | null;
  dgii_security_code?: string | null;
}

export interface DgiiSummary {
  report: string;
  period: string | null;
  total: number;
  complete: number;
  issues: number;
  missing_ncf: number;
  missing_rnc: number;
  missing_goods_type: number;
  total_amount: number;
  total_tax: number;
}

/**
 * Previsualiza cuántas facturas se exportarán con los filtros dados.
 * No descarga nada — solo devuelve el conteo y un sample de 20 facturas.
 */
export async function previewDgiiExport(
  filters: DgiiExportFilters
): Promise<DgiiPreviewResult> {
  return apiFetch<DgiiPreviewResult>("/api/dgii/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });
}

/**
 * Genera y descarga el archivo de exportación DGII.
 * Devuelve un Blob listo para crear un link de descarga.
 */
export async function downloadDgiiExport(
  filters: DgiiExportFilters
): Promise<{ blob: Blob; filename: string }> {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("access_token") ||
        localStorage.getItem("access_token")
      : null;

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("fintral_active_org")
      : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch("/api/dgii/export", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(filters),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Error al generar la exportación");
  }

  const blob = await res.blob();
  // Extraer nombre de archivo del header si existe
  const cd = res.headers.get("content-disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `DGII_${filters.format}_export`;
  return { blob, filename };
}

// ── Submission tracking types ──────────────────────────────────────────────

export interface DgiiSubmission {
  id: string;
  format: string;          // "606" | "607" | "608"
  period: string;          // "202605"
  invoice_ids: string[];
  invoice_count: number;
  status: string;          // "pending_upload" | "pending_confirm" | "confirmed" | "partial_error"
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DgiiSubmissionDetail extends DgiiSubmission {
  report_columns?: Array<{ key: string; label: string }>;
  invoices: DgiiSubmissionInvoice[];
}

export interface DgiiSubmissionInvoice {
  id: string;
  status: string;
  error_detail: string | null;
  notes: string | null;
  report_snapshot?: Record<string, string | number | null>;
}

export interface DgiiPendingSummary {
  total_pending: number;
  by_format: Record<string, number>;
  past_due_count: number;
  next_deadline: string;
  deadlines: Record<string, string>;
}

export interface DgiiPendingInvoice {
  id: string;
  vendor_name: string;
  vendor_tax_id: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  category: string;
  goods_services_type: string;
}

export interface CreateDgiiSubmissionPayload {
  format: string;
  period: string;
  invoice_ids: string[];
  notes?: string;
  status?: string;  // "pending_confirm" | "pending_upload"
}

// ── Submission tracking API functions ───────────────────────────────────────

export async function listDgiiSubmissions(
  format?: string,
  period?: string,
  limit: number = 50
): Promise<{ submissions: DgiiSubmission[]; total: number }> {
  const params = new URLSearchParams();
  if (format) params.set("format", format);
  if (period) params.set("period", period);
  if (limit) params.set("limit", String(limit));
  return apiFetch(`/api/dgii/submissions?${params}`);
}

export async function createDgiiSubmission(
  data: CreateDgiiSubmissionPayload
): Promise<DgiiSubmission> {
  return apiFetch<DgiiSubmission>("/api/dgii/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteDgiiSubmission(
  submissionId: string
): Promise<{ status: string; id: string }> {
  return apiFetch(`/api/dgii/submissions/${submissionId}`, {
    method: "DELETE",
  });
}

export async function getDgiiPendingSummary(): Promise<DgiiPendingSummary> {
  return apiFetch<DgiiPendingSummary>("/api/dgii/pending-summary");
}

export async function getDgiiPendingInvoices(
  format: string,
  period?: string
): Promise<{
  format: string;
  period: string;
  total_pending: number;
  invoices: DgiiPendingInvoice[];
}> {
  const params = new URLSearchParams({ format });
  if (period) params.set("period", period);
  return apiFetch(`/api/dgii/pending-invoices?${params}`);
}

// ── Existing functions ──────────────────────────────────────────────────────

// ── Auto-generate ────────────────────────────────────────────────────────────

export interface DgiiAutoGenerateResult {
  status: "success" | "empty";
  format: string;
  period: string;
  summary: {
    total_pending: number;
    new_this_period: number;
    from_previous_periods: number;
    from_errors: number;
    fixes_applied: Record<string, number>;
    complete: number;
    issues: number;
    total_invoices: number;
    message: string;
  };
  invoices?: DgiiPreviewInvoice[];
}

export async function autoGenerateDgiiReport(
  format: string,
  period?: string
): Promise<DgiiAutoGenerateResult> {
  const params = new URLSearchParams({ format });
  if (period) params.set("period", period);
  return apiFetch<DgiiAutoGenerateResult>("/api/dgii/auto-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, period }),
  });
}

export async function getDgiiSummary(
  report: "606" | "607" | "608",
  period?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<DgiiSummary> {
  const params = new URLSearchParams({ report });
  if (period) params.set("period", period);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  return apiFetch<DgiiSummary>(`/api/dgii/summary?${params}`);
}

/**
 * Lista de categorías disponibles para usar en los filtros de exportación.
 */
export async function getDgiiCategories(): Promise<string[]> {
  const res = await apiFetch<{ categories: string[] }>("/api/dgii/categories");
  return res.categories;
}

/** Trigger descarga del Blob en el browser. */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Actualiza campos DGII de una factura individual.
 * Acepta campos de columna (vendor_tax_id, total_amount) y campos
 * fiscales de raw_extracted_data (payment_method, itbis_retenido, etc.)
 */
export async function updateDgiiFields(
  invoiceId: string,
  fields: Record<string, unknown>
): Promise<{ status: string; invoice: DgiiPreviewInvoice }> {
  return apiFetch(`/api/dgii/invoice/${invoiceId}/dgii-fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
}

/**
 * Actualización masiva de un campo DGII para múltiples facturas.
 * Ej: aplicar forma de pago "01" a todas las facturas seleccionadas.
 */
export async function bulkUpdateDgiiField(
  invoiceIds: string[],
  field: string,
  value: unknown
): Promise<{ status: string; updated: number }> {
  return apiFetch("/api/dgii/invoices/dgii-bulk-fields", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: invoiceIds, field, value }),
  });
}

// ── New submission management API functions ──────────────────────────────────

export interface ReportResultsItem {
  invoice_id: string;
  status: string;
  error_detail?: string;
}

export async function getDgiiSubmissionDetail(
  submissionId: string
): Promise<DgiiSubmissionDetail> {
  return apiFetch<DgiiSubmissionDetail>(`/api/dgii/submissions/${submissionId}`);
}

export async function confirmDgiiSubmission(
  submissionId: string
): Promise<DgiiSubmission> {
  return apiFetch<DgiiSubmission>(`/api/dgii/submissions/${submissionId}/confirm`, {
    method: "POST",
  });
}

export async function markUploadedDgiiSubmission(
  submissionId: string
): Promise<DgiiSubmission> {
  return apiFetch<DgiiSubmission>(`/api/dgii/submissions/${submissionId}/mark-uploaded`, {
    method: "POST",
  });
}

export async function reportDgiiSubmissionResults(
  submissionId: string,
  results: ReportResultsItem[]
): Promise<DgiiSubmission> {
  return apiFetch<DgiiSubmission>(`/api/dgii/submissions/${submissionId}/report-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
}

export async function overrideInvoiceDgiiStatus(
  invoiceId: string,
  status: string,
  errorDetail?: string,
  notes?: string
): Promise<{ status: string }> {
  return apiFetch(`/api/dgii/invoices/${invoiceId}/dgii-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error_detail: errorDetail, notes }),
  });
}

export async function validateInvoiceDgii(
  invoiceId: string
): Promise<{ invoice_id: string; validation: any }> {
  return apiFetch<{ invoice_id: string; validation: any }>(`/api/dgii/validation/invoice/${invoiceId}`, {
    method: "POST",
  });
}

export interface DgiiConciliateInvoice {
  id: string;
  vendor_name: string;
  invoice_number: string;
  total_amount: number | null;
  fiscal_status: string;
  problems: { code: string; message: string; severity: "error" | "warning" }[];
  suggested_actions: string[];
  editable_fields: Record<string, { current: any; suggestion: any }>;
  [key: string]: any;
}

export interface DgiiConciliateResult {
  format: string;
  period: string;
  can_export: boolean;
  summary: {
    total_ready: number;
    total_conflicts: number;
    total_deferred_in: number;
    total_amount_ready: number;
    total_itbis_ready: number;
    deadline: string;
    days_remaining: number;
  };
  conflicts: DgiiConciliateInvoice[];
  ready: DgiiConciliateInvoice[];
  deferred_in: {
    id: string;
    vendor_name: string;
    invoice_number: string;
    total_amount: number | null;
    fiscal_period_override: string | null;
  }[];
}

export async function dgiiConciliate(body: {
  format: string;
  period?: string;
}): Promise<DgiiConciliateResult> {
  return apiFetch("/api/dgii/conciliate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function dgiiConciliateFix(
  invoiceId: string,
  body: { fields: Record<string, string> }
): Promise<{ status: string; invoice_id: string; fiscal_status: string; reasons: string[] }> {
  return apiFetch(`/api/dgii/conciliate/${invoiceId}/fix`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function dgiiConciliateDefer(
  invoiceId: string,
  body: { target_period: string }
): Promise<{ status: string; invoice_id: string; fiscal_status: string; target_period: string }> {
  return apiFetch(`/api/dgii/conciliate/${invoiceId}/defer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function dgiiConciliateExclude(
  invoiceId: string,
  body: { reason: string }
): Promise<{ status: string; invoice_id: string; fiscal_status: string; exclusion_reason: string }> {
  return apiFetch(`/api/dgii/conciliate/${invoiceId}/exclude`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function dgiiVerifyNcf(body: {
  invoice_ids: string[];
}): Promise<{
  results: any[];
  total: number;
  found: number;
  not_found: number;
}> {
  return apiFetch("/api/dgii/verify-ncf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
