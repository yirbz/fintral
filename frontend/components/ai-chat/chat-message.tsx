"use client";

import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 text-sm leading-relaxed",
        isUser ? "bg-transparent" : "bg-muted/30"
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted-foreground/10 text-muted-foreground"
        )}
      >
        {isUser ? (
          <User className="size-3.5" />
        ) : (
          <Bot className="size-3.5" />
        )}
      </div>
      <div className="flex-1 space-y-1 overflow-hidden">
        <p className="text-xs font-medium text-muted-foreground">
          {isUser ? "Tú" : "Fintral AI"}
        </p>
        <div className="prose prose-sm max-w-none text-foreground/90 [&_br]:content-['']">
          {content.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < content.split("\n").length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
