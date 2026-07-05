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

export interface BulkImportRowError {
  row: number;
  internal_code?: string;
  reason: string;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface BulkProductImportResponse {
  total: number;
  imported: number;
  skipped: number;
  errors: BulkImportRowError[];
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

export interface SequenceAlert {
  sequence_id: string;
  ecf_type: number;
  prefix: string;
  start_number: number;
  end_number: number;
  current_number: number;
  expiry_date?: string;
  consumed_pct: number;
  remaining: number;
  alerts: ("critical" | "expiring" | "exhausted" | "expired")[];
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
  product_id?: string;
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
  mode?: "quick" | "detailed";
  notes?: string;
  reference_ecf?: string;
  reference_date?: string;
  buyer_name?: string;
  buyer_rnc?: string;
  buyer_address?: string;
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
  original_xml_data?: string;  // Raw e-CF XML content
  ecf_type?: string;
  file_type?: string;
  file_url?: string;
  processed_url?: string;
  is_electronic?: boolean;
  rnc_comprador?: string;
  line_items?: {
    line: number;
    name: string;
    quantity: number;
    unit_price: number;
    discount_rate: number;
    tax_rate: number;
    total: number;
  }[];
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

// ── Invoice Types (available ECF types for emission) ──

export interface InvoiceTypeInfo {
  code: string;
  ecf_type: number;
  label: string;
  description: string;
  is_available: boolean;
  has_active_sequence: boolean;
  sequence_id?: string;
  sequence_current?: number;
  sequence_end?: number;
  requires_certification: boolean;
  supports_quick_mode: boolean;
  is_minor_expense: boolean;
}

export interface PaymentSplit {
  payment_method: number;   // 1:Cash 2:Check/Transfer 3:Card 4:Credit 6:Swap 7:Credit Note 8:Mixed
  payment_amount: number;
}

// ── Unified Emission ──

export interface EmitLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  discount_rate?: number;
  tax_rate?: number;
  good_service_indicator?: number; // 1: Good, 2: Service
}

export interface EmitRequest {
  mode: "quick" | "detailed";
  ecf_type: number;
  income_type?: string;
  payment_type: number;    // 1: Contado, 2: Crédito
  payment_method?: number;  // 1: Efectivo, 2: Cheque/Transf, 3: Tarjeta
  payment_splits?: PaymentSplit[];
  items: EmitLineItem[];
  notes?: string;

  // Quick mode
  buyer_name?: string;
  buyer_rnc?: string;
  buyer_address?: string;
  buyer_phone?: string;
  buyer_email?: string;

  // Detailed mode
  client_id?: string;
  reference_ecf?: string;
  reference_date?: string;
  modification_code?: number; // 1:Total cancellation 2:Text correction 3:Amount 4:Replace NCF
  invoice_id?: string;
  is_correction?: boolean;
}

export interface EmitResult {
  message: string;
  status: "verified" | "pending" | "draft" | "error";
  invoice?: BillingInvoice;
  async_track_id?: string;
  error_code?: string;
  error_message?: string;
}

export async function testAlanubeConnection(data: { api_url: string; jwt_token: string }) {
  return apiFetch<{ ok: boolean; company?: unknown; error?: string }>("/api/billing/alanube/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export const billingApi = {
  // Invoice Types
  getInvoiceTypes: () => apiFetch<InvoiceTypeInfo[]>("/api/billing/invoice-types"),

  // Unified Emission
  emitInvoice: (data: EmitRequest) =>
    apiFetch<EmitResult>("/api/billing/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
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
  getProducts: (params?: {
    search?: string;
    tax_rate?: number;
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.tax_rate !== undefined) searchParams.set("tax_rate", String(params.tax_rate));
    if (params?.is_active !== undefined) searchParams.set("is_active", String(params.is_active));
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    const qs = searchParams.toString();
    return apiFetch<ProductListResponse>(`/api/billing/products${qs ? `?${qs}` : ""}`);
  },
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
  importProducts: (file: File, conflictMode: "skip" | "overwrite" = "skip") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conflict_mode", conflictMode);
    return apiFetch<BulkProductImportResponse>("/api/billing/products/import", {
      method: "POST",
      body: formData,
    });
  },
  downloadImportTemplate: (format: "csv" | "xlsx" = "csv") => {
    const url = `/api/billing/products/import/template?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

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
  getSequenceAlerts: () => apiFetch<SequenceAlert[]>("/api/billing/sequences/alerts"),

  // Invoices
  getInvoices: () => apiFetch<BillingInvoice[]>("/api/billing/invoices"),
  createInvoice: (data: InvoiceCreate) =>
    apiFetch<BillingInvoice>("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getInvoice: (id: string) => apiFetch<BillingInvoice>(`/api/billing/invoices/${id}`),
  updateInvoice: (id: string, data: InvoiceCreate) =>
    apiFetch<BillingInvoice>(`/api/billing/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
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
