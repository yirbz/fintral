"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Search, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { billingApi, type Client } from "@/lib/api/billing";
import { dgiiService, type NameSearchResult } from "@/lib/services/dgii";
import { consultCedulaAction, consultRncAction } from "@/app/actions/dgii";
import { toast } from "sonner";

interface CustomerSearchProps {
  value: { id?: string; name: string; rnc: string; address?: string; phone?: string; email?: string };
  onChange: (customer: { id?: string; name: string; rnc: string; address?: string; phone?: string; email?: string }) => void;
  disabled?: boolean;
}

function formatRnc(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 1)}-${digits.slice(-1)}`;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function CustomerSearch({ value, onChange, disabled }: CustomerSearchProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRnc, setCreateRnc] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createAddress, setCreateAddress] = useState("");

  const { data: clientsData, isLoading } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: billingApi.getClients,
  });

  const clients = clientsData ?? [];

  const selectedClient = clients.find((c) => c.id === value.id);

  const cleanCreateRnc = useMemo(() => createRnc.replace(/[^0-9]/g, ""), [createRnc]);

  const existingMatch = useMemo(() => {
    if (!cleanCreateRnc || cleanCreateRnc.length < 9) return null;
    return clients.find((c) => c.tax_id === cleanCreateRnc) ?? null;
  }, [cleanCreateRnc, clients]);

  const [dgiiLoading, setDgiiLoading] = useState(false);
  const [dgiiResult, setDgiiResult] = useState<{ name: string } | null>(null);
  const [dgiiNotFound, setDgiiNotFound] = useState(false);
  const createNameRef = useRef(createName);
  const autoFilledRnc = useRef("");

  const [searchQuery, setSearchQuery] = useState("");
  const [dgiiSearchResults, setDgiiSearchResults] = useState<NameSearchResult[]>([]);
  const [dgiiSearchLoading, setDgiiSearchLoading] = useState(false);

  useEffect(() => {
    createNameRef.current = createName;
  }, [createName]);

  useEffect(() => {
    if (!showCreate) autoFilledRnc.current = "";
  }, [showCreate]);

  useEffect(() => {
    if (existingMatch || !cleanCreateRnc || (cleanCreateRnc.length !== 9 && cleanCreateRnc.length !== 11)) {
      setDgiiResult(null);
      setDgiiLoading(false);
      setDgiiNotFound(false);
      return;
    }
    if (!dgiiService.isValidRNC(cleanCreateRnc)) {
      setDgiiResult(null);
      setDgiiLoading(false);
      setDgiiNotFound(false);
      return;
    }
    let active = true;
    setDgiiLoading(true);
    setDgiiNotFound(false);
    const timer = setTimeout(async () => {
      try {
        let data: { name: string } | null = null;
        if (cleanCreateRnc.length === 9) {
          data = await consultRncAction(cleanCreateRnc);
        } else {
          const citizen = await consultCedulaAction(cleanCreateRnc);
          if (citizen?.found && citizen.name) {
            data = { name: citizen.name };
          }
        }
        if (!active) return;
        if (data?.name) {
          setDgiiResult(data);
          setDgiiNotFound(false);
          if (autoFilledRnc.current !== cleanCreateRnc && !createNameRef.current.trim()) {
            autoFilledRnc.current = cleanCreateRnc;
            setCreateName(data.name);
          }
        } else {
          setDgiiResult(null);
          setDgiiNotFound(true);
        }
      } catch {
        if (active) setDgiiResult(null);
      } finally {
        if (active) setDgiiLoading(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cleanCreateRnc, existingMatch]);

  // DGII name search when typing in the search bar
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setDgiiSearchResults([]);
      setDgiiSearchLoading(false);
      return;
    }
    let active = true;
    setDgiiSearchLoading(true);
    const timer = setTimeout(async () => {
      const results = await dgiiService.searchByName(q);
      if (!active) return;
      setDgiiSearchResults(results);
      setDgiiSearchLoading(false);
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; tax_id: string; phone?: string; email?: string; address?: string }) =>
      billingApi.createClient(data),
    onSuccess: (client) => {
      onChange({
        id: client.id,
        name: client.name,
        rnc: client.tax_id ?? "",
        address: client.address ?? undefined,
        phone: client.phone ?? undefined,
        email: client.email ?? undefined,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateRnc("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateAddress("");
      toast.success("Cliente registrado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["billing-clients"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al registrar cliente");
    },
  });

  const handleSelectDgiiResult = (result: NameSearchResult) => {
    const existing = clients.find((c) => c.tax_id === result.rnc.replace(/[^0-9]/g, ""));
    if (existing) {
      handleSelect(existing);
      return;
    }
    createMutation.mutate({
      name: result.name,
      tax_id: result.rnc.replace(/[^0-9]/g, ""),
    });
  };

  const handleSelect = (client: Client) => {
    onChange({
      id: client.id,
      name: client.name,
      rnc: client.tax_id ?? "",
      address: client.address ?? undefined,
      phone: client.phone ?? undefined,
      email: client.email ?? undefined,
    });
    setOpen(false);
  };

  const handleUseExisting = () => {
    if (!existingMatch) return;
    handleSelect(existingMatch);
    setShowCreate(false);
    setCreateName("");
    setCreateRnc("");
    setCreatePhone("");
    setCreateEmail("");
    setCreateAddress("");
  };

  const handleCreate = () => {
    if (!createName || !cleanCreateRnc || cleanCreateRnc.length < 9) return;
    if (existingMatch) {
      handleUseExisting();
      return;
    }
    createMutation.mutate({
      name: createName,
      tax_id: cleanCreateRnc,
      phone: formatPhone(createPhone).replace(/[^0-9]/g, "") || undefined,
      email: createEmail || undefined,
      address: createAddress || undefined,
    });
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls="customer-search-listbox"
            disabled={disabled}
            className="w-full justify-between h-9 text-sm"
          >
            {selectedClient ? (
              <span className="flex items-center gap-2 truncate">
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedClient.name}</span>
                <span className="text-muted-foreground text-xs shrink-0">
                  {selectedClient.tax_id}
                </span>
              </span>
            ) : value.name ? (
              <span className="flex items-center gap-2 truncate">
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{value.name}</span>
                {value.rnc && <span className="text-muted-foreground text-xs shrink-0 font-mono">{formatRnc(value.rnc)}</span>}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Search className="size-3.5" />
                Buscar o seleccionar cliente...
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command id="customer-search-listbox">
            <CommandInput
              placeholder="Buscar cliente por nombre o RNC..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery.trim().length >= 3 && dgiiSearchLoading
                      ? "Buscando en DGII..."
                      : "No se encontraron clientes"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setShowCreate(true);
                    }}
                  >
                    <Plus className="size-3.5 mr-1" />
                    Crear nuevo cliente
                  </Button>
                </div>
              </CommandEmpty>
              {clients.length > 0 && (
                <CommandGroup heading="Clientes existentes">
                  {clients.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={`${client.name} ${client.tax_id ?? ""} ${client.email ?? ""}`}
                      onSelect={() => handleSelect(client)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-3.5",
                          value.id === client.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">{client.name}</span>
                        {client.tax_id && (
                          <span className="text-xs text-muted-foreground">{client.tax_id}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {dgiiSearchLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Buscando en DGII...</span>
                </div>
              )}
              {dgiiSearchResults.length > 0 && (
                <CommandGroup heading="Padrón DGII">
                  {dgiiSearchResults.map((result) => (
                    <CommandItem
                      key={result.rnc}
                      value={`${result.name} ${result.rnc}`}
                      onSelect={() => handleSelectDgiiResult(result)}
                    >
                      <Search className="mr-2 size-3.5 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm">{result.name}</span>
                        <span className="text-xs text-muted-foreground">{result.rnc}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => {
                    setOpen(false);
                    setShowCreate(true);
                  }}
                >
                  <Plus className="mr-2 size-3.5" />
                  Crear nuevo cliente
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showCreate && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Nuevo cliente</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setShowCreate(false)}>
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nombre o Razón Social *</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Nombre del cliente"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">RNC / Cédula *</Label>
              <Input
                value={formatRnc(createRnc)}
                onChange={(e) => {
                  setCreateRnc(e.target.value.replace(/[^0-9]/g, "").slice(0, 11));
                }}
                placeholder="XXX-XXXXXX-X"
                className="h-8 text-sm font-mono"
                maxLength={13}
              />
              <p className="text-[10px] text-muted-foreground">9 dígitos (RNC) o 11 dígitos (cédula)</p>
              {existingMatch && (
                <p className="text-[10px] text-sky-600 flex items-center gap-1 mt-0.5">
                  <Check className="size-3 shrink-0" />
                  Ya existe: <strong>{existingMatch.name}</strong>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 text-[10px] underline ml-1"
                    onClick={handleUseExisting}
                  >
                    Usar este
                  </Button>
                </p>
              )}
              {dgiiLoading && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Loader2 className="size-3 animate-spin" />
                  Consultando DGII...
                </p>
              )}
              {dgiiResult && !existingMatch && (
                <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                  <Check className="size-3 shrink-0" />
                  Verificado: <strong>{dgiiResult.name}</strong>
                </p>
              )}
              {dgiiNotFound && !existingMatch && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                  <span className="text-[10px]">⚠</span>
                  <span>No encontrado en padrón DGII</span>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={formatPhone(createPhone)}
                onChange={(e) => setCreatePhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="809-000-0000"
                className="h-8 text-sm font-mono"
                maxLength={12}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Dirección</Label>
              <Input
                value={createAddress}
                onChange={(e) => setCreateAddress(e.target.value)}
                placeholder="Dirección fiscal"
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            disabled={!createName || (!cleanCreateRnc || cleanCreateRnc.length < 9) || createMutation.isPending}
            onClick={handleCreate}
          >
            {createMutation.isPending ? (
              <><Loader2 className="size-3 animate-spin mr-1" /> Registrando...</>
            ) : existingMatch ? (
              "Usar cliente existente"
            ) : (
              "Registrar y usar cliente"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
