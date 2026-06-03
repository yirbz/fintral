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

  updateOrg: (orgId: string, data: Partial<{ name: string; is_active: boolean; tax_id: string }>) =>
    apiFetch<{ id: string; name: string; tax_id: string; is_active: boolean; tenant_id: string }>(
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
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch<{ total: number; offset: number; limit: number; events: AuditEvent[] }>(
      `/api/admin/audit-logs${qs ? `?${qs}` : ""}`
    );
  },

  getHealth: () => apiFetch<HealthCheck>("/api/admin/health"),

  checkDgiiHealth: () => apiFetch<DgiiHealthCheck>("/api/admin/health/dgii/check"),
};
