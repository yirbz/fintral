import { apiFetch } from "@/lib/api/client";

export async function askFinanceAssistant(query: string) {
  return apiFetch<{ answer: string }>("/api/chat/finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
}
