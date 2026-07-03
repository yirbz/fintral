import { apiFetch } from "./client";

export interface AdminStats {
  users: { total: number; active: number; new_24h: number };
  organizations: { total: number; active: number; new_24h: number };
  tenants: number;
  invoices: number;
  audit_events_24h: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  organization_count: number;
  deleted_at: string | null;
  created_at: string | null;
  last_seen: string | null;
}

export interface AdminUserDetail extends AdminUser {
  job_title: string | null;
  phone: string | null;
  organizations: {
    id: string;
    name: string;
    role: string;
    is_active: boolean;
    joined_at: string | null;
  }[];
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  organization_count: number;
  user_count: number;
  deleted_at: string | null;
  created_at: string | null;
}

export interface AdminTenantDetail extends AdminTenant {
  settings_json: string | null;
  updated_at: string | null;
  organizations: AdminOrgWithUsers[];
}

export interface AdminOrgWithUsers {
  id: string;
  name: string;
  tax_id: string | null;
  is_active: boolean;
  is_ecf_authorized: boolean;
  certification_status: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string | null;
  users: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    deleted_at: string | null;
  }[];
}

export interface AuditEvent {
  id: string;
  tenant_id: string;
  organization_id: string;
  organization_name: string | null;
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string;
  details: string | null;
  ip_address: string | null;
  visibility: string | null;
  created_at: string;
}

export interface HealthCheck {
  status: "ok" | "degraded";
  timestamp: string;
  checks: Record<string, { status: string; message?: string }>;
  errors_last_hour: number;
}

export interface DgiiHealthCheck {
  status: "ok" | "degraded";
  timestamp: string;
  checks: Record<string, { status: string; message: string }>;
}

export const adminApi = {
  getStats: () => apiFetch<AdminStats>("/api/admin/stats"),

  listUsers: (params?: {
    search?: string;
    is_active?: boolean;
    is_superuser?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.is_active !== undefined) query.set("is_active", String(params.is_active));
    if (params?.is_superuser !== undefined) query.set("is_superuser", String(params.is_superuser));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<{ total: number; offset: number; limit: number; users: AdminUser[] }>(
      `/api/admin/users${qs ? `?${qs}` : ""}`
    );
  },

  getUser: (userId: string) =>
    apiFetch<AdminUserDetail>(`/api/admin/users/${userId}`),

  toggleUserActive: (userId: string) =>
    apiFetch<{ id: string; email: string; is_active: boolean }>(
      `/api/admin/users/${userId}/toggle-active`,
      { method: "PATCH" }
    ),

  setUserSuperuser: (userId: string, isSuperuser: boolean) =>
    apiFetch<{ id: string; email: string; is_superuser: boolean }>(
      `/api/admin/users/${userId}/set-superuser`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_superuser: isSuperuser }),
      }
    ),

  listTenants: (params?: { search?: string; include_deleted?: boolean; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.include_deleted) query.set("include_deleted", "true");
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<{ total: number; offset: number; limit: number; tenants: AdminTenant[] }>(
      `/api/admin/tenants${qs ? `?${qs}` : ""}`
    );
  },

  getTenant: (tenantId: string) =>
    apiFetch<AdminTenantDetail>(`/api/admin/tenants/${tenantId}`),

  updateTenant: (tenantId: string, data: Partial<{ name: string; slug: string; plan: string; is_active: boolean }>) =>
    apiFetch<{ id: string; name: string; slug: string; plan: string; is_active: boolean }>(
      `/api/admin/tenants/${tenantId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
    ),

  deleteTenant: (tenantId: string) =>
    apiFetch<{ message: string }>(`/api/admin/tenants/${tenantId}`, { method: "DELETE" }),

  restoreTenant: (tenantId: string) =>
    apiFetch<{ message: string }>(`/api/admin/tenants/${tenantId}/restore`, { method: "PATCH" }),

  updateUser: (userId: string, data: Partial<{ full_name: string; email: string; is_active: boolean; is_superuser: boolean }>) =>
    apiFetch<{ id: string; email: string; full_name: string; is_active: boolean; is_superuser: boolean }>(
      `/api/admin/users/${userId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
    ),

  deleteUser: (userId: string) =>
    apiFetch<{ message: string }>(`/api/admin/users/${userId}`, { method: "DELETE" }),

  restoreUser: (userId: string) =>
    apiFetch<{ message: string }>(`/api/admin/users/${userId}/restore`, { method: "PATCH" }),

  updateOrg: (orgId: string, data: Partial<{ name: string; is_active: boolean; tax_id: string; is_ecf_authorized: boolean; certification_status: string }>) =>
    apiFetch<{ id: string; name: string; tax_id: string; is_active: boolean; is_ecf_authorized: boolean; certification_status: string; tenant_id: string }>(
      `/api/admin/organizations/${orgId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
    ),

  deleteOrg: (orgId: string) =>
    apiFetch<{ message: string }>(`/api/admin/organizations/${orgId}`, { method: "DELETE" }),

  restoreOrg: (orgId: string) =>
    apiFetch<{ message: string }>(`/api/admin/organizations/${orgId}/restore`, { method: "PATCH" }),

  getAuditLogs: (params?: {
    tenant_id?: string;
    organization_id?: string;
    action?: string;
    actor_id?: string;
    resource_type?: string;
    visibility?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.tenant_id) query.set("tenant_id", params.tenant_id);
    if (params?.organization_id) query.set("organization_id", params.organization_id);
    if (params?.action) query.set("action", params.action);
    if (params?.actor_id) query.set("actor_id", params.actor_id);
    if (params?.resource_type) query.set("resource_type", params.resource_type);
    if (params?.visibility) query.set("visibility", params.visibility);
    if (params?.start_date) query.set("start_date", params.start_date);
    if (params?.end_date) query.set("end_date", params.end_date);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<{ total: number; offset: number; limit: number; events: AuditEvent[] }>(
      `/api/admin/audit-logs${qs ? `?${qs}` : ""}`
    );
  },

  getHealth: () => apiFetch<HealthCheck>("/api/admin/health"),

  checkDgiiHealth: () => apiFetch<DgiiHealthCheck>("/api/admin/health/dgii/check"),

  getCostsAnalytics: () => apiFetch<any>("/api/admin/analytics/costs"),

  getUsageAnalytics: (cycle?: number) =>
    apiFetch<any>(`/api/admin/analytics/usage${cycle ? `?cycle=${cycle}` : ""}`),

  getStorageAnalytics: () => apiFetch<any>("/api/admin/analytics/storage"),

  getAlanubeAnalytics: () => apiFetch<any>("/api/admin/analytics/alanube"),

  getMrr: () => apiFetch<AdminMrrResponse>("/api/admin/finance/mrr"),

  getPayments: (params?: { status?: string; organization_id?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.organization_id) query.set("organization_id", params.organization_id);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<AdminPaymentsResponse>(`/api/admin/finance/payments${qs ? `?${qs}` : ""}`);
  },

  getChurn: () => apiFetch<AdminChurnResponse>("/api/admin/finance/churn"),

  getSubDistribution: () => apiFetch<AdminSubDistributionResponse>("/api/admin/finance/subscription-distribution"),

  listSubscriptions: (params?: { status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<AdminSubscriptionsResponse>(`/api/admin/subscriptions${qs ? `?${qs}` : ""}`);
  },

  updateSubscription: (subId: string, data: Partial<{
    plan_id: string;
    status: string;
    custom_price_cents: number;
    custom_limits_json: Record<string, any>;
    billing_cycle_end: string;
  }>) => apiFetch<AdminSubscription>(`/api/admin/subscriptions/${subId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }),

  creditSubscription: (subId: string, data: { days: number; reason: string }) =>
    apiFetch<AdminSubscription>(`/api/admin/subscriptions/${subId}/credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  listSubscriptionPlans: () => apiFetch<AdminSubscriptionPlan[]>("/api/admin/subscription-plans"),

  suspendTenant: (
    tenantId: string,
    data: { reason: string; grace_days: number; notify_user: boolean }
  ) =>
    apiFetch<{ id: string; is_active: boolean; message: string }>(
      `/api/admin/tenants/${tenantId}/suspend`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    ),

  unsuspendTenant: (
    tenantId: string,
    data: { notify_user: boolean }
  ) =>
    apiFetch<{ id: string; is_active: boolean; message: string }>(
      `/api/admin/tenants/${tenantId}/unsuspend`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    ),

  onboardTenant: (data: {
    org_name: string;
    tax_id: string;
    admin_email: string;
    admin_name: string;
    plan: string;
    country: string;
    password?: string;
  }) =>
    apiFetch<{
      tenant_id: string;
      tenant_name: string;
      slug: string;
      org_id: string;
      admin_email: string;
      admin_name: string;
      plan: string;
      temp_password?: string;
    }>("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

export interface AdminMrrResponse {
  mrr: number;
  mrr_cents: number;
  base_mrr: number;
  addon_mrr: number;
  active_subscriptions_count: number;
}

export interface AdminPayment {
  id: string;
  tenant_id: string;
  organization_id: string;
  invoice_id: string | null;
  mio_order_uuid: string;
  checkout_url: string | null;
  status: string;
  currency: string;
  amount: number;
  items: any;
  payment_id: string | null;
  authorization_code: string | null;
  reference_number: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  organization_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_total: number;
}

export interface AdminPaymentsResponse {
  payments: AdminPayment[];
  total: number;
  limit: number;
  offset: number;
}

export interface LostSubscription {
  subscription_id: string;
  organization_id: string;
  organization_name: string;
  plan_name: string;
  status: string;
  canceled_at: string | null;
  lost_at: string;
}

export interface ChurnRisk {
  organization_id: string;
  organization_name: string;
  plan_name: string;
  billing_cycle_end: string | null;
  total_invoices: number;
  last_activity: string | null;
}

export interface AdminChurnResponse {
  lost_subscriptions_last_90_days: LostSubscription[];
  lost_count: number;
  churn_risks: ChurnRisk[];
  churn_risk_count: number;
}

export interface AdminSubDistributionResponse {
  by_plan: Record<string, number>;
  by_status: Record<string, number>;
}

export interface AdminSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_name: string | null;
  status: string;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  trial_ends_at: string | null;
  canceled_at: string | null;
  addons: {
    ecf_blocks: number;
    ai_blocks: number;
    storage_blocks: number;
    extra_entities: number;
  };
  auto_renew_addons: boolean;
  limits: Record<string, any>;
  is_trialing: boolean;
  organization_name: string | null;
}

export interface AdminSubscriptionsResponse {
  subscriptions: AdminSubscription[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_monthly_cents: number;
  currency: string;
  extra_entity_price: number;
  addon_ecf_block_size: number;
  addon_ecf_block_price: number;
  addon_ai_block_size: number;
  addon_ai_block_price: number;
  limits: Record<string, any>;
  features: Record<string, boolean>;
  soft_limit_enabled: boolean;
  is_enterprise: boolean;
  sort_order: number;
}

export interface AdminCartItem {
  type: string;
  plan_name?: string;
  addon_type?: string;
  quantity: number;
  months?: number;
  price_cents: number;
  label?: string;
}

export interface AdminPaymentProof {
  id: string;
  tenant_id: string;
  organization_id: string;
  organization_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  plan_name: string;
  amount: number;
  currency: string;
  addons: string | null;
  items: AdminCartItem[] | null;
  status: string;
  file_url: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const adminPaymentProofsApi = {
  list: (statusFilter?: string) => {
    const qs = statusFilter ? `?status_filter=${statusFilter}` : "";
    return apiFetch<AdminPaymentProof[]>(`/api/admin/payment-proofs${qs}`);
  },
  verify: (proofId: string, action: "verified" | "rejected", adminNotes?: string) =>
    apiFetch<AdminPaymentProof>(`/api/admin/payment-proofs/${proofId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, admin_notes: adminNotes || null }),
    }),
};
