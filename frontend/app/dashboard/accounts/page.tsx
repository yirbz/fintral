"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Save,
  X,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PiggyBank,
  Wallet,
  Receipt,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

import { getBankAccounts, updateBankBalances, getBankAccountsSummary } from "@/lib/api/payments";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { BankAccount, Invoice } from "@/lib/types";

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

interface RecentInvoiceRowProps {
  inv: Invoice;
  type: "income" | "expense";
  formatCurrency: (v: number) => string;
}
function RecentInvoiceRow({ inv, type, formatCurrency }: RecentInvoiceRowProps) {
  const isIncome = type === "income";
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`shrink-0 size-6 rounded-full flex items-center justify-center ${isIncome ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
          {isIncome ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium truncate text-foreground">{inv.vendor_name || inv.invoice_number || "Sin nombre"}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {inv.invoice_number || "—"} {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("es-DO") : ""}
          </p>
        </div>
      </div>
      <span className={`text-[11px] font-semibold font-mono tabular-nums shrink-0 ${isIncome ? "text-emerald-600" : "text-red-600"}`}>
        {isIncome ? "+" : "-"}{formatCurrency(inv.total_amount || 0)}
      </span>
    </div>
  );
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const { formatCurrency } = useUserPreferences();

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["bank-accounts-summary"],
    queryFn: getBankAccountsSummary,
    refetchOnWindowFocus: true,
  });

  // For edit mode (legacy approach — local state over accounts list)
  const [isEditing, setIsEditing] = useState(false);
  const [editedBanks, setEditedBanks] = useState<Array<{ id?: string; name: string; balance: number }>>([]);

  const updateBanksMutation = useMutation({
    mutationFn: updateBankBalances,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["cxp-summary"] });
      queryClient.invalidateQueries({ queryKey: ["cxc-summary"] });
      toast.success("Saldos bancarios actualizados correctamente");
      setIsEditing(false);
    },
    onError: (err) => {
      toast.error(`Error al actualizar saldos: ${err instanceof Error ? err.message : "Error desconocido"}`);
    },
  });

  useEffect(() => {
    if (summary) {
      setEditedBanks(summary.accounts.map((acc) => ({ id: acc.id, name: acc.name, balance: acc.balance })));
    }
  }, [summary, isEditing]);

  const handleStartEdit = () => {
    setEditedBanks((summary?.accounts ?? []).map((b) => ({ id: b.id, name: b.name, balance: b.balance })));
    setIsEditing(true);
  };

  const handleAddBankRow = () => {
    setEditedBanks([...editedBanks, { name: "", balance: 0.0 }]);
  };

  const handleRemoveBankRow = (index: number) => {
    setEditedBanks(editedBanks.filter((_, i) => i !== index));
  };

  const handleUpdateBankField = (index: number, field: string, value: string | number) => {
    const next = editedBanks.map((b, i) => {
      if (i !== index) return b;
      return { ...b, [field]: field === "balance" ? Number(value) || 0 : value };
    });
    setEditedBanks(next);
  };

  const handleSave = () => {
    const validBanks = editedBanks.filter((b) => b.name.trim() !== "");
    updateBanksMutation.mutate(validBanks);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
        <div className="animate-pulse space-y-4">
          <div className="h-9 bg-muted rounded w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <TrendingDown className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">Error al cargar cuentas bancarias</p>
        <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Error del servidor"}</p>
      </div>
    );
  }

  const s = summary!;
  const bankList = s.accounts;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5">
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="size-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Contabilidad</p>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Cuentas Bancarias</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Administra tus disponibilidades y monitorea la salud financiera de tu organización.
            </p>
          </div>
          {!isEditing && (
            <Button size="sm" variant="outline" onClick={handleStartEdit} className="h-7 text-[11px] px-3 font-medium">
              Editar Cuentas
            </Button>
          )}
        </div>
      </div>

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border-border/80 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="size-3.5 text-primary" />
              </div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                Saldo Disponible
              </span>
            </div>
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {formatCurrency(s.total_balance)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {bankList.length} {bankList.length === 1 ? "cuenta" : "cuentas"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="size-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ArrowUpRight className="size-3.5 text-emerald-600" />
              </div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                Cuentas por Cobrar
              </span>
            </div>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-600">
              +{formatCurrency(s.total_ar)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {s.recent_ar.length} facturas pendientes
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="size-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ArrowDownRight className="size-3.5 text-red-600" />
              </div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                Cuentas por Pagar
              </span>
            </div>
            <p className="text-lg font-bold font-mono tabular-nums text-red-600">
              -{formatCurrency(s.total_ap)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {s.recent_ap.length} facturas pendientes
            </p>
          </CardContent>
        </Card>

        <Card className={`shadow-sm border-border/80 bg-card ${s.capital_neto < 0 ? "ring-1 ring-red-300" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`size-7 rounded-lg flex items-center justify-center ${s.capital_neto >= 0 ? "bg-indigo-500/10" : "bg-red-500/10"}`}>
                <Wallet className={`size-3.5 ${s.capital_neto >= 0 ? "text-indigo-600" : "text-red-600"}`} />
              </div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                Capital Neto
              </span>
            </div>
            <p className={`text-lg font-bold font-mono tabular-nums ${s.capital_neto >= 0 ? "text-foreground" : "text-red-600"}`}>
              {formatCurrency(s.capital_neto)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Disponible + CxC − CxP
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bank accounts edit / table */}
      <Card className="shadow-sm border-border/80 bg-card">
        <CardHeader className="px-4 py-3 flex flex-row items-center justify-between space-y-0 border-b border-border/60">
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="size-3.5 text-muted-foreground" />
              {isEditing ? "Editar Cuentas" : "Mis Cuentas"}
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {isEditing
                ? "Modifica los nombres y saldos. Presiona guardar para aplicar cambios."
                : "Saldos actuales configurados en el sistema."}
            </CardDescription>
          </div>
          {!isEditing && bankList.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-medium">Total:</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(s.total_balance)}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isEditing ? (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                {editedBanks.map((bank, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={bank.name}
                      onChange={(e) => handleUpdateBankField(index, "name", e.target.value)}
                      placeholder="Nombre de la cuenta (ej: Banco Popular)"
                      className="h-8 text-xs flex-1"
                    />
                    <div className="relative w-40">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={bank.balance || ""}
                        onChange={(e) => handleUpdateBankField(index, "balance", e.target.value)}
                        placeholder="Saldo disponible"
                        className="h-8 text-xs pl-5 font-mono tabular-nums text-right"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveBankRow(index)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button size="sm" variant="outline" onClick={handleAddBankRow} className="h-7 text-[11px] px-2">
                  <Plus className="size-3 mr-1" />
                  Agregar cuenta
                </Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-7 text-[11px]">
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateBanksMutation.isPending}
                    className="h-7 text-[11px] bg-primary hover:bg-primary-deep text-white"
                  >
                    <Save className="size-3 mr-1" />
                    {updateBanksMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {bankList.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {bankList.map((bank) => (
                    <div key={bank.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
                          <Building2 className="size-4 text-primary/70" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{bank.name}</p>
                          <p className="text-[10px] text-muted-foreground">Cuenta bancaria</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                          {formatCurrency(bank.balance)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.total_balance > 0
                            ? `${((bank.balance / s.total_balance) * 100).toFixed(1)}% del total`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 gap-2">
                  <PiggyBank className="size-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No hay cuentas registradas</p>
                  <Button size="sm" variant="outline" onClick={handleStartEdit} className="h-7 text-[11px] mt-1">
                    <Plus className="size-3 mr-1" />
                    Crear Cuenta
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent movements: AR and AP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm border-border/80 bg-card">
          <CardHeader className="px-4 py-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Receipt className="size-3.5 text-emerald-500" />
                Últimas Cuentas por Cobrar
              </CardTitle>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium text-muted-foreground">
                {s.total_ar > 0 ? formatCompact(s.total_ar) : "0"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {s.recent_ar.length > 0 ? (
              <div className="space-y-0.5">
                {s.recent_ar.map((inv) => (
                  <RecentInvoiceRow key={inv.id} inv={inv} type="income" formatCurrency={formatCurrency} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                No hay facturas de ingreso pendientes
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/80 bg-card">
          <CardHeader className="px-4 py-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Receipt className="size-3.5 text-red-500" />
                Últimas Cuentas por Pagar
              </CardTitle>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium text-muted-foreground">
                {s.total_ap > 0 ? formatCompact(s.total_ap) : "0"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {s.recent_ap.length > 0 ? (
              <div className="space-y-0.5">
                {s.recent_ap.map((inv) => (
                  <RecentInvoiceRow key={inv.id} inv={inv} type="expense" formatCurrency={formatCurrency} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                No hay facturas de gasto pendientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
