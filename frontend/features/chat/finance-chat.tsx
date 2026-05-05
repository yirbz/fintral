"use client";

import { Loader2, MessageCircle, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useState } from "react";

import { askFinanceAssistant } from "@/lib/api/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  text: string;
  isUser: boolean;
}

const PRESET_QUESTIONS = [
  "Resumen de extracción de hoy",
  "¿Qué facturas tienen campos incompletos?",
  "Facturas recibidas por WhatsApp hoy"
];

export function FinanceChat() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  async function sendQuestion(value: string) {
    const question = value.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { text: question, isUser: true }]);
    setInput("");
    setLoading(true);

    try {
      const answer = await askFinanceAssistant(question);
      setMessages((prev) => [...prev, { text: answer.answer, isUser: false }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { text: "Error de conexión. Intenta de nuevo en unos segundos.", isUser: false }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="mb-3 flex h-[520px] w-[360px] flex-col rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Asistente de Datos</p>
              <p className="text-[11px] text-muted-foreground">Motor IA activo</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="tight-scrollbar flex-1 space-y-3 overflow-auto bg-muted/40 p-3">
            <div className="rounded-md border bg-white p-2 text-xs text-muted-foreground">
              Puedo ayudarte a revisar extracción, detectar inconsistencias y resumir datos.
            </div>
            {messages.map((msg, idx) => (
              <div
                key={`${msg.isUser ? "u" : "a"}-${idx}`}
                className={`rounded-md border p-2 text-xs ${msg.isUser ? "ml-10 bg-primary text-white" : "mr-10 bg-white"}`}
              >
                {msg.isUser ? <p>{msg.text}</p> : <ReactMarkdown>{msg.text}</ReactMarkdown>}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Respondiendo...
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t p-3">
            <div className="tight-scrollbar flex gap-2 overflow-auto pb-1">
              {PRESET_QUESTIONS.map((question) => (
                <button
                  className="whitespace-nowrap rounded-md border bg-white px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                  key={question}
                  onClick={() => void sendQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void sendQuestion(input);
                  }
                }}
                placeholder="Pregunta algo..."
              />
              <Button size="icon" onClick={() => void sendQuestion(input)} disabled={loading}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Button size="icon" className="rounded-full" onClick={() => setOpen((prev) => !prev)}>
        <MessageCircle className="h-5 w-5" />
      </Button>
    </div>
  );
}
