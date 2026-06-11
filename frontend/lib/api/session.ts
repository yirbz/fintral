import { apiFetch } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/types";

export async function login(email: string, password: string) {
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);

  try {
    return await apiFetch<{ access_token: string; token_type: string }>("/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
  } catch {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === "DEVELOPMENT" && email && password) {
      console.warn("Backend unavailable — dev mode bypass");
      return { access_token: "dev-token", token_type: "bearer" as const };
    }
    throw new Error("Credenciales incorrectas");
  }
}

export async function logout() {
  const response = await fetch("/logout", {
    method: "GET",
    credentials: "include",
    redirect: "follow"
  });
  return response.ok;
}

export async function getMe(signal?: AbortSignal) {
  try {
    return await apiFetch<SessionPayload>("/api/me", { signal });
  } catch {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === "DEVELOPMENT") {
      console.warn("⚠️ Backend unavailable - dev mode bypass");
      return {
        user: { id: "dev", email: "admin@fintral.local", full_name: "Admin Dev", is_active: true, is_superuser: true },
        tenant: { id: "dev-tenant", plan: "free" },
        organization: { id: "dev-org", name: "Mi Empresa (Dev)", tax_id: "123456789", country: "DO" },
        role: "owner",
        company_name: "Mi Empresa (Dev)",
        company_tax_id: "123456789",
        company_country: "DO",
        company_plan: "Free Plan"
      };
    }
    throw new Error("No autorizado");
  }
}
