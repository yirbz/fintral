import { apiFetch, ApiError } from "@/lib/api/client";
import type { SessionPayload } from "@/lib/types";

export async function login(email: string, password: string, remember = false) {
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);
  body.append("remember", remember ? "true" : "false");

  try {
    return await apiFetch<{ access_token: string; token_type: string }>("/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
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

export async function getMe(signal?: AbortSignal) {
  return await apiFetch<SessionPayload>("/api/me", { signal });
}
