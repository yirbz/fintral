"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import { useUserSubscription } from "@/hooks/use-user-subscription";
import {
  getPaymentProofs,
  PaymentProof,
  getStatement,
  payStatement,
  uploadPaymentProof,
  getTransactions,
  TransactionItem,
} from "@/lib/api/plans";
import { EcfBalanceCard } from "@/features/billing/emit/ecf-balance-card";
import { TrialRemainingBadge } from "@/components/trial-remaining-badge";
import { WelcomeBanner } from "./components/welcome-banner";
import { StatementTabContent } from "./statement-page";
import { PaymentStatusBanner } from "./components/payment-status-banner";
import { SubscriptionCard } from "./components/subscription-card";
import { UsageMeters } from "./components/usage-meters";
import { TransactionInvoiceModal } from "./components/transaction-invoice-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Receipt,
  Calendar,
  ArrowRight,
  User,
  Building2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  CreditCard,
  X,
  ExternalLink,
  Printer,
  Download,
  Building,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  ai: "Bloques de Consultas IA",
  storage: "Almacenamiento Adicional",
  entity_slot: "Empresas Adicionales",
  user_slot: "Usuarios Adicionales",
  entity_slot_recurring: "Empresas Adicionales (Recurrente)",
  user_slot_recurring: "Usuarios Adicionales (Recurrente)",
};

const TABS = [
  { id: "plan", label: "Mi Plan", icon: User },
  { id: "payments", label: "Pagos", icon: Receipt },
  { id: "statement", label: "Estado de Cuenta", icon: FileText },
] as const;

function TransactionTable({
  title,
  icon: Icon,
  transactions,
  formatDate,
  formatAmount,
  onSelect,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  transactions: TransactionItem[];
  formatDate: (d: string | null) => string;
  formatAmount: (a: number, c: string) => string;
  onSelect: (t: TransactionItem) => void;
}) {
  const getStatusBadge = (status: string) => {
    const cleanStatus = status.toLowerCase();
    if (cleanStatus === "verified" || cleanStatus === "success" || cleanStatus === "succeeded") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          Completado
        </span>
      );
    }
    if (cleanStatus === "rejected" || cleanStatus === "failed") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
          Fallido
        </span>
      );
    }
    if (cleanStatus === "retrying") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
          Reintentando
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
        Pendiente
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-6 py-4 border-b border-brand-hairline dark:border-slate-800/60 bg-brand-canvas-soft/40 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-brand-ink-mute dark:text-slate-400" />
          <span className="text-sm font-semibold text-brand-ink dark:text-white">{title}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-brand-hairline dark:border-slate-800/60 bg-brand-canvas-soft dark:bg-slate-900/60 text-xs text-brand-ink-mute dark:text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-3.5 px-6">Fecha</th>
              <th className="py-3.5 px-6">Concepto / Método</th>
              <th className="py-3.5 px-6">Monto</th>
              <th className="py-3.5 px-6">Estado</th>
              <th className="py-3.5 px-6 text-right">Factura / Recibo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-hairline dark:divide-slate-800/40 text-sm">
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="hover:bg-brand-canvas-soft/40 dark:hover:bg-slate-800/20 transition-colors"
              >
                <td className="py-4 px-6 text-brand-ink-secondary dark:text-slate-350 whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className="py-4 px-6">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-brand-ink dark:text-slate-200">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-brand-ink-mute dark:text-slate-400">
                      {tx.type === "card" ? (
                        <>
                          <CreditCard className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Tarjeta de Crédito</span>
                        </>
                      ) : (
                        <>
                          <Building className="size-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Transferencia Bancaria</span>
                        </>
                      )}
                      {tx.reference && (
                        <span className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-mono">
                          Ref: {tx.reference}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 font-medium tabular-nums text-brand-ink dark:text-slate-250 whitespace-nowrap">
                  <div>{formatAmount(tx.amount, tx.currency)}</div>
                </td>
                <td className="py-4 px-6 whitespace-nowrap">
                  {getStatusBadge(tx.status)}
                </td>
                <td className="py-4 px-6 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep hover:bg-brand-primary/5 active:scale-95 transition-all rounded-lg"
                    onClick={() => onSelect(tx)}
                  >
                    <FileText className="size-3.5 mr-1" />
                    Ver Factura
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function AccountPage({ initialTab }: { initialTab: "plan" | "payments" | "statement" }) {
  const session = useSession();
  const orgId = session.data?.organization?.id || "";
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<"plan" | "payments" | "statement">(initialTab);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionItem | null>(null);

  // Sync tab state when URL changes (e.g. back button / external links)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "plan" || tabParam === "payments" || tabParam === "statement") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Statement payment form state
  const [showPayForm, setShowPayForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectTab = (tab: "plan" | "payments" | "statement") => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Queries
  const { usage, isLoading: isSubLoading } = useSubscription();
  const { subscription: userSub, plan: userPlan, isLoading: isUserSubLoading, isTrialing } = useUserSubscription();
  const { data: proofs, isLoading: isProofsLoading } = useQuery<PaymentProof[]>({
    queryKey: ["payment-proofs-my", orgId],
    queryFn: getPaymentProofs,
    enabled: !!orgId,
  });

  const { data: transactions, isLoading: isTransactionsLoading } = useQuery<TransactionItem[]>({
    queryKey: ["transactions-my", orgId],
    queryFn: () => getTransactions("user"),
    enabled: !!orgId,
  });

  const { data: statementData, isLoading: isStatementLoading, isError: isStatementError } = useQuery({
    queryKey: ["statement"],
    queryFn: () => getStatement(),
    enabled: true, // Fetch on mount to avoid visual skeleton flashes when switching tabs
  });

  async function handlePayStatement(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Debes adjuntar el comprobante de transferencia");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("plan_name", statementData?.plan_name || "Estado de cuenta");
      formData.append("amount", String((statementData?.total_cents ?? 0) / 100));
      formData.append("currency", "DOP");
      formData.append("notes", "Pago de estado de cuenta");
      formData.append("file", file);

      const proof = await uploadPaymentProof(formData);
      await payStatement(statementData!.cycle, proof.id);

      toast.success("Estado de cuenta pagado. Recibirás una notificación cuando sea verificado.");
      queryClient.invalidateQueries({ queryKey: ["statement"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
      setShowPayForm(false);
      setFile(null);
    } catch (err: any) {
      toast.error("Error al pagar estado de cuenta", { description: err.message });
    } finally {
      setUploading(false);
    }
  }

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-DO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Format currency helper
  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: currency || "DOP",
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  };

  // Get status color helper for payment proofs
  const getProofStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            Verificado
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
            Rechazado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            Pendiente
          </span>
        );
    }
  };

  const isLoadingPlan = isSubLoading || isUserSubLoading;
  const isTabLoading = 
    (activeTab === "plan" && isLoadingPlan) || 
    (activeTab === "payments" && isTransactionsLoading) || 
    (activeTab === "statement" && isStatementLoading);

  return (
    <div className="animate-in fade-in duration-300">
      {/* Sticky Header: full-width bar, content constrained */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b border-brand-hairline/80 dark:border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-5">
          <div className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight tracking-tight">
                Mi Cuenta
              </h1>
              <p className="text-sm text-brand-ink-mute dark:text-slate-400">
                Administra tu plan de suscripción, consumos y pagos realizados.
              </p>
            </div>

            {/* Switcher — fixed top-right, same position every screen */}
            <div className="shrink-0">
              <div className="bg-brand-canvas-soft/80 dark:bg-slate-900/60 rounded-xl p-1 border border-brand-hairline dark:border-slate-800/80 flex items-center gap-1 select-none relative shadow-xs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
                className={cn(
                  "relative py-1.5 px-4 rounded-lg text-xs font-semibold select-none flex items-center justify-center h-8 transition-colors duration-200 cursor-pointer outline-none active:scale-[0.97] transition-transform duration-100",
                  isActive
                    ? "text-brand-primary dark:text-sky-400 font-bold"
                    : "text-brand-ink-mute hover:text-brand-ink dark:text-slate-400 dark:hover:text-white"
                )}
              >
                {/* Hover indicator (spring-animated background pill) */}
                {hoveredTab === tab.id && (
                  <motion.div
                    layoutId="hover-pill"
                    className="absolute inset-0 bg-white/40 dark:bg-slate-800/40 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}

                {/* Active indicator (spring-animated background pill) */}
                {isActive && (
                  <motion.div
                    layoutId="active-tab-pill"
                    className="absolute inset-0 bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-brand-hairline/60 dark:border-slate-800/60 -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
        </div>
      </div>
      </div>
      </div>

      {/* Content — constrained width */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-8 space-y-8">
        <PaymentStatusBanner />
      <motion.div
        layout
        className="overflow-hidden min-h-[300px]"
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {/* PANEL: PLAN */}
            {activeTab === "plan" && (
              isLoadingPlan ? (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <Skeleton className="h-32 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
                  <Skeleton className="h-48 w-full rounded-2xl animate-pulse" />
                </div>
              ) : (
                <div className="space-y-6">
                  <WelcomeBanner planName={userPlan?.display_name} />
                  
                  {errorMsg && (
                    <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300 text-sm">
                      {errorMsg}
                    </div>
                  )}
                  
                  <TrialRemainingBadge variant="card" />

                  <SubscriptionCard />
                  
                  {userSub && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-brand-ink dark:text-white">
                          {isTrialing ? "Uso del período de prueba" : "Uso del período de cobro"}
                        </h3>
                        {isTrialing ? (
                          userSub.trial_ends_at && (
                            <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                              Finaliza el {formatDate(userSub.trial_ends_at)}
                            </span>
                          )
                        ) : (
                          userSub.billing_cycle_end && (
                            <span className="text-xs text-brand-ink-mute dark:text-slate-400">
                              Se reinicia el {formatDate(userSub.billing_cycle_end)}
                            </span>
                          )
                        )}
                      </div>
                      <UsageMeters usage={usage} />
                    </div>
                  )}

                  {/* ECF pre-purchased balance card */}
                  <EcfBalanceCard />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-brand-ink dark:text-white">
                        Últimos comprobantes de transferencia
                      </h3>
                      {proofs && proofs.length > 3 && (
                        <button
                          onClick={() => selectTab("payments")}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep transition-colors group cursor-pointer"
                        >
                          <span>Ver todo el historial</span>
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      )}
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                      {!proofs || proofs.slice(0, 3).length === 0 ? (
                        <div className="text-center py-10 px-4 space-y-3">
                          <div className="p-3 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-12 mx-auto flex items-center justify-center">
                            <Receipt className="size-6" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                              No hay comprobantes de pago
                            </h4>
                            <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-xs mx-auto">
                              Aún no has registrado comprobantes de transferencia bancaria para pagar tu suscripción.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-brand-hairline dark:border-slate-800/60 bg-brand-canvas-soft dark:bg-slate-900/60 text-xs text-brand-ink-mute dark:text-slate-400 font-semibold uppercase tracking-wider">
                                <th className="py-3 px-5">Fecha</th>
                                <th className="py-3 px-5">Concepto</th>
                                <th className="py-3 px-5">Monto</th>
                                <th className="py-3 px-5">Estado</th>
                                <th className="py-3 px-5 text-right">Detalle</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-hairline dark:divide-slate-800/40 text-sm">
                              {proofs.slice(0, 3).map((proof) => (
                                <tr
                                  key={proof.id}
                                  className="hover:bg-brand-canvas-soft/40 dark:hover:bg-slate-800/20 transition-colors"
                                >
                                  <td className="py-4 px-5 font-normal text-brand-ink-secondary dark:text-slate-350 whitespace-nowrap">
                                    {formatDate(proof.created_at)}
                                  </td>
                                  <td className="py-4 px-5 text-brand-ink dark:text-slate-200 font-medium">
                                    <div className="space-y-1">
                                      <p>Plan {proof.plan_name}</p>
                                      {proof.items && proof.items.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {proof.items.map((item, idx) => (
                                            <Badge
                                              key={idx}
                                              variant="secondary"
                                              className="text-[9px] px-1.5 py-0 bg-slate-100 hover:bg-slate-100 text-brand-ink-mute dark:bg-slate-800/60 dark:text-slate-350 font-normal border border-brand-hairline dark:border-slate-800 rounded-sm select-none"
                                            >
                                              {item.label || item.type}
                                              {item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : ""}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-4 px-5 font-medium tabular-nums text-brand-ink dark:text-slate-200">
                                    <div>{formatAmount(proof.amount, proof.currency)}</div>
                                    {proof.usd_amount && (
                                      <div className="text-[10px] text-brand-ink-mute dark:text-slate-400 font-normal">
                                        (${proof.usd_amount.toFixed(2)} USD @ {proof.exchange_rate?.toFixed(2)})
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-4 px-5">{getProofStatusBadge(proof.status)}</td>
                                  <td className="py-4 px-5 text-right whitespace-nowrap">
                                    <a
                                      href={proof.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep transition-colors"
                                    >
                                      Ver archivo
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* PANEL: PAYMENTS */}
            {activeTab === "payments" && (
              isTransactionsLoading ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-200">
                  {!transactions || transactions.length === 0 ? (
                    <div className="text-center py-16 px-4 space-y-4 bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl">
                      <div className="p-4 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-16 mx-auto flex items-center justify-center">
                        <Receipt className="size-8" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                          No tienes pagos registrados
                        </h4>
                        <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-xs mx-auto leading-normal">
                          Aquí aparecerá el historial de tus pagos con tarjeta y transferencias bancarias verificadas.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <TransactionTable
                        title={session.data?.user?.email || "Mi Cuenta"}
                        icon={User}
                        transactions={transactions}
                        formatDate={formatDate}
                        formatAmount={formatAmount}
                        onSelect={(tx) => setSelectedTransaction(tx)}
                      />
                    </>
                  )}
                </div>
              )
            )}

            {/* PANEL: STATEMENT */}
            {activeTab === "statement" && (
              <StatementTabContent />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>

      <TransactionInvoiceModal
        transaction={selectedTransaction}
        isOpen={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        formatDate={formatDate}
        formatAmount={formatAmount}
        organizationName={session.data?.organization?.name || ""}
        userEmail={session.data?.user?.email || ""}
      />
    </div>
  );
}
