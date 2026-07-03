"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Package, Search } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { billingApi, type Product } from "@/lib/api/billing";

interface ProductSearchProps {
  onSelect: (product: Product) => void;
  disabled?: boolean;
}

export function ProductSearch({ onSelect, disabled }: ProductSearchProps) {
  const [open, setOpen] = useState(false);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ["billing-products"],
    queryFn: billingApi.getProducts,
  });

  const products = productsData ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls="product-search-listbox"
          disabled={disabled}
          size="sm"
          className="w-full justify-between h-8 text-xs"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="size-3.5" />
            Agregar producto o servicio...
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command id="product-search-listbox">
          <CommandInput placeholder="Buscar producto..." />
          <CommandList>
            <CommandEmpty className="py-4 text-sm text-muted-foreground text-center">
              No se encontraron productos
            </CommandEmpty>
            <CommandGroup heading="Productos">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                products.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={`${product.name} ${product.internal_code ?? ""}`}
                    onSelect={() => {
                      onSelect(product);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm">{product.name}</span>
                        {product.internal_code && (
                          <span className="text-xs text-muted-foreground">
                            Cód: {product.internal_code}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-mono tabular-nums">
                        ${product.price.toFixed(2)}
                      </span>
                    </div>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
