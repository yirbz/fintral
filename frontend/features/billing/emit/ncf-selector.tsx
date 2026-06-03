"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileText, Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { billingApi, type InvoiceTypeInfo } from "@/lib/api/billing";

const ECF_TYPE_LABELS: Record<number, string> = {
  31: "e-CF Fiscal",
  32: "e-CF Consumo",
  33: "Nota de Débito",
  34: "Nota de Crédito",
  43: "Gastos Menores",
  44: "Regímenes Especiales",
  45: "Gubernamental",
};

interface NcfSelectorProps {
  value: number | null;
  onChange: (ecfType: number) => void;
  disabled?: boolean;
  filterQuickMode?: boolean;
  electronicOnly?: boolean;
}

export function NcfSelector({ value, onChange, disabled, filterQuickMode, electronicOnly }: NcfSelectorProps) {
  const { data: typesData, isLoading, error } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: billingApi.getInvoiceTypes,
  });

  const types = (typesData ?? []).filter((t) => {
    if (filterQuickMode && !t.supports_quick_mode) return false;
    if (electronicOnly && t.ecf_type < 31) return false;
    return true;
  });

  const selected = types.find((t) => t.ecf_type === value);

  if (error) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 border border-destructive/50 rounded-lg text-sm text-destructive">
        <AlertCircle className="size-3.5" />
        Error al cargar tipos de comprobante
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={value?.toString() ?? ""}
        onValueChange={(v) => onChange(parseInt(v))}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="h-9 text-sm">
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Cargando...
            </span>
          ) : (
            <SelectValue placeholder="Seleccionar tipo de comprobante">
              {selected && (
                <span className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>{selected.label}</span>
                  <span className="text-xs text-muted-foreground">({selected.code})</span>
                </span>
              )}
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <div className="px-3 py-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : types.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center space-y-2">
              <p>No hay tipos de comprobante disponibles</p>
              <p className="text-xs text-muted-foreground">
                Debe cargar secuencias e-CF en Facturación → Secuencias
              </p>
            </div>
          ) : (
            types.map((type) => (
              <SelectItem key={type.ecf_type} value={type.ecf_type.toString()} disabled={!type.is_available}>
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{type.label} <span className="text-muted-foreground">({type.code})</span></span>
                      <span className="text-xs text-muted-foreground truncate">
                        {type.description}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {type.requires_certification ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertCircle className="size-3.5 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Requiere certificación DGII</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : type.is_available ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="size-2.5 mr-0.5" />
                        {type.sequence_current ?? 0}/{type.sequence_end ?? 0}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                        No disponible
                      </Badge>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {selected && !selected.has_active_sequence && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="size-3" />
          No hay una secuencia activa para este tipo de comprobante
        </p>
      )}
    </div>
  );
}
