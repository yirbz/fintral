import { apiFetch, ApiError } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/types";

export async function login(email: string, password: string, remember = false) {
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);
  body.append("remember", remember ? "true" : "false");

  try {
    const result = await apiFetch<{ access_token: string; token_type: string }>("/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    // Clear stale caches on login — the backend will return fresh data via /api/me
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("fintral_active_org");
        localStorage.removeItem("fintral_session");
      } catch { /* noop */ }
    }

    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw new Error("No disponible");
    }
    throw err;
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

export async function getMe(signal?: AbortSignal, baseUrl?: string) {
  const url = baseUrl ? `${baseUrl}/api/me` : "/api/me";
  return await apiFetch<SessionPayload>(url, { signal });
}
