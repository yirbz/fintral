/**
 * API client para validación DGII en tiempo real (ConsultaTimbreFC).
 */
import { apiFetch } from "@/lib/api/client";

export interface DgiiValidationResult {
  status: "accepted" | "rejected" | "voided" | "registered" | "pending" | "not_found" | "error";
  estado_dgii: string | null;
  razon_social: string | null;
  rnc_emisor: string | null;
  encf: string | null;
  qr_data: Record<string, unknown> | null;
  error: string | null;
  validated_at: string;
  description: string;
}

export interface QrScanResult {
  success: boolean;
  message: string;
  qr_count: number;
  results: Array<{
    qr_text: string;
    validation: DgiiValidationResult | { status: string; error: string };
  }>;
}

export interface InvoiceValidationResponse {
  invoice_id: string;
  validation: DgiiValidationResult;
}

export interface InvoiceValidationStatusResponse {
  invoice_id: string;
  invoice_number: string | null;
  dgii_validation_status: string;
  dgii_validation_date: string | null;
  dgii_security_code: string | null;
  detail: Record<string, string> | null;
}

export async function validateQr(qrUrl: string): Promise<DgiiValidationResult> {
  return apiFetch("/api/dgii/validation/qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_url: qrUrl }),
  });
}

export async function validateEcf(
  rncEmisor: string,
  encf: string,
  montoTotal: number,
  codigoSeguridad: string,
): Promise<DgiiValidationResult> {
  return apiFetch("/api/dgii/validation/ecf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rnc_emisor: rncEmisor, encf, monto_total: montoTotal, codigo_seguridad: codigoSeguridad }),
  });
}

export async function scanQrFromImage(file: File): Promise<QrScanResult> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/dgii/validation/scan", {
    method: "POST",
    body: formData,
  });
}

export async function validateInvoice(invoiceId: string): Promise<InvoiceValidationResponse> {
  return apiFetch(`/api/dgii/validation/invoice/${invoiceId}`, {
    method: "POST",
  });
}

export async function getValidationStatus(invoiceId: string): Promise<InvoiceValidationStatusResponse> {
  return apiFetch(`/api/dgii/validation/${invoiceId}`);
}
