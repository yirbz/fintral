"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { FileText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { listInvoices } from "@/lib/api/invoices"
import { formatCurrency } from "@/lib/utils/date"

export function GlobalSearch({
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [search, setSearch] = useState("")

  const open = externalOpen ?? internalOpen
  const setOpen = externalOnOpenChange ?? setInternalOpen

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, setOpen])

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", search],
    queryFn: () => listInvoices({ search: search || undefined }),
    enabled: search.length >= 2,
    staleTime: 300_000,
  })

  const invoices = data?.invoices ?? []

  const onSelect = useCallback(
    (id: string) => {
      setOpen(false)
      setSearch("")
      router.push(`/dashboard/invoices/${id}`)
    },
    [router, setOpen]
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar">
      <CommandInput
        placeholder="Buscar facturas, proveedores, NCF..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {search.length < 2
            ? "Escribe al menos 2 caracteres..."
            : isFetching
              ? "Buscando..."
              : "Sin resultados."}
        </CommandEmpty>
        {invoices.length > 0 && (
          <CommandGroup heading="Facturas">
            {invoices.map((inv) => (
              <CommandItem
                key={inv.id}
                value={`${inv.vendor_name} ${inv.invoice_number} ${inv.description}`}
                onSelect={() => onSelect(inv.id)}
              >
                <FileText className="size-4" />
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {inv.vendor_name || "Sin proveedor"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {inv.invoice_number || "Sin NCF"}
                    </span>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                    {inv.total_amount != null
                      ? formatCurrency(inv.total_amount, inv.currency || "DOP")
                      : ""}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
