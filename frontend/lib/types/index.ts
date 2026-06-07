export type NotificationType = "info" | "success" | "warning" | "error";

export interface SessionPayload {
  user: {
    id: string;
    email: string;
    full_name: string;
    job_title: string | null;
    phone: string | null;
    avatar_url: string | null;
    is_active: boolean;
    is_superuser: boolean;
    created_at: string | null;
  };
  tenant: {
    id: string;
    plan: string | null;
  };
  organization: {
    id: string;
    name: string;
    tax_id: string | null;
    phone: string | null;
    email_contact: string | null;
    website: string | null;
    country: string | null;
    fiscal_address: string | null;
  };
  role: string;
  company_name: string;
  company_tax_id: string;
  company_country: string;
  company_plan: string;
}

export interface Invoice {
  id: string;
  filename: string;
  file_type: "image" | "pdf" | "xml";
  file_url: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  currency: string;
  transaction_type: string | null;
  category: string | null;
  description: string | null;
  confidence_score: number | null;
  audit_flags: string | null;
  processed: boolean;
  vendor_country: string | null;
  vendor_tax_id: string | null;
  vendor_fiscal_address: string | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  goods_services_type: string | null;
  source_type: string | null;
  original_xml_data: string | null;
  raw_extracted_data: string | null;
  ecf_type: string | null;
  rnc_comprador: string | null;
  is_electronic: boolean;
  ingestion_source: string | null;
  status: string; // draft | pending_review | verified | voided
  parent_invoice_id: string | null;
  modified_ncf: string | null;
  modification_reason: string | null;
  is_modificatory: boolean;
  modificatory_sign: number;
  child_modificatories: ChildModificatory[];

  tags: string[];
  internal_notes: string | null;
  payment_status: string | null;
  payment_condition: string | null;
  payment_method?: string | null;
  warnings_reviewed?: boolean;
  due_date: string | null;
  payment_date: string | null;
  bank_account_id: string | null;
  created_at: string | null;
  deleted_at: string | null;
  cancelled_at: string | null;
  cancellation_type: string | null;
  dgii_status?: {
    format: "606" | "607" | "608" | null;
    status:
      | "not_applicable"
      | "confirmed_ncf"
      | "pending_upload"
      | "pending_confirm"
      | "error"
      | "excluded"
      | "reported"
      | "pending_processing"
      | "unreported";
    label: string;
    tone: "slate" | "sky" | "amber" | "red" | "emerald" | "indigo";
    locked: boolean;
  } | null;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: string | null;
  read: boolean;
  created_at: string;
  time_ago: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description?: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  created_at?: string;
  updated_at?: string;
}


export interface SettingValue {
  key: string;
  value: string | number | boolean;
  type: string;
  description?: string | null;
  category: string;
  source: string;
}

export type SettingsPayload = Record<string, SettingValue[]>;

export interface StatisticsPayload {
  queue: {
    pending: number;
    processed_total: number;
    total: number;
  };
  performance: {
    daily_processed: number;
    avg_confidence: number;
    success_rate: number;
  };
  audit: {
    alerts_count: number;
    clean_count: number;
    recent_alerts: Invoice[];
    distribution: {
      labels: string[];
      data: number[];
    };
  };
  costs: {
    avg_cost_per_doc: number;
    total_tokens: number;
    total_cost: number;
    model_breakdown: Array<{
      model: string;
      requests: number;
      total_tokens: number;
      total_cost: number;
    }>;
  };
  charts: {
    period: string;
    volume_history: Array<{ date: string; count: number }>;
  };
  categories: Array<{ category: string; count: number; total: number }>;
  monthly_stats: Array<{ month: string; count: number }>;
  totals: {
    income: { amount: number; count: number };
    expense: { amount: number; count: number };
    net: number;
  };
}

export interface RealtimeEvent {
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ChildModificatory {
  id: string;
  invoice_number: string | null;
  ecf_type: string | null;
  total_amount: number | null;
  invoice_date: string | null;
  modification_reason: string | null;
  is_modificatory: boolean;
  status: string;
  created_at: string | null;
}

export interface MatchCandidate {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  vendor_tax_id: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  currency: string | null;
  match_score: number;
  match_reasons: string[];
}
