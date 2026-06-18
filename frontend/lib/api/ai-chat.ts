import { apiFetch } from "./client";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  conversation?: ConversationMessage[];
}

export interface ChatResponse {
  response: string;
}

export async function sendChatMessage(
  message: string,
  conversation?: ConversationMessage[]
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation }),
  });
}
