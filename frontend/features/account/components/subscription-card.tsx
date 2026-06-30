import React, { useState } from "react";
import Link from "next/link";
import { CreditCard, ArrowRightLeft, ExternalLink, Calendar, HelpCircle } from "lucide-react";
import { toggleSubscriptionAutoRenew, cancelUserSubscription } from "@/lib/api/plans";
import { SubscriptionBadge } from "./subscription-badge";
import { PriceDisplay } from "@/components/ui/price-display";
import { Button } from "@/components/ui/button";
import { useUserSubscription } from "@/hooks/use-user-subscription";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SubscriptionCard() {
  const { subscription: userSub, plan: userPlan, isLoading, refetch: refetchUserSub } = useUserSubscription();
  const [isTogglingAutoRenew, setIsTogglingAutoRenew] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleToggleAutoRenew = async (checked: boolean) => {
    setIsTogglingAutoRenew(true);
    try {
      const res = await toggleSubscriptionAutoRenew(checked);
      toast.success(res.message || "Preferencia de renovación actualizada");
      refetchUserSub();
    } catch {
      toast.error("Error al actualizar renovación");
    } finally {
      setIsTogglingAutoRenew(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const res = await cancelUserSubscription();
      toast.success(res.message || "Suscripción cancelada correctamente");
      refetchUserSub();
    } catch {
      toast.error("Error al cancelar suscripción");
    } finally {
      setIsCanceling(false);
    }
  };

  if (!userSub || !userPlan) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
        <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 size-12 mx-auto flex items-center justify-center">
          <HelpCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-brand-ink dark:text-slate-200">
            Sin plan activo
          </h3>
          <p className="text-sm text-brand-ink-mute dark:text-slate-400 max-w-sm mx-auto">
            Aún no tienes un plan de suscripción activo.
          </p>
        </div>
        <Button asChild className="h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100">
          <Link href="/dashboard/tienda">
            <span>Ver planes disponibles</span>
            <ArrowRightLeft className="size-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    );
  }

  // Format date helper: "20 de junio, 2026"
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

  const nextBillingDate = userSub.billing_cycle_end;

  return (
    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:shadow-brand">
      <div className="p-6 sm:p-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-brand-primary dark:text-sky-400 uppercase tracking-widest">
              Plan Actual
            </span>
            <h3 className="text-2xl font-light text-brand-ink dark:text-white">
              {userPlan.display_name}
            </h3>
          </div>
          <div>
            <SubscriptionBadge status={userSub.status} size="md" />
          </div>
        </div>

        {/* Pricing & Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-brand-hairline dark:border-slate-800/60">
          <div>
            <span className="text-xs text-brand-ink-mute dark:text-slate-400 block mb-1">
              Precio del plan
            </span>
            <PriceDisplay
              amountDop={userPlan.price_monthly}
              period="mes"
              size="lg"
            />
          </div>

          <div className="space-y-4">
            {/* Cycle Details */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 shrink-0">
                <Calendar className="size-4" />
              </div>
              <div>
                <span className="text-xs text-brand-ink-mute dark:text-slate-400 block leading-none mb-1">
                  Próximo cobro
                </span>
                <span className="text-sm font-medium text-brand-ink-secondary dark:text-slate-200">
                  {formatDate(nextBillingDate)}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-canvas-soft dark:bg-slate-800 text-brand-ink-mute dark:text-slate-400 shrink-0">
                <CreditCard className="size-4" />
              </div>
              <div className="flex-1">
                <span className="text-xs text-brand-ink-mute dark:text-slate-400 block leading-none mb-1">
                  Método de pago
                </span>
                <span className="text-sm font-medium text-brand-ink-secondary dark:text-slate-200">
                  {userSub?.payment_method === "card"
                    ? `Tarjeta ${userSub.card_info?.brand || "Visa"} •••• ${userSub.card_info?.last4 || "4242"}`
                    : "Transferencia bancaria (Manual)"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recurring Billing Toggle */}
        {userSub && userSub.status !== "canceled" && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80">
            <div className="space-y-1 pr-4">
              <h4 className="text-sm font-medium text-brand-ink dark:text-slate-200">
                Renovación automática
              </h4>
              <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                Factura y debita tu tarjeta guardada automáticamente al final del período.
              </p>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="flex items-center">
                  <Switch
                    checked={userSub.auto_renew}
                    disabled={isTogglingAutoRenew}
                  />
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {userSub.auto_renew
                      ? "¿Desactivar cobro automático?"
                      : "¿Activar cobro automático?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {userSub.auto_renew
                      ? "Si desactivas el cobro automático, tu suscripción no se renovará automáticamente al final del ciclo."
                      : "Al activar esta opción se realizará el cobro automático al final de cada período usando tu método de pago guardado."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleToggleAutoRenew(!userSub.auto_renew)}
                    className={userSub.auto_renew ? "bg-red-600 hover:bg-red-700 text-white" : "bg-brand-primary text-white"}
                  >
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3.5 pt-4 border-t border-brand-hairline dark:border-slate-800/60">
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold hover:bg-brand-canvas-soft hover:text-brand-ink transition-all active:scale-[0.98] duration-100"
          >
            <Link href="/dashboard/tienda">
              <ArrowRightLeft className="size-4 mr-2" />
              <span>Cambiar plan</span>
            </Link>
          </Button>

          <Button
            asChild
            className="w-full sm:w-auto h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
          >
            <Link href="/dashboard/cuenta/estado">
              <span>Pagar estado de cuenta</span>
            </Link>
          </Button>

          {userSub && userSub.status !== "canceled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full sm:w-auto h-11 text-red-500 hover:text-red-750 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-semibold rounded-xl"
                  disabled={isCanceling}
                >
                  Cancelar suscripción
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-650 font-medium">
                    ¿Confirmas que deseas cancelar tu suscripción?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción cancelará tu suscripción inmediatamente. Perderás el acceso al Hub Contable y a tus herramientas asociadas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Atrás</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelSubscription}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Confirmar cancelación
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
