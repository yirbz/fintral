import { apiFetch } from "@/lib/api/client";

export async function sendSupportMessage(message: string) {
  return apiFetch<{ response: string; needs_escalation: boolean }>("/api/support/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
}

export async function escalateToHuman(data: {
  subject: string;
  message: string;
  email?: string;
}) {
  return apiFetch<{ success: boolean; message: string }>("/api/support/chat/escalate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}
