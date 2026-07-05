"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminPaymentProof,
  adminPaymentProofsApi,
} from "@/lib/api/admin";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  verified: { label: "Verificado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
  revoked: { label: "Revocado", variant: "destructive" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "d MMM yyyy, h:mm a", { locale: es });
  } catch {
    return dateStr;
  }
}

export function AdminPaymentProofsPage() {
  const [proofs, setProofs] = useState<AdminPaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedProof, setSelectedProof] = useState<AdminPaymentProof | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const data = await adminPaymentProofsApi.list(status || undefined);
      setProofs(data);
    } catch (e) {
      console.error("Error loading payment proofs", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter);
  }, [load, statusFilter]);

  const filtered = search
    ? proofs.filter(
        (p) =>
          p.organization_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.user_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.user_email?.toLowerCase().includes(search.toLowerCase()) ||
          p.plan_name.toLowerCase().includes(search.toLowerCase())
      )
    : proofs;

  const handleVerify = async (action: "verified" | "rejected" | "revoked") => {
    if (!selectedProof) return;
    setActionLoading(true);
    try {
      await adminPaymentProofsApi.verify(selectedProof.id, action, adminNotes);

      if (action === "verified") {
        toast.success("Pago verificado", {
          description: "Se ha enviado un correo de confirmación al usuario.",
        });
      } else if (action === "rejected") {
        toast.error("Pago rechazado", {
          description: adminNotes
            ? `Motivo: ${adminNotes}`
            : "Se ha notificado al usuario.",
        });
      } else if (action === "revoked") {
        toast.error("Pago revocado", {
          description: "Se ha revertido el plan y notificado al usuario.",
        });
      }

      setSelectedProof(null);
      setAdminNotes("");
      load(statusFilter);
    } catch (e) {
      console.error("Error updating proof", e);
      toast.error("Error al procesar", {
        description: "No se pudo actualizar el comprobante.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openDialog = (proof: AdminPaymentProof) => {
    setSelectedProof(proof);
    setAdminNotes(proof.admin_notes || "");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Comprobantes de Pago</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revisa y verifica las transferencias bancarias recibidas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["", "pending", "verified", "rejected"] as const).map((s) => {
            const label = s === "" ? "Todos" : STATUS_MAP[s]?.label || s;
            return (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por organización, usuario o plan..."
          className="pl-9 h-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No hay comprobantes de pago</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organización</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="w-20 text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((proof) => (
                <TableRow key={proof.id}>
                  <TableCell className="font-medium">
                    {proof.organization_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div>{proof.user_name || "—"}</div>
                    {proof.user_email && (
                      <div className="text-[11px]">{proof.user_email}</div>
                    )}
                  </TableCell>
                  <TableCell>{proof.plan_name}</TableCell>
                  <TableCell className="tabular-nums">
                    <div>
                      {proof.amount.toLocaleString("es-DO", {
                        style: "currency",
                        currency: proof.currency || "DOP",
                      })}
                    </div>
                    {proof.usd_amount && (
                      <div className="text-[10px] text-muted-foreground">
                        (${proof.usd_amount.toFixed(2)} USD @ {proof.exchange_rate?.toFixed(4)})
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_MAP[proof.status]?.variant || "outline"}>
                      {STATUS_MAP[proof.status]?.label || proof.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {formatDate(proof.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openDialog(proof)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedProof} onOpenChange={(open) => !open && setSelectedProof(null)}>
        <DialogContent className="sm:max-w-4xl flex flex-col max-h-[92vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle>Revisar Comprobante</DialogTitle>
            <DialogDescription>
              Verifica la transferencia bancaria antes de aprobarla.
            </DialogDescription>
          </DialogHeader>

          {selectedProof && (
            <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4 min-h-0">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Organización:</span>
                  <p className="font-medium">{selectedProof.organization_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuario:</span>
                  <p className="font-medium">{selectedProof.user_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{selectedProof.user_email || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Plan:</span>
                  <p className="font-medium">{selectedProof.plan_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Monto Transferido (DOP):</span>
                  <p className="font-medium tabular-nums">
                    {selectedProof.amount.toLocaleString("es-DO", {
                      style: "currency",
                      currency: selectedProof.currency || "DOP",
                    })}
                  </p>
                </div>
                {selectedProof.usd_amount && selectedProof.exchange_rate && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Monto Original (USD):</span>
                      <p className="font-medium tabular-nums">
                        {selectedProof.usd_amount.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tasa de Cambio (BPD):</span>
                      <p className="font-medium tabular-nums">
                        {selectedProof.exchange_rate.toFixed(4)}
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-muted-foreground">Estado:</span>
                  <div className="mt-0.5">
                    <Badge variant={STATUS_MAP[selectedProof.status]?.variant || "outline"}>
                      {STATUS_MAP[selectedProof.status]?.label || selectedProof.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedProof.addons && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Addons:</span>
                  <p className="mt-0.5">{selectedProof.addons}</p>
                </div>
              )}

              {/* Cart items */}
              {selectedProof.items && selectedProof.items.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Items del carrito:</span>
                  <div className="mt-1.5 space-y-1">
                    {selectedProof.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded border border-border/40 p-2 text-xs">
                        <div>
                          <span className="font-medium text-foreground">
                            {item.label || item.type}
                          </span>
                          {item.quantity > 1 && (
                            <span className="text-muted-foreground ml-1">×{item.quantity}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-2">
                            ({item.type === "plan_change" ? "Cambio de plan" :
                              item.type === "addon" ? `Addon: ${item.addon_type}` :
                              item.type === "renewal" ? `Renovación: ${item.months}m` :
                              item.type === "overage" ? "Pago por uso" : item.type})
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {(item.price_cents / 100).toLocaleString("es-DO", {
                            style: "currency",
                            currency: selectedProof.currency || "DOP",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProof.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notas del usuario:</span>
                  <p className="mt-0.5 text-muted-foreground/80 italic">
                    {selectedProof.notes}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-muted-foreground">Comprobante:</span>
                  {!selectedProof.file_url.endsWith(".pdf") && (
                    <a
                      href={selectedProof.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      <ExternalLink className="size-3" />
                      Pantalla completa
                    </a>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center min-h-[200px]">
                  {selectedProof.file_url.endsWith(".pdf") ? (
                    <a
                      href={selectedProof.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      <Eye className="size-4" />
                      Abrir PDF en nueva pestaña
                    </a>
                  ) : (
                    <img
                      src={selectedProof.file_url}
                      alt="Comprobante de pago"
                      className="max-h-[50vh] w-full rounded object-contain"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground block mb-1.5">
                  Notas de administración
                </label>
                <Textarea
                  placeholder="Motivo del rechazo o comentarios..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 px-6 py-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => setSelectedProof(null)}
            >
              <X className="size-3.5 mr-1.5" />
              Cerrar
            </Button>
            {selectedProof?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => handleVerify("rejected")}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <XCircle className="size-3.5 mr-1.5" />
                  )}
                  Rechazar
                </Button>
                <Button
                  onClick={() => handleVerify("verified")}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5 mr-1.5" />
                  )}
                  Verificar
                </Button>
              </>
            )}
            {selectedProof?.status === "verified" && (
              <Button
                variant="destructive"
                onClick={() => handleVerify("revoked")}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="size-3.5 mr-1.5" />
                )}
                Revocar / Reembolsar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
