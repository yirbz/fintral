import { apiFetch } from "@/lib/api/client";
import type { Invoice, BankAccount } from "@/lib/types";

export interface BankSummary {
  total_balance: number;
  total_ar: number;
  total_ap: number;
  capital_neto: number;
  accounts: BankAccount[];
  recent_ar: Invoice[];
  recent_ap: Invoice[];
}

export interface CxpSummary {
  total_outstanding: number;
  total_overdue: number;
  weekly_commitments: number;
  cash_balance: number;
  bank_balances: BankAccount[];
  recent_invoices: Invoice[];
}

export interface CxcSummary {
  total_outstanding: number;
  total_overdue: number;
  weekly_receivables: number;
  recent_invoices: Invoice[];
}

export async function getCxpSummary() {
  return apiFetch<CxpSummary>("/api/cxp/summary");
}

export async function getCxcSummary() {
  return apiFetch<CxcSummary>("/api/cxc/summary");
}

export async function getBankAccounts() {
  return apiFetch<BankAccount[]>("/api/bank-accounts");
}

export async function getBankAccountsSummary() {
  return apiFetch<BankSummary>("/api/bank-accounts/summary");
}

export async function markInvoicePaid(invoiceId: string, paymentDate?: string, bankAccountId?: string) {
  return apiFetch<{ status: string; invoice: Invoice }>(`/api/invoices/${invoiceId}/mark-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payment_date: paymentDate,
      bank_account_id: bankAccountId,
    }),
  });
}

export async function updateBankBalances(balances: Array<{ id?: string; name: string; balance: number }>) {
  return apiFetch<BankAccount[]>("/api/bank-accounts/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: balances }),
  });
}

export interface ReportPreviewData {
  report_type: string;
  report_name: string;
  org_name: string;
  org_tax_id: string;
  generated_at: string;
  headers: string[];
  rows: Array<{
    id: string;
    invoice_number: string;
    entity_name: string;
    tax_id: string;
    invoice_date: string;
    due_date: string;
    days_overdue: number;
    status: string;
    base_amount: number;
    tax_amount: number;
    total_amount: number;
  }>;
  totals: {
    base_amount: number;
    tax_amount: number;
    total_amount: number;
  };
}

export async function getApArPreview(reportType: "ap" | "ar"): Promise<ReportPreviewData> {
  return apiFetch<ReportPreviewData>(`/api/reports/ap-ar/preview?report_type=${reportType}`);
}

export async function exportApAr(reportType: "ap" | "ar", format: "xlsx" | "csv" | "txt"): Promise<Blob> {
  const res = await apiFetch<Response>(
    `/api/reports/ap-ar/export?report_type=${reportType}&format=${format}`,
    { raw: true }
  );
  return res.blob();
}
