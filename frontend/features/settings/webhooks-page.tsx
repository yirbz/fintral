"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap, Webhook } from "lucide-react";
import { useState } from "react";

import { createWebhook, deleteWebhook, getWebhooks, testWebhook } from "@/lib/api/settings";
import type { WebhookEndpoint } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function WebhooksPage() {
  const queryClient = useQueryClient();
  const webhooksQuery = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });

  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("invoice.processed");
  const [creating, setCreating] = useState(false);

  async function addWebhook() {
    if (!newWebhookUrl) return;
    setCreating(true);
    try {
      await createWebhook({ url: newWebhookUrl, events: [newWebhookEvent] });
      setNewWebhookUrl("");
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    } finally {
      setCreating(false);
    }
  }

  const webhooks = (webhooksQuery.data as WebhookEndpoint[] | undefined) ?? [];

  if (webhooksQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-56 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2"><Skeleton className="h-8 flex-1 rounded-md" /><Skeleton className="h-8 w-[180px] rounded-md" /><Skeleton className="h-8 w-20 rounded-md" /></div>
          {Array.from({ length: 2 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full rounded-lg" />))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Webhooks</CardTitle>
        <CardDescription className="text-xs">Recibe notificaciones HTTP cuando ocurren eventos en el sistema.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input placeholder="https://hooks.zapier.com/..." value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} />
          <Select value={newWebhookEvent} onValueChange={(v) => setNewWebhookEvent(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice.processed">invoice.processed</SelectItem>
              <SelectItem value="audit.alert">audit.alert</SelectItem>
              <SelectItem value="invoices.exported">invoices.exported</SelectItem>
              <SelectItem value="*">todos los eventos</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => void addWebhook()} disabled={creating || !newWebhookUrl}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Crear
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 py-10">
            <Webhook className="mb-2 size-6 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">Sin webhooks configurados</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">Añade tu primer webhook para recibir eventos del sistema.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {webhooks.map((webhook) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3" key={webhook.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{webhook.url}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {webhook.events.map((ev) => (<Badge key={ev} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{ev}</Badge>))}
                    <Badge variant={webhook.is_active ? "default" : "outline"} className="text-[10px] px-1.5 py-0 h-4">{webhook.is_active ? "activo" : "inactivo"}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void testWebhook(webhook.id)}>Test</Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
                    onClick={async () => { await deleteWebhook(webhook.id); await queryClient.invalidateQueries({ queryKey: ["webhooks"] }); }}>
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
