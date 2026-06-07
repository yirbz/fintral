"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useCallback } from "react"
import { Search, FileText, Loader2, ArrowRight } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { listInvoices } from "@/lib/api/invoices"
import { formatCurrency } from "@/lib/utils/date"
import type { Invoice } from "@/lib/types"

export function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = searchParams.get("q") ?? searchParams.get("search") ?? ""
  const [query, setQuery] = useState(initial)

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => listInvoices({ search: query || undefined }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  })

  const invoices = data?.invoices ?? []
  const total = data?.total ?? 0

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (query.trim().length >= 2) {
        router.replace(`/dashboard/search?q=${encodeURIComponent(query.trim())}`)
      }
    },
    [query, router]
  )

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 pb-10 w-full max-w-5xl mx-auto">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 w-full rounded-xl border-border bg-muted/50 pl-10 pr-4 text-sm focus:border-ring focus:bg-background"
              placeholder="Buscar facturas, proveedores, NCF..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </form>
        </CardContent>
      </Card>

      {query.length >= 2 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Buscando...
              </span>
            ) : (
              <span>
                {total} resultado{total !== 1 ? "s" : ""} para <strong className="text-foreground">{query}</strong>
              </span>
            )}
          </p>
        </div>
      )}

      {!isFetching && query.length >= 2 && invoices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <Search className="size-8 text-primary/40" />
          </div>
          <p className="text-sm text-muted-foreground">Sin resultados para <strong>{query}</strong></p>
        </div>
      )}

      {query.length >= 2 && invoices.length > 0 && (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => (
            <SearchResultRow key={inv.id} invoice={inv} />
          ))}
        </div>
      )}

      {query.length < 2 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <Search className="size-8 text-primary/40" />
          </div>
          <p className="text-sm text-muted-foreground">Escribe al menos 2 caracteres para buscar</p>
        </div>
      )}
    </div>
  )
}

function SearchResultRow({ invoice }: { invoice: Invoice }) {
  const router = useRouter()

  const amount = formatCurrency(invoice.total_amount, invoice.currency || "DOP")

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <FileText className="size-4 text-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {invoice.vendor_name || "Sin proveedor"}
          </span>
          {invoice.transaction_type && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {invoice.transaction_type === "income" ? "Venta" : "Compra"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {invoice.invoice_number && (
            <span className="font-mono">{invoice.invoice_number}</span>
          )}
          {invoice.invoice_date && (
            <>
              <span className="text-border">·</span>
              <span>{new Date(invoice.invoice_date).toLocaleDateString("es-DO")}</span>
            </>
          )}
          {invoice.category && (
            <>
              <span className="text-border">·</span>
              <span>{invoice.category}</span>
            </>
          )}
        </div>
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <span className="text-sm font-semibold tabular-nums text-foreground">{amount}</span>
        <ArrowRight className="size-4 text-muted-foreground/40 transition-all group-hover:text-primary group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}
