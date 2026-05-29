"use client";

import { useEffect, useState } from "react";
import { billingApi, Client, ClientCreate } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Edit2, Trash2, Mail, Phone, MapPin, Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { dgiiService } from "@/lib/services/dgii";
import { consultRncAction } from "@/app/actions/dgii";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<ClientCreate>({
    name: "",
    tax_id: "",
    phone: "",
    email: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [verifyingClientRnc, setVerifyingClientRnc] = useState(false);
  const [clientRncFeedback, setClientRncFeedback] = useState<{
    success: boolean;
    name?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!dialogOpen) {
      setClientRncFeedback(null);
      setVerifyingClientRnc(false);
      return;
    }
    const clean = dgiiService.cleanRNC(form.tax_id || "");
    if (clean.length === 9 || clean.length === 11) {
      if (dgiiService.isValidRNC(clean)) {
        let active = true;
        const lookup = async () => {
          setVerifyingClientRnc(true);
          setClientRncFeedback(null);
          try {
            const data = await consultRncAction(clean);
            if (!active) return;
            if (data && data.name) {
              setClientRncFeedback({ success: true, name: data.name });
              if (!form.name.trim()) {
                setForm(prev => ({ ...prev, name: data.name }));
              }
            } else {
              setClientRncFeedback({ success: false, message: "No encontrado en padrón DGII" });
            }
          } catch (e) {
            if (!active) return;
            setClientRncFeedback({ success: false, message: "Error de conexión con DGII" });
          } finally {
            if (active) setVerifyingClientRnc(false);
          }
        };
        lookup();
        return () => { active = false; };
      } else {
        setClientRncFeedback({ success: false, message: "RNC/Cédula inválido (checksum)" });
      }
    } else {
      setClientRncFeedback(null);
    }
  }, [form.tax_id, dialogOpen]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getClients();
      setClients(data);
    } catch (err: any) {
      toast.error("Error al cargar clientes: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const openCreateDialog = () => {
    setIsEdit(false);
    setSelectedClientId(null);
    setForm({ name: "", tax_id: "", phone: "", email: "", address: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setIsEdit(true);
    setSelectedClientId(client.id);
    setForm({
      name: client.name,
      tax_id: client.tax_id,
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre/razón social es obligatorio");
      return;
    }

    try {
      setSubmitting(true);
      if (isEdit && selectedClientId) {
        await billingApi.updateClient(selectedClientId, form);
        toast.success("Cliente actualizado exitosamente");
      } else {
        await billingApi.createClient(form);
        toast.success("Cliente registrado exitosamente");
      }
      setDialogOpen(false);
      fetchClients();
    } catch (err: any) {
      toast.error("Error al guardar cliente: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Está seguro que desea eliminar al cliente "${name}"?`)) return;

    try {
      await billingApi.deleteClient(id);
      toast.success("Cliente eliminado exitosamente");
      fetchClients();
    } catch (err: any) {
      toast.error("Error al eliminar cliente: " + (err.message || "Error desconocido"));
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Clientes
          </h2>
          <p className="text-sm text-muted-foreground">
            Directorio de receptores y empresas autorizadas para emisión de facturas.
          </p>
        </div>
        <div>
          <Button
            onClick={openCreateDialog}
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3"
          >
            <UserPlus className="size-3.5" />
            Registrar Cliente
          </Button>
        </div>
      </div>

      <Card className="border border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Directorio de Clientes</CardTitle>
          <CardDescription className="text-xs">
            Lista de clientes registrados con RNC/Cédula y datos de contacto.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <UserPlus className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                No hay clientes registrados en esta organización.
              </p>
              <Button size="xs" variant="outline" className="h-7 text-[11px] mt-3" onClick={openCreateDialog}>
                Registrar primer cliente
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nombre / Razón Social</TableHead>
                    <TableHead className="text-xs">RNC / Cédula</TableHead>
                    <TableHead className="text-xs">Contacto</TableHead>
                    <TableHead className="text-xs">Dirección</TableHead>
                    <TableHead className="text-xs text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-semibold text-xs py-3">{client.name}</TableCell>
                      <TableCell className="font-mono text-xs py-3">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Hash className="size-3 text-primary" />
                          {client.tax_id}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-3 space-y-0.5">
                        {client.email && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="size-3 text-primary" />
                            <span>{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="size-3 text-emerald-500" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">
                        {client.address ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="size-3 text-rose-500 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{client.address}</span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            className="h-7 text-[11px] border-border/80 text-foreground hover:bg-muted rounded-md px-2"
                            size="xs"
                            onClick={() => openEditDialog(client)}
                          >
                            <Edit2 className="size-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            className="h-7 text-[11px] border-border/80 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500 rounded-md px-2"
                            size="xs"
                            onClick={() => handleDelete(client.id, client.name)}
                          >
                            <Trash2 className="size-3 mr-1" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border border-border bg-card/95 backdrop-blur-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">
                {isEdit ? "Editar Cliente" : "Registrar Cliente"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ingrese los datos correspondientes para el registro fiscal del cliente.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="client-name" className="text-xs font-semibold text-muted-foreground">Nombre / Razón Social *</label>
                <input
                  id="client-name"
                  aria-label="Nombre o razón social"
                  type="text"
                  required
                  placeholder="Ej. Juan Perez S.R.L."
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="client-tax-id" className="text-xs font-semibold text-muted-foreground">RNC / Cédula</label>
                <input
                  id="client-tax-id"
                  aria-label="RNC o cédula"
                  type="text"
                  placeholder="Ej. 132-10912-2"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  value={form.tax_id}
                  onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                />
                {verifyingClientRnc && (
                  <p className="text-[10px] text-sky-400 flex items-center gap-1.5 animate-pulse mt-0.5">
                    <Loader2 className="size-3 animate-spin" />
                    Buscando RNC en DGII...
                  </p>
                )}
                {clientRncFeedback && !verifyingClientRnc && (
                  <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${
                    clientRncFeedback.success ? "text-emerald-500" : "text-amber-500"
                  }`}>
                    {clientRncFeedback.success ? (
                      <>
                        <svg className="size-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 4.5 8.5 10 3" />
                        </svg>
                        <span>Verificado: <strong>{clientRncFeedback.name}</strong></span>
                      </>
                    ) : (
                      <>
                        <span className="shrink-0 text-[10px]">⚠</span>
                        <span>{clientRncFeedback.message}</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="client-phone" className="text-xs font-semibold text-muted-foreground">Teléfono</label>
                  <input
                    id="client-phone"
                    aria-label="Teléfono"
                    type="text"
                    placeholder="Ej. 809-555-1234"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="client-email" className="text-xs font-semibold text-muted-foreground">Email</label>
                  <input
                    id="client-email"
                    aria-label="Correo electrónico"
                    type="email"
                    placeholder="Ej. juan@correo.com"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="client-address" className="text-xs font-semibold text-muted-foreground">Dirección Fiscal</label>
                <textarea
                  id="client-address"
                  aria-label="Dirección fiscal"
                  placeholder="Ej. Av. Winston Churchill, Santo Domingo"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs rounded-md border-border/80 text-foreground hover:bg-muted"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                {isEdit ? "Guardar Cambios" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
