"use client";

import Link from "next/link";
import {
  FileText,
  Edit3,
  Receipt,
  ArrowUpRight,
  FileMinus,
  Plus,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BillingInvoice } from "@/lib/api/billing";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);

interface CorrectionSectionProps {
  invoices: BillingInvoice[];
  isEcfAuthorized: boolean;
}

export function CorrectionSection({
  invoices,
  isEcfAuthorized,
}: CorrectionSectionProps) {
  // Show last 5 verified invoices that can be corrected
  const correctable = invoices
    .filter((inv) => inv.status === "verified")
    .slice(0, 5);

  if (correctable.length === 0) return null;

  return (
    <Card className="border border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Edit3 className="size-3.5 text-muted-foreground" />
              Corregir Facturas
            </CardTitle>
            <CardDescription className="text-xs">
              {isEcfAuthorized
                ? "Emite una Nota de Crédito (E34) o Nota de Débito (E33) para corregir facturas ya timbradas"
                : "Corrige facturas emitidas del período actual"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {correctable.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                <Receipt className="size-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {inv.invoice_number || "Borrador"}
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate">
                  {inv.client?.name || "Consumidor Final"} ·{" "}
                  {formatCurrency(inv.total_amount)}
                  {inv.ecf_type && ` · E${inv.ecf_type}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isEcfAuthorized ? (
                <>
                  {/* Nota de Crédito */}
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 text-[10px] border-orange-500/20 text-orange-600 hover:bg-orange-500/10 hover:text-orange-500 gap-1 px-2"
                    onClick={() => {
                      const params = new URLSearchParams({
                        invoiceId: inv.id,
                        action: "credit_note",
                      });
                      window.location.href = `/billing/emit?${params}`;
                    }}
                  >
                    <FileMinus className="size-3" />
                    N. Crédito
                  </Button>
                  {/* Nota de Débito */}
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 text-[10px] border-red-500/20 text-red-600 hover:bg-red-500/10 hover:text-red-500 gap-1 px-2"
                    onClick={() => {
                      const params = new URLSearchParams({
                        invoiceId: inv.id,
                        action: "debit_note",
                      });
                      window.location.href = `/billing/emit?${params}`;
                    }}
                  >
                    <Plus className="size-3" />
                    N. Débito
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => {
                    const params = new URLSearchParams({
                      invoiceId: inv.id,
                      action: "correct",
                    });
                    window.location.href = `/billing/emit?${params}`;
                  }}
                >
                  <Edit3 className="size-3" />
                  Corregir
                </Button>
              )}
            </div>
          </div>
        ))}

        {correctable.length > 0 && (
          <div className="pt-1">
            <Button variant="link" size="sm" className="h-7 text-[11px]" asChild>
              <Link href="/billing/emit">
                <ArrowUpRight className="size-3 mr-1" />
                Ver todas las opciones de emisión
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
