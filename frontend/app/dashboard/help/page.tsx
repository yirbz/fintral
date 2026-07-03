"use client";

import {
  LifeBuoy,
  MessageCircle,
  Send,
  Loader2,
  Mail,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ExternalLink,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

import { sendSupportMessage, escalateToHuman } from "@/lib/api/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  text: string;
  isUser: boolean;
  needsEscalation?: boolean;
}

const QUICK_ACTIONS = [
  "¿Cómo subir una factura?",
  "¿Qué es el pipeline de extracción?",
  "¿Cómo exportar formato 606?",
  "¿Cómo configurar mi empresa?",
  "Error al procesar factura",
  "Hablar con un agente",
];

const FAQ = [
  {
    q: "¿Qué tipos de archivos puedo subir?",
    a: "Imágenes (JPG, PNG), PDFs, XML/e-CF (DGII), Excel (XLSX). El pipeline detecta automáticamente el tipo y aplica el procesador adecuado.",
  },
  {
    q: "¿Cómo funciona el pipeline?",
    a: "El pipeline tiene 10 etapas: clasificación, preprocesamiento de imágenes, parsing de PDF/XML/Excel, parser e-CF, categorización, normalización y validación. Cada factura pasa por todas las etapas automáticamente.",
  },
  {
    q: "¿Qué es el ITBIS y cómo se calcula?",
    a: "El ITBIS (Impuesto a la Transferencia de Bienes Industrializados y Servicios) es el IVA dominicano al 18%. Fintral lo detecta automáticamente de tus facturas y calcula el ITBIS cobrado vs pagado para los reportes DGII.",
  },
  {
    q: "¿Cómo configurar WhatsApp para recibir facturas?",
    a: "Ve a Ajustes → WhatsApp y escanea el código QR o guarda el número. Luego reenvía las facturas que recibes de tus proveedores al número de Fintral y se procesarán automáticamente.",
  },
  {
    q: "¿Cuáles son los formatos DGII?",
    a: "Fintral soporta los formatos 606 (Compras), 607 (Ventas/Ingresos) y 608 (Pagos al exterior). Los encuentras en la sección DGII → Exportaciones.",
  },
];

export default function HelpPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "¡Hola! Soy el asistente de soporte de Fintral. Puedo ayudarte con:\n\n• Cómo usar la plataforma\n• El pipeline de facturación\n• Formatos DGII (606/607/608)\n• Solución de problemas\n\nO si prefieres, puedo escalar tu caso a un agente humano.",
      isUser: false,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateForm, setEscalateForm] = useState({ subject: "", message: "", email: "" });
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { text, isUser: true }]);
    setInput("");
    setLoading(true);

    try {
      const result = await sendSupportMessage(text);
      setMessages((prev) => [
        ...prev,
        { text: result.response, isUser: false, needsEscalation: result.needs_escalation },
      ]);
      if (result.needs_escalation) {
        setShowEscalate(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          text: "Error de conexión. Por favor intenta de nuevo o escribe a support@fintral.app",
          isUser: false,
          needsEscalation: true,
        },
      ]);
      setShowEscalate(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleEscalate() {
    if (!escalateForm.subject.trim() || !escalateForm.message.trim()) return;
    setEscalating(true);
    try {
      await escalateToHuman({
        subject: escalateForm.subject,
        message: escalateForm.message,
        email: escalateForm.email || undefined,
      });
      setEscalated(true);
      setMessages((prev) => [
        ...prev,
        {
          text: "✅ Tu solicitud ha sido enviada al equipo de soporte. Te responderemos pronto.",
          isUser: false,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          text: "Error al enviar. Escribe directamente a support@fintral.app",
          isUser: false,
        },
      ]);
    } finally {
      setEscalating(false);
      setShowEscalate(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute right-16 bottom-0 h-20 w-20 rounded-full bg-primary/8 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <LifeBuoy className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Soporte
              </p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Centro de ayuda</h1>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Resuelve tus dudas con el asistente IA o contacta directamente con el equipo de soporte.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Section */}
        <div className="lg:col-span-2 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center gap-2.5 border-b px-4 py-3 bg-muted/20">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <MessageCircle className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Asistente de soporte</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3" />
                  IA activa
                </span>
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col gap-3 overflow-auto p-4 min-h-[400px] max-h-[500px] tight-scrollbar bg-muted/15">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "max-w-[85%] rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
                  msg.isUser
                    ? "ml-auto bg-primary text-primary-foreground border-primary/20"
                    : "mr-auto bg-card border-border"
                )}
              >
                {msg.isUser ? (
                  <p>{msg.text}</p>
                ) : (
                  <div className="prose prose-xs max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 my-1">{children}</ul>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Escribiendo...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="border-t border-border px-4 pt-3 pb-1">
            <div className="flex gap-2 overflow-auto pb-2 tight-scrollbar">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => sendMessage(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Escribe tu pregunta..."
                className="h-9 text-xs"
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>

          {/* Escalation Panel */}
          {showEscalate && !escalated && (
            <div className="border-t border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    ¿Necesitas ayuda de un agente humano?
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 mb-2">
                    Cuéntanos tu caso y te responderemos pronto.
                  </p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Asunto"
                      value={escalateForm.subject}
                      onChange={(e) => setEscalateForm((p) => ({ ...p, subject: e.target.value }))}
                      className="h-8 text-xs bg-white dark:bg-amber-950/50"
                    />
                    <Input
                      placeholder="Describe tu problema..."
                      value={escalateForm.message}
                      onChange={(e) => setEscalateForm((p) => ({ ...p, message: e.target.value }))}
                      className="h-8 text-xs bg-white dark:bg-amber-950/50"
                    />
                    <Input
                      placeholder="Tu email (opcional)"
                      type="email"
                      value={escalateForm.email}
                      onChange={(e) => setEscalateForm((p) => ({ ...p, email: e.target.value }))}
                      className="h-8 text-xs bg-white dark:bg-amber-950/50"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleEscalate}
                        disabled={escalating || !escalateForm.subject.trim() || !escalateForm.message.trim()}
                      >
                        {escalating ? (
                          <>
                            <Loader2 className="size-3 animate-spin mr-1" />
                            Enviando...
                          </>
                        ) : (
                          "Enviar solicitud"
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowEscalate(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Contact Info */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Mail className="size-3.5 text-primary" />
              Contacto directo
            </h3>
            <div className="space-y-3">
              <a
                href="mailto:support@fintral.app"
                className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-xs transition-colors hover:bg-muted/50"
              >
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                  <Mail className="size-3.5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Email</p>
                  <p className="text-[11px] text-muted-foreground">support@fintral.app</p>
                </div>
              </a>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-xs transition-colors hover:bg-muted/50 text-left"
                onClick={() => setShowEscalate(true)}
              >
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                  <MessageSquare className="size-3.5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">WhatsApp</p>
                  <p className="text-[11px] text-muted-foreground">Disponible pronto</p>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-primary" />
              Guías rápidas
            </h3>
            <div className="space-y-1">
              {[
                { label: "¿Cómo funciona el Pipeline?", href: "#" },
                { label: "Formatos DGII (606/607/608)", href: "#" },
                { label: "Facturación electrónica e-CF", href: "#" },
                { label: "Integración WhatsApp", href: "#" },
              ].map((link) => (
                <span
                  key={link.label}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] text-muted-foreground"
                >
                  <ExternalLink className="size-3 shrink-0" />
                  {link.label}
                </span>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-primary" />
              Preguntas frecuentes
            </h3>
            <div className="space-y-1">
              {FAQ.map((item, idx) => (
                <div key={idx} className="border-b border-border last:border-0 pb-1 last:pb-0">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[11px] text-left text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                    onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  >
                    <span className="flex-1">{item.q}</span>
                    <ChevronDown
                      className={cn(
                        "size-3 shrink-0 transition-transform",
                        expandedFaq === idx && "rotate-180"
                      )}
                    />
                  </button>
                  {expandedFaq === idx && (
                    <div className="px-2.5 pb-2 text-[11px] text-muted-foreground leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
