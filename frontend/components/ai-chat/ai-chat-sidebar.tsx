"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, SendHorizontal, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "@/components/ai-chat/chat-message";
import { sendChatMessage } from "@/lib/api/ai-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "¿Cuál es el resumen de facturas del mes?",
  "¿A qué proveedores hay que pagar?",
  "¿Cuál fue el último reporte DGII?",
  "¿Qué ha pasado recientemente?",
];

export function AiChatSidebar() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when sidebar opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard shortcut: Cmd+I to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSend = async (text?: string) => {
    const message = (text || input).trim();
    if (!message || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const result = await sendChatMessage(message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Lo siento, ocurrió un error al procesar tu consulta. Intenta de nuevo.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className={cn(
          "rounded-full gap-1.5 text-sm font-normal transition-all",
          open
            ? "text-foreground bg-accent/50 hover:bg-accent"
            : "text-foreground/70 hover:text-foreground hover:bg-accent"
        )}
      >
        {open ? (
          <>
            <X className="size-3.5" />
            Cerrar asistente
          </>
        ) : (
          <>
            <Sparkles className="size-3.5 text-primary" />
            Asistente AI
            <kbd className="hidden rounded-md border border-border/40 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 md:inline-flex">
              ⌘I
            </kbd>
          </>
        )}
      </Button>

      {/* Sidebar panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full flex-col border-l bg-background shadow-lg transition-all duration-300",
          open ? "w-[22rem]" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-3.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Asistente Fintral</h2>
              <p className="text-[11px] text-muted-foreground">
                Datos fiscales en tiempo real
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="size-7 rounded-full text-muted-foreground hover:text-foreground"
            title="Cerrar"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-2">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/5">
                <Bot className="size-7 text-primary/60" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium">
                  ¿En qué puedo ayudarte?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pregunta sobre facturas, pagos, reportes DGII y más.
                  <br />
                  Todas las respuestas están basadas en datos reales.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="rounded-lg border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                />
              ))}
              {loading && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <span className="flex gap-0.5">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce delay-75">·</span>
                    <span className="animate-bounce delay-150">·</span>
                  </span>
                  Consultando datos...
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              className="h-9 rounded-full text-sm"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="size-9 shrink-0 rounded-full"
            >
              <SendHorizontal className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            Respuestas basadas en datos reales de tu organización
          </p>
        </div>
      </div>
    </>
  );
}
