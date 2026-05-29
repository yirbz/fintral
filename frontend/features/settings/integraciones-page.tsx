"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { listConnections as listOdooConnections, testConnection as testOdooForm, testSavedConnection as testOdooConnection, createConnection as createOdooConnection, deleteConnection as deleteOdooConnection } from "@/lib/api/odoo";
import { listQuickBooksConnections, testQuickBooksConnection, deleteQuickBooksConnection, getQuickBooksAuthUrl } from "@/lib/api/quickbooks";
import { listXeroConnections, testXeroConnection, deleteXeroConnection, getXeroAuthUrl } from "@/lib/api/xero";
import { QuickBooksIcon, XeroIcon, OdooIcon, SageIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type IntegrationDef = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  bg: string;
  status: "available" | "coming_soon";
};

const AVAILABLE_INTEGRATIONS: IntegrationDef[] = [
  { id: "odoo", name: "Odoo", description: "Vendor Bills vía XML-RPC", icon: <OdooIcon className="size-5" />, bg: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", status: "available" },
  { id: "quickbooks", name: "QuickBooks", description: "Bills vía OAuth 2.0", icon: <QuickBooksIcon className="size-5" />, bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", status: "available" },
  { id: "xero", name: "Xero", description: "Vendor Bills vía OAuth 2.0", icon: <XeroIcon className="size-5" />, bg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300", status: "available" },
  { id: "contaplus", name: "Contaplus", description: "Formato Sage / Diario", icon: <SageIcon className="size-5" />, bg: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300", status: "coming_soon" },
];

export function IntegracionesPage() {
  const odooQuery = useQuery({ queryKey: ["odoo-connections"], queryFn: listOdooConnections });
  const qbQuery = useQuery({ queryKey: ["quickbooks-connections"], queryFn: listQuickBooksConnections });
  const xeroQuery = useQuery({ queryKey: ["xero-connections"], queryFn: listXeroConnections });
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showOdooDialog, setShowOdooDialog] = useState(false);
  const [connForm, setConnForm] = useState({ name: "", url: "", database: "", username: "", api_key: "" });
  const [testingForm, setTestingForm] = useState(false);
  const [testFormResult, setTestFormResult] = useState<{ ok: boolean; error?: string; server_version?: string } | null>(null);
  const [savingOdoo, setSavingOdoo] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string; detail?: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loading = odooQuery.isLoading || qbQuery.isLoading || xeroQuery.isLoading;
  const odooConns = odooQuery.data ?? [];
  const qbConns = qbQuery.data ?? [];
  const xeroConns = xeroQuery.data ?? [];

  function connsFor(id: string) {
    if (id === "odoo") return odooConns;
    if (id === "quickbooks") return qbConns;
    if (id === "xero") return xeroConns;
    return [];
  }

  function hasConn(id: string) { return connsFor(id).length > 0; }

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-4 w-28 rounded-md" /><Skeleton className="h-3 w-52 rounded-md" /></CardHeader>
        <CardContent><div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-28 rounded-lg" />))}</div></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-heading">Integraciones</CardTitle>
          <CardDescription className="text-xs">Conecta tu software contable para enviar facturas directamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {AVAILABLE_INTEGRATIONS.map((integration) => {
              const connected = hasConn(integration.id);
              const isExpanded = expanded === integration.id;
              const connections = connsFor(integration.id);
              const isAvailable = integration.status === "available";

              return (
                <div key={integration.id} className={cn(
                  "rounded-lg border transition-all",
                  connected ? "border-l-2 border-l-green-500 border-border/80" : "border-border/60 hover:border-border",
                  isAvailable ? "cursor-pointer" : "opacity-60"
                )}>
                  <div className="flex items-start gap-3 p-4" onClick={() => {
                    if (!isAvailable) return;
                    if (connected) setExpanded(isExpanded ? null : integration.id);
                    else { if (integration.id === "odoo") setShowOdooDialog(true); if (integration.id === "quickbooks") handleQbConnect(); if (integration.id === "xero") handleXeroConnect(); }
                  }}>
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", integration.bg)}>{integration.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{integration.name}</p>
                        {connected ? <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-600 border-green-500/20">conectado</Badge> : integration.status === "coming_soon" ? <Badge variant="outline" className="text-[10px] h-4 px-1.5">próximamente</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>
                    </div>
                    <div className="shrink-0">{connected ? <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} /> : isAvailable ? <Plus className="size-4 text-muted-foreground" /> : null}</div>
                  </div>

                  {isExpanded && connected && (
                    <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-2">
                      {connections.map((conn) => (
                        <div key={conn.id} className="rounded-md border border-border/60 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{conn.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant={conn.is_active ? "default" : "outline"} className="text-[10px] h-4 px-1.5">{conn.is_active ? "activo" : "inactivo"}</Badge>
                                {conn.last_sync_at && <span className="text-[10px] text-muted-foreground">sync: {new Date(conn.last_sync_at).toLocaleDateString()}</span>}
                                {conn.last_error && <span className="text-[10px] text-destructive">error</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon-sm" className="size-7" disabled={testingId === conn.id}
                                onClick={async (e) => { e.stopPropagation(); setTestingId(conn.id);
                                  try { const fn = integration.id === "odoo" ? testOdooConnection : testQuickBooksConnection; const r = await fn(conn.id); setTestResults((prev) => ({ ...prev, [conn.id]: r })); if (r.ok) toast.success(`Conexión ${integration.name} exitosa`); else toast.error("Error de conexión", { description: r.error }); }
                                  catch { setTestResults((prev) => ({ ...prev, [conn.id]: { ok: false, error: "Error de red" } })); toast.error(`No se pudo conectar con ${integration.name}`); }
                                  finally { setTestingId(null); } }}>
                                {testingId === conn.id ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="size-7 text-destructive hover:text-destructive" disabled={deletingId === conn.id}
                                onClick={async (e) => { e.stopPropagation(); setDeletingId(conn.id);
                                  try { const fn = integration.id === "odoo" ? deleteOdooConnection : deleteQuickBooksConnection; await fn(conn.id); toast.success(`Conexión "${conn.name}" eliminada`); queryClient.invalidateQueries({ queryKey: [`${integration.id}-connections`] }); setExpanded(null); }
                                  catch (e: any) { toast.error("Error al eliminar", { description: e.message }); } finally { setDeletingId(null); } }}>
                                {deletingId === conn.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                              </Button>
                            </div>
                          </div>
                          {testResults[conn.id] && (
                            <div className={cn("mt-2 px-2.5 py-1.5 rounded text-[11px] border", testResults[conn.id].ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")}>
                              {testResults[conn.id].ok ? `✓ ${testResults[conn.id].detail || "Conectado"}` : `✗ ${testResults[conn.id].error}`}
                            </div>
                          )}
                          {(integration.id === "quickbooks" || integration.id === "xero") && (
                            <Button variant="outline" size="sm" className="h-6 text-[10px] w-full mt-1"
                              onClick={async (e) => { e.stopPropagation(); integration.id === "quickbooks" ? handleQbConnect() : handleXeroConnect(); }}>
                              Reconectar OAuth
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showOdooDialog} onOpenChange={setShowOdooDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Conectar Odoo</DialogTitle><DialogDescription>Ingresa las credenciales de tu instancia de Odoo.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Nombre</Label><Input placeholder="Mi Empresa Odoo" value={connForm.name} onChange={(e) => setConnForm({ ...connForm, name: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">URL del servidor</Label><Input placeholder="https://mycompany.odoo.com" value={connForm.url} onChange={(e) => setConnForm({ ...connForm, url: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Base de datos</Label><Input placeholder="mycompany" value={connForm.database} onChange={(e) => setConnForm({ ...connForm, database: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Usuario <span className="text-muted-foreground font-normal">(opcional)</span></Label><Input placeholder="admin@mycompany.com" value={connForm.username} onChange={(e) => setConnForm({ ...connForm, username: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">API Key</Label><Input type="password" placeholder="••••••••••••" value={connForm.api_key} onChange={(e) => setConnForm({ ...connForm, api_key: e.target.value })} /></div>
            {testFormResult && <div className={cn("px-3 py-2 rounded text-xs border", testFormResult.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")}>{testFormResult.ok ? `✓ Conectado — ${testFormResult.server_version || "Odoo"}` : `✗ ${testFormResult.error}`}</div>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" disabled={testingForm} onClick={async () => {
              setTestingForm(true); setTestFormResult(null);
              try { const r = await testOdooForm(connForm); setTestFormResult(r); if (r.ok) toast.success("Conexión Odoo verificada"); else toast.error("Error de conexión", { description: r.error }); }
              catch { setTestFormResult({ ok: false, error: "Error de red" }); toast.error("No se pudo conectar con Odoo"); } finally { setTestingForm(false); }
            }}>{testingForm ? <Loader2 className="size-3 animate-spin" /> : null}{testingForm ? "Probando..." : "Probar conexión"}</Button>
            <Button size="sm" disabled={!connForm.name || !connForm.url || !connForm.database || !connForm.api_key || savingOdoo} onClick={async () => {
              setSavingOdoo(true);
              try { await createOdooConnection(connForm); setShowOdooDialog(false); setConnForm({ name: "", url: "", database: "", username: "", api_key: "" }); setTestFormResult(null); queryClient.invalidateQueries({ queryKey: ["odoo-connections"] }); toast.success(`"${connForm.name}" conectado`); }
              catch (e: any) { toast.error("Error al guardar", { description: e.message }); } finally { setSavingOdoo(false); }
            }}>{savingOdoo ? <Loader2 className="size-3 animate-spin" /> : null}{savingOdoo ? "Guardando..." : "Guardar conexión"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  function handleQbConnect() {
    getQuickBooksAuthUrl().then(({ url }) => {
      const popup = window.open(url, "quickbooks-oauth", "width=600,height=700,scrollbars=yes");
      if (!popup) { toast.error("Permite ventanas emergentes para conectar QuickBooks"); return; }
      let resolved = false;
      const done = () => { resolved = true; window.removeEventListener("message", handler); clearInterval(timer); if (popup && !popup.closed) popup.close(); };
      const handler = (e: MessageEvent) => {
        if (e.data?.type !== "qb-oauth") return;
        done();
        if (e.data.status === "connected") { toast.success("QuickBooks conectado exitosamente"); queryClient.invalidateQueries({ queryKey: ["quickbooks-connections"] }); }
        else { toast.error("Error al conectar QuickBooks", { description: e.data.detail || "Error desconocido" }); }
      };
      window.addEventListener("message", handler);
      const timer = setInterval(() => { if (popup.closed && !resolved) { done(); toast.error("Conexión cancelada", { description: "Cerraste la ventana de QuickBooks sin completar la autenticación" }); } }, 500);
    }).catch((e: any) => toast.error("Error al iniciar conexión", { description: e.message }));
  }

  function handleXeroConnect() {
    getXeroAuthUrl().then(({ url }) => {
      const popup = window.open(url, "xero-oauth", "width=600,height=700,scrollbars=yes");
      if (!popup) { toast.error("Permite ventanas emergentes para conectar Xero"); return; }
      let resolved = false;
      const done = () => { resolved = true; window.removeEventListener("message", handler); clearInterval(timer); if (popup && !popup.closed) popup.close(); };
      const handler = (e: MessageEvent) => {
        if (e.data?.type !== "xero-oauth") return;
        done();
        if (e.data.status === "connected") { toast.success("Xero conectado exitosamente"); queryClient.invalidateQueries({ queryKey: ["xero-connections"] }); }
        else { toast.error("Error al conectar Xero", { description: e.data.detail || "Error desconocido" }); }
      };
      window.addEventListener("message", handler);
      const timer = setInterval(() => { if (popup.closed && !resolved) { done(); toast.error("Conexión cancelada", { description: "Cerraste la ventana de Xero sin completar la autenticación" }); } }, 500);
    }).catch((e: any) => toast.error("Error al iniciar conexión", { description: e.message }));
  }
}
