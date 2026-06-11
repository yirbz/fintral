"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  SearchIcon,
  RotateCcwIcon,
  AlertCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  listReferenceData,
  getDomains,
  createReferenceData,
  updateReferenceData,
  deleteReferenceData,
  type ReferenceDataItem,
} from "@/lib/api/reference-data";

const DOMAIN_LABELS: Record<string, string> = {
  ncf_types: "Tipos de NCF/e-NCF",
  goods_services_types: "Tipos de bienes/servicios (DGII 606)",
  payment_methods: "Formas de pago",
  isr_retention_types: "Tipos de retención ISR",
  income_types: "Tipos de ingreso (DGII 607)",
  id_types: "Tipos de identificación",
  currencies: "Monedas",
  categories: "Categorías de gasto",
  report_statuses: "Estados de reporte DGII",
  transaction_types: "Tipos de transacción",
};

interface FieldErrors {
  code?: string;
  label_es?: string;
  domain?: string;
  general?: string;
}

function EditDialog({
  open,
  onOpenChange,
  item,
  onSave,
  domains,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Partial<ReferenceDataItem> | null;
  onSave: (data: Partial<ReferenceDataItem> & { domain: string; code: string; label_es: string }) => Promise<void>;
  domains: string[];
}) {
  const [domain, setDomain] = useState(item?.domain ?? domains[0] ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [label, setLabel] = useState(item?.label_es ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [sortOrder, setSortOrder] = useState(item?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const isNew = !item?.id;

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!code.trim()) errs.code = "El código es requerido";
    if (!label.trim()) errs.label_es = "La etiqueta es requerida";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      await onSave({
        ...(item?.id ? { id: item.id } : {}),
        domain,
        code: code.trim(),
        label_es: label.trim(),
        description: description.trim() || null,
        sort_order: sortOrder,
        is_active: isActive,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ code: "Ya existe un item con este código en el dominio" });
      } else {
        const msg = err instanceof Error ? err.message : "Error al guardar";
        setErrors({ general: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading">{isNew ? "Nuevo item" : "Editar item"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isNew ? "Agregar un nuevo valor al catálogo" : "Modificar los valores del catálogo"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {errors.general && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircleIcon className="size-3.5 shrink-0" />
              {errors.general}
            </div>
          )}
          {isNew && (
            <div className="grid gap-2">
              <Label>Dominio</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d} value={d}>{DOMAIN_LABELS[d] || d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>
                Código <span className="text-destructive">*</span>
              </Label>
              <Input
                value={code}
                onChange={(e) => { setCode(e.target.value); setErrors((p) => ({ ...p, code: undefined })); }}
                placeholder="ej: 01"
                aria-invalid={!!errors.code}
              />
              {errors.code && <p className="text-[10px] text-destructive">{errors.code}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Orden</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>
              Etiqueta <span className="text-destructive">*</span>
            </Label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label_es: undefined })); }}
              aria-invalid={!!errors.label_es}
            />
            {errors.label_es && <p className="text-[10px] text-destructive">{errors.label_es}</p>}
          </div>
          <div className="grid gap-2">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
            <Label htmlFor="is-active">Activo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActiveToggle({
  item,
  onToggle,
}: {
  item: ReferenceDataItem;
  onToggle: (item: ReferenceDataItem, newValue: boolean) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await onToggle(item, checked);
    } catch {
      // error toast is handled by the mutation
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex justify-center">
      <Switch
        checked={item.is_active}
        onCheckedChange={handleToggle}
        disabled={toggling}
        className={toggling ? "opacity-50" : ""}
      />
    </div>
  );
}

export function ReferenceDataPage() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<Partial<ReferenceDataItem> | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteConfirmRef = useRef<string | null>(null);

  const domainsQuery = useQuery({
    queryKey: ["refdata-domains"],
    queryFn: getDomains,
  });

  const domains = domainsQuery.data?.domains ?? [];

  const refdataQuery = useQuery({
    queryKey: ["refdata-items", selectedDomain],
    queryFn: () => listReferenceData(selectedDomain || undefined, true),
    enabled: !!selectedDomain,
  });

  const items = refdataQuery.data?.items ?? [];
  const filtered = search
    ? items.filter(
        (i) =>
          i.code.toLowerCase().includes(search.toLowerCase()) ||
          i.label_es.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["refdata-items"] });
  };

  const createMutation = useMutation({
    mutationFn: createReferenceData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refdata-items"] });
      queryClient.invalidateQueries({ queryKey: ["refdata-domains"] });
      toast.success("Item creado");
    },
    onError: (err: Error) => {
      throw err;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReferenceDataItem> }) =>
      updateReferenceData(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Item actualizado");
    },
    onError: (err: Error) => {
      throw err;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReferenceData,
    onSuccess: () => {
      invalidate();
      toast.success("Item eliminado");
    },
    onError: (err: Error) => {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar");
    },
  });

  const handleSave = async (data: Partial<ReferenceDataItem> & { domain: string; code: string; label_es: string }) => {
    if (data.id) {
      await updateMutation.mutateAsync({ id: data.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleToggleActive = async (item: ReferenceDataItem, newValue: boolean) => {
    await updateMutation.mutateAsync({
      id: item.id,
      data: { is_active: newValue },
    });
  };

  const handleEdit = (item: ReferenceDataItem) => {
    setEditItem(item);
    setEditOpen(true);
  };

  const handleDeleteConfirm = (item: ReferenceDataItem) => {
    deleteConfirmRef.current = item.id;
    setDeleting(item.id);
  };

  const handleDeleteActual = async () => {
    const id = deleteConfirmRef.current;
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
    } finally {
      setDeleting(null);
      deleteConfirmRef.current = null;
    }
  };

  const handleRefresh = () => {
    invalidate();
  };

  const hasActiveDeletes = items.some((i) => !i.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Datos de referencia</h1>
          <p className="text-sm text-muted-foreground">
            Catálogos DGII, monedas, categorías y tipos de comprobante
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RotateCcwIcon className="size-3.5 mr-1" />
            Recargar
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)} disabled={!selectedDomain}>
            <PlusIcon className="size-3.5 mr-1" />
            Nuevo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-72">
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar dominio..." />
            </SelectTrigger>
            <SelectContent>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>{DOMAIN_LABELS[d] || d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 max-w-xs">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o etiqueta..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {selectedDomain ? DOMAIN_LABELS[selectedDomain] || selectedDomain : "Selecciona un dominio"}
            {refdataQuery.data && (
              <span className="ml-2 text-muted-foreground font-normal">
                ({refdataQuery.data.total} items
                {hasActiveDeletes && (
                  <span className="text-muted-foreground/60">
                    , {items.filter((i) => !i.is_active).length} inactivos
                  </span>
                )}
                )
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {refdataQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !selectedDomain ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecciona un dominio para ver sus items
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search ? "Sin resultados" : "No hay items en este dominio"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Código</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead className="hidden md:table-cell">Descripción</TableHead>
                  <TableHead className="w-16 text-center">Orden</TableHead>
                  <TableHead className="w-20 text-center">Activo</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                    <TableCell className="font-medium">{item.label_es}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs truncate">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-center text-xs">{item.sort_order}</TableCell>
                    <TableCell className="text-center">
                      <ActiveToggle item={item} onToggle={handleToggleActive} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleEdit(item)}>
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => handleDeleteConfirm(item)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={editItem}
        onSave={handleSave}
        domains={domains}
      />

      <EditDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        item={null}
        onSave={handleSave}
        domains={domains}
      />

      <Dialog open={!!deleting} onOpenChange={(v) => { if (!v) { setDeleting(null); deleteConfirmRef.current = null; } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">Confirmar eliminación</DialogTitle>
            <DialogDescription className="text-xs">
              ¿Estás seguro de eliminar este item? Esta acción no se puede deshacer.
              {deleteConfirmRef.current && (
                <span className="mt-1 block font-medium text-foreground">
                  {items.find((i) => i.id === deleteConfirmRef.current)?.code} —{" "}
                  {items.find((i) => i.id === deleteConfirmRef.current)?.label_es}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setDeleting(null); deleteConfirmRef.current = null; }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteActual}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
