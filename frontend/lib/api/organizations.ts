import { apiFetch } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────

export interface UserOrg {
  id: string;
  name: string;
  tax_id: string | null;
  role: string;
  is_current: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface OrgMemberDetail {
  user_id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[] | null;
}

export interface InvitationData {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
}

// ── Organization switching ─────────────────────────────────────────

export async function switchOrganization(orgId: string) {
  return apiFetch<SessionPayload>("/api/organizations/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organization_id: orgId }),
  });
}

export async function listUserOrganizations() {
  return apiFetch<UserOrg[]>("/api/organizations/user-orgs");
}

// ── Org management (requires admin/owner) ─────────────────────────

export async function createOrganization(data: {
  name: string;
  tax_id?: string;
  country?: string;
  phone?: string;
  email_contact?: string;
  fiscal_address?: string;
  municipality?: string;
  province?: string;
}) {
  return apiFetch<{
    id: string;
    name: string;
    tax_id: string | null;
    country: string;
    role: string;
    phone: string | null;
    email_contact: string | null;
    fiscal_address: string | null;
    municipality: string | null;
    province: string | null;
  }>("/api/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Member management ──────────────────────────────────────────────

export async function listOrgMembers(orgId: string) {
  return apiFetch<OrgMemberDetail[]>(`/api/organizations/${orgId}/users`);
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: string
) {
  return apiFetch<{ ok: boolean }>(
    `/api/organizations/${orgId}/users/${userId}/role`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }
  );
}

export async function removeMember(orgId: string, userId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/organizations/${orgId}/users/${userId}`,
    {
      method: "DELETE",
    }
  );
}

// ── Invitations ────────────────────────────────────────────────────

export async function createInvitation(
  orgId: string,
  data: { email: string; role?: string }
) {
  return apiFetch<InvitationData>(
    `/api/organizations/${orgId}/invitations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.email, role: data.role ?? "member" }),
    }
  );
}

export async function listInvitations(orgId: string) {
  return apiFetch<
    { id: string; email: string; role: string; created_at: string; expires_at: string }[]
  >(`/api/organizations/${orgId}/invitations`);
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/organizations/${orgId}/invitations/${invitationId}`,
    { method: "DELETE" }
  );
}
