"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { billingApi, Client, ClientCreate } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Edit2, Trash2, Mail, Phone, MapPin, Hash, Loader2, Building2, Search, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { dgiiService, NameSearchResult } from "@/lib/services/dgii";
import { consultRncAction, searchByNameAction } from "@/app/actions/dgii";

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
  const [orgRnc, setOrgRnc] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<NameSearchResult[]>([]);
  const [searchingName, setSearchingName] = useState(false);
  const [showNameResults, setShowNameResults] = useState(false);
  const [nameSearchError, setNameSearchError] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowNameResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNameSearch = useCallback((query: string) => {
    setNameQuery(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 4) {
      setNameResults([]);
      setShowNameResults(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingName(true);
      setNameSearchError(false);
      setShowNameResults(true);
      try {
        const results = await searchByNameAction(query.trim());
        setNameResults(results);
        if (results.length === 0) setNameSearchError(true);
      } catch (e) {
        console.error("Error searching DGII by name:", e);
        setNameResults([]);
        setNameSearchError(true);
      } finally {
        setSearchingName(false);
      }
    }, 600);
  }, []);

  const handleSelectNameResult = (result: NameSearchResult) => {
    const cleanRnc = result.rnc.replace(/[^0-9]/g, "");
    setIsEdit(false);
    setSelectedClientId(null);
    setForm({
      name: result.name,
      tax_id: cleanRnc,
      phone: "",
      email: "",
      address: "",
    });
    setShowNameResults(false);
    setNameQuery("");
    setNameResults([]);
    setDialogOpen(true);
  };

  useEffect(() => {
    billingApi.getOrganization().then((org) => {
      if (org?.tax_id) setOrgRnc(dgiiService.cleanRNC(org.tax_id));
    }).catch(() => {});
  }, []);

  const localDuplicate = useMemo(() => {
    if (isEdit || !form.tax_id) return null;
    const clean = dgiiService.cleanRNC(form.tax_id);
    if (!clean || clean.length < 9) return null;
    return clients.find((c) => c.tax_id === clean && c.id !== selectedClientId) ?? null;
  }, [form.tax_id, clients, isEdit, selectedClientId]);

  const isSelfRnc = useMemo(() => {
    if (!form.tax_id || !orgRnc) return false;
    const clean = dgiiService.cleanRNC(form.tax_id);
    return clean === orgRnc;
  }, [form.tax_id, orgRnc]);

  useEffect(() => {
    if (!dialogOpen || !localDuplicate) return;
    setForm({
      name: localDuplicate.name,
      tax_id: localDuplicate.tax_id,
      phone: localDuplicate.phone || "",
      email: localDuplicate.email || "",
      address: localDuplicate.address || "",
    });
    setIsEdit(true);
    setSelectedClientId(localDuplicate.id);
    setClientRncFeedback({ success: true, name: localDuplicate.name, message: "registro_duplicado" });
    setVerifyingClientRnc(false);
  }, [localDuplicate, dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) {
      setClientRncFeedback(null);
      setVerifyingClientRnc(false);
      return;
    }
    if (isEdit) return;
    const clean = dgiiService.cleanRNC(form.tax_id || "");
    if (!clean) {
      setClientRncFeedback(null);
      setVerifyingClientRnc(false);
      return;
    }
    if (isSelfRnc) {
      setClientRncFeedback({ success: false, message: "No puedes registrar tu propio RNC como cliente" });
      setVerifyingClientRnc(false);
      return;
    }
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
  }, [form.tax_id, dialogOpen, isSelfRnc]);

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
    if (isSelfRnc) {
      toast.error("No puedes registrar tu propio RNC como cliente");
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

      <div ref={searchRef} className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar en DGII por razón social..."
              value={nameQuery}
              onChange={(e) => handleNameSearch(e.target.value)}
              onFocus={() => nameResults.length > 0 && setShowNameResults(true)}
              className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
            />
            {searchingName && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground/60" />
            )}
            {nameQuery.trim().length >= 4 && !searchingName && nameResults.length === 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">No encontrado</span>
            )}
          </div>
        </div>

        {showNameResults && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border/50 bg-popover shadow-lg overflow-hidden">
            {searchingName ? (
              <div className="p-2 space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-3.5 shrink-0 rounded-full" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-36 rounded-full" />
                        <Skeleton className="h-3.5 w-12 rounded-full shrink-0" />
                      </div>
                      <Skeleton className="h-2.5 w-28 rounded-full" />
                    </div>
                    <Skeleton className="size-3 shrink-0 rounded" />
                  </div>
                ))}
              </div>
            ) : nameResults.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {nameResults.map((result) => (
                  <button
                    key={result.rnc}
                    type="button"
                    onClick={() => handleSelectNameResult(result)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors border-b border-border/30 last:border-0"
                  >
                    <ExternalLink className="size-3.5 shrink-0 text-primary/60" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{result.name}</span>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          result.status === "ACTIVO" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                        }`}>
                          {result.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{result.rnc}</span>
                        {result.tradeName && (
                          <span className="text-[10px] text-muted-foreground/60 truncate">{result.tradeName}</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="size-3 -rotate-90 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
              </div>
            ) : nameSearchError ? (
              <div className="px-4 py-5 text-center">
                <p className="text-xs text-muted-foreground">No se encontraron contribuyentes en DGII con ese nombre.</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">Prueba con otro término o verifica el RNC manualmente.</p>
              </div>
            ) : null}
          </div>
        )}
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
                {isSelfRnc && (
                  <p className="text-[10px] text-rose-500 flex items-center gap-1 mt-0.5">
                    <Building2 className="size-3 shrink-0" />
                    <span>No puedes registrar tu propio RNC como cliente</span>
                  </p>
                )}
                {clientRncFeedback?.message === "registro_duplicado" && (
                  <p className="text-[10px] text-sky-600 flex items-center gap-1 mt-0.5">
                    <svg className="size-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="4.5" />
                      <polyline points="3.5 6 5.5 8 8.5 3.5" />
                    </svg>
                    <span>Registro existente: editando datos de <strong>{clientRncFeedback.name}</strong></span>
                  </p>
                )}
                {clientRncFeedback && !verifyingClientRnc && !isSelfRnc && clientRncFeedback.message !== "registro_duplicado" && (
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
