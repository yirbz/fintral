"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import {
  getPaymentProofs,
  PaymentProof,
  getStatement,
  payStatement,
  uploadPaymentProof,
} from "@/lib/api/plans";
import { WelcomeBanner } from "./components/welcome-banner";
import { SubscriptionCard } from "./components/subscription-card";
import { UsageMeters } from "./components/usage-meters";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Receipt,
  Calendar,
  ArrowRight,
  User,
  FileText,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  CreditCard,
  X,
  ExternalLink,
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
  const { plan, subscription, usage, isLoading: isSubLoading } = useSubscription();

  const { data: proofs, isLoading: isProofsLoading } = useQuery<PaymentProof[]>({
    queryKey: ["payment-proofs-my", orgId],
    queryFn: getPaymentProofs,
    enabled: !!orgId,
  });

  const { data: statementData, isLoading: isStatementLoading, isError: isStatementError } = useQuery({
    queryKey: ["statement"],
    queryFn: () => getStatement(),
    enabled: true, // Fetch on mount to avoid visual skeleton flashes when switching tabs
  });

  const handleManagePortal = async () => {
    if (!orgId) return;
    toast.error("Portal de gestión aún no disponible");
  };

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

  const isTabLoading = 
    (activeTab === "plan" && isSubLoading) || 
    (activeTab === "payments" && isProofsLoading) || 
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
              isSubLoading ? (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <Skeleton className="h-32 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
                  <Skeleton className="h-48 w-full rounded-2xl animate-pulse" />
                </div>
              ) : (
                <div className="space-y-6">
                  <WelcomeBanner planName={plan?.display_name} />
                  
                  {errorMsg && (
                    <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300 text-sm">
                      {errorMsg}
                    </div>
                  )}
                  
                  <SubscriptionCard
                    plan={plan}
                    subscription={subscription}
                    orgId={orgId}
                  />
                  
                  {subscription && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-brand-ink dark:text-white">
                          Uso del período de cobro
                        </h3>
                        {subscription.billing_cycle_end && (
                          <span className="text-xs text-brand-ink-mute dark:text-slate-400">
                            Se reinicia el {formatDate(subscription.billing_cycle_end)}
                          </span>
                        )}
                      </div>
                      <UsageMeters usage={usage} />
                    </div>
                  )}

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
                                    Plan {proof.plan_name}
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
              isProofsLoading ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs animate-in fade-in duration-200">
                  {!proofs || proofs.length === 0 ? (
                    <div className="text-center py-16 px-4 space-y-4">
                      <div className="p-4 rounded-full bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 size-16 mx-auto flex items-center justify-center">
                        <Receipt className="size-8" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-brand-ink dark:text-slate-200">
                          No tienes pagos registrados
                        </h4>
                        <p className="text-xs text-brand-ink-mute dark:text-slate-400 max-w-xs mx-auto leading-normal">
                          Aquí aparecerá el historial de tus transferencias y comprobantes de pago verificados.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-brand-hairline dark:border-slate-800/60 bg-brand-canvas-soft dark:bg-slate-900/60 text-xs text-brand-ink-mute dark:text-slate-400 font-semibold uppercase tracking-wider">
                            <th className="py-3.5 px-6">Fecha</th>
                            <th className="py-3.5 px-6">Detalle / Concepto</th>
                            <th className="py-3.5 px-6">Monto</th>
                            <th className="py-3.5 px-6">Estado</th>
                            <th className="py-3.5 px-6 text-right">Comprobante</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-hairline dark:divide-slate-800/40 text-sm">
                          {proofs.map((proof) => (
                            <tr
                              key={proof.id}
                              className="hover:bg-brand-canvas-soft/40 dark:hover:bg-slate-800/20 transition-colors"
                            >
                              <td className="py-4 px-6 text-brand-ink-secondary dark:text-slate-350 whitespace-nowrap">
                                {formatDate(proof.created_at)}
                              </td>
                              <td className="py-4 px-6">
                                <div className="space-y-0.5">
                                  <p className="font-semibold text-brand-ink dark:text-slate-200">
                                    Plan {proof.plan_name}
                                  </p>
                                  {proof.notes && (
                                    <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal max-w-sm truncate">
                                      {proof.notes}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-6 font-medium tabular-nums text-brand-ink dark:text-slate-250 whitespace-nowrap">
                                <div>{formatAmount(proof.amount, proof.currency)}</div>
                                {proof.usd_amount && (
                                  <div className="text-[10px] text-brand-ink-mute dark:text-slate-400 font-normal">
                                    (${proof.usd_amount.toFixed(2)} USD @ {proof.exchange_rate?.toFixed(2)})
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-6 whitespace-nowrap">
                                {getProofStatusBadge(proof.status)}
                              </td>
                              <td className="py-4 px-6 text-right whitespace-nowrap">
                                <a
                                  href={proof.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary-deep transition-colors"
                                >
                                  <span>Ver archivo</span>
                                  <ExternalLink className="size-3" />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            )}

            {/* PANEL: STATEMENT */}
            {activeTab === "statement" && (
              isStatementLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-200">
                  <div className="lg:col-span-7">
                    <Skeleton className="h-[400px] w-full rounded-2xl animate-pulse" />
                  </div>
                  <div className="lg:col-span-5">
                    <Skeleton className="h-[250px] w-full rounded-2xl animate-pulse" />
                  </div>
                </div>
              ) : statementData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
                  {/* Left Column: Charges list */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-brand-ink dark:text-white leading-none">
                            Cargos del período
                          </h3>
                          <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 mt-1">
                            {statementData.plan_name} · Ciclo {statementData.cycle}
                          </p>
                        </div>
                        <Badge
                          variant={statementData.charges.some((c) => !c.paid) ? "outline" : "secondary"}
                          className={cn(
                            "text-[10px] font-semibold",
                            statementData.charges.some((c) => !c.paid)
                              ? "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10"
                          )}
                        >
                          {statementData.charges.some((c) => !c.paid) ? "Pago Pendiente" : "Completamente Pagado"}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {statementData.charges.length === 0 ? (
                          <div className="text-center py-10 px-4 space-y-2">
                            <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
                            <p className="text-xs font-medium text-brand-ink dark:text-white">Sin cargos en este ciclo</p>
                            <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                              No se han registrado consumos adicionales en tu cuenta.
                            </p>
                          </div>
                        ) : (
                          statementData.charges.map((charge, idx) => (
                            <div
                              key={charge.id || `recurring-${idx}`}
                              className="flex items-center justify-between rounded-xl border border-brand-hairline dark:border-slate-850/60 p-4"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-xs font-semibold text-brand-ink dark:text-slate-200 truncate">
                                  {charge.label || LABELS[charge.charge_type] || charge.charge_type}
                                </p>
                                <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 font-medium">
                                  {charge.quantity} × RD$ {(charge.unit_price_cents / 100).toLocaleString("es-DO")}
                                  {charge.is_recurring && (
                                    <Badge
                                      variant="outline"
                                      className="ml-2 text-[9px] h-4.5 px-1.5 border-brand-primary/20 bg-brand-primary/5 text-brand-primary"
                                    >
                                      Recurrente
                                    </Badge>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-xs font-mono font-medium text-brand-ink dark:text-slate-250 tabular-nums">
                                  RD$ {(charge.total_price_cents / 100).toLocaleString("es-DO")}
                                </span>
                                {charge.paid ? (
                                  <CheckCircle2 className="size-4.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <div className="size-4.5 rounded-full border-2 border-amber-400 shrink-0" />
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <Separator className="bg-brand-hairline dark:bg-slate-800/60" />

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand-ink dark:text-white">Total</span>
                        <span className="text-lg font-mono font-bold text-brand-primary dark:text-sky-400 tabular-nums">
                          {formatAmount(statementData.total_cents / 100, "DOP")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Payment forms / information cards */}
                  <div className="lg:col-span-5 space-y-6">
                    {statementData.charges.some((c) => !c.paid) && statementData.total_cents > 0 ? (
                      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 space-y-5">
                        {!showPayForm ? (
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold text-brand-ink dark:text-white">¿Cómo pagar este saldo?</h4>
                              <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                                Realiza una transferencia bancaria y adjunta el comprobante para liquidar tu cuenta.
                              </p>
                            </div>
                            <Button
                              className="w-full h-11 py-3 px-7 min-w-[120px] text-sm font-semibold gap-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                              onClick={() => setShowPayForm(true)}
                            >
                              <CreditCard className="size-4" />
                              Registrar comprobante de pago
                            </Button>
                          </div>
                        ) : (
                          <form onSubmit={handlePayStatement} className="space-y-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-ink-secondary dark:text-slate-350">
                              Comprobante de pago
                            </h4>

                            <div
                              className={cn(
                                "relative rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                                file
                                  ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-800/40 dark:bg-emerald-950/10"
                                  : "border-brand-hairline hover:border-brand-primary/50 dark:border-slate-800 dark:hover:border-sky-400/50 bg-brand-canvas-soft/10"
                              )}
                            >
                              {file ? (
                                <div className="flex flex-col items-center gap-2">
                                  <CheckCircle2 className="size-6 text-emerald-500" />
                                  <p className="text-xs font-medium text-brand-ink dark:text-white truncate max-w-[200px]">
                                    {file.name}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] h-7 text-red-500 hover:text-red-650 hover:bg-red-500/10 rounded-lg mt-1"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setFile(null);
                                    }}
                                  >
                                    <X className="size-3.5 mr-1" />
                                    Quitar archivo
                                  </Button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center gap-2 cursor-pointer w-full h-full">
                                  <Upload className="size-6 text-brand-ink-mute dark:text-slate-400" />
                                  <p className="text-xs font-medium text-brand-ink dark:text-slate-200">
                                    Seleccionar comprobante
                                  </p>
                                  <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                                    PNG, JPG o PDF · Máx. 10MB
                                  </p>
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                  />
                                </label>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 py-3 px-7 min-w-[120px] text-sm font-semibold rounded-xl border-brand-hairline active:scale-[0.98] transition-all duration-100"
                                onClick={() => setShowPayForm(false)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                className="h-11 py-3 px-7 min-w-[120px] text-sm font-semibold gap-2 flex-1 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                                disabled={uploading || !file}
                              >
                                {uploading ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <CreditCard className="size-4" />
                                )}
                                {uploading ? "Procesando..." : `Enviar comprobante`}
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    ) : statementData.total_cents === 0 ? (
                      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-5 text-center space-y-3">
                        <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
                        <h4 className="text-xs font-semibold text-brand-ink dark:text-white leading-none">
                          Sin cargos pendientes
                        </h4>
                        <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                          No hay cargos adicionales pendientes de liquidación en este ciclo de facturación.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-5 flex gap-3.5 items-start">
                        <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Estado de cuenta pagado
                          </p>
                          <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                            Todos los consumos y cargos de este ciclo se encuentran al día. ¡Gracias por tu puntualidad!
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="bg-brand-canvas-soft/20 dark:bg-slate-950/20 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-5 flex gap-3 items-start">
                      <AlertCircle className="size-4 text-brand-primary shrink-0 mt-0.5" />
                      <div className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal space-y-1.5">
                        <p>
                          Los cargos por concepto de consultas IA, almacenamiento extra y Slots de Empresas/Usuarios adicionales se computan en tu saldo diferido y se consolidan en tu estado de cuenta mensual.
                        </p>
                        <p>
                          Recibirás una notificación por correo electrónico el primer día del mes para conciliar tu saldo pendiente.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-brand-ink-mute dark:text-slate-400">
                  No se pudo cargar el estado de cuenta.
                </div>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>
    </div>
  );
}
