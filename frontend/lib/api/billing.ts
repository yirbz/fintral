import { apiFetch } from "./client";

export interface Client {
  id: string;
  name: string;
  tax_id: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

export interface ClientCreate {
  name: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Product {
  id: string;
  name: string;
  internal_code?: string;
  description?: string;
  price: number;
  tax_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductCreate {
  name: string;
  internal_code?: string;
  description?: string;
  price: number;
  tax_rate: number;
}

export interface EcfSequence {
  id: string;
  ecf_type: number;
  prefix: string;
  start_number: number;
  end_number: number;
  current_number: number;
  expiry_date?: string;
  is_active: boolean;
}

export interface EcfSequenceCreate {
  ecf_type: number;
  prefix: string;
  start_number: number;
  end_number: number;
  current_number: number;
  expiry_date?: string;
}

export interface InvoiceLineItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_rate: number;
}

export interface InvoiceCreate {
  client_id?: string;
  ecf_type?: number;
  payment_type: number; // 1: Contado, 2: Crédito
  payment_method?: number; // 1: Efectivo, 2: Cheque/Transf, 3: Tarjeta, etc.
  items: InvoiceLineItem[];
}

export interface BillingInvoice {
  id: string;
  invoice_number?: string;
  invoice_date?: string;
  total_amount: number;
  tax_amount: number;
  currency: string;
  status: string; // 'draft', 'pending', 'verified', 'rejected'
  payment_condition?: string;
  payment_status?: string;
  raw_extracted_data?: string; // JSON string with Alanube data
  client?: Client;
}

export interface VerificationStatus {
  is_ecf_authorized: boolean;
  certification_status: "none" | "company_registered" | "certificate_uploaded" | "set_test_running" | "set_test_approved" | "certified" | "set_test_rejected";
  certification_step: "0" | "1" | "2" | "3" | "4";
  is_certification_completed: boolean;
  alanube_company_id?: string;
  alanube_environment?: string;
  certificate_uploaded_at?: string;
  tax_id?: string;
  name?: string;
  economic_activity?: string;
  fiscal_address?: string;
}

export interface CertificationError {
  error_code: string;
  user_message: string;
  technical_details?: string;
}

export async function testAlanubeConnection(data: { api_url: string; jwt_token: string }) {
  return apiFetch<{ ok: boolean; company?: unknown; error?: string }>("/api/billing/alanube/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export const billingApi = {
  // Clients
  getClients: () => apiFetch<Client[]>("/api/billing/clients"),
  createClient: (data: ClientCreate) =>
    apiFetch<Client>("/api/billing/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateClient: (id: string, data: Partial<ClientCreate>) =>
    apiFetch<Client>(`/api/billing/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteClient: (id: string) =>
    apiFetch<{ status: string }>(`/api/billing/clients/${id}`, {
      method: "DELETE",
    }),

  // Products
  getProducts: () => apiFetch<Product[]>("/api/billing/products"),
  createProduct: (data: ProductCreate) =>
    apiFetch<Product>("/api/billing/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: Partial<ProductCreate> & { is_active?: boolean }) =>
    apiFetch<Product>(`/api/billing/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    apiFetch<{ status: string }>(`/api/billing/products/${id}`, {
      method: "DELETE",
    }),

  // Sequences
  getSequences: () => apiFetch<EcfSequence[]>("/api/billing/sequences"),
  createSequence: (data: EcfSequenceCreate) =>
    apiFetch<EcfSequence>("/api/billing/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateSequence: (id: string, data: Partial<EcfSequenceCreate> & { is_active?: boolean }) =>
    apiFetch<EcfSequence>(`/api/billing/sequences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteSequence: (id: string) =>
    apiFetch<{ status: string }>(`/api/billing/sequences/${id}`, {
      method: "DELETE",
    }),

  // Invoices
  getInvoices: () => apiFetch<BillingInvoice[]>("/api/billing/invoices"),
  createInvoice: (data: InvoiceCreate) =>
    apiFetch<BillingInvoice>("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getInvoice: (id: string) => apiFetch<BillingInvoice>(`/api/billing/invoices/${id}`),
  transmitInvoice: (id: string) =>
    apiFetch<{ status: string; invoice: BillingInvoice }>(`/api/billing/invoices/${id}/transmit`, {
      method: "POST",
    }),

  // Verification & Settings
  getVerificationStatus: () =>
    apiFetch<VerificationStatus>("/api/billing/verification-status"),
  registerCompany: (formData: FormData) =>
    apiFetch<{ message: string; status: string }>("/api/billing/certification/register", {
      method: "POST",
      body: formData,
    }),
  startSetTest: () =>
    apiFetch<{ message: string; track_id: string; status: string }>("/api/billing/certification/start-set-test", {
      method: "POST",
    }),
  checkSetTestStatus: () =>
    apiFetch<{
      status: "PROCESSING" | "COMPLETED" | "FAILED";
      result?: "APPROVED" | "REJECTED";
      details?: any;
    }>("/api/billing/certification/set-test-status"),
  resetCertification: () =>
    apiFetch<{ message: string; status: string }>("/api/billing/certification/reset", {
      method: "POST",
    }),

  updateProfile: (data: { full_name: string; job_title?: string; phone?: string }) =>
    apiFetch<any>("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateOrganization: (data: {
    name: string;
    tax_id?: string;
    phone?: string;
    email_contact?: string;
    website?: string;
    country?: string;
    fiscal_address?: string;
  }) =>
    apiFetch<any>("/api/settings/organization", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getOrganization: () => apiFetch<any>("/api/settings/organization"),
};
