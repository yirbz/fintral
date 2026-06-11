import { apiFetch } from "@/lib/api/client";

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  tax_id: string;
  phone: string;
}

export interface RegisterResult {
  message: string;
  email: string;
  requires_verification: boolean;
}

export async function register(data: RegisterPayload) {
  return apiFetch<RegisterResult>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface VerifyCodePayload {
  email: string;
  code: string;
}

export async function verifyCode(data: VerifyCodePayload) {
  return apiFetch<{ message: string; verified: boolean }>("/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function verifyAndLogin(email: string, code: string) {
  return apiFetch<{ access_token: string; token_type: string }>("/api/auth/verify-and-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
}

export async function forgotPassword(email: string) {
  return apiFetch<{ message: string }>("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, code: string, password: string) {
  return apiFetch<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, password }),
  });
}

export async function resendCode(email: string) {
  return apiFetch<{ message: string }>("/api/auth/resend-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}
