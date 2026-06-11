"use client";

import { Info, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EmitLineItem } from "@/lib/api/billing";

interface LineItemTableProps {
  items: EmitLineItem[];
  onChange: (items: EmitLineItem[]) => void;
  readOnly?: boolean;
  ecfType?: number | null;
}

const EXEMPT_TYPES = new Set([43, 44]);

const TAX_OPTIONS = [
  { value: 18, label: "18 %" },
  { value: 16, label: "16 %" },
  { value: 0, label: "0 %" },
  { value: -1, label: "Exento" },
];

function formatCurrency(amount: number): string {
  return `RD$ ${amount.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Col({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-2.5 text-muted-foreground/50 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          {description}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function LineItemTable({ items, onChange, readOnly, ecfType }: LineItemTableProps) {
  const isExemptType = ecfType !== null && ecfType !== undefined && EXEMPT_TYPES.has(ecfType);

  const updateItem = (index: number, field: keyof EmitLineItem, value: string | number) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [field]: value };
    });
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price * ((item.discount_rate ?? 0) / 100),
    0
  );
  const taxableAmount = subtotal - discountTotal;
  const itbisTotal = items.reduce(
    (sum, item) => {
      const net = item.quantity * item.unit_price * (1 - (item.discount_rate ?? 0) / 100);
      if (isExemptType) return sum;
      return sum + net * ((item.tax_rate ?? 18) / 100);
    },
    0
  );
  const total = taxableAmount + itbisTotal;

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No hay productos o servicios agregados. Use el botón superior para agregar items.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="hidden md:grid grid-cols-[1fr_60px_80px_60px_70px_90px_24px] gap-2 items-center px-1 py-1">
        <Col label="Descripción" description="Nombre del producto o servicio" />
        <Col label="Cant" description="Cantidad de unidades" className="justify-center" />
        <Col label="Precio" description="Precio unitario sin ITBIS" className="justify-end" />
        <Col label="Dto %" description="Porcentaje de descuento" className="justify-end" />
        <Col label="ITBIS" description="Tasa de ITBIS aplicada" className="justify-end" />
        <Col label="Total" description="Total por línea (neto + ITBIS)" className="justify-end" />
      </div>

      {items.map((item, index) => {
        const gross = item.quantity * item.unit_price;
        const discountAmt = gross * ((item.discount_rate ?? 0) / 100);
        const net = gross - discountAmt;
        const effectiveTaxRate = isExemptType ? 0 : (item.tax_rate ?? 18);
        const taxAmt = net * (effectiveTaxRate / 100);
        const lineTotal = net + taxAmt;

        const handleTaxChange = (value: string) => {
          const numVal = parseInt(value);
          if (numVal === -1) {
            updateItem(index, "tax_rate", 0);
          } else {
            updateItem(index, "tax_rate", numVal);
          }
        };

        const taxDisplayValue = isExemptType ? "-1" : (item.tax_rate ?? 18).toString();

        return (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-[1fr_60px_80px_60px_70px_90px_24px] gap-1.5 md:gap-2 items-center py-2 md:py-1.5 border-b border-border/50 last:border-0 text-sm"
          >
            {/* Description */}
            <div className="min-w-0 md:col-span-1">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase">Descripción</span>
              {readOnly ? (
                <span className="text-sm truncate block">{item.description}</span>
              ) : (
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder="Nombre del producto o servicio"
                  className="h-8 text-xs"
                  aria-label="Descripción del producto"
                />
              )}
            </div>

            {/* Quantity */}
            <div className="flex md:block items-center gap-2">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">Cant</span>
              {readOnly ? (
                <span className="text-center block text-xs tabular-nums">{item.quantity}</span>
              ) : (
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", Math.max(0.01, parseFloat(e.target.value) || 0))}
                  min={0.01}
                  max={999999}
                  step={1}
                  className="h-8 text-xs text-center"
                  aria-label="Cantidad"
                />
              )}
            </div>

            {/* Unit Price */}
            <div className="flex md:block items-center gap-2">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">Precio</span>
              {readOnly ? (
                <span className="text-right block text-xs tabular-nums">{item.unit_price.toFixed(2)}</span>
              ) : (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">RD$</span>
                  <Input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, "unit_price", Math.max(0, parseFloat(e.target.value) || 0))}
                    min={0}
                    max={999999999}
                    step={0.01}
                    className="h-8 text-xs text-right pl-8"
                    aria-label="Precio unitario"
                  />
                </div>
              )}
            </div>

            {/* Discount % */}
            <div className="flex md:block items-center gap-2">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">Dto %</span>
              {readOnly ? (
                <span className="text-right block text-xs tabular-nums">{(item.discount_rate ?? 0).toFixed(1)}%</span>
              ) : (
                <div className="relative">
                  <Input
                    type="number"
                    value={item.discount_rate ?? 0}
                    onChange={(e) => updateItem(index, "discount_rate", Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    min={0}
                    max={100}
                    step={0.1}
                    className="h-8 text-xs text-right pr-5"
                    aria-label="Porcentaje de descuento"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                </div>
              )}
            </div>

            {/* Tax Rate */}
            <div className="flex md:block items-center gap-2">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">ITBIS</span>
              {readOnly || isExemptType ? (
                <span className={cn(
                  "text-right block text-xs tabular-nums",
                  isExemptType && "text-amber-600 font-medium"
                )}>
                  {isExemptType ? "Exento" : `${effectiveTaxRate} %`}
                </span>
              ) : (
                <Select value={taxDisplayValue} onValueChange={handleTaxChange}>
                  <SelectTrigger className="h-8 text-xs text-right" aria-label="Tasa de ITBIS">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Line total */}
            <div className="flex md:block items-center gap-2">
              <span className="md:hidden text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">Total</span>
              <span className="text-right text-xs font-medium tabular-nums block">
                {formatCurrency(lineTotal)}
              </span>
            </div>

            {/* Delete */}
            <div className="flex justify-end md:justify-center">
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeItem(index)}
                  className="text-destructive hover:text-destructive size-7"
                  aria-label="Eliminar item"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Totals footer */}
      <div className="border-t border-border pt-2 mt-2 space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Descuentos</span>
            <span className="tabular-nums text-destructive">-{formatCurrency(discountTotal)}</span>
          </div>
        )}
        {isExemptType ? (
          <div className="flex justify-between text-xs text-amber-600 font-medium">
            <span>Exento</span>
            <span className="tabular-nums">{formatCurrency(taxableAmount)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ITBIS</span>
            <span className="tabular-nums">{formatCurrency(itbisTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
