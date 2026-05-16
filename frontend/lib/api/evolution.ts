import { apiFetch } from "@/lib/api/client";

export async function getEvolutionStatus() {
  return apiFetch<Record<string, unknown>>("/evolution/proxy/status");
}

export async function getEvolutionQr() {
  return apiFetch<Record<string, unknown>>("/evolution/proxy/qr");
}

export async function createEvolutionInstance() {
  return apiFetch<Record<string, unknown>>("/evolution/proxy/create", { method: "POST" });
}
