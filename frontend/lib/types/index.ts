export type NotificationType = "info" | "success" | "warning" | "error";

export interface SessionPayload {
  user: {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    is_superuser: boolean;
  };
  tenant: {
    id: string;
    plan: string | null;
  };
  organization: {
    id: string;
    name: string;
    tax_id: string | null;
    country: string | null;
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
  file_type: "image" | "pdf";
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
  created_at: string | null;
  deleted_at: string | null;
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
}

export interface RealtimeEvent {
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
